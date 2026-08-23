import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";
import { computeAutomaticBxgyDiscount, fetchActiveAutomaticBxgyDiscounts } from "../../../../lib/automatic-discounts";
import { cartBoosterRelationshipIds, FOUR_REGN_CART_BOOSTER_THRESHOLD, rankCartBoosterProducts, type CartBoosterProduct } from "../../../../lib/cart-booster";
import { effectiveProductPrice, hasPurchasableVariantPath } from "../../../../lib/product-pricing";

export const dynamic = "force-dynamic";

type CartInput = { id?: string; qty?: number; selectedVariants?: Record<string, string> };

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("cart-booster:" + ip, 30, 60).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: { slug?: string; items?: CartInput[] };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const slug = String(body.slug || "").trim().toLowerCase();
  const items = Array.isArray(body.items) ? body.items.slice(0, 50) : [];
  if (!slug || !items.length) return NextResponse.json({ error: "Missing cart" }, { status: 400 });

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id, subdomain, template").eq("subdomain", slug).maybeSingle();
  if (!seller || (seller.subdomain !== "4regn" && seller.template !== "4regn")) return NextResponse.json({ error: "Cart booster is unavailable" }, { status: 404 });

  const ids = [...new Set(items.map((item) => String(item.id || "")).filter(Boolean))];
  const { data: cartRows, error: cartError } = await admin
    .from("products")
    .select("id, name, price, old_price, category, image_url, images, handle, tags, variants, in_stock, status, sort_order, metafields")
    .eq("seller_id", seller.id)
    .in("id", ids);
  if (cartError) return NextResponse.json({ error: "Could not verify cart" }, { status: 500 });

  const cartMap = new Map<string, CartBoosterProduct>(((cartRows || []) as CartBoosterProduct[]).map((product) => [product.id, product]));
  const pricedLines = items.map((item) => {
    const product = cartMap.get(String(item.id || ""));
    if (!product || product.status !== "published" || product.in_stock === false) return null;
    const qty = Math.max(1, Math.min(999, Math.floor(Number(item.qty) || 1)));
    return {
      name: product.name,
      price: effectiveProductPrice(product.price, product.variants, item.selectedVariants),
      qty,
      category: product.category,
    };
  }).filter(Boolean) as Array<{ name: string; price: number; qty: number; category?: string | null }>;
  if (!pricedLines.length) return NextResponse.json({ error: "Cart products are unavailable" }, { status: 409 });

  const rawSubtotal = pricedLines.reduce((sum, line) => sum + line.price * line.qty, 0);
  const rules = await fetchActiveAutomaticBxgyDiscounts(admin, seller.id);
  const automaticDiscount = rules.length ? computeAutomaticBxgyDiscount(rules, pricedLines) : { totalDiscount: 0, applied: [], lineDiscounts: [] };
  const payableSubtotal = Math.max(0, Math.round((rawSubtotal - automaticDiscount.totalDiscount) * 100) / 100);
  const gap = Math.max(0, FOUR_REGN_CART_BOOSTER_THRESHOLD - payableSubtotal);
  if (gap <= 0) return NextResponse.json({ threshold: FOUR_REGN_CART_BOOSTER_THRESHOLD, rawSubtotal, payableSubtotal, gap: 0, unlocked: true, recommendations: [] });

  const manualIds = [...new Set([...cartMap.values()].flatMap(cartBoosterRelationshipIds))];
  const [regularCandidates, recentPaidOrders] = await Promise.all([
    fetchAllRows<CartBoosterProduct>(admin, "products", "id, name, price, old_price, category, image_url, images, handle, tags, variants, in_stock, status, sort_order, metafields", (query) =>
      query.eq("seller_id", seller.id).eq("status", "published").eq("in_stock", true).order("sort_order", { ascending: true })
    ),
    // Recent completed orders provide a real best-seller tie-breaker without
    // relying on made-up popularity or a new database field.
    admin.from("orders").select("items").eq("seller_id", seller.id).eq("payment_status", "paid").order("created_at", { ascending: false }).limit(500),
  ]);
  const { data: manualCandidates } = manualIds.length
    ? await admin.from("products").select("id, name, price, old_price, category, image_url, images, handle, tags, variants, in_stock, status, sort_order, metafields").eq("seller_id", seller.id).eq("status", "published").eq("in_stock", true).in("id", manualIds)
    : { data: [] as CartBoosterProduct[] };
  const candidateMap = new Map<string, CartBoosterProduct>([...regularCandidates, ...(manualCandidates || [])].map((product: CartBoosterProduct) => [product.id, product]));
  const popularityByProductId = new Map<string, number>();
  for (const order of recentPaidOrders.data || []) {
    const items = Array.isArray(order.items) ? order.items : [];
    for (const item of items) {
      const id = String(item?.id || "").trim();
      if (!id) continue;
      popularityByProductId.set(id, (popularityByProductId.get(id) || 0) + Math.max(1, Number(item?.qty) || 1));
    }
  }
  const recommendations = rankCartBoosterProducts({
    cartProducts: [...cartMap.values()],
    candidates: [...candidateMap.values()].filter((product) => hasPurchasableVariantPath(product.variants)),
    payableSubtotal,
    popularityByProductId,
    projectedSubtotal: (candidate, recommendationPrice) => {
      const projectedLines = [...pricedLines, { name: candidate.name, price: recommendationPrice, qty: 1, category: candidate.category }];
      const projectedRawSubtotal = projectedLines.reduce((sum, line) => sum + line.price * line.qty, 0);
      const projectedDiscount = rules.length ? computeAutomaticBxgyDiscount(rules, projectedLines).totalDiscount : 0;
      return Math.max(0, projectedRawSubtotal - projectedDiscount);
    },
  }).map((product) => {
    const publicProduct = { ...product };
    delete publicProduct.metafields;
    return publicProduct;
  });

  return NextResponse.json({
    threshold: FOUR_REGN_CART_BOOSTER_THRESHOLD,
    rawSubtotal,
    payableSubtotal,
    gap,
    unlocked: false,
    recommendations,
  });
}
