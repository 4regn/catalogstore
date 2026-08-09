import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";

export type SetlaPlanType = "pay_later" | "laybuy";

// Pay Later ("Pay in 4") is a genuine fixed schedule: 4 instalments, 14
// days apart (today + 14 + 28 + 42 days, 6 weeks total) -- matches every
// customer-facing description of it (landing page calculator, product/
// cart widgets, signup page). This file is the real source of truth the
// server actually bills against, so a mismatch here means the marketing
// math and the real charge silently disagree.
//
// Laybuy has no fixed schedule at all -- see LAYBUY_MIN_DEPOSIT_PERCENT
// and the setla_laybuy_payments ledger below instead of PLAN_CONFIG.
const PAY_LATER_CONFIG = { count: 4, intervalDays: 14 };

/* Server-side port of setla.js's old client-only splitAmount()/dateAfter()
   -- splits to the cent, remainder cents go to the earliest instalments.
   Instalment #1 is always due immediately (paid at checkout itself).
   Pay Later only -- Laybuy doesn't have a fixed schedule to build (see
   minLaybuyDeposit below). */
export function buildInstalmentSchedule(total: number): Array<{ sequenceNumber: number; amount: number; dueAt: Date }> {
  const { count, intervalDays } = PAY_LATER_CONFIG;
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

// "Half and Half" -- a second Pay Later schedule variant, same credit
// mechanism as buildInstalmentSchedule above (financed against the
// customer's approved SETLA limit, instalment #1 collected inline at
// checkout), just 2 instalments instead of 4: 50% today, 50% in 30 days.
// Still stored as plan_type='pay_later' in setla_payment_plans (no new
// DB enum value) -- callers pick this vs buildInstalmentSchedule off the
// request's own scheduleVariant field, see app/api/setla/checkout/create
// and app/api/checkout/setla-create. NOT related to SETLA Laybuy, which
// is a genuinely separate, no-credit-check, flexible-deposit product.
export function buildHalfAndHalfSchedule(total: number): Array<{ sequenceNumber: number; amount: number; dueAt: Date }> {
  const cents = Math.round(Number(total) * 100);
  const first = Math.round(cents / 2);
  const now = new Date();
  return [
    { sequenceNumber: 1, amount: first / 100, dueAt: now },
    { sequenceNumber: 2, amount: (cents - first) / 100, dueAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
  ];
}

// SETLA Laybuy: no fixed instalment count or due dates -- a minimum 30%
// deposit at checkout, then the customer pays off the remaining balance
// with whatever amount they choose, whenever they choose (see
// app/api/setla/laybuy/pay/route.ts), over up to 3 months. If the balance
// isn't fully paid by then, production simply stays locked -- no
// automatic cancellation (explicit product decision, not an oversight).
export const LAYBUY_MIN_DEPOSIT_PERCENT = 0.3;

// Rounded up to the cent -- a deposit that rounded DOWN could let a
// customer pay a fraction of a cent under the real 30% minimum.
export function minLaybuyDeposit(total: number): number {
  const totalCents = Math.round(Number(total) * 100);
  const minCents = Math.ceil(totalCents * LAYBUY_MIN_DEPOSIT_PERCENT);
  return minCents / 100;
}

/* Idempotently marks one Pay Later instalment paid, then cascades: updates
   the plan's paid_amount, unlocks production (Pay Later unlocks the moment
   instalment #1 clears, since it's a credit product and the customer is
   already trusted for the balance), and on the plan's last instalment
   marks it completed. Shared between the Yoco webhook (primary path) and
   the admin manual-mark-paid route -- one implementation of "what happens
   when an instalment is paid", not two. Pay Later only -- see
   markLaybuyPaymentPaid below for Laybuy's flexible-ledger equivalent. */
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
  // Always true for a Pay Later instalment #1 -- this function is never
  // called for Laybuy anymore, but the "first instalment unlocks"
  // reasoning is preserved verbatim in case that ever changes back.
  const shouldUnlock = updated.sequence_number === 1 || planComplete;

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
      ? `We've received your payment of R${updated.amount.toFixed(2)}. Your order is now confirmed and being prepared.`
      : `We've received your instalment payment of R${updated.amount.toFixed(2)}.`;
    await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: "instalment_paid", title, body });
    await sendEmail({ to: customer.email, from: "SETLA Payments <orders@catalogstore.co.za>", subject: title, html: `<p>Hi ${customer.first_name},</p><p>${body}</p>` });
  }

  return { ok: true };
}

/* Laybuy's equivalent of markSetlaInstalmentPaid, but for the flexible
   ledger instead of a fixed schedule: marks one setla_laybuy_payments row
   paid, adds it to the plan's paid_amount, and unlocks production only
   once the running total reaches the full principal -- Laybuy has never
   unlocked on a partial payment (matches the "production begins once the
   balance is complete" promise shown to customers), unlike Pay Later's
   first-instalment unlock above. No due dates, no "overdue" concept: a
   customer who hasn't finished paying within the informal 3-month window
   just stays locked, by design (no automatic cancellation). */
export async function markLaybuyPaymentPaid(
  admin: SupabaseClient,
  params: { paymentId: string; providerReference: string; eventId?: string | null }
): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const { paymentId, providerReference, eventId } = params;

  const { data: updated, error: updateErr } = await admin
    .from("setla_laybuy_payments")
    .update({ status: "paid", paid_at: new Date().toISOString(), payment_provider_reference: providerReference, yoco_event_id: eventId || null })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id, plan_id, amount")
    .maybeSingle();
  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated) return { ok: true, alreadyProcessed: true };

  const { data: plan } = await admin
    .from("setla_payment_plans")
    .select("id, customer_id, order_id, principal_amount, paid_amount")
    .eq("id", updated.plan_id)
    .single();
  if (!plan) return { ok: false, error: "Payment plan not found" };

  const newPaidAmount = Number(plan.paid_amount) + Number(updated.amount);
  await admin.from("setla_payment_plans").update({ paid_amount: newPaidAmount }).eq("id", plan.id);

  const { data: order } = await admin.from("setla_orders").select("id, unik_order_id, production_locked, status").eq("id", plan.order_id).single();
  if (!order) return { ok: false, error: "Order not found" };

  const planComplete = newPaidAmount >= Number(plan.principal_amount);
  const newSetlaOrderStatus = planComplete ? "paid" : "partially_paid";
  if (newSetlaOrderStatus !== order.status || (planComplete && order.production_locked)) {
    await admin.from("setla_orders").update({ status: newSetlaOrderStatus, production_locked: planComplete ? false : order.production_locked }).eq("id", order.id);
  }
  if (planComplete) {
    await admin.from("setla_payment_plans").update({ status: "completed", completed_at: new Date().toISOString() }).eq("id", plan.id);
  }

  await admin.from("orders").update({ status: "confirmed", payment_status: planComplete ? "paid" : "partial" }).eq("id", order.unik_order_id);

  const { data: customer } = await admin.from("setla_customers").select("id, first_name, email").eq("id", plan.customer_id).single();
  if (customer) {
    const remaining = Math.max(0, Number(plan.principal_amount) - newPaidAmount);
    const title = planComplete ? "Your SETLA Laybuy is fully paid" : "Laybuy payment received";
    const body = planComplete
      ? "Your final Laybuy payment has been received and your order is now confirmed and being prepared."
      : `We've received your payment of R${updated.amount.toFixed(2)}. R${remaining.toFixed(2)} remains -- pay it off in any amount, any time, from your dashboard.`;
    await admin.from("setla_notifications").insert({ customer_id: customer.id, notification_type: "laybuy_payment_received", title, body });
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
   their dashboard the same way any scheduled/overdue instalment is paid
   (app/api/setla/instalments/[id]/pay) -- EXCEPT instalment #1, which is
   special: its claim against the customer's available_limit (see the
   optimistic-lock claim in app/api/setla/checkout/create/route.ts and
   app/api/checkout/setla-create/route.ts) happens the moment the plan is
   created, before the first Yoco charge is even attempted. If that first
   charge then genuinely fails, the plan never actually activated -- no
   credit was really extended -- so the claimed principal_amount is given
   back and the plan/order are voided, instead of leaving the customer
   permanently down that amount of limit for a purchase that never
   happened. A later instalment (#2+) failing is real delinquency against
   credit already used, not a stillborn plan -- left untouched here. */
export async function markSetlaInstalmentFailed(admin: SupabaseClient, instalmentId: string): Promise<"failed" | "no_change"> {
  const { data: updated, error } = await admin
    .from("setla_instalments")
    .update({ status: "failed" })
    .eq("id", instalmentId)
    .in("status", ["scheduled", "processing"])
    .select("id, plan_id, sequence_number")
    .maybeSingle();
  if (error) {
    console.error("markSetlaInstalmentFailed: update failed", error);
    return "no_change";
  }
  if (!updated) return "no_change";

  if (updated.sequence_number === 1) {
    await voidStillbornPayLaterPlan(admin, updated.plan_id);
  }

  return "failed";
}

/* Shared by markSetlaInstalmentFailed (an explicit Yoco payment.failed
   event) and the abandoned-order sweep (no webhook ever arrived at all) --
   both cases mean instalment #1 never actually got paid, so the plan never
   activated. Gives back the claimed available_limit, voids the plan and
   its setla_orders row, and marks the underlying generic order "failed" so
   it stops sitting at payment_status "pending" forever. Scoped to plans
   still "active" (eq below) so a retried webhook or a sweep running twice
   can't double-refund the same limit. */
export async function voidStillbornPayLaterPlan(admin: SupabaseClient, planId: string): Promise<void> {
  const { data: plan } = await admin
    .from("setla_payment_plans")
    .select("id, customer_id, order_id, principal_amount, status")
    .eq("id", planId)
    .single();
  if (!plan || plan.status !== "active") return;

  const { data: voided } = await admin
    .from("setla_payment_plans")
    .update({ status: "cancelled" })
    .eq("id", plan.id)
    .eq("status", "active")
    .select("id")
    .maybeSingle();
  if (!voided) return; // lost the race (already voided by a concurrent call)

  const { data: customer } = await admin.from("setla_customers").select("available_limit").eq("id", plan.customer_id).single();
  if (customer) {
    await admin
      .from("setla_customers")
      .update({ available_limit: Number(customer.available_limit) + Number(plan.principal_amount) })
      .eq("id", plan.customer_id)
      .eq("available_limit", customer.available_limit);
  }

  const { data: setlaOrder } = await admin.from("setla_orders").select("id, unik_order_id").eq("id", plan.order_id).single();
  if (setlaOrder) {
    await admin.from("setla_orders").update({ status: "cancelled" }).eq("id", setlaOrder.id);
    await admin.from("orders").update({ payment_status: "failed", status: "failed" }).eq("id", setlaOrder.unik_order_id).eq("payment_status", "pending");
  }
}

/* Laybuy equivalent of markSetlaInstalmentFailed -- a failed payment
   attempt on a ledger row just gets marked failed; the customer can
   always submit a fresh payment of any amount from their dashboard, same
   as any other Laybuy top-up. */
export async function markLaybuyPaymentFailed(admin: SupabaseClient, paymentId: string): Promise<"failed" | "no_change"> {
  const { data: updated, error } = await admin
    .from("setla_laybuy_payments")
    .update({ status: "failed" })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("markLaybuyPaymentFailed: update failed", error);
    return "no_change";
  }
  return updated ? "failed" : "no_change";
}
