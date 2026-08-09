import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../lib/yoco";
import { storePath } from "../../../../lib/store-url";
import { buildInstalmentSchedule, minLaybuyDeposit, type SetlaPlanType } from "../../../../lib/setla-instalments";

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
   plain ready-made product). This route does everything THAT one does
   from the setla_orders insert onward (same eligibility math, same
   instalment/deposit logic via lib/setla-instalments.ts, same Yoco
   checkout for the first charge) -- the difference is entirely upstream:
   the order here was already created generically by
   /api/checkout/place-order (real server-truth pricing, already validates
   the import-tagged-product shipping restriction), so there's no cart to
   resolve at all, just an existing orderId to attach a payment plan to.

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

  const admin = getAdmin();

  const { data: seller } = await admin.from("sellers").select("id, checkout_config").eq("subdomain", slug).single();
  if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  const cc = (seller.checkout_config || {}) as any;
  if (!cc.setla_enabled) return NextResponse.json({ error: "SETLA is not enabled for this store" }, { status: 400 });

  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.seller_id !== seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
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

  // unik_order_id is a plain FK to this generic orders.id -- the column
  // name predates this route (SETLA was UNIK-exclusive at the time), it
  // isn't scoped to UNIK orders in any functional sense. A unique
  // constraint on this column is what turns a double-submit (customer
  // double-clicks "Continue to SETLA") into a clean, catchable error
  // below instead of two payment plans against one order.
  const { data: setlaOrder, error: setlaOrderErr } = await admin.from("setla_orders").insert({
    customer_id: customer.id,
    unik_order_id: order.id,
    payment_method: planType,
    subtotal: Math.max(0, total - shippingCost),
    delivery_amount: shippingCost,
    total,
    order_snapshot: { items: order.items, shippingLabel: order.shipping_option, fulfillmentMethod: order.fulfillment_method },
    production_locked: true,
  }).select("id").single();
  if (setlaOrderErr || !setlaOrder) {
    if (setlaOrderErr?.code === "23505") {
      return NextResponse.json({ error: "A SETLA payment plan already exists for this order" }, { status: 409 });
    }
    console.error("SETLA generic checkout: setla_orders insert failed:", setlaOrderErr);
    return NextResponse.json({ error: `Could not create your order (${setlaOrderErr?.message || "unknown error"})` }, { status: 500 });
  }

  const { data: plan, error: planErr } = await admin.from("setla_payment_plans").insert({
    customer_id: customer.id,
    order_id: setlaOrder.id,
    plan_type: planType,
    principal_amount: financedAmount,
    min_deposit_amount: planType === "laybuy" ? laybuyMinDeposit : null,
  }).select("id").single();
  if (planErr || !plan) {
    console.error("SETLA generic checkout: setla_payment_plans insert failed:", planErr);
    return NextResponse.json({ error: `Could not create your payment plan (${planErr?.message || "unknown error"})` }, { status: 500 });
  }

  let firstChargeId: string;
  let firstChargeAmount: number;
  let instalmentCount = 1;

  if (planType === "pay_later") {
    const schedule = buildInstalmentSchedule(financedAmount);
    if (excessUpfront > 0) schedule[0].amount = Math.round((schedule[0].amount + excessUpfront) * 100) / 100;
    const { data: instalments, error: instalErr } = await admin
      .from("setla_instalments")
      .insert(schedule.map((row) => ({ plan_id: plan.id, sequence_number: row.sequenceNumber, amount: row.amount, due_at: row.dueAt.toISOString() })))
      .select("id, sequence_number, amount")
      .order("sequence_number", { ascending: true });
    if (instalErr || !instalments || !instalments.length) {
      console.error("SETLA generic checkout: setla_instalments insert failed:", instalErr);
      return NextResponse.json({ error: `Could not create your payment schedule (${instalErr?.message || "unknown error"})` }, { status: 500 });
    }
    firstChargeId = instalments[0].id;
    firstChargeAmount = Number(instalments[0].amount);
    instalmentCount = instalments.length;

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
      console.error("SETLA generic checkout: setla_laybuy_payments insert failed:", paymentErr);
      return NextResponse.json({ error: `Could not create your Laybuy deposit (${paymentErr?.message || "unknown error"})` }, { status: 500 });
    }
    firstChargeId = payment.id;
    firstChargeAmount = Number(payment.amount);
  }

  const origin = safeOrigin(body?.returnOrigin);
  // Same return destination as /api/checkout/yoco-redirect -- the generic
  // checkout page's own ?paid=<orderId> handling (already generic across
  // every payment method, see CheckoutPageClient.tsx's load()) picks this
  // up regardless of which gateway/plan actually paid it.
  const checkoutBasePath = storePath(origin, slug, "/checkout");
  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(firstChargeAmount * 100),
      metadata: planType === "pay_later" ? { instalmentId: String(firstChargeId) } : { laybuyPaymentId: String(firstChargeId) },
      successUrl: `${origin}${checkoutBasePath}?paid=${order.id}`,
      cancelUrl: `${origin}${checkoutBasePath}?cancelled=1`,
      failureUrl: `${origin}${checkoutBasePath}?failed=1`,
      lineItems: [{
        displayName: planType === "laybuy"
          ? `SETLA Laybuy deposit — Order ${order.order_number || order.id.slice(0, 8)}`
          : (excessUpfront > 0 ? `SETLA order balance + instalment 1 of ${instalmentCount} — Order ${order.order_number || order.id.slice(0, 8)}` : `SETLA instalment 1 of ${instalmentCount} — Order ${order.order_number || order.id.slice(0, 8)}`),
        quantity: 1,
        pricingDetails: { price: Math.round(firstChargeAmount * 100) },
      }],
    });
    if (planType === "pay_later") {
      await admin.from("setla_instalments").update({ yoco_checkout_id: checkout.id }).eq("id", firstChargeId);
    } else {
      await admin.from("setla_laybuy_payments").update({ yoco_checkout_id: checkout.id }).eq("id", firstChargeId);
    }

    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("SETLA generic checkout: Yoco checkout creation failed:", err);
    // Give back the claimed limit -- same reasoning as the UNIK route: a
    // Pay Later customer's available_limit was already reserved above, and
    // leaving it claimed for an order that never got a payment attempt
    // started would strand credit they should still be able to spend.
    if (planType === "pay_later") {
      await admin.from("setla_customers").update({ available_limit: Number(customer.available_limit) }).eq("id", customer.id).eq("available_limit", Number(customer.available_limit) - financedAmount);
    }
    return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
  }
}
