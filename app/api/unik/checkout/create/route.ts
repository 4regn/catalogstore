import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";
import { createYocoCheckout, type YocoLineItem } from "../../../../../lib/yoco";

export const dynamic = "force-dynamic";

const DELIVERY_COST = 79;
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";
const CHECKOUT_PATH = "/private-templates/unik-labs/checkout.html";

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

const PRODUCT_BY_GARMENT: Record<string, string> = { tee: "AI Tee", hoodie: "AI Hoodie" };

/* Creates a real Catalogstore order for a UNIK cart and returns a Yoco
   redirect URL. Only ai-studio designs are supported for now -- custom
   uploads (upload.html) aren't persisted server-side yet, so there's no
   design record to validate ownership/price against. Price is always
   resolved from the `products` table server-side; the browser only ever
   supplies design ids. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("unik-checkout-create:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const items: { designId?: string; qty?: number }[] = Array.isArray(body?.items) ? body.items : [];
  const customer = body?.customer || {};
  const firstName = String(customer.firstName || "").trim().slice(0, 80);
  const lastName = String(customer.lastName || "").trim().slice(0, 80);
  const email = String(customer.email || "").trim().slice(0, 160);
  const address = String(customer.address || "").trim().slice(0, 300);
  const city = String(customer.city || "").trim().slice(0, 120);
  const postal = String(customer.postal || "").trim().slice(0, 12);

  if (!items.length) return NextResponse.json({ error: "Your cart is empty" }, { status: 400 });
  if (!firstName || !lastName) return NextResponse.json({ error: "First and last name are required" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "A valid email address is required" }, { status: 400 });
  if (!address || !city || !postal) return NextResponse.json({ error: "A complete delivery address is required" }, { status: 400 });

  const admin = getAdmin();

  const designIds = items.map((i) => i.designId).filter((id): id is string => typeof id === "string" && id.length > 0);
  if (designIds.length !== items.length) return NextResponse.json({ error: "One of the items in your cart is invalid" }, { status: 400 });

  const { data: designs, error: designsErr } = await admin
    .from("unik_designs")
    .select("id, seller_id, auth_user_id, source, status, garment, colour, size, style, name, preview_url, mockup_url")
    .in("id", designIds);
  if (designsErr) console.error("UNIK checkout: unik_designs lookup failed:", designsErr);

  const designMap = new Map((designs || []).map((d) => [d.id, d]));
  const { data: products } = await admin.from("products").select("id, name, price, category").eq("seller_id", seller.id).eq("status", "published");
  const productByName = new Map((products || []).map((p) => [p.name, p]));

  const lineItems: { productId: string; name: string; price: number; qty: number; designId: string; garment: string; colour: string; size: string; style: string; image: string | null }[] = [];

  for (const item of items) {
    const design = designMap.get(item.designId!);
    if (!design) return NextResponse.json({ error: "One of your designs could not be found" }, { status: 404 });
    if (design.seller_id !== seller.id || design.auth_user_id !== user.id) return NextResponse.json({ error: "One of your designs is not accessible" }, { status: 403 });
    if (design.source !== "ai-studio") return NextResponse.json({ error: "Custom-upload checkout isn't available yet -- please use an AI Studio design" }, { status: 400 });
    if (design.status !== "generated" && design.status !== "saved") return NextResponse.json({ error: `That design is already ${design.status.replace("_", " ")}` }, { status: 409 });

    const productName = PRODUCT_BY_GARMENT[design.garment];
    const product = productName ? productByName.get(productName) : undefined;
    if (!product) return NextResponse.json({ error: "That product is not currently available" }, { status: 400 });

    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));
    lineItems.push({
      productId: product.id, name: product.name, price: Number(product.price), qty,
      designId: design.id, garment: design.garment, colour: design.colour, size: design.size, style: design.style,
      image: design.mockup_url || design.preview_url || null,
    });
  }

  const subtotal = lineItems.reduce((sum, i) => sum + i.price * i.qty, 0);
  const total = subtotal + DELIVERY_COST;

  const { data: order, error: insertErr } = await admin.from("orders").insert({
    seller_id: seller.id,
    customer_name: `${firstName} ${lastName}`.trim(),
    customer_email: email,
    customer_auth_user_id: user.id,
    items: lineItems.map((i) => ({ id: i.productId, name: i.name, price: i.price, qty: i.qty, image: i.image, customization: { designId: i.designId, garment: i.garment, colour: i.colour, size: i.size, style: i.style } })),
    total,
    shipping_address: { address, city, postal_code: postal },
    shipping_cost: DELIVERY_COST,
    payment_method: "yoco",
    payment_status: "pending",
    status: "pending",
  }).select("id").single();
  if (insertErr || !order) {
    console.error("UNIK order insert failed:", insertErr);
    return NextResponse.json({ error: "Could not create your order" }, { status: 500 });
  }

  await admin.from("unik_designs").update({ status: "checkout_started" }).in("id", lineItems.map((i) => i.designId));

  const origin = safeOrigin(body?.returnOrigin);
  const yocoLineItems: YocoLineItem[] = lineItems.map((i) => ({ displayName: i.name, quantity: i.qty, pricingDetails: { price: Math.round(i.price * 100) } }));

  try {
    const checkout = await createYocoCheckout({
      amountCents: Math.round(total * 100),
      metadata: { orderId: order.id },
      successUrl: `${origin}${CHECKOUT_PATH}?paid=1&orderId=${order.id}`,
      cancelUrl: `${origin}${CHECKOUT_PATH}?cancelled=1&orderId=${order.id}`,
      failureUrl: `${origin}${CHECKOUT_PATH}?failed=1&orderId=${order.id}`,
      lineItems: yocoLineItems,
    });
    await admin.from("orders").update({ yoco_checkout_id: checkout.id }).eq("id", order.id);
    return NextResponse.json({ ok: true, orderId: order.id, redirectUrl: checkout.redirectUrl });
  } catch (err: any) {
    console.error("Yoco checkout creation failed:", err);
    return NextResponse.json({ error: "Could not start payment. Please try again." }, { status: 502 });
  }
}
