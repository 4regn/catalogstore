import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { verifyStitchWebhookSignature } from "../../../../../lib/stitch";
import { markUnikOrderPaidStitch } from "../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

/* Stitch Pay By Bank webhook, mirroring app/api/unik/checkout/webhook's
   role for Yoco. Verifies the X-Stitch-Signature header, looks up the order
   by stitch_payment_request_id, and idempotently marks it paid via
   markUnikOrderPaidStitch -- self-heals via getStitchPaymentRequestStatus
   are not yet wired into /api/unik/orders/[id] the way Yoco's are; add that
   once this integration is confirmed against a real Stitch sandbox. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signatureHeader = req.headers.get("x-stitch-signature");

  if (!verifyStitchWebhookSignature(rawBody, signatureHeader)) {
    console.error("UNIK Stitch webhook: signature verification failed", { hasSignature: !!signatureHeader, hasSecret: !!process.env.STITCH_WEBHOOK_SECRET, bodyLength: rawBody.length });
    return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return NextResponse.json({ status: "error", reason: "invalid body" }, { status: 400 });
  }

  console.log("UNIK Stitch webhook received:", event?.type ?? event?.eventType, event?.id);

  // Event shape/type names are unconfirmed from docs snippets alone --
  // adjust these once a real webhook payload has been seen. Handles both a
  // top-level "type" and "eventType" field defensively.
  const eventType = event?.type ?? event?.eventType ?? "";
  const isCompleted = /complet|succeed|paid/i.test(String(eventType));
  if (!isCompleted) return NextResponse.json({ status: "ignored" });

  const paymentRequestId: string | undefined = event?.paymentRequestId ?? event?.data?.id ?? event?.payload?.id;
  const paymentId: string | null = event?.paymentId ?? event?.data?.paymentId ?? null;
  // Same unconfirmed-field caveat as above -- verify the real payload's
  // amount field name/shape before relying on this in production.
  const receivedRands: number | null = event?.amount?.quantity ?? event?.data?.amount?.quantity ?? null;
  if (!paymentRequestId) {
    console.error("UNIK Stitch webhook: missing payment request id", { event });
    return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, total, items, customer_name, customer_email, payment_status")
    .eq("stitch_payment_request_id", paymentRequestId)
    .maybeSingle();
  if (!order) {
    console.error("UNIK Stitch webhook: no order for", { paymentRequestId });
    return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json({ status: "ok", note: "already processed" });
  }

  if (receivedRands !== null && Math.abs(Number(order.total) - receivedRands) > 0.01) {
    console.error("UNIK Stitch webhook: amount mismatch", { orderId: order.id, expected: order.total, received: receivedRands });
    return NextResponse.json({ status: "error", reason: "amount mismatch" }, { status: 409 });
  }

  const result = await markUnikOrderPaidStitch(admin, order, paymentId);
  if (result === "update_failed") return NextResponse.json({ status: "error" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
