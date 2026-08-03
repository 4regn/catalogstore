import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendEmail } from "../../../../../../../lib/email";
import { SETLA_EMAIL_FROM, SETLA_RESEND_API_KEY } from "../../../../../../../lib/setla-email";

export const dynamic = "force-dynamic";

/* Rewards good repayment behaviour (or corrects an over/under-approval)
   with a new approved_limit after the initial application decision.
   available_limit shifts by the same delta rather than being reset to
   the new limit outright, so an already-approved customer who has since
   spent part of their limit (once Phase 2 orders exist) keeps that spend
   reflected instead of getting a full refill on every adjustment. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const newLimit = Number(body.newLimit);
  const reason = String(body.reason || "").trim().slice(0, 500) || null;

  if (!Number.isFinite(newLimit) || newLimit <= 0) {
    return NextResponse.json({ error: "Enter a valid spending limit" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: customer, error: fetchErr } = await admin
    .from("setla_customers")
    .select("id, first_name, email, application_status, approved_limit, available_limit")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  if (customer.application_status !== "approved") {
    return NextResponse.json({ error: "Only an approved customer's limit can be adjusted" }, { status: 409 });
  }

  const previousApproved = Number(customer.approved_limit || 0);
  const previousAvailable = Number(customer.available_limit || 0);
  if (newLimit === previousApproved) {
    return NextResponse.json({ error: "That's already their current limit" }, { status: 400 });
  }
  const newAvailable = Math.max(0, Math.min(newLimit, previousAvailable + (newLimit - previousApproved)));

  const { error: updateErr } = await admin
    .from("setla_customers")
    .update({ approved_limit: newLimit, available_limit: newAvailable })
    .eq("id", id);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  const increased = newLimit > previousApproved;
  const title = increased ? "Your SETLA limit has increased" : "Your SETLA limit has changed";
  const notifyBody = increased
    ? `Good news -- based on your account, your SETLA spending limit is now R${newLimit.toFixed(2)}.`
    : `Your SETLA spending limit has been updated to R${newLimit.toFixed(2)}.`;
  await admin.from("setla_notifications").insert({ customer_id: id, notification_type: "limit_adjusted", title, body: notifyBody });

  await sendEmail({
    to: customer.email,
    from: SETLA_EMAIL_FROM,
    apiKey: SETLA_RESEND_API_KEY,
    subject: title,
    html: `<p>Hi ${customer.first_name},</p><p>${notifyBody}</p>${reason ? `<p>${reason}</p>` : ""}`,
  });

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_limit_adjustment",
    target_seller_id: null,
    details: { customerId: id, previousApproved, newLimit, previousAvailable, newAvailable, reason },
  });

  return NextResponse.json({ success: true, approvedLimit: newLimit, availableLimit: newAvailable });
}
