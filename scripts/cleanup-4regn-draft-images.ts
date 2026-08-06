// Deletes Supabase Storage image files belonging to DRAFT (unpublished)
// 4regn products -- they never show on the live storefront, so their
// uploaded images are pure wasted storage.
//
// Storage layout (see scripts/migrate-4regn.ts's own upload path): every
// image for a product lives under `{sellerId}/{productId}/csv-{n}.{ext}` in
// the `product-images` bucket -- so cleanup is a per-product folder list +
// delete, not something that needs to parse individual image URLs.
//
// This does NOT touch the product rows themselves (their status, whether
// they exist at all) -- only the storage files. If a draft product is later
// published, its `image_url`/`images` columns would point at files that no
// longer exist; that's expected given what was asked ("we won't be needing
// them"), not a bug in this script.
//
// Usage:
//   npx tsx scripts/cleanup-4regn-draft-images.ts --seller=owner@4regn.com [--dry-run] [--concurrency=4]

import { getAdminClient, resolveSeller, fetchAllRows, withTimeout } from "./lib/migrate-shared";

const BUCKET = "product-images";

function parseCleanupArgs() {
  const out: { seller?: string; dryRun: boolean; concurrency: number } = { dryRun: false, concurrency: 4 };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/cleanup-4regn-draft-images.ts --seller=owner@example.com [--dry-run] [--concurrency=4]");
    process.exit(1);
  }
  return out as { seller: string; dryRun: boolean; concurrency: number };
}

async function main() {
  const args = parseCleanupArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const draftProducts = await fetchAllRows<{ id: string; name: string }>(
    admin, "products", "id, name", (q) => q.eq("seller_id", sellerId).eq("status", "draft")
  );
  console.log(`\n${draftProducts.length} draft product(s) found for this seller.`);

  if (draftProducts.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }

  // List every file under each draft product's folder first (read-only),
  // so --dry-run can report an accurate count before anything is deleted.
  console.log(`\nListing storage files (${args.concurrency} at a time)...`);
  type Plan = { productId: string; name: string; paths: string[] };
  const plans: Plan[] = [];
  let listed = 0;
  let listCursor = 0;
  async function listWorker() {
    while (listCursor < draftProducts.length) {
      const idx = listCursor++;
      const p = draftProducts[idx];
      const folder = `${sellerId}/${p.id}`;
      try {
        const { data, error } = await withTimeout(
          admin.storage.from(BUCKET).list(folder, { limit: 1000 }),
          `list ${folder}`
        );
        if (!error && data && data.length > 0) {
          plans.push({ productId: p.id, name: p.name, paths: data.map((f) => `${folder}/${f.name}`) });
        }
      } catch {
        // Treat a listing failure as "nothing found" rather than aborting
        // the whole run -- --dry-run/real-run summaries below will simply
        // undercount for that one product; safe to re-run this script,
        // it recomputes from scratch every time.
      }
      listed++;
      if (listed % 25 === 0 || listed === draftProducts.length) {
        process.stdout.write(`\r  ${listed}/${draftProducts.length} draft product folder(s) checked...`);
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, draftProducts.length) }, () => listWorker()));
  if (draftProducts.length) process.stdout.write("\n");

  const totalFiles = plans.reduce((sum, pl) => sum + pl.paths.length, 0);
  console.log(`\n${plans.length} draft product(s) have image files in storage, ${totalFiles} file(s) total.`);

  if (totalFiles === 0) {
    console.log("Nothing to delete.");
    return;
  }

  console.log(`\nSample (first 5 product(s)):`);
  for (const pl of plans.slice(0, 5)) {
    console.log(`  "${pl.name}" (${pl.productId}): ${pl.paths.length} file(s)`);
  }

  if (args.dryRun) {
    console.log(`\n--dry-run: would delete ${totalFiles} file(s) across ${plans.length} draft product(s). Nothing deleted.`);
    return;
  }

  console.log(`\nDeleting ${totalFiles} file(s)...`);
  let deleted = 0;
  let failed = 0;
  const DELETE_BATCH = 100; // Supabase Storage's own remove() batch limit is generous, but keep requests small and steady.
  const allPaths = plans.flatMap((pl) => pl.paths);
  for (let i = 0; i < allPaths.length; i += DELETE_BATCH) {
    const chunk = allPaths.slice(i, i + DELETE_BATCH);
    try {
      const { data, error } = await withTimeout(admin.storage.from(BUCKET).remove(chunk), "storage remove batch");
      if (error) {
        failed += chunk.length;
      } else {
        deleted += data?.length ?? chunk.length;
      }
    } catch {
      failed += chunk.length;
    }
    process.stdout.write(`\r  ${Math.min(i + DELETE_BATCH, allPaths.length)}/${allPaths.length} file(s) processed (${failed} failed)...`);
  }
  process.stdout.write("\n");

  console.log(`\nDone. ${deleted} file(s) deleted (${failed} failed) across ${plans.length} draft product(s).`);
  if (failed) console.log("Safe to re-run this script -- it re-lists what's actually still there each time, already-deleted files just won't show up again.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
