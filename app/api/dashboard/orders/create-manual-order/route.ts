import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit } from "../../../../../lib/rate-limit";
import { variantPriceDelta } from "../../../../../lib/product-pricing";
import { normalizeSouthAfricanPhone } from "../../../../../lib/four-regn-orders";
import { sendOrderConfirmationEmail } from "../../../../../lib/unik-orders";

export const dynamic = "force-dynamic";

/* Lets a seller record a sale that happened outside checkout (most
   commonly: a customer ordered over WhatsApp) as a real order row, so the
   customer can look it up on the normal order-tracking page exactly like
   any other order -- same reference format (the #<n>D trigger fires on
   any insert, not just checkout's), same items/variant/shipping-address
   shape the tracker and dashboard order-detail view already know how to
   render.

   Mirrors app/api/checkout/place-order/route.ts's insert as closely as it
   makes sense to: same server-truth price lookup (variantPriceDelta, not
   whatever the admin might mistype), same customers upsert, same core
   order columns, same defensive "drop optional columns and retry on a
   schema-cache miss" insert. The one thing NOT re-derived here is
   shipping cost -- a WhatsApp sale's delivery fee was whatever the seller
   actually agreed with the customer over chat, not something this
   platform's shipping-option table has a record of, so it's taken as
   given rather than recomputed. */

const VALID_PAYMENT_STATUSES = ["paid", "awaiting_payment", "pending"];
const VALID_ORDER_STATUSES = ["confirmed", "processing", "shipped", "picked_up", "in_transit", "out_for_delivery", "delivered", "pending"];

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body" }, { status: 400 }); }

    const {
      access_token, productId, selectedVariants, qty: rawQty,
      customer, fulfillment, address,
      shippingCost: rawShippingCost, shippingOption, paymentMethod,
      paymentStatus, orderStatus, notes, sendConfirmationEmail,
    } = body || {};

    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });
    if (typeof productId !== "string" || !productId) return NextResponse.json({ error: "Missing product" }, { status: 400 });
    const qty = Math.floor(Number(rawQty) || 0);
    if (qty < 1 || qty > 999) return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    if (
      !customer || typeof customer.email !== "string" || !customer.email.trim() ||
      typeof customer.firstName !== "string" || !customer.firstName.trim() ||
      typeof customer.lastName !== "string" || !customer.lastName.trim()
    ) {
      return NextResponse.json({ error: "Missing customer details" }, { status: 400 });
    }
    if (fulfillment !== "delivery" && fulfillment !== "pickup") {
      return NextResponse.json({ error: "Invalid fulfillment method" }, { status: 400 });
    }
    if (
      fulfillment === "delivery" &&
      (!address || typeof address.address !== "string" || !address.address.trim() ||
        typeof address.city !== "string" || !address.city.trim() ||
        typeof address.postal_code !== "string" || !address.postal_code.trim())
    ) {
      return NextResponse.json({ error: "Delivery address incomplete" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const sellerId = userData.user.id;

    if (!rateLimit("create-manual-order:" + sellerId, 30, 3600).allowed) {
      return NextResponse.json({ error: "Too many manual orders created recently -- please wait a bit." }, { status: 429 });
    }

    const { data: seller } = await admin.from("sellers").select("id, subdomain, store_name, email, logo_url").eq("id", sellerId).maybeSingle();
    if (!seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

    const { data: product } = await admin.from("products").select("id, name, price, image_url, variants").eq("id", productId).eq("seller_id", sellerId).maybeSingle();
    if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });

    const cleanSelectedVariants: Record<string, string> = {};
    if (selectedVariants && typeof selectedVariants === "object") {
      for (const [k, v] of Object.entries(selectedVariants)) {
        if (typeof v === "string" && v.trim()) cleanSelectedVariants[k] = v.trim();
      }
    }
    const price = Math.max(0, (Number(product.price) || 0) + variantPriceDelta(product.variants, cleanSelectedVariants));
    const variantLabel = Object.entries(cleanSelectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ");

    // Prefer the chosen colour's own photo when the product defines one --
    // same {groupName: {option: url}} shape FourRegnStore.tsx's
    // resolveVariantImage reads for the live storefront's variant swatches.
    let image: string | null = product.image_url || null;
    if (Array.isArray(product.variants)) {
      for (const group of product.variants as { name?: string; images?: Record<string, string | string[]> }[]) {
        const chosen = group?.name ? cleanSelectedVariants[group.name] : undefined;
        const img = chosen ? group?.images?.[chosen] : undefined;
        if (img) { image = Array.isArray(img) ? img[0] : img; break; }
      }
    }

    const shippingCost = Math.max(0, Number(rawShippingCost) || 0);
    const subtotal = Math.round(price * qty * 100) / 100;
    const total = Math.round((subtotal + shippingCost) * 100) / 100;
    const normalizedEmail = String(customer.email).trim().toLowerCase();
    const rawPhone = customer.phone ? String(customer.phone).trim() : "";
    const phone = rawPhone ? (normalizeSouthAfricanPhone(rawPhone) || rawPhone) : null;

    // Same "link to the existing CRM customer if we already know this
    // email, else create one" as checkout -- source is "manual" (not
    // "checkout") so the customer list can tell WhatsApp sales apart.
    let customerId: string | null = null;
    const { data: knownCustomer } = await admin.from("customers").select("id").eq("seller_id", sellerId).ilike("email", normalizedEmail).limit(1).maybeSingle();
    if (knownCustomer) {
      customerId = knownCustomer.id;
    } else {
      const { data: createdCustomer } = await admin.from("customers").insert({
        seller_id: sellerId,
        first_name: String(customer.firstName).trim(),
        last_name: String(customer.lastName).trim(),
        email: normalizedEmail,
        phone,
        source: "manual",
      }).select("id").single();
      customerId = createdCustomer?.id || null;
    }

    const item = { id: product.id, name: product.name, price, qty, variant: variantLabel, image };
    const finalPaymentStatus = VALID_PAYMENT_STATUSES.includes(paymentStatus) ? paymentStatus : "paid";
    const finalOrderStatus = VALID_ORDER_STATUSES.includes(orderStatus) ? orderStatus : "confirmed";

    const coreRow: any = {
      seller_id: sellerId,
      customer_name: `${customer.firstName} ${customer.lastName}`.trim(),
      customer_email: normalizedEmail,
      customer_phone: phone,
      items: [item],
      total,
      shipping_address: fulfillment === "delivery" ? {
        address: String(address.address).trim(),
        ...(address.apartment && String(address.apartment).trim() ? { apartment: String(address.apartment).trim() } : {}),
        city: String(address.city).trim(),
        province: address.province ? String(address.province).trim() : "",
        postal_code: String(address.postal_code).trim(),
      } : null,
      shipping_cost: shippingCost,
      payment_method: paymentMethod && String(paymentMethod).trim() ? String(paymentMethod).trim() : "manual",
      payment_status: finalPaymentStatus,
      status: finalOrderStatus,
    };
    // Same "try progressively fewer optional columns" defensiveness as
    // place-order/route.ts, for the same reason: this orders table
    // predates this migration history, so its full live column set can't
    // be verified from source alone.
    const tier1 = { subtotal, fulfillment_method: fulfillment };
    const tier2 = {
      customer_id: customerId,
      shipping_option: shippingOption && String(shippingOption).trim() ? String(shippingOption).trim() : "WhatsApp order",
      notes: notes && String(notes).trim() ? String(notes).trim() : null,
    };
    const attempts = [{ ...coreRow, ...tier1, ...tier2 }, { ...coreRow, ...tier1 }, coreRow];

    let inserted: any = null;
    let insErr: any = null;
    for (const row of attempts) {
      const res = await admin.from("orders").insert(row).select("id, order_number, external_id, total, items, customer_name, customer_email, seller_id").single();
      inserted = res.data;
      insErr = res.error;
      if (!insErr) break;
      if (!insErr.message?.includes("schema cache")) break;
    }
    if (insErr || !inserted) {
      console.error("create-manual-order insert failed:", insErr);
      return NextResponse.json({ error: insErr?.message || "Failed to create order" }, { status: 500 });
    }

    if (sendConfirmationEmail && finalPaymentStatus === "paid") {
      await sendOrderConfirmationEmail(admin, inserted, seller).catch((e) => console.error("create-manual-order confirmation email failed:", e));
    }

    return NextResponse.json({ success: true, order: inserted });
  } catch (e: any) {
    console.error("create-manual-order failed:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
