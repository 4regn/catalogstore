"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../../lib/supabase";
import { useParams } from "next/navigation";
import { usesCleanStorePaths } from "../../../../lib/store-url";
import { getFontPair } from "../../../../lib/font-pairs";
import { effectiveStoreConfig } from "../../../../lib/template-config";
import { useLiveVisitorPing } from "../../../../lib/use-live-visitor-ping";

interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string;
  primary_color: string; logo_url: string; template: string;
  subscription_status?: string | null;
  trial_ends_at?: string | null;
  store_config?: any;
  template_configs?: Record<string, any>;
  checkout_config: {
    eft_enabled: boolean; eft_bank_name: string; eft_account_number: string; eft_account_name: string;
    eft_branch_code: string; eft_account_type: string; eft_instructions: string;
    payfast_enabled: boolean;
    // Card payments via Yoco -- unlike payfast_enabled, this is never a
    // self-serve dashboard toggle (see /api/checkout/yoco-redirect's own
    // comment for why: the underlying Yoco account is shared/global, not
    // per-seller, so it's only ever set directly for a seller confirmed to
    // actually share that account).
    yoco_enabled?: boolean;
    // Same non-self-serve reasoning as yoco_enabled -- SETLA is one shared
    // credit facility across every participating seller (confirmed by the
    // seller directly), not a per-seller account. See
    // /api/checkout/setla-create's own comment.
    setla_enabled?: boolean;
    delivery_enabled: boolean; pickup_enabled: boolean; pickup_address: string; pickup_instructions: string;
    // is_premium: only offered when the cart has an import-tagged product,
    // and hidden from every other cart -- see hasImportTag's own comment
    // below for the full behavior.
    shipping_options: { name: string; price: number; estimate?: string; is_premium?: boolean }[];
  };
}

interface CartItem { id?: string; name: string; price: number; qty: number; variant: string; image: string; selectedVariants?: Record<string, string>; tags?: string[]; }

// Same tag convention as FourRegnStore.tsx's own hasImportTag (kept in
// sync -- both sides need to agree on which cart triggers this). A product
// tagged "import"/"imports" restricts the shipping-method list to ONLY
// options the seller marked is_premium, and the reverse -- a premium
// option is hidden for any cart with no import-tagged product.
const IMPORT_TAG_RE = /^imports?$/i;
const hasImportTag = (tags?: string[] | null) => (tags || []).some((t) => IMPORT_TAG_RE.test((t || "").trim()));

const PROVINCES = ["Eastern Cape", "Free State", "Gauteng", "KwaZulu-Natal", "Limpopo", "Mpumalanga", "North West", "Northern Cape", "Western Cape"];

// Pure re-implementation of lib/setla-instalments.ts's buildInstalmentSchedule/
// minLaybuyDeposit -- that module also imports lib/email.ts (server-only,
// real API-key env vars), so it can't be imported directly into this client
// component; duplicated here instead, same convention as hasImportTag above.
// MUST stay in exact sync with that file's own math (cent-splitting,
// 14-day interval, 30%-ceiling rounding) -- this is a live preview shown
// to the customer before they've even reached the SETLA page, so a
// mismatch here would show them a number the real checkout doesn't honor.
function setlaPayIn4Schedule(total: number): { amount: number; label: string }[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / 4);
  const parts = [base, base, base, base];
  for (let i = 0; i < cents - base * 4; i++) parts[i]++;
  const labels = ["Today", "In 2 weeks", "In 4 weeks", "In 6 weeks"];
  return parts.map((c, i) => ({ amount: c / 100, label: labels[i] }));
}
function setlaMinDeposit(total: number): number {
  const cents = Math.round(total * 100);
  return Math.ceil(cents * 0.3) / 100;
}
// "Half and Half" is a real SETLA Pay Later variant -- same credit
// mechanism (financed against the customer's approved SETLA limit) as Pay
// in 4 above, just 2 instalments instead of 4: 50% today, 50% in 30 days.
// NOT a Laybuy preset -- Laybuy is the separate, genuinely no-credit-check
// option with a flexible customer-chosen deposit. Must stay in exact sync
// with lib/setla-instalments.ts's buildHalfAndHalfSchedule (server source
// of truth) and public/setla/setla.js's own halfHalfSchedule.
function setlaHalfHalfSchedule(total: number): { amount: number; label: string }[] {
  const cents = Math.round(total * 100);
  const first = Math.round(cents / 2);
  return [
    { amount: first / 100, label: "Today" },
    { amount: (cents - first) / 100, label: "In 30 days" },
  ];
}

export default function CheckoutPageClient() {
  const params = useParams();
  const slug = params.slug as string;
  // Entirely client-rendered (no SSR data), so reading window.location here
  // carries no hydration-mismatch risk.
  const sp = (suffix: string = "") =>
    typeof window !== "undefined" && usesCleanStorePaths(window.location.hostname)
      ? suffix || "/"
      : `/store/${slug}${suffix}`;
  const [seller, setSeller] = useState<Seller | null>(null);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [sellerProducts, setSellerProducts] = useState<{ id: string; name: string; category: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [address, setAddress] = useState("");
  const [apartment, setApartment] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("Gauteng");
  const [postalCode, setPostalCode] = useState("");

  const [fulfillment, setFulfillment] = useState<"delivery" | "pickup">("delivery");
  const [shippingOption, setShippingOption] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState<"eft" | "payfast" | "yoco" | "setla">("eft");
  const [billingSame, setBillingSame] = useState(true);
  const [showSummary, setShowSummary] = useState(false);
  const [placing, setPlacing] = useState(false);
  const placingRef = useRef(false);
  const [orderError, setOrderError] = useState("");
  const [orderPlaced, setOrderPlaced] = useState(false);
  const [orderNumber, setOrderNumber] = useState("");
  const [discountCode, setDiscountCode] = useState("");
  const [discountApplied, setDiscountApplied] = useState<{ code: string; type: string; value: number; applies_to: string; product_ids: string[]; collection_names: string[] } | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [applyingDiscount, setApplyingDiscount] = useState(false);
  const [paidOrder, setPaidOrder] = useState<{ order_number: string; total: number; items: any[]; customer_name: string; _processing?: boolean } | null>(null);

  useLiveVisitorPing(seller?.id, {
    cartItemCount: cart.reduce((sum, i) => sum + i.qty, 0),
    cartValue: cart.reduce((sum, i) => sum + i.price * i.qty, 0),
    checkout: true,
    customerName: [firstName, lastName].filter(Boolean).join(" "),
    customerEmail: email,
  });

  useEffect(() => { load(); }, [slug]);

  /* While we're showing the "Processing payment" state, poll the order
     every 3 seconds for up to 90 seconds so the page flips to "Confirmed"
     as soon as PayFast's ITN lands. */
  useEffect(() => {
    if (!paidOrder?._processing || !paidOrder?.order_number) return;
    let count = 0;
    const id = setInterval(async () => {
      count += 1;
      const orderId = (paidOrder as any).id || new URLSearchParams(window.location.search).get("paid");
      if (!orderId) { clearInterval(id); return; }
      const { data } = await supabase.from("orders").select("*").eq("id", orderId).single();
      if (data && (data.payment_status === "paid" || data.status === "confirmed")) {
        setPaidOrder({ ...data, _processing: false });
        clearInterval(id);
      } else if (count >= 30) {
        clearInterval(id);
      }
    }, 3000);
    return () => clearInterval(id);
  }, [paidOrder?._processing, paidOrder?.order_number]);

  const load = async () => {
    // Fetch seller data through safe API (strips merchant keys)
    const sellerRes = await fetch("/api/seller-public?slug=" + slug);
    const sd = sellerRes.ok ? await sellerRes.json() : null;
    if (sd) {
      setSeller(sd);
      const { data: prods } = await supabase.from("products").select("id, name, category").eq("seller_id", sd.id);
      if (prods) setSellerProducts(prods);
    }
    const p = new URLSearchParams(window.location.search);
    // Check if returning from PayFast payment.
    // Only show the success screen if the order is actually marked paid
    // server-side — previously anyone could land on ?paid=<orderId> and
    // see "Payment Successful" regardless of whether payment went through.
    const paidId = p.get("paid");
    if (paidId) {
      const { data: order } = await supabase.from("orders").select("*").eq("id", paidId).single();
      if (order && (order.payment_status === "paid" || order.status === "confirmed" || order.status === "delivered")) {
        setPaidOrder(order); setLoading(false); return;
      }
      if (order) {
        /* Order exists but isn't paid yet — PayFast's ITN may still be in
           flight. Show a "processing" message instead of false success. */
        setPaidOrder({ ...order, _processing: true });
        setLoading(false);
        return;
      }
    }
    // Handle cancelled PayFast/Yoco payment - reload cart from order
    const cancelledParam = p.get("cancelled");
    if (cancelledParam === "1") {
      alert("Payment was cancelled. You can try again.");
    }
    // Yoco reports a declined/failed card attempt separately from an
    // outright cancel (see failureUrl in /api/checkout/yoco-redirect) --
    // same "?cart=" re-hydration so the customer doesn't lose their cart,
    // distinct message since the customer DID try to pay, it just didn't
    // go through.
    const failedParam = p.get("failed");
    if (failedParam === "1") {
      alert("Your payment could not be completed. Please try again or use a different payment method.");
    }
    /* Decode + validate cart from URL. Any malformed item would otherwise
       produce NaN totals and an unclickable "Pay Now RNaN" button. Prices
       here are display-only — the server re-fetches before charging. */
    try {
      const raw = p.get("cart") || "";
      const decoded = JSON.parse(decodeURIComponent(escape(atob(raw))));
      if (Array.isArray(decoded)) {
        const clean = decoded
          .filter((i: any) => i && typeof i === "object")
          .map((i: any) => ({
            id: typeof i.id === "string" ? i.id : undefined,
            name: typeof i.name === "string" ? i.name : "",
            price: Number.isFinite(Number(i.price)) ? Number(i.price) : 0,
            qty: Math.max(1, Math.floor(Number(i.qty)) || 1),
            variant: typeof i.variant === "string" ? i.variant : "",
            image: typeof i.image === "string" ? i.image : "",
            selectedVariants: i.selectedVariants && typeof i.selectedVariants === "object" ? i.selectedVariants : undefined,
            tags: Array.isArray(i.tags) ? i.tags.filter((t: any) => typeof t === "string") : undefined,
          }))
          .filter((i: any) => i.name);
        if (clean.length > 0) setCart(clean);
      }
    } catch {}
    if (!sd?.checkout_config?.delivery_enabled && sd?.checkout_config?.pickup_enabled) setFulfillment("pickup");
    if (sd?.checkout_config?.yoco_enabled) setPaymentMethod("yoco");
    else if (sd?.checkout_config?.payfast_enabled) setPaymentMethod("payfast");
    else if (sd?.checkout_config?.eft_enabled) setPaymentMethod("eft");
    setLoading(false);
  };

  const cc = seller?.checkout_config || {} as any;
  // Import-tagged product in the cart -> only is_premium-marked shipping
  // options are offered (7-14 working day "premium" shipment), and the
  // reverse -- see hasImportTag's own comment above for the full behavior.
  // Guarded on "some option IS marked premium" so a seller who's never
  // touched this feature sees the exact same option list as before --
  // otherwise an import-tagged cart with no premium option configured yet
  // would show NO shipping options at all instead of failing safe.
  const cartHasImport = cart.some((i) => hasImportTag(i.tags));
  const shippingOptionsConfigured: { name: string; price: number; estimate?: string; is_premium?: boolean }[] = cc.shipping_options || [];
  const hasAnyPremiumOption = shippingOptionsConfigured.some((o) => o.is_premium);
  const isShippingOptionVisible = (opt: { is_premium?: boolean }) =>
    !hasAnyPremiumOption ? true : cartHasImport ? !!opt.is_premium : !opt.is_premium;
  const visibleShippingOptions = shippingOptionsConfigured.filter(isShippingOptionVisible);
  // shippingOption is an index into the FULL shipping_options array (the
  // place-order request sends that raw index, see placeOrder() below) --
  // if the cart's import status changes (an import product added/removed)
  // and the currently-selected option is no longer visible, reselect the
  // first one that still is, same as "if they remove the product then we
  // show the normal delivery options" -- this is what actually makes that
  // happen, not just hiding the row in the list.
  useEffect(() => {
    const current = shippingOptionsConfigured[shippingOption];
    if (current && isShippingOptionVisible(current)) return;
    const firstVisibleIdx = shippingOptionsConfigured.findIndex((o) => isShippingOptionVisible(o));
    if (firstVisibleIdx !== -1 && firstVisibleIdx !== shippingOption) setShippingOption(firstVisibleIdx);
  }, [cartHasImport, hasAnyPremiumOption, shippingOptionsConfigured.length]);
  const accent = seller?.primary_color || "#9c7c62";
  const isGC = seller?.template === "glass-futuristic" || seller?.template === "glass-chrome";
  const isHL = seller?.template === "heirloom";
  const isRF = seller?.template === "rosefields";
  const isCrown = seller?.template === "crown";
  const isFourRegn = seller?.template === "4regn";
  const slCfg = seller ? (effectiveStoreConfig(seller) as any) : {};
  const slFontPair = getFontPair(seller ? slCfg.font_pair : undefined);
  const slBg = slCfg.bg_color || "#f6f3ef";
  const slText = slCfg.text_color || "#2a2a2e";
  const slMuted = slCfg.muted_color || "#8a8690";
  // Readable text color for a solid button filled with an arbitrary brand color.
  const readableOn = (hex: string) => {
    const h = hex.replace("#", "");
    if (h.length !== 6) return "#fff";
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.6 ? "#111" : "#fff";
  };
  const T = isGC ? {
    bg: "#030305", card: "#0b0b0f", text: "#f0f0f0", muted: "rgba(255,255,255,0.4)", border: "rgba(255,255,255,0.08)",
    inputBg: "rgba(255,255,255,0.04)", inputBorder: "rgba(255,255,255,0.1)", inputText: "#f0f0f0",
    btnBg: "#fff", btnText: "#000", btnRadius: "6px",
    headFont: "'Bebas Neue', sans-serif", bodyFont: "'DM Sans', sans-serif",
    selectBg: "rgba(34,197,94,0.08)", eftBg: "rgba(255,255,255,0.03)",
    fonts: "@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600;700&family=Share+Tech+Mono&display=swap');",
    summaryBg: "rgba(255,255,255,0.02)", summaryBorder: "rgba(255,255,255,0.06)",
    badgeBg: "rgba(255,255,255,0.06)", badgeText: "#fff",
    stickyBg: "rgba(3,3,5,0.95)", emptyImg: "rgba(255,255,255,0.04)", payCardBg: "rgba(255,255,255,0.06)",
  } : isHL ? {
    // Heirloom: white paper + ink type, serif headlines (DM Serif Display), sans body (DM Sans),
    // hairline borders matching the storefront's --rule/--ink/--dim system.
    bg: "#fff", card: "#fff", text: "#111010", muted: "#595959", border: "#e0dbd5",
    inputBg: "#fff", inputBorder: "#e0dbd5", inputText: "#111010",
    btnBg: "#111010", btnText: "#fff", btnRadius: "0",
    headFont: "'DM Serif Display', Georgia, serif", bodyFont: "'DM Sans', sans-serif",
    selectBg: "#f7f5f2", eftBg: "#f7f5f2",
    fonts: "@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500;600;700&display=swap');",
    summaryBg: "#fff", summaryBorder: "#e0dbd5",
    badgeBg: "#111010", badgeText: "#fff",
    stickyBg: "rgba(255,255,255,0.95)", emptyImg: "#f2f0ed", payCardBg: "#fff",
  } : isRF ? {
    // Rosefields: warm cream paper + burgundy accents + gold hairlines,
    // matching the storefront's Playfair Display / DM Sans pairing.
    bg: "#faf5ee", card: "#fff", text: "#2b2320", muted: "rgba(43,35,32,0.6)", border: "rgba(122,19,48,0.12)",
    inputBg: "#faf5ee", inputBorder: "rgba(122,19,48,0.12)", inputText: "#2b2320",
    btnBg: "#7a1330", btnText: "#fff", btnRadius: "100px",
    headFont: "'Playfair Display', serif", bodyFont: "'DM Sans', sans-serif",
    selectBg: "rgba(122,19,48,0.05)", eftBg: "#faf5ee",
    fonts: "@import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,600;0,700;1,500&family=DM+Sans:wght@300;400;500;600;700&display=swap');",
    summaryBg: "rgba(122,19,48,0.03)", summaryBorder: "rgba(122,19,48,0.1)",
    badgeBg: "#7a1330", badgeText: "#fff",
    stickyBg: "rgba(250,245,238,0.95)", emptyImg: "#f3d9de", payCardBg: "#fff",
  } : isCrown ? {
    // Crown: dark near-black paper + gold accents + cream type, matching the
    // storefront's Cormorant Garant / Didact Gothic pairing and gold CTAs.
    bg: slCfg.bg_color || "#0a0908", card: "#1a1816", text: "#f0e6d3", muted: "rgba(240,230,211,0.6)", border: "rgba(196,162,101,0.15)",
    inputBg: "#1a1816", inputBorder: "rgba(196,162,101,0.2)", inputText: "#f0e6d3",
    btnBg: "#c4a265", btnText: "#0a0908", btnRadius: "0",
    headFont: "'Cormorant Garant', serif", bodyFont: "'Didact Gothic', sans-serif",
    selectBg: "rgba(196,162,101,0.08)", eftBg: "#1a1816",
    fonts: "@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garant:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Didact+Gothic&display=swap');",
    summaryBg: "rgba(196,162,101,0.05)", summaryBorder: "rgba(196,162,101,0.12)",
    badgeBg: "#c4a265", badgeText: "#0a0908",
    stickyBg: `${slCfg.bg_color || "#0a0908"}f2`, emptyImg: "#1a1816", payCardBg: "#1a1816",
  } : isFourRegn ? {
    // 4regn: light neutral gradient paper + charcoal ink + solid-black CTAs,
    // matching the storefront's dark header. Font pair matches the
    // storefront's own --serif/--body (FourRegnStore.tsx) -- same Arial/
    // Helvetica the hero section uses, not the old Quattrocento/Amiri
    // Google Fonts pairing (dropped there too, so no @import needed here).
    bg: "#f5f5f5", card: "#fff", text: "#2e2a39", muted: "rgba(46,42,57,0.6)", border: "rgba(0,0,0,0.08)",
    inputBg: "#fff", inputBorder: "rgba(0,0,0,0.12)", inputText: "#2e2a39",
    btnBg: "#000000", btnText: "#ffffff", btnRadius: "10px",
    headFont: "Arial, Helvetica, sans-serif", bodyFont: "Arial, Helvetica, sans-serif",
    selectBg: "rgba(0,0,0,0.03)", eftBg: "#f5f5f5",
    fonts: "",
    summaryBg: "rgba(0,0,0,0.015)", summaryBorder: "rgba(0,0,0,0.06)",
    badgeBg: "#765341", badgeText: "#fdfbf7",
    stickyBg: "rgba(245,245,245,0.95)", emptyImg: "#eeeeee", payCardBg: "#fff",
  } : {
    bg: slBg, card: "#fff", text: slText, muted: slMuted, border: "rgba(0,0,0,0.12)",
    inputBg: "#fff", inputBorder: "rgba(0,0,0,0.12)", inputText: slText,
    btnBg: accent, btnText: readableOn(accent), btnRadius: "100px",
    headFont: slFontPair.heading, bodyFont: slFontPair.body,
    selectBg: "rgba(156,124,98,0.04)", eftBg: slBg,
    fonts: `@import url('https://fonts.googleapis.com/css2?${slFontPair.import}&display=swap');`,
    summaryBg: "rgba(0,0,0,0.015)", summaryBorder: "rgba(0,0,0,0.06)",
    badgeBg: slMuted, badgeText: "#fff",
    stickyBg: `${slBg}f2`, emptyImg: "#e0d5ca", payCardBg: "#fff",
  };
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = fulfillment === "pickup" ? 0 : (cc.shipping_options?.[shippingOption]?.price || 0);

  // Calculate discount based on type
  const calcDiscount = () => {
    if (!discountApplied) return 0;
    const da = discountApplied;

    if (da.applies_to === "cart") {
      return da.type === "percentage" ? subtotal * (da.value / 100) : Math.min(da.value, subtotal);
    }

    if (da.applies_to === "product") {
      // Match product IDs to names using sellerProducts lookup
      const eligibleNames = sellerProducts.filter((p) => da.product_ids?.includes(p.id)).map((p) => p.name.toLowerCase());
      const eligibleTotal = cart.filter((i) => eligibleNames.includes(i.name.toLowerCase())).reduce((s, i) => s + i.price * i.qty, 0);
      return da.type === "percentage" ? eligibleTotal * (da.value / 100) : Math.min(da.value, eligibleTotal);
    }

    if (da.applies_to === "collection") {
      // Match collection names to products, then match cart items
      const eligibleNames = sellerProducts.filter((p) => (p.category || "").split(",").some((c: string) => da.collection_names?.includes(c.trim()))).map((p) => p.name.toLowerCase());
      const eligibleTotal = cart.filter((i) => eligibleNames.includes(i.name.toLowerCase())).reduce((s, i) => s + i.price * i.qty, 0);
      return da.type === "percentage" ? eligibleTotal * (da.value / 100) : Math.min(da.value, eligibleTotal);
    }

    if (da.applies_to === "shipping") {
      const shippingDisc = da.type === "percentage" ? shipping * (da.value / 100) : Math.min(da.value, shipping);
      return Math.min(shippingDisc, shipping); // Can never exceed shipping cost
    }

    return 0;
  };
  const discountAmount = calcDiscount();
  const isShippingDiscount = discountApplied?.applies_to === "shipping";
  const total = isShippingDiscount ? Math.max(0, subtotal + shipping - discountAmount) : Math.max(0, subtotal - discountAmount + shipping);
  const itemCount = cart.reduce((s, i) => s + i.qty, 0);

  const applyDiscount = async () => {
    if (!discountCode.trim() || !seller) return;
    setApplyingDiscount(true); setDiscountError("");
    const { data, error: dcErr } = await supabase.from("discount_codes").select("*").eq("seller_id", seller.id).eq("code", discountCode.trim().toUpperCase()).eq("active", true).single();
    if (!data || dcErr) { setDiscountError("Invalid discount code"); setApplyingDiscount(false); return; }
    if (data.expires_at && new Date(data.expires_at) < new Date()) { setDiscountError("This code has expired"); setApplyingDiscount(false); return; }
    if (data.max_uses && data.used_count >= data.max_uses) { setDiscountError("This code has reached its usage limit"); setApplyingDiscount(false); return; }
    if (data.min_order > 0 && subtotal < data.min_order) { setDiscountError("Minimum order of R" + data.min_order + " required"); setApplyingDiscount(false); return; }
    if ((data.applies_to === "product") && data.product_ids?.length > 0) {
      const eligibleNames = sellerProducts.filter((p) => data.product_ids.includes(p.id)).map((p) => p.name.toLowerCase());
      const hasEligible = cart.some((i) => eligibleNames.includes(i.name.toLowerCase()));
      if (!hasEligible) { setDiscountError("No eligible products in your cart for this code"); setApplyingDiscount(false); return; }
    }
    if ((data.applies_to === "collection") && data.collection_names?.length > 0) {
      const eligibleNames = sellerProducts.filter((p) => (p.category || "").split(",").some((c: string) => data.collection_names.includes(c.trim()))).map((p) => p.name.toLowerCase());
      const hasEligible = cart.some((i) => eligibleNames.includes(i.name.toLowerCase()));
      if (!hasEligible) { setDiscountError("No products from eligible collections in your cart"); setApplyingDiscount(false); return; }
    }
    if (data.applies_to === "shipping" && shipping === 0) { setDiscountError("No shipping fee to discount"); setApplyingDiscount(false); return; }
    setDiscountApplied({ code: data.code, type: data.type, value: data.value, applies_to: data.applies_to || "cart", product_ids: data.product_ids || [], collection_names: data.collection_names || [] });
    setApplyingDiscount(false);
  };

  const isStoreActive = (s: Seller | null) => {
    if (!s) return false;
    if (s.subscription_status === "active" || s.subscription_status === "free") return true;
    if (s.subscription_status === "trial" && s.trial_ends_at && new Date(s.trial_ends_at) > new Date()) return true;
    return false;
  };

  const placeOrder = async () => {
    /* Double-submit guard: a ref because state updates are async, so two
       fast clicks could both pass `if (placing) return` before React renders. */
    if (placingRef.current) return;
    if (!seller) return;
    if (!isStoreActive(seller)) { setOrderError("This store is not currently accepting orders. Please contact the seller directly."); return; }
    if (!email || !firstName || !lastName) { setOrderError("Please fill in your contact details"); return; }
    if (fulfillment === "delivery" && (!address || !city || !postalCode)) { setOrderError("Please fill in your delivery address"); return; }

    placingRef.current = true;
    setPlacing(true);
    setOrderError("");

    try {
      /* All pricing/discount logic happens server-side now. The server
         re-fetches product prices from the DB so client-supplied `price`
         values are ignored. */
      const res = await fetch("/api/checkout/place-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slug,
          items: cart.map((i) => ({ id: i.id, name: i.name, qty: i.qty, variant: i.variant, image: i.image, selectedVariants: i.selectedVariants })),
          customer: { firstName, lastName, email, phone },
          address: fulfillment === "delivery"
            ? { address, apartment, city, province, postal_code: postalCode }
            : null,
          fulfillment,
          shippingOptionIndex: fulfillment === "delivery" ? shippingOption : null,
          paymentMethod,
          discountCode: discountApplied?.code || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setOrderError(json.error || "Could not place your order. Please try again.");
        return;
      }

      const orderId: string = json.orderId;
      setOrderNumber(json.orderNumber);
      setOrderPlaced(true);

      // Notify seller (non-blocking) -- but not for PayFast/Yoco/SETLA
      // orders yet: this row is still payment_status "pending" and the
      // customer hasn't even reached the payment gateway's page (or, for
      // SETLA, hasn't chosen a plan yet). Those only get notified once
      // their respective webhook (app/api/payfast/notify,
      // app/api/unik/checkout/webhook, which already handles SETLA
      // instalment/laybuy events too) confirms payment actually went
      // through, so the seller never gets a "New Order!" email for a
      // payment that failed or was abandoned.
      if (paymentMethod !== "payfast" && paymentMethod !== "yoco" && paymentMethod !== "setla") {
        fetch("/api/notify-order", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId }),
        }).catch(() => {});
      }

      if (paymentMethod === "payfast" && cc.payfast_enabled) {
        const pfRes = await fetch("/api/payfast-redirect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, slug, firstName, lastName, email, phone, returnOrigin: window.location.origin }),
        });
        if (!pfRes.ok) {
          setOrderError("Could not start PayFast checkout. Your order was saved; please contact the seller.");
          return;
        }
        const html = await pfRes.text();
        document.open(); document.write(html); document.close();
        return;
      }

      if (paymentMethod === "yoco" && cc.yoco_enabled) {
        const ycRes = await fetch("/api/checkout/yoco-redirect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId, slug, returnOrigin: window.location.origin }),
        });
        const ycJson = await ycRes.json().catch(() => ({}));
        if (!ycRes.ok || !ycJson.redirectUrl) {
          setOrderError(ycJson.error || "Could not start card payment. Your order was saved; please contact the seller.");
          return;
        }
        // Yoco's Checkout API returns a hosted redirect URL directly (unlike
        // PayFast, which needs an auto-submitting form) -- a plain
        // navigation is all that's needed.
        window.location.href = ycJson.redirectUrl;
        return;
      }

      if (paymentMethod === "setla" && cc.setla_enabled) {
        // SETLA's own checkout.html (shared with UNIK Labs, see
        // app/api/checkout/setla-create/route.ts's own comment) picks
        // Pay Later vs Laybuy and shows the instalment schedule itself --
        // this just hands off the already-placed order and cart details,
        // same handoff key UNIK's real checkout.html writes
        // ('unik-setla-handoff-v1'), distinguished by kind: 'generic-product'
        // so setla.js's shared logic knows this isn't a design-based UNIK
        // cart and skips every check that assumes one.
        try {
          localStorage.setItem("unik-setla-handoff-v1", JSON.stringify({
            kind: "generic-product",
            ts: Date.now(),
            orderId,
            sellerSlug: slug,
            cartItems: cart.map((i) => ({ id: i.id, name: i.name, price: i.price, qty: i.qty, image: i.image, variant: i.variant })),
            // Field names (streetAddress/suburb/townCity/province/postal)
            // match what setla.js's deliverySummary already reads off
            // UNIK's own handoff shape -- reused as-is so that rendering
            // needs no branching, just real data in the same slots.
            customer: {
              firstName, lastName, email, phone,
              streetAddress: fulfillment === "delivery" ? address : undefined,
              suburb: fulfillment === "delivery" ? apartment : undefined,
              townCity: fulfillment === "delivery" ? city : undefined,
              province: fulfillment === "delivery" ? province : undefined,
              postal: fulfillment === "delivery" ? postalCode : undefined,
            },
            deliveryMethod: fulfillment === "delivery" ? { name: cc.shipping_options?.[shippingOption]?.name, price: shipping } : { name: "Pickup", price: 0, isPickup: true },
            discountCode: discountApplied?.code || undefined,
            total,
            returnOrigin: window.location.origin,
            storeName: seller?.store_name || "",
            storeUrl: window.location.origin + sp(),
          }));
        } catch {
          setOrderError("Could not start SETLA checkout. Please try again.");
          return;
        }
        window.location.href = "/setla/checkout.html";
        return;
      }
    } catch (e: any) {
      setOrderError(e?.message || "Network error placing your order. Please try again.");
    } finally {
      setPlacing(false);
      placingRef.current = false;
    }
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: T.bodyFont, background: T.bg }}><p style={{ color: T.muted }}>Loading checkout...</p></div>;

  if (seller && !isStoreActive(seller) && !paidOrder) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: T.bodyFont, background: T.bg, color: T.text, padding: "40px 24px", textAlign: "center" }}>
      <h1 style={{ fontFamily: T.headFont, fontSize: 32, fontWeight: 500, marginBottom: 12 }}>Store Temporarily Unavailable</h1>
      <p style={{ fontSize: 15, color: T.muted, maxWidth: 420, lineHeight: 1.6 }}>This store is not currently accepting orders. Please check back soon or contact the seller directly.</p>
    </div>
  );

  // PayFast payment success confirmation
  if (paidOrder) return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.bodyFont, color: T.text }}>
      <style>{T.fonts + `body,html{background:${T.bg};margin:0}`}</style>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain" }} /> : <h2 style={{ fontFamily: T.headFont, fontSize: 28, fontWeight: 300, marginBottom: 20 }}>{seller?.store_name}</h2>}
          {paidOrder._processing ? (
            <>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(251,191,36,0.12)", border: "2px solid #fbbf24", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>
              <h1 style={{ fontFamily: T.headFont, fontSize: 32, fontWeight: isGC || isHL || isFourRegn ? 400 : 300, marginBottom: 8 }}>Processing payment…</h1>
              <p style={{ color: T.muted, fontSize: 14 }}>Order #{paidOrder.order_number}</p>
            </>
          ) : (
            <>
              <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(34,197,94,0.12)", border: "2px solid #22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
              <h1 style={{ fontFamily: T.headFont, fontSize: 32, fontWeight: isGC || isHL || isFourRegn ? 400 : 300, marginBottom: 8 }}>Payment Successful!</h1>
              <p style={{ color: T.muted, fontSize: 14 }}>Order #{paidOrder.order_number}</p>
            </>
          )}
        </div>
        <div style={{ background: T.card, borderRadius: 16, padding: 28, marginBottom: 24, border: "1px solid " + T.border }}>
          <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16, color: paidOrder._processing ? "#fbbf24" : "#22c55e", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{paidOrder._processing ? "Awaiting Confirmation" : "Order Confirmed"}</h3>
          <p style={{ fontSize: 14, lineHeight: 1.8, color: T.muted, marginBottom: 20 }}>{paidOrder._processing
            ? `Thanks ${paidOrder.customer_name}. Your order is saved and we're waiting for the payment confirmation from PayFast. This page will update automatically, or check your email for the receipt.`
            : `Thank you ${paidOrder.customer_name}! Your payment has been received and your order is being processed. You'll receive updates via email.`}</p>
          <div style={{ borderTop: "1px solid " + T.border, paddingTop: 16 }}>
            {(paidOrder.items || []).map((item: any, i: number) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 14 }}>
                <span style={{ color: T.text }}>{item.name} x{item.qty}{item.variant ? " (" + item.variant + ")" : ""}</span>
                <span style={{ fontWeight: 700 }}>R{(item.price * item.qty).toFixed(0)}</span>
              </div>
            ))}
            <div style={{ borderTop: "1px solid " + T.border, paddingTop: 12, marginTop: 8, display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}>
              <span>Total</span>
              <span>R{paidOrder.total}</span>
            </div>
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <a href={sp()} style={{ display: "inline-block", padding: "16px 48px", background: T.btnBg, color: T.btnText, borderRadius: T.btnRadius, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>Continue Shopping</a>
        </div>
      </div>
    </div>
  );

  if (orderPlaced && paymentMethod === "eft") return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.bodyFont, color: T.text }}>
      <style>{T.fonts + `body,html{background:${T.bg};margin:0}` + (isGC ? ` input::placeholder{color:rgba(255,255,255,0.3)!important}` : ``)}</style>
      <div style={{ maxWidth: 600, margin: "0 auto", padding: "60px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 40 }}>
          {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 40, marginBottom: 20, objectFit: "contain" }} /> : <h2 style={{ fontFamily: T.headFont, fontSize: 28, fontWeight: 300, marginBottom: 20 }}>{seller?.store_name}</h2>}
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px" }}><svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: T.headFont, fontSize: 32, fontWeight: 400, marginBottom: 8 }}>Order Placed!</h1>
          <p style={{ color: T.muted, fontSize: 14 }}>Order #{orderNumber}</p>
        </div>
        <div style={{ background: T.card, borderRadius: 16, padding: 28, marginBottom: 24, border: "1px solid " + T.border }}>
          <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 16 }}>EFT / Direct Deposit Payment Instructions</h3>
          <div style={{ fontSize: 14, lineHeight: 1.8, color: T.text }}>
            {cc.eft_bank_name && <p><strong>Bank:</strong> {cc.eft_bank_name}</p>}
            {cc.eft_account_number && <p><strong>Account Number:</strong> {cc.eft_account_number}</p>}
            {cc.eft_account_name && <p><strong>Account Name:</strong> {cc.eft_account_name}</p>}
            {cc.eft_branch_code && <p><strong>Branch Code:</strong> {cc.eft_branch_code}</p>}
            {cc.eft_account_type && <p><strong>Account Type:</strong> {cc.eft_account_type}</p>}
          </div>
          {cc.eft_instructions && <div style={{ marginTop: 20, padding: 20, background: T.selectBg, borderRadius: 12, fontSize: 14, lineHeight: 1.7, color: T.text, whiteSpace: "pre-wrap" }}>{cc.eft_instructions}</div>}
        </div>
        <div style={{ textAlign: "center" }}>
          <a href={sp()} style={{ display: "inline-block", padding: "16px 48px", background: T.btnBg, color: T.btnText, borderRadius: T.btnRadius, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>Return to Store</a>
        </div>
      </div>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: T.bg, fontFamily: T.bodyFont, color: T.text }}>
      <style>{T.fonts + `body,html{background:${T.bg};margin:0}` + (isGC ? `input::placeholder,select{color:rgba(255,255,255,0.3)!important}option{background:#0b0b0f;color:#f0f0f0}` : ``) + `@media(max-width:768px){.ck-grid{grid-template-columns:1fr!important}.ck-summary{position:static!important;border-left:none!important;padding-top:0!important}}`}</style>

      {/* HEADER */}
      <div style={{ borderBottom: "1px solid " + T.summaryBorder, padding: "16px 24px", background: T.stickyBg, backdropFilter: "blur(20px)", position: "sticky", top: 0, zIndex: 10 }}>
        <div style={{ maxWidth: 1000, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <a href={sp()} style={{ textDecoration: "none" }}>
            {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 36, objectFit: "contain" }} /> : <span style={{ fontFamily: T.headFont, fontSize: 22, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", color: T.text }}>{seller?.store_name}</span>}
          </a>
          <button onClick={() => setShowSummary(!showSummary)} style={{ background: "none", border: "none", fontSize: 13, color: accent, cursor: "pointer", fontFamily: T.bodyFont, display: "flex", alignItems: "center", gap: 6 }}>
            Order summary <span style={{ fontWeight: 600 }}>R{total.toFixed(0)}</span> <span style={{ fontSize: 10 }}>{showSummary ? "\u25B2" : "\u25BC"}</span>
          </button>
        </div>
      </div>

      {/* MOBILE SUMMARY DROPDOWN */}
      {showSummary && (
        <div style={{ maxWidth: 1000, margin: "0 auto", padding: "0 24px" }}>
          <div style={{ padding: "20px 0", borderBottom: "1px solid " + T.summaryBorder }}>
            {cart.map((item, i) => (
              <div key={i} style={{ display: "flex", gap: 12, marginBottom: 12, alignItems: "center" }}>
                <div style={{ position: "relative" }}>
                  {item.image ? <img src={item.image} alt="" style={{ width: 56, height: 68, borderRadius: 8, objectFit: "cover", border: "1px solid " + T.summaryBorder }} /> : <div style={{ width: 56, height: 68, borderRadius: 8, background: T.emptyImg }} />}
                  <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: T.badgeBg, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.qty}</span>
                </div>
                <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: T.muted }}>{item.variant}</div>}</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>R{(item.price * item.qty).toFixed(0)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="ck-grid" style={{ maxWidth: 1000, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 380px", gap: 0 }}>

        {/* LEFT - FORM */}
        <div style={{ padding: "32px 24px 60px" }}>

          {/* CONTACT */}
          <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 20 }}>Contact</h2>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginBottom: 12, background: T.card, color: T.text }} />
          <input type="tel" placeholder="Phone" value={phone} onChange={(e) => setPhone(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginBottom: 32, background: T.card, color: T.text }} />

          {/* DELIVERY vs PICKUP */}
          {(cc.delivery_enabled || cc.pickup_enabled) && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Fulfillment</h2>
              <div style={{ border: "1px solid " + T.border, borderRadius: 14, overflow: "hidden" }}>
                {cc.delivery_enabled && (
                  <div onClick={() => setFulfillment("delivery")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: fulfillment === "delivery" ? T.selectBg : T.card, borderBottom: cc.pickup_enabled ? "1px solid " + T.summaryBorder : "none" }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: fulfillment === "delivery" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <span style={{ fontSize: 14, fontWeight: fulfillment === "delivery" ? 600 : 400 }}>Delivery</span>
                  </div>
                )}
                {cc.pickup_enabled && (
                  <div onClick={() => setFulfillment("pickup")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: fulfillment === "pickup" ? T.selectBg : T.card }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: fulfillment === "pickup" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <div><span style={{ fontSize: 14, fontWeight: fulfillment === "pickup" ? 600 : 400 }}>Pickup</span>{cc.pickup_address && <div style={{ fontSize: 12, color: T.muted, marginTop: 2 }}>{cc.pickup_address}</div>}</div>
                  </div>
                )}
              </div>
              {fulfillment === "pickup" && cc.pickup_instructions && (
                <div style={{ marginTop: 12, padding: 16, background: T.card, borderRadius: 12, border: "1px solid " + T.summaryBorder, fontSize: 13, color: T.muted, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{cc.pickup_instructions}</div>
              )}
            </div>
          )}

          {/* DELIVERY ADDRESS */}
          {fulfillment === "delivery" && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Delivery Address</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
                <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
              </div>
              <input type="text" placeholder="Address" value={address} onChange={(e) => setAddress(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginTop: 12, background: T.card, color: T.text }} />
              <input type="text" placeholder="Apartment, suite, etc. (optional)" value={apartment} onChange={(e) => setApartment(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginTop: 12, background: T.card, color: T.text }} />
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginTop: 12 }}>
                <input type="text" placeholder="City" value={city} onChange={(e) => setCity(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
                <select value={province} onChange={(e) => setProvince(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text, appearance: "none" }}>
                  {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <input type="text" placeholder="Postal code" value={postalCode} onChange={(e) => setPostalCode(e.target.value)} style={{ width: "100%", padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", marginTop: 12, background: T.card, color: T.text }} />
            </div>
          )}

          {fulfillment === "pickup" && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Your Details</h2>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <input type="text" placeholder="First name" value={firstName} onChange={(e) => setFirstName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
                <input type="text" placeholder="Last name" value={lastName} onChange={(e) => setLastName(e.target.value)} style={{ padding: "16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text }} />
              </div>
            </div>
          )}

          {/* SHIPPING METHOD -- iterates the FULL shipping_options array
              (not visibleShippingOptions) so each row's index still lines
              up with shippingOption/the place-order request, but skips
              rendering (and selecting) any option isShippingOptionVisible
              says shouldn't show for this cart -- see that function's own
              comment for the import-tagged-cart behavior this is. */}
          {fulfillment === "delivery" && visibleShippingOptions.length > 0 && (
            <div style={{ marginBottom: 32 }}>
              <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Shipping Method</h2>
              <div style={{ border: "1px solid " + T.border, borderRadius: 14, overflow: "hidden" }}>
                {(() => {
                  const lastVisibleIdx = shippingOptionsConfigured.reduce((last, o, oi) => isShippingOptionVisible(o) ? oi : last, -1);
                  return shippingOptionsConfigured.map((opt, i) => {
                    if (!isShippingOptionVisible(opt)) return null;
                    return (
                      <div key={i} onClick={() => setShippingOption(i)} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: shippingOption === i ? T.selectBg : T.card, borderBottom: i === lastVisibleIdx ? "none" : "1px solid " + T.summaryBorder }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                        <div style={{ width: 20, height: 20, borderRadius: "50%", border: shippingOption === i ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                        <span style={{ fontSize: 14, fontWeight: shippingOption === i ? 600 : 400 }}>{opt.name}{opt.estimate ? " · " + opt.estimate : ""}</span>
                      </div>
                        <span style={{ fontSize: 14, fontWeight: 600 }}>{opt.price === 0 ? "Free" : "R" + opt.price}</span>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>
          )}

          {/* DISCOUNT CODE */}
          <div style={{ marginBottom: 32 }}>
            <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 16 }}>Discount Code</h2>
            {discountApplied ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", background: "rgba(34,197,94,0.04)", border: "1px solid rgba(34,197,94,0.15)", borderRadius: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ color: "#22c55e", fontSize: 14 }}>&#10003;</span>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{discountApplied.code}</span>
                  <span style={{ fontSize: 13, color: T.muted }}>{discountApplied.type === "percentage" ? discountApplied.value + "% off" : "R" + discountApplied.value + " off"} {discountApplied.applies_to !== "cart" ? "(" + discountApplied.applies_to + ")" : ""}</span>
                </div>
                <button onClick={() => { setDiscountApplied(null); setDiscountCode(""); }} style={{ background: "none", border: "none", color: T.muted, fontSize: 12, cursor: "pointer", textDecoration: "underline", fontFamily: T.bodyFont }}>Remove</button>
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" value={discountCode} onChange={(e) => { setDiscountCode(e.target.value.toUpperCase()); setDiscountError(""); }} onKeyDown={(e) => { if (e.key === "Enter") applyDiscount(); }} placeholder="Enter discount code" style={{ flex: 1, padding: "14px 16px", border: "1px solid " + T.border, borderRadius: 12, fontSize: 14, fontFamily: T.bodyFont, outline: "none", background: T.card, color: T.text, textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }} />
                  <button onClick={applyDiscount} disabled={applyingDiscount || !discountCode.trim()} style={{ padding: "14px 24px", background: T.btnBg, color: T.btnText, border: "none", borderRadius: 12, fontFamily: T.bodyFont, fontSize: 13, fontWeight: 500, cursor: (applyingDiscount || !discountCode.trim()) ? "not-allowed" : "pointer", opacity: (applyingDiscount || !discountCode.trim()) ? 0.5 : 1, letterSpacing: "0.04em" }}>{applyingDiscount ? "..." : "Apply"}</button>
                </div>
                {discountError && <p style={{ fontSize: 12, color: "#e53e3e", marginTop: 8 }}>{discountError}</p>}
              </div>
            )}
          </div>

          {/* PAYMENT */}
          <h2 style={{ fontFamily: T.headFont, fontSize: 24, fontWeight: 400, marginBottom: 8 }}>Payment</h2>
          <p style={{ fontSize: 13, color: T.muted, marginBottom: 16 }}>All transactions are secure and encrypted.</p>
          <div style={{ border: "1px solid " + T.border, borderRadius: 14, overflow: "hidden", marginBottom: 32 }}>
            {cc.setla_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("setla")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: paymentMethod === "setla" ? T.selectBg : T.card, borderBottom: "1px solid " + T.summaryBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "setla" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <span style={{ fontSize: 14, fontWeight: paymentMethod === "setla" ? 600 : 400 }}>Pay with SETLA</span>
                  </div>
                  {/* SETLA's logo mark is white -- invisible directly on a
                      light checkout theme (reported directly), unlike
                      Visa/Mastercard/Apple Pay above which already sit in
                      their own bordered T.payCardBg boxes. A plain black
                      card here, not tied to the seller's theme colors,
                      since white-on-white is the actual problem regardless
                      of which template this renders under. */}
                  <span style={{ padding: "3px 8px", background: "#000", borderRadius: 4, display: "flex", alignItems: "center" }}>
                    <img src="/setla/assets/setla-payments-logo.png" alt="SETLA" style={{ height: 14, objectFit: "contain" }} />
                  </span>
                </div>
                {/* PayFlex-style live breakdown, shown the moment SETLA is
                    selected -- before the customer even reaches the SETLA
                    page. Real conversion driver, not just informational:
                    seeing the exact 4 amounts/dates up front is what makes
                    a shopper trust the "buy now, pay later" pitch enough to
                    actually apply. Math must stay in sync with
                    lib/setla-instalments.ts -- see setlaPayIn4Schedule's
                    own comment. */}
                {paymentMethod === "setla" && (
                  <div style={{ padding: "18px 20px", background: T.selectBg, borderBottom: "1px solid " + T.summaryBorder }}>
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Pay in 4 &mdash; SETLA Pay Later, 0% interest</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                        {setlaPayIn4Schedule(total).map((row, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>R{row.amount.toFixed(0)}</div>
                            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{row.label}</div>
                            <div style={{ height: 4, borderRadius: 2, background: i === 0 ? "#068a1f" : "rgba(6,138,31,0.15)" }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    {/* Half and Half: the SAME SETLA Pay Later credit as
                        the block above, just 2 instalments instead of 4 --
                        see setlaHalfHalfSchedule's own comment. NOT a
                        Laybuy preset. Shown as its own block so it matches
                        the Pay in 4 block visually, same as PayFlex shows
                        its "Pay in 4" and "Pay in 3" options side by side. */}
                    <div style={{ paddingTop: 16, borderTop: "1px solid " + T.summaryBorder }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: T.muted, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 12 }}>Half and Half &mdash; SETLA Pay Later, 0% interest</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                        {setlaHalfHalfSchedule(total).map((row, i) => (
                          <div key={i}>
                            <div style={{ fontSize: 16, fontWeight: 700, color: T.text }}>R{row.amount.toFixed(0)}</div>
                            <div style={{ fontSize: 11, color: T.muted, marginBottom: 8 }}>{row.label}</div>
                            <div style={{ height: 4, borderRadius: 2, background: i === 0 ? "#068a1f" : "rgba(6,138,31,0.15)" }} />
                          </div>
                        ))}
                      </div>
                    </div>
                    <div style={{ fontSize: 12, color: T.muted, marginTop: 16, paddingTop: 14, borderTop: "1px solid " + T.summaryBorder }}>
                      Both use your SETLA limit -- no upfront deposit either way. Prefer no credit check? <strong style={{ color: T.text }}>SETLA Laybuy</strong>: pay a R{setlaMinDeposit(total).toFixed(0)} deposit today (min. 30%), then clear the rest -- any amount, any time -- over up to 3 months.
                    </div>
                    <div style={{ fontSize: 11, color: T.muted, marginTop: 10 }}>Choose your plan and see the exact schedule confirmed on the next step.</div>
                  </div>
                )}
              </div>
            )}
            {cc.yoco_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("yoco")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: paymentMethod === "yoco" ? T.selectBg : T.card, borderBottom: "1px solid " + T.summaryBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "yoco" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <span style={{ fontSize: 14, fontWeight: paymentMethod === "yoco" ? 600 : 400 }}>Card (Yoco)</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{ padding: "2px 4px", background: T.payCardBg, border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/visa.png" alt="Visa" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ padding: "2px 4px", background: T.payCardBg, border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/mastercard.png" alt="Mastercard" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ padding: "2px 4px", background: T.payCardBg, border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/applepay.png" alt="Apple Pay" style={{ height: 16, objectFit: "contain" }} /></span>
                    </div>
                  </div>
                </div>
                {paymentMethod === "yoco" && <div style={{ padding: "16px 20px", background: T.selectBg, fontSize: 13, color: T.muted, borderBottom: "1px solid " + T.summaryBorder }}>You'll be redirected to Yoco to complete your payment.</div>}
              </div>
            )}
            {cc.payfast_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("payfast")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", background: paymentMethod === "payfast" ? T.selectBg : T.card, borderBottom: "1px solid " + T.summaryBorder }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "payfast" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                    <span style={{ fontSize: 14, fontWeight: paymentMethod === "payfast" ? 600 : 400 }}>PayFast</span>
                  </div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
                      <span style={{ padding: "2px 4px", background: T.payCardBg, border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/visa.png" alt="Visa" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ padding: "2px 4px", background: T.payCardBg, border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/mastercard.png" alt="Mastercard" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ padding: "2px 4px", background: T.payCardBg, border: "1px solid " + T.border, borderRadius: 4, display: "flex", alignItems: "center" }}><img src="/checkout/applepay.png" alt="Apple Pay" style={{ height: 16, objectFit: "contain" }} /></span>
                      <span style={{ width: 22, height: 22, borderRadius: 4, border: "1px solid " + T.border, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, color: T.muted, fontWeight: 700 }}>+</span>
                    </div>
                  </div>
                </div>
                {paymentMethod === "payfast" && <div style={{ padding: "16px 20px", background: T.selectBg, fontSize: 13, color: T.muted, borderBottom: "1px solid " + T.summaryBorder }}>You'll be redirected to PayFast to complete your payment.</div>}
              </div>
            )}
            {cc.eft_enabled && (
              <div>
                <div onClick={() => setPaymentMethod("eft")} style={{ padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12, background: paymentMethod === "eft" ? T.selectBg : T.card }}>
                  <div style={{ width: 20, height: 20, borderRadius: "50%", border: paymentMethod === "eft" ? "6px solid #22c55e" : "2px solid " + T.muted }} />
                  <span style={{ fontSize: 14, fontWeight: paymentMethod === "eft" ? 600 : 400 }}>EFT / Direct Deposit</span>
                </div>
                {paymentMethod === "eft" && (
                  <div style={{ padding: "20px", background: T.selectBg, fontSize: 13, lineHeight: 1.7, color: T.text }}>
                    <p style={{ fontWeight: 700, marginBottom: 12 }}>Banking Details:</p>
                    {cc.eft_bank_name && <p>Bank: {cc.eft_bank_name}</p>}
                    {cc.eft_account_number && <p>Account: {cc.eft_account_number}</p>}
                    {cc.eft_account_name && <p>Name: {cc.eft_account_name}</p>}
                    {cc.eft_branch_code && <p>Branch: {cc.eft_branch_code}</p>}
                    {cc.eft_account_type && <p>Type: {cc.eft_account_type}</p>}
                    {cc.eft_instructions && <div style={{ marginTop: 16, padding: 16, background: T.bg, borderRadius: 10, whiteSpace: "pre-wrap" }}>{cc.eft_instructions}</div>}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* PLACE ORDER */}
          {orderError && (
            <div style={{ background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.25)", color: "#dc2626", padding: "12px 16px", borderRadius: 10, fontSize: 13, marginBottom: 16, lineHeight: 1.5 }}>
              {orderError}
            </div>
          )}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <a href={sp()} style={{ fontSize: 13, color: accent, textDecoration: "none" }}>&larr; Return to store</a>
            {/* #007517 -- the exact green UNIK Labs' own checkout.html uses
                on its .place-order button (public/private-templates/unik-labs/
                checkout.html), not Tailwind's #22c55e this used to be. The
                seller explicitly asked for this specific green (4regn is
                moving off Shopify onto this same checkout system UNIK Labs
                already runs on, and wants the two to look consistent) --
                confirmed via that file directly rather than eyeballing it. */}
            <button onClick={placeOrder} disabled={placing} style={{ padding: "18px 48px", background: "#007517", color: "#fff", border: "none", borderRadius: T.btnRadius, fontFamily: T.bodyFont, fontSize: 14, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", cursor: placing ? "not-allowed" : "pointer", opacity: placing ? 0.6 : 1 }}>{placing ? "Placing..." : paymentMethod === "setla" ? "Continue to SETLA" : (paymentMethod === "payfast" || paymentMethod === "yoco") ? "Pay Now - R" + total.toFixed(0) : "Complete Order - R" + total.toFixed(0)}</button>
          </div>
        </div>

        {/* RIGHT - ORDER SUMMARY */}
        <div className="ck-summary" style={{ padding: "32px 24px", borderLeft: "1px solid " + T.summaryBorder, background: T.summaryBg }}>
          <h3 style={{ fontFamily: T.headFont, fontSize: 20, fontWeight: 400, marginBottom: 20 }}>Order Summary</h3>
          {cart.map((item, i) => (
            <div key={i} style={{ display: "flex", gap: 14, marginBottom: 16, alignItems: "center" }}>
              <div style={{ position: "relative" }}>
                {item.image ? <img src={item.image} alt="" style={{ width: 60, height: 72, borderRadius: 10, objectFit: "cover", border: "1px solid " + T.summaryBorder }} /> : <div style={{ width: 60, height: 72, borderRadius: 10, background: T.emptyImg }} />}
                <span style={{ position: "absolute", top: -6, right: -6, width: 20, height: 20, borderRadius: "50%", background: T.badgeBg, color: "#fff", fontSize: 10, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{item.qty}</span>
              </div>
              <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 500, color: T.text }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: T.muted }}>{item.variant}</div>}</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>R{(item.price * item.qty).toFixed(0)}</div>
            </div>
          ))}
          <div style={{ borderTop: "1px solid " + T.summaryBorder, paddingTop: 16, marginTop: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: T.muted }}><span>Subtotal ({itemCount} item{itemCount !== 1 ? "s" : ""})</span><span>R{subtotal.toFixed(0)}</span></div>
            {discountApplied && discountAmount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: "#22c55e" }}><span>{discountApplied.code} {discountApplied.applies_to !== "cart" ? "(" + discountApplied.applies_to + ")" : ""}</span><span>-R{discountAmount.toFixed(0)}</span></div>}
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 14, color: T.muted }}><span>Shipping</span><span>{shipping === 0 ? (fulfillment === "pickup" ? "Pickup" : "Free") : "R" + shipping}</span></div>
          </div>
          <div style={{ borderTop: "1px solid " + T.summaryBorder, paddingTop: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
            <span style={{ fontFamily: T.headFont, fontSize: 28, fontWeight: 500 }}>R{total.toFixed(0)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}