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
// Every variant photo came from the exact same "Image Src" CSV column
// migrate-4regn.ts already read to build each product's images[] gallery
// (collectImageSrcs, in lib/migrate-shared.ts) -- so in the common case
// the variant's raw Shopify URL is ALREADY sitting in this project's
// Storage under a different array position, just never recorded which
// raw URL became which. This recomputes that same deduped, ordered list
// from the CSV and -- only when its length still matches the product's
// current images[] length (i.e. nothing was pruned by
// clear-4regn-broken-images.ts since import) -- matches positionally to
// reuse the ALREADY-mirrored Storage URL directly, at zero extra Storage
// cost and zero network fetch. Only a genuine miss (length mismatch, or
// the URL isn't in that list at all) falls back to actually fetching and
// uploading a new copy, same as before.
//
// Usage:
//   npx tsx scripts/mirror-4regn-variant-images.ts --csv=products_export_1.csv --seller=owner@4regn.com [--dry-run] [--concurrency=8]

import { getAdminClient, fetchAllRows, readCsv, parseCsvLine, makeCol, collectImageSrcs } from "./lib/migrate-shared";

function parseArgs() {
  const out: { csv?: string; seller?: string; dryRun: boolean; concurrency: number } = { dryRun: false, concurrency: 8 };
  for (const arg of process.argv.slice(2)) {
    if (arg.startsWith("--csv=")) out.csv = arg.slice("--csv=".length);
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg === "--dry-run") out.dryRun = true;
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10) || 8;
  }
  if (!out.csv || !out.seller) {
    console.error("Usage: npx tsx scripts/mirror-4regn-variant-images.ts --csv=products_export_1.csv --seller=owner@4regn.com [--dry-run] [--concurrency=8]");
    process.exit(1);
  }
  return out as { csv: string; seller: string; dryRun: boolean; concurrency: number };
}

type ProductVariant = { name: string; options: string[]; priceDelta?: Record<string, number>; images?: Record<string, string> };
type ProductRow = { id: string; name: string; handle: string | null; images: string[] | null; variants: ProductVariant[] | null };

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

  const { lines, header } = readCsv(args.csv);
  const col = makeCol(header);
  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  const products = await fetchAllRows<ProductRow>(admin, "products", "id, name, handle, images, variants", (q) => q.eq("seller_id", sellerId));
  const productsWithVariants = products.filter((p) => Array.isArray(p.variants) && p.variants.length > 0);

  type Task = { productIdx: number; variantIdx: number; value: string; url: string };
  const freeResolved = new Map<string, string>(); // raw url -> already-mirrored Storage url, no fetch needed
  const tasks: Task[] = []; // genuinely needs a real fetch+upload

  for (let pi = 0; pi < productsWithVariants.length; pi++) {
    const product = productsWithVariants[pi];
    const variants = product.variants || [];

    // Reconstruct the raw-url -> already-mirrored-url mapping for this
    // product, if its current images[] still has the same length as what
    // the CSV's own dedup would produce (i.e. positionally unchanged
    // since import).
    let rawToExisting: Map<string, string> | null = null;
    const csvRows = product.handle ? handleMap.get(product.handle) : undefined;
    if (csvRows && Array.isArray(product.images)) {
      const imageSrcs = collectImageSrcs(csvRows, col);
      if (imageSrcs.length === product.images.length) {
        rawToExisting = new Map(imageSrcs.map((url, i) => [url, product.images![i]]));
      }
    }

    for (let vi = 0; vi < variants.length; vi++) {
      const images = variants[vi].images;
      if (!images) continue;
      for (const [value, url] of Object.entries(images)) {
        if (!needsMirroring(url)) continue;
        const existing = rawToExisting?.get(url);
        if (existing) freeResolved.set(url, existing);
        else tasks.push({ productIdx: pi, variantIdx: vi, value, url });
      }
    }
  }

  console.log(`${freeResolved.size + tasks.length} variant image(s) across ${productsWithVariants.length} product(s) still point at cdn.shopify.com.`);
  console.log(`  ${freeResolved.size} already exist in this project's Storage (reused, zero new upload) -- e.g. the same photo appears in the product's own gallery.`);
  console.log(`  ${tasks.length} are genuinely new and need fetching + uploading.`);

  if (args.dryRun) {
    if (tasks.length) {
      console.log("\nStill-needed examples:");
      for (const t of tasks.slice(0, 10)) console.log(`  ${productsWithVariants[t.productIdx].name} -- ${t.value}: ${t.url}`);
      if (tasks.length > 10) console.log(`  ...and ${tasks.length - 10} more`);

      const distinctUrls = Array.from(new Set(tasks.map((t) => t.url)));
      console.log(`\nEstimating size of ${distinctUrls.length} distinct image(s) that would actually be uploaded (HEAD requests only, nothing downloaded)...`);
      let totalBytes = 0, known = 0, unknown = 0;
      let cursor = 0;
      async function sizeWorker() {
        while (cursor < distinctUrls.length) {
          const url = distinctUrls[cursor++];
          try {
            const resp = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(10000) });
            const len = resp.ok ? Number(resp.headers.get("content-length")) : NaN;
            if (Number.isFinite(len) && len > 0) { totalBytes += len; known++; } else unknown++;
          } catch {
            unknown++;
          }
        }
      }
      await Promise.all(Array.from({ length: args.concurrency }, sizeWorker));
      const mb = totalBytes / (1024 * 1024);
      console.log(`Estimated NEW storage: ~${mb.toFixed(1)} MB across ${known} image(s) with a known size` + (unknown ? ` (${unknown} didn't report a size -- likely similar, not counted above)` : "") + ".");
    }
    console.log("\nDry run -- re-run without --dry-run to write the free reuses and mirror whatever's still genuinely new.");
    return;
  }

  const mimeToExt: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  const resolvedByUrl = new Map<string, string>(freeResolved);
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

  if (tasks.length) {
    console.log(`\nMirroring ${tasks.length} genuinely new image(s) (${args.concurrency} at a time -- tune with --concurrency=N)...`);
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
    console.log(`Mirrored ${resolvedByUrl.size - freeResolved.size} new distinct image(s), ${failedUrls.size} failed after retries.`);
  }

  console.log("\nWriting updated variants back to each product...");
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
