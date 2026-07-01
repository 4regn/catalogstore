import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

    if (isShopify) {
      const handleMap = new Map<string, string[][]>();
      for (let i = 1; i < lines.length; i++) {
        const cols = parseCsvLine(lines[i]);
        const handle = col(cols, "handle");
        if (!handle) continue;
        if (!handleMap.has(handle)) handleMap.set(handle, []);
        handleMap.get(handle)!.push(cols);
      }

      for (const [, variantRows] of handleMap) {
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
      }
    }

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid products found in CSV.", errors }, { status: 400 });
    }

    const { data: inserted, error: insertErr } = await supabase.from("products").insert(rows).select();
    if (insertErr) {
      return NextResponse.json({ error: "Import failed: " + insertErr.message }, { status: 500 });
    }

    let imagesUploaded = 0;
    let imagesFailed = 0;

    if (inserted && isShopify) {
      for (let i = 0; i < inserted.length; i++) {
        const srcs = allImageSrcs[i];
        if (!srcs || srcs.length === 0) continue;
        const uploadedUrls: string[] = [];

        for (let j = 0; j < srcs.length; j++) {
          try {
            const resp = await fetch(srcs[j]);
            if (!resp.ok) { imagesFailed++; continue; }
            const buffer = await resp.arrayBuffer();
            const contentType = resp.headers.get("content-type") || "image/jpeg";
            const mimeToExt: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/gif": "gif" };
            const ext = mimeToExt[contentType] || "jpg";
            const path = `${sellerId}/${inserted[i].id}/csv-${j}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("product-images")
              .upload(path, Buffer.from(buffer), { contentType, upsert: true });
            if (!upErr) {
              const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
              uploadedUrls.push(urlData.publicUrl);
              imagesUploaded++;
            } else {
              imagesFailed++;
            }
          } catch {
            imagesFailed++;
          }
        }

        if (uploadedUrls.length > 0) {
          await supabase.from("products").update({
            image_url: uploadedUrls[0],
            images: uploadedUrls,
          }).eq("id", inserted[i].id);
          inserted[i] = { ...inserted[i], image_url: uploadedUrls[0], images: uploadedUrls };
        }
      }
    }

    return NextResponse.json({
      added: inserted?.length || 0,
      errors,
      isShopify,
      imagesUploaded,
      imagesFailed,
      products: inserted,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Import failed" }, { status: 500 });
  }
}
