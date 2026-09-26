import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { sastToday } from "../../../../lib/sast-time";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["browsing", "active_cart", "checkout"]);
const EVENT_TYPES = new Set([
  "page_view", "add_to_cart", "reached_checkout", "session_activity",
  "free_delivery_upsell_impression", "free_delivery_upsell_click",
  "free_delivery_upsell_add", "free_delivery_threshold_reached",
  "checkout_started_after_upsell", "order_completed_after_upsell",
  // 4regn Flash Weekend free trucker cap promotion -- must stay in sync
  // with StorefrontEventType (lib/use-live-visitor-ping.ts) and the
  // store_visitor_events_event_type_check DB constraint (see
  // supabase/migrations/20260829_flash_cap_analytics_events.sql). Missing
  // from any ONE of those three is enough to silently drop every one of
  // these events -- this Set specifically is what was missed originally.
  "flash_cap_promo_seen", "flash_cap_progress_clicked", "flash_cap_unlocked",
  "flash_cap_picker_opened", "flash_cap_collection_visited", "flash_cap_selected",
  "flash_cap_changed", "flash_cap_qualification_lost",
  "flash_cap_checkout_warning_seen", "flash_cap_checkout_without_gift",
  "flash_cap_order_completed",
  // Heart-icon toggles on the storefront -- fired for every visitor
  // regardless of whether they're signed into a customer account, unlike
  // customer_wishlist_items which only records account holders.
  "wishlist_added", "wishlist_removed",
  // 4regn Oversized Premium Tees flash sale -- same three-places-in-sync
  // requirement as the flash cap promo above (this list, StorefrontEventType,
  // and the DB check constraint).
  "tees_sale_collection_visited", "tees_sale_product_viewed",
  "tees_sale_added_to_cart", "tees_sale_order_completed",
  "tees_sale_popup_seen", "tees_sale_popup_clicked",
  // Granular checkout funnel -- same three-places-in-sync requirement
  // (this list, StorefrontEventType, and the DB check constraint) as
  // every promo event set above. See use-live-visitor-ping.ts's own
  // comment on what each one captures.
  "checkout_delivery_details_filled",
  "checkout_payment_method_selected", "checkout_shipping_method_selected",
  "checkout_pay_clicked", "checkout_payment_retry",
]);

function safeEventMetadata(value: unknown): Record<string, string | number | boolean | null> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const allowed = new Set([
    "cartSubtotalBefore", "gap", "recommendedProductId", "recommendedProductPrice", "resultingSubtotal", "orderId",
    // Flash Weekend free trucker cap event metadata (see FourRegnStore.tsx's
    // trackStorefrontEvent calls for flash_cap_*).
    "source", "productId", "productName", "mode", "flashCapState",
    // Checkout funnel event metadata (see CheckoutPageClient.tsx's
    // trackStorefrontEvent calls for checkout_*). shippingOption is the
    // option's name (a string), not its index -- an index isn't stable
    // once a seller reorders delivery methods, so checkout_pay_clicked
    // records the name instead.
    "fulfillment", "paymentMethod", "shippingOption", "previousPaymentStatus", "failed",
  ]);
  const result: Record<string, string | number | boolean | null> = {};
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!allowed.has(key)) continue;
    if (typeof raw === "number" && Number.isFinite(raw)) result[key] = Math.max(-1_000_000, Math.min(1_000_000, raw));
    else if (typeof raw === "string") result[key] = raw.slice(0, 100);
    else if (typeof raw === "boolean" || raw === null) result[key] = raw;
  }
  return result;
}

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
  let eventType = EVENT_TYPES.has(body?.eventType) ? body.eventType : null;
  const eventMetadata = safeEventMetadata(body?.eventMetadata);
  const cartItems = Array.isArray(body?.cartItems)
    ? body.cartItems.slice(0, 20).map((item: any) => ({
        id: typeof item?.id === "string" ? item.id.slice(0, 80) : undefined,
        name: String(item?.name || "").trim().slice(0, 180),
        price: Math.max(0, Math.min(1_000_000, Number(item?.price) || 0)),
        qty: Math.max(1, Math.min(999, Math.round(Number(item?.qty)) || 1)),
        variant: item?.variant ? String(item.variant).trim().slice(0, 240) : undefined,
        image: item?.image ? String(item.image).trim().slice(0, 600) : undefined,
      })).filter((item: any) => item.name)
    : [];

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
      last_path: path,
      had_cart: cartItemCount > 0,
      reached_checkout: status === "checkout",
      cart_started_at: cartItemCount > 0 ? new Date().toISOString() : null,
      checkout_started_at: status === "checkout" ? new Date().toISOString() : null,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "seller_id,visitor_id,session_date", ignoreDuplicates: true }
  );
  if (sessionError) console.error("storefront heartbeat session-log upsert failed:", sessionError);

  // Split into two separate update calls, deliberately -- these used to be
  // one combined update, which meant a single bad/missing column in EITHER
  // half silently failed the WHOLE statement (Postgres updates are all-or-
  // nothing), including had_cart/reached_checkout. That's exactly what
  // happened live: customer_name/customer_email were missing from this
  // table entirely (see 20260926b_store_visitor_sessions_identity.sql), so
  // the instant a checkout visitor typed their name or email, this update
  // started failing outright -- reached_checkout silently stopped getting
  // set for the one case that matters most, with nothing surfacing the
  // failure beyond a console.error nobody was watching. had_cart/
  // reached_checkout are the funnel signal the whole Analytics tab depends
  // on; they must never be able to fail because of an unrelated identity
  // column having drifted.
  const funnelUpdate: Record<string, unknown> = {
    last_status: status,
    last_path: path,
    last_seen_at: new Date().toISOString(),
  };
  if (cartItemCount > 0) funnelUpdate.had_cart = true;
  if (status === "checkout") funnelUpdate.reached_checkout = true;
  const { error: funnelUpdateError } = await admin
    .from("store_visitor_sessions")
    .update(funnelUpdate)
    .eq("seller_id", sellerId)
    .eq("visitor_id", visitorId)
    .eq("session_date", sastToday());
  if (funnelUpdateError) console.error("storefront heartbeat session-log funnel update failed:", funnelUpdateError);

  // The day's FIRST heartbeat (the upsert above, ignoreDuplicates: true)
  // almost always lands before a checkout visitor has typed their name or
  // email, so without this, that identity was captured live in
  // store_live_sessions (an ephemeral, overwritten-every-heartbeat table)
  // but never persisted here -- someone who filled in their details at
  // checkout and then left without paying was completely unidentifiable
  // after the fact. Only ever overwrites with a real value, never blanks
  // one back out if a later heartbeat happens to arrive without it.
  if (customerName || customerEmail) {
    const identityUpdate: Record<string, unknown> = {};
    if (customerName) identityUpdate.customer_name = customerName;
    if (customerEmail) identityUpdate.customer_email = customerEmail;
    const { error: identityUpdateError } = await admin
      .from("store_visitor_sessions")
      .update(identityUpdate)
      .eq("seller_id", sellerId)
      .eq("visitor_id", visitorId)
      .eq("session_date", sastToday());
    if (identityUpdateError) console.error("storefront heartbeat session-log identity update failed:", identityUpdateError);
  }

  if (cartItemCount > 0) {
    const { error: cartTimeError } = await admin
      .from("store_visitor_sessions")
      .update({ cart_started_at: new Date().toISOString() })
      .eq("seller_id", sellerId)
      .eq("visitor_id", visitorId)
      .eq("session_date", sastToday())
      .is("cart_started_at", null);
    if (cartTimeError) console.error("storefront heartbeat cart timestamp update failed:", cartTimeError);
  }
  if (status === "checkout") {
    const { error: checkoutTimeError } = await admin
      .from("store_visitor_sessions")
      .update({ checkout_started_at: new Date().toISOString() })
      .eq("seller_id", sellerId)
      .eq("visitor_id", visitorId)
      .eq("session_date", sastToday())
      .is("checkout_started_at", null);
    if (checkoutTimeError) console.error("storefront heartbeat checkout timestamp update failed:", checkoutTimeError);
  }

  // Older storefront bundles (and browsers holding a cached bundle) already
  // send the regular 20-second heartbeat but do not send `session_activity`.
  // Create one server-side at most once a minute so their live movement is
  // visible too; this avoids depending on a client redeploy for the timeline.
  if (!eventType) {
    const activitySince = new Date(Date.now() - 60_000).toISOString();
    const { data: recentActivity, error: recentActivityError } = await admin
      .from("store_visitor_events")
      .select("id")
      .eq("seller_id", sellerId)
      .eq("visitor_id", visitorId)
      .gte("created_at", activitySince)
      .limit(1)
      .maybeSingle();
    if (recentActivityError) console.error("storefront heartbeat activity lookup failed:", recentActivityError);
    if (!recentActivity) eventType = "session_activity";
  }

  if (eventType) {
    const eventRow = {
      seller_id: sellerId,
      visitor_id: visitorId,
      event_type: eventType,
      path,
      customer_name: customerName,
      customer_email: customerEmail,
      cart_item_count: cartItemCount,
      cart_value: cartValue,
      cart_items: cartItems,
      event_metadata: eventMetadata,
      ...geo,
    };
    const { error: eventError } = await admin.from("store_visitor_events").insert(eventRow);
    if (eventError) console.error("storefront heartbeat event insert failed:", eventError);
  }

  return NextResponse.json({ ok: true });
}
