// Retrofits variant-specific images onto products that were already
// imported before migrate-4regn.ts started capturing them (see
// computeVariantImageMaps in scripts/lib/migrate-shared.ts for how the
// mapping is derived from Shopify's per-variant-row "Image Src" column).
// Selecting a color swatch on the storefront now needs each product's
// `variants[].images` populated -- this backfills that onto whatever's
// already in the DB, matched by handle, without re-importing anything
// else about the product (price, description, tags, etc. are untouched).
//
// Needs the ORIGINAL Shopify CSV export re-supplied -- it isn't stored in
// this repo (see migrate-4regn.ts's own usage comment: --csv is always a
// fresh runtime argument, never committed).
//
// Writes by default, same as migrate-4regn.ts -- pass --dry-run to preview
// what would change without writing anything.
//
// Usage:
//   npx tsx scripts/backfill-4regn-variant-images.ts --csv=products.csv --seller=owner@4regn.com [--dry-run]

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, computeVariantImageMaps, fetchAllRows } from "./lib/migrate-shared";

const USAGE = "Usage: npx tsx scripts/backfill-4regn-variant-images.ts --csv=products.csv --seller=owner@4regn.com [--dry-run]";

type ExistingProduct = { id: string; handle: string | null; name: string; variants: { name: string; options: string[]; priceDelta?: Record<string, number>; images?: Record<string, string[]> }[] | null };

async function main() {
  const args = parseArgs(USAGE);
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const { lines, header } = readCsv(args.csv);
  if (!header.includes("handle") || !header.includes("variant price")) {
    console.error(
      "This CSV doesn't look like a Shopify product export (expected 'Handle' and 'Variant Price' columns). " +
        `Found columns: ${header.join(", ")}`
    );
    process.exit(1);
  }
  const col = makeCol(header);

  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  const existing = await fetchAllRows<ExistingProduct>(admin, "products", "id, handle, name, variants", (q) => q.eq("seller_id", sellerId));
  const existingByHandle = new Map(existing.filter((p) => p.handle).map((p) => [p.handle as string, p]));

  let matched = 0;
  let withNewImages = 0;
  let skippedNoVariants = 0;
  let skippedNoHandleMatch = 0;
  const updates: { id: string; name: string; variants: ExistingProduct["variants"] }[] = [];

  for (const [handle, variantRows] of handleMap) {
    const product = existingByHandle.get(handle);
    if (!product) { skippedNoHandleMatch++; continue; }
    matched++;

    if (!product.variants || !product.variants.length) { skippedNoVariants++; continue; }

    const first = variantRows[0];
    // Must come from the first row -- Shopify's export only populates
    // "OptionN Name" there, see computeVariantImageMaps' own comment.
    const opt1Name = col(first, "option1 name");
    const opt2Name = col(first, "option2 name");
    const opt3Name = col(first, "option3 name");
    const imagesByDimension = computeVariantImageMaps(variantRows, col, opt1Name, opt2Name, opt3Name);
    if (!Object.keys(imagesByDimension).length) continue;

    let changed = false;
    const newVariants = product.variants.map((v) => {
      const images = imagesByDimension[v.name];
      if (!images) return v;
      // Full replace, not merge -- images is deterministically recomputed
      // from the same CSV every run, so there's nothing stale in the old
      // value worth preserving (unlike a merge, which would leave behind
      // single-string entries from before this became an array-per-value
      // shape on a re-run).
      if (JSON.stringify(images) === JSON.stringify(v.images || {})) return v;
      changed = true;
      return { ...v, images };
    });
    if (changed) {
      withNewImages++;
      updates.push({ id: product.id, name: product.name, variants: newVariants });
    }
  }

  console.log(`CSV handles: ${handleMap.size}, matched to existing products: ${matched}, no handle match: ${skippedNoHandleMatch}, no variants on the DB row: ${skippedNoVariants}`);
  console.log(`Products that would gain/update variant images: ${withNewImages}\n`);
  for (const u of updates.slice(0, 20)) console.log(`  ${u.name}`);
  if (updates.length > 20) console.log(`  ...and ${updates.length - 20} more`);

  if (args.dryRun) {
    console.log("\nDry run -- re-run without --dry-run to write these changes.");
    return;
  }

  console.log("\nWriting...");
  let written = 0;
  for (const u of updates) {
    const { error } = await admin.from("products").update({ variants: u.variants }).eq("id", u.id);
    if (error) { console.error(`Failed to update "${u.name}" (${u.id}):`, error.message); continue; }
    written++;
  }
  console.log(`Done -- updated ${written}/${updates.length} products.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
