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
//
// The fake-product half used to be hardcoded to exactly two tags
// ("winter-essentials" and "Wow") -- a leftover from the literal port of
// the old Shopify theme section, which only ever queried those two
// collections. That meant every popup a visitor saw was drawn from the
// same two categories no matter how much of the catalog the store
// actually carries. This now draws from every published, in-stock,
// photographed product above the price floor instead, so the popup's
// variety tracks the real catalog (new collections show up automatically,
// nothing here needs updating when the seller adds one).
//
// Within that wider pool, the seller wants certain lines seen more often:
// Premium Oversized Tees, front+back printed hoodies, the Custom Upload
// Studio hoodies/tees, and trucker caps -- especially whichever of those
// are actually selling. There's no precomputed popularity column on
// products (checked), so "most purchased" is derived the same way
// app/api/storefront/cart-booster/route.ts already does it: count qty
// across each product's appearances in the last 500 paid orders, no new
// database field needed.
//
// Rather than filtering the pool down to just these lines (which would
// undo the whole-catalog variety fix above) or sorting it (pointless --
// FourRegnSalesPopup.tsx's makeQueue fully reshuffles whatever array it's
// handed), priority is expressed as weight: a priority-line product's
// entry is repeated a few extra times in the array below, and a
// best-selling product gets a few more on top of that, so both are simply
// more likely to come up in the shuffle without ever squeezing the rest
// of the catalog out entirely.
const PRIORITY_CATEGORIES = [
  "OVERSIZED PREMIUM TEES",
  // Two spellings exist in real product data for the same collection --
  // see the same defensive either/or check in FourRegnStore.tsx's promo
  // badge logic.
  "BACK & FRONT PRINTED HOODIES", "FRONT & BACK PRINTED HOODIES",
  "CUSTOM PRINTED HOODIES", "CUSTOM PRINTED TEES",
  "TRUCKER CAPS & BEANIES", "PRINTED TRUCKER CAPS", "PLAIN TRUCKER CAPS", "CUSTOM TRUCKER CAPS",
];
const PRIORITY_TAGS = ["custom-print-front", "custom-print-both"];
const PRIORITY_WEIGHT = 3;
const POPULARITY_WEIGHT_CAP = 4;
const MIN_PRICE_ZAR = 351;
const REAL_ORDER_WINDOW_MS = 60 * 60 * 1000;
const REAL_ORDER_LIMIT = 20;
const POPULARITY_ORDER_LIMIT = 500;
const CATALOG_PRODUCT_LIMIT = 400;

function isPriorityProduct(p: { category: string | null; tags: string[] | null }): boolean {
  const categories = (p.category || "").split(",").map((c) => c.trim().toUpperCase());
  if (PRIORITY_CATEGORIES.some((c) => categories.includes(c))) return true;
  return (p.tags || []).some((t) => PRIORITY_TAGS.includes(t));
}

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

  const [catalogRes, ordersRes, popularityRes] = await Promise.all([
    admin
      .from("products")
      .select("id, name, handle, image_url, category, tags")
      .eq("seller_id", seller.id)
      .eq("status", "published")
      .eq("in_stock", true)
      .not("image_url", "is", null)
      .gt("price", MIN_PRICE_ZAR)
      .limit(CATALOG_PRODUCT_LIMIT),
    admin
      .from("orders")
      .select("customer_name, shipping_address, items, created_at")
      .eq("seller_id", seller.id)
      .eq("payment_status", "paid")
      .gte("created_at", new Date(Date.now() - REAL_ORDER_WINDOW_MS).toISOString())
      .order("created_at", { ascending: false })
      .limit(REAL_ORDER_LIMIT),
    // Same "count qty across recent paid orders" best-seller signal
    // cart-booster already uses -- see the comment above PRIORITY_CATEGORIES.
    admin
      .from("orders")
      .select("items")
      .eq("seller_id", seller.id)
      .eq("payment_status", "paid")
      .order("created_at", { ascending: false })
      .limit(POPULARITY_ORDER_LIMIT),
  ]);

  const popularityByProductId = new Map<string, number>();
  for (const order of popularityRes.data || []) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items as { id?: string; qty?: number }[]) {
      const id = String(item?.id || "").trim();
      if (!id) continue;
      popularityByProductId.set(id, (popularityByProductId.get(id) || 0) + Math.max(1, Number(item?.qty) || 1));
    }
  }

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

  // Weighted repetition, not sorting -- the client's makeQueue fully
  // reshuffles this array (see the comment on PRIORITY_CATEGORIES above),
  // so a priority/best-selling product needs to appear as extra copies to
  // actually show up more often, not just sit earlier in the list.
  const weightedProducts: ReturnType<typeof toProduct>[] = [];
  for (const p of catalogRes.data ?? []) {
    let weight = 1;
    if (isPriorityProduct(p)) weight += PRIORITY_WEIGHT;
    weight += Math.min(popularityByProductId.get(p.id) || 0, POPULARITY_WEIGHT_CAP);
    const item = toProduct(p);
    for (let i = 0; i < weight; i++) weightedProducts.push(item);
  }

  return NextResponse.json({
    products: weightedProducts,
    realOrders,
  });
}
