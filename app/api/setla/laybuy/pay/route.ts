import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../../lib/yoco";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
const CONFIRM_PATH = "/setla/dashboard.html";

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

/* The dashboard's self-service Laybuy top-up -- unlike a Pay Later
   instalment (fixed amount, fixed due date), a Laybuy payment is whatever
   amount the customer chooses, whenever they choose, capped only at the
   remaining balance. Creates one setla_laybuy_payments row per payment
   attempt (mirrors app/api/setla/instalments/[id]/pay/route.ts's shape
   for Pay Later, just without a pre-existing row to reuse -- there's
   nothing to schedule ahead of time here). */
export async function POST(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  const ip = getClientIP(req);
  if (!rateLimit("setla-laybuy-pay:" + ip, 10, 60).allowed || !rateLimit("setla-laybuy-pay:" + customer.id, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const planId = String(body?.planId || "").trim();
  const amount = Math.round(Number(body?.amount || 0) * 100) / 100;
  if (!planId) return NextResponse.json({ error: "Missing payment plan" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid payment amount" }, { status: 400 });

  const admin = getAdmin();
  const { data: plan, error: fetchErr } = await admin
    .from("setla_payment_plans")
    .select("id, customer_id, order_id, plan_type, principal_amount, paid_amount, status")
    .eq("id", planId)
    .maybeSingle();
  if (fetchErr || !plan || plan.customer_id !== customer.id) return NextResponse.json({ error: "Payment plan not found" }, { status: 404 });
  if (plan.plan_type !== "laybuy") return NextResponse.json({ error: "This isn't a Laybuy plan" }, { status: 400 });
  if (plan.status === "completed") return NextResponse.json({ error: "This Laybuy plan is already fully paid" }, { status: 409 });

  const remaining = Math.round((Number(plan.principal_amount) - Number(plan.paid_amount)) * 100) / 100;
  if (remaining <= 0) return NextResponse.json({ error: "This Laybuy plan is already fully paid" }, { status: 409 });
  if (amount > remaining) return NextResponse.json({ error: `Your remaining balance is R${remaining.toFixed(2)} -- enter an amount up to that.` }, { status: 400 });

  const { data: setlaOrder } = await admin.from("setla_orders").select("unik_order_id").eq("id", plan.order_id).maybeSingle();
  const { data: order } = setlaOrder ? await admin.from("orders").select("order_number").eq("id", setlaOrder.unik_order_id).maybeSingle() : { data: null };

  const { data: payment, error: paymentErr } = await admin
    .from("setla_laybuy_payments")
    .insert({ plan_id: plan.id, amount, is_deposit: false })
    .select("id")
    .single();
  if (paymentErr || !payment) {
    console.error("SETLA laybuy pay: setla_laybuy_payments insert failed:", paymentErr);
    return NextResponse.json({ error: "Could not start your payment. Please try again." }, { status: 500 });
  }

  const origin = safeOrigin(body?.returnOrigin);
  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(amount * 100),
      metadata: { laybuyPaymentId: String(payment.id) },
      successUrl: `${origin}${CONFIRM_PATH}?paid=1`,
      cancelUrl: `${origin}${CONFIRM_PATH}?cancelled=1`,
      failureUrl: `${origin}${CONFIRM_PATH}?failed=1`,
      lineItems: [{ displayName: `SETLA Laybuy payment${order?.order_number ? ` — Order ${order.order_number}` : ""}`, quantity: 1, pricingDetails: { price: Math.round(amount * 100) } }],
    });
    await admin.from("setla_laybuy_payments").update({ yoco_checkout_id: checkout.id }).eq("id", payment.id);
    return NextResponse.json({ ok: true, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("SETLA laybuy pay: Yoco checkout creation failed:", err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
