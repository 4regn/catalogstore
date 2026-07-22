import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";
import { getYocoCheckout } from "../../../../../lib/yoco";
import { markUnikOrderPaid } from "../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

/* Polled by checkout.html after the Yoco redirect back. The webhook is the
   primary way an order gets marked paid, but webhook delivery can be slow,
   misconfigured, or fail signature verification -- so if the order is
   still pending and we have a yoco_checkout_id, double-check directly with
   Yoco and self-heal. This means a customer who successfully paid never
   gets stuck waiting on a webhook that may never arrive. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  const admin = getAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, customer_auth_user_id, status, payment_status, total, order_number, items, customer_name, customer_email, yoco_checkout_id, created_at, fulfillment_method, shipping_option, shipping_address, shipping_cost")
    .eq("id", id)
    .maybeSingle();
  if (!order || order.seller_id !== seller.id || order.customer_auth_user_id !== user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  let paymentStatus = order.payment_status;
  let status = order.status;

  if (paymentStatus !== "paid" && order.yoco_checkout_id) {
    const checkout = await getYocoCheckout(order.yoco_checkout_id);
    if (checkout?.paymentId) {
      const expectedCents = Math.round(Number(order.total) * 100);
      if (Math.abs(expectedCents - checkout.amount) <= 1) {
        const result = await markUnikOrderPaid(admin, order as any, checkout.paymentId, null);
        if (result === "paid" || result === "already_paid") {
          paymentStatus = "paid";
          status = "confirmed";
        }
      } else {
        console.error("UNIK order self-heal: amount mismatch", { orderId: order.id, expectedCents, got: checkout.amount });
      }
    }
  }

  return NextResponse.json({
    status,
    paymentStatus,
    total: order.total,
    orderNumber: order.order_number,
    order: {
      id: order.id,
      status,
      paymentStatus,
      total: order.total,
      orderNumber: order.order_number,
      items: order.items,
      createdAt: order.created_at,
      fulfillmentMethod: order.fulfillment_method,
      shippingOption: order.shipping_option,
      shippingAddress: order.shipping_address,
      shippingCost: order.shipping_cost,
    },
  }, { headers: { "Cache-Control": "private, no-store" } });
}
