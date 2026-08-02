import { getAdmin } from "./supabase-admin";
import { PRODUCT_BY_GARMENT } from "./unik-catalog";

/* Shared cart-resolution logic for every UNIK Labs checkout path (today:
   the direct Yoco checkout in app/api/unik/checkout/create/route.ts, and
   SETLA's own app/api/setla/checkout/create/route.ts). Extracted verbatim
   from the Yoco route so both paths price, validate and claim cart items
   identically -- a shopper's total must never depend on which payment
   button they clicked. This is a pure refactor of that route: no behavior
   change to the existing Yoco path. */

export const DEFAULT_DELIVERY = { name: "Nationwide Delivery", price: 79 };

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

export type RawCartItem = {
  designId?: string; qty?: number; preview?: string;
  customUpload?: { garment?: string; colour?: string; size?: string; zone?: string; designId?: string; frontImage?: string; backImage?: string; previewFront?: string; previewBack?: string };
};

export type ResolvedLineItem = { productId: string; name: string; price: number; qty: number; designId: string; garment: string; colour: string; size: string; style: string | null; image: string | null };

// The multi-megabyte artwork/mockup uploads for a custom-upload item don't
// need to finish before the payment redirect -- the payment provider only
// needs a price and a display name, never the image. Splitting the fast
// (DB row + validation) part from the slow (Storage upload) part lets the
// slow part run via Next.js's after() once the response has already gone
// out -- see runDeferredUnikUploads below.
export type DeferredUploadJob = {
  designId: string;
  frontPath: string; frontBase64: string; frontExt: string;
  backPath: string | null; backBase64: string | null; backExt: string | null;
  previewFrontDataUrl?: string; previewBackDataUrl?: string;
  zone: string;
};

export type CartResolveResult =
  | {
      ok: true;
      lineItems: ResolvedLineItem[];
      deferredJobs: DeferredUploadJob[];
      subtotal: number;
      discountAmount: number;
      discountRow: { id: string; code: string; partner_id: string | null } | null;
      total: number;
      shippingCost: number;
      shippingLabel: string;
      fulfillmentMethod: "delivery" | "pickup";
    }
  | { ok: false; error: string; status: number };

export async function resolveUnikCart(params: {
  admin: ReturnType<typeof getAdmin>;
  sellerId: string;
  userId: string;
  items: RawCartItem[];
  requestedIsPickup: boolean;
  requestedDeliveryName: string;
  streetAddress: string;
  townCity: string;
  province: string;
  postal: string;
  discountCode: string; // explicit, customer-typed code -- an invalid one is a real error
  referralCode?: string | null; // cookie-derived fallback -- an invalid one fails silently
}): Promise<CartResolveResult> {
  const { admin, sellerId, userId, items, requestedIsPickup, requestedDeliveryName, streetAddress, townCity, province, postal } = params;

  if (!items.length) return { ok: false, error: "Your cart is empty", status: 400 };

  // Delivery method + cost are always resolved from the seller's own
  // checkout settings server-side -- the browser's deliveryMethod only
  // says which one the customer picked (by name), never what it costs.
  const { data: sellerConfigRow } = await admin.from("sellers").select("checkout_config").eq("id", sellerId).single();
  const cc = (sellerConfigRow?.checkout_config || {}) as any;

  let fulfillmentMethod: "delivery" | "pickup" = "delivery";
  let shippingCost = 0;
  let shippingLabel = DEFAULT_DELIVERY.name;

  if (requestedIsPickup) {
    if (!cc.pickup_enabled) return { ok: false, error: "Pickup isn't available for this store", status: 400 };
    fulfillmentMethod = "pickup";
    shippingCost = 0;
    shippingLabel = "Studio Pickup";
  } else {
    if (cc.delivery_enabled === false) return { ok: false, error: "Delivery isn't available for this store", status: 400 };
    if (!streetAddress || !townCity || !province || !postal) return { ok: false, error: "A complete delivery address is required", status: 400 };
    const options = Array.isArray(cc.shipping_options) && cc.shipping_options.length ? cc.shipping_options : [DEFAULT_DELIVERY];
    const matched = options.find((o: any) => String(o.name || "").trim() === requestedDeliveryName) || options[0];
    shippingCost = Number(matched.price) || 0;
    shippingLabel = matched.name || DEFAULT_DELIVERY.name;
  }

  for (const item of items) {
    if (!item.designId && !item.customUpload) return { ok: false, error: "One of the items in your cart is invalid", status: 400 };
  }

  const designIds = [
    ...items.map((i) => i.designId),
    ...items.map((i) => i.customUpload?.designId),
  ].filter((id): id is string => typeof id === "string" && id.length > 0);
  const { data: designs, error: designsErr } = designIds.length
    ? await admin.from("unik_designs").select("id, seller_id, auth_user_id, source, status, garment, colour, size, style, name, preview_url, mockup_url, options").in("id", designIds)
    : { data: [], error: null };
  if (designsErr) console.error("UNIK cart resolve: unik_designs lookup failed:", designsErr);

  const designMap = new Map((designs || []).map((d) => [d.id, d]));
  const { data: products } = await admin.from("products").select("id, name, price, category").eq("seller_id", sellerId).eq("status", "published");
  const productByName = new Map((products || []).map((p) => [p.name, p]));

  type ItemResult = { ok: true; item: ResolvedLineItem; deferred?: DeferredUploadJob } | { ok: false; error: string; status: number };

  // Each cart item is independent of every other one (its own design
  // record, its own uploads), so processing them concurrently instead of
  // one at a time matters just as much for a multi-item cart as
  // parallelizing the uploads within a single item did above. Errors are
  // collected rather than returned early so ordering stays deterministic --
  // the FIRST invalid item (by original cart position) is still what gets
  // reported, matching the previous sequential loop's behaviour exactly.
  const results: ItemResult[] = await Promise.all(items.map(async (item): Promise<ItemResult> => {
    const qty = Math.max(1, Math.min(10, Number(item.qty) || 1));

    if (item.customUpload?.designId) {
      // Fast path: the artwork was already uploaded to Storage when "Add to
      // Cart" was clicked (see /api/unik/custom-upload/save), so this cart
      // item carries a designId instead of raw image bytes -- checkout just
      // claims that design and resolves pricing, the same near-zero-latency
      // shape as an AI Studio item, no upload work of any kind.
      const cu = item.customUpload;
      const design = designMap.get(cu.designId!);
      if (!design) return { ok: false, error: "One of your custom uploads could not be found", status: 404 };
      if (design.seller_id !== sellerId) return { ok: false, error: "One of your custom uploads is not accessible", status: 403 };
      if (design.source !== "custom-upload") return { ok: false, error: "One of your custom uploads has an unrecognised source", status: 400 };
      if (design.auth_user_id && design.auth_user_id !== userId) return { ok: false, error: "One of your custom uploads is not accessible", status: 403 };

      const garment = String(design.garment || "").toLowerCase();
      const colour = String(design.colour || "").toLowerCase();
      const size = String(design.size || cu.size || "").toUpperCase();
      const zone = String((design.options as any)?.zone || cu.zone || "").toLowerCase();
      if (!/^(XS|S|M|L|XL|XXL)$/.test(size)) return { ok: false, error: "One of your custom uploads is missing a size", status: 400 };

      const productName = CUSTOM_PRODUCT_BY_GARMENT_ZONE[`${garment}_${zone}`];
      const product = productName ? productByName.get(productName) : undefined;
      if (!product) return { ok: false, error: "That product is not currently available", status: 400 };

      return {
        ok: true,
        item: { productId: product.id, name: product.name, price: Number(product.price), qty, designId: design.id, garment, colour, size, style: null, image: design.mockup_url || null },
      };
    }

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
        seller_id: sellerId, auth_user_id: userId, source: "custom-upload", status: "generated",
        name: "UNIK Labs Custom Print", garment, colour, size, options: { zone },
      }).select("id").single();
      if (designInsertErr || !design) {
        console.error("UNIK cart resolve: custom-upload design insert failed:", designInsertErr);
        return { ok: false, error: "Could not save your custom upload", status: 500 };
      }

      const designId = design.id;
      const frontPath = `${userId}/${designId}/front.${front.ext}`;
      const backPath = back ? `${userId}/${designId}/back.${back.ext}` : null;

      return {
        ok: true,
        item: { productId: product.id, name: product.name, price: Number(product.price), qty, designId, garment, colour, size, style: null, image: null },
        deferred: {
          designId, frontPath, frontBase64: front.base64, frontExt: front.ext,
          backPath, backBase64: back ? back.base64 : null, backExt: back ? back.ext : null,
          previewFrontDataUrl: cu.previewFront || item.preview, previewBackDataUrl: cu.previewBack,
          zone,
        },
      };
    }

    const design = designMap.get(item.designId!);
    if (!design) return { ok: false, error: "One of your designs could not be found", status: 404 };
    if (design.seller_id !== sellerId || design.auth_user_id !== userId) return { ok: false, error: "One of your designs is not accessible", status: 403 };
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

  const firstError = results.find((r): r is Extract<ItemResult, { ok: false }> => !r.ok);
  if (firstError) return { ok: false, error: firstError.error, status: firstError.status };
  const okResults = results as Extract<ItemResult, { ok: true }>[];
  const lineItems: ResolvedLineItem[] = okResults.map((r) => r.item);
  const deferredJobs: DeferredUploadJob[] = okResults.map((r) => r.deferred).filter((d): d is DeferredUploadJob => !!d);

  const subtotal = lineItems.reduce((sum, i) => sum + i.price * i.qty, 0);

  // Discount code: re-validated from scratch here (never trust the client's
  // preview from /api/unik/checkout/discount) -- min_order, expiry and
  // max_uses can all have changed since "Apply" was clicked. UNIK partner
  // codes are always applies_to:'cart', so that's the only scope handled.
  //
  // If nothing was typed, fall back to the caller-resolved referral code
  // (see capturePartnerRef() in store.js / UNIK_PARTNER.getRefCode()) --
  // the same belt-and-braces shape as the platform affiliate program: a
  // shopper's request is re-derived here independently rather than
  // trusted, in case the client-side auto-apply never ran.
  let effectiveCode = params.discountCode;
  const isExplicitCode = !!params.discountCode;
  if (!effectiveCode && params.referralCode) effectiveCode = params.referralCode;

  let discountAmount = 0;
  let discountRow: { id: string; code: string; partner_id: string | null } | null = null;
  if (effectiveCode) {
    const { data: dc } = await admin
      .from("discount_codes")
      .select("id, code, type, value, applies_to, active, expires_at, max_uses, used_count, min_order, partner_id")
      .eq("seller_id", sellerId)
      .eq("code", effectiveCode)
      .maybeSingle();

    // A manually typed code that fails validation is real, useful feedback
    // (return the error, same status codes as before this fallback existed).
    // A referral-cookie-derived one fails silently instead -- the shopper
    // never asked for it, so a stale/suspended partner code shouldn't be
    // able to block an otherwise normal checkout.
    let invalid: { error: string; status: number } | null = null;
    if (!dc || !dc.active) invalid = { error: "Invalid discount code", status: 400 };
    else if (dc.expires_at && new Date(dc.expires_at) < new Date()) invalid = { error: "This code has expired", status: 400 };
    else if (dc.max_uses && dc.used_count >= dc.max_uses) invalid = { error: "This code has reached its usage limit", status: 409 };
    else if (dc.min_order > 0 && subtotal < dc.min_order) invalid = { error: `Minimum order of R${dc.min_order} required`, status: 400 };
    else if (dc.applies_to !== "cart") invalid = { error: "This code can't be used here", status: 400 };

    if (invalid) {
      if (isExplicitCode) return { ok: false, error: invalid.error, status: invalid.status };
    } else if (dc) {
      let claimed = true;
      if (dc.max_uses) {
        const { data: updated, error: upErr } = await admin
          .from("discount_codes")
          .update({ used_count: (dc.used_count || 0) + 1 })
          .eq("id", dc.id)
          .eq("used_count", dc.used_count || 0)
          .lt("used_count", dc.max_uses)
          .select("id");
        claimed = !upErr && !!updated && updated.length > 0;
        if (!claimed && isExplicitCode) return { ok: false, error: "This code has reached its usage limit", status: 409 };
      } else {
        await admin.from("discount_codes").update({ used_count: (dc.used_count || 0) + 1 }).eq("id", dc.id);
      }
      if (claimed) {
        discountAmount = dc.type === "percentage" ? subtotal * (dc.value / 100) : Math.min(dc.value, subtotal);
        discountRow = { id: dc.id, code: dc.code, partner_id: dc.partner_id };
      }
    }
  }

  const total = Math.max(0, subtotal - discountAmount + shippingCost);

  return { ok: true, lineItems, deferredJobs, subtotal, discountAmount, discountRow, total, shippingCost, shippingLabel, fulfillmentMethod };
}

/* Runs the slow artwork/mockup Storage uploads for any custom-upload cart
   items AFTER the response (and payment redirect) has already gone back to
   the browser -- see the DeferredUploadJob comment above. Call via
   Next.js's after(() => runDeferredUnikUploads(...)) from the route. A
   failed upload degrades the same way it always did: the design just keeps
   a null image, it can no longer block the redirect. */
export async function runDeferredUnikUploads(admin: ReturnType<typeof getAdmin>, sellerId: string, orderId: string, deferredJobs: DeferredUploadJob[]): Promise<void> {
  if (!deferredJobs.length) return;

  const uploadResults = await Promise.all(deferredJobs.map(async (job) => {
    try {
      async function uploadPreview(dataUrl: string | undefined, suffix: string): Promise<string | null> {
        const data = decodeDataUrl(dataUrl);
        if (!data) return null;
        const path = `${sellerId}/unik-previews/${job.designId}-${suffix}.${data.ext}`;
        const { error } = await admin.storage.from("store-assets").upload(path, Buffer.from(data.base64, "base64"), { contentType: `image/${data.ext}`, upsert: true });
        if (error) { console.error(`UNIK checkout (deferred): ${suffix} preview upload failed:`, error); return null; }
        return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
      }
      const [frontUploadResult, backUploadResult, mockupFrontUrl, mockupBackUrl] = await Promise.all([
        admin.storage.from("unik-private-designs").upload(job.frontPath, Buffer.from(job.frontBase64, "base64"), { contentType: `image/${job.frontExt}`, upsert: true }),
        job.backPath ? admin.storage.from("unik-private-designs").upload(job.backPath, Buffer.from(job.backBase64!, "base64"), { contentType: `image/${job.backExt}`, upsert: true }) : Promise.resolve(null),
        uploadPreview(job.previewFrontDataUrl, "front"),
        job.zone === "both" ? uploadPreview(job.previewBackDataUrl, "back") : Promise.resolve(null),
      ]);
      if (frontUploadResult?.error) console.error("UNIK checkout (deferred): front artwork upload failed:", frontUploadResult.error);
      if (backUploadResult?.error) console.error("UNIK checkout (deferred): back artwork upload failed:", backUploadResult.error);

      await admin.from("unik_designs").update({
        private_artwork_path: job.frontPath,
        options: { zone: job.zone, back_artwork_path: job.backPath, mockup_back_url: mockupBackUrl },
        mockup_url: mockupFrontUrl,
      }).eq("id", job.designId);

      return { designId: job.designId, mockupFrontUrl };
    } catch (err) {
      console.error("UNIK checkout (deferred upload) failed for design", job.designId, err);
      return null;
    }
  }));

  // A single read-modify-write of orders.items at the end, covering every
  // design in this order at once -- patching it once per job instead would
  // race (each read-modify-write could clobber another job's already-
  // written image).
  const resolved = uploadResults.filter((r): r is { designId: string; mockupFrontUrl: string | null } => !!r && !!r.mockupFrontUrl);
  if (resolved.length) {
    const { data: orderRow } = await admin.from("orders").select("items").eq("id", orderId).single();
    if (orderRow?.items) {
      const byDesign = new Map(resolved.map((r) => [r.designId, r.mockupFrontUrl]));
      const patched = (orderRow.items as any[]).map((it) =>
        byDesign.has(it?.customization?.designId) ? { ...it, image: byDesign.get(it.customization.designId) } : it
      );
      await admin.from("orders").update({ items: patched }).eq("id", orderId);
    }
  }
}
