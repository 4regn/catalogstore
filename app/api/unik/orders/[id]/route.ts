import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";

export const dynamic = "force-dynamic";

/* Polled by checkout.html after the Yoco redirect back, to show a real
   confirmation once the webhook (which arrives independently, not
   synchronously with the redirect) has actually marked the order paid. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  const { data: order } = await getAdmin()
    .from("orders")
    .select("id, seller_id, customer_auth_user_id, status, payment_status, total, order_number")
    .eq("id", id)
    .maybeSingle();
  if (!order || order.seller_id !== seller.id || order.customer_auth_user_id !== user.id) {
    return NextResponse.json({ error: "Order not found" }, { status: 404 });
  }

  return NextResponse.json({
    status: order.status,
    paymentStatus: order.payment_status,
    total: order.total,
    orderNumber: order.order_number,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
