import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;

export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") || "0"));
  const from = page * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await getAdmin()
    .from("orders")
    .select("id, order_number, customer_name, customer_email, customer_phone, items, total, status, payment_status, payment_method, created_at, shipping_address, fulfillment_method, shipping_option, shipping_cost", { count: "exact" })
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false })
    .range(from, to);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ orders: data || [], total: count || 0, page, hasMore: (count || 0) > to + 1 });
}
