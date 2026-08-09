import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { verifyYocoWebhookSignature } from "../../../../../lib/yoco";
import { markUnikOrderPaid, markUnikOrderFailed } from "../../../../../lib/unik-orders";
import { markSetlaInstalmentPaid, markSetlaInstalmentFailed, markLaybuyPaymentPaid, markLaybuyPaymentFailed, activateSetlaPlanAfterPayment, type SetlaFirstChargeMeta } from "../../../../../lib/setla-instalments";

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
    // A SETLA first-charge checkout (Pay Later instalment #1 or a Laybuy
    // deposit) never created anything before this point -- see
    // activateSetlaPlanAfterPayment's own comment -- so there's nothing to
    // void here, unlike the instalmentId/laybuyPaymentId branches below
    // (those are for instalments #2+ / later Laybuy top-ups, which DO
    // already exist by the time they're retried). Just relabel the
    // underlying order "failed" so it doesn't sit "pending" for the full
    // hour until sweepAbandonedOrders would otherwise catch it.
    if (failedPayload.metadata?.kind === "setla_first_charge") {
      const orderId: string | undefined = failedPayload.metadata?.orderId;
      if (orderId) await markUnikOrderFailed(getAdmin(), orderId);
      return NextResponse.json({ status: "ok" });
    }
    // A SETLA instalment checkout is a separate one-off Yoco checkout from
    // an order's own -- checked first so a failed instalment payment never
    // falls through to the order-lookup logic below.
    const failedInstalmentId: string | undefined = failedPayload.metadata?.instalmentId;
    if (failedInstalmentId) {
      await markSetlaInstalmentFailed(getAdmin(), failedInstalmentId);
      return NextResponse.json({ status: "ok" });
    }
    // A Laybuy top-up is its own one-off Yoco checkout too, same reasoning
    // as the Pay Later instalment branch above.
    const failedLaybuyPaymentId: string | undefined = failedPayload.metadata?.laybuyPaymentId;
    if (failedLaybuyPaymentId) {
      await markLaybuyPaymentFailed(getAdmin(), failedLaybuyPaymentId);
      return NextResponse.json({ status: "ok" });
    }

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

  // The first charge of a NEW SETLA plan (Pay Later instalment #1, either
  // schedule variant, or a Laybuy deposit) -- see
  // activateSetlaPlanAfterPayment's own comment for why this creates the
  // setla_orders/setla_payment_plans/setla_instalments (or
  // setla_laybuy_payments) rows and claims the credit limit here, on
  // confirmed payment, instead of app/api/checkout/setla-create or
  // app/api/setla/checkout/create doing it beforehand. Checked before the
  // instalmentId/laybuyPaymentId branches below (those are for
  // instalments #2+ / later top-ups against an ALREADY-existing plan).
  if (payload.metadata?.kind === "setla_first_charge") {
    const paymentId: string | undefined = payload.id;
    const amountCents = Number(payload.amount) || 0;
    const meta = payload.metadata as SetlaFirstChargeMeta;
    if (!paymentId || !meta.orderId || !meta.customerId) {
      console.error("SETLA Yoco webhook: first-charge payment.succeeded missing identifiers", { metadata: payload.metadata });
      return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
    }
    const result = await activateSetlaPlanAfterPayment(getAdmin(), meta, paymentId, amountCents, event.id || null);
    if (!result.ok) {
      console.error("SETLA Yoco webhook: activateSetlaPlanAfterPayment failed", { orderId: meta.orderId, error: result.error });
      return NextResponse.json({ status: "error" }, { status: 500 });
    }
    return NextResponse.json({ status: "ok" });
  }

  // A SETLA instalment payment (#2+, an already-existing instalment) is
  // its own one-off Yoco checkout, distinct from a whole-order checkout --
  // branching on it here, before the order lookup even begins, means that
  // lookup is never reached for an instalment event and the existing
  // order path below is provably untouched by this.
  const instalmentId: string | undefined = payload.metadata?.instalmentId;
  if (instalmentId) {
    const instalmentPaymentId: string | undefined = payload.id;
    if (!instalmentPaymentId) {
      console.error("SETLA Yoco webhook: instalment payment.succeeded missing payment id", { instalmentId });
      return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
    }
    const result = await markSetlaInstalmentPaid(getAdmin(), { instalmentId, paymentId: instalmentPaymentId, eventId: event.id || null });
    if (!result.ok) {
      console.error("SETLA Yoco webhook: markSetlaInstalmentPaid failed", { instalmentId, error: result.error });
      return NextResponse.json({ status: "error" }, { status: 500 });
    }
    return NextResponse.json({ status: "ok" });
  }

  // A Laybuy top-up (deposit or any later custom-amount payment) is also
  // its own one-off Yoco checkout, checked before the order lookup for
  // the same reason as the Pay Later branch above.
  const laybuyPaymentId: string | undefined = payload.metadata?.laybuyPaymentId;
  if (laybuyPaymentId) {
    const laybuyPaymentProviderId: string | undefined = payload.id;
    if (!laybuyPaymentProviderId) {
      console.error("SETLA Yoco webhook: laybuy payment.succeeded missing payment id", { laybuyPaymentId });
      return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
    }
    const result = await markLaybuyPaymentPaid(getAdmin(), { paymentId: laybuyPaymentId, providerReference: laybuyPaymentProviderId, eventId: event.id || null });
    if (!result.ok) {
      console.error("SETLA Yoco webhook: markLaybuyPaymentPaid failed", { laybuyPaymentId, error: result.error });
      return NextResponse.json({ status: "error" }, { status: 500 });
    }
    return NextResponse.json({ status: "ok" });
  }

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
