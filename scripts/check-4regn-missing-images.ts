// Diagnoses (read-only) how many of 4regn's published products have no
// image at all -- reported directly against the live site (search "Kelvin
// Momo", several results open to a product page with no photo). Confirmed
// this is a known, already-handled-for failure mode of the original
// migration: scripts/migrate-4regn.ts downloads each product's image(s)
// from the Shopify CDN URLs in the CSV and re-uploads them to this
// platform's own Storage bucket -- if that download/upload failed for a
// given product (CDN timeout, rate limiting, a since-deleted Shopify image,
// etc.) at import time, the product still got created, just with
// image_url/images left empty. migrate-4regn.ts already has a built-in
// retry for exactly this (--resume-images, matches existing products by
// source_url and re-attempts any with fewer images than its CSV row
// listed) -- this script exists to size the problem first and print which
// products are affected, so the retry's own output can be sanity-checked
// against something concrete afterward.
//
// Usage:
//   npx tsx scripts/check-4regn-missing-images.ts --seller=owner@4regn.com

import { getAdminClient, resolveSeller, fetchAllRows } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/check-4regn-missing-images.ts --seller=owner@example.com");
    process.exit(1);
  }
  return out as { seller: string };
}

type ProductRow = {
  id: string;
  name: string;
  handle: string | null;
  image_url: string | null;
  images: string[] | null;
  source_url: string | null;
  status: string;
  in_stock: boolean;
};

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const products = await fetchAllRows<ProductRow>(
    admin, "products", "id, name, handle, image_url, images, source_url, status, in_stock",
    (q) => q.eq("seller_id", seller.id).eq("status", "published")
  );
  console.log(`\n${products.length} published product(s) found for ${seller.email}.\n`);

  const missing = products.filter((p) => !p.image_url && (!p.images || p.images.length === 0));
  const missingWithSourceUrl = missing.filter((p) => p.source_url);
  const missingWithoutSourceUrl = missing.filter((p) => !p.source_url);

  console.log(`${missing.length} product(s) have NO image at all (${((missing.length / products.length) * 100).toFixed(1)}% of published products).`);
  console.log(`  ${missingWithSourceUrl.length} of those have a source_url on file -- these are the ones --resume-images can retry against the original Shopify CDN URLs.`);
  console.log(`  ${missingWithoutSourceUrl.length} have NO source_url -- either added directly on this platform (never had a Shopify image to begin with), or migrated before source_url was captured. --resume-images can't help these; they'd need a fresh image uploaded manually or via a product update.`);

  console.log(`\nFirst 30 with a source_url (retryable):`);
  for (const p of missingWithSourceUrl.slice(0, 30)) {
    console.log(`  id=${p.id}  "${p.name}"  -> /products/${p.handle ?? p.id}`);
    console.log(`    source: ${p.source_url}`);
  }
  if (missingWithSourceUrl.length > 30) console.log(`  ...and ${missingWithSourceUrl.length - 30} more.`);

  if (missingWithoutSourceUrl.length > 0) {
    console.log(`\nFirst 15 with NO source_url (not retryable via --resume-images):`);
    for (const p of missingWithoutSourceUrl.slice(0, 15)) {
      console.log(`  id=${p.id}  "${p.name}"  -> /products/${p.handle ?? p.id}`);
    }
    if (missingWithoutSourceUrl.length > 15) console.log(`  ...and ${missingWithoutSourceUrl.length - 15} more.`);
  }

  console.log(`\nIf the retryable count above is nonzero, re-run the original migration with the SAME csv you imported from and --resume-images added, e.g.:`);
  console.log(`  npx tsx scripts/migrate-4regn.ts --csv=<same-file-as-before>.csv --seller=${seller.email} --source-domain=https://4regn.com --resume-images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
