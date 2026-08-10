import { NextRequest, NextResponse, after } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { getUnikSeller } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../../lib/yoco";
import { createStitchCardConsent } from "../../../../../lib/stitch";
import { resolveUnikCart, runDeferredUnikUploads, type RawCartItem } from "../../../../../lib/unik-cart-resolve";
import { buildInstalmentSchedule, buildHalfAndHalfSchedule, buildSetlaFirstChargeMetadata, minLaybuyDeposit, type SetlaPlanType } from "../../../../../lib/setla-instalments";

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

  // No setla_orders/setla_payment_plans/setla_instalments/
  // setla_laybuy_payments row, and no available_limit claim, until Yoco
  // actually confirms this first charge -- see
  // activateSetlaPlanAfterPayment's own comment (lib/setla-instalments.ts)
  // for why creation moved into the webhook instead of happening here,
  // before payment. Compute the real first-instalment amount purely in
  // memory; the webhook rebuilds the identical schedule from the same
  // metadata once payment succeeds.
  let firstChargeAmount: number;
  if (planType === "pay_later") {
    const schedule = scheduleVariant === "half" ? buildHalfAndHalfSchedule(financedAmount) : buildInstalmentSchedule(financedAmount);
    if (excessUpfront > 0) schedule[0].amount = Math.round((schedule[0].amount + excessUpfront) * 100) / 100;
    firstChargeAmount = schedule[0].amount;
  } else {
    firstChargeAmount = laybuyDeposit;
  }

  const origin = safeOrigin(body?.returnOrigin);
  // returnPath is only actually consumed by the Pay Later/Stitch branch
  // below (the client stashes it for the static bridge page, see
  // app/checkout/stitch-return's own comment for why Stitch can't take a
  // dynamic successUrl the way Yoco does) -- computed here either way
  // since firstChargeMeta needs building regardless of which gateway ends
  // up used.
  const returnPath = `${CONFIRM_PATH}?paid=1&orderId=${order.id}`;
  const firstChargeMeta = buildSetlaFirstChargeMetadata({
    orderId: order.id,
    customerId: customer.id,
    planType: planType as SetlaPlanType,
    scheduleVariant,
    financedAmount,
    excessUpfront,
    depositAmount: laybuyDeposit,
    subtotal,
    shippingCost,
    total,
  });

  const runDeferredJobsIfAny = () => {
    if (deferredJobs.length) {
      const orderId = order.id;
      after(() => runDeferredUnikUploads(admin, seller.id, orderId, deferredJobs));
    }
  };

  // Pay Later's first charge goes through Stitch Card Consent instead of a
  // plain Yoco checkout -- see app/api/checkout/setla-create/route.ts's
  // identical comment. Laybuy has no fixed schedule to automate, stays on
  // Yoco unchanged, below.
  if (planType === "pay_later") {
    try {
      const consent = await createStitchCardConsent({
        payerFullName: `${firstName} ${lastName}`.trim(),
        email,
        payerId: order.id,
        initialAmountCents: Math.round(firstChargeAmount * 100),
        redirectUrl: `${APP_ORIGIN}/checkout/stitch-return`,
      });
      await admin.from("orders").update({ stitch_consent_id: consent.id, setla_pending_stitch_meta: firstChargeMeta }).eq("id", order.id);
      runDeferredJobsIfAny();
      return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: consent.url, returnPath });
    } catch (err) {
      console.error("SETLA checkout: Stitch card consent creation failed:", err);
      return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
    }
  }

  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(firstChargeAmount * 100),
      metadata: firstChargeMeta,
      successUrl: `${origin}${returnPath}`,
      cancelUrl: `${origin}${CONFIRM_PATH}?cancelled=1&orderId=${order.id}`,
      failureUrl: `${origin}${CONFIRM_PATH}?failed=1&orderId=${order.id}`,
      lineItems: [{
        displayName: `SETLA Laybuy deposit — Order ${order.order_number}`,
        quantity: 1,
        pricingDetails: { price: Math.round(firstChargeAmount * 100) },
      }],
    });

    runDeferredJobsIfAny();
    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("SETLA checkout: Yoco checkout creation failed:", err);
    return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
  }
}
