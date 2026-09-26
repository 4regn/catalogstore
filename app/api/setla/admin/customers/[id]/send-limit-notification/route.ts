import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendSetlaEmail, limitAdjustedEmailContent } from "../../../../../../../lib/setla-email";
import { sendLimitAdjustedSms } from "../../../../../../../lib/setla-sms";

export const dynamic = "force-dynamic";

// Manual "notify this customer their limit changed" tool -- deliberately
// separate from app/api/setla/admin/customers/[id]/adjust-limit, which used
// to send this email itself the instant a limit was saved. That meant an
// admin correcting a typo'd limit, or just testing a value, had no way to
// stop the customer being emailed/texted about it. Now adjusting a limit
// only ever updates the number; an admin clicks "Send limit update" here,
// whenever (and if) they actually want the customer notified.
//
// `increased` decides the tone (exciting "your limit went up!" vs a plain
// "your limit has changed") and is accepted from the caller when known --
// the admin panel captures it right at the moment a limit is saved, since
// it still has the before/after numbers in hand. If the panel is opened
// fresh later (no adjustment made this session) and doesn't send it, this
// falls back to the most recent setla_limit_adjustment audit-log entry for
// this customer to work out whether their CURRENT approved_limit is above
// or below what it was before that last change -- same source
// adjust-limit's own audit entry already writes, just read back here
// instead of duplicating a "previous limit" column on setla_customers.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const channel = body.channel === "sms" ? "sms" : body.channel === "both" ? "both" : "email";
  const reasonOverride = typeof body.reason === "string" ? body.reason.trim().slice(0, 500) : "";
  const increasedOverride = typeof body.increased === "boolean" ? body.increased : null;

  const admin = getAdmin();
  const { data: customer, error: fetchErr } = await admin
    .from("setla_customers")
    .select("id, first_name, email, phone, application_status, approved_limit")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (customer.application_status !== "approved") {
    return NextResponse.json({ error: "Only an approved customer has a limit to notify them about" }, { status: 409 });
  }
  if ((channel === "sms" || channel === "both") && !customer.phone) {
    return NextResponse.json({ error: "This customer has no phone number on file" }, { status: 400 });
  }

  let increased = increasedOverride;
  let reason = reasonOverride || null;
  if (increased === null) {
    const { data: recentAdjustments } = await admin
      .from("admin_audit_log")
      .select("details, created_at")
      .eq("action", "setla_limit_adjustment")
      .order("created_at", { ascending: false })
      .limit(50);
    const lastForCustomer = (recentAdjustments || []).find((row: any) => row.details?.customerId === id);
    const previousApproved = Number(lastForCustomer?.details?.previousApproved);
    // Defaults to "increased" framing when there's simply no audit trail to
    // compare against (e.g. the very first adjustment ever made before this
    // route existed) -- an admin reaching for this button is overwhelmingly
    // celebrating a raise, not a cut, so that's the safer default tone.
    increased = Number.isFinite(previousApproved) ? Number(customer.approved_limit) > previousApproved : true;
    if (!reason && typeof lastForCustomer?.details?.reason === "string") reason = lastForCustomer.details.reason;
  }

  if (channel === "email" || channel === "both") {
    await sendSetlaEmail({ to: customer.email, ...limitAdjustedEmailContent(customer.first_name, customer.approved_limit, increased, reason) });
  }
  if (channel === "sms" || channel === "both") {
    await sendLimitAdjustedSms({ to: customer.phone, firstName: customer.first_name, newLimit: customer.approved_limit, increased });
  }

  await admin.from("setla_notifications").insert({
    customer_id: customer.id,
    notification_type: "manual_limit_adjusted",
    title: increased ? "Limit increase notification sent" : "Limit update notification sent",
    body: `Sent a ${channel} notification about their R${Number(customer.approved_limit).toFixed(2)} limit.`,
  });
  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_manual_limit_notification",
    target_seller_id: null,
    details: { customerId: id, channel, increased, approvedLimit: customer.approved_limit, reason },
  });

  return NextResponse.json({ success: true, increased });
}
