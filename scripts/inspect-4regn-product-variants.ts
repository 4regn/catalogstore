// Diagnostic only -- reads and prints, writes nothing. Prints the exact
// live `variants` JSON stored for one product, so we can see how many
// dimensions ended up with an `images` map (and in what array order) --
// needed to confirm whether a product has more than one dimension with
// real per-value photo sets, which is the suspected cause of the
// storefront showing the wrong color's photos.
//
// Usage:
//   npx tsx scripts/inspect-4regn-product-variants.ts --seller=owner@4regn.com --handle=some-product-handle

import { getAdminClient } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; handle?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--handle=")) out.handle = arg.slice("--handle=".length);
  }
  if (!out.seller || !out.handle) {
    console.error("Usage: npx tsx scripts/inspect-4regn-product-variants.ts --seller=owner@4regn.com --handle=some-product-handle");
    process.exit(1);
  }
  return out as { seller: string; handle: string };
}

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();

  const { data: seller, error: sellerErr } = await admin.from("sellers").select("id, email").eq("email", args.seller).maybeSingle();
  if (sellerErr || !seller) {
    console.error(`Could not find a seller matching "${args.seller}": ${sellerErr?.message || "no matching row"}`);
    process.exit(1);
  }

  const { data: product, error } = await admin
    .from("products")
    .select("id, name, handle, variants")
    .eq("seller_id", seller.id)
    .eq("handle", args.handle)
    .maybeSingle();
  if (error || !product) {
    console.error(`No product found for handle "${args.handle}": ${error?.message || "no matching row"}`);
    process.exit(1);
  }

  console.log(`${product.name} (${product.handle})\n`);
  const variants = product.variants || [];
  console.log(`variants array order: ${variants.map((v: any) => v.name).join(" -> ")}\n`);
  for (const v of variants) {
    console.log(`--- ${v.name} ---`);
    console.log(`  options: ${v.options?.join(", ")}`);
    if (v.images) {
      console.log(`  HAS images map (${Object.keys(v.images).length} value(s)):`);
      for (const [value, urls] of Object.entries(v.images as Record<string, string[]>)) {
        console.log(`    ${value}: ${urls.length} photo(s) -- first: ${urls[0]}`);
      }
    } else {
      console.log(`  no images map`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
