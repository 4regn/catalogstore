import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getStitchPaymentLink } from "../../../../lib/stitch";
import { markUnikOrderFailed } from "../../../../lib/unik-orders";
import { canonicalStoreUrlForRequest } from "../../../../lib/store-canonical-server";

export const dynamic = "force-dynamic";

/* Resolves the store checkout page a customer should land on after Stitch's
   static bridge page (app/checkout/stitch-return) redirects them back --
   used ONLY as the fallback for when that page's sessionStorage handoff
   (written by CheckoutPageClient.tsx / public/setla/setla.js right before
   sending the customer to Stitch) didn't survive the round trip.

   That handoff is written on the STORE's own origin (a seller subdomain or
   connected custom domain), but Stitch always redirects back to the ONE
   static bridge URL registered with it (see lib/stitch.ts's
   registerStitchRedirectUrl), which lives on the platform's own origin --
   a DIFFERENT origin from almost every seller's storefront. sessionStorage
   is strictly per-origin, so that handoff is lost on the very first hop
   for any subdomain- or custom-domain-hosted store, not just as some rare
   edge case -- this endpoint exists to make the return still work in that
   (actually common) case.

   Stitch itself echoes back whatever we set as merchantReference (Payment
   Links) / payerId (Card Consent) as the `reference` query param on its
   redirect -- both are always set to our own order id (see
   /api/checkout/stitch-redirect and /api/checkout/setla-create), so that
   alone is enough to look the order back up and figure out where it
   belongs, with no client-side storage involved at all. */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("orderId") || "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) {
    return NextResponse.json({ error: "Invalid order" }, { status: 400 });
  }

  const admin = getAdmin();
  let { data: order } = await admin
    .from("orders")
    .select("id, seller_id, payment_status, stitch_link_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  // Same self-heal Stitch does on order-status: don't make the customer
  // wait for a webhook (or the checkout page's own 90s poll) just because
  // they landed here via the fallback path instead of the normal one.
  if (order.payment_status === "pending" && order.stitch_link_id) {
    try {
      const payment = await getStitchPaymentLink(order.stitch_link_id);
      if (payment?.status === "CANCELLED" || payment?.status === "EXPIRED") {
        await markUnikOrderFailed(admin, order.id);
      }
    } catch (error) {
      console.error("Stitch return-target self-heal failed", { orderId, error });
    }
  }

  const { data: seller } = await admin
    .from("sellers")
    .select("subdomain, custom_domain, custom_domain_status")
    .eq("id", order.seller_id)
    .maybeSingle();
  if (!seller?.subdomain) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  const redirectUrl = canonicalStoreUrlForRequest(
    seller.subdomain,
    seller.custom_domain,
    seller.custom_domain_status,
    `/checkout?paid=${orderId}`
  );
  return NextResponse.json({ redirectUrl }, { headers: { "Cache-Control": "no-store" } });
}
