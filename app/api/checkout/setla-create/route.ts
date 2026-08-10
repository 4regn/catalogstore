import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../lib/yoco";
import { createStitchCardConsent } from "../../../../lib/stitch";
import { storePath } from "../../../../lib/store-url";
import { buildInstalmentSchedule, buildHalfAndHalfSchedule, buildSetlaFirstChargeMetadata, minLaybuyDeposit, type SetlaPlanType } from "../../../../lib/setla-instalments";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
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

/* SETLA checkout for the GENERIC storefront (any seller with
   checkout_config.setla_enabled -- currently just 4regn), as opposed to
   app/api/setla/checkout/create/route.ts which is UNIK-only (hardcoded
   getUnikSeller(), resolves the cart through resolveUnikCart(), which
   requires a designId/customUpload on every item -- meaningless for a
   plain ready-made product). This route shares the same eligibility math
   and instalment/deposit logic (lib/setla-instalments.ts) as that one --
   the difference is entirely upstream: the order here was already created
   generically by /api/checkout/place-order (real server-truth pricing,
   already validates the import-tagged-product shipping restriction), so
   there's no cart to resolve at all, just an existing orderId to start a
   payment plan for.

   This route does NOT write setla_orders/setla_payment_plans/
   setla_instalments/setla_laybuy_payments, and does NOT claim the
   customer's available_limit -- it only computes the numbers and starts a
   Yoco checkout with everything needed to reconstruct the real plan
   embedded in its metadata. The actual creation happens in
   activateSetlaPlanAfterPayment (lib/setla-instalments.ts), called from
   the Yoco webhook once payment.succeeded actually arrives. This is
   deliberate: an order is only ever "recorded" as SETLA once its first
   payment genuinely went through -- see activateSetlaPlanAfterPayment's
   own comment for the money bug this replaced (a claimed-but-unpaid
   credit limit, a "payment due" schedule shown for a plan that never
   should have existed).

   setla_customers/setla_payment_plans/setla_instalments/
   setla_laybuy_payments are confirmed seller-agnostic already (SETLA is a
   shared credit facility across every participating seller, not a
   per-seller account) -- requireSetlaCustomer works unchanged here. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("setla-generic-checkout-create:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const { orderId, slug } = body || {};
  if (typeof orderId !== "string" || typeof slug !== "string") {
    return NextResponse.json({ error: "Missing order" }, { status: 400 });
  }
  const planType = String(body?.plan || "");
  if (!PLAN_TYPES.has(planType as SetlaPlanType)) return NextResponse.json({ error: "Invalid payment plan" }, { status: 400 });
  // Half and Half is a second Pay Later schedule (2 instalments instead of
  // 4, see buildHalfAndHalfSchedule) -- same credit mechanism, same
  // eligibility rules, just a different schedule shape. Not a separate
  // plan_type. Ignored for planType==='laybuy'.
  const scheduleVariant = body?.scheduleVariant === "half" ? "half" : "default";

  const admin = getAdmin();

  const { data: seller } = await admin.from("sellers").select("id, checkout_config").eq("subdomain", slug).single();
  if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  const cc = (seller.checkout_config || {}) as any;
  if (!cc.setla_enabled) return NextResponse.json({ error: "SETLA is not enabled for this store" }, { status: 400 });

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.seller_id !== seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  // This order was placed anonymously by /api/checkout/place-order (no
  // auth binding at all -- the generic storefront checkout doesn't require
  // a SETLA login to add items to cart) -- unlike UNIK's own route, where
  // the order is created fresh in THIS same request against the
  // authenticated customer, so there's nothing to cross-check. Here, an
  // already-logged-in SETLA session (a shared device, a stale login) must
  // not be able to silently attach a payment plan to a DIFFERENT
  // customer's order just because it knows/guesses the orderId -- the
  // client already refuses to reach this point on a mismatch (see
  // setla.js's initCheckout), this is the server-side backstop for that,
  // not a display nicety.
  if (String(order.customer_email || "").trim().toLowerCase() !== String(customer.email || "").trim().toLowerCase()) {
    return NextResponse.json({ error: "This order doesn't belong to the signed-in SETLA account" }, { status: 403 });
  }
  // Same replay guard as /api/payfast-redirect and /api/checkout/yoco-redirect
  // -- refuse a fresh payment plan for an order that's already resolved.
  if (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered" || order.status === "cancelled") {
    return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
  }

  const total = Number(order.total) || 0;
  const shippingCost = Number(order.shipping_cost) || 0;

  // Same eligibility/financing math as app/api/setla/checkout/create/route.ts --
  // see that file's own comment for the excess-upfront reasoning (an order
  // above the customer's available limit still goes through, only the
  // amount up to their limit is financed).
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

  // Compute the real first-instalment amount purely in memory -- no DB
  // writes yet. Mirrors buildInstalmentSchedule/buildHalfAndHalfSchedule's
  // own math exactly (activateSetlaPlanAfterPayment rebuilds the identical
  // schedule from this same metadata once payment succeeds, so the two
  // must never be allowed to drift).
  let firstChargeAmount: number;
  if (planType === "pay_later") {
    const schedule = scheduleVariant === "half" ? buildHalfAndHalfSchedule(financedAmount) : buildInstalmentSchedule(financedAmount);
    if (excessUpfront > 0) schedule[0].amount = Math.round((schedule[0].amount + excessUpfront) * 100) / 100;
    firstChargeAmount = schedule[0].amount;
  } else {
    firstChargeAmount = laybuyDeposit;
  }

  const origin = safeOrigin(body?.returnOrigin);
  // Same return destination as /api/checkout/yoco-redirect -- the generic
  // checkout page's own ?paid=<orderId> handling (already generic across
  // every payment method, see CheckoutPageClient.tsx's load()) picks this
  // up regardless of which gateway/plan actually paid it. Also returned as
  // `returnPath` in the response below so the client can stash it for
  // Stitch's static bridge page (app/checkout/stitch-return) when the
  // Pay Later branch is used -- see that route's own comment for why
  // Stitch can't just take a dynamic successUrl the way Yoco does.
  const checkoutBasePath = storePath(origin, slug, "/checkout");
  const returnPath = `${checkoutBasePath}?paid=${order.id}`;
  const firstChargeMeta = buildSetlaFirstChargeMetadata({
    orderId: order.id,
    customerId: customer.id,
    planType: planType as SetlaPlanType,
    scheduleVariant,
    financedAmount,
    excessUpfront,
    depositAmount: laybuyDeposit,
    subtotal: Math.max(0, total - shippingCost),
    shippingCost,
    total,
  });

  // Pay Later's first charge goes through Stitch Card Consent instead of a
  // plain Yoco checkout -- the customer's card gets saved (with consent
  // shown at the Stitch-hosted page) so instalments #2+ can be
  // auto-collected later (see app/api/cron/setla-collect-instalments) with
  // no further action from them. Laybuy has no fixed schedule to
  // automate, so it stays on Yoco unchanged, below.
  if (planType === "pay_later") {
    try {
      const consent = await createStitchCardConsent({
        payerFullName: order.customer_name,
        email: order.customer_email,
        payerId: order.id,
        initialAmountCents: Math.round(firstChargeAmount * 100),
        redirectUrl: `${APP_ORIGIN}/checkout/stitch-return`,
      });
      await admin.from("orders").update({ stitch_consent_id: consent.id, setla_pending_stitch_meta: firstChargeMeta }).eq("id", order.id);
      return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: consent.url, returnPath });
    } catch (err) {
      console.error("SETLA generic checkout: Stitch card consent creation failed:", err);
      return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
    }
  }

  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(firstChargeAmount * 100),
      metadata: firstChargeMeta,
      successUrl: `${origin}${returnPath}`,
      cancelUrl: `${origin}${checkoutBasePath}?cancelled=1`,
      failureUrl: `${origin}${checkoutBasePath}?failed=1`,
      lineItems: [{
        displayName: `SETLA Laybuy deposit — Order ${order.order_number || order.id.slice(0, 8)}`,
        quantity: 1,
        pricingDetails: { price: Math.round(firstChargeAmount * 100) },
      }],
    });

    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("SETLA generic checkout: Yoco checkout creation failed:", err);
    return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
  }
}
