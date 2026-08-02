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
  const search = searchParams.get("search")?.trim() || "";
  const page = Math.max(1, Number(searchParams.get("page") || 1));

  let query = admin
    .from("setla_customers")
    .select("id, first_name, last_name, email, phone, id_number, application_status, identity_status, approved_limit, available_limit, payment_status, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);

  if (search) {
    query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,id_number.ilike.%${search}%`);
  }

  const { data, error, count } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ customers: data || [], total: count || 0, page, pageSize: PAGE_SIZE });
}
