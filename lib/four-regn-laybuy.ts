import type { SupabaseClient } from "@supabase/supabase-js";

// 4REGN's own simpler Lay-Buy -- same "deposit now, top up whenever, ship
// once fully paid" shape as SETLA's Laybuy plan type (lib/setla-instalments.ts),
// but no shared credit facility and no separate SETLA login. Kept as its
// own small module rather than folded into setla-instalments.ts -- this
// was explicitly asked for as a simpler, independent system, not an
// extension of SETLA's.

export const FOUR_REGN_LAYBUY_MIN_DEPOSIT_PERCENT = 0.3;
// A deposit locks in an order, not an open-ended tab -- 6 months to clear
// the balance from the day the deposit lands, or the plan expires (see
// expireOverdueFourRegnLaybuyPlans, run daily via
// app/api/cron/expire-four-regn-laybuy).
export const FOUR_REGN_LAYBUY_TERM_MONTHS = 6;

export function fourRegnLaybuyExpiryDate(from: Date = new Date()): string {
  const d = new Date(from);
  d.setMonth(d.getMonth() + FOUR_REGN_LAYBUY_TERM_MONTHS);
  return d.toISOString();
}

// Rounds the minimum UP to the cent, same reasoning as SETLA's own
// minLaybuyDeposit -- a customer can't dip a fraction of a cent under the
// true 30% by relying on float rounding.
export function minFourRegnLaybuyDeposit(total: number): number {
  const totalCents = Math.round(total * 100);
  const minCents = Math.ceil(totalCents * FOUR_REGN_LAYBUY_MIN_DEPOSIT_PERCENT);
  return minCents / 100;
}

export function buildFourRegnLaybuyDepositMetadata(orderId: string, depositAmountCents: number): Record<string, string> {
  return { kind: "four_regn_laybuy_deposit", orderId, depositAmountCents: String(depositAmountCents) };
}

/* Creates the plan + its first (deposit) payment row only once the deposit
   Yoco charge has actually succeeded -- mirrors activateSetlaPlanAfterPayment's
   own "never claim a payment that didn't happen" reasoning, without needing
   that function's credit-limit/customer-identity bookkeeping (there's no
   separate SETLA customer here -- the order's own customer_id already
   identifies who this is). Idempotent via the unique constraint on
   four_regn_laybuy_plans(order_id): a retried webhook delivery hits that
   violation and is treated as already processed instead of creating a
   second plan. */
export async function activateFourRegnLaybuyPlan(
  admin: SupabaseClient,
  meta: { orderId: string; depositAmountCents: number },
  paymentId: string,
  amountCents: number,
  eventId: string | null
): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  if (Math.abs(meta.depositAmountCents - amountCents) > 1) {
    console.error("activateFourRegnLaybuyPlan: amount mismatch", { orderId: meta.orderId, expected: meta.depositAmountCents, amountCents });
    return { ok: false, error: "Amount mismatch" };
  }

  const { data: existingPlan } = await admin.from("four_regn_laybuy_plans").select("id").eq("order_id", meta.orderId).maybeSingle();
  if (existingPlan) return { ok: true, alreadyProcessed: true };

  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, customer_id, total, payment_status")
    .eq("id", meta.orderId)
    .single();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.payment_status === "paid") return { ok: true, alreadyProcessed: true };
  if (!order.customer_id) return { ok: false, error: "Order has no linked customer" };

  const total = Number(order.total) || 0;
  const depositAmount = amountCents / 100;
  const isFullyPaid = depositAmount >= total;

  const { data: plan, error: planErr } = await admin
    .from("four_regn_laybuy_plans")
    .insert({
      order_id: order.id,
      seller_id: order.seller_id,
      customer_id: order.customer_id,
      total_amount: total,
      paid_amount: depositAmount,
      status: isFullyPaid ? "paid_off" : "active",
      paid_off_at: isFullyPaid ? new Date().toISOString() : null,
      expires_at: isFullyPaid ? null : fourRegnLaybuyExpiryDate(),
    })
    .select("id")
    .single();
  if (planErr || !plan) {
    if ((planErr as any)?.code === "23505") return { ok: true, alreadyProcessed: true };
    console.error("activateFourRegnLaybuyPlan: plan insert failed", planErr);
    return { ok: false, error: planErr?.message || "Could not create Lay-Buy plan" };
  }

  const { error: paymentErr } = await admin.from("four_regn_laybuy_payments").insert({
    plan_id: plan.id,
    amount: depositAmount,
    is_deposit: true,
    status: "paid",
    yoco_payment_id: paymentId,
    yoco_event_id: eventId,
    paid_at: new Date().toISOString(),
  });
  if (paymentErr) console.error("activateFourRegnLaybuyPlan: deposit payment row insert failed", paymentErr);

  await admin.from("orders").update({
    payment_status: isFullyPaid ? "paid" : "partial",
    status: isFullyPaid ? "confirmed" : "pending",
  }).eq("id", order.id);

  return { ok: true };
}

/* Top-up equivalent of SETLA's markLaybuyPaymentPaid, without the
   notification/credit-facility machinery SETLA carries -- marks one
   ledger row paid, bumps the plan's running total, and only flips the
   order to fully "paid" once the balance is completely cleared (never on
   a partial top-up), matching the "goods only go out once it's paid off"
   rule this feature was built around. */
export async function markFourRegnLaybuyPaymentPaid(
  admin: SupabaseClient,
  params: { paymentId: string; providerReference: string; eventId?: string | null }
): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const { paymentId, providerReference, eventId } = params;

  const { data: updated, error: updateErr } = await admin
    .from("four_regn_laybuy_payments")
    .update({ status: "paid", paid_at: new Date().toISOString(), yoco_payment_id: providerReference, yoco_event_id: eventId || null })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id, plan_id, amount")
    .maybeSingle();
  if (updateErr) return { ok: false, error: updateErr.message };
  if (!updated) return { ok: true, alreadyProcessed: true };

  const { data: plan } = await admin
    .from("four_regn_laybuy_plans")
    .select("id, order_id, total_amount, paid_amount")
    .eq("id", updated.plan_id)
    .single();
  if (!plan) return { ok: false, error: "Plan not found" };

  const newPaidAmount = Number(plan.paid_amount) + Number(updated.amount);
  const planComplete = newPaidAmount >= Number(plan.total_amount);

  await admin.from("four_regn_laybuy_plans").update({
    paid_amount: newPaidAmount,
    status: planComplete ? "paid_off" : "active",
    paid_off_at: planComplete ? new Date().toISOString() : null,
  }).eq("id", plan.id);

  await admin.from("orders").update({
    payment_status: planComplete ? "paid" : "partial",
    status: planComplete ? "confirmed" : "pending",
  }).eq("id", plan.order_id);

  return { ok: true };
}

/* Laybuy top-up's equivalent of markSetlaInstalmentFailed's ledger-only
   branch -- a failed payment attempt on the ledger just gets marked
   failed; the customer can submit a fresh payment of any amount from
   their account any time before the plan's own 6-month deadline, same as
   any other top-up. */
export async function markFourRegnLaybuyPaymentFailed(admin: SupabaseClient, paymentId: string): Promise<"failed" | "no_change"> {
  const { data: updated, error } = await admin
    .from("four_regn_laybuy_payments")
    .update({ status: "failed" })
    .eq("id", paymentId)
    .eq("status", "pending")
    .select("id")
    .maybeSingle();
  if (error) {
    console.error("markFourRegnLaybuyPaymentFailed: update failed", error);
    return "no_change";
  }
  return updated ? "failed" : "no_change";
}

/* Daily sweep (app/api/cron/expire-four-regn-laybuy) -- a plan that's still
   short of its total 6 months after the deposit landed expires: no more
   top-ups accepted (see the status check in
   app/api/customer-account/laybuy/pay/route.ts), and the underlying order
   is cancelled so it stops sitting "pending" indefinitely instead of ever
   shipping. The deposit already paid is NOT refunded automatically here --
   that's a seller judgment call, same as any other cancelled order. Scoped
   to status='active' so a plan already paid_off/expired can't be swept
   twice. */
export async function expireOverdueFourRegnLaybuyPlans(admin: SupabaseClient): Promise<{ expired: number }> {
  const { data: expiredPlans, error } = await admin
    .from("four_regn_laybuy_plans")
    .update({ status: "expired" })
    .eq("status", "active")
    .lte("expires_at", new Date().toISOString())
    .select("id, order_id");
  if (error) {
    console.error("expireOverdueFourRegnLaybuyPlans: update failed", error);
    return { expired: 0 };
  }
  if (!expiredPlans?.length) return { expired: 0 };

  await admin.from("orders").update({ status: "cancelled" }).in("id", expiredPlans.map((p) => p.order_id)).eq("status", "pending");

  return { expired: expiredPlans.length };
}
