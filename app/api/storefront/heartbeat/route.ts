import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { sastToday } from "../../../../lib/sast-time";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["browsing", "active_cart", "checkout"]);

// Vercel populates these on every request that comes through its edge
// network (both Edge and Node serverless functions), no third-party geo-IP
// service or API key needed. city is URL-encoded per Vercel's docs. Locally
// (no Vercel edge in front) these are simply absent -- geolocation is a
// production-only enrichment, not a hard requirement for tracking to work.
function geoFromHeaders(req: NextRequest): { country: string | null; region: string | null; city: string | null } {
  const country = req.headers.get("x-vercel-ip-country");
  const region = req.headers.get("x-vercel-ip-country-region");
  const cityRaw = req.headers.get("x-vercel-ip-city");
  let city: string | null = null;
  if (cityRaw) { try { city = decodeURIComponent(cityRaw); } catch { city = cityRaw; } }
  return { country, region, city };
}

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

  // Historical, once-per-visitor-per-day record for the sessions-by-day
  // chart and top locations -- unlike the upsert above, this is deliberately
  // insert-and-ignore-on-conflict, so only the FIRST heartbeat of a given
  // visitor on a given day writes anything; the other ~50-100 heartbeats
  // they'll send that same day are no-ops here.
  const geo = geoFromHeaders(req);
  const { error: sessionError } = await admin.from("store_visitor_sessions").upsert(
    {
      seller_id: sellerId,
      visitor_id: visitorId,
      session_date: sastToday(),
      ...geo,
      last_status: status,
      had_cart: cartItemCount > 0,
      reached_checkout: status === "checkout",
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "seller_id,visitor_id,session_date", ignoreDuplicates: true }
  );
  if (sessionError) console.error("storefront heartbeat session-log upsert failed:", sessionError);

  const sessionUpdate: Record<string, unknown> = {
    last_status: status,
    last_seen_at: new Date().toISOString(),
  };
  if (cartItemCount > 0) sessionUpdate.had_cart = true;
  if (status === "checkout") sessionUpdate.reached_checkout = true;
  const { error: sessionUpdateError } = await admin
    .from("store_visitor_sessions")
    .update(sessionUpdate)
    .eq("seller_id", sellerId)
    .eq("visitor_id", visitorId)
    .eq("session_date", sastToday());
  if (sessionUpdateError) console.error("storefront heartbeat session-log update failed:", sessionUpdateError);

  return NextResponse.json({ ok: true });
}
