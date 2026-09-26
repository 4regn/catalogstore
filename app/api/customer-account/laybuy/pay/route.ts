import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireCustomerAccount } from "../../../../../lib/customer-account";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../../lib/yoco";
import { storePath } from "../../../../../lib/store-url";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

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

/* 4REGN account dashboard's self-service Lay-Buy top-up -- same shape as
   /api/setla/laybuy/pay, just against four_regn_laybuy_plans/payments and
   the storefront's own customer account instead of a SETLA login.
   Whatever amount the customer chooses, capped at the remaining balance --
   there's no fixed schedule to pay against. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}) as any);
  const slug = String(body?.slug || "").trim();
  const auth = await requireCustomerAccount(req, slug);
  if ("response" in auth) return auth.response;
  const { account, seller } = auth;

  const ip = getClientIP(req);
  if (!rateLimit("four-regn-laybuy-pay:" + ip, 10, 60).allowed || !rateLimit("four-regn-laybuy-pay:" + account.id, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const planId = String(body?.planId || "").trim();
  const amount = Math.round(Number(body?.amount || 0) * 100) / 100;
  if (!planId) return NextResponse.json({ error: "Missing Lay-Buy plan" }, { status: 400 });
  if (!Number.isFinite(amount) || amount <= 0) return NextResponse.json({ error: "Enter a valid payment amount" }, { status: 400 });

  const admin = getAdmin();
  const { data: plan, error: fetchErr } = await admin
    .from("four_regn_laybuy_plans")
    .select("id, order_id, customer_id, total_amount, paid_amount, status")
    .eq("id", planId)
    .maybeSingle();
  if (fetchErr || !plan || plan.customer_id !== account.customer_id) return NextResponse.json({ error: "Lay-Buy plan not found" }, { status: 404 });
  if (plan.status === "paid_off") return NextResponse.json({ error: "This Lay-Buy plan is already fully paid" }, { status: 409 });
  // Expired (past its 6-month deadline, see expireOverdueFourRegnLaybuyPlans)
  // -- the underlying order is already cancelled by that point, so a
  // top-up here would just be collecting money against an order that's
  // never going to ship.
  if (plan.status !== "active") return NextResponse.json({ error: "This Lay-Buy plan has expired and can no longer accept payments" }, { status: 409 });

  const remaining = Math.round((Number(plan.total_amount) - Number(plan.paid_amount)) * 100) / 100;
  if (remaining <= 0) return NextResponse.json({ error: "This Lay-Buy plan is already fully paid" }, { status: 409 });
  if (amount > remaining) return NextResponse.json({ error: `Your remaining balance is R${remaining.toFixed(2)} -- enter an amount up to that.` }, { status: 400 });

  const { data: order } = await admin.from("orders").select("order_number").eq("id", plan.order_id).maybeSingle();

  const { data: payment, error: paymentErr } = await admin
    .from("four_regn_laybuy_payments")
    .insert({ plan_id: plan.id, amount, is_deposit: false })
    .select("id")
    .single();
  if (paymentErr || !payment) {
    console.error("4REGN Lay-Buy pay: four_regn_laybuy_payments insert failed:", paymentErr);
    return NextResponse.json({ error: "Could not start your payment. Please try again." }, { status: 500 });
  }

  const origin = safeOrigin(body?.returnOrigin);
  const accountPath = storePath(origin, seller.subdomain, "/account");
  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(amount * 100),
      metadata: { fourRegnLaybuyPaymentId: String(payment.id) },
      successUrl: `${origin}${accountPath}?laybuy_paid=${payment.id}`,
      cancelUrl: `${origin}${accountPath}?laybuy_cancelled=1`,
      failureUrl: `${origin}${accountPath}?laybuy_failed=1`,
      lineItems: [{ displayName: `4REGN Lay-Buy payment${order?.order_number ? ` — Order ${order.order_number}` : ""}`, quantity: 1, pricingDetails: { price: Math.round(amount * 100) } }],
    });
    await admin.from("four_regn_laybuy_payments").update({ yoco_checkout_id: checkout.id }).eq("id", payment.id);
    return NextResponse.json({ ok: true, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("4REGN Lay-Buy pay: Yoco checkout creation failed:", err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
