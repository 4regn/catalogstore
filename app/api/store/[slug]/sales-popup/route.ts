import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Backs the 4regn "recent purchase" popup (ported from the live Shopify
// theme's regn-sales-popup.liquid -- see FourRegnSalesPopup.tsx for the
// widget itself). That snippet queried Shopify's Storefront GraphQL API for
// tagged products and a separate Railway service for real recent orders;
// neither exists on this platform, so both are sourced from this seller's
// own tables here instead. Public, unauthenticated (same trust model as
// /api/storefront/heartbeat) -- every storefront visitor's browser calls
// this once per page load.
//
// Real-order privacy: only ever returns a first name + last-initial (never
// the full customer_name), a city (never the full shipping address), and
// the purchased product's name/image/handle -- never order id, total,
// email, or phone. This is already a narrower surface than what the
// original Railway endpoint exposed.
const MIN_PRICE_ZAR = 351;
const REAL_ORDER_WINDOW_MS = 60 * 60 * 1000;
const REAL_ORDER_LIMIT = 20;
const TAG_PRODUCT_LIMIT = 300;

function displayName(fullName: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return null;
  const first = parts[0];
  const lastInitial = parts.length > 1 ? parts[parts.length - 1][0]?.toUpperCase() : null;
  return lastInitial ? `${first} ${lastInitial}` : first;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const ip = getClientIP(req);
  if (!rateLimit("sales-popup:" + ip, 30, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { slug } = await params;
  const admin = getAdmin();

  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const [winterRes, wowRes, ordersRes] = await Promise.all([
    admin
      .from("products")
      .select("name, handle, image_url")
      .eq("seller_id", seller.id)
      .eq("status", "published")
      .contains("tags", ["winter-essentials"])
      .gt("price", MIN_PRICE_ZAR)
      .limit(TAG_PRODUCT_LIMIT),
    admin
      .from("products")
      .select("name, handle, image_url")
      .eq("seller_id", seller.id)
      .eq("status", "published")
      .contains("tags", ["Wow"])
      .limit(TAG_PRODUCT_LIMIT),
    admin
      .from("orders")
      .select("customer_name, shipping_address, items, created_at")
      .eq("seller_id", seller.id)
      .eq("payment_status", "paid")
      .gte("created_at", new Date(Date.now() - REAL_ORDER_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(REAL_ORDER_LIMIT),
  ]);

  const toProduct = (p: { name: string; handle: string | null; image_url: string | null }) => ({
    name: p.name,
    handle: p.handle,
    image: p.image_url,
  });

  // Resolve a handle for each real order's first line item (order items
  // store id/name/price/qty/variant/image at checkout time -- never a
  // handle, since that's a storefront-routing concern, not a checkout one)
  // so the popup can still link to a real product page.
  const orderRows = (ordersRes.data ?? []).filter((o) => {
    const items = Array.isArray(o.items) ? o.items : [];
    const city = (o.shipping_address as { city?: string } | null)?.city;
    return items.length > 0 && !!city && displayName(o.customer_name);
  });
  const firstItemIds = orderRows.map((o) => (o.items as { id?: string }[])[0]?.id).filter(Boolean) as string[];
  const { data: itemProducts } = firstItemIds.length
    ? await admin.from("products").select("id, handle").in("id", firstItemIds)
    : { data: [] as { id: string; handle: string | null }[] };
  const handleById = new Map((itemProducts ?? []).map((p) => [p.id, p.handle]));

  const nowMs = Date.now();
  const realOrders = orderRows.map((o) => {
    const firstItem = (o.items as { id?: string; name: string; image?: string | null }[])[0];
    const city = (o.shipping_address as { city: string }).city;
    const minutesAgo = Math.max(0, Math.round((nowMs - new Date(o.created_at).getTime()) / 60000));
    return {
      displayName: displayName(o.customer_name),
      city,
      product: firstItem.name,
      handle: firstItem.id ? handleById.get(firstItem.id) ?? null : null,
      image: firstItem.image ?? null,
      minutesAgo,
    };
  });

  return NextResponse.json({
    winterProducts: (winterRes.data ?? []).map(toProduct),
    wowProducts: (wowRes.data ?? []).map(toProduct),
    realOrders,
  });
}
