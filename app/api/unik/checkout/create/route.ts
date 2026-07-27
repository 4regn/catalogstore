import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout, type YocoLineItem } from "../../../../../lib/yoco";

export const dynamic = "force-dynamic";

const DEFAULT_DELIVERY = { name: "Nationwide Delivery", price: 79 };
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

const PRODUCT_BY_GARMENT: Record<string, string> = { tee: "AI Tee", hoodie: "AI Hoodie", "tee-budget": "AI Tee — Budget (A4)" };
const CUSTOM_PRODUCT_BY_GARMENT_ZONE: Record<string, string> = {
  tee_front: "Custom Tee — Front", tee_both: "Custom Tee — Front + Back",
  hoodie_front: "Custom Hoodie — Front", hoodie_both: "Custom Hoodie — Front + Back",
};
const GARMENTS = new Set(["tee", "hoodie"]);
const COLOURS = new Set(["black", "white", "beige"]);
const ZONES = new Set(["front", "both"]);
const MAX_IMAGE_BASE64_LEN = 6_000_000; // ~4.5MB decoded, generous for a phone photo

function decodeDataUrl(raw: unknown): { base64: string; ext: string } | null {
  if (typeof raw !== "string" || !raw) return null;
  const match = raw.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  const base64 = match ? match[2] : (/^[A-Za-z0-9+/=\r\n]+$/.test(raw) ? raw : null);
  if (!base64 || base64.length > MAX_IMAGE_BASE64_LEN) return null;
  const ext = match ? (match[1] === "jpg" ? "jpeg" : match[1]) : "jpeg";
  return { base64, ext };
}

/* Creates a real Catalogstore order for a UNIK cart and returns a Yoco
   redirect URL. Cart items are either a pre-generated AI Studio design
   (designId) or raw Custom Upload artwork+placement (customUpload) --
   both go through this same route and the same price-resolution/order-
   creation path. A custom-upload design record is created here, at
   checkout time, rather than when the customer uploads/positions their
   artwork -- that's what lets Custom Upload skip requiring an account
   until checkout (this whole endpoint already requires one), instead of
   needing its own separate sign-in gate the way AI Studio generation
   does (which needs one earlier, to enforce the daily generation limit). */
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

  const items: {
    designId?: string; qty?: number; preview?: string;
    customUpload?: { garment?: string; colour?: string; size?: string; zone?: string; frontImage?: string; backImage?: string; previewFront?: string; previewBack?: string };
  }[] = Array.isArray(body?.items) ? body.items : [];
  const customer = body?.customer || {};
  const firstName = String(customer.firstName || "").trim().slice(0, 80);
  const lastName = String(customer.lastName || "").trim().slice(0, 80);
  const email = String(customer.email || "").trim().slice(0, 160);
  const streetAddress = String(customer.streetAddress || "").trim().slice(0, 300);
  const suburb = String(customer.suburb || "").trim().slice(0, 120);
  const townCity = String(customer.townCity || "").trim().slice(0, 120);
  const province = String(customer.province || "").trim().slice(0, 60);
  const postal = String(customer.postal || "").trim().slice(0, 12);
  const requestedDelivery = body?.deliveryMethod || {};
  const requestedIsPickup = !!requestedDelivery.isPickup;
  const requestedDeliveryName = String(requestedDelivery.name || "").trim().slice(0, 80);

  if (!items.length) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });

  const admin = getAdmin();

  // Delivery method + cost are always resolved from the seller's own
  // checkout settings server-side -- the browser's deliveryMethod only
  // says which one the customer picked (by name), never what it costs.
  const { data: sellerConfigRow } = await admin.from("sellers").select("checkout_config").eq("id", seller.id).single();
  mark("sellerConfig");
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
    if (!item.designId && !item.customUpload) return NextResponse.json({ error: "One of the items in your cart is invalid" }, { status: 400 });
  }

  const designIds = items.map((i) => i.designId).filter((id): id is string => typeof id === "string" && id.length > 0);
  const { data: designs, error: designsErr } = designIds.length
    ? await admin.from("unik_designs").select("id, seller_id, auth_user_id, source, status, garment, colour, size, style, name, preview_url, mockup_url").in("id", designIds)
    : { data: [], error: null };
  if (designsErr) console.error("UNIK checkout: unik_designs lookup failed:", designsErr);

  mark("designsLookup");
  const designMap = new Map((designs || []).map((d) => [d.id, d]));
  const { data: products } = await admin.from("products").select("id, name, price, category").eq("seller_id", seller.id).eq("status", "published");
  mark("productsLookup");
  const productByName = new Map((products || []).map((p) => [p.name, p]));

  type LineItem = { productId: string; name: string; price: number; qty: number; designId: string; garment: string; colour: string; size: string; style: string | null; image: string | null };
  type ItemResult = { ok: true; item: LineItem } | { ok: false; error: string; status: number };

  // Each cart item is independent of every other one (its own design
  // record, its own uploads), so processing them concurrently instead of
  // one at a time matters just as much for a multi-item cart as
  // parallelizing the uploads within a single item did above. Errors are
  // collected rather than returned early so ordering stays deterministic --
  // the FIRST invalid item (by original cart position) is still what gets
  // reported, matching the previous sequential loop's behaviour exactly.
  const results: ItemResult[] = await Promise.all(items.map(async (item): Promise<ItemResult> => {
    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));

    if (item.customUpload) {
      const cu = item.customUpload;
      const garment = String(cu.garment || "").toLowerCase();
      const colour = String(cu.colour || "").toLowerCase();
      const size = String(cu.size || "").toUpperCase();
      const zone = String(cu.zone || "").toLowerCase();
      if (!GARMENTS.has(garment) || !COLOURS.has(colour) || !ZONES.has(zone)) {
        return { ok: false, error: "One of your custom uploads has invalid options", status: 400 };
      }
      if (!/^(XS|S|M|L|XL|XXL)$/.test(size)) return { ok: false, error: "One of your custom uploads is missing a size", status: 400 };
      const front = decodeDataUrl(cu.frontImage);
      if (!front) return { ok: false, error: "One of your custom uploads has an invalid or missing front image", status: 400 };
      const back = zone === "both" ? decodeDataUrl(cu.backImage) : null;
      if (zone === "both" && !back) return { ok: false, error: "One of your custom uploads is missing a back image", status: 400 };

      const productName = CUSTOM_PRODUCT_BY_GARMENT_ZONE[`${garment}_${zone}`];
      const product = productName ? productByName.get(productName) : undefined;
      if (!product) return { ok: false, error: "That product is not currently available", status: 400 };

      const { data: design, error: designInsertErr } = await admin.from("unik_designs").insert({
        seller_id: seller.id, auth_user_id: user.id, source: "custom-upload", status: "generated",
        name: "UNIK Labs Custom Print", garment, colour, size, options: { zone },
      }).select("id").single();
      if (designInsertErr || !design) {
        console.error("UNIK checkout: custom-upload design insert failed:", designInsertErr);
        return { ok: false, error: "Could not save your custom upload", status: 500 };
      }

      const designId = design.id;
      const frontPath = `${user.id}/${designId}/front.${front.ext}`;
      const backPath = back ? `${user.id}/${designId}/back.${back.ext}` : null;

      // Two distinct public images can exist per side: the garment+artwork
      // composite the customer saw while positioning it ("mockup"), and --
      // separately -- the raw uploaded artwork itself, which the account
      // page shows as the "watermarked design" slot. The raw artwork stays
      // in the private bucket (frontPath/backPath above); only the
      // composited mockups get copied to public storage here.
      async function uploadPreview(dataUrl: string | undefined, suffix: string): Promise<string | null> {
        const data = decodeDataUrl(dataUrl);
        if (!data) return null;
        const path = `${seller.id}/unik-previews/${designId}-${suffix}.${data.ext}`;
        const { error } = await admin.storage.from("store-assets").upload(path, Buffer.from(data.base64, "base64"), { contentType: `image/${data.ext}`, upsert: true });
        if (error) { console.error(`UNIK checkout: ${suffix} preview upload failed:`, error); return null; }
        return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
      }

      // These four uploads are all independent (none needs another's
      // result), so running them in parallel instead of one-at-a-time cuts
      // this from ~4 sequential round-trips to ~1 -- this was the main
      // source of "Proceed to Checkout" taking the better part of a minute.
      const [frontUploadResult, backUploadResult, mockupFrontUrl, mockupBackUrl] = await Promise.all([
        admin.storage.from("unik-private-designs").upload(frontPath, Buffer.from(front.base64, "base64"), { contentType: `image/${front.ext}`, upsert: true }),
        back ? admin.storage.from("unik-private-designs").upload(backPath!, Buffer.from(back.base64, "base64"), { contentType: `image/${back.ext}`, upsert: true }) : Promise.resolve(null),
        uploadPreview(cu.previewFront || item.preview, "front"),
        zone === "both" ? uploadPreview(cu.previewBack, "back") : Promise.resolve(null),
      ]);
      if (frontUploadResult?.error) console.error("UNIK checkout: front artwork upload failed:", frontUploadResult.error);
      if (backUploadResult?.error) console.error("UNIK checkout: back artwork upload failed:", backUploadResult.error);

      await admin.from("unik_designs").update({
        private_artwork_path: frontPath,
        options: { zone, back_artwork_path: backPath, mockup_back_url: mockupBackUrl },
        mockup_url: mockupFrontUrl,
      }).eq("id", designId);

      return {
        ok: true,
        item: { productId: product.id, name: product.name, price: Number(product.price), qty, designId, garment, colour, size, style: null, image: mockupFrontUrl },
      };
    }

    const design = designMap.get(item.designId!);
    if (!design) return { ok: false, error: "One of your designs could not be found", status: 404 };
    if (design.seller_id !== seller.id || design.auth_user_id !== user.id) return { ok: false, error: "One of your designs is not accessible", status: 403 };
    if (design.source !== "ai-studio") return { ok: false, error: "One of your designs has an unrecognised source", status: 400 };
    // A design can be ordered any number of times (e.g. buying the same
    // piece as a gift for someone else, or in a different quantity) --
    // status here is informational for the account page, not a one-time
    // gate. Only a design that never finished generating is unorderable.
    if (design.status === "processing" || design.status === "failed" || design.status === "expired") {
      return { ok: false, error: `That design is ${design.status} and can't be ordered`, status: 409 };
    }

    const productName = PRODUCT_BY_GARMENT[design.garment];
    const product = productName ? productByName.get(productName) : undefined;
    if (!product) return { ok: false, error: "That product is not currently available", status: 400 };
    return {
      ok: true,
      item: { productId: product.id, name: product.name, price: Number(product.price), qty, designId: design.id, garment: design.garment, colour: design.colour, size: design.size, style: design.style, image: design.mockup_url || design.preview_url || null },
    };
  }));

  mark("itemsProcessed");
  const firstError = results.find((r): r is Extract<ItemResult, { ok: false }> => !r.ok);
  if (firstError) return NextResponse.json({ error: firstError.error }, { status: firstError.status });
  const lineItems: LineItem[] = results.map((r) => (r as Extract<ItemResult, { ok: true }>).item);

  const subtotal = lineItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const total = subtotal + shippingCost;

  const { data: order, error: insertErr } = await admin.from("orders").insert({
    seller_id: seller.id,
    customer_name: `${firstName} ${lastName}`.trim(),
    customer_email: email,
    customer_auth_user_id: user.id,
    items: lineItems.map((i) => ({ id: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image, customization: { designId: i.designId, garment: i.garment, colour: i.colour, size: i.size, style: i.style } })),
    total,
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
    return NextResponse.json({ error: "Could not create your order" }, { status: 500 });
  }

  await admin.from("unik_designs").update({ status: "checkout_started" }).in("id", lineItems.map((i) => i.designId));
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
    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err: any) {
    mark("yocoCheckoutFailed");
    console.error("Yoco checkout creation failed:", err, { timing });
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
