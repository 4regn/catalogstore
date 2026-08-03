import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendEmail } from "../../../../../../../lib/email";

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

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const emailType = String(body.emailType || "");
  const type = EMAIL_TYPES[emailType];
  if (!type) return NextResponse.json({ error: "Invalid email type" }, { status: 400 });

  const admin = getAdmin();
  const { data: customer } = await admin
    .from("setla_customers")
    .select("id, first_name, email, application_status, approved_limit")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (customer.application_status !== type.eligibleStatus) {
    return NextResponse.json(
      { error: `This customer's application isn't ${type.eligibleStatus.replace("_", " ")} -- this email wouldn't make sense to send right now` },
      { status: 409 }
    );
  }

  const message = type.body(customer);
  await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: `manual_${emailType}`, title: type.subject, body: message });

  await sendEmail({
    to: customer.email,
    from: "SETLA Payments <orders@catalogstore.co.za>",
    subject: type.subject,
    html: `<p>Hi ${customer.first_name},</p><p>${message}</p><p>You can check your application status any time from your <a href="${new URL(req.url).origin}/setla/dashboard.html">SETLA dashboard</a>.</p>`,
  });

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_manual_email",
    target_seller_id: null,
    details: { customerId: id, emailType },
  });

  return NextResponse.json({ success: true });
}
