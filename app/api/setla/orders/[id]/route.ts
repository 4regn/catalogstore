import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { formatInstalmentDueDate } from "../../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

/* Feeds order-confirmed.html after a customer returns from Yoco -- `id`
   here is the generic orders.id (same one the checkout route's Yoco
   successUrl/cancelUrl/failureUrl carry as ?orderId=...), not setla_orders'
   own id, since that's what's actually in the URL the customer lands on. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;
  const { id } = await ctx.params;

  const admin = getAdmin();
  const { data: setlaOrder, error } = await admin
    .from("setla_orders")
    .select("id, unik_order_id, payment_method, total, setla_payment_plans(id, plan_type)")
    .eq("unik_order_id", id)
    .eq("customer_id", customer.id)
    .maybeSingle();
  if (error || !setlaOrder) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  const plan = Array.isArray(setlaOrder.setla_payment_plans) ? setlaOrder.setla_payment_plans[0] : (setlaOrder.setla_payment_plans as any);
  const [{ data: unikOrder }, { data: instalments }] = await Promise.all([
    admin.from("orders").select("id, order_number, items").eq("id", setlaOrder.unik_order_id).maybeSingle(),
    plan ? admin.from("setla_instalments").select("id, sequence_number, amount, due_at, status").eq("plan_id", plan.id).order("sequence_number", { ascending: true }) : Promise.resolve({ data: [] as any[] }),
  ]);

  const nextUnpaidIndex = (instalments || []).findIndex((i) => i.status !== "paid" && i.status !== "waived");

  return NextResponse.json({
    order: {
      id: unikOrder?.order_number || setlaOrder.id,
      methodCode: setlaOrder.payment_method === "laybuy" ? "laybuy" : "pay_later",
      method: setlaOrder.payment_method === "laybuy" ? "SETLA Laybuy" : "SETLA Pay Later",
      total: Number(setlaOrder.total),
      items: unikOrder?.items || [],
      schedule: (instalments || []).map((i, index) => ({
        instalmentId: i.id,
        amount: Number(i.amount),
        date: formatInstalmentDueDate(i.due_at),
        status: i.status,
        isNext: index === nextUnpaidIndex,
      })),
    },
  });
}
