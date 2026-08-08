// Fixes the root cause check-4regn-broken-images.ts surfaced: 438 of 1579
// products with an image_url all failed with the SAME error (HTTP 400 from
// this project's own Supabase Storage), all at paths this platform itself
// uploaded to (product-images/<seller>/<product-id>/csv-0.jpg) -- not a
// broken link to somewhere external, an object that's actually gone from
// Storage. 438 lines up closely with the 430 products deleted (and their
// Storage files cleaned up) during an earlier Supabase quota crisis this
// session -- most likely that cleanup's orphan-detection had false
// positives: files that were still genuinely referenced by these 438
// products' image_url/images got swept up and deleted anyway.
//
// migrate-4regn.ts --resume-images can't fix this on its own: it only
// re-fetches a product when its CURRENT images[] array is shorter than
// what the CSV originally listed (`images.length < expectedCount`) -- these
// products still have a full-looking images[] array, the entries just
// point at deleted files, so that count check never trips.
//
// This script re-verifies every image URL live (same check as
// check-4regn-broken-images.ts -- doesn't trust a stale list, state may
// have changed), then for each product keeps only the STILL-WORKING
// entries in images[] (an image_url/images entry can independently be
// fine while a sibling is dead -- this is per-URL, not all-or-nothing per
// product) and sets image_url to the first survivor, or clears both to
// null if none survive. Clearing (not guessing a replacement) is what lets
// --resume-images correctly treat the product as needing images again on
// its next run.
//
// Dry-run by default -- prints exactly what would change without writing
// anything. Add --confirm to actually update the DB.
//
// Usage:
//   npx tsx scripts/clear-4regn-broken-images.ts --seller=owner@4regn.com [--confirm] [--concurrency=8]

import { getAdminClient, resolveSeller, fetchAllRows, withTimeout } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; confirm: boolean; concurrency: number } = { confirm: false, concurrency: 8 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg === "--confirm") out.confirm = true;
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10) || 8;
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/clear-4regn-broken-images.ts --seller=owner@example.com [--confirm] [--concurrency=8]");
    process.exit(1);
  }
  return out as { seller: string; confirm: boolean; concurrency: number };
}

type ProductRow = { id: string; name: string; handle: string | null; image_url: string | null; images: string[] | null };

async function urlWorks(url: string, timeoutMs = 12000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    let res = await fetch(url, { method: "HEAD", signal: controller.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", headers: { Range: "bytes=0-0" }, signal: controller.signal });
    }
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const products = await fetchAllRows<ProductRow>(
    admin, "products", "id, name, handle, image_url, images",
    (q) => q.eq("seller_id", seller.id).eq("status", "published")
  );
  const withImages = products.filter((p) => (p.images && p.images.length > 0) || p.image_url);
  console.log(`\n${products.length} published product(s). ${withImages.length} have at least one image URL -- re-verifying every one live (this can take a few minutes)...\n`);

  type Plan = { product: ProductRow; before: string[]; after: string[] };
  const plans: Plan[] = [];
  let checked = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < withImages.length) {
      const p = withImages[cursor++];
      // images[] is the source of truth when present (image_url is just
      // images[0] in the normal case); fall back to a single-entry list
      // built from image_url for the rare row that only has that field set.
      const before = (p.images && p.images.length > 0) ? p.images : (p.image_url ? [p.image_url] : []);
      const results = await Promise.all(before.map((u) => urlWorks(u)));
      const after = before.filter((_, i) => results[i]);
      if (after.length !== before.length) plans.push({ product: p, before, after });
      checked++;
      if (checked % 25 === 0 || checked === withImages.length) {
        process.stdout.write(`\r  checked ${checked}/${withImages.length} (${plans.length} product(s) need fixing so far)...`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, withImages.length || 1) }, () => worker()));
  process.stdout.write("\n");

  const fullyDead = plans.filter((pl) => pl.after.length === 0);
  const partiallyDead = plans.filter((pl) => pl.after.length > 0);

  console.log(`\n${plans.length} product(s) have at least one dead image URL:`);
  console.log(`  ${fullyDead.length} have ALL images dead -- image_url/images will be cleared to null (picked back up by migrate-4regn.ts --resume-images next).`);
  console.log(`  ${partiallyDead.length} have SOME images still working -- images[] trimmed to the survivors, image_url reset to the first one.`);

  console.log(`\nSample (first 15):`);
  for (const pl of plans.slice(0, 15)) {
    console.log(`  id=${pl.product.id}  "${pl.product.name}"  -> /products/${pl.product.handle ?? pl.product.id}`);
    console.log(`    ${pl.before.length} image(s) -> ${pl.after.length} surviving`);
  }
  if (plans.length > 15) console.log(`  ...and ${plans.length - 15} more.`);

  if (!args.confirm) {
    console.log(`\n--confirm not passed -- no changes written. Re-run with --confirm to apply the above, then run:`);
    console.log(`  npx tsx scripts/migrate-4regn.ts --csv=<same-file-as-before>.csv --seller=${seller.email} --source-domain=https://4regn.com --resume-images`);
    console.log(`to re-fetch real images for every product just cleared to null.`);
    return;
  }

  console.log(`\nWriting ${plans.length} update(s)...`);
  let done = 0;
  let failed = 0;
  let writeCursor = 0;
  async function writeWorker() {
    while (writeCursor < plans.length) {
      const pl = plans[writeCursor++];
      try {
        const { error } = await withTimeout(
          admin.from("products").update({
            images: pl.after.length > 0 ? pl.after : null,
            image_url: pl.after[0] || null,
          }).eq("id", pl.product.id),
          "product image clear"
        );
        if (error) failed++;
      } catch {
        failed++;
      }
      done++;
      if (done % 25 === 0 || done === plans.length) process.stdout.write(`\r  ${done}/${plans.length} updated (${failed} failed)...`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, plans.length || 1) }, () => writeWorker()));
  if (plans.length) process.stdout.write("\n");

  console.log(`\nDone. ${done - failed} product(s) updated (${failed} failed).`);
  console.log(`\nNow run migrate-4regn.ts --resume-images (same csv as the original import) to re-fetch real images for the ${fullyDead.length} product(s) cleared entirely to null:`);
  console.log(`  npx tsx scripts/migrate-4regn.ts --csv=<same-file-as-before>.csv --seller=${seller.email} --source-domain=https://4regn.com --resume-images`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
