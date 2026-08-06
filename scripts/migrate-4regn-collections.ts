// Imports real Shopify collection membership from a Matrixify export --
// standard Shopify product CSV exports have no way to express which
// collections a product belongs to (that's a separate object in Shopify's
// data model), so this platform's `products.category` field only ever got
// populated with the product's Type ("Hoodie", "T-Shirt", ...) during the
// main product migration, not real collections. Confirmed live: the
// storefront's collection-grouped homepage had nothing real to group by.
//
// Matrixify (a Shopify app) can export both Custom Collections (manually
// curated) and Smart Collections (rule-based, but exported with the
// currently-resolved member list, not just the rule) -- both in the same
// practical shape: one row per (collection x member product), with
// "Title" as the collection name and "Product: Handle" as the member
// product's real Shopify handle.
//
// Products aren't stored with their Shopify handle as a column on this
// platform, so the join back to a real product uses product_redirects
// instead (old_path = "/products/{handle}" -> product_id), which was
// built directly from the same handles during the original product
// import regardless of which source_url variant that product ended up
// with -- a more reliable join key than source_url here.
//
// Usage:
//   npx tsx scripts/migrate-4regn-collections.ts --seller=owner@4regn.com [--custom-csv=custom.csv] [--smart-csv=smart.csv] [--dry-run] [--concurrency=4]

import { getAdminClient, resolveSeller, readCsv, parseCsvLine, makeCol, fetchAllRows, withTimeout } from "./lib/migrate-shared";

function parseCollectionsArgs() {
  const out: { seller?: string; customCsv?: string; smartCsv?: string; dryRun: boolean; concurrency: number } = { dryRun: false, concurrency: 4 };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--custom-csv=")) out.customCsv = arg.slice("--custom-csv=".length);
    else if (arg.startsWith("--smart-csv=")) out.smartCsv = arg.slice("--smart-csv=".length);
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10);
  }
  if (!out.seller || (!out.customCsv && !out.smartCsv)) {
    console.error("Usage: npx tsx scripts/migrate-4regn-collections.ts --seller=owner@example.com [--custom-csv=custom.csv] [--smart-csv=smart.csv] [--dry-run] [--concurrency=4]\nAt least one of --custom-csv / --smart-csv is required.");
    process.exit(1);
  }
  return out as { seller: string; customCsv?: string; smartCsv?: string; dryRun: boolean; concurrency: number };
}

function collectFromCsv(csvPath: string, label: string, productCollections: Map<string, Set<string>>, allTitles: Set<string>) {
  const { lines, header } = readCsv(csvPath);
  const col = makeCol(header);
  if (!header.includes("title") || !header.includes("product: handle")) {
    console.error(`${label}: doesn't look like a Matrixify collections export (expected "Title" and "Product: Handle" columns). Found: ${header.join(", ")}`);
    process.exit(1);
  }
  let rows = 0;
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const title = col(cols, "title").trim();
    const handle = col(cols, "product: handle").trim();
    if (!title || !handle) continue;
    if (!productCollections.has(handle)) productCollections.set(handle, new Set());
    productCollections.get(handle)!.add(title);
    allTitles.add(title);
    rows++;
  }
  console.log(`${label}: ${rows} membership row(s) read.`);
}

async function main() {
  const args = parseCollectionsArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const productCollections = new Map<string, Set<string>>();
  const allTitles = new Set<string>();
  if (args.customCsv) collectFromCsv(args.customCsv, "Custom Collections", productCollections, allTitles);
  if (args.smartCsv) collectFromCsv(args.smartCsv, "Smart Collections", productCollections, allTitles);

  if (productCollections.size === 0) {
    console.error("No collection membership rows found in the given CSV(s).");
    process.exit(1);
  }
  console.log(`\n${allTitles.size} distinct collection(s) across ${productCollections.size} product handle(s):`);
  for (const t of Array.from(allTitles).sort()) console.log(`  - ${t}`);

  // Handle -> product_id, via product_redirects (built from the same
  // handles during the original product import -- reliable regardless of
  // which source_url variant a product ended up with).
  const redirects = await fetchAllRows<{ old_path: string; product_id: string | null }>(
    admin, "product_redirects", "old_path, product_id", (q) => q.eq("seller_id", sellerId)
  );
  const productIdByHandle = new Map<string, string>();
  for (const r of redirects) {
    if (!r.product_id) continue;
    const handle = r.old_path.replace(/^\/products\//, "");
    productIdByHandle.set(handle, r.product_id);
  }
  console.log(`\nFound ${productIdByHandle.size} product(s) with a known handle (via product_redirects).`);

  const products = await fetchAllRows<{ id: string; category: string | null }>(
    admin, "products", "id, category", (q) => q.eq("seller_id", sellerId)
  );
  const categoryById = new Map(products.map((p) => [p.id, p.category]));

  const updates: { id: string; category: string }[] = [];
  let notFound = 0;
  for (const [handle, titles] of productCollections) {
    const productId = productIdByHandle.get(handle);
    if (!productId) { notFound++; continue; }
    const existing = (categoryById.get(productId) || "").split(",").map((c) => c.trim()).filter(Boolean);
    const merged = Array.from(new Set([...existing, ...titles]));
    updates.push({ id: productId, category: merged.join(", ") });
  }
  console.log(`\n${updates.length} product(s) matched to a real product row and will be updated (${notFound} handle(s) not found -- likely products outside this partial export's limited collection set, not an error).`);

  const newCollections = Array.from(allTitles).sort();
  const existingCollections: string[] = seller.collections || [];
  const mergedCollections = Array.from(new Set([...existingCollections, ...newCollections]));
  console.log(`\nseller.collections would go from ${existingCollections.length} to ${mergedCollections.length} entries.`);

  if (args.dryRun) {
    console.log("\n--dry-run: no products updated, seller.collections not changed.");
    return;
  }

  console.log(`\nUpdating ${updates.length} product(s)...`);
  let done = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < updates.length) {
      const idx = cursor++;
      const u = updates[idx];
      try {
        const { error } = await withTimeout(admin.from("products").update({ category: u.category }).eq("id", u.id), "product category update");
        if (error) failed++;
      } catch {
        failed++;
      }
      done++;
      if (done % 25 === 0 || done === updates.length) process.stdout.write(`\r  products: ${done}/${updates.length} updated (${failed} failed)...`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, updates.length) }, () => worker()));
  if (updates.length) process.stdout.write("\n");

  const { error: sellerErr } = await admin.from("sellers").update({ collections: mergedCollections }).eq("id", sellerId);
  if (sellerErr) {
    console.error(`Failed to update seller.collections: ${sellerErr.message}`);
    process.exit(1);
  }

  console.log(`\nDone. ${done - failed} product(s) updated, ${failed} failed. seller.collections now has ${mergedCollections.length} entries.`);
  if (failed) console.log("Safe to re-run this script -- it recomputes and re-applies merged categories each time, it won't duplicate anything.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
