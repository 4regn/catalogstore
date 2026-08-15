// Backfills products.source_url for already-imported 4REGN products using
// the Shopify product export metafield:
// "Product Upload Source URL (product.metafields.custom.product_upload_source_url)".
//
// Join key: products.handle, which was populated from the Shopify Handle
// column during the original product migration.
//
// Usage:
//   npx tsx scripts/backfill-4regn-source-urls.ts --csv=products_export_1.csv --seller=owner@4regn.com [--dry-run]

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, fetchAllRows } from "./lib/migrate-shared";

type ProductRow = { id: string; name: string; handle: string | null; source_url: string | null };

async function main() {
  const args = parseArgs(
    "Usage: npx tsx scripts/backfill-4regn-source-urls.ts --csv=products_export_1.csv --seller=owner@example.com [--dry-run]"
  );
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const { lines, header } = readCsv(args.csv);
  const sourceUrlHeader = header.find((h) =>
    /\(product\.metafields\.[a-z0-9_]+\.product_upload_source_url\)/.test(h) ||
    h === "product upload source url"
  );

  if (!header.includes("handle") || !sourceUrlHeader) {
    console.error(
      "This CSV doesn't have the expected Shopify Handle/source URL columns. " +
        `Found columns: ${header.join(", ")}`
    );
    process.exit(1);
  }

  const col = makeCol(header);
  const sourceUrlByHandle = new Map<string, string>();

  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    const sourceUrl = col(cols, sourceUrlHeader).trim();
    if (!handle || !sourceUrl || sourceUrlByHandle.has(handle)) continue;
    sourceUrlByHandle.set(handle, sourceUrl);
  }

  console.log(`\nParsed ${sourceUrlByHandle.size} source URL(s) from Shopify CSV.`);

  const products = await fetchAllRows<ProductRow>(
    admin,
    "products",
    "id, name, handle, source_url",
    (q) => q.eq("seller_id", seller.id)
  );
  console.log(`${products.length} product(s) found for this seller.`);

  const toWrite = products
    .map((product) => ({ product, sourceUrl: product.handle ? sourceUrlByHandle.get(product.handle) : undefined }))
    .filter((row): row is { product: ProductRow; sourceUrl: string } => !!row.sourceUrl && row.product.source_url !== row.sourceUrl);

  const missingCsvSource = products.filter((p) => !p.handle || !sourceUrlByHandle.has(p.handle)).length;
  const alreadyCorrect = products.length - missingCsvSource - toWrite.length;

  console.log(`${toWrite.length} product(s) need a source_url update.`);
  console.log(`${alreadyCorrect} already have the matching source_url.`);
  console.log(`${missingCsvSource} product(s) have no source URL in the CSV or no matching handle.`);

  for (const row of toWrite.slice(0, 8)) {
    console.log(`  ${row.product.name} -> ${row.sourceUrl}`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: no products updated.");
    return;
  }

  let done = 0;
  for (const row of toWrite) {
    const { error } = await admin.from("products").update({ source_url: row.sourceUrl }).eq("id", row.product.id);
    if (error) {
      console.error(`Failed ${row.product.id}: ${error.message}`);
      continue;
    }
    done++;
  }

  console.log(`\nDone. Updated ${done}/${toWrite.length} product source URL(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
