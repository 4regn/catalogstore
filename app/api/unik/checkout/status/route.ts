import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const orderId = req.nextUrl.searchParams.get("order") || "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const { data: order, error } = await getAdmin()
    .from("orders")
    .select("id, order_number, total, status, payment_status")
    .eq("id", orderId)
    .eq("seller_id", auth.seller.id)
    .eq("customer_auth_user_id", auth.user.id)
    .maybeSingle();
  if (error || !order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json(order, { headers: { "Cache-Control": "private, no-store" } });
}
