import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { verifyResendWebhookSignature } from "../../../../lib/resend-webhook";

export const dynamic = "force-dynamic";

type ResendContactEvent = {
  type?: string;
  data?: { email?: string; unsubscribed?: boolean };
};

/** Sync Resend Broadcast opt-outs back to the 4REGN customer audience. */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const valid = verifyResendWebhookSignature(rawBody, {
    id: req.headers.get("svix-id") || "",
    timestamp: req.headers.get("svix-timestamp") || "",
    signature: req.headers.get("svix-signature") || "",
  });
  if (!valid) return NextResponse.json({ error: "Invalid Resend webhook signature" }, { status: 400 });

  let event: ResendContactEvent;
  try {
    event = JSON.parse(rawBody) as ResendContactEvent;
  } catch {
    return NextResponse.json({ error: "Invalid webhook payload" }, { status: 400 });
  }

  // Resend sends a contact.updated payload with data.unsubscribed set to true
  // after a Broadcast unsubscribe. Ignore unrelated email and contact events.
  if (event.type !== "contact.updated" || typeof event.data?.unsubscribed !== "boolean") {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const email = event.data.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ ok: true, ignored: true });

  const admin = getAdmin();
  const { data: seller, error: sellerError } = await admin.from("sellers")
    .select("id").eq("subdomain", "4regn").maybeSingle();
  if (sellerError || !seller) {
    console.error("Resend marketing webhook: 4REGN seller was not found", sellerError);
    return NextResponse.json({ error: "4REGN store not configured" }, { status: 500 });
  }

  const { data: updatedCustomers, error: updateError } = await admin.from("customers")
    .update({
      accepts_email_marketing: !event.data.unsubscribed,
      marketing_consent_updated_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("seller_id", seller.id)
    .ilike("email", email)
    .select("id");
  if (updateError) {
    console.error("Resend marketing webhook: customer update failed", updateError);
    return NextResponse.json({ error: "Could not update subscriber preference" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, updated: updatedCustomers?.length || 0, subscribed: !event.data.unsubscribed });
}
