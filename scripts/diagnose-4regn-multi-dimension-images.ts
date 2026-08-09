// Diagnostic only -- reads and prints, writes nothing.
//
// The sweater bug (Apricot showing Brown) turned out to be caused by
// grouping variant photos by the wrong CSV column (Image Src instead of
// Variant Image, fixed in computeVariantImageMaps). But a second, distinct
// risk exists independently of that: a product where MORE THAN ONE variant
// dimension (e.g. both Color AND Size) ends up with its own valid `images`
// map. The storefront's `activeImageDim` state picks whichever dimension
// the customer most recently clicked, which should be correct -- but it's
// worth directly listing every product where this ambiguity exists, so we
// can eyeball whether any of them still show wrong content even after the
// column fix (e.g. because "Variant Image" was only populated on the
// first size row per color, and got carried into the Size dimension's own
// grouping too, cross-contaminating it with every color's photo).
//
// Usage:
//   npx tsx scripts/diagnose-4regn-multi-dimension-images.ts --seller=owner@4regn.com [--handle=some-product-handle]

import { getAdminClient, fetchAllRows } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; handle?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--handle=")) out.handle = arg.slice("--handle=".length);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/diagnose-4regn-multi-dimension-images.ts --seller=owner@4regn.com [--handle=some-product-handle]");
    process.exit(1);
  }
  return out as { seller: string; handle?: string };
}

type ProductVariant = { name: string; options: string[]; images?: Record<string, string[]> };
type ProductRow = { id: string; name: string; handle: string | null; variants: ProductVariant[] | null };

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();

  const { data: seller, error: sellerErr } = await admin.from("sellers").select("id, email").eq("email", args.seller).maybeSingle();
  if (sellerErr || !seller) {
    console.error(`Could not find a seller matching "${args.seller}": ${sellerErr?.message || "no matching row"}`);
    process.exit(1);
  }

  const products = await fetchAllRows<ProductRow>(admin, "products", "id, name, handle, variants", (q) => q.eq("seller_id", seller.id));

  const flagged = products.filter((p) => {
    if (args.handle && p.handle !== args.handle) return false;
    const variants = p.variants || [];
    const dimsWithImages = variants.filter((v) => v.images && Object.keys(v.images).length > 0);
    return dimsWithImages.length >= 2;
  });

  console.log(`${flagged.length}/${products.length} product(s) have 2+ variant dimensions each carrying their own images map.\n`);
  for (const p of flagged) {
    const variants = p.variants || [];
    console.log(`${p.name} (${p.handle})`);
    for (const v of variants) {
      if (!v.images) continue;
      const values = Object.entries(v.images);
      const totalPhotos = values.reduce((sum, [, urls]) => sum + urls.length, 0);
      console.log(`  ${v.name}: ${values.length} value(s), ${totalPhotos} photo(s) total -- ${values.map(([val, urls]) => `${val}=${urls.length}`).join(", ")}`);
    }
    console.log();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
