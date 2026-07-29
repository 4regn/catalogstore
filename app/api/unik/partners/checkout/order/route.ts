import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../../lib/unik-partner";
import { getYocoCheckout } from "../../../../../../lib/yoco";
import { markUnikOrderPaid, markUnikOrderFailed, ORDER_ABANDON_MS } from "../../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

const YOCO_TERMINAL_FAILURE_STATUSES = new Set(["failed", "cancelled", "canceled", "expired", "declined"]);

/* Partner-scoped twin of /api/unik/orders/[id] -- polled by the Studio
   tab's cart/checkout panel after the Yoco redirect back. Same self-heal
   logic (webhook delivery can be slow/misconfigured), scoped by
   partner_id + channel instead of customer_auth_user_id, since a
   partner-placed order has no customer account attached. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { seller, partner } = auth;

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing order id" }, { status: 400 });

  const admin = getAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, partner_id, channel, status, payment_status, total, order_number, items, customer_name, customer_email, created_at, yoco_checkout_id")
    .eq("id", id)
    .maybeSingle();
  if (!order || order.seller_id !== seller.id || order.partner_id !== partner.id || order.channel !== "partner_direct") {
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
      }
    } else if (checkout?.status && YOCO_TERMINAL_FAILURE_STATUSES.has(checkout.status.toLowerCase()) && paymentStatus === "pending") {
      const result = await markUnikOrderFailed(admin, order.id);
      if (result === "failed") { paymentStatus = "failed"; status = "failed"; }
    }
  }

  if (paymentStatus === "pending" && Date.now() - new Date(order.created_at).getTime() > ORDER_ABANDON_MS) {
    const { data: swept } = await admin
      .from("orders")
      .update({ payment_status: "abandoned", status: "abandoned" })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select("id")
      .maybeSingle();
    if (swept) { paymentStatus = "abandoned"; status = "abandoned"; }
  }

  return NextResponse.json({
    status, paymentStatus, total: order.total, orderNumber: order.order_number,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
