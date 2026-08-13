import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  const slug = req.nextUrl.searchParams.get("slug") || "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId) || !slug) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("subdomain", slug).maybeSingle();
  if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const { data: order } = await admin
    .from("orders")
    .select("id, order_number, customer_name, items, total, shipping_cost, shipping_option, fulfillment_method, payment_method, payment_status, status, created_at")
    .eq("id", orderId)
    .eq("seller_id", seller.id)
    .maybeSingle();

  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  return NextResponse.json({ order }, { headers: { "Cache-Control": "no-store" } });
}
