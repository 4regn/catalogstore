import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";

export type SetlaPlanType = "pay_later" | "laybuy";

// Fixed for now -- the business is still deciding whether to offer
// multiple repayment tiers/customer choice. Isolated here as the one place
// that would change if/when that's decided, instead of being duplicated
// across the checkout route and any future admin tooling.
const PLAN_CONFIG: Record<SetlaPlanType, { count: number; intervalDays: number }> = {
  pay_later: { count: 3, intervalDays: 14 },
  laybuy: { count: 4, intervalDays: 7 },
};

/* Server-side port of setla.js's old client-only splitAmount()/dateAfter()
   -- splits to the cent, remainder cents go to the earliest instalments.
   Instalment #1 is always due immediately (paid at checkout itself). */
export function buildInstalmentSchedule(total: number, planType: SetlaPlanType): Array<{ sequenceNumber: number; amount: number; dueAt: Date }> {
  const { count, intervalDays } = PLAN_CONFIG[planType];
  const cents = Math.round(Number(total) * 100);
  const base = Math.floor(cents / count);
  const parts = Array(count).fill(base);
  for (let i = 0; i < cents - base * count; i++) parts[i]++;
  const now = new Date();
  return parts.map((amountCents, index) => ({
    sequenceNumber: index + 1,
    amount: amountCents / 100,
    dueAt: index === 0 ? now : new Date(now.getTime() + index * intervalDays * 24 * 60 * 60 * 1000),
  }));
}

/* Idempotently marks one SETLA instalment paid, then cascades: updates the
   plan's paid_amount, decides whether production unlocks (pay_later:
   unlocks the moment instalment #1 clears, since it's a credit product and
   the customer is already trusted for the balance; laybuy: only once every
   instalment is paid, matching the "production begins once the balance is
   complete" promise already shown to customers), and on the plan's last
   instalment marks it completed. Shared between the Yoco webhook (primary
   path) and the admin manual-mark-paid route -- one implementation of
   "what happens when an instalment is paid", not two. */
export async function markSetlaInstalmentPaid(
  admin: SupabaseClient,
  params: { instalmentId: string; paymentId: string; eventId?: string | null }
): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const { instalmentId, paymentId, eventId } = params;

  // The real idempotency guarantee: a conditional update scoped to
  // not-yet-paid statuses. A retried webhook for an already-paid
  // instalment affects 0 rows and is treated as a harmless no-op below,
  // same shape as markUnikOrderPaid's own pattern.
  const { data: updated, error: updateErr } = await admin
    .from("setla_instalments")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_provider_reference: paymentId, yoco_event_id: eventId || null })
    .eq("id", instalmentId)
    .in("status", ["scheduled", "processing", "overdue"])
    .select("id, plan_id, sequence_number, amount")
    .maybeSingle();
  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated) return { ok: true, alreadyProcessed: true };

  const { data: plan } = await admin
    .from("setla_payment_plans")
    .select("id, customer_id, order_id, plan_type, paid_amount")
    .eq("id", updated.plan_id)
    .single();
  if (!plan) return { ok: false, error: "Payment plan not found" };

  const newPaidAmount = Number(plan.paid_amount) + Number(updated.amount);
  await admin.from("setla_payment_plans").update({ paid_amount: newPaidAmount }).eq("id", plan.id);

  const { data: order } = await admin.from("setla_orders").select("id, unik_order_id, production_locked, status").eq("id", plan.order_id).single();
  if (!order) return { ok: false, error: "Order not found" };

  const { data: allInstalments } = await admin.from("setla_instalments").select("status").eq("plan_id", plan.id);
  const planComplete = (allInstalments || []).every((i) => i.status === "paid" || i.status === "waived");
  const shouldUnlock = plan.plan_type === "pay_later" ? updated.sequence_number === 1 : planComplete;

  const newSetlaOrderStatus = planComplete ? "paid" : shouldUnlock ? "production" : "partially_paid";
  if (newSetlaOrderStatus !== order.status || (shouldUnlock && order.production_locked)) {
    await admin.from("setla_orders").update({ status: newSetlaOrderStatus, production_locked: shouldUnlock ? false : order.production_locked }).eq("id", order.id);
  }

  if (planComplete) {
    await admin.from("setla_payment_plans").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", plan.id);
  }

  // orders.status mirrors the vocabulary markUnikOrderPaid already uses
  // ("confirmed" on a genuine payment) rather than SETLA's own finer-
  // grained statuses -- this is the shared, generic orders table the rest
  // of the platform (Brand Manager, seller overview) already reads.
  await admin.from("orders").update({ status: "confirmed", payment_status: planComplete ? "paid" : "partial" }).eq("id", order.unik_order_id);

  const { data: customer } = await admin.from("setla_customers").select("id, first_name, email").eq("id", plan.customer_id).single();
  if (customer) {
    const title = planComplete ? "Your SETLA payment plan is complete" : shouldUnlock ? "Payment received — your order is in production" : "Instalment payment received";
    const body = planComplete
      ? "Your final instalment has been received and your SETLA payment plan is now fully paid. Thank you!"
      : shouldUnlock
      ? `We've received your payment of R${updated.amount.toFixed(2)}. Your order is now with UNIK Labs for production.`
      : `We've received your instalment payment of R${updated.amount.toFixed(2)}.`;
    await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: "instalment_paid", title, body });
    await sendEmail({ to: customer.email, from: "SETLA Payments <orders@catalogstore.co.za>", subject: title, html: `<p>Hi ${customer.first_name},</p><p>${body}</p>` });
  }

  return { ok: true };
}

/* Matches setla.js's old client-only dateAfter() display format, but
   status-aware: "Today" for whichever instalment is actually due right now
   rather than blindly assuming array position 0 (instalment #1 is usually
   already paid by the time a customer looks at their dashboard, since it's
   collected at checkout itself). */
export function formatInstalmentDueDate(dueAt: string): string {
  const d = new Date(dueAt);
  const isSameDay = d.toDateString() === new Date().toDateString();
  return isSameDay ? "Today" : d.toLocaleDateString("en-ZA", { day: "numeric", month: "short", year: "numeric" });
}

/* Mirrors markUnikOrderFailed's shape -- a failed Yoco payment.failed event
   just leaves the instalment marked "failed" so it shows up distinctly
   from a still-upcoming "scheduled" one; the customer can retry it from
   their dashboard the same way any scheduled/overdue instalment is paid. */
export async function markSetlaInstalmentFailed(admin: SupabaseClient, instalmentId: string): Promise<"failed" | "no_change"> {
  const { data: updated, error } = await admin
    .from("setla_instalments")
    .update({ status: "failed" })
    .eq("id", instalmentId)
    .in("status", ["scheduled", "processing"])
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("markSetlaInstalmentFailed: update failed", error);
    return "no_change";
  }
  return updated ? "failed" : "no_change";
}
