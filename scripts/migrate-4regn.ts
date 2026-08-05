// One-off catalog migration: imports a Shopify product-export CSV directly
// via the Supabase service-role key, bypassing the web dashboard's CSV
// importer (app/api/csv-import/route.ts) entirely -- that route enforces
// a per-plan product cap (free: 15, paid: 100) and runs through a browser
// upload, both of which are the wrong shape for a one-time bulk migration.
//
// Captures tags and metafields too, on top of what the web importer does:
// - Tags: Shopify's plain "Tags" column (comma-separated).
// - Metafields: only present if the export was generated with Shopify's
//   "add metafield columns" option -- those columns are typically named
//   like `Metafield: custom.material [single_line_text_field]`. Any
//   header starting with "metafield" is captured generically into the
//   product's metafields jsonb column; if the export has none, this is
//   just a no-op, not an error.
// - source_url: reconstructed from --source-domain + the product's handle
//   (e.g. https://4regn.com/products/blue-hoodie), stored on the product
//   row itself as data provenance -- separate from product_redirects,
//   which exists to redirect actual visitor *traffic*, not just record
//   where the data came from.
//
// Usage:
//   npx tsx scripts/migrate-4regn.ts --csv=products.csv --seller=owner@4regn.com --source-domain=https://4regn.com [--dry-run] [--force] [--limit=20]

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, stripHtml, insertInBatchesReturning, writeInBatches, withTimeout } from "./lib/migrate-shared";

type ProductRow = {
  seller_id: string;
  name: string;
  price: number;
  old_price: number | null;
  category: string | null;
  description: string;
  in_stock: boolean;
  status: string;
  variants: { name: string; options: string[]; priceDelta?: Record<string, number> }[];
  tags: string[];
  metafields: Record<string, string>;
  source_url: string | null;
  sort_order: number;
};

async function main() {
  const args = parseArgs(
    "Usage: npx tsx scripts/migrate-4regn.ts --csv=products.csv --seller=owner@example.com --source-domain=https://4regn.com [--dry-run] [--force] [--limit=20]"
  );
  const admin = getAdminClient();
  const seller = await resolveSeller(admin, args.seller);
  const sellerId = seller.id;

  const { lines, header } = readCsv(args.csv);
  const isShopify = header.includes("handle") && header.includes("variant price");
  // Deliberately not a silent fallback to a generic name+price importer:
  // that path would drop images, variants, tags, and handles (so no
  // redirect seeding either) -- an unacceptable silent downgrade for a
  // real migration. If 4regn's export isn't Shopify-shaped, this needs a
  // new column-mapping branch added here, not a guess.
  if (!isShopify) {
    console.error(
      "This CSV doesn't look like a Shopify product export (expected 'Handle' and 'Variant Price' columns). " +
        `Found columns: ${header.join(", ")}\n` +
        "If 4regn's export is from a different platform, this script needs a new column-mapping branch -- don't run it against an unrecognized format."
    );
    process.exit(1);
  }
  const col = makeCol(header);
  // Two Shopify export header shapes carry metafields:
  //   older:  "metafield: custom.material [single_line_text_field]"
  //   newer:  "material (product.metafields.custom.material)"
  // Both are matched here rather than just the older `startsWith("metafield")`
  // check -- the newer shape is what Shopify's current product-export
  // actually produces, and silently matching zero columns on a real export
  // is a much worse failure than a slightly messier key.
  const metafieldHeaders = header.filter((h) => h.startsWith("metafield") || /\(product\.metafields\.[a-z0-9_]+\.[a-z0-9_-]+\)/.test(h));
  if (metafieldHeaders.length) {
    console.log(`Found ${metafieldHeaders.length} metafield column(s): ${metafieldHeaders.join(", ")}`);
  } else {
    console.log("No metafield columns found in this export (only present if it was exported with Shopify's 'add metafield columns' option) -- metafields will be empty.");
  }
  // Reduces a verbose header down to just the "namespace.key" Shopify uses
  // internally, e.g. "material (product.metafields.custom.material)" ->
  // "custom.material" -- much more useful as a jsonb key than the raw label.
  const metafieldKey = (h: string): string => {
    const newShape = h.match(/\(product\.metafields\.([a-z0-9_]+\.[a-z0-9_-]+)\)/);
    if (newShape) return newShape[1];
    return h.replace(/^metafield:\s*/, "").replace(/\s*\[[^\]]+\]$/, "").trim();
  };
  const sourceUrlHeader = header.find((h) => /\(product\.metafields\.[a-z0-9_]+\.product_upload_source_url\)/.test(h) || h === "product upload source url");

  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  const { count: existingCountRaw } = await admin.from("products").select("*", { count: "exact", head: true }).eq("seller_id", sellerId);
  const existingCount = existingCountRaw || 0;

  let errors = 0;
  const rows: ProductRow[] = [];
  const allImageSrcs: string[][] = [];
  const allHandles: string[] = [];
  const priceDeltaWarnings: string[] = [];

  for (const [handle, variantRows] of handleMap) {
    if (args.limit && rows.length >= args.limit) break;

    const first = variantRows[0];
    const title = col(first, "title");
    if (!title) {
      errors++;
      continue;
    }

    const priceStr = col(first, "variant price");
    const price = parseFloat(priceStr);
    if (!Number.isFinite(price) || price < 0) {
      errors++;
      continue;
    }

    const compareStr = col(first, "variant compare at price");
    const comparePrice = parseFloat(compareStr);
    const old_price = Number.isFinite(comparePrice) && comparePrice > price ? comparePrice : null;

    const bodyHtml = col(first, "body (html)");
    const description = bodyHtml ? stripHtml(bodyHtml) : "";
    const category = col(first, "type") || col(first, "product category") || null;
    const statusRaw = col(first, "status").toLowerCase();
    const status = statusRaw === "draft" ? "draft" : "published";

    const tagsRaw = col(first, "tags");
    const tags = tagsRaw ? tagsRaw.split(",").map((t) => t.trim()).filter(Boolean) : [];

    const metafields: Record<string, string> = {};
    for (const mh of metafieldHeaders) {
      const value = col(first, mh);
      if (value) metafields[metafieldKey(mh)] = value;
    }

    // Prefer the real per-product URL if the export recorded one (a
    // "product_upload_source_url" metafield, seen on some catalogs) --
    // more accurate than reconstructing it from the handle, which breaks
    // for any product whose live URL doesn't follow the plain
    // /products/{handle} convention (e.g. it was renamed after publishing).
    const recordedSourceUrl = sourceUrlHeader ? col(first, sourceUrlHeader) : "";
    const source_url = recordedSourceUrl || (args.sourceDomain ? `${args.sourceDomain}/products/${handle}` : null);

    const imageSrcs: string[] = [];
    const seenUrls = new Set<string>();
    for (const vRow of variantRows) {
      const img = col(vRow, "image src");
      if (img && !seenUrls.has(img)) {
        seenUrls.add(img);
        imageSrcs.push(img);
      }
    }

    const opt1Name = col(first, "option1 name");
    const opt2Name = col(first, "option2 name");
    const opt3Name = col(first, "option3 name");
    const hasVariants = opt1Name && opt1Name.toLowerCase() !== "title";
    const variants: { name: string; options: string[]; priceDelta?: Record<string, number> }[] = [];

    if (hasVariants) {
      const optGroups: Record<string, Set<string>> = {};
      for (const vRow of variantRows) {
        if (opt1Name) {
          if (!optGroups[opt1Name]) optGroups[opt1Name] = new Set();
          const v = col(vRow, "option1 value");
          if (v) optGroups[opt1Name].add(v);
        }
        if (opt2Name) {
          if (!optGroups[opt2Name]) optGroups[opt2Name] = new Set();
          const v = col(vRow, "option2 value");
          if (v) optGroups[opt2Name].add(v);
        }
        if (opt3Name) {
          if (!optGroups[opt3Name]) optGroups[opt3Name] = new Set();
          const v = col(vRow, "option3 value");
          if (v) optGroups[opt3Name].add(v);
        }
      }
      const optionNamesInUse = Object.entries(optGroups).filter(([, opts]) => opts.size > 0);
      // Per-variant price only maps cleanly onto priceDelta when a product
      // varies on exactly one option (e.g. Size alone) -- a true
      // multi-dimensional combo (Size x Color where price varies per exact
      // pair) would be a lossy approximation if attached to a single
      // option value, so those are flagged for manual review instead of
      // silently mispriced.
      const singleDimension = optionNamesInUse.length === 1;
      for (const [name, opts] of optionNamesInUse) variants.push({ name, options: Array.from(opts) });
      if (singleDimension && variantRows.length > 1) {
        const [optName] = optionNamesInUse[0];
        const delta: Record<string, number> = {};
        let anyNonZero = false;
        for (const vRow of variantRows) {
          const optValue = col(vRow, "option1 name") === optName ? col(vRow, "option1 value") : col(vRow, "option2 name") === optName ? col(vRow, "option2 value") : col(vRow, "option3 value");
          const vPrice = parseFloat(col(vRow, "variant price"));
          if (optValue && Number.isFinite(vPrice)) {
            const d = Math.round((vPrice - price) * 100) / 100;
            delta[optValue] = d;
            if (d !== 0) anyNonZero = true;
          }
        }
        if (anyNonZero) variants[0].priceDelta = delta;
      } else if (optionNamesInUse.length > 1) {
        const perVariantPrices = new Set(variantRows.map((r) => col(r, "variant price")));
        if (perVariantPrices.size > 1) {
          priceDeltaWarnings.push(`"${title}" (${handle}) varies price across ${optionNamesInUse.length} options -- per-variant pricing needs manual review, imported at the base price only.`);
        }
      }
    }

    rows.push({
      seller_id: sellerId,
      name: title.slice(0, 200),
      price,
      old_price,
      category,
      description,
      in_stock: true,
      status,
      variants: hasVariants ? variants : [],
      tags,
      metafields,
      source_url,
      sort_order: existingCount + rows.length,
    });
    allImageSrcs.push(imageSrcs);
    allHandles.push(handle);
  }

  if (rows.length === 0) {
    console.error(`No valid products found in CSV (${errors} row(s) skipped for missing title/price).`);
    process.exit(1);
  }

  const productCap = seller.subscription_status === "free" ? 15 : Infinity;
  const finalCount = existingCount + rows.length;
  console.log(`\nParsed ${rows.length} product(s) from ${handleMap.size} handle group(s), ${errors} skipped for missing title/price.`);
  if (args.resumeImages) {
    console.log(`Seller currently has ${existingCount} product(s) (--resume-images: no new products will be inserted, only matched and re-processed for images/redirects).`);
  } else {
    console.log(`Seller currently has ${existingCount} product(s); this run would bring it to ${finalCount} (plan cap: ${productCap}).`);
  }
  if (priceDeltaWarnings.length) {
    console.log(`\n${priceDeltaWarnings.length} product(s) need manual price review after import:`);
    for (const w of priceDeltaWarnings) console.log(`  - ${w}`);
  }

  if (!args.resumeImages && finalCount > productCap && !args.force) {
    console.error(
      `\nThis would exceed the seller's plan cap of ${productCap} products. ` +
        `Either upgrade the seller's plan first, or re-run with --force to import anyway.`
    );
    process.exit(1);
  }

  if (args.dryRun) {
    console.log("\n--dry-run: no products were inserted, no images were uploaded, no redirects were written.");
    return;
  }

  // --resume-images skips inserting products entirely and instead looks up
  // already-inserted products by source_url -- for recovering from a run
  // that got through the product insert but hung or crashed during image
  // upload (the insert has no dedupe key, so blindly re-running the whole
  // script would duplicate every product). Redirects still get (re-)seeded
  // for every matched product regardless of image state, since a prior run
  // hanging during image upload means it never reached the redirect step
  // either.
  let inserted: any[];
  let redirectTargets: any[];
  let redirectHandles: string[];
  if (args.resumeImages) {
    console.log("\n--resume-images: skipping product insert, matching existing products by source_url instead...");
    const { data: existing, error: fetchErr } = await admin.from("products").select("id, source_url, images").eq("seller_id", sellerId);
    if (fetchErr) {
      console.error("Failed to fetch existing products:", fetchErr.message);
      process.exit(1);
    }
    const bySourceUrl = new Map((existing || []).filter((p) => p.source_url).map((p) => [p.source_url, p]));
    const matched: any[] = [];
    const matchedHandles: string[] = [];
    const needingImages: any[] = [];
    const needingImagesSrcs: string[][] = [];
    const needingImagesHandles: string[] = [];
    let notFound = 0;
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i].source_url ? bySourceUrl.get(rows[i].source_url!) : undefined;
      if (!p) {
        notFound++;
        continue;
      }
      matched.push(p);
      matchedHandles.push(allHandles[i]);
      if (!p.images || p.images.length === 0) {
        needingImages.push(p);
        needingImagesSrcs.push(allImageSrcs[i]);
        needingImagesHandles.push(allHandles[i]);
      }
    }
    console.log(`Matched ${matched.length} existing product(s) by source_url (${notFound} not found -- run the normal import first if this is unexpectedly high). ${needingImages.length} still need images.`);
    inserted = needingImages;
    redirectTargets = matched;
    redirectHandles = matchedHandles;
    allImageSrcs.length = 0;
    allImageSrcs.push(...needingImagesSrcs);
  } else {
    try {
      inserted = await insertInBatchesReturning(admin, "products", rows);
    } catch (e) {
      console.error(`\n${e instanceof Error ? e.message : String(e)}`);
      process.exit(1);
    }
    console.log(`\nInserted ${inserted.length} product(s).`);
    redirectTargets = inserted;
    redirectHandles = allHandles;
  }

  const mimeToExt: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
  let imagesUploaded = 0;
  let imagesFailed = 0;
  const results: { productIdx: number; imgIdx: number; publicUrl: string }[] = [];
  const allTasks: { productIdx: number; imgIdx: number; url: string }[] = [];
  for (let i = 0; i < inserted.length; i++) {
    const srcs = allImageSrcs[i];
    if (!srcs || srcs.length === 0) continue;
    for (let j = 0; j < srcs.length; j++) allTasks.push({ productIdx: i, imgIdx: j, url: srcs[j] });
  }

  async function runTask(task: { productIdx: number; imgIdx: number; url: string }) {
    try {
      // A stalled (not dropped) connection to the image host can otherwise
      // hang a worker forever -- confirmed in practice: a real run sat at
      // "Inserted 2023 product(s)" for over an hour with zero progress,
      // most likely one image request that opened a connection and never
      // responded. Node's fetch has no default timeout.
      const resp = await fetch(task.url, { signal: AbortSignal.timeout(20000) });
      if (!resp.ok) {
        imagesFailed++;
        return;
      }
      const buffer = await resp.arrayBuffer();
      const contentType = resp.headers.get("content-type") || "image/jpeg";
      const ext = mimeToExt[contentType] || "jpg";
      const path = `${sellerId}/${inserted![task.productIdx].id}/csv-${task.imgIdx}.${ext}`;
      const { error: upErr } = await admin.storage.from("product-images").upload(path, Buffer.from(buffer), { contentType, upsert: true });
      if (!upErr) {
        const { data: urlData } = admin.storage.from("product-images").getPublicUrl(path);
        results.push({ productIdx: task.productIdx, imgIdx: task.imgIdx, publicUrl: urlData.publicUrl });
        imagesUploaded++;
      } else {
        imagesFailed++;
      }
    } catch {
      imagesFailed++;
    }
  }

  console.log(`Uploading images for ${inserted.length} product(s) (${allTasks.length} image(s) total)...`);
  const CONCURRENCY = 10;
  let cursor = 0;
  let tasksDone = 0;
  async function worker() {
    while (cursor < allTasks.length) {
      const idx = cursor++;
      await runTask(allTasks[idx]);
      tasksDone++;
      if (tasksDone % 10 === 0 || tasksDone === allTasks.length) {
        process.stdout.write(`\r  images: ${tasksDone}/${allTasks.length} processed (${imagesUploaded} ok, ${imagesFailed} failed)...`);
      }
    }
  }
  // A separate heartbeat, independent of the per-10-task progress line above
  // -- with the 20s per-image timeout now in place, a genuinely stuck run
  // is no longer possible, but this makes "still alive, just slow" visibly
  // distinguishable from "actually frozen" without having to guess based on
  // how often the count happens to tick over.
  const heartbeatStart = Date.now();
  const heartbeat = allTasks.length
    ? setInterval(() => {
        const elapsed = Math.round((Date.now() - heartbeatStart) / 1000);
        process.stdout.write(`\n  ...still running (${elapsed}s elapsed, ${tasksDone}/${allTasks.length} images processed so far)\n`);
      }, 15000)
    : null;
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allTasks.length) }, () => worker()));
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
  if (allTasks.length) process.stdout.write("\n");

  const byProduct = new Map<number, { imgIdx: number; publicUrl: string }[]>();
  for (const r of results) {
    if (!byProduct.has(r.productIdx)) byProduct.set(r.productIdx, []);
    byProduct.get(r.productIdx)!.push(r);
  }
  const productEntries = Array.from(byProduct.entries());
  console.log(`Saving image URLs onto ${productEntries.length} product(s)...`);
  let updateFailures = 0;
  let updatesDone = 0;
  let updateCursor = 0;
  async function updateWorker() {
    while (updateCursor < productEntries.length) {
      const idx = updateCursor++;
      const [pIdx, imgs] = productEntries[idx];
      imgs.sort((a, b) => a.imgIdx - b.imgIdx);
      const urls = imgs.map((m) => m.publicUrl);
      try {
        const { error } = await withTimeout(admin.from("products").update({ image_url: urls[0], images: urls }).eq("id", inserted[pIdx].id), "product image URL save");
        if (error) updateFailures++;
      } catch {
        updateFailures++;
      }
      updatesDone++;
      if (updatesDone % 10 === 0 || updatesDone === productEntries.length) {
        process.stdout.write(`\r  image URLs saved: ${updatesDone}/${productEntries.length} (${updateFailures} failed)...`);
      }
    }
  }
  const updateHeartbeatStart = Date.now();
  const updateHeartbeat = productEntries.length
    ? setInterval(() => {
        const elapsed = Math.round((Date.now() - updateHeartbeatStart) / 1000);
        process.stdout.write(`\n  ...still running (${elapsed}s elapsed, ${updatesDone}/${productEntries.length} image URLs saved so far)\n`);
      }, 15000)
    : null;
  try {
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, productEntries.length) }, () => updateWorker()));
  } finally {
    if (updateHeartbeat) clearInterval(updateHeartbeat);
  }
  if (productEntries.length) process.stdout.write("\n");
  if (updateFailures) console.log(`${updateFailures} product(s) had their images uploaded but failed to save the image_url/images fields -- these products will show no photos until re-run or fixed manually.`);
  console.log(`Images: ${imagesUploaded} uploaded, ${imagesFailed} failed.`);

  const redirectRows = redirectTargets.map((product, i) => ({
    seller_id: sellerId,
    old_path: `/products/${redirectHandles[i]}`,
    destination_path: `/p/${product.id}`,
    product_id: product.id,
  }));
  let redirectsWritten = 0;
  let redirectErrMsg: string | null = null;
  try {
    redirectsWritten = await writeInBatches(admin, "product_redirects", redirectRows, { onConflict: "seller_id,old_path" });
  } catch (e) {
    redirectErrMsg = e instanceof Error ? e.message : String(e);
  }
  if (redirectErrMsg) {
    console.error(`Redirect rows failed to write (products are still imported fine): ${redirectErrMsg}`);
  } else {
    console.log(`Redirects: ${redirectsWritten} old Shopify URL(s) mapped to their new /p/{uuid} pages.`);
  }

  console.log("\nDone. Remember: SKU/stock-level data isn't captured by this import (no such columns exist yet) -- do a manual stock pass in the dashboard before going live.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
