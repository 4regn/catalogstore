import { NextRequest, NextResponse, after } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout, type YocoLineItem } from "../../../../../lib/yoco";
import { resolveUnikCart, runDeferredUnikUploads, type RawCartItem } from "../../../../../lib/unik-cart-resolve";

export const dynamic = "force-dynamic";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
const CHECKOUT_PATH = "/private-templates/unik-labs/checkout.html";

// A shopper on the seller's own verified custom domain (e.g. uniklabs.co.za)
// must come back to THAT domain after Yoco, not the platform's own
// catalogstore.co.za -- otherwise the redirect lands on a different origin
// than the one the shopper's session/cookies belong to, which reads as a
// broken/stuck checkout (and can look like an auth failure too, since a
// Supabase session set on one origin isn't visible on another). sellerDomain
// is passed in already scoped to custom_domain_status === "verified" by the
// caller, so a domain still pending DNS verification is never trusted here.
function safeOrigin(raw: unknown, sellerDomain: string | null): string {
  if (typeof raw !== "string") return APP_ORIGIN;
  try {
    const u = new URL(raw);
    const host = u.host.toLowerCase();
    const allowed = new URL(APP_ORIGIN).host.toLowerCase();
    if (host === allowed || host.endsWith("." + allowed)) return u.origin;
    if (sellerDomain && (host === sellerDomain.toLowerCase() || host === `www.${sellerDomain.toLowerCase()}`)) return u.origin;
    if (host === "localhost" || host.startsWith("localhost:") || host.startsWith("127.0.0.1")) return u.origin;
    return APP_ORIGIN;
  } catch {
    return APP_ORIGIN;
  }
}

/* Creates a real Catalogstore order for a UNIK cart and returns a Yoco
   redirect URL. Cart items are one of: a pre-generated AI Studio design
   (designId), a Custom Upload design already saved via
   /api/unik/custom-upload/save at "Add to Cart" time (customUpload.designId
   -- the normal case), or, as a fallback, raw Custom Upload artwork+
   placement (customUpload.frontImage/backImage) if that earlier save call
   failed client-side. All three go through the same cart-resolution path
   (lib/unik-cart-resolve.ts, shared with SETLA's checkout route so pricing
   and item validation can never drift between payment methods). Custom
   Upload still doesn't require an account until checkout (this whole
   endpoint already requires one) -- a design saved anonymously is claimed
   (auth_user_id attached) once the customer signs in to pay, unlike AI
   Studio, which needs an account earlier, to enforce the daily generation
   limit. */
export async function POST(req: NextRequest) {
  // Timing breakdown for diagnosing slow checkouts -- logged as one line at
  // the end (search Vercel logs for "UNIK checkout timing") rather than
  // scattered per-stage lines, so the full picture reads in one place.
  const t0 = Date.now();
  const timing: Record<string, number> = {};
  const mark = (label: string) => { timing[label] = Date.now() - t0; };

  const ip = getClientIP(req);
  if (!rateLimit("unik-checkout-create:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  mark("rateLimit");

  const auth = await requireUnikCustomer(req);
  mark("auth");
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const items: RawCartItem[] = Array.isArray(body?.items) ? body.items : [];
  const customer = body?.customer || {};
  const firstName = String(customer.firstName || "").trim().slice(0, 80);
  const lastName = String(customer.lastName || "").trim().slice(0, 80);
  const email = String(customer.email || "").trim().slice(0, 160);
  const phone = String(customer.phone || "").trim().slice(0, 30);
  const notes = String(body?.notes || "").trim().slice(0, 500);
  const streetAddress = String(customer.streetAddress || "").trim().slice(0, 300);
  const suburb = String(customer.suburb || "").trim().slice(0, 120);
  const townCity = String(customer.townCity || "").trim().slice(0, 120);
  const province = String(customer.province || "").trim().slice(0, 60);
  const postal = String(customer.postal || "").trim().slice(0, 12);
  const requestedDelivery = body?.deliveryMethod || {};
  const requestedIsPickup = !!requestedDelivery.isPickup;
  const requestedDeliveryName = String(requestedDelivery.name || "").trim().slice(0, 80);
  const requestedDiscountCode = String(body?.discountCode || "").trim().toUpperCase();

  if (!items.length) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  if (phone.replace(/[^0-9]/g, "").length < 9) return NextResponse.json({ error: "A valid phone number is required" }, { status: 400 });

  const admin = getAdmin();

  // If nothing was typed, fall back to this seller's partner-referral
  // cookie (see capturePartnerRef() in store.js / UNIK_PARTNER.getRefCode())
  // -- checkout.html already auto-applies this client-side for a visible
  // "applied" state, but a shopper's request is re-derived here
  // independently rather than trusted, in case that client-side apply
  // never ran (JS error, stale cached page, cookies blocked in that one
  // context, etc).
  let referralCode: string | null = null;
  if (!requestedDiscountCode) {
    const refCode = req.cookies.get("unik_partner_ref")?.value;
    if (refCode) {
      const { data: refPartner } = await admin
        .from("unik_partners")
        .select("discount_code_id")
        .eq("seller_id", seller.id)
        .eq("referral_code", refCode)
        .eq("status", "active")
        .maybeSingle();
      if (refPartner?.discount_code_id) {
        const { data: refDiscount } = await admin.from("discount_codes").select("code").eq("id", refPartner.discount_code_id).maybeSingle();
        if (refDiscount?.code) referralCode = refDiscount.code;
      }
    }
  }

  const resolved = await resolveUnikCart({
    admin, sellerId: seller.id, userId: user.id, items,
    requestedIsPickup, requestedDeliveryName, streetAddress, townCity, province, postal,
    discountCode: requestedDiscountCode, referralCode,
  });
  mark("cartResolve");
  if (!resolved.ok) return NextResponse.json({ error: resolved.error }, { status: resolved.status });
  const { lineItems, deferredJobs, discountAmount, discountRow, total, shippingCost, shippingLabel, fulfillmentMethod } = resolved;

  const { data: order, error: insertErr } = await admin.from("orders").insert({
    seller_id: seller.id,
    customer_name: `${firstName} ${lastName}`.trim(),
    customer_email: email,
    customer_phone: phone,
    customer_auth_user_id: user.id,
    notes: notes || null,
    items: lineItems.map((i) => ({ id: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image, customization: { designId: i.designId, garment: i.garment, colour: i.colour, size: i.size, style: i.style } })),
    total,
    discount_code: discountRow?.code || null,
    discount_amount: discountAmount || 0,
    partner_id: discountRow?.partner_id || null,
    fulfillment_method: fulfillmentMethod,
    shipping_option: shippingLabel,
    shipping_address: fulfillmentMethod === "delivery" ? { address: streetAddress, apartment: suburb || undefined, city: townCity, province, postal_code: postal } : null,
    shipping_cost: shippingCost,
    payment_method: "yoco",
    payment_status: "pending",
    status: "pending",
  }).select("id").single();
  mark("orderInsert");
  if (insertErr || !order) {
    console.error("UNIK order insert failed:", insertErr);
    return NextResponse.json({ error: `Could not create your order (${insertErr?.message || "unknown error"})` }, { status: 500 });
  }

  // auth_user_id is set here (not just status) because a custom-upload
  // design created via /api/unik/custom-upload/save starts out unclaimed
  // (no account existed yet when the artwork was uploaded) -- this is where
  // it gets attached to the customer who's actually paying. A no-op for
  // AI Studio designs, which already belong to this same user.
  await admin.from("unik_designs").update({ status: "checkout_started", auth_user_id: user.id }).in("id", lineItems.map((i) => i.designId));
  mark("designsStatusUpdate");

  const sellerDomain = seller.custom_domain_status === "verified" ? seller.custom_domain : null;
  const origin = safeOrigin(body?.returnOrigin, sellerDomain);
  const yocoLineItems: YocoLineItem[] = lineItems.map((i) => ({ displayName: i.name, quantity: i.qty, pricingDetails: { price: Math.round(i.price * 100) } }));
  if (shippingCost > 0) yocoLineItems.push({ displayName: shippingLabel, quantity: 1, pricingDetails: { price: Math.round(shippingCost * 100) } });

  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(total * 100),
      metadata: { orderId: order.id },
      successUrl: `${origin}${CHECKOUT_PATH}?paid=1&orderId=${order.id}`,
      cancelUrl: `${origin}${CHECKOUT_PATH}?cancelled=1&orderId=${order.id}`,
      failureUrl: `${origin}${CHECKOUT_PATH}?failed=1&orderId=${order.id}`,
      lineItems: yocoLineItems,
    });
    mark("yocoCheckoutCreate");
    await admin.from("orders").update({ yoco_checkout_id: checkout.id }).eq("id", order.id);
    mark("orderYocoIdUpdate");
    console.log("UNIK checkout timing", { orderId: order.id, itemCount: items.length, timing });

    if (deferredJobs.length) {
      const orderId = order.id;
      // Runs after the response above has already gone out to the browser
      // (the customer is on their way to Yoco).
      after(() => runDeferredUnikUploads(admin, seller.id, orderId, deferredJobs));
    }

    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err: any) {
    mark("yocoCheckoutFailed");
    console.error("Yoco checkout creation failed:", err, { timing });
    return NextResponse.json({ error: `Could not start payment (${err?.message || "unknown error"})` }, { status: 502 });
  }
}
