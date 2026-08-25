import { NextRequest, NextResponse } from "next/server";
import { verifyStitchWebhookSignature } from "../../../../lib/stitch";
import { getAdmin } from "../../../../lib/supabase-admin";
import { markUnikOrderPaid } from "../../../../lib/unik-orders";
import { activateSetlaPlanAfterPayment, type SetlaFirstChargeMeta } from "../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

/* Stitch Express payment webhook (Svix-delivered). Per Stitch's own docs
   there is exactly ONE event type -- payment.paid -- delivered as a flat
   payload (no `type: "payment.paid"` envelope field, unlike Yoco):
     { amount, id, status: "PAID", type: "LINK"|"CONSENT"|"SUBSCRIPTION",
       linkId, consentId, subscriptionId, terminalSessionId }
   exactly one of linkId/consentId/subscriptionId/terminalSessionId is
   non-null, matching `type`. There is no separate failure event -- an
   abandoned/declined Stitch checkout just never fires anything, so it's
   picked up the same way an abandoned Yoco order is: sweepAbandonedOrders
   relabels it after ORDER_ABANDON_MS (see lib/unik-orders.ts).

   Two things use this endpoint:
   - type "LINK" -- the GENERIC storefront checkout's Payment Link payment
     (started by app/api/checkout/stitch-redirect via
     createStitchPaymentLink), matched via stitch_link_id.
   - type "CONSENT" -- SETLA Pay Later's FIRST instalment, charged via
     Card Consent instead of Yoco (started by
     app/api/checkout/setla-create and app/api/setla/checkout/create),
     matched via stitch_consent_id. Instalments #2+ are NOT confirmed
     here -- those are charged directly by
     app/api/cron/setla-collect-instalments, which gets a synchronous
     result from initiateStitchConsentPayment and marks them paid/failed
     inline, with no webhook round-trip needed (there's no customer
     redirect to wait on for a merchant-initiated charge).

   `type: "SUBSCRIPTION"`/`terminalSessionId` aren't used by anything on
   this platform -- ignored, not an error, since Stitch could in principle
   deliver test events of those kinds against this same registered
   endpoint. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("svix-signature") || "";
  const svixId = req.headers.get("svix-id") || "";
  const timestamp = req.headers.get("svix-timestamp") || "";

  if (!verifyStitchWebhookSignature(rawBody, { id: svixId, timestamp, signature })) {
    console.error("Stitch webhook: signature verification failed", { hasId: !!svixId, hasTimestamp: !!timestamp, hasSignature: !!signature, hasSecret: !!process.env.STITCH_WEBHOOK_SECRET, bodyLength: rawBody.length });
    return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return NextResponse.json({ status: "error", reason: "invalid body" }, { status: 400 });
  }

  // Accept both Stitch's documented flat payload and the data-wrapped form
  // used by some Svix test deliveries, while preserving signature checks.
  const payload = event?.data?.payment ?? event?.data ?? event;
  const status = String(payload?.status || "").toUpperCase();
  const type = String(payload?.type || "").toUpperCase();
  const normalized = {
    ...payload,
    status,
    type,
    linkId: payload?.linkId ?? payload?.link_id,
    consentId: payload?.consentId ?? payload?.consent_id,
  };

  console.log("Stitch webhook received:", { status, type, id: normalized.id, linkId: normalized.linkId, consentId: normalized.consentId });

  if (status !== "PAID") {
    return NextResponse.json({ status: "ignored" });
  }

  if (type === "CONSENT" && normalized.consentId) {
    return handleSetlaFirstCharge(normalized, svixId || null);
  }
  if (type === "LINK" && normalized.linkId) {
    return handleGenericCheckoutPayment(normalized, svixId || null);
  }
  return NextResponse.json({ status: "ignored" });
}

async function handleGenericCheckoutPayment(event: any, svixId: string | null) {
  const paymentId: string | undefined = event.id;
  const linkId: string = event.linkId;
  const amountCents: number = Number(event.amount) || 0;
  if (!paymentId) {
    console.error("Stitch webhook: payment.paid missing payment id", { linkId });
    return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, total, items, customer_name, customer_email, payment_status")
    .eq("stitch_link_id", linkId)
    .maybeSingle();
  if (!order) {
    console.error("Stitch webhook: no order for linkId", { linkId });
    return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json({ status: "ok", note: "already processed" });
  }

  const expectedCents = Math.round(Number(order.total) * 100);
  if (Math.abs(expectedCents - amountCents) > 1) {
    console.error("Stitch webhook: amount mismatch", { orderId: order.id, expectedCents, amountCents });
    return NextResponse.json({ status: "error", reason: "amount mismatch" }, { status: 409 });
  }

  const result = await markUnikOrderPaid(admin, order, paymentId, svixId, "stitch");
  if (result === "update_failed") return NextResponse.json({ status: "error" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}

async function handleSetlaFirstCharge(event: any, svixId: string | null) {
  const paymentId: string | undefined = event.id;
  const consentId: string = event.consentId;
  const amountCents: number = Number(event.amount) || 0;
  if (!paymentId) {
    console.error("Stitch webhook: SETLA first-charge payment.paid missing payment id", { consentId });
    return NextResponse.json({ status: "error", reason: "missing identifiers" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: order } = await admin
    .from("orders")
    .select("id, payment_status, setla_pending_stitch_meta")
    .eq("stitch_consent_id", consentId)
    .maybeSingle();
  if (!order) {
    console.error("Stitch webhook: no order for consentId", { consentId });
    return NextResponse.json({ status: "error", reason: "order not found" }, { status: 404 });
  }
  if (order.payment_status === "paid") {
    return NextResponse.json({ status: "ok", note: "already processed" });
  }
  const meta = order.setla_pending_stitch_meta as SetlaFirstChargeMeta | null;
  if (!meta) {
    console.error("Stitch webhook: order has stitch_consent_id but no setla_pending_stitch_meta", { orderId: order.id, consentId });
    return NextResponse.json({ status: "error", reason: "missing plan metadata" }, { status: 500 });
  }

  // activateSetlaPlanAfterPayment does its own amount-mismatch check
  // internally (against the exact first-instalment amount, which can
  // differ from the plain order total once excessUpfront applies) -- no
  // redundant check needed here, same as the Yoco webhook never did one
  // before calling it either.
  const result = await activateSetlaPlanAfterPayment(admin, meta, paymentId, amountCents, svixId, { provider: "stitch", consentId });
  if (!result.ok) {
    console.error("Stitch webhook: activateSetlaPlanAfterPayment failed", { orderId: order.id, error: result.error });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
  return NextResponse.json({ status: "ok" });
}
