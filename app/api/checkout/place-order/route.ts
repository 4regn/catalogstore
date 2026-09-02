import { NextRequest, NextResponse } from "next/server";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { getAdmin } from "../../../../lib/supabase-admin";
import { fetchActiveAutomaticBxgyDiscounts, computeAutomaticBxgyDiscount } from "../../../../lib/automatic-discounts";
import { buildCheckoutShippingOptions, calculateFourRegnDeliveryEstimate, isPremiumShippingOption, type CheckoutShippingOption } from "../../../../lib/four-regn-shipping";
import { variantPriceDelta } from "../../../../lib/product-pricing";
import { FLASH_CAP_GIFT_TAG, FLASH_CAP_THRESHOLD, isFlashCapActive, isFlashCapEligibleProduct } from "../../../../lib/four-regn-flash-cap";

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

type ItemIn = { id?: string; name?: string; qty: number; variant?: string; image?: string; selectedVariants?: Record<string, string>; giftTag?: string; customArtwork?: { frontUrl?: string; backUrl?: string; previewFrontUrl?: string; previewBackUrl?: string } };
// Custom Upload Studio products -- see CUSTOM_PRINT_FRONT_TAG in
// FourRegnStore.tsx. Enforced here (not just in the storefront UI) so an
// order can never be placed for one of these without the actual design
// attached -- the seller has nothing to print otherwise.
const CUSTOM_PRINT_FRONT_TAG = "custom-print-front";
const CUSTOM_PRINT_BOTH_TAG = "custom-print-both";
type ApplyTo = "cart" | "product" | "collection" | "shipping";
const isUuid = (s: unknown): s is string =>
  typeof s === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);

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
    .select("id, subscription_status, trial_ends_at, checkout_config, store_config")
    .eq("subdomain", slug)
    .single();
  if (sellerErr || !seller) return NextResponse.json({ error: "Store not found" }, { status: 404 });

  /* Subscription gate — refuses to accept money if the seller can't process it */
  const active = seller.subscription_status === "active"
    || seller.subscription_status === "free"
    || (seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (!active) return NextResponse.json({ error: "This store is not currently accepting orders." }, { status: 409 });

  const cc = (seller.checkout_config || {}) as any;
  const normalizedCustomerEmail = customer.email.trim().toLowerCase();
  // Link every new order to the imported/checkout customer identity so a
  // later account activation can immediately see all matching purchases.
  let customerId: string | null = null;
  const { data: knownCustomer } = await getAdmin().from("customers").select("id").eq("seller_id", seller.id).ilike("email", normalizedCustomerEmail).limit(1).maybeSingle();
  if (knownCustomer) {
    customerId = knownCustomer.id;
  } else {
    const { data: createdCustomer } = await getAdmin().from("customers").insert({
      seller_id: seller.id,
      first_name: customer.firstName.trim(),
      last_name: customer.lastName.trim(),
      email: normalizedCustomerEmail,
      phone: customer.phone || null,
      source: "checkout",
    }).select("id").single();
    customerId = createdCustomer?.id || null;
  }

  /* Resolve product prices server-side. Prefer id; fall back to seller-scoped
     name lookup for legacy carts that don't carry an id. */
  const itemIds = (items as ItemIn[]).map((i) => i.id).filter(isUuid) as string[];
  const itemNames = (items as ItemIn[]).filter((i) => !isUuid(i.id) && typeof i.name === "string").map((i) => i.name!);

  const [byId, byName] = await Promise.all([
    itemIds.length
      ? getAdmin().from("products").select("id, name, price, in_stock, status, category, variants, tags").in("id", itemIds).eq("seller_id", seller.id)
      : Promise.resolve({ data: [] as any[] }),
    itemNames.length
      ? getAdmin().from("products").select("id, name, price, in_stock, status, category, variants, tags").in("name", itemNames).eq("seller_id", seller.id)
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const byIdMap = new Map<string, any>((byId.data || []).map((p) => [p.id, p]));
  const byNameMap = new Map<string, any>((byName.data || []).map((p) => [p.name.toLowerCase(), p]));

  /* Build the line items with server-truth prices */
  const lineItems: { id: string; name: string; price: number; qty: number; variant?: string; image?: string; category?: string | null; giftTag?: string; customArtwork?: { frontUrl: string; backUrl?: string; previewFrontUrl?: string; previewBackUrl?: string } }[] = [];
  // A product tagged "import"/"imports" (singular or plural, case-
  // insensitive) restricts delivery to whichever shipping option(s) the
  // seller marked is_premium -- see the shipping-option validation below.
  // Kept in sync with the identical check in FourRegnStore.tsx/
  // CheckoutPageClient.tsx; this is the one that actually can't be
  // bypassed by a tampered request (those two only control what the UI
  // shows/preselects).
  const IMPORT_TAG_RE = /^imports?$/i;
  let hasImportProduct = false;
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
    if (Array.isArray(product.tags) && product.tags.some((t: string) => IMPORT_TAG_RE.test((t || "").trim()))) {
      hasImportProduct = true;
    }
    const productTags: string[] = Array.isArray(product.tags) ? product.tags : [];
    let customArtwork: { frontUrl: string; backUrl?: string; previewFrontUrl?: string; previewBackUrl?: string } | undefined;
    if (productTags.includes(CUSTOM_PRINT_FRONT_TAG) || productTags.includes(CUSTOM_PRINT_BOTH_TAG)) {
      const frontUrl = typeof raw.customArtwork?.frontUrl === "string" ? raw.customArtwork.frontUrl.trim() : "";
      const backUrl = typeof raw.customArtwork?.backUrl === "string" ? raw.customArtwork.backUrl.trim() : "";
      const previewFrontUrl = typeof raw.customArtwork?.previewFrontUrl === "string" ? raw.customArtwork.previewFrontUrl.trim() : "";
      const previewBackUrl = typeof raw.customArtwork?.previewBackUrl === "string" ? raw.customArtwork.previewBackUrl.trim() : "";
      const needsBack = productTags.includes(CUSTOM_PRINT_BOTH_TAG);
      if (!frontUrl || (needsBack && !backUrl)) {
        return NextResponse.json({ error: `Please upload your design before ordering: ${product.name}` }, { status: 400 });
      }
      customArtwork = { frontUrl, ...(backUrl ? { backUrl } : {}), ...(previewFrontUrl ? { previewFrontUrl } : {}), ...(previewBackUrl ? { previewBackUrl } : {}) };
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
      category: product.category ?? null,
      giftTag: typeof raw.giftTag === "string" ? raw.giftTag : undefined,
      customArtwork,
    });
  }

  if (hasImportProduct && fulfillment !== "delivery") {
    return NextResponse.json({ error: "Premium products require premium product shipment" }, { status: 400 });
  }

  /* Flash Weekend free trucker cap -- server is the only source of truth
     for this discount. A client can send any giftTag it likes; it only
     actually becomes free here, and only once, after re-checking every
     condition against server-computed data: sale still running, the SKU
     is really in the Trucker Caps collection, exactly one unit claimed,
     and the REST of the cart (excluding the gift line itself) genuinely
     clears R499. Anything that fails validation is just charged at its
     real price -- never removed from the order, never blocking checkout,
     matching the same "don't silently drop the item" rule the storefront
     UI follows. Only the first gift-tagged line can ever qualify, so a
     tampered request tagging two lines can't get two free caps either. */
  const nonGiftSubtotal = lineItems.filter((i) => !i.giftTag).reduce((s, i) => s + i.price * i.qty, 0);
  let flashCapGiftGranted = false;
  for (const li of lineItems) {
    if (li.giftTag !== FLASH_CAP_GIFT_TAG) continue;
    const eligible = !flashCapGiftGranted
      && isFlashCapActive()
      && li.qty === 1
      && isFlashCapEligibleProduct({ category: li.category })
      && nonGiftSubtotal >= FLASH_CAP_THRESHOLD;
    if (eligible) {
      li.price = 0;
      flashCapGiftGranted = true;
    } else {
      // Not a legitimate free claim -- charge full price, and don't tag it
      // as a gift in the stored order (it isn't one).
      delete li.giftTag;
    }
  }

  const subtotal = lineItems.reduce((s, i) => s + i.price * i.qty, 0);

  /* Automatic Buy X Get Y discounts -- applies the moment enough
     qualifying items are in the cart, no code needed, mirroring exactly
     how these worked as DiscountAutomaticBxgy on Shopify (see
     lib/automatic-discounts.ts and scripts/inspect-4regn-bxgy-discounts.ts).
     Combines with a manual discount_codes code below rather than
     replacing it -- both reduce the same subtotal independently, matching
     the "Combines with Order/Product Discounts" flags Shopify's own
     export showed as true for these. */
  const bxgyRules = await fetchActiveAutomaticBxgyDiscounts(getAdmin(), seller.id);
  const baseAutomaticDiscount = bxgyRules.length ? computeAutomaticBxgyDiscount(bxgyRules, lineItems) : { totalDiscount: 0, applied: [] };
  const automaticDiscount = { ...baseAutomaticDiscount, applied: [...baseAutomaticDiscount.applied] };

  // Flash Weekend: one customer-selected Trucker Cap is free when the
  // *other* merchandise in their cart totals at least R499. The cap itself
  // never counts toward the threshold, and the promotion is deliberately
  // one unit only even in a large cart. A completed checkout records the
  // campaign title, which makes the email-level one-per-customer guard
  // enforceable without relying on browser storage.
  const flashEndsAt = new Date("2026-08-31T21:59:00.000Z"); // 31 Aug, 23:59 SAST
  const flashEnabled = slug === "4regn" && (seller.store_config as any)?.show_flash_weekend_campaign === true && new Date() <= flashEndsAt;
  if (flashEnabled) {
    const isTruckerCap = (item: typeof lineItems[number]) => (item.category || "").split(",").map((value) => value.trim().toLowerCase()).includes("trucker caps & beanies");
    const capLine = lineItems.find(isTruckerCap);
    const nonCapSubtotal = lineItems.filter((item) => !isTruckerCap(item)).reduce((sum, item) => sum + item.price * item.qty, 0);
    if (capLine && nonCapSubtotal >= 499) {
      const { data: previousFlashOrder } = await getAdmin().from("orders")
        .select("id").eq("seller_id", seller.id).eq("customer_email", normalizedCustomerEmail)
        .eq("automatic_discount_title", "FLASH WEEKEND — Free Trucker Cap").limit(1).maybeSingle();
      if (!previousFlashOrder) {
        automaticDiscount.totalDiscount = Math.round((automaticDiscount.totalDiscount + capLine.price) * 100) / 100;
        automaticDiscount.applied.push({ title: "FLASH WEEKEND — Free Trucker Cap", amount: capLine.price });
      }
    }
  }

  const payableMerchandiseSubtotal = Math.max(0, subtotal - automaticDiscount.totalDiscount);

  /* Shipping — server picks the price from checkout_config. Free-delivery
     qualification uses the merchandise total after automatic promotions,
     exactly like the cart booster, never the compare-at/pre-promo amount. */
  let shippingCost = 0;
  let shippingLabel: string = fulfillment === "pickup" ? "Pickup" : "";
  if (fulfillment === "delivery") {
    const opts: CheckoutShippingOption[] = buildCheckoutShippingOptions(cc.shipping_options, { subdomain: slug, template: undefined, subtotal: payableMerchandiseSubtotal, hasImportProduct, delivery_method_order: cc.delivery_method_order });
    const idx = Number(shippingOptionIndex);
    if (!opts.length || !Number.isFinite(idx) || idx < 0 || idx >= opts.length) {
      return NextResponse.json({ error: "Invalid shipping option" }, { status: 400 });
    }
    // Re-check the forced premium rule server-side so a modified request
    // cannot submit a faster method hidden by the checkout UI.
    const explicitPremiumIdx = opts.findIndex(isPremiumShippingOption);
    const effectivePremiumIdx = explicitPremiumIdx !== -1 ? explicitPremiumIdx : (opts.length ? 0 : -1);
    const selectedIsExplicitlyPremium = isPremiumShippingOption(opts[idx]);
    if ((hasImportProduct && idx !== effectivePremiumIdx) || (!hasImportProduct && selectedIsExplicitlyPremium)) {
      return NextResponse.json({ error: "Invalid shipping option for this cart" }, { status: 400 });
    }
    shippingCost = Number(opts[idx].price) || 0;
    shippingLabel = hasImportProduct ? "PREMIUM PRODUCT SHIPMENT" : (opts[idx].name || "Delivery");
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

  const total = Math.max(0, subtotal - discountAmount - automaticDiscount.totalDiscount + shippingCost);

  /* Build the order row in layers: core columns that every orders table has,
     then optional columns that may not exist yet (added later via migrations).
     If the full insert fails with a schema-cache error we retry with fewer
     columns, stripping one tier at a time until it works. */
  const coreRow: any = {
    seller_id: seller.id,
    customer_name: `${customer.firstName} ${customer.lastName}`.trim(),
    customer_email: normalizedCustomerEmail,
    customer_phone: customer.phone || null,
    items: lineItems.map(({ id, name, price, qty, variant, image, giftTag, customArtwork }) => ({ id, name, price, qty, variant, image, ...(giftTag ? { giftTag } : {}), ...(customArtwork ? { customArtwork } : {}) })),
    total,
    shipping_address: fulfillment === "delivery" ? address : null,
    shipping_cost: shippingCost,
    payment_method: paymentMethod || "eft",
    payment_status: paymentMethod === "eft" ? "awaiting_payment" : "pending",
    status: "pending",
  };

  const tier1 = { subtotal, fulfillment_method: fulfillment };
  const tier2 = {
    customer_id: customerId,
    discount_code: discountRow?.code || null,
    discount_amount: discountAmount,
    shipping_option: shippingLabel,
    automatic_discount_amount: automaticDiscount.totalDiscount,
    automatic_discount_title: automaticDiscount.applied.map((a) => a.title).join(", ") || null,
  };
  // Only the three 4REGN local delivery services receive a calculated window.
  // Imported/premium and pickup orders intentionally stay blank until an admin
  // supplies an estimate. The dashboard may always override this later.
  const deliveryEstimate = fulfillment === "delivery" ? calculateFourRegnDeliveryEstimate(shippingLabel) : null;
  const tier3 = deliveryEstimate ? {
    estimated_delivery_from_at: deliveryEstimate.fromAt,
    estimated_delivery_at: deliveryEstimate.toAt,
    estimated_delivery_manual_override: false,
  } : {};

  const attempts = [
    { ...coreRow, ...tier1, ...tier2, ...tier3 },
    { ...coreRow, ...tier1, ...tier2 },
    { ...coreRow, ...tier1 },
    coreRow,
  ];

  let inserted: any = null;
  let insErr: any = null;
  for (const row of attempts) {
    const res = await getAdmin().from("orders").insert(row).select("id, order_number, external_id, total").single();
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
    orderNumber: inserted.external_id || inserted.order_number || inserted.id.substring(0, 8),
    total: inserted.total,
    automaticDiscount: automaticDiscount.totalDiscount > 0 ? automaticDiscount : null,
  });
}
