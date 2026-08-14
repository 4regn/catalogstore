import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";
import { sendSetlaEmail, sendApprovedSetlaLimitEmail, declinedEmailContent, manualReviewEmailContent } from "../../../../../../../lib/setla-email";

export const dynamic = "force-dynamic";

const DECISIONS = new Set(["approved", "declined", "manual_review"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const decision = String(body.decision || "");
  const proposedLimit = body.proposedLimit != null ? Number(body.proposedLimit) : null;
  const reason = String(body.reason || "").trim().slice(0, 500) || null;

  if (!DECISIONS.has(decision)) return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  if (decision === "approved" && (!Number.isFinite(proposedLimit) || (proposedLimit as number) <= 0)) {
    return NextResponse.json({ error: "A positive spending limit is required to approve" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: application, error: fetchErr } = await admin.from("setla_applications").select("id, customer_id, status").eq("id", id).maybeSingle();
  if (fetchErr || !application) return NextResponse.json({ error: "Application not found" }, { status: 404 });
  if (application.status === "approved" || application.status === "declined") {
    return NextResponse.json({ error: "This application has already been decided" }, { status: 409 });
  }

  const { data: customer } = await admin.from("setla_customers").select("id, first_name, email").eq("id", application.customer_id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const { error: updateAppErr } = await admin
    .from("setla_applications")
    .update({
      status: decision,
      decision_reason: reason,
      proposed_limit: decision === "approved" ? proposedLimit : null,
      reviewed_at: new Date().toISOString(),
      reviewed_by: auth.user.id,
      // A declined applicant can re-apply after 30 days -- gives them time
      // for circumstances (income, banking history) to genuinely change,
      // rather than letting an instant re-submission loop past a decline.
      retry_after: decision === "declined" ? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString() : null,
    })
    .eq("id", id);
  if (updateAppErr) return NextResponse.json({ error: updateAppErr.message }, { status: 500 });

  const customerUpdate: Record<string, unknown> = {
    application_status: decision === "manual_review" ? "pending" : decision,
  };
  if (decision === "approved") {
    customerUpdate.approved_limit = proposedLimit;
    customerUpdate.available_limit = proposedLimit;
    customerUpdate.identity_status = "verified";
    customerUpdate.payment_status = "no_active_plan";
  } else if (decision === "declined") {
    customerUpdate.identity_status = "failed";
  }
  await admin.from("setla_customers").update(customerUpdate).eq("id", customer.id);

  const title = decision === "approved" ? "Application approved" : decision === "declined" ? "Application declined" : "Application under further review";
  const body_ =
    decision === "approved"
      ? `You're approved for a SETLA spending limit of R${Number(proposedLimit).toFixed(2)}.`
      : decision === "declined"
      ? reason || "Your application wasn't approved this time. You're welcome to appeal or re-apply after 30 days."
      : "Your application needs a closer look -- we'll be in touch shortly.";
  await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: `application_${decision}`, title, body: body_ });

  if (decision === "approved") {
    await sendApprovedSetlaLimitEmail({ to: customer.email, firstName: customer.first_name, approvedLimit: proposedLimit as number });
  } else {
    const content = decision === "declined" ? declinedEmailContent(customer.first_name, reason) : manualReviewEmailContent(customer.first_name);
    await sendSetlaEmail({ to: customer.email, ...content });
  }

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_application_decision",
    target_seller_id: null,
    details: { applicationId: id, customerId: customer.id, decision, proposedLimit, reason },
  });

  return NextResponse.json({ success: true, decision });
}
