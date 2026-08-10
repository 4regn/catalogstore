import { NextRequest, NextResponse } from "next/server";
import { verifyStitchWebhookSignature } from "../../../../lib/stitch";
import { getAdmin } from "../../../../lib/supabase-admin";
import { markUnikOrderPaid } from "../../../../lib/unik-orders";

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

   This handles the GENERIC storefront checkout's Payment Link payment
   (type "LINK", started by app/api/checkout/stitch-redirect via
   createStitchPaymentLink) -- matches back to the order via
   stitch_link_id the same way Yoco's webhook matches via
   yoco_checkout_id, then reuses the same markUnikOrderPaid used by every
   other gateway's webhook, passing provider:"stitch" so it writes
   stitch_payment_id/stitch_event_id instead of Yoco's columns.

   `type: "CONSENT"`/`"SUBSCRIPTION"`/`"terminalSessionId"` aren't used by
   anything on this platform yet -- Card Consent needs a scope this
   account doesn't have approved for its LIVE client (see lib/stitch.ts's
   own comment), and is reserved for SETLA's future recurring-instalment
   automation, not the generic checkout. Ignored here, not an error,
   since Stitch could in principle deliver test events of those kinds
   against this same registered endpoint.

   SETLA's own first-payment/instalment automation (replacing the Yoco
   leg of lib/setla-instalments.ts with Stitch's Card Consent flow) is a
   later, separate step, blocked on that scope being approved -- once
   that's wired, this should branch on a SETLA-specific metadata marker
   the same way app/api/unik/checkout/webhook/route.ts branches on
   payload.metadata?.kind/instalmentId/laybuyPaymentId, calling
   activateSetlaPlanAfterPayment/markSetlaInstalmentPaid/
   markLaybuyPaymentPaid. */
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

  console.log("Stitch webhook received:", { status: event?.status, type: event?.type, id: event?.id, linkId: event?.linkId });

  if (event?.status !== "PAID" || event?.type !== "LINK" || !event?.linkId) {
    return NextResponse.json({ status: "ignored" });
  }

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

  const result = await markUnikOrderPaid(admin, order, paymentId, svixId || null, "stitch");
  if (result === "update_failed") return NextResponse.json({ status: "error" }, { status: 500 });
  return NextResponse.json({ status: "ok" });
}
