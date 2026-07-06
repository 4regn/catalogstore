import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";

/* Server-side order placement.
   The previous flow inserted directly from the browser using client-supplied
   prices, which let anyone hit checkout with cart [{ price: 1 }] and check out
   for R1. The discount counter was also a read-modify-write race.

   This endpoint:
   - re-fetches every product price from the DB (ignores client `price`)
   - re-validates the discount server-side (expires_at, max_uses, eligible items)
   - atomically increments discount used_count via `.eq("used_count", current)`
     so two concurrent checkouts can't both consume the last slot
   - computes shipping + total server-side
   - returns { orderId, orderNumber, total } so the client only knows what the
     server says it owes
*/

type ItemIn = { id?: string; name?: string; qty: number; variant?: string; image?: string; selectedVariants?: Record<string, string> };
type ApplyTo = "cart" | "product" | "collection" | "shipping";
type ProductVariant = { name: string; options: string[]; priceDelta?: Record<string, number> };

const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

/* Server-computed variant surcharge — never trust a client-sent price.
   Sums the priceDelta for each selected option across the product's
   variant groups; unknown groups/options or missing deltas contribute 0. */
function variantPriceDelta(productVariants: unknown, selectedVariants: Record<string, string> | undefined): number {
  if (!selectedVariants || !Array.isArray(productVariants)) return 0;
  let delta = 0;
  for (const group of productVariants as ProductVariant[]) {
    const chosen = selectedVariants[group?.name];
    if (chosen && group?.priceDelta && typeof group.priceDelta[chosen] === "number") {
      delta += group.priceDelta[chosen];
    }
  }
  return delta;
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  const rl = rateLimit("place-order:" + ip, 20, 60);
  if (!rl.allowed) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const {
    slug,
    items,
    customer,
    address,
    fulfillment,
    shippingOptionIndex,
    paymentMethod,
    discountCode,
  } = body || {};

  if (typeof slug !== "string" || !Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "Missing slug or items" }, { status: 400 });
  }
  if (!customer || typeof customer.email !== "string" || typeof customer.firstName !== "string" || typeof customer.lastName !== "string") {
    return NextResponse.json({ error: "Missing customer details" }, { status: 400 });
  }
  if (fulfillment !== "delivery" && fulfillment !== "pickup") {
    return NextResponse.json({ error: "Invalid fulfillment method" }, { status: 400 });
  }
  if (fulfillment === "delivery" && (!address || typeof address.address !== "string" || typeof address.city !== "string" || typeof address.postal_code !== "string")) {
    return NextResponse.json({ error: "Delivery address incomplete" }, { status: 400 });
  }

  const { data: seller, error: sellerErr } = await getAdmin()
    .from("sellers")
    .select("id, subscription_status, trial_ends_at, checkout_config")
    .eq("subdomain", slug)
    .single();
  if (sellerErr || !seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  /* Subscription gate — refuses to accept money if the seller can't process it */
  const active = seller.subscription_status === "active"
    || (seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (!active) return NextResponse.json({ error: "This store is not currently accepting orders." }, { status: 409 });

  const cc = (seller.checkout_config || {}) as any;

  /* Resolve product prices server-side. Prefer id; fall back to seller-scoped
     name lookup for legacy carts that don't carry an id. */
  const itemIds = (items as ItemIn[]).map((i) => i.id).filter(isUuid) as string[];
  const itemNames = (items as ItemIn[]).filter((i) => !isUuid(i.id) && typeof i.name === "string").map((i) => i.name!);

  const [byId, byName] = await Promise.all([
    itemIds.length
      ? getAdmin().from("products").select("id, name, price, in_stock, status, category, variants").in("id", itemIds).eq("seller_id", seller.id)
      : Promise.resolve({ data: [] as any[] }),
    itemNames.length
      ? getAdmin().from("products").select("id, name, price, in_stock, status, category, variants").in("name", itemNames).eq("seller_id", seller.id)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const byIdMap = new Map<string, any>((byId.data || []).map((p) => [p.id, p]));
  const byNameMap = new Map<string, any>((byName.data || []).map((p) => [p.name.toLowerCase(), p]));

  /* Build the line items with server-truth prices */
  const lineItems: { id: string; name: string; price: number; qty: number; variant?: string; image?: string }[] = [];
  for (const raw of items as ItemIn[]) {
    const qty = Math.floor(Number(raw.qty) || 0);
    if (qty < 1 || qty > 999) {
      return NextResponse.json({ error: "Invalid quantity" }, { status: 400 });
    }
    const product =
      (isUuid(raw.id) ? byIdMap.get(raw.id!) : undefined) ??
      (raw.name ? byNameMap.get(raw.name.toLowerCase()) : undefined);
    if (!product) {
      return NextResponse.json({ error: `Product not found: ${raw.name || raw.id}` }, { status: 400 });
    }
    if (product.status && product.status !== "published") {
      return NextResponse.json({ error: `Product not available: ${product.name}` }, { status: 409 });
    }
    if (product.in_stock === false) {
      return NextResponse.json({ error: `Out of stock: ${product.name}` }, { status: 409 });
    }
    const basePrice = Number(product.price) || 0;
    const delta = variantPriceDelta(product.variants, raw.selectedVariants);
    lineItems.push({
      id: product.id,
      name: product.name,
      price: Math.max(0, basePrice + delta),
      qty,
      variant: typeof raw.variant === "string" ? raw.variant.slice(0, 200) : "",
      image: typeof raw.image === "string" ? raw.image.slice(0, 500) : "",
    });
  }

  const subtotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);

  /* Shipping — server picks the price from checkout_config */
  let shippingCost = 0;
  let shippingLabel: string = fulfillment === "pickup" ? "Pickup" : "";
  if (fulfillment === "delivery") {
    const opts: { name: string; price: number }[] = Array.isArray(cc.shipping_options) ? cc.shipping_options : [];
    const idx = Number(shippingOptionIndex);
    if (!opts.length || !Number.isFinite(idx) || idx < 0 || idx >= opts.length) {
      return NextResponse.json({ error: "Invalid shipping option" }, { status: 400 });
    }
    shippingCost = Number(opts[idx].price) || 0;
    shippingLabel = opts[idx].name || "Delivery";
  }

  /* Discount — re-validate everything server-side, then atomically reserve a slot */
  let discountAmount = 0;
  let discountRow: any = null;
  if (typeof discountCode === "string" && discountCode.trim()) {
    const code = discountCode.trim().toUpperCase();
    const { data: dc } = await getAdmin()
      .from("discount_codes")
      .select("*")
      .eq("seller_id", seller.id)
      .eq("code", code)
      .eq("active", true)
      .single();
    if (!dc) return NextResponse.json({ error: "Invalid discount code" }, { status: 400 });
    if (dc.expires_at && new Date(dc.expires_at) < new Date()) return NextResponse.json({ error: "Discount code expired" }, { status: 400 });
    if (dc.max_uses && dc.used_count >= dc.max_uses) return NextResponse.json({ error: "Discount code has reached its usage limit" }, { status: 409 });
    if (dc.min_order && subtotal < dc.min_order) return NextResponse.json({ error: `Minimum order of R${dc.min_order} required for this code` }, { status: 400 });

    const appliesTo: ApplyTo = (dc.applies_to || "cart") as ApplyTo;
    if (appliesTo === "cart") {
      discountAmount = dc.type === "percentage" ? subtotal * (dc.value / 100) : Math.min(dc.value, subtotal);
    } else if (appliesTo === "shipping") {
      if (shippingCost === 0) return NextResponse.json({ error: "No shipping fee to discount" }, { status: 400 });
      discountAmount = dc.type === "percentage" ? shippingCost * (dc.value / 100) : Math.min(dc.value, shippingCost);
    } else if (appliesTo === "product") {
      const eligibleIds = new Set<string>(Array.isArray(dc.product_ids) ? dc.product_ids : []);
      const eligibleTotal = lineItems.filter((i) => eligibleIds.has(i.id)).reduce((s, i) => s + i.price * i.qty, 0);
      if (eligibleTotal === 0) return NextResponse.json({ error: "No eligible products in your cart" }, { status: 400 });
      discountAmount = dc.type === "percentage" ? eligibleTotal * (dc.value / 100) : Math.min(dc.value, eligibleTotal);
    } else if (appliesTo === "collection") {
      const eligibleCats = new Set<string>(Array.isArray(dc.collection_names) ? dc.collection_names : []);
      const eligibleTotal = lineItems.filter((i) => {
        const prod = byIdMap.get(i.id) || byNameMap.get(i.name.toLowerCase());
        return prod && eligibleCats.has(prod.category);
      }).reduce((s, i) => s + i.price * i.qty, 0);
      if (eligibleTotal === 0) return NextResponse.json({ error: "No products from eligible collections in your cart" }, { status: 400 });
      discountAmount = dc.type === "percentage" ? eligibleTotal * (dc.value / 100) : Math.min(dc.value, eligibleTotal);
    }

    /* Atomic reservation: only consume a slot if used_count hasn't moved since
       we read it. If two checkouts read used_count=4 with max_uses=5, only one
       update succeeds; the other gets 0 rows affected and is rejected. */
    if (dc.max_uses) {
      const { data: updated, error: upErr } = await getAdmin()
        .from("discount_codes")
        .update({ used_count: (dc.used_count || 0) + 1 })
        .eq("id", dc.id)
        .eq("used_count", dc.used_count || 0)
        .lt("used_count", dc.max_uses)
        .select("id");
      if (upErr || !updated || updated.length === 0) {
        return NextResponse.json({ error: "Discount code has reached its usage limit" }, { status: 409 });
      }
    } else {
      /* No max_uses cap — still bump the counter for analytics, but don't fail */
      await getAdmin().from("discount_codes").update({ used_count: (dc.used_count || 0) + 1 }).eq("id", dc.id);
    }
    discountRow = dc;
  }

  const total = Math.max(0, subtotal - discountAmount + shippingCost);

  /* Build the order row in layers: core columns that every orders table has,
     then optional columns that may not exist yet (added later via migrations).
     If the full insert fails with a schema-cache error we retry with fewer
     columns, stripping one tier at a time until it works. */
  const coreRow: any = {
    seller_id: seller.id,
    customer_name: `${customer.firstName} ${customer.lastName}`.trim(),
    customer_email: customer.email,
    customer_phone: customer.phone || null,
    items: lineItems.map(({ id, name, price, qty, variant, image }) => ({ id, name, price, qty, variant, image })),
    total,
    shipping_address: fulfillment === "delivery" ? address : null,
    shipping_cost: shippingCost,
    payment_method: paymentMethod || "eft",
    payment_status: paymentMethod === "eft" ? "awaiting_payment" : "pending",
    status: "pending",
  };

  const tier1 = { subtotal, fulfillment_method: fulfillment };
  const tier2 = { discount_code: discountRow?.code || null, discount_amount: discountAmount, shipping_option: shippingLabel };

  const attempts = [
    { ...coreRow, ...tier1, ...tier2 },
    { ...coreRow, ...tier1 },
    coreRow,
  ];

  let inserted: any = null;
  let insErr: any = null;
  for (const row of attempts) {
    const res = await getAdmin().from("orders").insert(row).select("id, order_number, total").single();
    inserted = res.data;
    insErr = res.error;
    if (!insErr) break;
    if (!insErr.message?.includes("schema cache")) break;
  }

  if (insErr || !inserted) {
    if (discountRow?.max_uses) {
      await getAdmin()
        .from("discount_codes")
        .update({ used_count: (discountRow.used_count || 0) })
        .eq("id", discountRow.id);
    }
    return NextResponse.json({ error: insErr?.message || "Could not place order" }, { status: 500 });
  }

  return NextResponse.json({
    orderId: inserted.id,
    orderNumber: inserted.order_number || inserted.id.substring(0, 8),
    total: inserted.total,
  });
}
