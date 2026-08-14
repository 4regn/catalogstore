import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !slug) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  // customer_email/phone, shipping_address and discount_code are included
  // alongside the confirmation-page fields above so a customer bounced
  // back from a cancelled/declined gateway attempt (see
  // CheckoutPageClient.tsx's load()) can have the checkout form refilled
  // from their own already-placed order, instead of retyping everything.
  // Same unauthenticated-but-orderId-gated trust model this route (and
  // every other ?paid=<orderId>/?cancelled=1 return link on this
  // platform) already relies on -- an unguessable UUID standing in for
  // auth, not a new exposure class introduced by adding these columns.
  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, external_id, customer_name, customer_email, customer_phone, items, total, shipping_cost, shipping_option, shipping_address, fulfillment_method, payment_method, payment_status, status, discount_code, created_at")
    .eq("id", orderId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
}
