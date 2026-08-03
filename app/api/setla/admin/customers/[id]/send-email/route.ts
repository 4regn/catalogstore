import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendEmail } from "../../../../../../../lib/email";
import { sendSetlaEmail, signupNudgeEmailContent, SETLA_EMAIL_FROM, SETLA_RESEND_API_KEY, SETLA_APP_ORIGIN } from "../../../../../../../lib/setla-email";

export const dynamic = "force-dynamic";

// Manual "pick the customer, pick the email" tool for the admin panel --
// mirrors the partner resend flow in Brand Manager. One eligible
// application_status per email type keeps this honest about who a given
// email actually makes sense for (e.g. you can't send an "approved" email
// to someone who isn't approved). The decision route already auto-sends
// approved/declined/manual_review emails the moment a decision is made --
// this exists for resending those, and for "under_review", which isn't
// tied to any status change (a customer can sit in "pending" for a while
// before a decision is made, e.g. while checkout isn't ready yet).
const EMAIL_TYPES: Record<
  string,
  { eligibleStatus: string; subject: string; body: (customer: { first_name: string; approved_limit: number }) => string }
> = {
  received: {
    eligibleStatus: "pending",
    subject: "We've received your SETLA application",
    body: () =>
      "Thanks for applying to SETLA Payments. We're reviewing your identity, affordability and banking details now and will email you as soon as a decision is ready.",
  },
  under_review: {
    eligibleStatus: "pending",
    subject: "Your SETLA application is being reviewed",
    body: () =>
      "Your application is currently being reviewed. You'll hear back from us with a decision within 2-5 working days -- no need to do anything further in the meantime.",
  },
  approved: {
    eligibleStatus: "approved",
    subject: "Application approved",
    body: (customer) => `You're approved for a SETLA spending limit of R${Number(customer.approved_limit || 0).toFixed(2)}.`,
  },
  declined: {
    eligibleStatus: "declined",
    subject: "Application declined",
    body: () => "Your application wasn't approved this time. You're welcome to appeal or re-apply after 30 days.",
  },
};

// Uses the branded shell (lib/setla-email.ts) instead of the plain-text
// one above -- same signup-nudge content the daily cron sends, exposed
// here so an admin can nudge any specific not-yet-applied customer on
// demand instead of waiting for the ~20h cron window. Sending it here also
// stamps signup_nudge_sent_at, so the cron won't also send its own copy
// later.
const BRANDED_EMAIL_TYPES: Record<string, { eligibleStatus: string }> = {
  signup_nudge: { eligibleStatus: "not_applied" },
};

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const emailType = String(body.emailType || "");
  const plainType = EMAIL_TYPES[emailType];
  const brandedType = BRANDED_EMAIL_TYPES[emailType];
  if (!plainType && !brandedType) return NextResponse.json({ error: "Invalid email type" }, { status: 400 });

  // Redirects delivery only -- content/personalisation still comes from
  // the real customer below, and the eligibility check still applies to
  // their real application status. Lets an admin see exactly what a
  // customer's email looks like without needing access to their inbox
  // (testing the new sender domain, spot-checking copy, etc).
  const overrideEmailRaw = String(body.overrideEmail || "").trim();
  if (overrideEmailRaw && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(overrideEmailRaw)) {
    return NextResponse.json({ error: "That doesn't look like a valid email address" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: customer } = await admin
    .from("setla_customers")
    .select("id, first_name, email, application_status, approved_limit")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const eligibleStatus = (plainType || brandedType)!.eligibleStatus;
  if (customer.application_status !== eligibleStatus) {
    return NextResponse.json(
      { error: `This customer's application isn't ${eligibleStatus.replace("_", " ")} -- this email wouldn't make sense to send right now` },
      { status: 409 }
    );
  }

  const deliverTo = overrideEmailRaw || customer.email;

  if (brandedType) {
    const content = signupNudgeEmailContent(customer.first_name);
    await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: `manual_${emailType}`, title: content.subject, body: content.headline });
    await sendSetlaEmail({ ...content, to: deliverTo });
    await admin.from("setla_customers").update({ signup_nudge_sent_at: new Date().toISOString() }).eq("id", customer.id);
  } else {
    const type = plainType!;
    const message = type.body(customer);
    await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: `manual_${emailType}`, title: type.subject, body: message });
    await sendEmail({
      to: deliverTo,
      from: SETLA_EMAIL_FROM,
      apiKey: SETLA_RESEND_API_KEY,
      subject: type.subject,
      html: `<p>Hi ${customer.first_name},</p><p>${message}</p><p>You can check your application status any time from your <a href="${SETLA_APP_ORIGIN}/setla/dashboard.html">SETLA dashboard</a>.</p>`,
    });
  }

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_manual_email",
    target_seller_id: null,
    details: { customerId: id, emailType, deliveredTo: overrideEmailRaw ? deliverTo : undefined },
  });

  return NextResponse.json({ success: true });
}
