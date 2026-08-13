import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { verifyFloatSignature } from "../../../../lib/float";
import { markUnikOrderPaid } from "../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  if (!verifyFloatSignature(rawBody, req.headers.get("x-signature") || "")) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch { return NextResponse.json({ error: "Invalid body" }, { status: 400 }); }
  const orderId = event?.client_reference_id;
  if (typeof orderId !== "string") return NextResponse.json({ error: "Missing order reference" }, { status: 400 });

  const admin = getAdmin();
  const { data: order } = await admin.from("orders").select("id, seller_id, total, items, customer_name, customer_email, payment_status, float_checkout_id").eq("id", orderId).maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (event.status === "cancelled") {
    if (order.payment_status !== "paid") {
      await admin.from("orders").update({ payment_status: "cancelled", status: "cancelled" }).eq("id", order.id).neq("payment_status", "paid");
    }
    return NextResponse.json({ status: "ok" });
  }
  if (event.status !== "successful") return NextResponse.json({ status: "ignored" });

  const receivedCents = Number(event.amount);
  const expectedCents = Math.round(Number(order.total) * 100);
  if (!Number.isInteger(receivedCents) || receivedCents !== expectedCents || event.currency !== "ZAR") {
    console.error("Float callback amount mismatch", { orderId, expectedCents, receivedCents, currency: event.currency });
    return NextResponse.json({ error: "Amount mismatch" }, { status: 409 });
  }

  const result = await markUnikOrderPaid(admin, order, order.float_checkout_id || order.id, null, "float");
  if (result === "update_failed") return NextResponse.json({ error: "Could not update order" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
