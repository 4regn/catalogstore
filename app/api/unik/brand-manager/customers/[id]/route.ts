import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../../lib/unik-brand-manager";
import { sweepAbandonedUnikOrders } from "../../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

/* One customer's full picture for Brand Manager: profile, order history,
   and every design they've generated or uploaded -- both AI Studio and
   Custom Upload, unlike the partner-scoped .../partners/studio/designs
   route this session also added, which only lists a partner's own
   ai-studio designs.

   There's no "view their cart" in the literal sense -- UNIK_CART
   (store.js) is pure localStorage, never synced server-side, so there's
   no ground truth for what's in someone's cart right now. The closest
   real signal is a design that was generated/uploaded but never actually
   ordered (source of `unpurchased` below) -- surfaced to the UI as
   "Saved / unpurchased designs", not mislabeled as a live cart. */
export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;
  const { id } = await context.params;
  if (!id) return NextResponse.json({ error: "Missing customer id" }, { status: 400 });

  const admin = getAdmin();
  await sweepAbandonedUnikOrders(admin, seller.id);

  const [profileResult, ordersResult, designsResult] = await Promise.all([
    admin.from("unik_customer_profiles").select("id, email, full_name, avatar_url, created_at").eq("seller_id", seller.id).eq("auth_user_id", id).maybeSingle(),
    admin.from("orders").select("id, order_number, customer_name, customer_email, customer_phone, items, total, status, payment_status, payment_method, created_at, shipping_address, fulfillment_method, shipping_option, shipping_cost, discount_code, discount_amount")
      .eq("seller_id", seller.id).eq("customer_auth_user_id", id).order("created_at", { ascending: false }).limit(100),
    admin.from("unik_designs").select("id, source, status, name, garment, colour, size, style, options, preview_url, mockup_url, private_artwork_path, saved_at, created_at")
      .eq("seller_id", seller.id).eq("auth_user_id", id).order("created_at", { ascending: false }).limit(100),
  ]);

  const orders = ordersResult.data || [];
  const rawDesigns = designsResult.data || [];
  if (!profileResult.data && !orders.length && !rawDesigns.length) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  const orderedDesignIds = new Set<string>();
  for (const o of orders) {
    for (const item of (o.items as any[]) || []) {
      const designId = item?.customization?.designId;
      if (designId) orderedDesignIds.add(designId);
    }
  }

  const designs = rawDesigns.map((d: any) => ({
    id: d.id,
    source: d.source,
    status: d.status,
    name: d.name,
    garment: d.garment,
    colour: d.colour,
    size: d.size,
    style: d.style,
    tagline: d.options?.tagline || null,
    zone: d.options?.zone || null,
    mockupUrl: d.mockup_url,
    mockupBackUrl: d.options?.mockup_back_url || null,
    hasOriginal: !!d.private_artwork_path,
    hasOriginalBack: !!d.options?.back_artwork_path,
    savedAt: d.saved_at,
    createdAt: d.created_at,
    unpurchased: !orderedDesignIds.has(d.id) && d.status !== "paid" && d.status !== "checkout_started",
  }));

  const totalSpent = orders.filter((o) => o.payment_status === "paid").reduce((sum, o) => sum + (Number(o.total) || 0), 0);

  return NextResponse.json({
    customer: {
      id,
      profileId: profileResult.data?.id || null,
      fullName: profileResult.data?.full_name || orders[0]?.customer_name || null,
      email: profileResult.data?.email || orders[0]?.customer_email || null,
      phone: orders[0]?.customer_phone || null,
      avatarUrl: profileResult.data?.avatar_url || null,
      createdAt: profileResult.data?.created_at || rawDesigns[rawDesigns.length - 1]?.created_at || orders[orders.length - 1]?.created_at || null,
    },
    summary: { orderCount: orders.length, totalSpent, designCount: designs.length, unpurchasedCount: designs.filter((d) => d.unpurchased).length },
    orders,
    designs,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
