import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../../../lib/setla-customer";
import { rateLimit, getClientIP } from "../../../../../../lib/rate-limit";
import { createYocoCheckout } from "../../../../../../lib/yoco";

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

/* The dashboard's self-service "pay this instalment" button -- creates a
   fresh one-off Yoco checkout for exactly one scheduled/overdue instalment.
   Instalment #1 is always paid inline at SETLA checkout itself (see
   app/api/setla/checkout/create/route.ts); this route is for every
   instalment after that. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;
  const { id } = await ctx.params;

  const ip = getClientIP(req);
  if (!rateLimit("setla-instalment-pay:" + ip, 10, 60).allowed || !rateLimit("setla-instalment-pay:" + customer.id, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests. Please try again shortly." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));

  const admin = getAdmin();
  const { data: instalment, error: fetchErr } = await admin
    .from("setla_instalments")
    .select("id, plan_id, sequence_number, amount, status")
    .eq("id", id)
    .maybeSingle();
  if (fetchErr || !instalment) return NextResponse.json({ error: "Instalment not found" }, { status: 404 });

  const { data: plan } = await admin.from("setla_payment_plans").select("id, customer_id, order_id, plan_type").eq("id", instalment.plan_id).maybeSingle();
  if (!plan || plan.customer_id !== customer.id) return NextResponse.json({ error: "Instalment not found" }, { status: 404 });

  // "processing" is included so an abandoned Yoco checkout (started but
  // never completed) can always be retried with a fresh one -- the old
  // checkout just goes unused.
  if (!["scheduled", "overdue", "processing"].includes(instalment.status)) {
    return NextResponse.json({ error: "This instalment isn't awaiting payment" }, { status: 409 });
  }

  const { data: setlaOrder } = await admin.from("setla_orders").select("unik_order_id").eq("id", plan.order_id).maybeSingle();
  const { data: order } = setlaOrder ? await admin.from("orders").select("order_number").eq("id", setlaOrder.unik_order_id).maybeSingle() : { data: null };

  const origin = safeOrigin(body?.returnOrigin);
  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(Number(instalment.amount) * 100),
      metadata: { instalmentId: String(instalment.id) },
      successUrl: `${origin}${CONFIRM_PATH}?paid=1`,
      cancelUrl: `${origin}${CONFIRM_PATH}?cancelled=1`,
      failureUrl: `${origin}${CONFIRM_PATH}?failed=1`,
      lineItems: [{ displayName: `SETLA instalment ${instalment.sequence_number}${order?.order_number ? ` — Order ${order.order_number}` : ""}`, quantity: 1, pricingDetails: { price: Math.round(Number(instalment.amount) * 100) } }],
    });
    await admin.from("setla_instalments").update({ yoco_checkout_id: checkout.id, status: "processing" }).eq("id", instalment.id);
    return NextResponse.json({ ok: true, redirectUrl: checkout.redirectUrl });
  } catch (err) {
    console.error("SETLA instalment pay: Yoco checkout creation failed:", err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
