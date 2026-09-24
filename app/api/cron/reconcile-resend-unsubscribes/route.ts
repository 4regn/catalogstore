import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { reconcileSellerUnsubscribes } from "../../../../lib/resend-marketing";

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
   "the fast path" rather than "the ONLY path" going forward. The same logic
   also runs on demand from the dashboard (see
   app/api/dashboard/reconcile-unsubscribes) via reconcileSellerUnsubscribes. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const admin = getAdmin();
  try {
    const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", "4regn").maybeSingle();
    if (!seller) return NextResponse.json({ status: "ok", checked: 0, corrected: 0, note: "4regn seller not found" });

    const result = await reconcileSellerUnsubscribes(admin, seller.id);
    return NextResponse.json({ status: "ok", ...result });
  } catch (error: any) {
    console.error("Resend unsubscribe reconciliation failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Reconciliation failed" }, { status: 500 });
  }
}
