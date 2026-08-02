import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "pending";

  const { data, error } = await admin
    .from("setla_bank_accounts")
    .select("id, customer_id, bank_name, account_holder_name, account_type, account_last4, review_status, is_refund_account, created_at, setla_customers(id, first_name, last_name, email, id_number)")
    .eq("review_status", status)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ bankAccounts: data || [] });
}
