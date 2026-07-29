import { NextRequest, NextResponse, after } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../../lib/unik-partner";
import { rateLimit, getClientIP } from "../../../../../../lib/rate-limit";
import { createYocoCheckout, type YocoLineItem } from "../../../../../../lib/yoco";
import { PRODUCT_BY_GARMENT } from "../../../../../../lib/unik-catalog";

export const dynamic = "force-dynamic";

const DEFAULT_DELIVERY = { name: "Nationwide Delivery", price: 79 };
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

// Same allowlist logic as /api/unik/checkout/create's safeOrigin -- the
// partner dashboard is a live React page rather than a static file at a
// fixed path, so the client sends back its own window.location.pathname
// (returnPath) as well as its origin, and this only validates the origin.
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

function safePath(raw: unknown): string {
  if (typeof raw !== "string" || !raw.startsWith("/") || raw.startsWith("//")) return "/partners/dashboard";
  return raw.slice(0, 200);
}

/* Lets a partner place an order themselves -- on behalf of a WhatsApp
   customer who's already agreed to a design -- paying with their OWN card,
   shipping to the end customer's address. This is deliberately a separate
   endpoint from /api/unik/checkout/create rather than a reuse: that route
   authenticates as requireUnikCustomer and treats the signed-in user as
   the buyer/recipient (customer_auth_user_id, name/email/phone all come
   from their own account); here the signed-in user (the partner) is only
   ever the payer, never the customer of record. Only Studio-generated
   designs the partner themselves owns can be ordered this way -- no
   custom-upload path, no discount code (this isn't a referral, it's a
   direct sale the partner is fulfilling). */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("unik-partner-checkout-create:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { user, seller, partner } = auth;
  if (partner.status !== "active") {
    return NextResponse.json({ error: "Your partner account isn't active yet" }, { status: 403 });
  }

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const items: { designId?: string; qty?: number }[] = Array.isArray(body?.items) ? body.items : [];
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

  if (!items.length) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "The customer's first and last name are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid customer email address is required" }, { status: 400 });
  if (phone.replace(/[^0-9]/g, "").length < 9) return NextResponse.json({ error: "A valid customer phone number is required" }, { status: 400 });

  const admin = getAdmin();

  const { data: sellerConfigRow } = await admin.from("sellers").select("checkout_config").eq("id", seller.id).single();
  const cc = (sellerConfigRow?.checkout_config || {}) as any;

  let fulfillmentMethod: "delivery" | "pickup" = "delivery";
  let shippingCost = 0;
  let shippingLabel = DEFAULT_DELIVERY.name;

  if (requestedIsPickup) {
    if (!cc.pickup_enabled) return NextResponse.json({ error: "Pickup isn't available for this store" }, { status: 400 });
    fulfillmentMethod = "pickup";
    shippingCost = 0;
    shippingLabel = "Studio Pickup";
  } else {
    if (cc.delivery_enabled === false) return NextResponse.json({ error: "Delivery isn't available for this store" }, { status: 400 });
    if (!streetAddress || !townCity || !province || !postal) return NextResponse.json({ error: "A complete delivery address is required" }, { status: 400 });
    const options = Array.isArray(cc.shipping_options) && cc.shipping_options.length ? cc.shipping_options : [DEFAULT_DELIVERY];
    const matched = options.find((o: any) => String(o.name || "").trim() === requestedDeliveryName) || options[0];
    shippingCost = Number(matched.price) || 0;
    shippingLabel = matched.name || DEFAULT_DELIVERY.name;
  }

  for (const item of items) {
    if (!item.designId) return NextResponse.json({ error: "One of the items in your cart is invalid" }, { status: 400 });
  }

  const designIds = items.map((i) => i.designId!).filter(Boolean);
  const { data: designs, error: designsErr } = designIds.length
    ? await admin.from("unik_designs").select("id, seller_id, auth_user_id, owner_role, source, status, garment, colour, size, style, mockup_url").in("id", designIds)
    : { data: [], error: null };
  if (designsErr) console.error("UNIK partner checkout: unik_designs lookup failed:", designsErr);
  const designMap = new Map((designs || []).map((d) => [d.id, d]));
  const { data: products } = await admin.from("products").select("id, name, price, category").eq("seller_id", seller.id).eq("status", "published");
  const productByName = new Map((products || []).map((p) => [p.name, p]));

  type LineItem = { productId: string; name: string; price: number; qty: number; designId: string; garment: string; colour: string; size: string; style: string | null; image: string | null };
  const lineItems: LineItem[] = [];
  for (const item of items) {
    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
    const design = designMap.get(item.designId!);
    if (!design) return NextResponse.json({ error: "One of your designs could not be found" }, { status: 404 });
    if (design.seller_id !== seller.id || design.auth_user_id !== user.id) {
      return NextResponse.json({ error: "One of your designs is not accessible" }, { status: 403 });
    }
    if (design.owner_role !== "partner" || design.source !== "ai-studio") {
      return NextResponse.json({ error: "One of your designs has an unrecognised source" }, { status: 400 });
    }
    if (design.status === "processing" || design.status === "failed" || design.status === "expired") {
      return NextResponse.json({ error: `That design is ${design.status} and can't be ordered` }, { status: 409 });
    }
    const productName = PRODUCT_BY_GARMENT[design.garment];
    const product = productName ? productByName.get(productName) : undefined;
    if (!product) return NextResponse.json({ error: "That product is not currently available" }, { status: 400 });
    lineItems.push({ productId: product.id, name: product.name, price: Number(product.price), qty, designId: design.id, garment: design.garment, colour: design.colour, size: design.size, style: design.style, image: design.mockup_url || null });
  }

  const subtotal = lineItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const total = Math.max(0, subtotal + shippingCost);

  const { data: order, error: insertErr } = await admin.from("orders").insert({
    seller_id: seller.id,
    customer_name: `${firstName} ${lastName}`.trim(),
    customer_email: email,
    customer_phone: phone,
    customer_auth_user_id: null,
    notes: notes || null,
    items: lineItems.map((i) => ({ id: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image, customization: { designId: i.designId, garment: i.garment, colour: i.colour, size: i.size, style: i.style } })),
    total,
    discount_code: null,
    discount_amount: 0,
    partner_id: partner.id,
    channel: "partner_direct",
    fulfillment_method: fulfillmentMethod,
    shipping_option: shippingLabel,
    shipping_address: fulfillmentMethod === "delivery" ? { address: streetAddress, apartment: suburb || undefined, city: townCity, province, postal_code: postal } : null,
    shipping_cost: shippingCost,
    payment_method: "yoco",
    payment_status: "pending",
    status: "pending",
  }).select("id").single();
  if (insertErr || !order) {
    console.error("UNIK partner order insert failed:", insertErr);
    return NextResponse.json({ error: "Could not create the order" }, { status: 500 });
  }

  await admin.from("unik_designs").update({ status: "checkout_started" }).in("id", lineItems.map((i) => i.designId));

  const sellerDomain = seller.custom_domain_status === "verified" ? seller.custom_domain : null;
  const origin = safeOrigin(body?.returnOrigin, sellerDomain);
  const returnPath = safePath(body?.returnPath);
  const yocoLineItems: YocoLineItem[] = lineItems.map((i) => ({ displayName: i.name, quantity: i.qty, pricingDetails: { price: Math.round(i.price * 100) } }));
  if (shippingCost > 0) yocoLineItems.push({ displayName: shippingLabel, quantity: 1, pricingDetails: { price: Math.round(shippingCost * 100) } });

  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(total * 100),
      metadata: { orderId: order.id },
      successUrl: `${origin}${returnPath}?paid=1&orderId=${order.id}`,
      cancelUrl: `${origin}${returnPath}?cancelled=1&orderId=${order.id}`,
      failureUrl: `${origin}${returnPath}?failed=1&orderId=${order.id}`,
      lineItems: yocoLineItems,
    });
    await admin.from("orders").update({ yoco_checkout_id: checkout.id }).eq("id", order.id);
    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (cause) {
    console.error("UNIK partner checkout: Yoco checkout creation failed", cause);
    after(async () => {
      await admin.from("orders").update({ payment_status: "failed", status: "failed" }).eq("id", order.id).eq("payment_status", "pending");
    });
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
