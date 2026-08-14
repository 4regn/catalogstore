import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendSetlaEmail, sendApprovedSetlaLimitEmail, SETLA_EMAIL_TYPES } from "../../../../../../../lib/setla-email";

export const dynamic = "force-dynamic";

// Manual "pick the customer, pick the email" tool for the admin panel --
// mirrors the partner resend flow in Brand Manager. One eligible
// application_status per email type keeps this honest about who a given
// email actually makes sense for (e.g. you can't send an "approved" email
// to someone who isn't approved). The decision route already auto-sends
// approved/declined/manual_review emails the moment a decision is made --
// this exists for resending those, and for "under_review"/"signup_nudge",
// which aren't tied to any status change. See app/api/setla/admin/
// send-test-email for the no-customer-required version of this same tool.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const emailType = String(body.emailType || "");
  const type = SETLA_EMAIL_TYPES[emailType];
  if (!type) return NextResponse.json({ error: "Invalid email type" }, { status: 400 });

  // Redirects delivery only -- content/personalisation still comes from
  // the real customer below, and the eligibility check still applies to
  // their real application status. Lets an admin see exactly what a
  // customer's email looks like without needing access to their inbox
  // (testing the sender domain, spot-checking copy, etc).
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

  if (customer.application_status !== type.eligibleStatus) {
    return NextResponse.json(
      { error: `This customer's application isn't ${type.eligibleStatus.replace("_", " ")} -- this email wouldn't make sense to send right now` },
      { status: 409 }
    );
  }

  const deliverTo = overrideEmailRaw || customer.email;
  const content = type.content(customer.first_name, customer.approved_limit);
  await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: `manual_${emailType}`, title: content.subject, body: content.headline });
  if (emailType === "approved") {
    await sendApprovedSetlaLimitEmail({ to: deliverTo, firstName: customer.first_name, approvedLimit: customer.approved_limit });
  } else {
    await sendSetlaEmail({ ...content, to: deliverTo });
  }
  if (emailType === "signup_nudge") {
    await admin.from("setla_customers").update({ signup_nudge_sent_at: new Date().toISOString() }).eq("id", customer.id);
  }

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_manual_email",
    target_seller_id: null,
    details: { customerId: id, emailType, deliveredTo: overrideEmailRaw ? deliverTo : undefined },
  });

  return NextResponse.json({ success: true });
}
