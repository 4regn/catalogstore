// backfill-4regn-variant-images.ts stored the RAW Shopify CDN "Image Src"
// URL straight from the CSV into products.variants[].images -- unlike
// every other product photo, which migrate-4regn.ts fetches and re-
// uploads into this project's own Supabase Storage (product-images
// bucket) before ever touching the DB. That's the actual reason variant
// photos loaded slowly / hung on the storefront: they were the only
// images in the whole catalog still being fetched live from
// cdn.shopify.com on every page view, with no CDN caching or
// optimization, instead of this project's own already-fast Storage URLs.
//
// This mirrors every variant image the same way the main import does:
// fetch (20s timeout, a couple of retries), upload to the SAME
// product-images bucket, and rewrite variants[].images to the new
// Storage URL. Idempotent -- an image whose URL already points at this
// project's Storage (not cdn.shopify.com) is left alone, so re-running
// this after a partial failure only retries what's still raw.
//
// Usage:
//   npx tsx scripts/mirror-4regn-variant-images.ts --seller=owner@4regn.com [--dry-run] [--concurrency=8]

import { getAdminClient, fetchAllRows } from "./lib/migrate-shared";

function parseArgs() {
  const out: { seller?: string; dryRun: boolean; concurrency: number } = { dryRun: false, concurrency: 8 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10) || 8;
  }
  if (!out.seller) {
    console.error("Usage: npx tsx scripts/mirror-4regn-variant-images.ts --seller=owner@4regn.com [--dry-run] [--concurrency=8]");
    process.exit(1);
  }
  return out as { seller: string; dryRun: boolean; concurrency: number };
}

type ProductVariant = { name: string; options: string[]; priceDelta?: Record<string, number>; images?: Record<string, string> };
type ProductRow = { id: string; name: string; variants: ProductVariant[] | null };

function needsMirroring(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith("cdn.shopify.com");
  } catch {
    return false;
  }
}

async function main() {
  const args = parseArgs();
  const admin = getAdminClient();

  const { data: seller, error: sellerErr } = await admin.from("sellers").select("id, email, subdomain").eq("email", args.seller).maybeSingle();
  if (sellerErr || !seller) {
    console.error(`Could not find a seller matching "${args.seller}": ${sellerErr?.message || "no matching row"}`);
    process.exit(1);
  }
  console.log(`Seller: ${seller.email} (${seller.subdomain})`);
  const sellerId = seller.id;

  const products = await fetchAllRows<ProductRow>(admin, "products", "id, name, variants", (q) => q.eq("seller_id", sellerId));

  type Task = { productIdx: number; variantIdx: number; value: string; url: string };
  const tasks: Task[] = [];
  const productsWithVariants = products.filter((p) => Array.isArray(p.variants) && p.variants.length > 0);

  for (let pi = 0; pi < productsWithVariants.length; pi++) {
    const variants = productsWithVariants[pi].variants || [];
    for (let vi = 0; vi < variants.length; vi++) {
      const images = variants[vi].images;
      if (!images) continue;
      for (const [value, url] of Object.entries(images)) {
        if (needsMirroring(url)) tasks.push({ productIdx: pi, variantIdx: vi, value, url });
      }
    }
  }

  console.log(`${tasks.length} variant image(s) across ${productsWithVariants.length} product(s) still point at cdn.shopify.com and need mirroring.`);
  if (!tasks.length) return;

  if (args.dryRun) {
    console.log("\nDry run -- re-run without --dry-run to actually fetch and mirror these.");
    for (const t of tasks.slice(0, 10)) console.log(`  ${productsWithVariants[t.productIdx].name} -- ${t.value}: ${t.url}`);
    if (tasks.length > 10) console.log(`  ...and ${tasks.length - 10} more`);
    return;
  }

  const mimeToExt: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  // Same URL can legitimately appear more than once (e.g. reused across
  // sibling products, or across dimensions on the same product) -- fetch
  // and upload each distinct URL only once, then fan the resulting
  // Storage URL back out to every task that shared it.
  const resolvedByUrl = new Map<string, string>();
  const IMAGE_RETRY_DELAYS_MS = [1000, 3000];

  async function mirrorOnce(task: Task): Promise<string | null> {
    const resp = await fetch(task.url, { signal: AbortSignal.timeout(20000) });
    if (!resp.ok) return null;
    const buffer = await resp.arrayBuffer();
    const contentType = resp.headers.get("content-type") || "image/jpeg";
    const ext = mimeToExt[contentType] || "jpg";
    const safeValue = task.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "variant";
    const path = `${sellerId}/${productsWithVariants[task.productIdx].id}/variant-${safeValue}-${task.variantIdx}.${ext}`;
    const { error: upErr } = await admin.storage.from("product-images").upload(path, Buffer.from(buffer), { contentType, upsert: true });
    if (upErr) return null;
    const { data: urlData } = admin.storage.from("product-images").getPublicUrl(path);
    return urlData.publicUrl;
  }

  async function mirrorWithRetry(task: Task): Promise<void> {
    if (resolvedByUrl.has(task.url)) return;
    for (let attempt = 0; attempt <= IMAGE_RETRY_DELAYS_MS.length; attempt++) {
      try {
        const publicUrl = await mirrorOnce(task);
        if (publicUrl) { resolvedByUrl.set(task.url, publicUrl); return; }
      } catch {
        // fall through to retry/failure below
      }
      if (attempt < IMAGE_RETRY_DELAYS_MS.length) await new Promise((r) => setTimeout(r, IMAGE_RETRY_DELAYS_MS[attempt]));
    }
  }

  console.log(`Mirroring (${args.concurrency} at a time -- tune with --concurrency=N)...`);
  let cursor = 0, done = 0;
  async function worker() {
    while (cursor < tasks.length) {
      const idx = cursor++;
      await mirrorWithRetry(tasks[idx]);
      done++;
      if (done % 50 === 0 || done === tasks.length) console.log(`  ${done}/${tasks.length}`);
    }
  }
  await Promise.all(Array.from({ length: args.concurrency }, worker));

  const failedUrls = new Set(tasks.map((t) => t.url).filter((u) => !resolvedByUrl.has(u)));
  console.log(`\nMirrored ${resolvedByUrl.size} distinct image(s), ${failedUrls.size} failed after retries.`);

  console.log("Writing updated variants back to each product...");
  let updated = 0;
  for (let pi = 0; pi < productsWithVariants.length; pi++) {
    const variants = productsWithVariants[pi].variants || [];
    let changed = false;
    const newVariants = variants.map((v) => {
      if (!v.images) return v;
      const newImages: Record<string, string> = {};
      let variantChanged = false;
      for (const [value, url] of Object.entries(v.images)) {
        const resolved = resolvedByUrl.get(url);
        if (resolved) { newImages[value] = resolved; variantChanged = true; }
        else newImages[value] = url; // left as-is: already mirrored, or failed and kept as a working (if slow) fallback
      }
      if (variantChanged) changed = true;
      return variantChanged ? { ...v, images: newImages } : v;
    });
    if (!changed) continue;
    const { error } = await admin.from("products").update({ variants: newVariants }).eq("id", productsWithVariants[pi].id);
    if (error) { console.error(`Failed to update "${productsWithVariants[pi].name}":`, error.message); continue; }
    updated++;
  }
  console.log(`Done -- updated ${updated} product(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
