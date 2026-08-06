// Imports a Shopify order-export CSV into the existing `orders` table.
// Like the product export, Shopify's order export has one row per line
// item, grouped by the order's "Name" (e.g. "#1001") -- this groups them
// back into one order row with an `items` array, same shape the live
// checkout path (app/api/checkout/place-order/route.ts) already writes.
//
// Historical orders are linked to a `customers` row by email where one
// exists (run migrate-4regn-customers.ts first) and are safely re-runnable
// -- each order's Shopify "Name" is kept as `external_id`, with a unique
// (seller_id, external_id) index backing an upsert, so importing the same
// export twice updates rather than duplicates.
//
// Usage:
//   npx tsx scripts/migrate-4regn-orders.ts --csv=orders.csv --seller=owner@4regn.com [--dry-run] [--limit=20]

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, writeInBatches, probeExistingColumns } from "./lib/migrate-shared";

// external_id/customer_id are load-bearing (the upsert conflict target and
// the customer link both depend on them), so a missing one is a hard
// error telling the operator what to run -- not something to silently
// degrade around like the cosmetic optional columns below.
const REQUIRED_COLUMNS = ["external_id", "customer_id", "imported_at"];
const OPTIONAL_COLUMNS = ["subtotal", "shipping_cost", "discount_code", "discount_amount", "shipping_option", "fulfillment_method", "notes"];

function mapPaymentStatus(financialStatus: string): string {
  const s = financialStatus.toLowerCase();
  if (s === "paid") return "paid";
  if (s === "partially_paid") return "partial";
  if (s === "refunded" || s === "partially_refunded") return "refunded";
  if (s === "voided") return "cancelled";
  if (s === "authorized") return "pending";
  return "awaiting_payment";
}

function mapStatus(fulfillmentStatus: string, cancelledAt: string): string {
  if (cancelledAt) return "cancelled";
  const s = fulfillmentStatus.toLowerCase();
  if (s === "fulfilled") return "fulfilled";
  if (s === "partial") return "processing";
  return "pending";
}

async function main() {
  const args = parseArgs("Usage: npx tsx scripts/migrate-4regn-orders.ts --csv=orders.csv --seller=owner@example.com [--dry-run] [--limit=20]");
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const { lines, header } = readCsv(args.csv);
  const col = makeCol(header);
  if (!header.includes("name")) {
    console.error(`This CSV doesn't have a "Name" column (Shopify's order number) -- can't group line items into orders. Found columns: ${header.join(", ")}`);
    process.exit(1);
  }

  const available = await probeExistingColumns(admin, "orders", [...REQUIRED_COLUMNS, ...OPTIONAL_COLUMNS]);
  const missingRequired = REQUIRED_COLUMNS.filter((c) => !available.has(c));
  if (missingRequired.length) {
    console.error(
      `The "orders" table is missing required column(s): ${missingRequired.join(", ")}. ` +
        `Run supabase/migrations/20260812_migration_import_support.sql in the Supabase SQL editor first.`
    );
    process.exit(1);
  }
  const missingOptional = OPTIONAL_COLUMNS.filter((c) => !available.has(c));
  if (missingOptional.length) {
    console.log(`Note: "orders" is missing optional column(s) ${missingOptional.join(", ")} -- importing without them rather than failing (matches how the live checkout route already handles this).`);
  }

  const orderMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const name = col(cols, "name");
    if (!name) continue;
    if (!orderMap.has(name)) orderMap.set(name, []);
    orderMap.get(name)!.push(cols);
  }

  // Best-effort link to previously-imported customers, matched by email --
  // run migrate-4regn-customers.ts first for this to have anything to match.
  const { data: existingCustomers } = await admin.from("customers").select("id, email").eq("seller_id", sellerId);
  const customerByEmail = new Map((existingCustomers || []).filter((c) => c.email).map((c) => [c.email!.toLowerCase(), c.id]));

  let errors = 0;
  let unmatchedCustomers = 0;
  const rows: any[] = [];

  for (const [name, lineRows] of orderMap) {
    if (args.limit && rows.length >= args.limit) break;
    const first = lineRows[0];

    const email = col(first, "email").toLowerCase() || null;
    const total = parseFloat(col(first, "total"));
    if (!Number.isFinite(total)) {
      errors++;
      continue;
    }

    const customerId = email ? customerByEmail.get(email) || null : null;
    if (email && !customerId) unmatchedCustomers++;

    const billingName = col(first, "billing name") || col(first, "shipping name") || email || "Unknown";
    const phone = col(first, "phone") || col(first, "shipping phone") || col(first, "billing phone") || null;
    const subtotal = parseFloat(col(first, "subtotal"));
    const shippingCost = parseFloat(col(first, "shipping"));
    const discountCode = col(first, "discount code") || null;
    const discountAmount = parseFloat(col(first, "discount amount"));
    const shippingOption = col(first, "shipping method") || null;
    const financialStatus = col(first, "financial status");
    const fulfillmentStatus = col(first, "fulfillment status");
    const cancelledAt = col(first, "cancelled at");
    const createdAt = col(first, "created at");
    const paymentMethod = col(first, "payment method") || "imported";
    const notes = col(first, "notes") || null;

    const items = lineRows
      .map((row) => {
        const itemName = col(row, "lineitem name");
        const price = parseFloat(col(row, "lineitem price"));
        const qty = parseInt(col(row, "lineitem quantity"), 10);
        const variant = col(row, "lineitem variant title") || undefined;
        if (!itemName || !Number.isFinite(price)) return null;
        return { id: null, name: itemName, price, qty: Number.isFinite(qty) ? qty : 1, variant, image: undefined };
      })
      .filter(Boolean);

    if (items.length === 0) {
      errors++;
      continue;
    }

    const optionalFields: Record<string, any> = {};
    if (available.has("subtotal")) optionalFields.subtotal = Number.isFinite(subtotal) ? subtotal : total;
    if (available.has("shipping_cost")) optionalFields.shipping_cost = Number.isFinite(shippingCost) ? shippingCost : 0;
    if (available.has("discount_code")) optionalFields.discount_code = discountCode;
    if (available.has("discount_amount")) optionalFields.discount_amount = Number.isFinite(discountAmount) ? discountAmount : 0;
    if (available.has("shipping_option")) optionalFields.shipping_option = shippingOption;
    if (available.has("fulfillment_method")) optionalFields.fulfillment_method = "delivery";
    if (available.has("notes")) optionalFields.notes = notes;

    rows.push({
      seller_id: sellerId,
      customer_id: customerId,
      customer_name: billingName,
      customer_email: email,
      customer_phone: phone,
      items,
      total,
      shipping_address: null,
      payment_method: paymentMethod,
      payment_status: mapPaymentStatus(financialStatus),
      status: mapStatus(fulfillmentStatus, cancelledAt),
      external_id: name,
      imported_at: new Date().toISOString(),
      // Preserve the real historical order date rather than defaulting to
      // now() -- explicitly provided values always override a column's
      // DEFAULT on insert.
      created_at: createdAt ? new Date(createdAt).toISOString() : new Date().toISOString(),
      ...optionalFields,
    });
  }

  if (rows.length === 0) {
    console.error(`No valid orders found in CSV (${errors} skipped for missing total/line items).`);
    process.exit(1);
  }

  console.log(`\nParsed ${rows.length} order(s) from ${orderMap.size} order group(s), ${errors} skipped for missing total/line items.`);
  console.log(`Customer link: ${rows.length - unmatchedCustomers} matched an imported customer by email, ${unmatchedCustomers} did not (run migrate-4regn-customers.ts first, or these orders will just have raw contact fields with no customer_id link).`);
  console.log("Status/payment_status are best-effort mappings from Shopify's Financial/Fulfillment Status -- spot-check a few imported orders in the dashboard before relying on them.");

  if (args.dryRun) {
    console.log("\n--dry-run: no orders were written.");
    return;
  }

  let written = 0;
  try {
    written = await writeInBatches(admin, "orders", rows, { onConflict: "seller_id,external_id" });
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }
  console.log(`\nDone. ${written} order(s) written to the database.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
