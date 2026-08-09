import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../../lib/unik-brand-manager";
import { sweepAbandonedOrders } from "../../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

// Mirrors the values already used by the seller dashboard and by the
// customer-facing order tracker (UnikAccountClient.tsx's TRACK_STEPS) --
// keeping the same vocabulary everywhere an order's status is shown.
const UNIK_ORDER_STATUSES = ["pending", "fulfilled", "awaiting_pickup", "picked_up", "in_transit", "out_for_delivery", "delivered", "cancelled"];
// "partial" covers a SETLA order where the first instalment has cleared
// but the plan isn't fully paid yet -- see lib/setla-instalments.ts.
const PAYMENT_STATUSES = ["awaiting_payment", "pending", "paid", "partial", "failed", "abandoned", "refunded"];

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;
  const { id } = await context.params;

  await sweepAbandonedOrders(getAdmin(), seller.id);

  const { data: order, error } = await getAdmin()
    .from("orders")
    .select("id, order_number, customer_name, customer_email, customer_phone, items, total, status, payment_status, payment_method, created_at, shipping_address, fulfillment_method, shipping_option, shipping_cost, refund_amount, notes")
    .eq("id", id)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  return NextResponse.json({ order });
}

/* Status-only for now, matching the pattern already used elsewhere in the
   platform: this updates the order record for tracking (including
   "cancelled" and "refunded"), it does not call Yoco to actually move
   money. Real refunds still happen through Yoco's own merchant portal. */
export async function PATCH(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;
  const { id } = await context.params;

  let body: { status?: string; paymentStatus?: string; refundAmount?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const update: Record<string, string | number | null> = {};
  if (body.status !== undefined) {
    if (!UNIK_ORDER_STATUSES.includes(body.status)) return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    // A SETLA order stays locked for production until its payment plan
    // says otherwise (Laybuy: fully paid; Pay Later: first instalment
    // cleared -- see lib/setla-instalments.ts) -- a Brand Manager can't
    // mark it fulfilled/shipped ahead of that, no matter what status is
    // requested here.
    if (body.status !== "pending") {
      const { data: setlaOrder } = await getAdmin().from("setla_orders").select("production_locked").eq("unik_order_id", id).maybeSingle();
      if (setlaOrder?.production_locked) {
        return NextResponse.json({ error: "This order is a SETLA plan that hasn't cleared production lock yet" }, { status: 409 });
      }
    }
    update.status = body.status;
  }
  if (body.paymentStatus !== undefined) {
    if (!PAYMENT_STATUSES.includes(body.paymentStatus)) return NextResponse.json({ error: "Invalid payment status" }, { status: 400 });
    update.payment_status = body.paymentStatus;
  }
  if (body.refundAmount !== undefined) {
    const { data: existing } = await getAdmin().from("orders").select("total").eq("id", id).eq("seller_id", seller.id).maybeSingle();
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const amount = Number(body.refundAmount);
    if (!Number.isFinite(amount) || amount < 0 || amount > Number(existing.total)) {
      return NextResponse.json({ error: "Refund amount must be between 0 and the order total" }, { status: 400 });
    }
    update.refund_amount = amount;
  }
  if (!Object.keys(update).length) return NextResponse.json({ error: "Nothing to update" }, { status: 400 });

  const { data: updated, error } = await getAdmin()
    .from("orders")
    .update(update)
    .eq("id", id)
    .eq("seller_id", seller.id)
    .select("id")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!updated) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  return NextResponse.json({ success: true });
}
