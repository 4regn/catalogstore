import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { createStitchPaymentLink } from "../../../../lib/stitch";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* Stitch Payment Link creation for the GENERIC storefront checkout
   (CheckoutPageClient.tsx) -- mirrors /api/checkout/yoco-redirect's own
   shape exactly (place-order already created the pending `orders` row;
   this just starts the gateway-specific payment leg). This is deliberately
   the SAME generic pattern as Yoco, not the SETLA-specific first-charge
   flow in lib/setla-instalments.ts.

   Uses Payment Links (a plain one-time charge, default scope), NOT Card
   Consent -- Card Consent needs a separately-approved scope this account
   doesn't have on its LIVE client yet (see lib/stitch.ts's own comment),
   and isn't actually needed just to take a one-off payment. Card Consent
   is reserved for SETLA's recurring-instalment automation, a later,
   separate step once that scope is approved. */
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
    // Sellers are opted in to the shared CatalogStore Stitch account by
    // default. Only an explicit dashboard opt-out blocks a payment link.
    if (cc.stitch_enabled === false) return NextResponse.json({ error: "Stitch Pay Later is not enabled for this store" }, { status: 400 });

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
    const paymentLink = await createStitchPaymentLink({
      payerName: order.customer_name,
      email: order.customer_email,
      merchantReference: orderId,
      amountCents: Math.round(Number(order.total) * 100),
      redirectUrl: `${APP_ORIGIN}/checkout/stitch-return`,
    });

    await getAdmin().from("orders").update({ stitch_link_id: paymentLink.id }).eq("id", orderId);

    return NextResponse.json({ redirectUrl: paymentLink.link });
  } catch (err: any) {
    console.error("Stitch redirect error:", err);
    return NextResponse.json({ error: err?.message || "Could not start card payment" }, { status: 500 });
  }
}
