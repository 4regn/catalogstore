import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["approved", "rejected", "manual_review"]);

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const body = await req.json().catch(() => ({}));
  const reviewStatus = String(body.reviewStatus || "");
  const reason = String(body.reason || "").trim().slice(0, 300) || null;
  if (!STATUSES.has(reviewStatus)) return NextResponse.json({ error: "Invalid review status" }, { status: 400 });

  const admin = getAdmin();
  const { data: account, error: fetchErr } = await admin.from("setla_bank_accounts").select("id, customer_id").eq("id", id).maybeSingle();
  if (fetchErr || !account) return NextResponse.json({ error: "Bank account not found" }, { status: 404 });

  if (reviewStatus === "approved") {
    // Only one row can be the active refund account per customer at a
    // time (setla_one_refund_account_idx enforces this at the DB level
    // too) -- unset the old one first, then set the new one, rather than
    // a single update that could race with the partial unique index.
    await admin.from("setla_bank_accounts").update({ is_refund_account: false }).eq("customer_id", account.customer_id).eq("is_refund_account", true);
    const { error: approveErr } = await admin
      .from("setla_bank_accounts")
      .update({ review_status: "approved", is_refund_account: true, reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
      .eq("id", id);
    if (approveErr) return NextResponse.json({ error: approveErr.message }, { status: 500 });
  } else {
    const { error: updateErr } = await admin
      .from("setla_bank_accounts")
      .update({ review_status: reviewStatus, reviewed_at: new Date().toISOString(), reviewed_by: auth.user.id })
      .eq("id", id);
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  await admin.from("setla_notifications").insert({
    customer_id: account.customer_id,
    notification_type: `bank_account_${reviewStatus}`,
    title: reviewStatus === "approved" ? "Banking details approved" : "Banking details need attention",
    body: reviewStatus === "approved" ? "Your banking details have been verified and are now your active refund account." : reason || "We couldn't verify your banking details -- please check them and resubmit.",
  });

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_bank_account_review",
    target_seller_id: null,
    details: { bankAccountId: id, customerId: account.customer_id, reviewStatus, reason },
  });

  return NextResponse.json({ success: true });
}
