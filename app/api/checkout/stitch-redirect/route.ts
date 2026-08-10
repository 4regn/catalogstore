import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { createStitchCardConsent } from "../../../../lib/stitch";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* Stitch Card Consent checkout-session creation for the GENERIC storefront
   checkout (CheckoutPageClient.tsx) -- mirrors /api/checkout/yoco-redirect's
   own shape exactly (place-order already created the pending `orders` row;
   this just starts the gateway-specific payment leg). This is deliberately
   the SAME generic pattern as Yoco, not the SETLA-specific first-charge
   flow in lib/setla-instalments.ts -- this is "Stitch as a 3rd payment
   method for any order", the SETLA/instalment-automation use of Stitch's
   card-consent-then-reuse behaviour is a later, separate step (see
   app/api/checkout/stitch-webhook/route.ts's own comment).

   Card Consent inherently SAVES the customer's card for later reuse (that's
   the whole point of the scope this account was granted) even though this
   flow only ever charges it once today -- the UI must disclose that
   plainly, not just "redirecting to Stitch to pay" the way Yoco's does. */
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    const rl = rateLimit("stitch-redirect:" + ip, 5, 60);
    if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { orderId, slug } = await req.json();
    if (!orderId || !slug) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const { data: seller } = await getAdmin().from("sellers").select("id, checkout_config, store_name").eq("subdomain", slug).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });

    const cc = (seller.checkout_config || {}) as any;
    if (!cc.stitch_enabled) return NextResponse.json({ error: "Card payment is not enabled for this store" }, { status: 400 });

    const { data: order } = await getAdmin().from("orders").select("*").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.seller_id !== seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });

    /* Same replay guard as /api/checkout/yoco-redirect -- refuse to mint a
       fresh consent request for an order that's already paid/resolved. */
    if (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered" || order.status === "cancelled") {
      return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
    }

    // redirectUrl is the ONE static bridge page registered with Stitch
    // (see lib/stitch.ts's registerStitchRedirectUrl) -- not a dynamic
    // per-order URL like Yoco's successUrl. The client itself stashes
    // {orderId, slug, returnOrigin} in sessionStorage right before
    // navigating here, and app/checkout/stitch-return reads that back to
    // bounce to the right store's checkout page.
    const consent = await createStitchCardConsent({
      payerFullName: order.customer_name,
      email: order.customer_email,
      payerId: orderId,
      initialAmountCents: Math.round(Number(order.total) * 100),
      redirectUrl: `${APP_ORIGIN}/checkout/stitch-return`,
    });

    await getAdmin().from("orders").update({ stitch_consent_id: consent.id }).eq("id", orderId);

    return NextResponse.json({ redirectUrl: consent.url });
  } catch (err: any) {
    console.error("Stitch redirect error:", err);
    return NextResponse.json({ error: err?.message || "Could not start card payment" }, { status: 500 });
  }
}
