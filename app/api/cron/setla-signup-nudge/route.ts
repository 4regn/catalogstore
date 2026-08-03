import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { sendSetlaEmail } from "../../../../lib/setla-email";

export const dynamic = "force-dynamic";

// The headline figure advertised in the nudge email -- an aspirational
// ceiling, not a promise, so the copy is explicit that it's "up to" and
// depends on the application. One constant to change if the real policy
// ceiling changes.
const MAX_LIMIT = 5000;

// Daily Vercel cron: anyone who signed up but hasn't finished their
// application within a day tends to just forget -- this is the one
// reminder they get (signup_nudge_sent_at makes it a one-time send, not a
// daily nag). Deliberately reassures upfront that a lower starting limit
// isn't a rejection and grows with on-time repayment, since a small first
// limit landing with no context is what actually risks losing someone who
// was about to become a repeat customer.
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
    .eq("application_status", "not_applied")
    .is("signup_nudge_sent_at", null)
    .lte("created_at", cutoff)
    .limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  let sent = 0;
  for (const customer of customers || []) {
    await sendSetlaEmail({
      to: customer.email,
      firstName: customer.first_name,
      subject: `Unlock up to R${MAX_LIMIT.toLocaleString("en-ZA")} with SETLA`,
      kicker: "Your spending power",
      headline: "Find out how much you qualify for.",
      bodyHtml: `You signed up for SETLA, but your application isn't done yet &mdash; it only takes a few minutes. Approved customers can unlock spending limits of up to <strong style="color:#fff">R${MAX_LIMIT.toLocaleString("en-ZA")}</strong>, based on their application.`,
      extraHtml: `<p style="font-size:13px;line-height:1.7;color:#9ba29b;margin:0 0 24px 0">Your starting limit reflects your application today &mdash; it isn't fixed. Repay on time and your limit grows from there.</p>`,
      ctaLabel: "Complete my application",
      ctaUrl: `${process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za"}/setla/apply.html`,
    });
    await admin.from("setla_customers").update({ signup_nudge_sent_at: new Date().toISOString() }).eq("id", customer.id);
    sent++;
  }

  return NextResponse.json({ status: "ok", sent });
}
