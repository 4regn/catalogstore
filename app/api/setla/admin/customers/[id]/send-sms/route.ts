import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendApprovedSetlaLimitSms } from "../../../../../../../lib/setla-sms";

export const dynamic = "force-dynamic";

// SMS sibling of ../send-email -- only the "approved" nudge exists as an
// SMS today (the ask was specifically "nudge approved applicants to view
// their dashboard and start spending", not a full SMS copy of every email
// type), so this is intentionally narrower than the email version rather
// than a generic multi-type tool. Uses the customer's real phone number
// on file, same as the email route always uses their real email -- never
// an admin-typed override, so an SMS can't be misdirected to the wrong
// number.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const limitVariant = body.limitVariant === "starter" ? "starter" : "standard";

  const admin = getAdmin();
  const { data: customer } = await admin
    .from("setla_customers")
    .select("id, first_name, phone, application_status, approved_limit")
    .eq("id", id)
    .maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (customer.application_status !== "approved") {
    return NextResponse.json({ error: "This customer isn't approved -- this SMS wouldn't make sense to send right now" }, { status: 409 });
  }
  if (!customer.phone) {
    return NextResponse.json({ error: "This customer has no phone number on file" }, { status: 400 });
  }

  await sendApprovedSetlaLimitSms({ to: customer.phone, firstName: customer.first_name, approvedLimit: customer.approved_limit, variant: limitVariant });

  await admin.from("setla_notifications").insert({
    customer_id: customer.id,
    notification_type: "manual_approved_sms",
    title: "Approved limit SMS sent",
    body: `Sent a starter/standard-limit nudge SMS to ${customer.phone}.`,
  });
  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_manual_sms",
    target_seller_id: null,
    details: { customerId: id, emailType: "approved", limitVariant },
  });

  return NextResponse.json({ success: true });
}
