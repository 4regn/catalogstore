import { NextRequest, NextResponse, after } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { getUnikSeller } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../../lib/yoco";
import { resolveUnikCart, runDeferredUnikUploads, type RawCartItem } from "../../../../../lib/unik-cart-resolve";
import { buildInstalmentSchedule, buildHalfAndHalfSchedule, minLaybuyDeposit, type SetlaPlanType } from "../../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
const CONFIRM_PATH = "/setla/order-confirmed.html";
const PLAN_TYPES = new Set<SetlaPlanType>(["pay_later", "laybuy"]);

function safeOrigin(raw: unknown): string {
  if (typeof raw !== "string") return APP_ORIGIN;
  try {
    const u = new URL(raw);
    const allowed = new URL(APP_ORIGIN).host.toLowerCase();
    const host = u.host.toLowerCase();
    if (host === allowed || host.endsWith("." + allowed)) return u.origin;
    if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return u.origin;
    return APP_ORIGIN;
  } catch {
    return APP_ORIGIN;
  }
}

/* SETLA's equivalent of app/api/unik/checkout/create/route.ts -- same cart
   resolution (lib/unik-cart-resolve.ts, shared so pricing can never drift
   between payment methods), but instead of one full-amount Yoco checkout,
   this creates a real order + a SETLA payment plan + its instalments, and
   only ever charges instalment #1 right now. The remaining instalments are
   paid later from the customer's SETLA dashboard (see
   app/api/setla/instalments/[id]/pay/route.ts). */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("setla-checkout-create:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, customer } = auth;

  const seller = await getUnikSeller();
  if (!seller) return NextResponse.json({ error: "UNIK Labs is unavailable" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const planType = String(body?.plan || "");
  if (!PLAN_TYPES.has(planType as SetlaPlanType)) return NextResponse.json({ error: "Invalid payment plan" }, { status: 400 });
  // Half and Half: same Pay Later credit mechanism, 2 instalments instead
  // of 4 -- see lib/setla-instalments.ts's buildHalfAndHalfSchedule.
  const scheduleVariant = body?.scheduleVariant === "half" ? "half" : "default";

  const items: RawCartItem[] = Array.isArray(body?.items) ? body.items : [];
  const custBody = body?.customer || {};
  const firstName = String(custBody.firstName || "").trim().slice(0, 80);
  const lastName = String(custBody.lastName || "").trim().slice(0, 80);
  const email = String(custBody.email || "").trim().slice(0, 160);
  const phone = String(custBody.phone || "").trim().slice(0, 30);
  const notes = String(body?.notes || "").trim().slice(0, 500);
  const streetAddress = String(custBody.streetAddress || "").trim().slice(0, 300);
  const townCity = String(custBody.townCity || "").trim().slice(0, 120);
  const province = String(custBody.province || "").trim().slice(0, 60);
  const postal = String(custBody.postal || "").trim().slice(0, 12);
  const requestedDelivery = body?.deliveryMethod || {};
  const requestedIsPickup = !!requestedDelivery.isPickup;
  const requestedDeliveryName = String(requestedDelivery.name || "").trim().slice(0, 80);
  const requestedDiscountCode = String(body?.discountCode || "").trim().toUpperCase();

  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  if (phone.replace(/[^0-9]/g, "").length < 9) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });

  const admin = getAdmin();

  const resolved = await resolveUnikCart({
    admin, sellerId: seller.id, userId: user.id, items,
    requestedIsPickup, requestedDeliveryName, streetAddress, townCity, province, postal,
    discountCode: requestedDiscountCode, referralCode: null,
    // SETLA is a separate login from the UNIK storefront account that may
    // have generated the design -- see resolveUnikCart's own comment.
    strictDesignOwnership: false,
  });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { lineItems, deferredJobs, subtotal, discountAmount, discountRow, total, shippingCost, shippingLabel, fulfillmentMethod } = resolved;

  // Eligibility -- Pay Later needs an approved application with an actual
  // limit to draw on; Laybuy needs neither (no credit is being extended).
  // An order above the customer's available limit is still allowed: only
  // the amount up to their limit is financed (split across the usual
  // instalments), and whatever's above that is charged upfront alongside
  // instalment #1, on top of it -- e.g. a R700 order against a R300 limit
  // finances R300 (R100 x 3) and charges R400 (the excess) + R100 (the
  // first instalment) = R500 upfront, then R100 at day 14 and day 28.
  let financedAmount = total;
  let excessUpfront = 0;
  if (planType === "pay_later") {
    if (customer.application_status !== "approved") {
      return NextResponse.json({ error: "You need an approved SETLA Pay Later application to use this option" }, { status: 403 });
    }
    if (Number(customer.available_limit) <= 0) {
      return NextResponse.json({ error: "You don't have any available SETLA limit right now" }, { status: 403 });
    }
    financedAmount = Math.min(total, Number(customer.available_limit));
    excessUpfront = Math.round((total - financedAmount) * 100) / 100;
  }

  // Laybuy: no fixed schedule, just a minimum 30% deposit due now -- the
  // customer picks how much of that minimum (or more) they want to pay
  // upfront; the remainder is paid off in whatever amounts, whenever,
  // from the dashboard (see app/api/setla/laybuy/pay/route.ts).
  let laybuyMinDeposit = 0;
  let laybuyDeposit = 0;
  if (planType === "laybuy") {
    laybuyMinDeposit = minLaybuyDeposit(total);
    laybuyDeposit = Math.round(Number(body?.depositAmount ?? laybuyMinDeposit) * 100) / 100;
    if (!Number.isFinite(laybuyDeposit) || laybuyDeposit < laybuyMinDeposit) {
      return NextResponse.json({ error: `Minimum Laybuy deposit is R${laybuyMinDeposit.toFixed(2)} (30% of your order)` }, { status: 400 });
    }
    if (laybuyDeposit > total) {
      return NextResponse.json({ error: "Your deposit can't be more than the order total" }, { status: 400 });
    }
  }

  const { data: order, error: orderErr } = await admin.from("orders").insert({
    seller_id: seller.id,
    customer_name: `${firstName} ${lastName}`.trim(),
    customer_email: email,
    customer_phone: phone,
    customer_auth_user_id: user.id,
    notes: notes || null,
    items: lineItems.map((i) => ({ id: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image, customization: { designId: i.designId, garment: i.garment, colour: i.colour, size: i.size, style: i.style } })),
    total,
    discount_code: discountRow?.code || null,
    discount_amount: discountAmount || 0,
    partner_id: discountRow?.partner_id || null,
    fulfillment_method: fulfillmentMethod,
    shipping_option: shippingLabel,
    shipping_address: fulfillmentMethod === "delivery" ? { address: streetAddress, city: townCity, province, postal_code: postal } : null,
    shipping_cost: shippingCost,
    payment_method: planType === "pay_later" ? "setla_pay_later" : "setla_laybuy",
    payment_status: "pending",
    status: "pending",
  }).select("id, order_number").single();
  if (orderErr || !order) {
    console.error("SETLA checkout: order insert failed:", orderErr);
    return NextResponse.json({ error: `Could not create your order (order: ${orderErr?.message || "unknown error"})` }, { status: 500 });
  }

  await admin.from("unik_designs").update({ status: "checkout_started", auth_user_id: user.id }).in("id", lineItems.map((i) => i.designId));

  const { data: setlaOrder, error: setlaOrderErr } = await admin.from("setla_orders").insert({
    customer_id: customer.id,
    unik_order_id: order.id,
    payment_method: planType,
    subtotal,
    delivery_amount: shippingCost,
    total,
    order_snapshot: { items: lineItems, shippingLabel, fulfillmentMethod },
    production_locked: true,
  }).select("id").single();
  if (setlaOrderErr || !setlaOrder) {
    console.error("SETLA checkout: setla_orders insert failed:", setlaOrderErr);
    return NextResponse.json({ error: `Could not create your order (setla_orders: ${setlaOrderErr?.message || "unknown error"})` }, { status: 500 });
  }

  // principal_amount is the actual credit extended (financedAmount), not
  // the whole order -- the upfront excess above the customer's limit is a
  // straight cash payment, never financed, so it isn't part of the "loan".
  // For Laybuy, financedAmount is just the full order total (no credit
  // involved) and min_deposit_amount records what the 30% minimum was at
  // the time of this specific order.
  const { data: plan, error: planErr } = await admin.from("setla_payment_plans").insert({
    customer_id: customer.id,
    order_id: setlaOrder.id,
    plan_type: planType,
    principal_amount: financedAmount,
    min_deposit_amount: planType === "laybuy" ? laybuyMinDeposit : null,
  }).select("id").single();
  if (planErr || !plan) {
    console.error("SETLA checkout: setla_payment_plans insert failed:", planErr);
    return NextResponse.json({ error: `Could not create your payment plan (${planErr?.message || "unknown error"})` }, { status: 500 });
  }

  // Pay Later gets its real fixed schedule (4 instalments, 14 days apart);
  // Laybuy gets a single ledger row for the deposit -- the rest is paid
  // off in whatever amounts, whenever, via app/api/setla/laybuy/pay.
  let firstChargeId: string;
  let firstChargeAmount: number;
  let instalmentCount = 1;

  if (planType === "pay_later") {
    const schedule = scheduleVariant === "half" ? buildHalfAndHalfSchedule(financedAmount) : buildInstalmentSchedule(financedAmount);
    if (excessUpfront > 0) schedule[0].amount = Math.round((schedule[0].amount + excessUpfront) * 100) / 100;
    const { data: instalments, error: instalErr } = await admin
      .from("setla_instalments")
      .insert(schedule.map((row) => ({ plan_id: plan.id, sequence_number: row.sequenceNumber, amount: row.amount, due_at: row.dueAt.toISOString() })))
      .select("id, sequence_number, amount")
      .order("sequence_number", { ascending: true });
    if (instalErr || !instalments || !instalments.length) {
      console.error("SETLA checkout: setla_instalments insert failed:", instalErr);
      return NextResponse.json({ error: `Could not create your payment schedule (${instalErr?.message || "unknown error"})` }, { status: 500 });
    }
    firstChargeId = instalments[0].id;
    firstChargeAmount = Number(instalments[0].amount);
    instalmentCount = instalments.length;

    // Optimistic-lock claim -- same shape as the discount code's used_count
    // claim in lib/unik-cart-resolve.ts. Only the financed portion is
    // claimed against the limit, not the whole order. Loses the race only
    // if the customer's available_limit changed concurrently (e.g. an
    // admin adjustment landed at the exact same moment).
    const { data: claimed, error: claimErr } = await admin
      .from("setla_customers")
      .update({ available_limit: Number(customer.available_limit) - financedAmount })
      .eq("id", customer.id)
      .eq("available_limit", customer.available_limit)
      .gte("available_limit", financedAmount)
      .select("id");
    if (claimErr || !claimed || !claimed.length) {
      return NextResponse.json({ error: "Your available limit has changed. Please refresh and try again." }, { status: 409 });
    }
  } else {
    const { data: payment, error: paymentErr } = await admin
      .from("setla_laybuy_payments")
      .insert({ plan_id: plan.id, amount: laybuyDeposit, is_deposit: true })
      .select("id, amount")
      .single();
    if (paymentErr || !payment) {
      console.error("SETLA checkout: setla_laybuy_payments insert failed:", paymentErr);
      return NextResponse.json({ error: `Could not create your Laybuy deposit (${paymentErr?.message || "unknown error"})` }, { status: 500 });
    }
    firstChargeId = payment.id;
    firstChargeAmount = Number(payment.amount);
  }

  const origin = safeOrigin(body?.returnOrigin);
  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(firstChargeAmount * 100),
      metadata: planType === "pay_later" ? { instalmentId: String(firstChargeId) } : { laybuyPaymentId: String(firstChargeId) },
      successUrl: `${origin}${CONFIRM_PATH}?paid=1&orderId=${order.id}`,
      cancelUrl: `${origin}${CONFIRM_PATH}?cancelled=1&orderId=${order.id}`,
      failureUrl: `${origin}${CONFIRM_PATH}?failed=1&orderId=${order.id}`,
      lineItems: [{
        displayName: planType === "laybuy"
          ? `SETLA Laybuy deposit — Order ${order.order_number}`
          : (excessUpfront > 0 ? `SETLA order balance + instalment 1 of ${instalmentCount} — Order ${order.order_number}` : `SETLA instalment 1 of ${instalmentCount} — Order ${order.order_number}`),
        quantity: 1,
        pricingDetails: { price: Math.round(firstChargeAmount * 100) },
      }],
    });
    if (planType === "pay_later") {
      await admin.from("setla_instalments").update({ yoco_checkout_id: checkout.id }).eq("id", firstChargeId);
    } else {
      await admin.from("setla_laybuy_payments").update({ yoco_checkout_id: checkout.id }).eq("id", firstChargeId);
    }

    if (deferredJobs.length) {
      const orderId = order.id;
      after(() => runDeferredUnikUploads(admin, seller.id, orderId, deferredJobs));
    }

    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("SETLA checkout: Yoco checkout creation failed:", err);
    // Unlike a Laybuy order (which can just sit orphaned at payment_pending,
    // same as the plain Yoco checkout path already does), a Pay Later
    // customer's available_limit was already claimed above -- give it back
    // rather than leaving them unable to spend it on an order that never
    // actually got a payment attempt started.
    if (planType === "pay_later") {
      await admin.from("setla_customers").update({ available_limit: Number(customer.available_limit) }).eq("id", customer.id).eq("available_limit", Number(customer.available_limit) - financedAmount);
    }
    return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
  }
}
