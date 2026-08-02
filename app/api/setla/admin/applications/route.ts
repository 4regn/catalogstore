import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1));

  let query = admin
    .from("setla_applications")
    .select("id, customer_id, monthly_income, monthly_expenses, status, decision_reason, proposed_limit, submitted_at, reviewed_at, reviewed_by, setla_customers(id, first_name, last_name, email, phone, id_number)", { count: "exact" })
    .order("submitted_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (status) query = query.eq("status", status);

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ applications: data || [], total: count || 0, page, pageSize: PAGE_SIZE });
}
