import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { storePath } from "../../../../lib/store-url";
import { createFloatCheckout } from "../../../../lib/float";

const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

function allowedReturnOrigin(raw: unknown, customDomain: unknown): string {
  if (typeof raw !== "string") return APP_ORIGIN;
  try {
    const candidate = new URL(raw);
    const appHost = new URL(APP_ORIGIN).hostname.toLowerCase();
    const host = candidate.hostname.toLowerCase();
    const sellerHost = typeof customDomain === "string" ? customDomain.replace(/^https?:\/\//, "").split("/")[0].toLowerCase() : "";
    if (candidate.protocol !== "https:" && host !== "localhost" && host !== "127.0.0.1") return APP_ORIGIN;
    if (host === appHost || host.endsWith(`.${appHost}`) || host === sellerHost || host === `www.${sellerHost}` || host === "localhost" || host === "127.0.0.1") {
      return candidate.origin;
    }
  } catch {}
  return APP_ORIGIN;
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIP(req);
    if (!rateLimit("float-redirect:" + ip, 5, 60).allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

    const { orderId, slug, returnOrigin } = await req.json();
    if (!orderId || !slug) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const admin = getAdmin();
    const { data: seller } = await admin.from("sellers").select("id, checkout_config, store_name, custom_domain").eq("subdomain", slug).single();
    if (!seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });
    if (!(seller.checkout_config as any)?.float_enabled) return NextResponse.json({ error: "Float is not enabled for this store" }, { status: 400 });

    const { data: order } = await admin.from("orders").select("*").eq("id", orderId).single();
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    if (order.seller_id !== seller.id) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    if (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered" || order.status === "cancelled") {
      return NextResponse.json({ error: "Order is not eligible for payment" }, { status: 409 });
    }

    const origin = allowedReturnOrigin(returnOrigin, seller.custom_domain);
    const checkoutPath = storePath(origin, slug, "/checkout");
    const cartEncoded = Buffer.from(JSON.stringify(order.items || [])).toString("base64");
    const address = order.shipping_address || {};
    const customerNames = String(order.customer_name || "").trim().split(/\s+/);
    const checkout = await createFloatCheckout({
      amountCents: Math.round(Number(order.total) * 100),
      orderId: order.id,
      notifyUrl: `${APP_ORIGIN}/api/checkout/float-callback`,
      successUrl: `${origin}${checkoutPath}?paid=${order.id}`,
      cancelUrl: `${origin}${checkoutPath}?cancelled=1&cart=${encodeURIComponent(cartEncoded)}`,
      customer: {
        firstName: customerNames[0] || undefined,
        lastName: customerNames.slice(1).join(" ") || undefined,
        email: order.customer_email,
        phone: order.customer_phone || undefined,
        billingAddress: [address.address, address.apartment, address.city, address.province, address.postal_code].filter(Boolean).join(", ") || undefined,
      },
      displayName: `Order ${order.order_number || order.id.slice(0, 8)} from ${seller.store_name}`,
    });

    await admin.from("orders").update({ float_checkout_id: checkout.id }).eq("id", order.id);
    return NextResponse.json({ redirectUrl: checkout.paymentUrl });
  } catch (err) {
    console.error("Float redirect error:", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start Float checkout" }, { status: 502 });
  }
}
