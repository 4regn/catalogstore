// Backfills products.description for already-imported 4regn products whose
// original description was flattened by the old migrate-4regn.ts (which
// used stripHtml() -- collapses ALL tags and whitespace/newlines to single
// spaces). Real Shopify descriptions containing a <table> (size charts:
// rows like Size/Shoulder/Bust/Length with numeric columns per size) came
// through as an unreadable wall of run-on text, e.g. confirmed via a real
// screenshot: "...S 47.5 110 53 62.8 40.8 23.8 M 49 114 55 64 42 25 L 50.8
// 119 57 65.2 43.4 26.2..." all mashed into one paragraph, with no
// structure left to recover from the already-corrupted DB text.
//
// Re-reads the ORIGINAL Shopify product CSV export (same file
// migrate-4regn.ts itself reads) and re-derives each product's description
// via htmlToDescriptionMarkup() (see lib/migrate-shared.ts), which preserves
// table structure as readable "cell | cell | cell" lines instead of
// flattening it, and also preserves bold/italic/color formatting as a small
// marker grammar (see DescriptionText in FourRegnStore.tsx) instead of
// stripping it -- real Shopify descriptions use bold/colored text for sale
// callouts, and losing that made every product look flat/bland by
// comparison to the live site.
//
// Join key: products.handle, populated by the earlier
// backfill-4regn-handles.ts run -- no need to go through product_redirects
// this time, handles are already on the product rows directly.
//
// Usage:
//   npx tsx scripts/backfill-4regn-descriptions.ts --csv=products.csv --seller=owner@4regn.com [--dry-run] [--concurrency=4]

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, htmlToDescriptionMarkup, fetchAllRows, withTimeout } from "./lib/migrate-shared";

type ProductRow = { id: string; name: string; handle: string | null; description: string | null };

async function main() {
  const args = parseArgs(
    "Usage: npx tsx scripts/backfill-4regn-descriptions.ts --csv=products.csv --seller=owner@example.com [--dry-run] [--concurrency=4]"
  );
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const { lines, header } = readCsv(args.csv);
  const isShopify = header.includes("handle") && header.includes("variant price");
  if (!isShopify) {
    console.error(
      "This CSV doesn't look like a Shopify product export (expected 'Handle' and 'Variant Price' columns). " +
        `Found columns: ${header.join(", ")}`
    );
    process.exit(1);
  }
  const col = makeCol(header);

  // Same "first row per handle group carries Body (HTML)" grouping
  // migrate-4regn.ts itself relies on -- a product can have multiple CSV
  // rows (one per variant), but only the first row of each handle group has
  // the body/description populated in Shopify's export format.
  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  const bodyByHandle = new Map<string, string>();
  for (const [handle, variantRows] of handleMap) {
    const first = variantRows[0];
    const bodyHtml = col(first, "body (html)");
    if (bodyHtml) bodyByHandle.set(handle, bodyHtml);
  }
  console.log(`\nParsed ${handleMap.size} handle group(s) from CSV, ${bodyByHandle.size} with a Body (HTML) value.`);

  const products = await fetchAllRows<ProductRow>(admin, "products", "id, name, handle, description", (q) => q.eq("seller_id", sellerId));
  console.log(`${products.length} product(s) found for this seller.`);

  type Plan = { product: ProductRow; newDescription: string };
  const matched: Plan[] = [];
  let noHandle = 0;
  let noCsvMatch = 0;

  for (const p of products) {
    if (!p.handle) {
      noHandle++;
      continue;
    }
    const bodyHtml = bodyByHandle.get(p.handle);
    if (bodyHtml === undefined) {
      noCsvMatch++;
      continue;
    }
    const newDescription = htmlToDescriptionMarkup(bodyHtml);
    matched.push({ product: p, newDescription });
  }

  const toWrite = matched.filter((pl) => (pl.product.description || "") !== pl.newDescription);
  const alreadyCorrect = matched.length - toWrite.length;

  console.log(`\n${matched.length} product(s) matched a CSV row by handle (${noHandle} product(s) have no handle set, ${noCsvMatch} have a handle with no matching/empty CSV row).`);
  console.log(`${toWrite.length} product(s) would have their description changed; ${alreadyCorrect} already match the re-derived text (left untouched).`);

  console.log(`\nSample changes (first 5):`);
  for (const pl of toWrite.slice(0, 5)) {
    const oldPreview = (pl.product.description || "").slice(0, 100).replace(/\n/g, " ⏎ ");
    const newPreview = pl.newDescription.slice(0, 100).replace(/\n/g, " ⏎ ");
    console.log(`  "${pl.product.name}" (${pl.product.id})`);
    console.log(`    old: "${oldPreview}${(pl.product.description || "").length > 100 ? "..." : ""}"`);
    console.log(`    new: "${newPreview}${pl.newDescription.length > 100 ? "..." : ""}"`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: no products updated.");
    return;
  }

  if (toWrite.length === 0) {
    console.log("\nNothing to write.");
    return;
  }

  console.log(`\nWriting ${toWrite.length} product description(s)...`);
  let done = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < toWrite.length) {
      const idx = cursor++;
      const pl = toWrite[idx];
      try {
        const { error } = await withTimeout(
          admin.from("products").update({ description: pl.newDescription }).eq("id", pl.product.id),
          "product description update"
        );
        if (error) failed++;
      } catch {
        failed++;
      }
      done++;
      if (done % 25 === 0 || done === toWrite.length) process.stdout.write(`\r  products: ${done}/${toWrite.length} updated (${failed} failed)...`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, toWrite.length || 1) }, () => worker()));
  if (toWrite.length) process.stdout.write("\n");

  console.log(`\nDone. ${done - failed} product(s) updated (${failed} failed).`);
  if (failed) console.log("Safe to re-run this script -- it recomputes and re-compares descriptions fresh each time from current data, already-fixed rows are skipped rather than re-written.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
