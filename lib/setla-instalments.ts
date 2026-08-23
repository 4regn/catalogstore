import { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email";
import { FOUR_REGN_ACCOUNT_URL, FOUR_REGN_TRACKING_URL, fourRegnOrderReference } from "./four-regn-orders";

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

/* Everything app/api/checkout/setla-create/route.ts and
   app/api/setla/checkout/create/route.ts need to reconstruct a SETLA plan
   from scratch once Yoco confirms the first charge -- see
   activateSetlaPlanAfterPayment's own comment for why creation moved here
   instead of happening before the Yoco redirect. Yoco checkout metadata
   values must all be strings, so every number is carried as a string and
   parsed back out in activateSetlaPlanAfterPayment. */
export type SetlaFirstChargeMeta = {
  kind: "setla_first_charge";
  orderId: string;
  customerId: string;
  planType: SetlaPlanType;
  scheduleVariant: "default" | "half"; // pay_later only, ignored for laybuy
  financedAmount: string; // pay_later only
  excessUpfront: string; // pay_later only
  depositAmount: string; // laybuy only
  subtotal: string;
  shippingCost: string;
  total: string;
};

/**
 * Returns the exact amount SETLA collects at checkout for instalment #1.
 * Keep reconciliation checks on this helper: a Pay Later checkout only
 * charges the first instalment, not the full order total.
 */
export function setlaFirstChargeAmountCents(meta: SetlaFirstChargeMeta): number {
  if (meta.planType === "laybuy") {
    return Math.round((Number(meta.depositAmount) || 0) * 100);
  }

  const financedAmount = Number(meta.financedAmount) || 0;
  const excessUpfront = Number(meta.excessUpfront) || 0;
  const schedule = meta.scheduleVariant === "half"
    ? buildHalfAndHalfSchedule(financedAmount)
    : buildInstalmentSchedule(financedAmount);
  return Math.round(((schedule[0]?.amount || 0) + excessUpfront) * 100);
}

export function buildSetlaFirstChargeMetadata(meta: Omit<SetlaFirstChargeMeta, "kind" | "financedAmount" | "excessUpfront" | "depositAmount" | "subtotal" | "shippingCost" | "total"> & {
  financedAmount: number;
  excessUpfront: number;
  depositAmount: number;
  subtotal: number;
  shippingCost: number;
  total: number;
}): Record<string, string> {
  return {
    kind: "setla_first_charge",
    orderId: meta.orderId,
    customerId: meta.customerId,
    planType: meta.planType,
    scheduleVariant: meta.scheduleVariant,
    financedAmount: String(meta.financedAmount),
    excessUpfront: String(meta.excessUpfront),
    depositAmount: String(meta.depositAmount),
    subtotal: String(meta.subtotal),
    shippingCost: String(meta.shippingCost),
    total: String(meta.total),
  };
}

/* The real creation point for a SETLA plan -- called from the Yoco
   webhook's payment.succeeded handler (Laybuy, and Pay Later before Stitch
   Card Consent existed) or the Stitch webhook's payment.paid/CONSENT
   handler (Pay Later's first charge now, see
   app/api/checkout/stitch-webhook/route.ts), NOT from the checkout-create
   routes anymore. Those routes used to insert setla_orders/
   setla_payment_plans/setla_instalments (or setla_laybuy_payments) and
   claim the customer's available_limit BEFORE redirecting to Yoco, on the
   optimistic assumption the first charge would go through -- reported
   directly as the actual root cause of a real money bug: an abandoned or
   declined first charge still left the limit claimed and a "payment due"
   schedule sitting on the customer's dashboard, because both were created
   before payment was ever confirmed, with only a best-effort release path
   (voidStillbornPayLaterPlan) to undo it after the fact. Moving creation
   to here means a first charge that never succeeds leaves genuinely
   nothing behind -- no plan, no instalments, no claim -- matching the
   explicit product requirement: an order is only ever "recorded" once its
   payment actually went through (EFT is the sole exception, since it has
   no real-time gateway confirmation to defer to). Idempotent: a retried
   webhook for an order that already has a setla_orders row is a no-op. */
// Yoco is the default (matches every existing call site, all of which
// predate the Stitch Card Consent option) -- Pay Later's first charge can
// also come through Stitch now (see app/api/checkout/setla-create/route.ts
// and app/api/setla/checkout/create/route.ts), in which case the plan
// needs its stitch_consent_id stored so instalments #2+ can be
// auto-charged against the same saved card later. Laybuy never uses
// Stitch -- no fixed schedule to automate, so provider is always "yoco"
// on that branch.
export type SetlaFirstChargeProvider = { provider: "yoco" } | { provider: "stitch"; consentId: string };

export async function activateSetlaPlanAfterPayment(
  admin: SupabaseClient,
  meta: SetlaFirstChargeMeta,
  paymentId: string,
  amountCents: number,
  eventId: string | null,
  providerInfo: SetlaFirstChargeProvider = { provider: "yoco" }
): Promise<{ ok: true; alreadyProcessed?: boolean } | { ok: false; error: string }> {
  const { data: existing } = await admin.from("setla_orders").select("id").eq("unik_order_id", meta.orderId).maybeSingle();
  if (existing) return { ok: true, alreadyProcessed: true };

  const { data: order } = await admin
    .from("orders")
    .select("id, seller_id, order_number, external_id, payment_status, items, shipping_option, fulfillment_method, customer_name, customer_email")
    .eq("id", meta.orderId)
    .single();
  if (!order) return { ok: false, error: "Order not found" };
  if (order.payment_status === "paid") return { ok: true, alreadyProcessed: true };

  const financedAmount = Number(meta.financedAmount) || 0;
  const excessUpfront = Number(meta.excessUpfront) || 0;
  const depositAmount = Number(meta.depositAmount) || 0;
  const subtotal = Number(meta.subtotal) || 0;
  const shippingCost = Number(meta.shippingCost) || 0;
  const total = Number(meta.total) || 0;
  const isLaybuy = meta.planType === "laybuy";

  // Same amount-mismatch guard the plain-order webhook branch already
  // does -- the charge Yoco actually collected must match what this
  // specific first charge was supposed to be, not just the order total
  // (which, for pay_later, can differ from the first instalment amount
  // whenever excessUpfront applies). The exact first-instalment amount
  // depends on the same cent-splitting buildInstalmentSchedule/
  // buildHalfAndHalfSchedule do -- simplest to just build the real
  // schedule once, up front, and use its own row 0 amount as the
  // expectation, rather than re-deriving the split by hand.
  const schedule = isLaybuy
    ? null
    : meta.scheduleVariant === "half"
    ? buildHalfAndHalfSchedule(financedAmount)
    : buildInstalmentSchedule(financedAmount);
  if (schedule && excessUpfront > 0) schedule[0].amount = Math.round((schedule[0].amount + excessUpfront) * 100) / 100;
  const firstChargeAmount = isLaybuy ? depositAmount : (schedule as NonNullable<typeof schedule>)[0].amount;
  const firstChargeExpectedCents = setlaFirstChargeAmountCents(meta);
  if (Math.abs(firstChargeExpectedCents - amountCents) > 1) {
    console.error("activateSetlaPlanAfterPayment: amount mismatch", { orderId: meta.orderId, firstChargeExpectedCents, amountCents });
    return { ok: false, error: "Amount mismatch" };
  }

  const { data: setlaOrder, error: setlaOrderErr } = await admin
    .from("setla_orders")
    .insert({
      customer_id: meta.customerId,
      unik_order_id: order.id,
      payment_method: meta.planType,
      subtotal,
      delivery_amount: shippingCost,
      total,
      order_snapshot: { items: order.items, shippingLabel: order.shipping_option, fulfillmentMethod: order.fulfillment_method },
      production_locked: true,
    })
    .select("id")
    .single();
  if (setlaOrderErr || !setlaOrder) {
    if (setlaOrderErr?.code === "23505") return { ok: true, alreadyProcessed: true };
    console.error("activateSetlaPlanAfterPayment: setla_orders insert failed", setlaOrderErr);
    return { ok: false, error: setlaOrderErr?.message || "Could not create SETLA order" };
  }

  const { data: plan, error: planErr } = await admin
    .from("setla_payment_plans")
    .insert({
      customer_id: meta.customerId,
      order_id: setlaOrder.id,
      plan_type: meta.planType,
      principal_amount: isLaybuy ? total : financedAmount,
      min_deposit_amount: isLaybuy ? minLaybuyDeposit(total) : null,
      paid_amount: firstChargeAmount,
      stitch_consent_id: providerInfo.provider === "stitch" ? providerInfo.consentId : null,
      stitch_consent_status: providerInfo.provider === "stitch" ? "active" : null,
    })
    .select("id")
    .single();
  if (planErr || !plan) {
    console.error("activateSetlaPlanAfterPayment: setla_payment_plans insert failed", planErr);
    return { ok: false, error: planErr?.message || "Could not create SETLA plan" };
  }

  const now = new Date().toISOString();
  let productionUnlocked = false;
  let newSetlaOrderStatus: string;

  if (isLaybuy) {
    const { error: paymentErr } = await admin.from("setla_laybuy_payments").insert({
      plan_id: plan.id,
      amount: depositAmount,
      is_deposit: true,
      status: "paid",
      paid_at: now,
      payment_provider_reference: paymentId,
      yoco_event_id: eventId,
    });
    if (paymentErr) {
      console.error("activateSetlaPlanAfterPayment: setla_laybuy_payments insert failed", paymentErr);
      return { ok: false, error: paymentErr.message || "Could not record Laybuy deposit" };
    }
    // Laybuy never unlocks on a deposit alone -- matches
    // markLaybuyPaymentPaid's own reasoning (production begins only once
    // the full balance is paid).
    newSetlaOrderStatus = "partially_paid";
  } else {
    const { error: instalErr } = await admin.from("setla_instalments").insert(
      (schedule as NonNullable<typeof schedule>).map((row, i) => ({
        plan_id: plan.id,
        sequence_number: row.sequenceNumber,
        amount: row.amount,
        due_at: row.dueAt.toISOString(),
        ...(i === 0 ? { status: "paid", paid_at: now, payment_provider_reference: paymentId, yoco_event_id: eventId } : {}),
      }))
    );
    if (instalErr) {
      console.error("activateSetlaPlanAfterPayment: setla_instalments insert failed", instalErr);
      return { ok: false, error: instalErr.message || "Could not create instalment schedule" };
    }
    // Not an optimistic-locked claim (unlike the old pre-payment claim) --
    // the customer has already genuinely paid by this point, so a
    // concurrent limit adjustment landing in this narrow window shouldn't
    // ever cause a paid order to be treated as failed. Simple deduction.
    const { data: customer } = await admin.from("setla_customers").select("available_limit").eq("id", meta.customerId).single();
    if (customer) {
      await admin.from("setla_customers").update({ available_limit: Number(customer.available_limit) - financedAmount }).eq("id", meta.customerId);
    }
    // Pay Later unlocks the moment instalment #1 clears -- same reasoning
    // as markSetlaInstalmentPaid's shouldUnlock for sequence_number===1.
    productionUnlocked = true;
    newSetlaOrderStatus = "production";
  }

  await admin.from("setla_orders").update({ status: newSetlaOrderStatus, production_locked: !productionUnlocked }).eq("id", setlaOrder.id);
  // orders.payment_method gets its real plan-specific value here for the
  // first time -- place-order can only ever write the generic "setla" (it
  // runs before the customer has even chosen Pay Later vs Laybuy), which
  // is also why every "unresolved" filter (seller dashboard's Orders/
  // Abandoned split, sweepAbandonedOrders) has to check for "setla" too,
  // not just "setla_pay_later"/"setla_laybuy".
  const providerColumns = providerInfo.provider === "stitch"
    ? { stitch_payment_id: paymentId, ...(eventId ? { stitch_event_id: eventId } : {}) }
    : { yoco_payment_id: paymentId };
  await admin
    .from("orders")
    .update({ status: "confirmed", payment_status: "paid", payment_method: meta.planType === "pay_later" ? "setla_pay_later" : "setla_laybuy", ...providerColumns })
    .eq("id", order.id)
    .in("payment_status", ["pending", "abandoned", "failed"]);

  const { data: seller } = await admin.from("sellers").select("email, store_name, logo_url, subdomain").eq("id", order.seller_id).maybeSingle();
  const isFourRegn = seller?.subdomain === "4regn";
  const orderReference = isFourRegn ? fourRegnOrderReference(order) : `#${order.order_number}`;
  const fourRegnTracking = isFourRegn
    ? `<div style="background:#eef6ef;border:1px solid #d6ead8;border-radius:12px;padding:20px;margin:18px 0;"><h3 style="font-size:12px;color:#177533;text-transform:uppercase;letter-spacing:.08em;margin:0 0 8px;">Track your order</h3><p style="margin:0 0 16px;font-size:13px;color:#5f6c61;line-height:1.65;">Your order number is <strong>${orderReference}</strong>. Track it with the email address or mobile number used at checkout. You can enter the number with or without the # and D.</p><a href="${FOUR_REGN_TRACKING_URL}" style="display:block;text-align:center;padding:15px;background:#111;color:#fff;border-radius:100px;text-decoration:none;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:.08em;">Track Order</a></div><a href="${FOUR_REGN_ACCOUNT_URL}" style="display:block;text-align:center;padding:14px;border:1px solid #222;color:#222;border-radius:100px;text-decoration:none;font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.06em;">View My Account</a>`
    : "";

  const { data: customerRow } = await admin.from("setla_customers").select("id, first_name, email").eq("id", meta.customerId).maybeSingle();
  if (customerRow) {
    const title = isLaybuy ? "Laybuy deposit received" : "Payment received -- your order is in production";
    const body = isLaybuy
      ? `We've received your deposit of R${depositAmount.toFixed(2)}. Pay off the rest -- any amount, any time -- from your dashboard.`
      : `We've received your payment of R${firstChargeAmount.toFixed(2)}. Your order is now confirmed and being prepared.`;
    await admin.from("setla_notifications").insert({ customer_id: customerRow.id, notification_type: isLaybuy ? "laybuy_payment_received" : "instalment_paid", title, body });
    await sendEmail({
      to: customerRow.email,
      from: seller ? `${seller.store_name} <orders@catalogstore.co.za>` : "SETLA Payments <orders@catalogstore.co.za>",
      subject: isFourRegn ? `${title} — ${orderReference}` : title,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">${seller?.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : ""}<p>Hi ${customerRow.first_name},</p><p>${body}</p>${fourRegnTracking}</div>`,
    });
  }

  if (seller?.email) {
    await sendEmail({
      to: seller.email,
      subject: `New paid order (SETLA) -- ${order.customer_name}`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111"><h2 style="margin:0 0 12px">New Order -- Paid via SETLA</h2><p style="margin:0 0 4px"><strong>${order.customer_name}</strong> (${order.customer_email})</p><p style="margin:12px 0 0;font-size:15px;font-weight:600">Total: R${Math.round(total)}</p></div>`,
    });
  }

  return { ok: true };
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
