import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdmin } from "../../../lib/supabase-admin";

export const maxDuration = 60;

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = ""; let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
      else { inQuote = !inQuote; }
    } else if (ch === ',' && !inQuote) {
      result.push(cur.trim()); cur = "";
    } else { cur += ch; }
  }
  result.push(cur.trim());
  return result;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 2000);
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const sellerId = formData.get("seller_id") as string | null;
    const accessToken = formData.get("access_token") as string | null;
    const existingCount = parseInt(formData.get("existing_count") as string || "0", 10);

    if (!file || !sellerId || !accessToken) {
      return NextResponse.json({ error: "Missing file, seller_id, or access_token" }, { status: 400 });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
    );

    const text = await file.text();
    const lines = text.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) {
      return NextResponse.json({ error: "CSV must have a header row and at least one product." }, { status: 400 });
    }

    const rawHeader = parseCsvLine(lines[0]);
    const header = rawHeader.map((h) => h.toLowerCase().replace(/"/g, "").trim());
    const isShopify = header.includes("handle") && header.includes("variant price");

    const col = (row: string[], name: string) => {
      const idx = header.indexOf(name);
      return idx >= 0 ? (row[idx] || "").trim() : "";
    };

    let errors = 0;
    const rows: any[] = [];
    const allImageSrcs: string[][] = [];
    // Shopify's product URL is always /products/{handle} -- captured here
    // purely so a migrating seller's redirect table (product_redirects)
    // can be populated for free off the same CSV they already have to
    // upload to import their catalog, instead of needing a second manual
    // step. Kept in lockstep with `rows`/`allImageSrcs` (including the
    // plan-cap truncation below) so index i always refers to the same
    // product across all three arrays.
    const allHandles: string[] = [];

    if (isShopify) {
      const handleMap = new Map<string, string[][]>();
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const handle = col(cols, "handle");
        if (!handle) continue;
        if (!handleMap.has(handle)) handleMap.set(handle, []);
        handleMap.get(handle)!.push(cols);
      }

      for (const [handle, variantRows] of handleMap) {
        const first = variantRows[0];
        const title = col(first, "title");
        if (!title) { errors++; continue; }

        const priceStr = col(first, "variant price");
        const price = parseFloat(priceStr);
        if (!Number.isFinite(price) || price < 0) { errors++; continue; }

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
          if (img && !seenUrls.has(img)) { seenUrls.add(img); imageSrcs.push(img); }
        }

        const opt1Name = col(first, "option1 name");
        const opt2Name = col(first, "option2 name");
        const opt3Name = col(first, "option3 name");
        const hasVariants = opt1Name && opt1Name.toLowerCase() !== "title";
        const variants: { name: string; options: string[] }[] = [];

        if (hasVariants) {
          const optGroups: { [key: string]: Set<string> } = {};
          for (const vRow of variantRows) {
            if (opt1Name) { if (!optGroups[opt1Name]) optGroups[opt1Name] = new Set(); const v = col(vRow, "option1 value"); if (v) optGroups[opt1Name].add(v); }
            if (opt2Name) { if (!optGroups[opt2Name]) optGroups[opt2Name] = new Set(); const v = col(vRow, "option2 value"); if (v) optGroups[opt2Name].add(v); }
            if (opt3Name) { if (!optGroups[opt3Name]) optGroups[opt3Name] = new Set(); const v = col(vRow, "option3 value"); if (v) optGroups[opt3Name].add(v); }
          }
          for (const [name, opts] of Object.entries(optGroups)) {
            if (opts.size > 0) variants.push({ name, options: Array.from(opts) });
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
    } else {
      const nameIdx = header.findIndex((h) => h === "name" || h === "product" || h === "product name");
      const priceIdx = header.findIndex((h) => h === "price" || h === "amount");
      const catIdx = header.findIndex((h) => h === "category" || h === "collection" || h === "type");
      const descIdx = header.findIndex((h) => h === "description" || h === "desc");
      const oldPriceIdx = header.findIndex((h) => h === "old price" || h === "old_price" || h === "original price" || h === "was");
      if (nameIdx < 0 || priceIdx < 0) {
        return NextResponse.json({ error: "CSV must have 'name' and 'price' columns. Found: " + header.join(", ") }, { status: 400 });
      }

      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const name = cols[nameIdx]; const price = parseFloat(cols[priceIdx]);
        if (!name || !Number.isFinite(price) || price < 0) { errors++; continue; }
        rows.push({
          seller_id: sellerId,
          name: name.slice(0, 200),
          price,
          old_price: oldPriceIdx >= 0 && cols[oldPriceIdx] ? (Number.isFinite(parseFloat(cols[oldPriceIdx])) ? parseFloat(cols[oldPriceIdx]) : null) : null,
          category: catIdx >= 0 ? (cols[catIdx] || null) : null,
          description: descIdx >= 0 ? (cols[descIdx] || "").slice(0, 2000) : "",
          in_stock: true,
          status: "published",
          variants: [],
          sort_order: existingCount + rows.length,
        });
        allImageSrcs.push([]);
        allHandles.push("");
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid products found in CSV.", errors }, { status: 400 });
    }

    /* Enforce the plan's product cap server-side — the dashboard button also
       checks this, but CSV import is a separate path and must not be able
       to bypass it. */
    const { data: sellerRow } = await supabase.from("sellers").select("subscription_status").eq("id", sellerId).maybeSingle();
    const productCap = sellerRow?.subscription_status === "free" ? 15 : Infinity;
    const remainingSlots = Math.max(0, productCap - existingCount);
    let skippedForPlanLimit = 0;
    if (rows.length > remainingSlots) {
      skippedForPlanLimit = rows.length - remainingSlots;
      rows.length = remainingSlots;
      allImageSrcs.length = remainingSlots;
      allHandles.length = remainingSlots;
    }
    if (rows.length === 0) {
      return NextResponse.json({ error: `You've reached your plan's limit of ${productCap} products.` }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await supabase.from("products").insert(rows).select();
    if (insertErr) {
      return NextResponse.json({ error: "Import failed: " + insertErr.message }, { status: 500 });
    }

    // Free redirect-mapping seed for a migrating seller: Shopify's product
    // URL is always /products/{handle}, and product_redirects is what
    // middleware.ts checks so those old URLs 308 to this product's real
    // /p/{uuid} page instead of 404ing once the seller's domain cuts over
    // here -- see the product_redirects migration for why this matters
    // (preserving Google rankings/backlinks through the migration).
    // product_redirects has no RLS policies (service-role only), unlike
    // `products` above, so this needs the admin client, not the
    // request-scoped one. Best-effort: a failure here shouldn't fail the
    // whole import, since the products themselves are already saved.
    if (inserted) {
      const redirectRows = inserted
        .map((product, i) => ({ handle: allHandles[i], product }))
        .filter((r) => r.handle)
        .map((r) => ({
          seller_id: sellerId,
          old_path: `/products/${r.handle}`,
          destination_path: `/p/${r.product.id}`,
          product_id: r.product.id,
        }));
      if (redirectRows.length) {
        try {
          await getAdmin().from("product_redirects").upsert(redirectRows, { onConflict: "seller_id,old_path" });
        } catch (redirectErr) {
          console.error("csv-import: product_redirects upsert failed (non-fatal):", redirectErr);
        }
      }
    }

    let imagesUploaded = 0;
    let imagesFailed = 0;

    if (inserted && isShopify) {
      const mimeToExt: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };

      const allTasks: { productIdx: number; imgIdx: number; url: string }[] = [];
      for (let i = 0; i < inserted.length; i++) {
        const srcs = allImageSrcs[i];
        if (!srcs || srcs.length === 0) continue;
        for (let j = 0; j < srcs.length; j++) {
          allTasks.push({ productIdx: i, imgIdx: j, url: srcs[j] });
        }
      }

      const results: { productIdx: number; imgIdx: number; publicUrl: string }[] = [];
      const CONCURRENCY = 10;
      let cursor = 0;

      async function runTask(task: { productIdx: number; imgIdx: number; url: string }) {
        try {
          const resp = await fetch(task.url);
          if (!resp.ok) { imagesFailed++; return; }
          const buffer = await resp.arrayBuffer();
          const contentType = resp.headers.get("content-type") || "image/jpeg";
          const ext = mimeToExt[contentType] || "jpg";
          const path = `${sellerId}/${inserted![task.productIdx].id}/csv-${task.imgIdx}.${ext}`;
          const { error: upErr } = await supabase.storage
            .from("product-images")
            .upload(path, Buffer.from(buffer), { contentType, upsert: true });
          if (!upErr) {
            const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
            results.push({ productIdx: task.productIdx, imgIdx: task.imgIdx, publicUrl: urlData.publicUrl });
            imagesUploaded++;
          } else {
            imagesFailed++;
          }
        } catch {
          imagesFailed++;
        }
      }

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

      const updatePromises: Promise<void>[] = [];
      for (const [pIdx, imgs] of byProduct) {
        imgs.sort((a, b) => a.imgIdx - b.imgIdx);
        const urls = imgs.map((m) => m.publicUrl);
        updatePromises.push(
          (async () => {
            await supabase.from("products").update({ image_url: urls[0], images: urls }).eq("id", inserted![pIdx].id);
            inserted![pIdx] = { ...inserted![pIdx], image_url: urls[0], images: urls };
          })()
        );
      }
      await Promise.all(updatePromises);
    }

    return NextResponse.json({
      added: inserted?.length || 0,
      errors,
      isShopify,
      imagesUploaded,
      imagesFailed,
      skippedForPlanLimit,
      products: inserted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
