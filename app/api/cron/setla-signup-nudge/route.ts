import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { sendSetlaEmail, signupNudgeEmailContent } from "../../../../lib/setla-email";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily Vercel cron: anyone who signed up but hasn't finished their
// application within a day tends to just forget -- this is the one
// reminder they get (signup_nudge_sent_at makes it a one-time send, not a
// daily nag). Deliberately reassures upfront that a lower starting limit
// isn't a rejection and grows with on-time repayment, since a small first
// limit landing with no context is what actually risks losing someone who
// was about to become a repeat customer.
//
// application_status IN ('not_applied', 'draft') -- NOT just 'not_applied'.
// 'draft' is a real, separate status (see app/api/setla/apply/draft/route.ts):
// a customer who opened the apply flow and saved at least one field/document
// but never hit final submit. Only matching 'not_applied' silently excluded
// every one of them from this nudge entirely -- confirmed live as the real
// cause of "the nudge barely reaches anyone": roughly half of everyone who
// hadn't submitted an application were sitting in 'draft', permanently
// invisible to this query.
//
// limit raised from 200 to 1000 (Postgres/PostgREST's own row cap, so this
// is really "no cap" short of paging) -- 200 was an arbitrary ceiling that,
// combined with the 'draft' gap above, meant a real backlog could accumulate
// indefinitely with only a fraction of it ever nudged. 1000 sequential sends
// at realistic email-API latency comfortably fits the 60s budget above; if
// the eligible pool ever regularly exceeds that, this needs paging instead
// of a higher number.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }
  }

  const admin = getAdmin();
  const cutoff = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();

  const { data: customers, error } = await admin
    .from("setla_customers")
    .select("id, first_name, email")
    .in("application_status", ["not_applied", "draft"])
    .is("signup_nudge_sent_at", null)
    .lte("created_at", cutoff)
    .limit(1000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const customer of customers || []) {
    await sendSetlaEmail({ to: customer.email, ...signupNudgeEmailContent(customer.first_name) });
    await admin.from("setla_customers").update({ signup_nudge_sent_at: new Date().toISOString() }).eq("id", customer.id);
    sent++;
  }

  return NextResponse.json({ status: "ok", sent });
}
