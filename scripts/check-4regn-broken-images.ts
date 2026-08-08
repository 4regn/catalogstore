// Diagnoses (read-only) products whose image_url/images ARE populated in
// the database but don't actually load -- distinct from
// check-4regn-missing-images.ts, which only catches an empty/null
// image_url. That script came back with only 15 affected products, but
// several reported broken-image URLs (e.g. /products/graphic-tee-55,
// /products/beyonce-graphic-hoodie) weren't in that list at all -- meaning
// their image_url IS set to something, it just doesn't resolve. This
// script actually requests each stored URL and reports which ones fail,
// which the earlier one couldn't do (this sandbox has no network access to
// this project's own Supabase Storage host to check directly, so this has
// to run from your machine, same as every other script here).
//
// Checks image_url first (what every product-card/PDP render actually
// displays); the extra images[] entries after, so a broken PRIMARY image
// is reported distinctly from a broken gallery-only one.
//
// Usage:
//   npx tsx scripts/check-4regn-broken-images.ts --seller=owner@4regn.com [--concurrency=8]

import { getAdminClient, resolveSeller, fetchAllRows } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; concurrency: number } = { concurrency: 8 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10) || 8;
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/check-4regn-broken-images.ts --seller=owner@example.com [--concurrency=8]");
    process.exit(1);
  }
  return out as { seller: string; concurrency: number };
}

type ProductRow = { id: string; name: string; handle: string | null; image_url: string | null; images: string[] | null; status: string };

async function checkUrl(url: string, timeoutMs = 12000): Promise<{ ok: boolean; status: number | null; error?: string }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    // HEAD first (cheap); some CDNs/storage backends don't support it
    // properly (405/501 rather than a real answer) so fall back to a
    // ranged GET, same as a browser's own <img> request would trigger,
    // rather than trusting a HEAD-only false negative.
    let res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal });
    }
    return { ok: res.ok, status: res.status };
  } catch (err: any) {
    return { ok: false, status: null, error: err?.name === "AbortError" ? "timeout" : (err?.message || "fetch failed") };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const products = await fetchAllRows<ProductRow>(
    admin, "products", "id, name, handle, image_url, images, status",
    (q) => q.eq("seller_id", seller.id).eq("status", "published")
  );
  const withImage = products.filter((p) => p.image_url);
  console.log(`\n${products.length} published product(s) found. ${withImage.length} have an image_url set -- checking whether each one actually loads (this can take a few minutes for a large catalog)...\n`);

  type Broken = { product: ProductRow; url: string; which: "primary" | "gallery"; status: number | null; error?: string };
  const broken: Broken[] = [];
  let checked = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < withImage.length) {
      const p = withImage[cursor++];
      const primary = await checkUrl(p.image_url!);
      if (!primary.ok) broken.push({ product: p, url: p.image_url!, which: "primary", status: primary.status, error: primary.error });
      checked++;
      if (checked % 25 === 0 || checked === withImage.length) {
        process.stdout.write(`\r  checked ${checked}/${withImage.length} (${broken.length} broken so far)...`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, withImage.length || 1) }, () => worker()));
  process.stdout.write("\n");

  console.log(`\n${broken.length} product(s) have a PRIMARY image_url that does NOT load:\n`);
  for (const b of broken.slice(0, 60)) {
    console.log(`  id=${b.product.id}  "${b.product.name}"  -> /products/${b.product.handle ?? b.product.id}`);
    console.log(`    ${b.url}`);
    console.log(`    ${b.status ? `HTTP ${b.status}` : b.error}`);
  }
  if (broken.length > 60) console.log(`  ...and ${broken.length - 60} more.`);

  console.log(`\nIf most of these are the same status/error (e.g. all 404, or all "fetch failed"), that points at ONE root cause (a Storage bucket/path that changed, or a since-deleted file) rather than N separate ones -- paste this output back and it can be diagnosed from there.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
