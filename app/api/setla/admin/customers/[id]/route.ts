import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

/* The "one customer, everything" screen: profile, every application
   they've ever submitted, their documents and bank accounts across all
   of those, and their notifications. Orders/instalments/appeals join in
   once those phases exist -- this shape is built to grow, not to be
   revisited from scratch each phase. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const admin = getAdmin();
  const { data: customer, error } = await admin
    .from("setla_customers")
    .select("id, first_name, last_name, email, phone, id_number, address, application_status, identity_status, approved_limit, available_limit, payment_status, created_at")
    .eq("id", id)
    .maybeSingle();
  if (error || !customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const [{ data: applications }, { data: documents }, { data: bankAccounts }, { data: notifications }] = await Promise.all([
    admin.from("setla_applications").select("id, status, decision_reason, proposed_limit, submitted_at, reviewed_at").eq("customer_id", id).order("submitted_at", { ascending: false }),
    admin.from("setla_documents").select("id, application_id, document_type, review_status, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    admin.from("setla_bank_accounts").select("id, bank_name, account_holder_name, account_type, account_last4, review_status, is_refund_account, created_at").eq("customer_id", id).order("created_at", { ascending: false }),
    admin.from("setla_notifications").select("id, notification_type, title, body, created_at").eq("customer_id", id).order("created_at", { ascending: false }).limit(20),
  ]);

  return NextResponse.json({
    customer,
    applications: applications || [],
    documents: documents || [],
    bankAccounts: bankAccounts || [],
    notifications: notifications || [],
  });
}
