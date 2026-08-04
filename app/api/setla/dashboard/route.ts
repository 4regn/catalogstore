import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../lib/setla-customer";
import { formatInstalmentDueDate } from "../../../../lib/setla-instalments";
import { computeProgress, DOCUMENT_TYPES } from "../../../../lib/setla-application-progress";

export const dynamic = "force-dynamic";

/* Feeds dashboard.html's renderDashboard() -- shaped to match what that
   function (still, deliberately, from the original static prototype)
   already expects: firstName/lastName/name/email/applicationStatus/
   approvedLimit/availableLimit/createdAt/application.{bank,accountLast4},
   orders:[{id,methodCode,method,total,items,schedule,createdAt}]. */
export async function GET(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  const admin = getAdmin();

  const { data: setlaOrders } = await admin
    .from("setla_orders")
    .select("id, unik_order_id, payment_method, total, created_at, setla_payment_plans(id, plan_type, principal_amount, paid_amount, min_deposit_amount, status)")
    .eq("customer_id", customer.id)
    .order("created_at", { ascending: false });

  let orders: any[] = [];
  if (setlaOrders && setlaOrders.length) {
    const unikOrderIds = setlaOrders.map((o) => o.unik_order_id);
    const planIds = setlaOrders.map((o) => (Array.isArray(o.setla_payment_plans) ? o.setla_payment_plans[0]?.id : (o.setla_payment_plans as any)?.id)).filter(Boolean);
    const [{ data: unikOrders }, { data: instalments }, { data: laybuyPayments }] = await Promise.all([
      admin.from("orders").select("id, order_number, items").in("id", unikOrderIds),
      planIds.length ? admin.from("setla_instalments").select("id, plan_id, sequence_number, amount, due_at, status").in("plan_id", planIds).order("sequence_number", { ascending: true }) : Promise.resolve({ data: [] }),
      // Laybuy has no fixed schedule -- this is the ledger of actual
      // payments made against the plan instead (paid: what's been
      // collected so far; pending: a checkout the customer started but
      // hasn't completed yet, shown so they don't lose track of it).
      planIds.length ? admin.from("setla_laybuy_payments").select("id, plan_id, amount, is_deposit, status, paid_at").in("plan_id", planIds).order("created_at", { ascending: true }) : Promise.resolve({ data: [] }),
    ]);
    const unikOrderById = new Map((unikOrders || []).map((o) => [o.id, o]));
    const instalmentsByPlan = new Map<string, typeof instalments>();
    for (const row of instalments || []) {
      const list = instalmentsByPlan.get(row.plan_id) || [];
      list.push(row);
      instalmentsByPlan.set(row.plan_id, list);
    }
    const laybuyPaymentsByPlan = new Map<string, typeof laybuyPayments>();
    for (const row of laybuyPayments || []) {
      const list = laybuyPaymentsByPlan.get(row.plan_id) || [];
      list.push(row);
      laybuyPaymentsByPlan.set(row.plan_id, list);
    }

    orders = setlaOrders.map((row) => {
      const plan = Array.isArray(row.setla_payment_plans) ? row.setla_payment_plans[0] : row.setla_payment_plans;
      const unikOrder = unikOrderById.get(row.unik_order_id);
      const isLaybuy = row.payment_method === "laybuy";

      let schedule: any[] = [];
      let laybuy: any = null;
      if (isLaybuy && plan) {
        const principal = Number(plan.principal_amount);
        const paid = Number(plan.paid_amount);
        laybuy = {
          planId: plan.id,
          principal,
          paid,
          remaining: Math.max(0, Math.round((principal - paid) * 100) / 100),
          minDeposit: plan.min_deposit_amount != null ? Number(plan.min_deposit_amount) : null,
          complete: plan.status === "completed",
          payments: (laybuyPaymentsByPlan.get(plan.id) || []).map((p: any) => ({
            amount: Number(p.amount),
            isDeposit: p.is_deposit,
            status: p.status,
            date: p.paid_at ? formatInstalmentDueDate(p.paid_at) : null,
          })),
        };
      } else if (plan) {
        const planInstalments = instalmentsByPlan.get(plan.id) || [];
        const nextUnpaidIndex = planInstalments.findIndex((i: any) => i.status !== "paid" && i.status !== "waived");
        schedule = planInstalments.map((i: any, index: number) => ({
          instalmentId: i.id,
          amount: Number(i.amount),
          date: formatInstalmentDueDate(i.due_at),
          status: i.status,
          isNext: index === nextUnpaidIndex,
        }));
      }

      return {
        id: unikOrder?.order_number || row.id,
        methodCode: isLaybuy ? "laybuy" : "pay_later",
        method: isLaybuy ? "SETLA Laybuy" : "SETLA Pay Later",
        total: Number(row.total),
        items: unikOrder?.items || [],
        schedule,
        laybuy,
        createdAt: row.created_at,
      };
    });
  }

  const [{ data: latestApplication }, { data: latestBank }, { data: notifications }, { data: draftDocs }] = await Promise.all([
    admin
      .from("setla_applications")
      .select("id, status, decision_reason, proposed_limit, submitted_at, reviewed_at")
      .eq("customer_id", customer.id)
      .order("submitted_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("setla_bank_accounts")
      .select("bank_name, account_last4, review_status, is_refund_account")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    admin
      .from("setla_notifications")
      .select("id, notification_type, title, body, metadata, read_at, created_at")
      .eq("customer_id", customer.id)
      .order("created_at", { ascending: false })
      .limit(20),
    // Only relevant while application_status is 'not_applied'/'draft' (an
    // approved/pending/declined customer already has a real application on
    // file), but cheap enough to always compute rather than branch on it.
    admin
      .from("setla_documents")
      .select("document_type")
      .eq("customer_id", customer.id)
      .is("application_id", null)
      .in("document_type", DOCUMENT_TYPES as unknown as string[]),
  ]);

  const applicationProgress = computeProgress(customer.application_draft || {}, new Set((draftDocs || []).map((d) => d.document_type)));

  const fullName = `${customer.first_name} ${customer.last_name}`.trim();

  return NextResponse.json({
    id: customer.id,
    firstName: customer.first_name,
    lastName: customer.last_name,
    name: fullName,
    email: customer.email,
    phone: customer.phone,
    address: customer.address && Object.keys(customer.address).length ? [customer.address.address, customer.address.city, customer.address.province, customer.address.postal].filter(Boolean).join(", ") : null,
    applicationStatus: customer.application_status,
    identityStatus: customer.identity_status,
    approvedLimit: Number(customer.approved_limit || 0),
    availableLimit: Number(customer.available_limit || 0),
    paymentStatus: customer.payment_status,
    createdAt: customer.created_at,
    application: latestApplication
      ? {
          id: latestApplication.id,
          status: latestApplication.status,
          submittedAt: latestApplication.submitted_at,
          reviewedAt: latestApplication.reviewed_at,
          decisionReason: latestApplication.decision_reason,
          bank: latestBank?.bank_name || null,
          accountLast4: latestBank?.account_last4 || null,
        }
      : null,
    notifications: notifications || [],
    orders,
    applicationProgress,
  });
}
