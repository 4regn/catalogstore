import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../lib/rate-limit";
import { requireUnikCustomer } from "../../../../lib/unik-customer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const SHIPPING_COST = 79;
const SIZES = new Set(["XS", "S", "M", "L", "XL", "XXL"]);
const GARMENTS = new Set(["tee", "hoodie"]);
const COLOURS = new Set(["black", "white", "beige"]);

type CartItem = {
  source?: string;
  qty?: number;
  options?: Record<string, unknown>;
};

function clean(value: unknown, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

function priceFor(source: string, garment: string, zone: string) {
  if (source === "ai-studio") return garment === "hoodie" ? 399 : 349;
  if (garment === "hoodie") return zone === "both" ? 450 : 350;
  return zone === "both" ? 379 : 299;
}

export async function POST(req: NextRequest) {
  const limit = rateLimit(`unik-checkout:${getClientIP(req)}`, 10, 60);
  if (!limit.allowed) return NextResponse.json({ error: "Too many checkout attempts. Please wait a moment." }, { status: 429 });

  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  const secretKey = process.env.YOCO_UNIK_SECRET_KEY;
  if (!secretKey) return NextResponse.json({ error: "Secure payment is not configured yet." }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid checkout request." }, { status: 400 });
  }

  const rawItems = Array.isArray(body.items) ? body.items as CartItem[] : [];
  const customer = body.customer && typeof body.customer === "object" ? body.customer as Record<string, unknown> : {};
  const address = body.address && typeof body.address === "object" ? body.address as Record<string, unknown> : {};
  if (!rawItems.length || rawItems.length > 10) return NextResponse.json({ error: "Your cart is empty or contains too many pieces." }, { status: 400 });

  const firstName = clean(customer.firstName, 80);
  const lastName = clean(customer.lastName, 80);
  const phone = clean(customer.phone, 40);
  const street = clean(address.address, 240);
  const city = clean(address.city, 100);
  const province = clean(address.province, 100);
  const postalCode = clean(address.postal_code, 20);
  if (!firstName || !lastName || !phone || !street || !city || !province || !postalCode) {
    return NextResponse.json({ error: "Please complete all delivery details." }, { status: 400 });
  }

  const requested = rawItems.map((item) => ({
    source: clean(item.source, 30),
    qty: Math.floor(Number(item.qty || 1)),
    designId: item.options?.designId,
  }));
  if (requested.some((item) => !["ai-studio", "custom-upload"].includes(item.source) || item.qty !== 1 || !isUuid(item.designId))) {
    return NextResponse.json({ error: "One of these pieces is no longer checkout-ready. Please remove it and add it again." }, { status: 400 });
  }

  const designIds = requested.map((item) => item.designId as string);
  const { data: designs, error: designError } = await getAdmin()
    .from("unik_designs")
    .select("id, source, status, name, garment, colour, size, style, options, mockup_url")
    .eq("seller_id", seller.id)
    .eq("auth_user_id", user.id)
    .in("id", designIds);
  if (designError) return NextResponse.json({ error: "Could not verify your saved pieces." }, { status: 500 });

  const designMap = new Map((designs || []).map((design) => [design.id, design]));
  const lineItems: Array<Record<string, unknown>> = [];
  for (const requestedItem of requested) {
    const design = designMap.get(requestedItem.designId as string) as any;
    if (!design || design.source !== requestedItem.source) {
      return NextResponse.json({ error: "A saved design in your cart could not be verified. Please add it again." }, { status: 409 });
    }
    const garment = clean(design.garment, 20).toLowerCase();
    const colour = clean(design.colour, 20).toLowerCase();
    const size = clean(design.size, 8).toUpperCase();
    const options = design.options && typeof design.options === "object" ? design.options as Record<string, unknown> : {};
    const zone = design.source === "custom-upload" && clean(options.zone, 20) === "both" ? "both" : "front";
    if (!GARMENTS.has(garment) || !COLOURS.has(colour) || !SIZES.has(size)) {
      return NextResponse.json({ error: "A saved garment has invalid options. Please create it again." }, { status: 409 });
    }
    const price = priceFor(design.source, garment, zone);
    const name = design.source === "ai-studio" ? "UNIK Labs AI Design" : "UNIK Labs Custom Print";
    const variant = [garment === "hoodie" ? "Hoodie" : "Tee", colour, size, design.source === "custom-upload" ? (zone === "both" ? "Front + back" : "Front print") : clean(design.style, 50).replaceAll("_", " ")].filter(Boolean).join(" · ");
    lineItems.push({
      id: design.id,
      designId: design.id,
      source: design.source,
      name,
      price,
      qty: 1,
      variant,
      image: design.mockup_url || null,
      options: { ...options, designId: design.id, garment, colour, size, zone, style: design.style || null },
    });
  }

  const subtotal = lineItems.reduce((sum, item) => sum + Number(item.price), 0);
  const total = subtotal + SHIPPING_COST;
  const orderRow = {
    seller_id: seller.id,
    customer_auth_user_id: user.id,
    customer_name: `${firstName} ${lastName}`,
    customer_email: user.email!.toLowerCase(),
    customer_phone: phone,
    items: lineItems,
    subtotal,
    total,
    shipping_address: { address: street, city, province, postal_code: postalCode },
    shipping_cost: SHIPPING_COST,
    shipping_option: "Nationwide delivery",
    fulfillment_method: "delivery",
    payment_method: "yoco",
    payment_status: "pending",
    status: "pending",
  };

  const { data: order, error: orderError } = await getAdmin()
    .from("orders")
    .insert(orderRow)
    .select("id, order_number, total")
    .single();
  if (orderError || !order) {
    console.error("UNIK order insert failed", orderError);
    return NextResponse.json({ error: "Could not create your secure order." }, { status: 500 });
  }

  const storefront = (process.env.UNIK_STOREFRONT_URL || "https://unik.catalogstore.co.za").replace(/\/$/, "");
  const returnPath = "/private-templates/unik-labs/checkout.html";
  const orderParam = encodeURIComponent(order.id);
  let yocoResponse: Response;
  try {
    yocoResponse = await fetch("https://payments.yoco.com/api/checkouts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `unik-order-${order.id}`,
      },
      body: JSON.stringify({
        amount: Math.round(Number(order.total) * 100),
        currency: "ZAR",
        successUrl: `${storefront}${returnPath}?payment=success&order=${orderParam}`,
        cancelUrl: `${storefront}${returnPath}?payment=cancelled&order=${orderParam}`,
        failureUrl: `${storefront}${returnPath}?payment=failed&order=${orderParam}`,
        clientReferenceId: String(order.order_number || order.id),
        externalId: order.id,
        metadata: { orderId: order.id, sellerId: seller.id, storefront: "unik-labs" },
      }),
      cache: "no-store",
    });
  } catch (cause) {
    console.error("Yoco checkout request failed", cause);
    return NextResponse.json({ error: "Yoco could not be reached. Your cart is safe—please try again." }, { status: 502 });
  }

  const yoco = await yocoResponse.json().catch(() => ({})) as Record<string, unknown>;
  if (!yocoResponse.ok || !clean(yoco.id, 120) || !clean(yoco.redirectUrl, 500)) {
    console.error("Yoco checkout creation rejected", { status: yocoResponse.status, yoco });
    return NextResponse.json({ error: "Yoco could not start this payment. Your cart is safe—please try again." }, { status: 502 });
  }

  const { error: referenceError } = await getAdmin().from("orders").update({ yoco_checkout_id: clean(yoco.id, 120) }).eq("id", order.id);
  if (referenceError) {
    console.error("Could not save Yoco checkout reference", referenceError);
    return NextResponse.json({ error: "The Yoco database update is not installed yet." }, { status: 503 });
  }

  await getAdmin().from("unik_designs").update({ status: "checkout_started", updated_at: new Date().toISOString() }).in("id", designIds).eq("auth_user_id", user.id);

  return NextResponse.json({
    orderId: order.id,
    orderNumber: order.order_number || order.id.slice(0, 8).toUpperCase(),
    total: order.total,
    redirectUrl: yoco.redirectUrl,
  }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}
