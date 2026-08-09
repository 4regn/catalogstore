// Diagnostic only -- writes nothing. backfill-4regn-variant-images.ts
// found 0 products where any option value maps to a distinct image
// across 1591 products with variants, which is too uniform to be a real
// edge case -- this prints the raw per-row Option/Image Src data for a
// sample of real multi-variant products so we can see WHY: either Image
// Src is blank on most variant rows (Shopify's export commonly only sets
// it on the row that introduces a new image), or it's just genuinely the
// same single photo across every variant of a product (no per-variant
// image was ever configured in Shopify to begin with).
//
// Usage:
//   npx tsx scripts/diagnose-4regn-variant-images.ts --csv=products_export_1.csv [--sample=15]

import { readCsv, parseCsvLine, makeCol } from "./lib/migrate-shared";

function parseArgs() {
  const out: { csv?: string; sample: number } = { sample: 15 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--csv=")) out.csv = arg.slice("--csv=".length);
    else if (arg.startsWith("--sample=")) out.sample = parseInt(arg.slice("--sample=".length), 10) || 15;
  }
  if (!out.csv) {
    console.error("Usage: npx tsx scripts/diagnose-4regn-variant-images.ts --csv=products_export_1.csv [--sample=15]");
    process.exit(1);
  }
  return out as { csv: string; sample: number };
}

function main() {
  const args = parseArgs();
  const { lines, header } = readCsv(args.csv);
  const col = makeCol(header);
  console.log(`Header columns: ${header.join(" | ")}\n`);

  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  let shown = 0;
  let totalMultiVariant = 0;
  let totalWithAnyImageSrc = 0;
  let totalWithBlankImageSrc = 0;
  let totalRows = 0;

  for (const [handle, rows] of handleMap) {
    const first = rows[0];
    const opt1Name = col(first, "option1 name");
    const isRealVariantProduct = opt1Name && opt1Name.toLowerCase() !== "title" && rows.length > 1;
    if (!isRealVariantProduct) continue;
    totalMultiVariant++;

    for (const r of rows) {
      totalRows++;
      const img = col(r, "image src");
      if (img) totalWithAnyImageSrc++; else totalWithBlankImageSrc++;
    }

    if (shown < args.sample) {
      shown++;
      console.log(`--- ${col(first, "title")} (${handle}) ---`);
      for (const r of rows) {
        const o1n = col(r, "option1 name"), o1v = col(r, "option1 value");
        const o2n = col(r, "option2 name"), o2v = col(r, "option2 value");
        const img = col(r, "image src");
        console.log(`  ${o1n}=${o1v || "(blank)"}${o2n ? ` ${o2n}=${o2v || "(blank)"}` : ""}  |  Image Src: ${img || "(BLANK)"}`);
      }
      console.log();
    }
  }

  console.log(`\nSummary across ${totalMultiVariant} multi-variant products (${totalRows} variant rows):`);
  console.log(`  Rows with a non-blank Image Src: ${totalWithAnyImageSrc}`);
  console.log(`  Rows with a BLANK Image Src: ${totalWithBlankImageSrc}`);
}

main();
