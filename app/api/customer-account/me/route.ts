import { NextRequest, NextResponse } from "next/server";
import { requireCustomerAccount } from "../../../../lib/customer-account";
import { getAdmin } from "../../../../lib/supabase-admin";
import { isNewFourRegnTrackingOrder } from "../../../../lib/four-regn-orders";
import { buildFourRegnTracking } from "../../../../lib/four-regn-tracking";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const auth = await requireCustomerAccount(req, slug);
  if ("response" in auth) return auth.response;
  const admin = getAdmin();
  const [customerResult, wishlistResult] = await Promise.all([
    admin.from("customers").select("id, first_name, last_name, email, phone, created_at").eq("id", auth.account.customer_id).single(),
    admin.from("customer_wishlist_items").select("product_id, created_at, products(id, name, price, old_price, image_url, handle, in_stock, category)").eq("account_id", auth.account.id).order("created_at", { ascending: false }),
  ]);
  if (customerResult.error) return NextResponse.json({ error: "Could not load customer account" }, { status: 500 });

  const normalizedEmail = String(auth.account.email || customerResult.data.email || "").trim().toLowerCase();
  // Historical imports and early checkout fallbacks could save an order's
  // email without customer_id. Claim those seller-scoped rows now, so the
  // signed-in customer's history is repaired once and every later account
  // load can use the durable relationship.
  if (normalizedEmail) {
    await admin.from("orders")
      .update({ customer_id: auth.account.customer_id })
      .eq("seller_id", auth.seller.id)
      .ilike("customer_email", normalizedEmail);
  }
  const ordersResult = await admin.from("orders")
    .select("id, order_number, external_id, items, total, status, payment_status, shipping_option, shipping_address, created_at, tracking_updated_at")
    .eq("seller_id", auth.seller.id)
    .eq("customer_id", auth.account.customer_id)
    .or("payment_status.eq.paid,status.in.(confirmed,processing,shipped,picked_up,in_transit,out_for_delivery,delivered)")
    .order("created_at", { ascending: false })
    .limit(50);
  const visibleOrders = (ordersResult.data || []).filter((order: any) => auth.seller.subdomain !== "4regn" || isNewFourRegnTrackingOrder(order));
  return NextResponse.json({
    customer: customerResult.data,
    orders: visibleOrders.map((order: any) => ({ ...order, tracking: auth.seller.subdomain === "4regn" ? buildFourRegnTracking(order) : null })),
    wishlist: (wishlistResult.data || []).map((row: any) => row.products).filter(Boolean),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
