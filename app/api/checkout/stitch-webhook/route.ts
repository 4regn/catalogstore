import { NextRequest, NextResponse } from "next/server";
import { verifyStitchWebhookSignature } from "../../../../lib/stitch";

export const dynamic = "force-dynamic";

/* Stitch Express payment webhook (Svix-delivered, payment.paid events).
   Foundation only at this stage -- verifies the signature, parses the
   event, and acknowledges it, but does NOT yet touch SETLA/order state.
   That's the deliberate "thereafter" step (replacing the first SETLA
   payment, currently Yoco, with Stitch's card-consent flow) -- not done
   here so this can be reviewed and the webhook registered/tested against
   real payment.paid deliveries before anything live depends on it.

   Once that rewiring happens, this should branch on event.type/consentId
   the same way app/api/unik/checkout/webhook/route.ts already does for
   Yoco: match consentId back to the SETLA plan/instalment it belongs to,
   then call the SAME provider-agnostic lib/setla-instalments.ts functions
   that file already uses (activateSetlaPlanAfterPayment for a first
   charge, markSetlaInstalmentPaid for instalment #2+) -- those only take
   ids/amounts, nothing Yoco-specific, so no changes are needed there. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("svix-signature") || "";
  const id = req.headers.get("svix-id") || "";
  const timestamp = req.headers.get("svix-timestamp") || "";

  if (!verifyStitchWebhookSignature(rawBody, { id, timestamp, signature })) {
    console.error("Stitch webhook: signature verification failed", { hasId: !!id, hasTimestamp: !!timestamp, hasSignature: !!signature, hasSecret: !!process.env.STITCH_WEBHOOK_SECRET, bodyLength: rawBody.length });
    return NextResponse.json({ status: "error", reason: "invalid signature" }, { status: 403 });
  }

  let event: any;
  try { event = JSON.parse(rawBody); } catch {
    return NextResponse.json({ status: "error", reason: "invalid body" }, { status: 400 });
  }

  // Per Stitch's docs, exactly one of linkId/consentId/subscriptionId/
  // terminalSessionId is non-null per payload -- logged now so a real
  // payment.paid delivery can be inspected (Vercel function logs) once the
  // webhook is registered, ahead of any real logic being wired to it.
  console.log("Stitch webhook received:", {
    status: event?.status,
    type: event?.type,
    id: event?.id,
    consentId: event?.consentId,
    linkId: event?.linkId,
    subscriptionId: event?.subscriptionId,
  });

  return NextResponse.json({ status: "ok" });
}
