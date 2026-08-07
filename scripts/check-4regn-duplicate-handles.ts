// Diagnoses (and optionally fixes) products.handle collisions for 4regn --
// products.handle has a unique index scoped to (seller_id, handle) per an
// earlier migration, so two products can't ACTUALLY share a handle in the
// database today. This script exists because a real, reported symptom
// (clicking a specific product in search results opens a DIFFERENT product
// with the same display name) is most consistent with exactly that
// collision having existed at some point -- e.g. two products both named
// "Kelvin Momo Oversized Tee" (a real, legitimate Shopify listing shape:
// same name, different print/variant) each generating the same slugified
// handle during import, with only the LAST write actually landing (the
// unique index would reject the second write outright, or an upsert could
// silently overwrite -- either way, one of the two products would be left
// with an auto-generated fallback handle, a stale/incorrect one, or the
// SAME row two different-looking search results both actually resolve to).
//
// What this checks instead, since an exact handle collision can't exist
// right now: products sharing the exact same NAME, since that's the
// precondition for the collision this bug pattern needs, and prints each
// one's current id/handle/image so a human can see directly whether they
// still each resolve to their own distinct product page or not. Also
// flags any product whose handle looks like a dedupe-suffixed fallback
// (ends in -2, -3, ...) sitting next to a same-named sibling -- the
// tell-tale shape of scripts/backfill-4regn-handles.ts's dedupe() having
// actually fired for this exact pair.
//
// This is read-only by default. --fix does nothing today (see the bottom
// of main() for why) -- the actual fix, if this surfaces a real corrupted
// row, is a targeted UPDATE informed by what the dry-run output shows,
// not something safe to automate blindly here.
//
// Usage:
//   npx tsx scripts/check-4regn-duplicate-handles.ts --seller=owner@4regn.com

import { getAdminClient, resolveSeller, fetchAllRows, withTimeout } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string } = {};
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/check-4regn-duplicate-handles.ts --seller=owner@example.com");
    process.exit(1);
  }
  return out as { seller: string };
}

type ProductRow = { id: string; name: string; handle: string | null; image_url: string | null; status: string; in_stock: boolean };

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);

  const products = await fetchAllRows<ProductRow>(
    admin, "products", "id, name, handle, image_url, status, in_stock", (q) => q.eq("seller_id", seller.id)
  );
  console.log(`\n${products.length} product(s) found for ${seller.email}.\n`);

  const byName = new Map<string, ProductRow[]>();
  for (const p of products) {
    const key = p.name.trim().toLowerCase();
    if (!byName.has(key)) byName.set(key, []);
    byName.get(key)!.push(p);
  }

  const duplicateNameGroups = Array.from(byName.values()).filter((rows) => rows.length > 1);

  if (duplicateNameGroups.length === 0) {
    console.log("No two products share the exact same name -- the reported wrong-product bug doesn't match this store's current data shape, or already resolved itself.");
    return;
  }

  console.log(`${duplicateNameGroups.length} product name(s) shared by 2+ products (${duplicateNameGroups.reduce((n, g) => n + g.length, 0)} products total):\n`);

  const byHandle = new Map<string, ProductRow[]>();
  for (const p of products) {
    if (!p.handle) continue;
    if (!byHandle.has(p.handle)) byHandle.set(p.handle, []);
    byHandle.get(p.handle)!.push(p);
  }

  for (const group of duplicateNameGroups) {
    console.log(`"${group[0].name}"`);
    for (const p of group) {
      const suspiciousSuffix = p.handle && /-\d+$/.test(p.handle) ? "  <- looks like a dedupe-suffixed fallback handle" : "";
      const handleCollision = p.handle && (byHandle.get(p.handle)?.length ?? 0) > 1 ? "  !! ACTUAL HANDLE COLLISION (should be impossible under the unique index -- report this)" : "";
      console.log(`  id=${p.id}  handle=${p.handle ?? "(none)"}  status=${p.status}  in_stock=${p.in_stock}${suspiciousSuffix}${handleCollision}`);
      console.log(`    image: ${p.image_url ?? "(none)"}`);
      console.log(`    -> /products/${p.handle ?? p.id}`);
    }
    console.log("");
  }

  console.log("Each product above should open its OWN url (shown above) with its OWN image when clicked from search.");
  console.log("If clicking one search result consistently lands on a different product's page than what's printed here for its id, that's the bug -- reply with which id/name pair misbehaves and the exact url it lands on.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
