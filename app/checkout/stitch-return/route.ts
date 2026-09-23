import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../lib/supabase-admin";
import { getStitchPaymentLink } from "../../../lib/stitch";
import { markUnikOrderFailed, markUnikOrderPaid } from "../../../lib/unik-orders";
import { canonicalStoreUrlForRequest } from "../../../lib/store-canonical-server";

export const dynamic = "force-dynamic";

const FALLBACK_HTML = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Order</title></head><body style="min-height:100vh;display:flex;align-items:center;justify-content:center;font-family:-apple-system,sans-serif;color:#111;text-align:center;padding:24px;margin:0"><div><p style="font-size:15px;font-weight:600;margin-bottom:8px">Could not return to your order automatically.</p><p style="font-size:13px;color:#666">Please check your order confirmation email, or go back to the store you were checking out on.</p></div></body></html>`;

function fallback() {
  return new NextResponse(FALLBACK_HTML, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

/* Static bridge URL Stitch redirects the customer's browser back to after a
   Payment Link (or, if ever re-enabled, Card Consent) flow finishes --
   success OR cancellation/decline, Stitch doesn't distinguish the two via
   the return URL itself. This is the ONE static URL registered with Stitch
   (see lib/stitch.ts's registerStitchRedirectUrl -- it caps registered
   redirect URLs at 5 exact entries, so a dynamic per-order URL isn't an
   option the way it is for Yoco/PayFast).

   A real Route Handler (not a client page) on purpose: this used to be a
   "use client" page that hydrated React just to read sessionStorage (or,
   before that, fetch a fallback endpoint) and THEN navigate away -- an
   entire extra page load + JS bundle + hydration on the critical path
   before the browser even reaches the checkout page's own status check.
   Doing the lookup AND the live Stitch verification here, server-side, in
   the one request the browser already has to wait through to get back from
   Stitch at all, means the checkout page it lands on can find the order
   already resolved (paid or failed) on its very first read -- no "Almost
   there..." polling needed for the common case.

   Stitch itself echoes back whatever was set as merchantReference (Payment
   Links) / payerId (Card Consent) as the `reference` query param on this
   redirect -- always our own order id (see /api/checkout/stitch-redirect
   and /api/checkout/setla-create) -- which is all that's needed to resolve
   both the destination and the payment outcome, no client-side handoff
   required. */
export async function GET(req: NextRequest) {
  const orderId = req.nextUrl.searchParams.get("reference") || "";
  if (!/^[0-9a-f-]{36}$/i.test(orderId)) return fallback();

  const admin = getAdmin();
  let { data: order } = await admin
    .from("orders")
    .select("id, seller_id, total, items, customer_name, customer_email, payment_status, payment_method, stitch_link_id")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return fallback();

  if (order.payment_status === "pending" && order.stitch_link_id) {
    try {
      const payment = await getStitchPaymentLink(order.stitch_link_id);
      if (payment?.status === "PAID") {
        const expectedCents = Math.round(Number(order.total || 0) * 100);
        const amountMatches = payment.amountCents > 0 && Math.abs(expectedCents - payment.amountCents) <= 1;
        const referenceMatches = !payment.merchantReference || payment.merchantReference === order.id;
        if (amountMatches && referenceMatches) {
          await markUnikOrderPaid(admin, order, payment.paymentId, null, "stitch");
        } else {
          console.error("Stitch return bridge: verification mismatch", {
            orderId,
            expectedCents,
            stitchAmount: payment.amountCents,
            merchantReference: payment.merchantReference,
            linkId: order.stitch_link_id,
          });
        }
      } else if (payment?.status === "CANCELLED" || payment?.status === "EXPIRED" || (payment?.attemptCount ?? 0) >= 1) {
        // Same fast-fail signal (and the same accepted tradeoff) as
        // order-status's own Stitch branch -- see that route's own
        // comment. A plain declined charge leaves the LINK itself
        // "PENDING" (open for another try), so at least one recorded
        // attempt with none of them PAID is the only evidence available
        // that this specific attempt didn't go through.
        await markUnikOrderFailed(admin, order.id);
      }
    } catch (error) {
      console.error("Stitch return bridge: self-heal failed", { orderId, error });
    }
  }

  const { data: seller } = await admin
    .from("sellers")
    .select("subdomain, custom_domain, custom_domain_status")
    .eq("id", order.seller_id)
    .maybeSingle();
  if (!seller?.subdomain) return fallback();

  // SETLA's Stitch Card Consent path (currently disabled -- see
  // STITCH_CARD_CONSENT_ENABLED in app/api/checkout/setla-create/route.ts)
  // shares this same static bridge URL but has its own static confirmation
  // page, not this generic storefront checkout.
  const destinationPath = order.payment_method === "setla"
    ? `/setla/order-confirmed.html?paid=1&orderId=${orderId}`
    : `/checkout?paid=${orderId}`;
  const redirectUrl = canonicalStoreUrlForRequest(seller.subdomain, seller.custom_domain, seller.custom_domain_status, destinationPath);
  return NextResponse.redirect(redirectUrl, 302);
}
