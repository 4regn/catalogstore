// Imports a Shopify customer-export CSV into the new `customers` table
// (see 20260812_migration_import_support.sql) -- a CRM-style contact
// record (name, email, phone, marketing consent), deliberately NOT a
// login/account system. This is what backs an email/SMS marketing list;
// it has nothing to do with storefront customer accounts, which is a
// separate, larger, not-yet-built feature.
//
// Usage:
//   npx tsx scripts/migrate-4regn-customers.ts --csv=customers.csv --seller=owner@4regn.com [--dry-run] [--limit=20]

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, parseYesNo, writeInBatches } from "./lib/migrate-shared";

async function main() {
  const args = parseArgs("Usage: npx tsx scripts/migrate-4regn-customers.ts --csv=customers.csv --seller=owner@example.com [--dry-run] [--limit=20]");
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const { lines, header } = readCsv(args.csv);
  const col = makeCol(header);

  // Shopify's customer export column names have drifted slightly across
  // versions -- try a few likely variants for the fields that matter most
  // rather than hard-failing on one exact name.
  const firstCol = (row: string[], names: string[]) => {
    for (const n of names) {
      const v = col(row, n);
      if (v) return v;
    }
    return "";
  };

  const requiredAny = ["email", "phone"];
  const hasIdentityColumn = requiredAny.some((n) => header.includes(n));
  if (!hasIdentityColumn) {
    console.error(`This CSV doesn't have an "Email" or "Phone" column -- can't identify customers. Found columns: ${header.join(", ")}`);
    process.exit(1);
  }

  let skipped = 0;
  const rows: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    if (args.limit && rows.length >= args.limit) break;
    const cols = parseCsvLine(lines[i]);

    const email = firstCol(cols, ["email"]).toLowerCase() || null;
    const phone = firstCol(cols, ["phone", "default address phone"]) || null;
    if (!email && !phone) {
      skipped++;
      continue;
    }

    const firstName = firstCol(cols, ["first name"]) || null;
    const lastName = firstCol(cols, ["last name"]) || null;
    const acceptsEmail = parseYesNo(firstCol(cols, ["accepts email marketing", "accepts marketing"]));
    const acceptsSms = parseYesNo(firstCol(cols, ["accepts sms marketing"]));
    const tagsRaw = firstCol(cols, ["tags"]);
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];
    const note = firstCol(cols, ["note"]) || null;
    const totalSpentRaw = firstCol(cols, ["total spent"]);
    const totalSpent = totalSpentRaw && Number.isFinite(parseFloat(totalSpentRaw)) ? parseFloat(totalSpentRaw) : null;
    const totalOrdersRaw = firstCol(cols, ["total orders", "orders count"]);
    const totalOrders = totalOrdersRaw && Number.isFinite(parseInt(totalOrdersRaw, 10)) ? parseInt(totalOrdersRaw, 10) : null;
    const externalId = firstCol(cols, ["customer id", "id"]) || null;

    rows.push({
      seller_id: sellerId,
      external_id: externalId,
      first_name: firstName,
      last_name: lastName,
      email,
      phone,
      accepts_email_marketing: acceptsEmail,
      accepts_sms_marketing: acceptsSms,
      marketing_consent_updated_at: acceptsEmail || acceptsSms ? new Date().toISOString() : null,
      tags,
      note,
      total_spent: totalSpent,
      total_orders: totalOrders,
      source: "import",
    });
  }

  if (rows.length === 0) {
    console.error(`No valid customers found in CSV (${skipped} row(s) skipped for missing email and phone).`);
    process.exit(1);
  }

  const emailCount = rows.filter((r) => r.accepts_email_marketing).length;
  const smsCount = rows.filter((r) => r.accepts_sms_marketing).length;
  console.log(`\nParsed ${rows.length} customer(s), ${skipped} skipped for missing email and phone.`);
  console.log(`Marketing consent: ${emailCount} opted into email, ${smsCount} opted into SMS.`);
  console.log("Note: consent is imported as recorded in the export -- confirm with 4regn that this reflects real opt-in consent under POPIA before sending any campaigns off this list, not just whatever Shopify happened to have on file.");

  if (args.dryRun) {
    console.log("\n--dry-run: no customers were written.");
    return;
  }

  // Upsert on (seller_id, email) where there's an email, otherwise on
  // (seller_id, external_id) -- Shopify's own Customer ID is present even
  // on phone-only rows, so that's a reliable dedupe key too (see
  // 20260813_customers_external_id_unique.sql). Only a row with neither
  // ever falls back to a plain insert with no dedupe key, since that's
  // genuinely all that's left to key off of.
  const withEmail = rows.filter((r) => r.email);
  const withExternalId = rows.filter((r) => !r.email && r.external_id);
  const withNeither = rows.filter((r) => !r.email && !r.external_id);

  let written = 0;
  try {
    if (withEmail.length) written += await writeInBatches(admin, "customers", withEmail, { onConflict: "seller_id,email" });
    if (withExternalId.length) written += await writeInBatches(admin, "customers", withExternalId, { onConflict: "seller_id,external_id" });
    if (withNeither.length) written += await writeInBatches(admin, "customers", withNeither);
  } catch (e) {
    console.error(`\n${e instanceof Error ? e.message : String(e)}`);
    process.exit(1);
  }

  console.log(`\nDone. ${written} customer(s) written to the database.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
