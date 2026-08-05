// One-off catalog migration: imports a Shopify product-export CSV directly
// via the Supabase service-role key, bypassing the web dashboard's CSV
// importer (app/api/csv-import/route.ts) entirely -- that route enforces
// a per-plan product cap (free: 15, paid: 100) and runs through a browser
// upload, both of which are the wrong shape for a one-time bulk migration
// that may need to move more than 100 products in one run.
//
// This intentionally forks (rather than imports) the CSV-parsing/grouping
// logic from app/api/csv-import/route.ts instead of extracting a shared
// lib: this script is meant to be run once for the 4regn migration and
// then retired, so coupling the live web route to a file whose only other
// caller gets deleted after use isn't worth the abstraction.
//
// Usage:
//   npx tsx scripts/migrate-4regn.ts --csv=path/to/export.csv --seller=owner@4regn.com [--dry-run] [--force] [--limit=20]
//
// Requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the
// environment (or a .env.local file in the repo root -- loaded manually
// below since this runs outside Next's own env-loading).

import { createClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// ---------------------------------------------------------------------------
// .env.local loader (Next loads this automatically for `next dev`/`next
// build`; a bare `tsx` script does not, and this repo has no `dotenv`
// dependency to reach for instead) -- minimal KEY=VALUE parser, real env
// vars already set always win.
// ---------------------------------------------------------------------------
function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
type Args = { csv: string; seller: string; dryRun: boolean; force: boolean; limit: number | null };

function parseArgs(): Args {
  const out: Partial<Args> = { dryRun: false, force: false, limit: null };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg.startsWith("--csv=")) out.csv = arg.slice("--csv=".length);
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--limit=")) out.limit = parseInt(arg.slice("--limit=".length), 10);
  }
  if (!out.csv || !out.seller) {
    console.error(
      "Usage: npx tsx scripts/migrate-4regn.ts --csv=path/to/export.csv --seller=owner@example.com [--dry-run] [--force] [--limit=20]"
    );
    process.exit(1);
  }
  return out as Args;
}

// ---------------------------------------------------------------------------
// CSV parsing -- forked verbatim from app/api/csv-import/route.ts
// ---------------------------------------------------------------------------
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

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
  sort_order: number;
};

async function main() {
  const args = parseArgs();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in the environment or .env.local).");
    process.exit(1);
  }
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const csvPath = resolve(process.cwd(), args.csv);
  if (!existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }

  // Resolve the seller by email or id.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(args.seller);
  const { data: seller, error: sellerErr } = await admin
    .from("sellers")
    .select("id, email, subdomain, subscription_status")
    .eq(isUuid ? "id" : "email", args.seller)
    .maybeSingle();
  if (sellerErr || !seller) {
    console.error(`Could not find a seller matching "${args.seller}": ${sellerErr?.message || "no matching row"}`);
    process.exit(1);
  }
  console.log(`Seller: ${seller.email} (${seller.subdomain}), plan status: ${seller.subscription_status}`);
  const sellerId = seller.id; // narrowed once here -- `seller` itself doesn't narrow inside the closures below

  const text = readFileSync(csvPath, "utf8");
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) {
    console.error("CSV must have a header row and at least one product.");
    process.exit(1);
  }

  const rawHeader = parseCsvLine(lines[0]);
  const header = rawHeader.map((h) => h.toLowerCase().replace(/"/g, "").trim());
  const isShopify = header.includes("handle") && header.includes("variant price");

  // Deliberately not a silent fallback to the generic name+price importer:
  // that path would drop images, variants, and handles (so no redirect
  // seeding either) -- an unacceptable silent downgrade for a real
  // migration. If 4regn's export isn't Shopify-shaped, this needs a new
  // column-mapping branch added here, not a guess.
  if (!isShopify) {
    console.error(
      "This CSV doesn't look like a Shopify product export (expected 'Handle' and 'Variant Price' columns). " +
        `Found columns: ${header.join(", ")}\n` +
        "If 4regn's export is from a different platform, this script needs a new column-mapping branch -- don't run it against an unrecognized format."
    );
    process.exit(1);
  }

  const col = (row: string[], name: string) => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx] || "").trim() : "";
  };

  const handleMap = new Map<string, string[][]>();
  for (let i = 1; i < lines.length; i++) {
    const cols = parseCsvLine(lines[i]);
    const handle = col(cols, "handle");
    if (!handle) continue;
    if (!handleMap.has(handle)) handleMap.set(handle, []);
    handleMap.get(handle)!.push(cols);
  }

  const { count: existingCountRaw } = await admin
    .from("products")
    .select("*", { count: "exact", head: true })
    .eq("seller_id", sellerId);
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
      // varies on exactly one option (e.g. Size alone) -- for a true
      // multi-dimensional combo (Size x Color where price varies per exact
      // pair) attaching the delta to a single option value would be a
      // lossy approximation, so those are flagged for manual review
      // instead of silently mispriced.
      const singleDimension = optionNamesInUse.length === 1;
      for (const [name, opts] of optionNamesInUse) {
        variants.push({ name, options: Array.from(opts) });
      }
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
        `Either upgrade the seller's plan first, or re-run with --force to import anyway (the web dashboard's own cap enforcement is bypassed by this script on purpose, so --force is a deliberate choice, not an accident).`
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

  // Image download + re-upload, same bucket/path convention as
  // app/api/csv-import/route.ts so nothing downstream needs to special-case
  // migrated products.
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

  // Seed product_redirects so /products/{handle} 308s to /p/{uuid} once
  // 4regn.com is pointed at this platform -- see the product_redirects
  // migration and middleware.ts.
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
