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

import { getAdminClient, parseArgs, resolveSeller, readCsv, parseCsvLine, makeCol, stripHtml } from "./lib/migrate-shared";

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
  const metafieldHeaders = header.filter((h) => h.startsWith("metafield"));
  if (metafieldHeaders.length) {
    console.log(`Found ${metafieldHeaders.length} metafield column(s): ${metafieldHeaders.join(", ")}`);
  } else {
    console.log("No metafield columns found in this export (only present if it was exported with Shopify's 'add metafield columns' option) -- metafields will be empty.");
  }

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
      if (value) metafields[mh] = value;
    }

    const source_url = args.sourceDomain ? `${args.sourceDomain}/products/${handle}` : null;

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

  const productCap = seller.subscription_status === "free" ? 15 : 100;
  const finalCount = existingCount + rows.length;
  console.log(`\nParsed ${rows.length} product(s) from ${handleMap.size} handle group(s), ${errors} skipped for missing title/price.`);
  console.log(`Seller currently has ${existingCount} product(s); this run would bring it to ${finalCount} (plan cap: ${productCap}).`);
  if (priceDeltaWarnings.length) {
    console.log(`\n${priceDeltaWarnings.length} product(s) need manual price review after import:`);
    for (const w of priceDeltaWarnings) console.log(`  - ${w}`);
  }

  if (finalCount > productCap && !args.force) {
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

  const { data: inserted, error: insertErr } = await admin.from("products").insert(rows).select();
  if (insertErr || !inserted) {
    console.error("Product insert failed:", insertErr?.message);
    process.exit(1);
  }
  console.log(`\nInserted ${inserted.length} product(s).`);

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
      const resp = await fetch(task.url);
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

  const CONCURRENCY = 10;
  let cursor = 0;
  async function worker() {
    while (cursor < allTasks.length) {
      const idx = cursor++;
      await runTask(allTasks[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, allTasks.length) }, () => worker()));

  const byProduct = new Map<number, { imgIdx: number; publicUrl: string }[]>();
  for (const r of results) {
    if (!byProduct.has(r.productIdx)) byProduct.set(r.productIdx, []);
    byProduct.get(r.productIdx)!.push(r);
  }
  await Promise.all(
    Array.from(byProduct.entries()).map(async ([pIdx, imgs]) => {
      imgs.sort((a, b) => a.imgIdx - b.imgIdx);
      const urls = imgs.map((m) => m.publicUrl);
      await admin.from("products").update({ image_url: urls[0], images: urls }).eq("id", inserted[pIdx].id);
    })
  );
  console.log(`Images: ${imagesUploaded} uploaded, ${imagesFailed} failed.`);

  const redirectRows = inserted.map((product, i) => ({
    seller_id: sellerId,
    old_path: `/products/${allHandles[i]}`,
    destination_path: `/p/${product.id}`,
    product_id: product.id,
  }));
  const { error: redirectErr } = await admin.from("product_redirects").upsert(redirectRows, { onConflict: "seller_id,old_path" });
  if (redirectErr) {
    console.error(`Redirect rows failed to write (products are still imported fine): ${redirectErr.message}`);
  } else {
    console.log(`Redirects: ${redirectRows.length} old Shopify URL(s) mapped to their new /p/{uuid} pages.`);
  }

  console.log("\nDone. Remember: SKU/stock-level data isn't captured by this import (no such columns exist yet) -- do a manual stock pass in the dashboard before going live.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
