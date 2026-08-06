// Backfills products.handle for 4regn so its storefront can serve real
// SEO-friendly product URLs (/products/{handle}) matching what Google
// already has indexed for the live Shopify store, instead of the generic
// /p/{uuid} every other seller uses.
//
// Two sources for a product's handle, in priority order:
//   1. product_redirects -- built during the original product import from
//      the product's REAL Shopify handle (old_path = "/products/{handle}").
//      Always preferred: it's what Google already ranks, so re-deriving a
//      fresh slug from the current product name would throw that ranking
//      away for no reason.
//   2. A freshly generated slug (from the product's current name) for any
//      product with no matching redirect row -- e.g. a product added
//      directly on this platform after the Shopify migration, which never
//      had an old Shopify URL to preserve.
//
// Join key: product_redirects.product_id is a direct FK set at import time
// and preferred whenever populated; destination_path === "/p/{id}" is the
// fallback for any row where product_id is null (see product_redirects'
// own migration comment -- it's nulled on product delete, not cascaded, so
// in principle a handful of rows could have it unset even though the
// product itself still exists).
//
// Once a real /products/[handle] route exists and /p/[productId] redirects
// UUID -> handle for 4regn, a product_redirects row whose stripped old_path
// exactly equals the product's newly-assigned handle becomes a redirect
// loop waiting to happen (middleware would bounce /products/{handle} to
// /p/{uuid}, which immediately redirects back to /products/{handle}) -- see
// middleware.ts's resolveLegacyRedirect(). This script deletes exactly
// those rows. A redirect row only survives when its handle DIFFERS from the
// product's final assigned handle (the rare collision-suffix case) -- that
// row still points at a genuinely different path than the new canonical
// one, so it stays useful.
//
// Usage:
//   npx tsx scripts/backfill-4regn-handles.ts --seller=owner@4regn.com [--dry-run] [--concurrency=4]

import { getAdminClient, resolveSeller, fetchAllRows, withTimeout } from "./lib/migrate-shared";

function parseHandleArgs() {
  const out: { seller?: string; dryRun: boolean; concurrency: number } = { dryRun: false, concurrency: 4 };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/backfill-4regn-handles.ts --seller=owner@example.com [--dry-run] [--concurrency=4]");
    process.exit(1);
  }
  return out as { seller: string; dryRun: boolean; concurrency: number };
}

// Same one-line slug convention already used all over this codebase (e.g.
// FourRegnStore.tsx's collectionSlug, c/[collection]/page.tsx's local
// slugify): lowercase, trim, spaces -> hyphens, strip anything else.
const slugify = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// Appends a numeric -2/-3/... suffix until `base` no longer collides with a
// handle already claimed earlier in this same run.
function dedupe(base: string, assigned: Set<string>): string {
  if (!base) base = "product";
  if (!assigned.has(base)) return base;
  let n = 2;
  while (assigned.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

type ProductRow = { id: string; name: string; handle: string | null };
type RedirectRow = { id: string; old_path: string; destination_path: string; product_id: string | null };

async function main() {
  const args = parseHandleArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const products = await fetchAllRows<ProductRow>(admin, "products", "id, name, handle", (q) => q.eq("seller_id", sellerId));
  console.log(`\n${products.length} product(s) found for this seller.`);

  const redirects = await fetchAllRows<RedirectRow>(
    admin, "product_redirects", "id, old_path, destination_path, product_id", (q) => q.eq("seller_id", sellerId)
  );
  console.log(`${redirects.length} product_redirects row(s) found for this seller.`);

  // Join: prefer the direct product_id FK; fall back to matching
  // destination_path against "/p/{id}" for rows where it's null.
  const redirectByProductId = new Map<string, RedirectRow>();
  const redirectByDestPath = new Map<string, RedirectRow>();
  for (const r of redirects) {
    if (r.product_id) redirectByProductId.set(r.product_id, r);
    else redirectByDestPath.set(r.destination_path, r);
  }

  const assigned = new Set<string>();
  // Products that already have a handle keep it as-is and seed the
  // collision set first, so re-runs never reassign or clash with them.
  for (const p of products) {
    if (p.handle) assigned.add(p.handle);
  }

  type Plan = {
    product: ProductRow;
    targetHandle: string;
    source: "existing" | "redirect" | "generated";
    matchedRedirect: RedirectRow | null;
  };
  const plans: Plan[] = [];

  for (const p of products) {
    const matchedRedirect = redirectByProductId.get(p.id) ?? redirectByDestPath.get(`/p/${p.id}`) ?? null;

    if (p.handle) {
      plans.push({ product: p, targetHandle: p.handle, source: "existing", matchedRedirect });
      continue;
    }

    if (matchedRedirect) {
      // The real, original Shopify handle -- exact technique used in
      // migrate-4regn-collections.ts's own redirect join.
      const realHandle = matchedRedirect.old_path.replace(/^\/products\//, "");
      const target = dedupe(realHandle, assigned);
      assigned.add(target);
      plans.push({ product: p, targetHandle: target, source: "redirect", matchedRedirect });
      continue;
    }

    const generated = dedupe(slugify(p.name), assigned);
    assigned.add(generated);
    plans.push({ product: p, targetHandle: generated, source: "generated", matchedRedirect: null });
  }

  const toWrite = plans.filter((pl) => pl.source !== "existing");
  const alreadySet = plans.length - toWrite.length;
  const fromRedirect = toWrite.filter((pl) => pl.source === "redirect").length;
  const generated = toWrite.filter((pl) => pl.source === "generated").length;

  // A redirect row is safe to delete only once the product's FINAL assigned
  // handle (after any collision suffixing) exactly matches what that row
  // would otherwise keep redirecting to -- see the loop-hazard comment atop
  // this file.
  const redirectsToDelete = plans
    .filter((pl) => pl.matchedRedirect && pl.matchedRedirect.old_path.replace(/^\/products\//, "") === pl.targetHandle)
    .map((pl) => pl.matchedRedirect!.id);
  const redirectsKept = plans.filter((pl) => pl.matchedRedirect && !redirectsToDelete.includes(pl.matchedRedirect.id)).length;

  console.log(`\n${alreadySet} product(s) already have a handle set (left untouched).`);
  console.log(`${toWrite.length} product(s) need a handle written: ${fromRedirect} from a real product_redirects handle, ${generated} generated fallback(s) from the product name.`);
  console.log(`${redirectsToDelete.length} product_redirects row(s) would be deleted (their handle now matches a real route natively -- keeping them would be a redirect loop).`);
  console.log(`${redirectsKept} product_redirects row(s) stay in place (assigned handle differs from the old redirect's handle -- still a genuinely different path).`);

  console.log(`\nSample assignments (first 10):`);
  for (const pl of plans.slice(0, 10)) {
    console.log(`  ${pl.product.id}  "${pl.product.name}"  ->  /products/${pl.targetHandle}  [${pl.source}]`);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: no products updated, no product_redirects rows deleted.");
    return;
  }

  console.log(`\nWriting ${toWrite.length} product handle(s)...`);
  let done = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < toWrite.length) {
      const idx = cursor++;
      const pl = toWrite[idx];
      try {
        const { error } = await withTimeout(
          admin.from("products").update({ handle: pl.targetHandle }).eq("id", pl.product.id),
          "product handle update"
        );
        if (error) failed++;
      } catch {
        failed++;
      }
      done++;
      if (done % 25 === 0 || done === toWrite.length) process.stdout.write(`\r  products: ${done}/${toWrite.length} updated (${failed} failed)...`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, toWrite.length || 1) }, () => worker()));
  if (toWrite.length) process.stdout.write("\n");

  let deleted = 0;
  let deleteFailed = 0;
  const DELETE_BATCH = 200;
  for (let i = 0; i < redirectsToDelete.length; i += DELETE_BATCH) {
    const chunk = redirectsToDelete.slice(i, i + DELETE_BATCH);
    try {
      const { error } = await withTimeout(admin.from("product_redirects").delete().in("id", chunk), "product_redirects delete");
      if (error) deleteFailed += chunk.length;
      else deleted += chunk.length;
    } catch {
      deleteFailed += chunk.length;
    }
  }

  console.log(`\nDone. ${done - failed} product(s) updated (${failed} failed), ${deleted} product_redirects row(s) deleted (${deleteFailed} failed).`);
  if (failed || deleteFailed) console.log("Safe to re-run this script -- it recomputes handles/deletions fresh each time from current data, already-handled rows are skipped or reconfirmed rather than double-processed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
