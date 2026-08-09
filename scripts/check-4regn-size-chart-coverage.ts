// Diagnoses (read-only) which published products get NO size chart at all
// on their PDP. Reported directly: a specific product (a women's pants
// listing) has a size chart on the real 4regn.com but not on this
// platform. getSizeChartType() in FourRegnStore.tsx picks a chart by (1)
// a name-keyword match (oversized tees only) then (2) an exact tag match
// (womenjackets/menjackets/ukmensizelabel/menxsmallto3xlpants/
// womenxsmalltoxlpants) -- no match at either step means no chart, no
// fallback. The reported product is plainly women's pants by its own
// title, so this is almost certainly a tag gap (that exact tag missing or
// spelled differently in the Shopify export), not a one-off.
//
// This script re-runs the SAME matching logic (kept in exact sync with
// FourRegnStore.tsx's own copy -- see the comment above getSizeChartType
// there if this ever needs updating) against every published product, then
// groups the ones with NO chart by category, so the real shape of the gap
// is visible (e.g. "200 uncharted products, 180 of them category=Pants" --
// a category-level pattern worth a code fix -- vs. scattered one-offs that
// aren't).
//
// Usage:
//   npx tsx scripts/check-4regn-size-chart-coverage.ts --seller=owner@4regn.com

import { getAdminClient, resolveSeller, fetchAllRows } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/check-4regn-size-chart-coverage.ts --seller=owner@example.com");
    process.exit(1);
  }
  return out as { seller: string };
}

// Exact copy of FourRegnStore.tsx's own matching logic -- see that file's
// getSizeChartType()/OVERSIZED_TEE_NAME_MATCHES/TAG_SIZE_CHART_MAP.
const OVERSIZED_TEE_NAME_MATCHES = [
  "oversized tee", "premium oversized", "4regn", "butterfly effect", "oversized t-shirt", "oversized tshirt",
];
const TAG_SIZE_CHART_MAP: Record<string, string> = {
  womenjackets: "womenjackets",
  menjackets: "menjackets",
  ukmensizelabel: "ukmensizelabel",
  menxsmallto3xlpants: "menxsmallto3xlpants",
  womenxsmalltoxlpants: "womenxsmalltoxlpants",
  "oversized-tee": "oversized_tee",
};
function getSizeChartType(product: { name: string; tags?: string[] | null }): string | null {
  const name = (product.name || "").toLowerCase();
  if (OVERSIZED_TEE_NAME_MATCHES.some((m) => name.includes(m))) return "oversized_tee";
  for (const tag of product.tags || []) {
    const key = (tag || "").toLowerCase().replace(/\s+/g, "");
    if (TAG_SIZE_CHART_MAP[key]) return TAG_SIZE_CHART_MAP[key];
  }
  return null;
}

type ProductRow = { id: string; name: string; handle: string | null; category: string | null; tags: string[] | null };

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const products = await fetchAllRows<ProductRow>(
    admin, "products", "id, name, handle, category, tags",
    (q) => q.eq("seller_id", seller.id).eq("status", "published")
  );
  console.log(`\n${products.length} published product(s) found for ${seller.email}.\n`);

  const withChart = products.filter((p) => getSizeChartType(p) !== null);
  const withoutChart = products.filter((p) => getSizeChartType(p) === null);
  console.log(`${withChart.length} product(s) get a size chart, ${withoutChart.length} do NOT.\n`);

  const byCategory = new Map<string, ProductRow[]>();
  for (const p of withoutChart) {
    const cat = p.category || "(no category)";
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }
  const sorted = Array.from(byCategory.entries()).sort((a, b) => b[1].length - a[1].length);

  console.log(`Uncharted products by category (largest first):`);
  for (const [cat, rows] of sorted.slice(0, 30)) {
    console.log(`  ${rows.length}x  "${cat}"`);
  }
  if (sorted.length > 30) console.log(`  ...and ${sorted.length - 30} more categories.`);

  // Sample tags actually present on a few uncharted products, so it's
  // visible whether the "right" tag is just spelled/formatted differently
  // (e.g. "Women XS-XL Pants" vs the exact "womenxsmalltoxlpants" this
  // code expects) rather than genuinely absent.
  console.log(`\nSample of 10 uncharted products with their real tags (to check for a near-miss tag spelling):`);
  for (const p of withoutChart.slice(0, 10)) {
    console.log(`  "${p.name}"  category="${p.category}"  tags=${JSON.stringify(p.tags)}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
