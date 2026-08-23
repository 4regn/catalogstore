import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  const { data: setlaOrders, error } = await admin
    .from("setla_orders")
    .select("id, customer_id, unik_order_id, payment_method, total, status, production_locked, created_at")
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!setlaOrders?.length) return NextResponse.json({ purchases: [], summary: { purchases: 0, activePlans: 0, collected: 0, outstanding: 0, overdue: 0 } });

  const customerIds = [...new Set(setlaOrders.map((row) => row.customer_id))];
  const orderIds = setlaOrders.map((row) => row.id);
  const unikOrderIds = setlaOrders.map((row) => row.unik_order_id);
  const [{ data: customers }, { data: plans }, { data: orders }] = await Promise.all([
    admin.from("setla_customers").select("id, first_name, last_name, email, phone").in("id", customerIds),
    admin.from("setla_payment_plans").select("id, order_id, plan_type, principal_amount, paid_amount, status, created_at, completed_at").in("order_id", orderIds),
    admin.from("orders").select("id, seller_id, order_number, external_id, items, total, status, payment_status").in("id", unikOrderIds),
  ]);

  const planIds = (plans || []).map((row) => row.id);
  const sellerIds = [...new Set((orders || []).map((row) => row.seller_id).filter(Boolean))];
  const [{ data: instalments }, { data: laybuyPayments }, { data: sellers }] = await Promise.all([
    planIds.length
      ? admin.from("setla_instalments").select("id, plan_id, sequence_number, amount, due_at, status, paid_at, payment_provider_reference").in("plan_id", planIds).order("sequence_number", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    planIds.length
      ? admin.from("setla_laybuy_payments").select("id, plan_id, amount, is_deposit, status, paid_at, created_at").in("plan_id", planIds).order("created_at", { ascending: true })
      : Promise.resolve({ data: [] as any[] }),
    sellerIds.length
      ? admin.from("sellers").select("id, store_name, subdomain").in("id", sellerIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const customerById = new Map((customers || []).map((row) => [row.id, row]));
  const planByOrderId = new Map((plans || []).map((row) => [row.order_id, row]));
  const orderById = new Map((orders || []).map((row) => [row.id, row]));
  const sellerById = new Map((sellers || []).map((row) => [row.id, row]));
  const instalmentsByPlan = new Map<string, any[]>();
  for (const row of instalments || []) instalmentsByPlan.set(row.plan_id, [...(instalmentsByPlan.get(row.plan_id) || []), row]);
  const paymentsByPlan = new Map<string, any[]>();
  for (const row of laybuyPayments || []) paymentsByPlan.set(row.plan_id, [...(paymentsByPlan.get(row.plan_id) || []), row]);
  const now = Date.now();

  const purchases = setlaOrders.map((row) => {
    const customer = customerById.get(row.customer_id);
    const plan = planByOrderId.get(row.id);
    const order = orderById.get(row.unik_order_id);
    const seller = order ? sellerById.get(order.seller_id) : null;
    const scheduleRows = plan ? (instalmentsByPlan.get(plan.id) || []) : [];
    const ledgerRows = plan ? (paymentsByPlan.get(plan.id) || []) : [];
    const isLaybuy = row.payment_method === "laybuy" || plan?.plan_type === "laybuy";
    const schedule = isLaybuy
      ? ledgerRows.map((payment) => ({ id: payment.id, sequenceNumber: null, amount: Number(payment.amount), dueAt: payment.paid_at || payment.created_at, paidAt: payment.paid_at, status: payment.status, isDeposit: payment.is_deposit }))
      : scheduleRows.map((instalment) => ({ id: instalment.id, sequenceNumber: instalment.sequence_number, amount: Number(instalment.amount), dueAt: instalment.due_at, paidAt: instalment.paid_at, status: instalment.status, isDeposit: false }));
    const paid = schedule.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
    const outstanding = isLaybuy
      ? Math.max(0, Number(row.total) - paid)
      : schedule.filter((payment) => !["paid", "waived", "refunded"].includes(payment.status)).reduce((sum, payment) => sum + payment.amount, 0);
    const unpaid = schedule.filter((payment) => !["paid", "waived", "refunded", "failed"].includes(payment.status));
    const overdue = unpaid.filter((payment) => payment.status === "overdue" || (!!payment.dueAt && new Date(payment.dueAt).getTime() < now));
    const nextPayment = unpaid.sort((a, b) => new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())[0] || null;
    return {
      id: row.id,
      orderId: row.unik_order_id,
      orderReference: order?.external_id || (order?.order_number ? `#${order.order_number}` : row.id.slice(0, 8)),
      customer: customer ? { id: customer.id, name: `${customer.first_name} ${customer.last_name}`.trim(), email: customer.email, phone: customer.phone } : null,
      seller: seller ? { id: seller.id, name: seller.store_name, subdomain: seller.subdomain } : null,
      method: isLaybuy ? "SETLA Laybuy" : "SETLA Pay Later",
      total: Number(row.total),
      financedAmount: Number(plan?.principal_amount || row.total),
      paid,
      outstanding,
      status: overdue.length ? "overdue" : plan?.status || row.status,
      fulfillmentStatus: order?.status || row.status,
      paymentStatus: order?.payment_status || "pending",
      productionLocked: row.production_locked,
      createdAt: row.created_at,
      nextPayment,
      overdueCount: overdue.length,
      items: order?.items || [],
      schedule,
    };
  });

  const livePurchases = purchases.filter((row) => !["cancelled", "refunded"].includes(row.status));
  return NextResponse.json({
    purchases,
    summary: {
      purchases: livePurchases.length,
      activePlans: livePurchases.filter((row) => !["completed", "paid"].includes(row.status)).length,
      collected: livePurchases.reduce((sum, row) => sum + row.paid, 0),
      outstanding: livePurchases.reduce((sum, row) => sum + row.outstanding, 0),
      overdue: livePurchases.reduce((sum, row) => sum + row.overdueCount, 0),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
