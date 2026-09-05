import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { requireSetlaAdmin } from "@/lib/setla-admin";
import { rateLimit } from "@/lib/rate-limit";
import { sendSetlaEmail, limitReminderEmailContent } from "@/lib/setla-email";
import { sendLimitReminderSms } from "@/lib/setla-sms";
import { toSmsPortalDestination } from "@/lib/sms";

export const dynamic = "force-dynamic";

// A customer only counts as "nudged recently" (and gets skipped unless
// force:true) within this window, so the campaign card in the admin
// Customers panel can safely be clicked again a day later to catch anyone
// newly eligible without re-spamming everyone already nudged this week.
const RECENT_NUDGE_WINDOW_DAYS = 3;
const NOTIFICATION_TYPE = "limit_reminder";

type EligibleCustomer = {
  id: string; first_name: string; last_name: string; email: string; phone: string;
  available_limit: number;
};

async function loadAudience(admin: ReturnType<typeof getAdmin>) {
  const { data, error } = await admin
    .from("setla_customers")
    .select("id, first_name, last_name, email, phone, available_limit")
    .eq("application_status", "approved")
    .gt("available_limit", 0)
    .order("available_limit", { ascending: false });
  if (error) throw error;
  const customers = (data || []) as EligibleCustomer[];
  if (!customers.length) return { customers, recentlyNudgedIds: new Set<string>() };

  const cutoff = new Date(Date.now() - RECENT_NUDGE_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { data: recent } = await admin
    .from("setla_notifications")
    .select("customer_id")
    .eq("notification_type", NOTIFICATION_TYPE)
    .gte("created_at", cutoff)
    .in("customer_id", customers.map((c) => c.id));
  return { customers, recentlyNudgedIds: new Set((recent || []).map((r) => r.customer_id as string)) };
}

// Preview only -- who WOULD be targeted right now, and who'd be skipped as
// already nudged recently. No sending, no rate limit, safe to call as
// often as the admin panel wants (e.g. every time the Customers tab opens).
export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  try {
    const { customers, recentlyNudgedIds } = await loadAudience(admin);
    return NextResponse.json({
      audience: customers.map((c) => ({
        id: c.id,
        name: `${c.first_name} ${c.last_name}`.trim(),
        email: c.email,
        phone: c.phone,
        availableLimit: Number(c.available_limit || 0),
        recentlyNudged: recentlyNudgedIds.has(c.id),
      })),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load audience" }, { status: 500 });
  }
}

// Sends the nudge. channel picks email, sms, or both; force:true re-sends
// to everyone eligible even if already nudged within RECENT_NUDGE_WINDOW_DAYS
// (the admin panel surfaces that count before letting the admin opt in).
export async function POST(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  if (!rateLimit(`setla-limit-reminder-campaign:${auth.admin.id}`, 3, 300).allowed) {
    return NextResponse.json({ error: "This campaign was just sent -- please wait a few minutes before sending again." }, { status: 429 });
  }

  let body: any;
  try { body = await req.json(); } catch { body = {}; }
  const channel = body?.channel === "sms" || body?.channel === "both" ? body.channel : "email";
  const force = body?.force === true;

  const admin = getAdmin();
  let customers: EligibleCustomer[];
  let recentlyNudgedIds: Set<string>;
  try {
    ({ customers, recentlyNudgedIds } = await loadAudience(admin));
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Could not load audience" }, { status: 500 });
  }

  const targets = force ? customers : customers.filter((c) => !recentlyNudgedIds.has(c.id));
  const skipped = customers.length - targets.length;

  let emailsSent = 0, smsSent = 0, smsSkippedBadNumber = 0;
  const failures: string[] = [];

  for (const customer of targets) {
    const availableLimit = Number(customer.available_limit || 0);
    const firstName = customer.first_name || "there";
    try {
      if (channel === "email" || channel === "both") {
        if (customer.email) {
          await sendSetlaEmail({ to: customer.email, ...limitReminderEmailContent(firstName, availableLimit) });
          emailsSent++;
        }
      }
      if (channel === "sms" || channel === "both") {
        if (customer.phone && toSmsPortalDestination(customer.phone)) {
          await sendLimitReminderSms({ to: customer.phone, firstName, availableLimit });
          smsSent++;
        } else if (customer.phone) {
          smsSkippedBadNumber++;
        }
      }
      await admin.from("setla_notifications").insert({
        customer_id: customer.id,
        notification_type: NOTIFICATION_TYPE,
        title: "Reminder: your SETLA limit is available",
        body: `We reminded you that R${availableLimit.toFixed(2)} of your SETLA limit is still available to spend at 4REGN.`,
        metadata: { availableLimit, channel },
      });
    } catch (err: any) {
      console.error("limit-reminder campaign: send failed for customer", customer.id, err);
      failures.push(customer.id);
    }
  }

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_limit_reminder_campaign",
    target_seller_id: null,
    details: { channel, force, targeted: targets.length, skippedRecentlyNudged: skipped, emailsSent, smsSent, smsSkippedBadNumber, failed: failures.length },
  });

  return NextResponse.json({
    success: true,
    targeted: targets.length,
    skippedRecentlyNudged: skipped,
    emailsSent,
    smsSent,
    smsSkippedBadNumber,
    failed: failures.length,
  });
}
