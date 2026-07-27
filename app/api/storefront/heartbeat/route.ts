import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["browsing", "active_cart", "checkout"]);

/* Public, unauthenticated -- every storefront visitor's browser calls this
   every ~20s. seller_id is already public information (returned as-is by
   /api/seller-public), so accepting it directly from the client and just
   validating it resolves to a real seller is the same trust model already
   used throughout the storefront-facing API surface; slug is accepted as an
   alternative for callers that don't have the raw id (the static UNIK Labs
   pages, which have no server-rendered data to read it from). */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("storefront-heartbeat:" + ip, 40, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const visitorId = String(body?.visitorId || "").trim().slice(0, 100);
  if (!visitorId) return NextResponse.json({ error: "Missing visitorId" }, { status: 400 });

  const status = STATUSES.has(body?.status) ? body.status : "browsing";
  const path = String(body?.path || "").trim().slice(0, 300);
  const cartItemCount = Math.max(0, Math.min(999, Math.round(Number(body?.cartItemCount)) || 0));
  const cartValue = Math.max(0, Math.min(1_000_000, Number(body?.cartValue) || 0));
  const customerName = body?.customerName ? String(body.customerName).trim().slice(0, 160) || null : null;
  const customerEmail = body?.customerEmail ? String(body.customerEmail).trim().slice(0, 160) || null : null;

  const admin = getAdmin();
  let sellerId = typeof body?.sellerId === "string" ? body.sellerId.trim() : "";
  if (sellerId) {
    const { data: seller } = await admin.from("sellers").select("id").eq("id", sellerId).maybeSingle();
    if (!seller) sellerId = "";
  }
  if (!sellerId && typeof body?.slug === "string" && body.slug.trim()) {
    const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", body.slug.trim()).maybeSingle();
    sellerId = seller?.id || "";
  }
  if (!sellerId) return NextResponse.json({ error: "Unknown store" }, { status: 404 });

  const { error } = await admin.from("store_live_sessions").upsert(
    {
      seller_id: sellerId,
      visitor_id: visitorId,
      status,
      path,
      cart_item_count: cartItemCount,
      cart_value: cartValue,
      customer_name: customerName,
      customer_email: customerEmail,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "seller_id,visitor_id" }
  );
  if (error) {
    console.error("storefront heartbeat upsert failed:", error);
    return NextResponse.json({ error: "Could not record heartbeat" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
