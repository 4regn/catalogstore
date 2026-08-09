// Diagnostic only -- writes nothing, prints a compact summary (not a
// per-row dump, to keep this cheap to read/paste). backfill-4regn-
// variant-images.ts found 0 products where any option value maps to a
// distinct image across 1591 products with variants, which is too
// uniform to be a real edge case. This buckets every multi-variant
// product into why it can't produce a variant-image mapping, so we can
// tell apart: no photo variation ever existed in Shopify to begin with,
// vs. the image genuinely varies but doesn't cleanly line up with one
// option dimension (would explain a real bug in computeVariantImageMaps,
// since this classification is a fresh, independent re-implementation of
// that same check).
//
// Usage:
//   npx tsx scripts/diagnose-4regn-variant-images.ts --csv=products_export_1.csv > diag.txt

import { readCsv, parseCsvLine, makeCol } from "./lib/migrate-shared";

function parseArgs() {
  const out: { csv?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--csv=")) out.csv = arg.slice("--csv=".length);
  }
  if (!out.csv) {
    console.error("Usage: npx tsx scripts/diagnose-4regn-variant-images.ts --csv=products_export_1.csv");
    process.exit(1);
  }
  return out as { csv: string };
}

type Bucket = "single-row" | "all-blank" | "same-image" | "clean-match" | "inconsistent";

function classify(rows: string[][], col: (r: string[], name: string) => string): Bucket {
  const opt1Name = col(rows[0], "option1 name");
  const opt2Name = col(rows[0], "option2 name");
  const opt3Name = col(rows[0], "option3 name");
  // Only rows that actually represent a real variant (option1 value
  // populated) -- a blank-option row is an extra gallery photo, not a
  // variant-specific image, and would otherwise masquerade as "the image
  // for no option value" and pollute the check.
  const variantRows = rows.filter((r) => col(r, "option1 value"));
  if (variantRows.length <= 1) return "single-row";

  const images = variantRows.map((r) => col(r, "image src"));
  const distinctImages = new Set(images.filter(Boolean));
  if (distinctImages.size === 0) return "all-blank";
  if (distinctImages.size === 1) return "same-image";

  // Genuine variation exists -- does it cleanly line up with ONE option
  // dimension (every row sharing a value for that dimension shares the
  // same image, no value maps to two different images)?
  for (const name of [opt1Name, opt2Name, opt3Name].filter(Boolean)) {
    const valueToImage: Record<string, string> = {};
    let consistent = true;
    for (const r of variantRows) {
      const value =
        col(r, "option1 name") === name ? col(r, "option1 value") :
        col(r, "option2 name") === name ? col(r, "option2 value") :
        col(r, "option3 name") === name ? col(r, "option3 value") : "";
      const img = col(r, "image src");
      if (!value || !img) continue;
      if (valueToImage[value] && valueToImage[value] !== img) { consistent = false; break; }
      valueToImage[value] = img;
    }
    if (consistent && new Set(Object.values(valueToImage)).size > 1) return "clean-match";
  }
  return "inconsistent";
}

function main() {
  const args = parseArgs();
  const { lines, header } = readCsv(args.csv);
  const col = makeCol(header);

  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  const buckets: Record<Bucket, { count: number; examples: string[] }> = {
    "single-row": { count: 0, examples: [] },
    "all-blank": { count: 0, examples: [] },
    "same-image": { count: 0, examples: [] },
    "clean-match": { count: 0, examples: [] },
    "inconsistent": { count: 0, examples: [] },
  };
  let multiVariantTotal = 0;

  for (const [handle, rows] of handleMap) {
    const first = rows[0];
    const opt1Name = col(first, "option1 name");
    const isRealVariantProduct = opt1Name && opt1Name.toLowerCase() !== "title" && rows.length > 1;
    if (!isRealVariantProduct) continue;
    multiVariantTotal++;

    const bucket = classify(rows, col);
    buckets[bucket].count++;
    if (buckets[bucket].examples.length < 4) buckets[bucket].examples.push(`${col(first, "title")} (${handle})`);
  }

  console.log(`Multi-variant products checked: ${multiVariantTotal}\n`);
  console.log(`single-row      (only 1 real variant row, nothing to compare):        ${buckets["single-row"].count}`);
  console.log(`all-blank       (every variant row has a blank Image Src):            ${buckets["all-blank"].count}`);
  console.log(`same-image      (all variants share the exact same one photo):        ${buckets["same-image"].count}`);
  console.log(`clean-match     (image genuinely varies, maps cleanly to one option): ${buckets["clean-match"].count}`);
  console.log(`inconsistent    (image varies, doesn't cleanly map to any option):    ${buckets["inconsistent"].count}\n`);

  for (const key of ["all-blank", "same-image", "clean-match", "inconsistent"] as Bucket[]) {
    if (buckets[key].examples.length) console.log(`${key} examples: ${buckets[key].examples.join(" | ")}`);
  }
}

main();
