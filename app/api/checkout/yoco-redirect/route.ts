import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { storePath } from "../../../../lib/store-url";
import { createYocoCheckout, type YocoLineItem } from "../../../../lib/yoco";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

// Same origin-allowlisting reasoning as /api/payfast-redirect/route.ts's own
// safeOrigin() -- a Yoco successUrl/cancelUrl/failureUrl pointing at an
// attacker-controlled host would let them phish a "your order is confirmed"
// page, or worse, capture the ?paid=<orderId> return leg.
function safeOrigin(raw: unknown): string {
  if (typeof raw !== "string") return APP_ORIGIN;
  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase();
    const allowed = new URL(APP_ORIGIN).host.toLowerCase();
    if (host === allowed || host.endsWith("." + allowed)) return u.origin;
    if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return u.origin;
    return APP_ORIGIN;
  } catch {
    return APP_ORIGIN;
  }
}

/* Yoco checkout-session creation for the GENERIC storefront checkout
   (CheckoutPageClient.tsx) -- mirrors /api/payfast-redirect/route.ts's own
   shape (place-order already created the pending `orders` row; this just
   starts the gateway-specific payment leg), not /api/unik/checkout/create,
   which is a different, UNIK-only flow (its own auth, its own cart-
   resolution for print-on-demand designs, hardcoded redirect back to UNIK's
   static checkout.html).

   Yoco itself is NOT multi-tenant on this platform today -- YOCO_SECRET_KEY/
   YOCO_WEBHOOK_SECRET (lib/yoco.ts) are ONE global Vercel env var pair tied
   to one Yoco business account, currently used by UNIK Labs. Confirmed with
   the seller directly: 4regn's own Yoco approval is the SAME account
   (multiple approved return-URL domains, not a second business), so this
   reuses those same global credentials rather than needing per-seller ones.
   That's exactly why checkout_config.yoco_enabled below is NOT a self-serve
   dashboard toggle like payfast_enabled/eft_enabled -- flipping it on for a
   seller who does NOT actually share that Yoco business would silently
   deposit their customers' money into someone else's bank account. It's
   only ever set directly (SQL/migration), scoped to sellers confirmed to
   share the account.

   The payment confirmation webhook is intentionally NOT duplicated here --
   /api/unik/checkout/webhook already looks up and marks orders purely by
   orderId/checkoutId (see markUnikOrderPaid in lib/unik-orders.ts, which
   reads order.seller_id dynamically and only touches unik_designs when an
   item actually carries designId metadata, a no-op for a plain product
   order), so it already works for ANY seller's order once that order was
   created against the same Yoco account, not just UNIK's. A second webhook
   endpoint would mean a second URL to register with Yoco for no benefit. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("yoco-redirect:" + ip, 5, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { orderId, slug, returnOrigin } = await req.json();
    if (!orderId || !slug) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { data: seller } = await getAdmin().from("sellers").select("id, checkout_config, store_name").eq("subdomain", slug).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const cc = (seller.checkout_config || {}) as any;
    if (!cc.yoco_enabled) return NextResponse.json({ error: "Card payment is not enabled for this store" }, { status: 400 });

    const { data: order } = await getAdmin().from("orders").select("*").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.seller_id !== seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    /* Same replay guard as /api/payfast-redirect -- refuse to mint a fresh
       Yoco checkout for an order that's already paid/resolved. */
    if (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered" || order.status === "cancelled") {
      return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
    }

    const origin = safeOrigin(returnOrigin);
    const cartEncoded = Buffer.from(JSON.stringify(order.items || [])).toString("base64");

    const lineItems: YocoLineItem[] = (order.items || []).map((i: any) => ({
      displayName: i.name,
      quantity: i.qty,
      pricingDetails: { price: Math.round(Number(i.price) * 100) },
    }));
    if (order.shipping_cost > 0) {
      lineItems.push({ displayName: order.shipping_option || "Shipping", quantity: 1, pricingDetails: { price: Math.round(Number(order.shipping_cost) * 100) } });
    }

    const checkout = await createYocoCheckout({
      amountCents: Math.round(Number(order.total) * 100),
      metadata: { orderId },
      successUrl: origin + storePath(origin, slug, "/checkout?paid=" + orderId),
      cancelUrl: origin + storePath(origin, slug, "/checkout?cancelled=1&cart=" + cartEncoded),
      failureUrl: origin + storePath(origin, slug, "/checkout?failed=1&cart=" + cartEncoded),
      lineItems,
    });

    await getAdmin().from("orders").update({ yoco_checkout_id: checkout.id }).eq("id", orderId);

    return NextResponse.json({ redirectUrl: checkout.redirectUrl });
  } catch (err: any) {
    console.error("Yoco redirect error:", err);
    return NextResponse.json({ error: err?.message || "Could not start card payment" }, { status: 500 });
  }
}
