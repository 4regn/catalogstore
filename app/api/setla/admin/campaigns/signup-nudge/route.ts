import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { requireSetlaAdmin } from "@/lib/setla-admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendSetlaEmail, signupNudgeEmailContent } from "@/lib/setla-email";
import { sendSignupNudgeSms } from "@/lib/setla-sms";
import { toSmsPortalDestination } from "@/lib/sms";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Bulk, admin-triggered sibling of the daily cron (app/api/cron/
// setla-signup-nudge) -- same audience and the same one-time-ever
// signup_nudge_sent_at gate, but fires right now with full visibility
// instead of trickling out up to 1000/day and only once a signup is 20+
// hours old. This is what actually clears a real backlog on demand instead
// of waiting on the cron.
//
// application_status IN ('not_applied', 'draft') -- NOT just 'not_applied'.
// See the cron's own comment for the real gap this closes: 'draft'
// customers (started the apply flow, saved progress, never submitted) used
// to be completely invisible to every nudge path.
const NOTIFICATION_TYPE = "signup_nudge";

type EligibleCustomer = {
  id: string; first_name: string; last_name: string; email: string; phone: string;
  application_status: string; signup_nudge_sent_at: string | null;
};

async function loadAudience(admin: ReturnType<typeof getAdmin>) {
  const { data, error } = await admin
    .from("setla_customers")
    .select("id, first_name, last_name, email, phone, application_status, signup_nudge_sent_at")
    .in("application_status", ["not_applied", "draft"])
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data || []) as EligibleCustomer[];
}

// Preview only -- who's currently eligible and who's already been nudged
// (ever, not just recently -- this nudge is meant as a one-time send, see
// the cron's own comment). No sending, safe to call whenever the Customers
// tab opens.
export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  try {
    const customers = await loadAudience(admin);
    return NextResponse.json({
      audience: customers.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        phone: c.phone,
        started: c.application_status === "draft",
        alreadyNudged: !!c.signup_nudge_sent_at,
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load audience" }, { status: 500 });
  }
}

// Sends the nudge. channel picks email, sms, or both; force:true re-sends
// even to customers already nudged once before (the admin panel surfaces
// that count before letting the admin opt in).
export async function POST(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  if (!rateLimit(`setla-signup-nudge-campaign:${auth.admin.id}`, 3, 300).allowed) {
    return NextResponse.json({ error: "This campaign was just sent -- please wait a few minutes before sending again." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const channel = body?.channel === "sms" || body?.channel === "both" ? body.channel : "email";
  const force = body?.force === true;
  // Explicit targeting (one or a few specific customers) bypasses the
  // already-nudged auto-skip below -- a conscious one-off, same reasoning
  // as the limit-reminder campaign's identical customerIds handling.
  const customerIds: string[] | null = Array.isArray(body?.customerIds) && body.customerIds.length
    ? body.customerIds.map((id: unknown) => String(id))
    : null;

  const admin = getAdmin();
  let customers: EligibleCustomer[];
  try {
    customers = await loadAudience(admin);
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load audience" }, { status: 500 });
  }

  let targets: EligibleCustomer[];
  let skipped: number;
  if (customerIds) {
    const idSet = new Set(customerIds);
    targets = customers.filter((c) => idSet.has(c.id));
    skipped = idSet.size - targets.length;
  } else {
    targets = force ? customers : customers.filter((c) => !c.signup_nudge_sent_at);
    skipped = customers.length - targets.length;
  }

  let emailsSent = 0, smsSent = 0, smsSkippedBadNumber = 0;
  const failures: string[] = [];

  for (const customer of targets) {
    const firstName = customer.first_name || "there";
    try {
      if (channel === "email" || channel === "both") {
        if (customer.email) {
          await sendSetlaEmail({ to: customer.email, ...signupNudgeEmailContent(firstName) });
          emailsSent++;
        }
      }
      if (channel === "sms" || channel === "both") {
        if (customer.phone && toSmsPortalDestination(customer.phone)) {
          await sendSignupNudgeSms({ to: customer.phone, firstName });
          smsSent++;
        } else if (customer.phone) {
          smsSkippedBadNumber++;
        }
      }
      // Same one-time gate the daily cron respects -- marking this here
      // means the cron will never re-nudge someone this campaign already
      // reached, and a second manual run of this campaign won't either
      // unless force:true is used again.
      await admin.from("setla_customers").update({ signup_nudge_sent_at: new Date().toISOString() }).eq("id", customer.id);
      await admin.from("setla_notifications").insert({
        customer_id: customer.id,
        notification_type: NOTIFICATION_TYPE,
        title: "Reminder: finish your SETLA application",
        body: "We reminded you to finish your SETLA application and unlock your spending limit.",
        metadata: { channel },
      });
    } catch (err: any) {
      console.error("signup-nudge campaign: send failed for customer", customer.id, err);
      failures.push(customer.id);
    }
  }

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_signup_nudge_campaign",
    target_seller_id: null,
    details: { channel, force, customerIds: customerIds || undefined, targeted: targets.length, skippedAlreadyNudged: skipped, emailsSent, smsSent, smsSkippedBadNumber, failed: failures.length },
  });

  return NextResponse.json({
    success: true,
    targeted: targets.length,
    skippedAlreadyNudged: skipped,
    emailsSent,
    smsSent,
    smsSkippedBadNumber,
    failed: failures.length,
  });
}
