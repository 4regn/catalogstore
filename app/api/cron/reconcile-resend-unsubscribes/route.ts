import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { listSegmentContacts } from "../../../../lib/resend-marketing";

export const dynamic = "force-dynamic";

/* Safety net for exactly the failure that prompted this: the
   contact.updated webhook (app/api/webhooks/resend-marketing) sat disabled
   in Resend's dashboard for 25 days with nobody noticing, so every
   unsubscribe in that window never reached customers.accepts_email_marketing.
   Runs daily (see vercel.json -- Vercel's Hobby plan caps cron jobs at
   once/day; a more frequent schedule fails the ENTIRE deployment, not just
   this route, which is exactly what happened the last time a cron here was
   scheduled more often than that) and treats Resend's own unsubscribed flag
   as authoritative, correcting the local row either direction wherever they
   disagree -- not just the webhook going down again, but any other gap
   (a failed delivery, a contact added to Resend directly, etc). This
   doesn't replace the webhook (which is still the fast path -- this cron
   only catches up once a day), it's what makes the webhook merely
   "the fast path" rather than "the ONLY path" going forward. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  try {
    const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", "4regn").maybeSingle();
    if (!seller) return NextResponse.json({ status: "ok", checked: 0, corrected: 0, note: "4regn seller not found" });

    const { data: settings } = await admin.from("marketing_email_settings").select("resend_segment_id").eq("seller_id", seller.id).maybeSingle();
    if (!settings?.resend_segment_id) return NextResponse.json({ status: "ok", checked: 0, corrected: 0, note: "No Resend segment configured yet" });

    const [resendContacts, localCustomersRes] = await Promise.all([
      listSegmentContacts(settings.resend_segment_id),
      admin.from("customers").select("id, email, accepts_email_marketing").eq("seller_id", seller.id),
    ]);

    const localByEmail = new Map((localCustomersRes.data || []).map((c) => [String(c.email || "").trim().toLowerCase(), c]));

    let corrected = 0;
    const nowIso = new Date().toISOString();
    for (const contact of resendContacts) {
      const email = String(contact.email || "").trim().toLowerCase();
      if (!email) continue;
      const local = localByEmail.get(email);
      if (!local) continue; // Resend contact with no matching local customer row -- nothing to reconcile.
      const shouldAcceptMarketing = !contact.unsubscribed;
      if (local.accepts_email_marketing === shouldAcceptMarketing) continue;

      const { error } = await admin
        .from("customers")
        .update({ accepts_email_marketing: shouldAcceptMarketing, marketing_consent_updated_at: nowIso, updated_at: nowIso })
        .eq("id", local.id);
      if (!error) corrected++;
    }

    return NextResponse.json({ status: "ok", checked: resendContacts.length, corrected });
  } catch (error: any) {
    console.error("Resend unsubscribe reconciliation failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Reconciliation failed" }, { status: 500 });
  }
}
