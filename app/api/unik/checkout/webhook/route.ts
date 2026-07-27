import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { verifyYocoWebhookSignature } from "../../../../../lib/yoco";
import { markUnikOrderPaid, markUnikOrderFailed } from "../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

/* Yoco payment webhook. Verifies the Svix-style signature, looks up the
   order, and idempotently marks it paid/failed -- this is the primary
   confirmation path, but /api/unik/orders/[id] also self-heals by checking
   Yoco directly in case this never arrives or is delayed (webhook
   delivery/registration can be flaky, e.g. if signature verification or
   the endpoint URL is misconfigured). */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("webhook-signature") || "";
  const id = req.headers.get("webhook-id") || "";
  const timestamp = req.headers.get("webhook-timestamp") || "";

  if (!verifyYocoWebhookSignature(rawBody, { id, timestamp, signature })) {
    console.error("UNIK Yoco webhook: signature verification failed", { hasId: !!id, hasTimestamp: !!timestamp, hasSignature: !!signature, hasSecret: !!process.env.YOCO_WEBHOOK_SECRET, bodyLength: rawBody.length });
    return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return NextResponse.json({ status: "error", reason: "invalid body" }, { status: 400 });
  }

  console.log("UNIK Yoco webhook received:", event?.type, event?.id);

  // A failed/declined payment attempt gets its own status distinct from
  // both "paid" and a plain never-attempted "abandoned" cart -- the
  // customer did try to pay, Yoco just declined it. Metadata shape mirrors
  // payment.succeeded (payload.metadata.orderId / checkoutId), per Yoco's
  // webhook convention.
  if (event?.type === "payment.failed") {
    const failedPayload = event.payload || {};
    const orderId: string | undefined = failedPayload.metadata?.orderId;
    const checkoutId: string | undefined = failedPayload.metadata?.checkoutId;
    if (!orderId && !checkoutId) {
      console.error("UNIK Yoco webhook: payment.failed missing identifiers", { metadata: failedPayload.metadata });
      return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
    }
    const admin = getAdmin();
    let targetId = orderId;
    if (!targetId && checkoutId) {
      const { data } = await admin.from("orders").select("id").eq("yoco_checkout_id", checkoutId).maybeSingle();
      targetId = data?.id;
    }
    if (!targetId) {
      console.error("UNIK Yoco webhook: payment.failed order not found", { orderId, checkoutId });
      return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
    }
    await markUnikOrderFailed(admin, targetId);
    return NextResponse.json({ status: "ok" });
  }

  if (event?.type !== "payment.succeeded") {
    return NextResponse.json({ status: "ignored" });
  }

  const payload = event.payload || {};
  // Yoco auto-adds `checkoutId` to payload.metadata, but it's undocumented
  // whether custom metadata we set at checkout creation (`orderId`) survives
  // alongside it on this event -- try our own id first since we're certain
  // of that one, then fall back to checkoutId.
  const orderIdFromMetadata: string | undefined = payload.metadata?.orderId;
  const checkoutId: string | undefined = payload.metadata?.checkoutId;
  const paymentId: string | undefined = payload.id;
  const amountCents: number = Number(payload.amount) || 0;
  const eventId: string | undefined = event.id;
  if ((!orderIdFromMetadata && !checkoutId) || !paymentId || !eventId) {
    console.error("UNIK Yoco webhook: missing identifiers", { metadata: payload.metadata, paymentId, eventId });
    return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
  }

  const admin = getAdmin();
  let order: { id: string; seller_id: string; total: number; items: any; customer_name: string; customer_email: string; payment_status: string } | null = null;
  if (orderIdFromMetadata) {
    const { data } = await admin
      .from("orders")
      .select("id, seller_id, total, items, customer_name, customer_email, payment_status")
      .eq("id", orderIdFromMetadata)
      .maybeSingle();
    order = data;
  }
  if (!order && checkoutId) {
    const { data } = await admin
      .from("orders")
      .select("id, seller_id, total, items, customer_name, customer_email, payment_status")
      .eq("yoco_checkout_id", checkoutId)
      .maybeSingle();
    order = data;
  }
  if (!order) {
    console.error("UNIK Yoco webhook: no order for", { orderIdFromMetadata, checkoutId });
    return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json({ status: "ok", note: "already processed" });
  }

  const expectedCents = Math.round(Number(order.total) * 100);
  if (Math.abs(expectedCents - amountCents) > 1) {
    console.error("UNIK Yoco webhook: amount mismatch", { orderId: order.id, expectedCents, amountCents });
    return NextResponse.json({ status: "error", reason: "amount mismatch" }, { status: 409 });
  }

  const result = await markUnikOrderPaid(admin, order, paymentId, eventId);
  if (result === "update_failed") return NextResponse.json({ status: "error" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
