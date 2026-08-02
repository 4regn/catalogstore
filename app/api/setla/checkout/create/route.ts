import { NextRequest, NextResponse, after } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { getUnikSeller } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../../lib/yoco";
import { resolveUnikCart, runDeferredUnikUploads, type RawCartItem } from "../../../../../lib/unik-cart-resolve";
import { buildInstalmentSchedule, type SetlaPlanType } from "../../../../../lib/setla-instalments";

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
  });
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { lineItems, deferredJobs, subtotal, discountAmount, discountRow, total, shippingCost, shippingLabel, fulfillmentMethod } = resolved;

  // Eligibility -- Pay Later needs an approved application with enough
  // available limit; Laybuy needs neither (no credit is being extended).
  if (planType === "pay_later") {
    if (customer.application_status !== "approved") {
      return NextResponse.json({ error: "You need an approved SETLA Pay Later application to use this option" }, { status: 403 });
    }
    if (Number(customer.available_limit) < total) {
      return NextResponse.json({ error: "This order is above your available SETLA limit" }, { status: 403 });
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
    return NextResponse.json({ error: "Could not create your order" }, { status: 500 });
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
    return NextResponse.json({ error: "Could not create your order" }, { status: 500 });
  }

  const { data: plan, error: planErr } = await admin.from("setla_payment_plans").insert({
    customer_id: customer.id,
    order_id: setlaOrder.id,
    plan_type: planType,
    principal_amount: total,
  }).select("id").single();
  if (planErr || !plan) {
    console.error("SETLA checkout: setla_payment_plans insert failed:", planErr);
    return NextResponse.json({ error: "Could not create your payment plan" }, { status: 500 });
  }

  const schedule = buildInstalmentSchedule(total, planType as SetlaPlanType);
  const { data: instalments, error: instalErr } = await admin
    .from("setla_instalments")
    .insert(schedule.map((row) => ({ plan_id: plan.id, sequence_number: row.sequenceNumber, amount: row.amount, due_at: row.dueAt.toISOString() })))
    .select("id, sequence_number, amount")
    .order("sequence_number", { ascending: true });
  if (instalErr || !instalments || !instalments.length) {
    console.error("SETLA checkout: setla_instalments insert failed:", instalErr);
    return NextResponse.json({ error: "Could not create your payment schedule" }, { status: 500 });
  }
  const firstInstalment = instalments[0];

  if (planType === "pay_later") {
    // Optimistic-lock claim -- same shape as the discount code's used_count
    // claim in lib/unik-cart-resolve.ts. Loses the race only if the
    // customer's available_limit changed concurrently (e.g. an admin
    // adjustment landed at the exact same moment).
    const { data: claimed, error: claimErr } = await admin
      .from("setla_customers")
      .update({ available_limit: Number(customer.available_limit) - total })
      .eq("id", customer.id)
      .eq("available_limit", customer.available_limit)
      .gte("available_limit", total)
      .select("id");
    if (claimErr || !claimed || !claimed.length) {
      return NextResponse.json({ error: "Your available limit has changed. Please refresh and try again." }, { status: 409 });
    }
  }

  const origin = safeOrigin(body?.returnOrigin);
  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(firstInstalment.amount * 100),
      metadata: { instalmentId: String(firstInstalment.id) },
      successUrl: `${origin}${CONFIRM_PATH}?paid=1&orderId=${order.id}`,
      cancelUrl: `${origin}${CONFIRM_PATH}?cancelled=1&orderId=${order.id}`,
      failureUrl: `${origin}${CONFIRM_PATH}?failed=1&orderId=${order.id}`,
      lineItems: [{ displayName: `SETLA instalment 1 of ${instalments.length} — Order ${order.order_number}`, quantity: 1, pricingDetails: { price: Math.round(firstInstalment.amount * 100) } }],
    });
    await admin.from("setla_instalments").update({ yoco_checkout_id: checkout.id }).eq("id", firstInstalment.id);

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
      await admin.from("setla_customers").update({ available_limit: Number(customer.available_limit) }).eq("id", customer.id).eq("available_limit", Number(customer.available_limit) - total);
    }
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
