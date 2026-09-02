import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

// Custom-print uploads (raw artwork + composited preview) go straight to
// the public store-assets bucket at checkout time with no DB row and no
// "claimed" status (see app/api/store/custom-print-upload/route.ts) --
// simplest possible model, since there's nothing to reuse across visits.
// The tradeoff is that an abandoned upload (customer uploaded a design,
// then never checked out) sits in storage forever unless something else
// cleans it up. This is that cleanup: once a file is more than 7 days
// old, delete it UNLESS its path shows up inside any order's
// items[].customArtwork (frontUrl/backUrl/previewFrontUrl/previewBackUrl)
// for this seller -- an order can be placed hours after upload but never
// days, so a flat 7-day grace window comfortably covers every real
// checkout while still reclaiming abandoned uploads promptly.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const BUCKET = "store-assets";
const FOLDER_SUFFIX = "/custom-print-uploads";

function extractStoragePath(url: string): string | null {
  const marker = `/object/public/${BUCKET}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return decodeURIComponent(url.slice(idx + marker.length));
}

export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();

  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", "4regn").maybeSingle();
  if (!seller) return NextResponse.json({ status: "ok", deleted: 0, note: "4regn seller not found" });

  const folder = `${seller.id}${FOLDER_SUFFIX}`;
  const cutoff = Date.now() - RETENTION_MS;

  const staleObjects: string[] = [];
  let offset = 0;
  for (;;) {
    const { data: page, error } = await admin.storage.from(BUCKET).list(folder, {
      limit: 1000,
      offset,
      sortBy: { column: "created_at", order: "asc" },
    });
    if (error) {
      console.error("cleanup-custom-print-uploads: storage list failed", error);
      return NextResponse.json({ status: "error", error: error.message }, { status: 500 });
    }
    if (!page || page.length === 0) break;
    for (const obj of page) {
      const createdAt = obj.created_at ? Date.parse(obj.created_at) : NaN;
      if (!Number.isNaN(createdAt) && createdAt < cutoff) {
        staleObjects.push(`${folder}/${obj.name}`);
      }
    }
    if (page.length < 1000) break;
    offset += page.length;
  }

  if (!staleObjects.length) return NextResponse.json({ status: "ok", scanned: 0, deleted: 0 });

  const { data: orders, error: ordersError } = await admin
    .from("orders")
    .select("items")
    .eq("seller_id", seller.id);
  if (ordersError) {
    console.error("cleanup-custom-print-uploads: orders fetch failed", ordersError);
    return NextResponse.json({ status: "error", error: ordersError.message }, { status: 500 });
  }

  const referencedPaths = new Set<string>();
  for (const order of orders || []) {
    for (const item of (order.items as any[]) || []) {
      const art = item?.customArtwork;
      if (!art) continue;
      for (const url of [art.frontUrl, art.backUrl, art.previewFrontUrl, art.previewBackUrl]) {
        if (typeof url !== "string" || !url) continue;
        const path = extractStoragePath(url);
        if (path) referencedPaths.add(path);
      }
    }
  }

  const toDelete = staleObjects.filter((path) => !referencedPaths.has(path));
  if (!toDelete.length) return NextResponse.json({ status: "ok", scanned: staleObjects.length, deleted: 0 });

  const { error: removeError } = await admin.storage.from(BUCKET).remove(toDelete);
  if (removeError) {
    console.error("cleanup-custom-print-uploads: storage remove failed", removeError);
    return NextResponse.json({ status: "error", error: removeError.message }, { status: 500 });
  }

  return NextResponse.json({ status: "ok", scanned: staleObjects.length, deleted: toDelete.length });
}
