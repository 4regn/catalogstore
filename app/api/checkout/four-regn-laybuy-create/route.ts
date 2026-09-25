import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireCustomerAccount } from "../../../../lib/customer-account";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../lib/yoco";
import { storePath } from "../../../../lib/store-url";
import { minFourRegnLaybuyDeposit, buildFourRegnLaybuyDepositMetadata } from "../../../../lib/four-regn-laybuy";

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

/* 4REGN's own Lay-Buy deposit checkout -- the simpler, SETLA-independent
   sibling of /api/checkout/setla-create. That route requires a SETLA
   login (requireSetlaCustomer) because SETLA is a shared credit facility
   with its own customer identity; this one requires the storefront's own
   customer account (requireCustomerAccount) instead, since a 4REGN Lay-Buy
   plan is just tied to an order + the storefront customer who placed it,
   nothing more.

   Same deferred-creation pattern as setla-create: this does NOT write
   four_regn_laybuy_plans/four_regn_laybuy_payments or touch the order's
   payment_status -- it only starts a Yoco checkout for the deposit amount
   with everything needed embedded in its metadata. The actual plan is
   only created once payment.succeeded actually arrives (see
   activateFourRegnLaybuyPlan in lib/four-regn-laybuy.ts, called from the
   shared Yoco webhook) -- an order is never recorded as Lay-Buy until its
   deposit genuinely cleared. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("four-regn-laybuy-create:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const { orderId, slug, depositAmount, returnOrigin } = await req.json().catch(() => ({}) as any);
  if (typeof orderId !== "string" || typeof slug !== "string") {
    return NextResponse.json({ error: "Missing order" }, { status: 400 });
  }

  const auth = await requireCustomerAccount(req, slug);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  const { data: order } = await admin.from("orders").select("*").eq("id", orderId).single();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  if (order.seller_id !== auth.seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  // Same replay guard as /api/checkout/setla-create and /api/checkout/yoco-redirect --
  // refuse a fresh deposit checkout for an order that's already resolved.
  if (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered" || order.status === "cancelled") {
    return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
  }

  // This order must belong to the same person who's signed in, otherwise a
  // logged-in shopper could quietly start a Lay-Buy plan against a
  // stranger's order (just knowing its UUID) -- checked by EMAIL, not
  // order.customer_id, since this platform's customers table can carry
  // more than one row for the same email (leftover Shopify-import
  // duplicates elsewhere have already been confirmed) -- place-order's own
  // ilike-based customer lookup and this account's own activation lookup
  // don't always land on the same row when that happens, which made a
  // strict customer_id match reject a customer's own order. Email is what
  // actually identifies "the same person" here.
  const normalizedOrderEmail = String(order.customer_email || "").trim().toLowerCase();
  const normalizedAccountEmail = String(auth.account.email || "").trim().toLowerCase();
  if (!normalizedOrderEmail || normalizedOrderEmail !== normalizedAccountEmail) {
    return NextResponse.json({ error: "This order isn't linked to your account" }, { status: 403 });
  }
  // Now that email has confirmed this is genuinely the same person, repair
  // a missing/mismatched customer_id on the order so activateFourRegnLaybuyPlan
  // (and every future /api/customer-account/me load) attaches the plan to
  // the right customer record -- same repair reasoning as that route's own
  // historical-order customer_id backfill.
  if (order.customer_id !== auth.account.customer_id) {
    await admin.from("orders").update({ customer_id: auth.account.customer_id }).eq("id", order.id);
    order.customer_id = auth.account.customer_id;
  }

  const total = Number(order.total) || 0;
  const minDeposit = minFourRegnLaybuyDeposit(total);
  const deposit = Math.round(Number(depositAmount ?? minDeposit) * 100) / 100;
  if (!Number.isFinite(deposit) || deposit < minDeposit) {
    return NextResponse.json({ error: `Minimum Lay-Buy deposit is R${minDeposit.toFixed(2)} (30% of your order)` }, { status: 400 });
  }
  if (deposit > total) {
    return NextResponse.json({ error: "Your deposit can't be more than the order total" }, { status: 400 });
  }

  const origin = safeOrigin(returnOrigin);
  const checkoutBasePath = storePath(origin, slug, "/checkout");
  const depositAmountCents = Math.round(deposit * 100);

  try {
    const checkout = await createYocoCheckout({
      amountCents: depositAmountCents,
      metadata: buildFourRegnLaybuyDepositMetadata(order.id, depositAmountCents),
      successUrl: `${origin}${checkoutBasePath}?paid=${order.id}`,
      cancelUrl: `${origin}${checkoutBasePath}?cancelled=1`,
      failureUrl: `${origin}${checkoutBasePath}?failed=1`,
      lineItems: [{
        displayName: `4REGN Lay-Buy deposit — Order ${order.order_number || order.id.slice(0, 8)}`,
        quantity: 1,
        pricingDetails: { price: depositAmountCents },
      }],
    });

    await admin.from("orders").update({
      yoco_checkout_id: checkout.id,
      four_regn_laybuy_pending_meta: { kind: "four_regn_laybuy_deposit", orderId: order.id, depositAmountCents },
    }).eq("id", order.id);
    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("4REGN Lay-Buy checkout: Yoco checkout creation failed:", err);
    return NextResponse.json({ error: `Could not start payment (${err instanceof Error ? err.message : "unknown error"})` }, { status: 502 });
  }
}
