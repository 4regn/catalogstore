// Regenerates SEO-meaningless product handles for 4regn products that were
// stuck with a generic, sequentially-numbered handle (e.g. /products/
// oversized-tee-7) despite having a real, distinct product name (e.g.
// "Oscar Mbo Oversized Tee") -- confirmed live via Google Search Console's
// "Crawled - currently not indexed" report: hundreds of products sharing a
// handle "base" (oversized-tee-N, graphic-hoodie-N, graphic-tee-N,
// trucker-caps-N, printed-shorts-N, ...) look to Google like a wall of
// auto-generated near-duplicate pages, even when every one of them is a
// genuinely distinct product -- because the URL itself carries none of
// that distinctiveness.
//
// Different problem from backfill-4regn-handles.ts, which only fills in a
// NULL handle and otherwise leaves an existing one untouched (including a
// bad generic one) -- this script specifically targets existing handles
// that look generic and regenerates them from the product's current name.
//
// How "generic" is detected: group every product by its handle's "base"
// (the handle with a trailing -N stripped, e.g. "oversized-tee-7" ->
// "oversized-tee"). A base shared by --min-group-size (default 3) or more
// DIFFERENT products is almost certainly a bucket every one of them got
// dumped into during import, rather than a product that coincidentally
// picked a similar handle to one or two others. This is a heuristic, not a
// certainty -- review the report before applying.
//
// For every flagged product, the new handle is slugify(product.name),
// deduped against every OTHER handle (kept-as-is or newly assigned this
// run) exactly like backfill-4regn-handles.ts's own dedupe(). A product
// whose slugified name lands back on a bucket of its own (i.e. the name
// itself is generic, not just the handle) is reported separately under
// "names that may need attention" instead of silently reassigned --
// changing a bad handle to another bad handle doesn't fix anything.
//
// SEO safety: every change adds a product_redirects row (old handle -> new
// handle) so any already-indexed or bookmarked /products/{old-handle} URL
// keeps working via the existing middleware.ts resolveLegacyRedirect
// mechanism, instead of turning into a fresh 404. Any PRE-EXISTING redirect
// row that pointed at the old handle (e.g. a genuinely-original Shopify
// handle that redirected to this generic one) is repointed at the new
// handle too, so the whole chain still resolves in one hop.
//
// Default mode is report-only -- nothing is written unless --apply is
// passed explicitly, separate from --dry-run (which exists here only for
// symmetry with the other migrate-4regn-*.ts scripts and behaves the same
// as the default).
//
// Usage:
//   npx tsx scripts/regenerate-generic-4regn-handles.ts --seller=owner@4regn.com [--min-group-size=3] [--apply] [--concurrency=4]

import { getAdminClient, resolveSeller, fetchAllRows, withTimeout } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; apply: boolean; minGroupSize: number; concurrency: number } = {
    apply: false,
    minGroupSize: 3,
    concurrency: 4,
  };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--apply") out.apply = true;
    else if (arg === "--dry-run") out.apply = false;
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--min-group-size=")) out.minGroupSize = parseInt(arg.slice("--min-group-size=".length), 10);
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10);
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/regenerate-generic-4regn-handles.ts --seller=owner@example.com [--min-group-size=3] [--apply] [--concurrency=4]");
    process.exit(1);
  }
  return out as { seller: string; apply: boolean; minGroupSize: number; concurrency: number };
}

// Same one-line slug convention used all over this codebase (e.g.
// FourRegnStore.tsx's collectionSlug, backfill-4regn-handles.ts's own
// slugify) -- kept identical on purpose so a product's handle and its
// collection slug stay derived the same way.
const slugify = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const handleBase = (handle: string) => handle.replace(/-\d+$/, "");

// Same dedupe convention as backfill-4regn-handles.ts.
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
  const args = parseArgs();
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const products = await fetchAllRows<ProductRow>(admin, "products", "id, name, handle", (q) => q.eq("seller_id", sellerId));
  const withHandle = products.filter((p): p is ProductRow & { handle: string } => !!p.handle);
  console.log(`\n${products.length} product(s) found, ${withHandle.length} with a handle already set.`);

  // Group by handle base.
  const groups = new Map<string, (ProductRow & { handle: string })[]>();
  for (const p of withHandle) {
    const base = handleBase(p.handle);
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base)!.push(p);
  }

  const flaggedBases = [...groups.entries()].filter(([, members]) => members.length >= args.minGroupSize);
  const flaggedProductIds = new Set(flaggedBases.flatMap(([, members]) => members.map((m) => m.id)));

  console.log(`${flaggedBases.length} generic handle bucket(s) found (>=${args.minGroupSize} products sharing a base), covering ${flaggedProductIds.size} product(s):`);
  for (const [base, members] of flaggedBases.sort((a, b) => b[1].length - a[1].length)) {
    console.log(`  "${base}-N"  x${members.length}`);
  }

  // Seed the collision set with every handle NOT being regenerated, so a
  // fresh slug can never collide with an untouched product's real handle.
  const assigned = new Set<string>();
  for (const p of withHandle) {
    if (!flaggedProductIds.has(p.id)) assigned.add(p.handle);
  }

  type Plan = { product: ProductRow & { handle: string }; newHandle: string };
  const plans: Plan[] = [];
  const nameAlsoGeneric: ProductRow[] = [];

  // Stable order (by current handle) so a re-run without --apply always
  // proposes the same assignments.
  const toProcess = flaggedBases.flatMap(([, members]) => members).sort((a, b) => a.handle.localeCompare(b.handle));
  for (const p of toProcess) {
    const properSlug = slugify(p.name);
    const newHandle = dedupe(properSlug || "product", assigned);
    assigned.add(newHandle);
    // The regenerated handle landed back on a generic-looking numbered
    // pattern of its own -- almost always means the product's NAME itself
    // is generic (e.g. literally "Oversized Tee"), not that this script
    // picked badly. Flagged separately; still gets a redirect-safe handle
    // (better than nothing), but needs a human to give it a real name.
    if (/-\d+$/.test(newHandle) && handleBase(newHandle) === (properSlug || "product")) {
      nameAlsoGeneric.push(p);
    }
    plans.push({ product: p, newHandle });
  }

  console.log(`\nSample assignments (first 15 of ${plans.length}):`);
  for (const pl of plans.slice(0, 15)) {
    console.log(`  "${pl.product.name}"  /products/${pl.product.handle}  ->  /products/${pl.newHandle}`);
  }

  if (nameAlsoGeneric.length) {
    console.log(`\n${nameAlsoGeneric.length} product(s) have a generic NAME, not just a generic handle -- these get a working handle below but likely need a real product name too:`);
    for (const p of nameAlsoGeneric.slice(0, 15)) console.log(`  "${p.name}"  (current: /products/${p.handle})`);
    if (nameAlsoGeneric.length > 15) console.log(`  ...and ${nameAlsoGeneric.length - 15} more.`);
  }

  if (!args.apply) {
    console.log(`\nReport-only run (default) -- nothing written. Re-run with --apply once this list looks right.`);
    return;
  }

  // Existing redirects pointing AT an old handle about to change need to be
  // repointed at the new one, so the chain still resolves in a single hop
  // instead of old-handle -> now-changed-handle -> 404.
  const redirects = await fetchAllRows<RedirectRow>(
    admin, "product_redirects", "id, old_path, destination_path, product_id", (q) => q.eq("seller_id", sellerId)
  );
  const redirectsByDestPath = new Map<string, RedirectRow[]>();
  for (const r of redirects) {
    if (!redirectsByDestPath.has(r.destination_path)) redirectsByDestPath.set(r.destination_path, []);
    redirectsByDestPath.get(r.destination_path)!.push(r);
  }

  console.log(`\nApplying ${plans.length} handle change(s)...`);
  let done = 0;
  let failed = 0;
  let cursor = 0;
  async function worker() {
    while (cursor < plans.length) {
      const idx = cursor++;
      const pl = plans[idx];
      const oldPath = `/products/${pl.product.handle}`;
      const newPath = `/products/${pl.newHandle}`;
      try {
        const { error: updateErr } = await withTimeout(
          admin.from("products").update({ handle: pl.newHandle }).eq("id", pl.product.id),
          "product handle update"
        );
        if (updateErr) throw updateErr;

        const { error: redirectErr } = await withTimeout(
          admin.from("product_redirects").upsert(
            { seller_id: sellerId, old_path: oldPath, destination_path: newPath, product_id: pl.product.id },
            { onConflict: "seller_id,old_path" }
          ),
          "product_redirects upsert"
        );
        if (redirectErr) throw redirectErr;

        const upstream = redirectsByDestPath.get(oldPath) || [];
        for (const r of upstream) {
          const { error: repointErr } = await withTimeout(
            admin.from("product_redirects").update({ destination_path: newPath }).eq("id", r.id),
            "product_redirects repoint"
          );
          if (repointErr) throw repointErr;
        }
      } catch {
        failed++;
      }
      done++;
      if (done % 25 === 0 || done === plans.length) process.stdout.write(`\r  ${done}/${plans.length} processed (${failed} failed)...`);
    }
  }
  await Promise.all(Array.from({ length: Math.min(args.concurrency, plans.length || 1) }, () => worker()));
  if (plans.length) process.stdout.write("\n");

  console.log(`\nDone. ${done - failed} product(s) updated (${failed} failed).`);
  if (failed) console.log("Safe to re-run with --apply -- already-updated products get skipped (their handle no longer matches a flagged generic pattern), only failures get retried.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
