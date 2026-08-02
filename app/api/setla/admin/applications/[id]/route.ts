import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

/* Full review view for one application: the application itself, the
   customer's profile, every document tied to this application (served
   via the signed-URL proxy at /api/setla/admin/documents/[id], not
   inlined here as raw URLs -- see that route for why), and their bank
   account submission. Everything a reviewer needs to make and audit a
   decision, in one call. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const admin = getAdmin();
  const { data: application, error } = await admin
    .from("setla_applications")
    .select("id, customer_id, monthly_income, monthly_expenses, status, decision_reason, proposed_limit, submitted_at, reviewed_at, reviewed_by, retry_after, submitted_ip")
    .eq("id", id)
    .maybeSingle();
  if (error || !application) return NextResponse.json({ error: "Application not found" }, { status: 404 });

  const [{ data: customer }, { data: documents }, { data: bankAccounts }] = await Promise.all([
    admin.from("setla_customers").select("id, first_name, last_name, email, phone, id_number, address, application_status, identity_status, approved_limit, available_limit, created_at").eq("id", application.customer_id).maybeSingle(),
    admin.from("setla_documents").select("id, document_type, review_status, rejection_reason, reviewed_at, reviewed_by, created_at").eq("application_id", id).order("created_at", { ascending: true }),
    admin.from("setla_bank_accounts").select("id, bank_name, account_holder_name, account_type, account_last4, review_status, reviewed_at, is_refund_account, created_at").eq("customer_id", application.customer_id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    application,
    customer,
    documents: documents || [],
    bankAccounts: bankAccounts || [],
  });
}
