"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams, useSearchParams } from "next/navigation";
import { effectiveStoreConfig } from "../../../lib/template-config";

const pInCat = (p: { category: string }, cat: string) =>
  (p.category || "").split(",").map((c) => c.trim()).includes(cat);

/* ─── TYPES ─────────────────────────────────────────────── */
interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string;
  facebook?: string; twitter?: string;
}
interface StoreConfig {
  announcement?: string;
  show_announcement?: boolean;
  show_trust_bar?: boolean;
  show_policies?: boolean;
  show_about?: boolean;
  trust_items?: { icon: string; title: string; desc: string }[];
  policy_items?: { title: string; desc: string }[];
  hero_subtext?: string;
  hero_title?: string;
  hero_image?: string;
  products_label?: string;
  products_heading?: string;
  coll_label?: string;
  coll_subtitle?: string;
  ticker_texts?: string[];
  bg_color?: string;
  font_pair?: string;
  contact_email?: string;
  contact_phone?: string;
  physical_address?: string;
  operating_hours?: string;
}
interface CheckoutConfig {
  eft_enabled?: boolean;
  eft_bank_name?: string;
  eft_account_number?: string;
  eft_account_name?: string;
  eft_branch_code?: string;
  eft_account_type?: string;
  eft_instructions?: string;
  payfast_enabled?: boolean;
  whatsapp_checkout_enabled?: boolean;
}
interface Seller {
  id: string; store_name: string; whatsapp_number: string;
  subdomain: string; template: string; primary_color: string;
  logo_url: string; tagline: string; description: string;
  collections: string[]; social_links: SocialLinks;
  store_config: StoreConfig;
  template_configs?: Record<string, any>;
  subscription_status?: string;
  trial_ends_at?: string | null;
  checkout_config?: CheckoutConfig;
}
interface Variant { name: string; options: string[]; priceDelta?: { [option: string]: number }; }
interface Product {
  id: string; name: string; price: number; old_price: number | null;
  category: string; image_url: string; images: string[];
  variants: Variant[]; in_stock: boolean; description: string;
  sort_order: number;
}
interface CartItem {
  product: Product; qty: number;
  selectedVariants: { [key: string]: string };
}

/* ─── HELPERS ────────────────────────────────────────────── */
const fmt = (n: number) => "R" + n.toLocaleString("en-ZA");
const variantDelta = (product: Product, selected: { [key: string]: string }): number =>
  (product.variants || []).reduce((sum, v) => {
    const chosen = selected[v.name];
    const d = chosen ? v.priceDelta?.[chosen] : undefined;
    return sum + (typeof d === "number" ? d : 0);
  }, 0);
const effectivePrice = (product: Product, selected: { [key: string]: string }): number =>
  Math.max(0, product.price + variantDelta(product, selected));
const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; };
const FREE_SHIP = 800;

const OCCASIONS = [
  { label: "Anniversary", icon: "ring" },
  { label: "Birthday", icon: "cake" },
  { label: "Proposal", icon: "ring2" },
  { label: "I'm Sorry", icon: "hands" },
  { label: "Just Because", icon: "flower" },
  { label: "New Baby", icon: "petal" },
];

interface StorePageProps {
  initialSeller?: Seller;
  initialProducts?: Product[];
  initialDiscountCodes?: any[];
  initialProductId?: string;
  isSubdomain?: boolean;
}

const buildInitialPromos = (dcs: any[] | undefined) => {
  if (!dcs || dcs.length === 0) return { discounts: [] as any[], countdown: null as any };
  const active = dcs
    .filter((d: any) => new Date(d.expires_at) > new Date())
    .map((d: any) => ({
      code: d.code, type: d.type, value: d.value, applies_to: d.applies_to || "cart",
      expires_at: d.expires_at, product_ids: d.product_ids || [], collection_names: d.collection_names || [], timeLeft: ""
    }));
  const storePromo = active.find((d: any) => d.applies_to === "cart" || d.applies_to === "shipping");
  return {
    discounts: active,
    countdown: storePromo ? { code: storePromo.code, type: storePromo.type, value: storePromo.value, applies_to: storePromo.applies_to, expires_at: storePromo.expires_at, timeLeft: "" } : null,
  };
};

export default function RosefieldsStore({ initialSeller, initialProducts, initialDiscountCodes, initialProductId, isSubdomain }: StorePageProps = {}) {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const sp = (suffix: string = "") => (isSubdomain ? suffix || "/" : `/store/${slug}${suffix}`);
  const isEditMode = searchParams.get("editMode") === "true";

  const [seller, setSeller]     = useState<Seller | null>(initialSeller ?? null);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading]   = useState(!initialSeller);
  const [notFound, setNotFound] = useState(false);

  /* live edit overrides — updated via postMessage from editor */
  const [liveTagline, setLiveTagline]           = useState<string | null>(null);
  const [liveDescription, setLiveDescription]   = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null);
  const [liveTrustItems, setLiveTrustItems]     = useState<{ icon: string; title: string; desc: string }[] | null>(null);
  const [livePolicyItems, setLivePolicyItems]   = useState<{ title: string; desc: string }[] | null>(null);
  const [liveLogoUrl, setLiveLogoUrl]           = useState<string | null>(null);
  const [liveHeroImage, setLiveHeroImage]       = useState<string | null>(null);
  const [liveHeroTitle, setLiveHeroTitle]       = useState<string | null>(null);
  const [liveTicker, setLiveTicker]             = useState<string[] | null>(null);
  const [liveCollOrder, setLiveCollOrder]       = useState<string[] | null>(null);
  const [hoveredSection, setHoveredSection]     = useState<string | null>(null);
  const [promoCountdown, setPromoCountdown]     = useState<{ code: string; type: string; value: number; applies_to: string; expires_at: string; timeLeft: string } | null>(() => buildInitialPromos(initialDiscountCodes).countdown);
  const [promoDiscounts, setPromoDiscounts]     = useState<{ code: string; type: string; value: number; applies_to: string; expires_at: string; product_ids: string[]; collection_names: string[]; timeLeft: string }[]>(() => buildInitialPromos(initialDiscountCodes).discounts);

  /* ui state */
  const [activeCategory, setActiveCategory] = useState("All");
  const [productSort, setProductSort] = useState("default");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<{ [k: string]: string }>({});
  const [localQty, setLocalQty] = useState(1);
  const [variantError, setVariantError] = useState(false);
  const [announceIdx, setAnnounceIdx] = useState(0);
  const [chatOpen, setChatOpen] = useState(false);
  const [megaOpen, setMegaOpen] = useState(false);

  /* cart */
  const [cart, setCart]       = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* checkout */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1=details 2=payment 3=success
  const [shippingCost, setShippingCost] = useState(80);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", suburb: "", city: "", province: "", postalCode: "",
    notes: "", paymentMethod: "card",
  });
  const [formErrors, setFormErrors] = useState<{ [k: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [orderRef, setOrderRef] = useState("");
  const [checkoutError, setCheckoutError] = useState("");

  /* nav scroll */
  const [scrolled, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  /* ─── LOAD ─── */
  useEffect(() => {
    if (initialSeller) {
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
      return;
    }
    (async () => {
      const { data: s } = await supabase
        .from("sellers").select("*").eq("subdomain", slug).single();
      if (!s) { setNotFound(true); setLoading(false); return; }
      setSeller(s);
      const { data: p } = await supabase
        .from("products").select("*")
        .eq("seller_id", s.id).eq("in_stock", true).eq("status", "published")
        .order("sort_order", { ascending: true });
      setProducts(p || []);
      const { data: dcs } = await supabase.from("discount_codes").select("*").eq("seller_id", s.id).eq("active", true).eq("show_countdown", true).not("expires_at", "is", null);
      if (dcs && dcs.length > 0) {
        const activePromos = dcs.filter((d: any) => new Date(d.expires_at) > new Date()).map((d: any) => ({
          code: d.code, type: d.type, value: d.value, applies_to: d.applies_to || "cart",
          expires_at: d.expires_at, product_ids: d.product_ids || [], collection_names: d.collection_names || [], timeLeft: ""
        }));
        setPromoDiscounts(activePromos);
        const storePromo = activePromos.find((d: any) => d.applies_to === "cart" || d.applies_to === "shipping");
        if (storePromo) setPromoCountdown({ code: storePromo.code, type: storePromo.type, value: storePromo.value, applies_to: storePromo.applies_to, expires_at: storePromo.expires_at, timeLeft: "" });
      }
      setLoading(false);
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
    })();
  }, [slug]);

  /* Promo countdown ticker */
  useEffect(() => {
    if (promoDiscounts.length === 0 && !promoCountdown?.expires_at) return;
    const tick = () => {
      const now = new Date().getTime();
      if (promoCountdown?.expires_at) {
        const diff = new Date(promoCountdown.expires_at).getTime() - now;
        if (diff <= 0) { setPromoCountdown(null); }
        else {
          const d = Math.floor(diff / 86400000); const h = Math.floor((diff % 86400000) / 3600000);
          const m = Math.floor((diff % 3600000) / 60000); const s = Math.floor((diff % 60000) / 1000);
          const tl = (d > 0 ? d + "d " : "") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0");
          setPromoCountdown((prev) => prev ? { ...prev, timeLeft: tl } : null);
        }
      }
      setPromoDiscounts((prev) => prev.map((p) => {
        const diff = new Date(p.expires_at).getTime() - now;
        if (diff <= 0) return { ...p, timeLeft: "EXPIRED" };
        const d = Math.floor(diff / 86400000); const h = Math.floor((diff % 86400000) / 3600000);
        const m = Math.floor((diff % 3600000) / 60000); const s = Math.floor((diff % 60000) / 1000);
        return { ...p, timeLeft: (d > 0 ? d + "d " : "") + String(h).padStart(2, "0") + ":" + String(m).padStart(2, "0") + ":" + String(s).padStart(2, "0") };
      }).filter((p) => p.timeLeft !== "EXPIRED"));
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [promoDiscounts.length, promoCountdown?.expires_at]);

  const getProductPromo = (productId: string) => promoDiscounts.find((d) => d.applies_to === "product" && d.product_ids?.includes(productId));
  const getCollectionPromo = (colName: string) => promoDiscounts.find((d) => d.applies_to === "collection" && d.collection_names?.includes(colName));

  /* Listen for live updates from the editor */
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "LIVE_UPDATE") return;
      if (e.data.tagline      !== undefined) setLiveTagline(e.data.tagline);
      if (e.data.description  !== undefined) setLiveDescription(e.data.description);
      if (e.data.announcement !== undefined) setLiveAnnouncement(e.data.announcement);
      if (e.data.trustItems   !== undefined) setLiveTrustItems(e.data.trustItems);
      if (e.data.policyItems  !== undefined) setLivePolicyItems(e.data.policyItems);
      if (e.data.logoUrl      !== undefined) setLiveLogoUrl(e.data.logoUrl);
      if (e.data.heroImage    !== undefined) setLiveHeroImage(e.data.heroImage);
      if (e.data.heroTitle    !== undefined) setLiveHeroTitle(e.data.heroTitle);
      if (e.data.ticker       !== undefined) setLiveTicker(e.data.ticker);
      if (e.data.collOrder    !== undefined) setLiveCollOrder(e.data.collOrder);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* Rotate the announcement bar messages */
  useEffect(() => {
    const t = setInterval(() => setAnnounceIdx((i) => i + 1), 3800);
    return () => clearInterval(t);
  }, []);

  /* lock body scroll when overlays open */
  useEffect(() => {
    document.body.style.overflow = (cartOpen || checkoutOpen || !!selectedProduct || mobileNavOpen || showSearch) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [cartOpen, checkoutOpen, selectedProduct, mobileNavOpen, showSearch]);

  /* ─── DERIVED ─── */
  const categories = ["All", ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filtered = (() => {
    let list = activeCategory === "All" ? [...products] : products.filter(p => pInCat(p, activeCategory));
    if (productSort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (productSort === "za") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (productSort === "price-low") list.sort((a, b) => a.price - b.price);
    else if (productSort === "price-high") list.sort((a, b) => b.price - a.price);
    return list;
  })();
  const searched = searchQuery.trim()
    ? products.filter(p => p.name.toLowerCase().includes(searchQuery.trim().toLowerCase()))
    : null;
  const subtotal = cart.reduce((s, i) => s + effectivePrice(i.product, i.selectedVariants) * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const lineDiscount = cart.reduce((sum, item) => {
    const productPromo = getProductPromo(item.product.id);
    const collectionPromo = item.product.category ? getCollectionPromo(item.product.category) : undefined;
    const promo = productPromo || collectionPromo;
    if (!promo) return sum;
    const lineTotal = effectivePrice(item.product, item.selectedVariants) * item.qty;
    const off = promo.type === "percentage" ? lineTotal * (promo.value / 100) : Math.min(promo.value, lineTotal);
    return sum + off;
  }, 0);
  const cartPromo = promoDiscounts.find((d) => d.applies_to === "cart");
  const afterLine = Math.max(0, subtotal - lineDiscount);
  const cartDiscount = cartPromo
    ? (cartPromo.type === "percentage" ? afterLine * (cartPromo.value / 100) : Math.min(cartPromo.value, afterLine))
    : 0;
  const shippingPromo = promoDiscounts.find((d) => d.applies_to === "shipping");
  const cartTotal = Math.max(0, afterLine - cartDiscount);
  const baseShipping = cartTotal >= FREE_SHIP ? 0 : shippingCost;
  const shippingDiscount = shippingPromo
    ? (shippingPromo.type === "percentage" ? baseShipping * (shippingPromo.value / 100) : Math.min(shippingPromo.value, baseShipping))
    : 0;
  const finalShipping = Math.max(0, baseShipping - shippingDiscount);
  const totalDiscount = lineDiscount + cartDiscount + shippingDiscount;
  const grandTotal = cartTotal + finalShipping;
  const freeShipRemaining = Math.max(0, FREE_SHIP - cartTotal);
  const freeShipPct = Math.min(100, (cartTotal / FREE_SHIP) * 100);

  /* ─── CART OPS ─── */
  const addToCart = (product: Product, qty: number, variants: { [k: string]: string }) => {
    setCart(prev => {
      const key = product.id + JSON.stringify(variants);
      const existing = prev.find(i => i.product.id + JSON.stringify(i.selectedVariants) === key);
      if (existing) return prev.map(i => i === existing ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { product, qty, selectedVariants: variants }];
    });
  };
  const removeFromCart = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));
  const changeQty = (idx: number, d: number) => setCart(prev =>
    prev.map((i, n) => n === idx ? { ...i, qty: Math.max(1, i.qty + d) } : i)
  );

  /* ─── PRODUCT ACTIONS ─── */
  const openProduct = (p: Product) => {
    setSelectedProduct(p);
    setActiveImg(0);
    setSelectedVariants({});
    setLocalQty(1);
    setVariantError(false);
  };
  useEffect(() => {
    if (initialProductId && products.length > 0 && !selectedProduct) {
      const p = products.find((pr) => pr.id === initialProductId);
      if (p) openProduct(p);
    }
  }, [initialProductId, products.length]);

  const handleAddToCart = () => {
    if (!selectedProduct) return;
    const validVariants = (selectedProduct.variants || []).filter(v => v.options?.length > 0);
    const allSelected = validVariants.every(v => selectedVariants[v.name]);
    if (!allSelected && validVariants.length > 0) { setVariantError(true); return; }
    addToCart(selectedProduct, localQty, selectedVariants);
    setSelectedProduct(null);
    setCartOpen(true);
  };

  /* ─── CHECKOUT ─── */
  const validateForm = () => {
    const errs: { [k: string]: string } = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim()) errs.lastName = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
    if (!/^0[6-8]\d{8}$/.test(form.phone.replace(/\s/g, ""))) errs.phone = "Valid SA number required";
    if (!form.address.trim()) errs.address = "Required";
    if (!form.city.trim()) errs.city = "Required";
    if (!form.province) errs.province = "Required";
    if (!/^\d{4}$/.test(form.postalCode)) errs.postalCode = "4-digit code required";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCheckout = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    setCheckoutError("");
    try {
      const ref = "ROSE-" + Math.floor(10000 + Math.random() * 90000);
      setOrderRef(ref);
      const items = cart.map(i => ({
        name: i.product.name,
        qty: i.qty,
        price: effectivePrice(i.product, i.selectedVariants),
        variants: i.selectedVariants,
      }));

      if (form.paymentMethod === "payfast") {
        const encoded = btoa(unescape(encodeURIComponent(JSON.stringify(
          cart.map((i) => ({
            id: i.product.id,
            name: i.product.name,
            price: effectivePrice(i.product, i.selectedVariants),
            qty: i.qty,
            variant: Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", "),
            image: i.product.image_url || "",
            selectedVariants: i.selectedVariants,
          }))
        ))));
        window.location.href = sp(`/checkout?cart=${encoded}`);
        return;
      }

      const { error: insertErr } = await supabase.from("orders").insert({
        seller_id: seller!.id,
        customer_name: `${form.firstName} ${form.lastName}`,
        customer_email: form.email,
        customer_phone: form.phone,
        delivery_address: `${form.address}, ${form.suburb}, ${form.city}, ${form.province}, ${form.postalCode}`,
        items,
        total: grandTotal,
        shipping_cost: finalShipping,
        payment_method: form.paymentMethod,
        notes: form.notes,
        status: "pending",
        order_ref: ref,
      });
      if (insertErr) throw insertErr;

      if (form.paymentMethod === "whatsapp") orderViaWhatsApp(ref);
      setCheckoutStep(3);
    } catch (e: any) {
      setCheckoutError(e?.message || "Could not place your order. Please try again or contact the store.");
    } finally {
      setSubmitting(false);
    }
  };

  const orderViaWhatsApp = (ref?: string, prefix?: string) => {
    if (!seller) return;
    const lines = cart.map(i => {
      const vars = Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `• ${i.product.name}${vars ? ` (${vars})` : ""} × ${i.qty} — ${fmt(effectivePrice(i.product, i.selectedVariants) * i.qty)}`;
    });
    const msg = [
      prefix || `Hi! I'd like to place an order with ${seller.store_name}:`,
      ...lines,
      totalDiscount > 0 ? `Discount: -${fmt(totalDiscount)}` : "",
      cart.length ? `Total: ${fmt(grandTotal)}` : "",
      ref ? `Reference: ${ref}` : "",
    ].filter(Boolean).join("\n");
    const num = (seller.whatsapp_number || "").replace(/\D/g, "");
    if (!num) return;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* ─── LOADING / NOT FOUND ─── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#fdf8f2", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 600, color: "#7a1330", marginBottom: 20 }}>Rosefields</div>
        <div style={{ width: 30, height: 30, border: "2px solid rgba(122,19,48,0.15)", borderTopColor: "#7a1330", borderRadius: "50%", animation: "spin 0.9s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", background: "#fdf8f2", display: "flex", alignItems: "center", justifyContent: "center", color: "#2b2320", fontFamily: "'Playfair Display', serif", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 64, fontWeight: 600, color: "#c9a961", opacity: 0.4, marginBottom: 16 }}>404</div>
        <div style={{ fontSize: 22, fontWeight: 500 }}>Store not found</div>
      </div>
    </div>
  );

  const storeInactive = seller && seller.subscription_status !== "active" && seller.subscription_status !== "free" && !(seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (storeInactive && !isEditMode) return (
    <div style={{ minHeight: "100vh", background: "#fdf8f2", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#2b2320", fontFamily: "'Playfair Display', serif", textAlign: "center", padding: "40px 24px" }}>
      {seller?.logo_url ? <img src={seller.logo_url} alt="" onError={hideOnError} style={{ height: 48, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontSize: 26, fontWeight: 600, color: "#7a1330", marginBottom: 32 }}>{seller?.store_name}</h2>}
      <h1 style={{ fontSize: 30, fontWeight: 600, marginBottom: 12 }}>Store Temporarily Unavailable</h1>
      <p style={{ fontFamily: "'DM Sans', sans-serif", fontSize: 15, color: "rgba(43,35,32,0.6)", maxWidth: 400, lineHeight: 1.6 }}>This store is currently inactive. Please check back soon or contact the seller directly.</p>
    </div>
  );

  const s = seller!;
  const config = effectiveStoreConfig(s) as StoreConfig;

  /* ─── PALETTE ─── */
  const burgundy = "#7a1330";
  const burgundyDeep = "#5c0e24";
  const burgundyLight = "#9c2c4a";
  const gold = "#c9a961";
  const goldDeep = "#b0854a";
  const cream = "#fdf8f2";
  const paper = "#faf5ee";
  const card = "#ffffff";
  const ink = "#2b2320";
  const inkMuted = "rgba(43,35,32,0.6)";
  const inkFaint = "rgba(43,35,32,0.38)";
  const border = "rgba(122,19,48,0.12)";

  const displayTagline    = liveTagline    ?? s.tagline;
  const displayDescription = liveDescription ?? s.description;
  const displayAnnouncement = liveAnnouncement ?? config.announcement;
  const displayLogoUrl    = liveLogoUrl    ?? s.logo_url;
  const displayHeroImage  = liveHeroImage  ?? config.hero_image ?? null;
  const displayHeroTitle  = liveHeroTitle  ?? config.hero_title ?? "";
  const rawCats           = categories.filter(c => c !== "All");
  const orderedCats       = liveCollOrder ? liveCollOrder.filter(c => rawCats.includes(c)).concat(rawCats.filter(c => !liveCollOrder!.includes(c))) : rawCats;

  const defaultTicker = [
    "Fresh Flowers Handcrafted Daily",
    `Same Day Delivery${config.physical_address ? " in " + config.physical_address.split(",")[0] : ""}`,
    "Order Before 2PM for Same-Day Dispatch",
  ];
  const displayTicker = (liveTicker && liveTicker.length ? liveTicker : (config.ticker_texts?.length ? config.ticker_texts : defaultTicker));

  const defaultTrustItems = [
    { icon: "flower", title: "Fresh Daily", desc: "Handpicked with care." },
    { icon: "truck", title: "Same-Day Delivery", desc: "Order before 12pm." },
    { icon: "shield", title: "Secure Payments", desc: "100% safe & secure." },
    { icon: "check", title: "Satisfaction Guarantee", desc: "We're here to help." },
  ];
  const activeTrustItems = liveTrustItems ?? (config.trust_items?.length ? config.trust_items : defaultTrustItems);

  const defaultPolicyItems = [
    { title: "Fresh Every Morning", desc: "Roses are cut and prepped fresh each day for maximum vase life." },
    { title: "Expertly Arranged", desc: "Arranged by professional florists trained in classic technique." },
    { title: "Same Day Delivery", desc: `Order before 2PM for same-day delivery. ${fmt(FREE_SHIP)}+ ships free.` },
    { title: "Custom Message", desc: "Add a personal, handwritten-style message card to any bouquet." },
  ];
  const activePolicyItems = livePolicyItems ?? (config.policy_items?.length ? config.policy_items : defaultPolicyItems);

  /* Edit mode: section wrapper */
  const EditSection = ({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) => {
    if (!isEditMode) return <>{children}</>;
    const isHovered = hoveredSection === id;
    return (
      <div
        onMouseEnter={() => setHoveredSection(id)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={(e) => { e.stopPropagation(); window.parent.postMessage({ type: "SECTION_CLICK", section: id }, "*"); }}
        style={{ position: "relative", outline: isHovered ? `2px solid ${gold}` : "2px solid transparent", outlineOffset: -2, cursor: "pointer", transition: "outline-color 0.2s", ...style }}
      >
        {isHovered && (
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", background: gold, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" as const, padding: "4px 12px", borderRadius: 100, zIndex: 9999, pointerEvents: "none" as const, whiteSpace: "nowrap" as const, boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
            Click to edit
          </div>
        )}
        {children}
      </div>
    );
  };

  const RoseIcon = ({ size = 22, color = burgundy }: { size?: number; color?: string }) => (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="9" r="4.2" />
      <path d="M8.4 6.4a4.2 4.2 0 0 1 7.2 0" />
      <path d="M9 12.5C7 14 6 16.5 6 19.5" />
      <path d="M15 12.5c2 1.5 3 4 3 7" />
      <path d="M12 13v8.5" />
    </svg>
  );

  const OccasionIcon = ({ id, size = 22 }: { id: string; size?: number }) => {
    const st = { width: size, height: size, stroke: burgundy, fill: "none", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    const icons: Record<string, React.ReactNode> = {
      ring: <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="15" r="6" /><path d="M9 9l3-6 3 6" /></svg>,
      ring2: <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="14" r="5.5" /><path d="M8.5 8.5 12 3l3.5 5.5" /><circle cx="12" cy="14" r="1.6" fill={burgundy} stroke="none" /></svg>,
      cake: <svg {...st} viewBox="0 0 24 24"><path d="M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8" /><path d="M2 21h20" /><path d="M7 11V7a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1V3" /><path d="M14 11V7a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1V3" /><path d="M4 16h16" /></svg>,
      hands: <svg {...st} viewBox="0 0 24 24"><path d="M11 12V4a1.5 1.5 0 0 1 3 0v7" /><path d="M14 11V3a1.5 1.5 0 0 1 3 0v9" /><path d="M17 12V6a1.5 1.5 0 0 1 3 0v9c0 4-3 7-7 7h-1c-3 0-5-1-7-3l-2.5-2.7a1.4 1.4 0 0 1 2-2L7 16" /><path d="M8 12V6a1.5 1.5 0 0 0-3 0v9" /></svg>,
      flower: <RoseIcon size={size} color={burgundy} />,
      petal: <svg {...st} viewBox="0 0 24 24"><path d="M12 3c3 3 3 8 0 11-3-3-3-8 0-11Z" /><path d="M4 12c3-3 8-3 11 0-3 3-8 3-11 0Z" /><path d="M20 12c-3 3-8 3-11 0 3-3 8-3 11 0Z" /><circle cx="12" cy="12" r="1.6" fill={burgundy} stroke="none" /></svg>,
    };
    return <>{icons[id] ?? <RoseIcon size={size} />}</>;
  };

  // Understands the full canonical icon set offered by the dashboard's Trust
  // Bar icon picker (app/dashboard/editor/page.tsx) -- that picker is shared
  // across every template, so any id a seller picks must render correctly
  // here too, not just the handful Rosefields introduced on its own.
  const TrustIcon = ({ id, size = 24, color = burgundy }: { id: string; size?: number; color?: string }) => {
    const st = { width: size, height: size, stroke: color, fill: "none", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
    const icons: Record<string, React.ReactNode> = {
      flower: <RoseIcon size={size} color={color} />,
      hands: <svg {...st} viewBox="0 0 24 24"><path d="M12 3c3 3 3 8 0 11-3-3-3-8 0-11Z" /><path d="M4 12c3-3 8-3 11 0-3 3-8 3-11 0Z" /><path d="M20 12c-3 3-8 3-11 0 3-3 8-3 11 0Z" /></svg>,
      note: <svg {...st} viewBox="0 0 24 24"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></svg>,
      shield: <svg {...st} viewBox="0 0 24 24"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z" /></svg>,
      star: <svg {...st} viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>,
      diamond: <svg {...st} viewBox="0 0 24 24"><path d="M6 3h12l4 6-10 13L2 9z" /><path d="M2 9h20" /><path d="M12 22V9" /><path d="M6 3l6 6 6-6" /></svg>,
      truck: <svg {...st} viewBox="0 0 24 24"><rect x="1" y="3" width="15" height="13" rx="1" /><path d="M16 8h4l3 5v4h-7V8z" /><circle cx="5.5" cy="18.5" r="2.5" /><circle cx="18.5" cy="18.5" r="2.5" /></svg>,
      package: <svg {...st} viewBox="0 0 24 24"><path d="M21 10V7a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 7v10a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 17v-3" /><polyline points="3.27 6.96 12 12.01 20.73 6.96" /><line x1="12" y1="22.08" x2="12" y2="12" /></svg>,
      refresh: <svg {...st} viewBox="0 0 24 24"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 102.13-9.36L1 10" /></svg>,
      lock: <svg {...st} viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2" /><path d="M7 11V7a5 5 0 0110 0v4" /></svg>,
      card: <svg {...st} viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></svg>,
      check: <svg {...st} viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg>,
      award: <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="8" r="6" /><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11" /></svg>,
      tag: <svg {...st} viewBox="0 0 24 24"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z" /><line x1="7" y1="7" x2="7.01" y2="7" /></svg>,
      globe: <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><line x1="2" y1="12" x2="22" y2="12" /><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" /></svg>,
      heart: <svg {...st} viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" /></svg>,
      clock: <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>,
      phone: <svg {...st} viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.04 4.72 2 2 0 012 2.5h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 10a16 16 0 006 6l.36-.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" /></svg>,
      map: <svg {...st} viewBox="0 0 24 24"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z" /><circle cx="12" cy="10" r="3" /></svg>,
    };
    return <>{icons[id] ?? <RoseIcon size={size} color={color} />}</>;
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400;1,500&family=DM+Sans:wght@300;400;500;600;700&family=Cormorant+Garamond:ital,wght@0,500;1,500&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{-webkit-font-smoothing:antialiased}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes chatPop{from{opacity:0;transform:translateY(16px) scale(0.96)}to{opacity:1;transform:translateY(0) scale(1)}}
        @keyframes petalFloat{0%,100%{transform:translateY(0) rotate(0deg)}50%{transform:translateY(-10px) rotate(8deg)}}
        .rf-fade{animation:fadeUp 0.6s ease forwards}
        .rf-prod-card{transition:box-shadow 0.35s ease, transform 0.35s ease}
        .rf-prod-card:hover{box-shadow:0 18px 40px rgba(122,19,48,0.12);transform:translateY(-3px)}
        .rf-prod-img img{transition:transform 0.7s cubic-bezier(0.16,1,0.3,1)}
        .rf-prod-card:hover .rf-prod-img img{transform:scale(1.06)}
        .rf-coll-card{transition:transform 0.4s ease}
        .rf-coll-card:hover{transform:translateY(-4px)}
        .rf-coll-card:hover .rf-coll-img img{transform:scale(1.08)}
        .rf-coll-img img{transition:transform 0.6s ease}
        .rf-btn-primary:hover{background:${burgundyDeep}!important}
        .rf-btn-outline:hover{background:${gold}!important;color:#fff!important;border-color:${gold}!important}
        .rf-cat-btn:hover{color:${burgundy}!important}
        .rf-cat-btn.active{color:${burgundy}!important;border-color:${burgundy}!important}
        .rf-occ:hover .rf-occ-circle{border-color:${burgundy}!important;background:rgba(122,19,48,0.06)!important}
        .rf-nav-link{position:relative}
        .rf-nav-link::after{content:"";position:absolute;left:0;right:0;bottom:-4px;height:1px;background:${burgundy};transform:scaleX(0);transition:transform 0.25s ease;transform-origin:left}
        .rf-nav-link:hover::after{transform:scaleX(1)}
        .rf-add-btn:hover{background:${burgundyDeep}!important}
        .rf-qty-btn:hover{background:rgba(122,19,48,0.06)!important}
        .rf-chat-fab:hover{transform:scale(1.06)}
        .rf-quick-reply:hover{background:${burgundy}!important;color:#fff!important}
        .rf-hero-frame{position:relative;width:100%;aspect-ratio:21/9;max-height:560px;min-height:380px;overflow:hidden;background:${paper}}
        .rf-hero-scrim{background:linear-gradient(100deg, rgba(253,248,242,0.96) 0%, rgba(253,248,242,0.86) 30%, rgba(253,248,242,0.25) 60%, transparent 78%)}
        @media(max-width:900px){
          .rf-hero-frame{aspect-ratio:4/5;max-height:620px;min-height:460px}
          .rf-hero-copy{padding:28px 24px!important}
          .rf-hero-trust-row{gap:10px!important;padding:28px 16px!important}
          .rf-coll-grid{grid-template-columns:1fr 1fr!important}
          .rf-coll-grid > *:nth-child(1){grid-column:span 2!important}
          .rf-prod-grid{grid-template-columns:1fr 1fr!important}
          .rf-nav-links{display:none!important}
          .rf-hamburger{display:flex!important}
          .rf-modal-grid{grid-template-columns:1fr!important}
          .rf-checkout-grid{grid-template-columns:1fr!important}
          .rf-trust-grid{grid-template-columns:1fr 1fr!important}
          .rf-footer-grid{grid-template-columns:1fr 1fr!important;gap:32px!important}
          .rf-occ-row{gap:20px!important}
        }
        @media(max-width:520px){
          .rf-coll-grid{grid-template-columns:1fr!important}
          .rf-coll-grid > *:nth-child(1){grid-column:span 1!important}
          .rf-prod-grid{grid-template-columns:1fr 1fr!important}
          .rf-trust-grid{grid-template-columns:1fr!important}
          .rf-footer-grid{grid-template-columns:1fr!important}
        }
        .rf-hamburger{display:none;flex-direction:column;gap:5px;background:none;border:none;cursor:pointer;padding:4px}
        .rf-hamburger span{display:block;width:22px;height:1.5px;background:${ink};transition:all 0.3s ease;transform-origin:center}
        .rf-hamburger.open span:nth-child(1){transform:translateY(6.5px) rotate(45deg)}
        .rf-hamburger.open span:nth-child(2){opacity:0}
        .rf-hamburger.open span:nth-child(3){transform:translateY(-6.5px) rotate(-45deg)}
        .rf-mobile-nav{position:fixed;inset:0;top:0;background:${cream};z-index:999;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:28px;opacity:0;pointer-events:none;transition:opacity 0.35s}
        .rf-mobile-nav.open{opacity:1;pointer-events:all}
        .rf-mobile-nav a,.rf-mobile-nav button{font-family:'Playfair Display',serif;font-size:26px;font-weight:500;color:${ink};background:none;border:none;cursor:pointer;text-decoration:none}
      `}</style>

      <div style={{ fontFamily: "'DM Sans', sans-serif", background: paper, color: ink, minHeight: "100vh", overflowX: "hidden" }}>

        {/* ── ANNOUNCEMENT BAR ── */}
        {config.show_announcement !== false && (
          <EditSection id="announcement">
            <div style={{ background: burgundy, color: "#fff", overflow: "hidden" }}>
              <div style={{ maxWidth: 1280, margin: "0 auto", padding: "9px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
                <RoseIcon size={11} color="rgba(255,255,255,0.75)" />
                <span key={announceIdx} className="rf-fade" style={{ fontSize: 11.5, letterSpacing: "0.03em", textAlign: "center" as const }}>
                  {displayAnnouncement || displayTicker[announceIdx % displayTicker.length]}
                </span>
              </div>
            </div>
          </EditSection>
        )}

        {/* ── PROMO COUNTDOWN ── */}
        {promoCountdown && promoCountdown.timeLeft && (
          <div style={{ background: "rgba(201,169,97,0.12)", borderBottom: `1px solid ${border}`, padding: "10px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 14, flexWrap: "wrap" as const }}>
            <span style={{ fontSize: 13, color: ink }}>
              Use code <strong style={{ color: burgundy, fontFamily: "monospace" }}>{promoCountdown.code}</strong> for {promoCountdown.type === "percentage" ? promoCountdown.value + "% off" : "R" + promoCountdown.value + " off"}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: burgundy, background: "#fff", padding: "3px 12px", borderRadius: 100, border: `1px solid ${border}` }}>{promoCountdown.timeLeft}</span>
          </div>
        )}

        {/* ── NAV ── */}
        <nav style={{ position: "sticky", top: 0, zIndex: 200, background: scrolled ? "rgba(253,248,242,0.94)" : cream, backdropFilter: "blur(14px)", borderBottom: `1px solid ${border}`, padding: "16px 40px", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "all 0.3s ease" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, cursor: isEditMode ? "pointer" : "default" }}
            onClick={isEditMode ? () => window.parent.postMessage({ type: "SECTION_CLICK", section: "logo" }, "*") : undefined}>
            {(displayLogoUrl)
              ? <img src={displayLogoUrl} alt={s.store_name} onError={hideOnError} style={{ height: 38, maxWidth: 150, objectFit: "contain" }} />
              : <>
                  <RoseIcon size={26} />
                  <div>
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 21, fontWeight: 700, color: burgundy, letterSpacing: "0.02em", lineHeight: 1 }}>{(s.store_name || "Rosefields").toUpperCase()}</div>
                    <div style={{ fontSize: 8.5, letterSpacing: "0.28em", color: gold, textTransform: "uppercase" as const }}>Fresh Flowers</div>
                  </div>
                </>
            }
          </div>

          <div className="rf-nav-links" style={{ display: "flex", alignItems: "center", gap: 34 }}>
            <button onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })} className="rf-nav-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", color: ink }}>Home</button>
            <div className="rf-nav-link" style={{ position: "relative" }} onMouseEnter={() => setMegaOpen(true)} onMouseLeave={() => setMegaOpen(false)}>
              <button onClick={() => document.getElementById("collections")?.scrollIntoView({ behavior: "smooth" })} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", color: ink, display: "flex", alignItems: "center", gap: 5 }}>
                Collections <span style={{ fontSize: 9 }}>▾</span>
              </button>
              {megaOpen && orderedCats.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", background: card, border: `1px solid ${border}`, borderRadius: 12, boxShadow: "0 20px 50px rgba(43,35,32,0.14)", padding: 14, display: "flex", flexDirection: "column" as const, minWidth: 200, marginTop: 14 }}>
                  {orderedCats.slice(0, 8).map((cat) => (
                    <button key={cat} onClick={() => { setActiveCategory(cat); setMegaOpen(false); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                      style={{ background: "none", border: "none", cursor: "pointer", textAlign: "left" as const, fontSize: 13, color: inkMuted, padding: "8px 10px", borderRadius: 8 }}>
                      {cat}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button onClick={() => document.getElementById("occasions")?.scrollIntoView({ behavior: "smooth" })} className="rf-nav-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", color: ink }}>Occasions</button>
            <button onClick={() => document.getElementById("about")?.scrollIntoView({ behavior: "smooth" })} className="rf-nav-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", color: ink }}>About Us</button>
            <button onClick={() => setChatOpen(true)} className="rf-nav-link" style={{ background: "none", border: "none", cursor: "pointer", fontSize: 12.5, fontWeight: 600, letterSpacing: "0.04em", color: ink }}>Contact</button>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <button onClick={() => setShowSearch(true)} aria-label="Search" style={{ background: "none", border: "none", color: ink, cursor: "pointer", display: "flex" }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            </button>
            <button onClick={() => setCartOpen(true)} aria-label="Cart" style={{ background: "none", border: "none", color: ink, cursor: "pointer", display: "flex", position: "relative" as const }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
              {cartCount > 0 && <span style={{ position: "absolute" as const, top: -8, right: -8, background: burgundy, color: "#fff", width: 17, height: 17, borderRadius: "50%", fontSize: 9.5, fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
            </button>
            <button className={`rf-hamburger${mobileNavOpen ? " open" : ""}`} onClick={() => setMobileNavOpen(o => !o)} aria-label="Menu"><span /><span /><span /></button>
          </div>
        </nav>

        {/* ── MOBILE NAV ── */}
        <div className={`rf-mobile-nav${mobileNavOpen ? " open" : ""}`} onClick={e => { if (e.target === e.currentTarget) setMobileNavOpen(false); }}>
          <button onClick={() => setMobileNavOpen(false)} style={{ position: "absolute" as const, top: 24, right: 24, background: "none", border: "none", cursor: "pointer", color: ink, fontSize: 22 }}>✕</button>
          <button onClick={() => { setMobileNavOpen(false); window.scrollTo({ top: 0, behavior: "smooth" }); }}>Home</button>
          <button onClick={() => { setMobileNavOpen(false); document.getElementById("collections")?.scrollIntoView({ behavior: "smooth" }); }}>Collections</button>
          <button onClick={() => { setMobileNavOpen(false); document.getElementById("occasions")?.scrollIntoView({ behavior: "smooth" }); }}>Occasions</button>
          <button onClick={() => { setMobileNavOpen(false); document.getElementById("about")?.scrollIntoView({ behavior: "smooth" }); }}>About Us</button>
          <button onClick={() => { setMobileNavOpen(false); setCartOpen(true); }} style={{ marginTop: 10, fontSize: 14, border: `1px solid ${burgundy}`, color: burgundy, padding: "12px 32px", borderRadius: 100 }}>Cart ({cartCount})</button>
        </div>

        {/* ── HERO ── */}
        <EditSection id="hero">
          <div className="rf-hero-frame">
            {displayHeroImage ? (
              <img src={displayHeroImage} alt="" onError={hideOnError} fetchPriority="high" style={{ position: "absolute" as const, inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
            ) : (
              <div style={{ position: "absolute" as const, inset: 0, background: `radial-gradient(circle at 70% 35%, rgba(201,169,97,0.22), transparent 60%), linear-gradient(150deg, #fbeef0, #f6e2e6)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <RoseIcon size={72} color="rgba(122,19,48,0.16)" />
              </div>
            )}
            <div className="rf-hero-scrim" style={{ position: "absolute" as const, inset: 0 }} />
            <div className="rf-hero-copy" style={{ position: "relative" as const, height: "100%", display: "flex", flexDirection: "column" as const, justifyContent: "center", maxWidth: 480, padding: "40px" }}>
              <h1 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(34px,5.4vw,62px)", fontWeight: 700, color: ink, lineHeight: 1.02, letterSpacing: "-0.01em", marginBottom: 6 }}>
                {displayHeroTitle || "Every Bouquet"}
              </h1>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic", fontWeight: 500, fontSize: "clamp(28px,4.6vw,50px)", color: burgundy, lineHeight: 1.05, marginBottom: 18 }}>
                {displayTagline || "Tells a Story"}
              </div>
              <div style={{ width: 46, height: 2, background: gold, marginBottom: 18 }} />
              <p style={{ fontSize: 14.5, lineHeight: 1.75, color: inkMuted, maxWidth: 380, marginBottom: 28 }}>
                {displayDescription || "Luxury roses handcrafted with love for life's most meaningful moments."}
              </p>
              <div className="rf-hero-btns" style={{ display: "flex", gap: 12, flexWrap: "wrap" as const }}>
                <button className="rf-btn-primary" onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 28px", background: burgundy, color: "#fff", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", cursor: "pointer", transition: "background 0.25s" }}>
                  Shop Roses <span>›</span>
                </button>
                <button className="rf-btn-outline" onClick={() => setChatOpen(true)}
                  style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "14px 24px", background: "rgba(253,248,242,0.6)", color: goldDeep, border: `1.5px solid ${gold}`, borderRadius: 100, fontSize: 12, fontWeight: 700, letterSpacing: "0.02em", cursor: "pointer", transition: "all 0.25s" }}>
                  Same Day Delivery <RoseIcon size={13} color="currentColor" />
                </button>
              </div>
            </div>
          </div>
        </EditSection>

        <EditSection id="trust">
          <div className="rf-hero-trust-row" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, maxWidth: 1100, margin: "0 auto", padding: "36px 24px" }}>
            {activeTrustItems.slice(0, 4).map((t, i) => (
              <div key={i} style={{ textAlign: "center" as const }}>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 10 }}><TrustIcon id={t.icon} size={26} /></div>
                <div style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.03em", textTransform: "uppercase" as const, color: ink, marginBottom: 3 }}>{t.title}</div>
                <div style={{ fontSize: 10.5, color: inkFaint }}>{t.desc.split(".")[0]}</div>
              </div>
            ))}
          </div>
        </EditSection>

        {/* ── COLLECTIONS ── */}
        {orderedCats.length > 0 && (
          <EditSection id="collections">
            <section id="collections" style={{ padding: "90px 40px 70px", maxWidth: 1400, margin: "0 auto" }}>
              <div style={{ textAlign: "center", marginBottom: 44 }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: gold, marginBottom: 12 }}>{config.coll_label || "Explore Our Collections"}</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,3.4vw,38px)", fontWeight: 600, color: ink }}>
                  {config.coll_subtitle || "Timeless roses for every emotion and every moment."}
                </h2>
              </div>
              <div className="rf-coll-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
                {orderedCats.slice(0, 5).map((cat, i) => {
                  const catImg = products.find(p => pInCat(p, cat))?.image_url;
                  return (
                    <div key={i} className="rf-coll-card" onClick={() => { setActiveCategory(cat); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                      style={{ cursor: "pointer", position: "relative", borderRadius: 18, overflow: "hidden", aspectRatio: i === 0 ? "16/10" : "4/3", gridColumn: i === 0 ? "span 1" : undefined }}>
                      <div className="rf-coll-img" style={{ position: "absolute" as const, inset: 0 }}>
                        {catImg ? (
                          <img src={catImg} alt={cat} onError={hideOnError} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ width: "100%", height: "100%", background: `linear-gradient(160deg, #f7e4e8, #f3d4da)` }} />
                        )}
                      </div>
                      <div style={{ position: "absolute" as const, inset: 0, background: "linear-gradient(0deg, rgba(30,10,16,0.62) 0%, rgba(30,10,16,0.05) 55%)" }} />
                      <div style={{ position: "absolute" as const, left: 20, bottom: 18, color: "#fff" }}>
                        <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, marginBottom: 2 }}>{cat.toUpperCase()}</div>
                        <div style={{ fontSize: 11.5, opacity: 0.85, marginBottom: 10 }}>{products.filter(p => pInCat(p, cat)).length} products</div>
                        <span style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: "0.06em", display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.14)", border: "1px solid rgba(255,255,255,0.4)", padding: "6px 14px", borderRadius: 100 }}>SHOP NOW ›</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </EditSection>
        )}

        {/* ── FEATURED PRODUCTS ── */}
        <section id="products" style={{ padding: "20px 40px 90px", maxWidth: 1400, margin: "0 auto" }}>
          <EditSection id="products">
            <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 16, marginBottom: 40 }}>
              <div style={{ textAlign: "center", width: "100%" }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: gold, marginBottom: 12 }}>{config.products_label || "Featured Bouquets"}</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,3.4vw,38px)", fontWeight: 600, color: ink }}>{config.products_heading || "Loved by our customers"}</h2>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, justifyContent: "center", marginBottom: 40 }}>
              {categories.map(cat => (
                <button key={cat} className={`rf-cat-btn${activeCategory === cat ? " active" : ""}`} onClick={() => setActiveCategory(cat)}
                  style={{ background: "none", border: `1px solid ${activeCategory === cat ? burgundy : border}`, color: activeCategory === cat ? burgundy : inkMuted, fontSize: 11.5, fontWeight: 600, letterSpacing: "0.03em", padding: "8px 18px", borderRadius: 100, cursor: "pointer", transition: "all 0.2s" }}>
                  {cat}
                </button>
              ))}
              <select value={productSort} onChange={(e) => setProductSort(e.target.value)}
                style={{ border: `1px solid ${border}`, color: inkMuted, fontSize: 11.5, borderRadius: 100, padding: "8px 16px", background: "none", cursor: "pointer", outline: "none" }}>
                <option value="default">Featured</option>
                <option value="az">A – Z</option>
                <option value="za">Z – A</option>
                <option value="price-low">Price ↑</option>
                <option value="price-high">Price ↓</option>
              </select>
            </div>
          </EditSection>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "70px 0", color: inkFaint }}>
              <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 24, fontWeight: 600, marginBottom: 10 }}>No bouquets yet</div>
              <div style={{ fontSize: 12 }}>Check back soon</div>
            </div>
          ) : (
            <div className="rf-prod-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 22 }}>
              {filtered.map((p, i) => {
                const imgs = [p.image_url, ...(p.images || [])].filter(Boolean);
                const discountPct = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : null;
                return (
                  <div key={p.id} className="rf-prod-card" onClick={() => openProduct(p)}
                    style={{ background: card, borderRadius: 16, overflow: "hidden", cursor: "pointer", border: `1px solid ${border}`, animation: `fadeUp 0.5s ease ${i * 0.04}s both` }}>
                    <div className="rf-prod-img" style={{ position: "relative" as const, aspectRatio: "1/1", background: paper, overflow: "hidden" }}>
                      {imgs[0] ? (
                        <img src={imgs[0]} alt={p.name} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }}
                          onError={(e) => { e.currentTarget.style.display = "none"; }} />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><RoseIcon size={36} color="rgba(122,19,48,0.15)" /></div>
                      )}
                      {discountPct && <div style={{ position: "absolute" as const, top: 12, left: 12, background: burgundy, color: "#fff", fontSize: 10, fontWeight: 700, padding: "4px 10px", borderRadius: 100 }}>−{discountPct}%</div>}
                      {i === 0 && !discountPct && <div style={{ position: "absolute" as const, top: 12, right: 12, background: gold, color: "#fff", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", padding: "4px 10px", borderRadius: 100 }}>BEST SELLER</div>}
                    </div>
                    <div style={{ padding: "16px 16px 18px" }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: ink, marginBottom: 3, lineHeight: 1.3 }}>{p.name}</div>
                      {p.category && <div style={{ fontSize: 10.5, color: inkFaint, marginBottom: 10 }}>{p.category}</div>}
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                          <span style={{ fontSize: 15.5, fontWeight: 700, color: burgundy }}>{fmt(p.price)}</span>
                          {p.old_price && <span style={{ fontSize: 11.5, color: inkFaint, textDecoration: "line-through" }}>{fmt(p.old_price)}</span>}
                        </div>
                        <button className="rf-add-btn" onClick={(e) => { e.stopPropagation(); openProduct(p); }}
                          style={{ background: burgundy, color: "#fff", border: "none", borderRadius: "50%", width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0, transition: "background 0.2s" }} aria-label="Add to cart">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" /><path d="M3 6h18" /><path d="M16 10a4 4 0 0 1-8 0" /></svg>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── SHOP BY OCCASION ── */}
        <EditSection id="occasions">
          <section id="occasions" style={{ padding: "20px 40px 90px", maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
            <div style={{ fontSize: 10.5, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: gold, marginBottom: 12 }}>Shop by Occasion</div>
            <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(24px,3vw,34px)", fontWeight: 600, color: ink, marginBottom: 44 }}>Flowers for every moment</h2>
            <div className="rf-occ-row" style={{ display: "flex", justifyContent: "center", gap: 40, flexWrap: "wrap" as const }}>
              {OCCASIONS.map((o) => (
                <div key={o.label} className="rf-occ" onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })} style={{ cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", gap: 12, width: 96 }}>
                  <div className="rf-occ-circle" style={{ width: 68, height: 68, borderRadius: "50%", border: `1.5px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.25s" }}>
                    <OccasionIcon id={o.icon} />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.04em", color: ink }}>{o.label.toUpperCase()}</span>
                </div>
              ))}
            </div>
          </section>
        </EditSection>

        {/* ── WHY CHOOSE US ── */}
        {config.show_trust_bar !== false && (
          <EditSection id="policies">
            <section style={{ position: "relative", padding: "90px 40px", overflow: "hidden" }}>
              <div style={{ position: "absolute" as const, inset: 0, background: displayHeroImage ? `linear-gradient(100deg, rgba(253,248,242,0.97) 0%, rgba(253,248,242,0.86) 55%, rgba(253,248,242,0.7) 100%), url(${displayHeroImage}) center/cover` : `linear-gradient(120deg, #fbeef0, #f6e2e6)` }} />
              <div style={{ position: "relative" as const, maxWidth: 1300, margin: "0 auto" }}>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(24px,3vw,34px)", fontWeight: 600, color: ink, textAlign: "center" as const, marginBottom: 48 }}>Why Choose {s.store_name || "Rosefields"}?</h2>
                <div className="rf-trust-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 32 }}>
                  {activePolicyItems.slice(0, 4).map((item, i) => (
                    <div key={i} style={{ textAlign: "center" as const }}>
                      <div style={{ width: 48, height: 48, borderRadius: "50%", background: card, border: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
                        <TrustIcon id={["flower", "hands", "truck", "note"][i] || "flower"} size={20} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: ink, marginBottom: 6 }}>{item.title}</div>
                      <div style={{ fontSize: 11.5, color: inkMuted, lineHeight: 1.6, maxWidth: 220, margin: "0 auto" }}>{item.desc}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </EditSection>
        )}

        {/* ── ABOUT ── */}
        {config.show_about !== false && (
          <EditSection id="about">
            <section id="about" style={{ background: card, padding: "90px 40px" }}>
              <div style={{ maxWidth: 680, margin: "0 auto", textAlign: "center" as const }}>
                <div style={{ fontSize: 10.5, letterSpacing: "0.28em", textTransform: "uppercase" as const, color: gold, marginBottom: 16 }}>Our Story</div>
                <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(26px,3.6vw,40px)", fontWeight: 600, color: ink, lineHeight: 1.15, marginBottom: 20 }}>
                  Every stem, chosen with care
                </h2>
                <p style={{ fontSize: 14.5, lineHeight: 2, color: inkMuted }}>
                  {displayDescription || `${s.store_name || "Rosefields"} handpicks fresh roses every morning and arranges each bouquet by hand — never mass-produced, always made to feel personal.`}
                </p>
              </div>
            </section>
          </EditSection>
        )}

        {/* ── FOOTER ── */}
        <EditSection id="footer">
          <footer style={{ background: "#2b0e18", color: "rgba(253,248,242,0.75)", padding: "64px 40px 28px" }}>
            <div className="rf-footer-grid" style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gridTemplateColumns: "1.6fr 1fr 1fr 1fr", gap: 40, marginBottom: 40 }}>
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 14 }}>
                  <RoseIcon size={22} color={gold} />
                  <span style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 700, color: cream }}>{(s.store_name || "Rosefields").toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 12.5, lineHeight: 1.9, maxWidth: 240, marginBottom: 16 }}>{displayTagline || "Luxury roses handcrafted with love."}</div>
                <div style={{ display: "flex", gap: 10 }}>
                  {s.social_links?.instagram && <a href={`https://instagram.com/${s.social_links.instagram}`} target="_blank" rel="noreferrer" aria-label="Instagram" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(253,248,242,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: cream, textDecoration: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="20" height="20" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" /></svg></a>}
                  {s.whatsapp_number && <a href={`https://wa.me/${s.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp" style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid rgba(253,248,242,0.25)", display: "flex", alignItems: "center", justifyContent: "center", color: cream, textDecoration: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.5 14.4c-.3-.1-1.8-.9-2-1-.3-.1-.5-.1-.7.1s-.7 1-.9 1.2-.4.2-.6.1a8 8 0 0 1-2.4-1.5 9 9 0 0 1-1.6-2c-.2-.3 0-.5.1-.6l.4-.5.3-.4v-.5C9.9 8.9 9.5 8 9.3 7.5c-.2-.5-.4-.4-.6-.4H8c-.2 0-.5.1-.8.4-.3.3-1 1-1 2.5s1 2.9 1.2 3.1c.1.2 2 3.2 5 4.4.7.3 1.3.5 1.7.6.7.2 1.4.2 1.9.1.6-.1 1.8-.7 2-1.4.2-.7.2-1.3.2-1.4-.1-.1-.3-.2-.6-.4M12 2a10 10 0 0 0-8.5 15.2L2 22l5-1.3A10 10 0 1 0 12 2Z" /></svg></a>}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: 16, fontWeight: 700 }}>Quick Links</div>
                {["Home", "Collections", "Occasions", "About Us"].map((l) => (
                  <button key={l} onClick={() => { const id = l === "Home" ? null : l.toLowerCase().replace(" us", ""); id ? document.getElementById(id)?.scrollIntoView({ behavior: "smooth" }) : window.scrollTo({ top: 0, behavior: "smooth" }); }}
                    style={{ display: "block", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "rgba(253,248,242,0.7)", padding: "5px 0" }}>{l}</button>
                ))}
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: 16, fontWeight: 700 }}>Help & Info</div>
                {activePolicyItems.slice(0, 2).map((p, i) => <div key={i} style={{ fontSize: 12.5, padding: "5px 0" }}>{p.title}</div>)}
                <button onClick={() => setChatOpen(true)} style={{ display: "block", background: "none", border: "none", cursor: "pointer", fontSize: 12.5, color: "rgba(253,248,242,0.7)", padding: "5px 0" }}>Contact Us</button>
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase" as const, color: gold, marginBottom: 16, fontWeight: 700 }}>Contact Us</div>
                {config.contact_phone && <div style={{ fontSize: 12.5, padding: "5px 0" }}>{config.contact_phone}</div>}
                {config.contact_email && <div style={{ fontSize: 12.5, padding: "5px 0" }}>{config.contact_email}</div>}
                {config.physical_address && <div style={{ fontSize: 12.5, padding: "5px 0", lineHeight: 1.6 }}>{config.physical_address}</div>}
                {config.operating_hours && <div style={{ fontSize: 12.5, padding: "5px 0" }}>{config.operating_hours}</div>}
              </div>
            </div>
            <div style={{ maxWidth: 1300, margin: "0 auto", paddingTop: 22, borderTop: "1px solid rgba(253,248,242,0.12)", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" as const, gap: 8 }}>
              <span style={{ fontSize: 11, color: "rgba(253,248,242,0.45)" }}>© {new Date().getFullYear()} {s.store_name}. All Rights Reserved.</span>
              <a href="https://catalogstore.co.za" target="_blank" rel="noreferrer" style={{ fontSize: 11, color: gold, textDecoration: "none" }}>Powered by CatalogStore</a>
            </div>
          </footer>
        </EditSection>

        {/* ── SEARCH OVERLAY ── */}
        {showSearch && (
          <>
            <div onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ position: "fixed" as const, inset: 0, background: "rgba(43,14,24,0.4)", backdropFilter: "blur(6px)", zIndex: 700 }} />
            <div style={{ position: "fixed" as const, top: 0, left: 0, right: 0, zIndex: 701, padding: "0 40px", maxWidth: 680, margin: "0 auto" }}>
              <div style={{ display: "flex", alignItems: "center", height: 84, gap: 14, background: card, borderRadius: "0 0 16px 16px", padding: "0 20px" }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={burgundy} strokeWidth="1.6"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                <input autoFocus type="text" placeholder="Search bouquets..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); } }}
                  style={{ flex: 1, padding: "14px 0", background: "none", border: "none", fontSize: 18, color: ink, outline: "none" }} />
                <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ background: "none", border: "none", color: inkFaint, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>
              {searched && (
                <div style={{ background: card, borderRadius: "0 0 16px 16px", paddingBottom: 16, maxHeight: "60vh", overflowY: "auto" as const }}>
                  {searched.length === 0 ? (
                    <div style={{ padding: "20px", color: inkFaint, fontSize: 13 }}>No bouquets match "{searchQuery}".</div>
                  ) : searched.slice(0, 8).map((p) => (
                    <div key={p.id} onClick={() => { openProduct(p); setShowSearch(false); setSearchQuery(""); }} style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 20px", cursor: "pointer" }}>
                      {p.image_url ? <img src={p.image_url} alt="" onError={hideOnError} style={{ width: 46, height: 46, borderRadius: 10, objectFit: "cover" as const }} /> : <div style={{ width: 46, height: 46, borderRadius: 10, background: paper }} />}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{p.name}</div>
                        {p.category && <div style={{ fontSize: 10.5, color: inkFaint }}>{p.category}</div>}
                      </div>
                      <div style={{ fontSize: 14, fontWeight: 700, color: burgundy }}>{fmt(p.price)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* ── CUSTOMER CHAT WIDGET ── */}
        <div style={{ position: "fixed" as const, bottom: 26, right: 26, zIndex: 300, display: "flex", flexDirection: "column" as const, alignItems: "flex-end", gap: 14 }}>
          {chatOpen && (
            <div style={{ width: 300, maxWidth: "80vw", background: card, borderRadius: 20, boxShadow: "0 20px 60px rgba(43,14,24,0.25)", overflow: "hidden", animation: "chatPop 0.25s ease" }}>
              <div style={{ background: burgundy, color: "#fff", padding: "16px 18px" }}>
                <div style={{ fontSize: 14.5, fontWeight: 700, marginBottom: 2 }}>Hi there! 👋</div>
                <div style={{ fontSize: 12, opacity: 0.85 }}>Looking for the perfect bouquet? We're online and happy to help.</div>
              </div>
              <div style={{ padding: 14, display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {[
                  "I need flowers today",
                  "Show me red bouquets",
                  "Do you deliver today?",
                  "Delivery pricing",
                  "Track my order",
                ].map((q) => (
                  <button key={q} className="rf-quick-reply" onClick={() => orderViaWhatsApp(undefined, q)}
                    style={{ textAlign: "left" as const, background: paper, border: `1px solid ${border}`, borderRadius: 100, padding: "9px 16px", fontSize: 12.5, color: ink, cursor: "pointer", transition: "all 0.2s" }}>
                    {q}
                  </button>
                ))}
              </div>
              <div style={{ padding: "0 14px 14px" }}>
                <div style={{ display: "flex", gap: 8 }}>
                  <input type="text" placeholder="Type your message..." onKeyDown={(e) => { if (e.key === "Enter" && e.currentTarget.value.trim()) { orderViaWhatsApp(undefined, e.currentTarget.value.trim()); e.currentTarget.value = ""; } }}
                    style={{ flex: 1, border: `1px solid ${border}`, borderRadius: 100, padding: "10px 14px", fontSize: 12.5, outline: "none" }} />
                  <button onClick={() => setChatOpen(false)} aria-label="Close" style={{ width: 36, height: 36, borderRadius: "50%", background: burgundy, color: "#fff", border: "none", cursor: "pointer", flexShrink: 0 }}>✕</button>
                </div>
              </div>
            </div>
          )}
          <button className="rf-chat-fab" onClick={() => setChatOpen((v) => !v)} aria-label="Chat with us"
            style={{ width: 54, height: 54, borderRadius: "50%", background: burgundy, color: "#fff", border: "none", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 24px rgba(122,19,48,0.35)", transition: "transform 0.25s" }}>
            {chatOpen ? <span style={{ fontSize: 20 }}>✕</span> : <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" /></svg>}
          </button>
        </div>

        {/* ════════════════════════════════════
            PRODUCT MODAL
        ════════════════════════════════════ */}
        {selectedProduct && (() => {
          const p = selectedProduct;
          const imgs = [p.image_url, ...(p.images || [])].filter(Boolean);
          return (
            <>
              <div onClick={() => setSelectedProduct(null)} style={{ position: "fixed" as const, inset: 0, background: "rgba(43,14,24,0.45)", backdropFilter: "blur(6px)", zIndex: 400 }} />
              <div className="rf-modal-grid" style={{ position: "fixed" as const, top: "4vh", left: "6vw", right: "6vw", bottom: "4vh", background: card, borderRadius: 24, zIndex: 401, display: "grid", gridTemplateColumns: "1fr 1fr", overflow: "hidden", animation: "fadeUp 0.35s ease" }}>
                <div style={{ position: "relative" as const, overflow: "hidden", background: paper }}>
                  {imgs[activeImg] ? <img src={imgs[activeImg]} alt={p.name} onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}><RoseIcon size={48} color="rgba(122,19,48,0.15)" /></div>}
                  {imgs.length > 1 && (
                    <div style={{ position: "absolute" as const, bottom: 16, left: 16, display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {imgs.map((img, i) => (
                        <div key={i} onClick={e => { e.stopPropagation(); setActiveImg(i); }} style={{ width: 48, height: 56, borderRadius: 8, overflow: "hidden", cursor: "pointer", border: `2px solid ${i === activeImg ? gold : "transparent"}` }}>
                          <img src={img} alt="" onError={hideOnError} loading="lazy" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {p.category && <div style={{ position: "absolute" as const, top: 16, left: 16, background: burgundy, color: "#fff", fontSize: 10, letterSpacing: "0.06em", padding: "5px 14px", borderRadius: 100 }}>{p.category}</div>}
                </div>
                <div style={{ padding: 40, display: "flex", flexDirection: "column" as const, overflowY: "auto" as const }}>
                  <button onClick={() => setSelectedProduct(null)} style={{ alignSelf: "flex-end", background: "none", border: "none", color: inkFaint, cursor: "pointer", fontSize: 20, marginBottom: 16 }}>✕</button>
                  <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: "clamp(24px,3vw,34px)", fontWeight: 700, color: ink, lineHeight: 1.1, marginBottom: 10 }}>{p.name}</h2>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 24, fontWeight: 700, color: burgundy }}>{fmt(effectivePrice(p, selectedVariants))}</span>
                    {p.old_price && <span style={{ fontSize: 14, color: inkFaint, textDecoration: "line-through" }}>{fmt(p.old_price)}</span>}
                  </div>
                  {p.description && <p style={{ fontSize: 13.5, lineHeight: 1.9, color: inkMuted, marginBottom: 24, paddingBottom: 24, borderBottom: `1px solid ${border}` }}>{p.description}</p>}

                  {(p.variants || []).filter(v => v.options?.length > 0).map(v => (
                    <div key={v.name} style={{ marginBottom: 22 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: inkMuted, marginBottom: 10, display: "flex", justifyContent: "space-between" }}>
                        <span>{v.name}</span>{selectedVariants[v.name] && <span style={{ color: burgundy }}>{selectedVariants[v.name]}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                        {v.options.map(opt => (
                          <button key={opt} onClick={() => { setSelectedVariants(prev => ({ ...prev, [v.name]: opt })); setVariantError(false); }}
                            style={{ padding: "9px 16px", borderRadius: 100, background: selectedVariants[v.name] === opt ? burgundy : "none", border: `1.5px solid ${selectedVariants[v.name] === opt ? burgundy : border}`, color: selectedVariants[v.name] === opt ? "#fff" : ink, fontSize: 12.5, cursor: "pointer", transition: "all 0.2s" }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                      {variantError && !selectedVariants[v.name] && <div style={{ fontSize: 10.5, color: "#b3261e", marginTop: 8 }}>Please select a {v.name.toLowerCase()}</div>}
                    </div>
                  ))}

                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: inkMuted, marginBottom: 10 }}>Quantity</div>
                    <div style={{ display: "flex", alignItems: "center", border: `1.5px solid ${border}`, borderRadius: 100, width: "fit-content" }}>
                      <button className="rf-qty-btn" onClick={() => setLocalQty(q => Math.max(1, q - 1))} style={{ width: 38, height: 38, background: "none", border: "none", fontSize: 17, cursor: "pointer", borderRadius: "50%" }}>−</button>
                      <span style={{ width: 40, textAlign: "center" as const, fontSize: 15, fontWeight: 600 }}>{localQty}</span>
                      <button className="rf-qty-btn" onClick={() => setLocalQty(q => q + 1)} style={{ width: 38, height: 38, background: "none", border: "none", fontSize: 17, cursor: "pointer", borderRadius: "50%" }}>+</button>
                    </div>
                  </div>

                  <button className="rf-add-btn" onClick={handleAddToCart} style={{ width: "100%", padding: 17, background: burgundy, color: "#fff", border: "none", borderRadius: 100, fontSize: 13, fontWeight: 700, letterSpacing: "0.03em", cursor: "pointer", marginBottom: 10, transition: "background 0.25s" }}>Add to Cart</button>
                  <button onClick={() => {
                    const vv = (p.variants || []).filter((v) => v.options?.length > 0);
                    const allSelected = vv.every((v) => selectedVariants[v.name]);
                    if (!allSelected && vv.length > 0) { setVariantError(true); return; }
                    addToCart(p, localQty, selectedVariants);
                    setSelectedProduct(null); setCartOpen(false); setCheckoutOpen(true);
                  }} style={{ width: "100%", padding: 15, background: "none", color: ink, border: `1.5px solid ${border}`, borderRadius: 100, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Buy Now</button>

                  <div style={{ marginTop: 22, paddingTop: 22, borderTop: `1px solid ${border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[["check", "Freshness Checked"], ["truck", "Same-Day Dispatch"], ["hands", "Hand Arranged"], ["lock", "Secure Checkout"]].map(([icon, text]) => (
                      <div key={text} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <TrustIcon id={icon} size={15} />
                        <span style={{ fontSize: 10.5, color: inkMuted }}>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ════════════════════════════════════
            CART DRAWER
        ════════════════════════════════════ */}
        {cartOpen && (
          <>
            <div onClick={() => setCartOpen(false)} style={{ position: "fixed" as const, inset: 0, background: "rgba(43,14,24,0.4)", backdropFilter: "blur(4px)", zIndex: 500 }} />
            <div style={{ position: "fixed" as const, top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100vw", background: card, zIndex: 501, display: "flex", flexDirection: "column" as const, animation: "slideIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}>
              <div style={{ padding: "22px 28px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 20, fontWeight: 700, color: ink }}>Your Cart</div>
                <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", color: inkFaint, cursor: "pointer", fontSize: 18 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto" as const, padding: "12px 28px" }}>
                {cart.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", height: "100%", gap: 12, textAlign: "center" as const }}>
                    <RoseIcon size={38} color="rgba(122,19,48,0.18)" />
                    <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 18, fontWeight: 600, color: inkFaint }}>Your cart is empty</div>
                    <button onClick={() => setCartOpen(false)} style={{ marginTop: 10, padding: "11px 26px", background: "none", border: `1.5px solid ${border}`, borderRadius: 100, color: burgundy, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Continue Shopping</button>
                  </div>
                ) : cart.map((item, idx) => {
                  const varText = Object.entries(item.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ");
                  const img = [item.product.image_url, ...(item.product.images || [])].filter(Boolean)[0];
                  return (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "60px 1fr auto", gap: 14, alignItems: "center", padding: "14px 0", borderBottom: `1px solid ${border}` }}>
                      <div style={{ width: 60, height: 60, borderRadius: 12, overflow: "hidden", background: paper, flexShrink: 0 }}>
                        {img ? <img src={img} alt="" onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
                      </div>
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: ink, marginBottom: 3 }}>{item.product.name}</div>
                        {varText && <div style={{ fontSize: 10, color: inkFaint, marginBottom: 8 }}>{varText}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button onClick={() => changeQty(idx, -1)} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${border}`, background: "none", cursor: "pointer", fontSize: 13 }}>−</button>
                          <span style={{ fontSize: 12.5, minWidth: 14, textAlign: "center" as const }}>{item.qty}</span>
                          <button onClick={() => changeQty(idx, 1)} style={{ width: 22, height: 22, borderRadius: "50%", border: `1px solid ${border}`, background: "none", cursor: "pointer", fontSize: 13 }}>+</button>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" as const }}>
                        <div style={{ fontSize: 14, fontWeight: 700, color: burgundy, marginBottom: 4 }}>{fmt(effectivePrice(item.product, item.selectedVariants) * item.qty)}</div>
                        <button onClick={() => removeFromCart(idx)} style={{ fontSize: 10, color: inkFaint, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>
              {cart.length > 0 && (
                <div style={{ padding: "18px 28px", borderTop: `1px solid ${border}` }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 11, color: inkMuted, marginBottom: 7 }}>
                      {freeShipRemaining === 0 ? "Free shipping unlocked!" : <>Add <strong style={{ color: burgundy }}>{fmt(freeShipRemaining)}</strong> for free delivery</>}
                    </div>
                    <div style={{ height: 4, background: border, borderRadius: 100 }}><div style={{ height: "100%", width: `${freeShipPct}%`, background: gold, borderRadius: 100, transition: "width 0.4s" }} /></div>
                  </div>
                  {totalDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8, fontSize: 12.5 }}><span style={{ color: burgundy, fontWeight: 600 }}>Discount</span><span style={{ color: burgundy }}>−{fmt(totalDiscount)}</span></div>}
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}><span style={{ fontSize: 12, color: inkMuted, fontWeight: 600 }}>Subtotal</span><span style={{ fontSize: 20, fontWeight: 700, color: ink }}>{fmt(cartTotal)}</span></div>
                  <button className="rf-add-btn" onClick={() => { setCartOpen(false); setCheckoutOpen(true); setCheckoutStep(1); }} style={{ width: "100%", padding: 16, background: burgundy, color: "#fff", border: "none", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 10 }}>Checkout →</button>
                  <button onClick={() => orderViaWhatsApp()} style={{ width: "100%", padding: 13, background: "none", color: ink, border: `1.5px solid ${border}`, borderRadius: 100, fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
                    Order via WhatsApp
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════════════════════════════
            CHECKOUT OVERLAY
        ════════════════════════════════════ */}
        {checkoutOpen && (
          <>
            <div onClick={() => { if (checkoutStep < 3) setCheckoutOpen(false); }} style={{ position: "fixed" as const, inset: 0, background: "rgba(43,14,24,0.5)", backdropFilter: "blur(8px)", zIndex: 600 }} />
            <div style={{ position: "fixed" as const, top: 0, right: 0, bottom: 0, width: "min(640px, 100vw)", background: card, zIndex: 601, display: "flex", flexDirection: "column" as const, animation: "slideIn 0.35s cubic-bezier(0.16,1,0.3,1)" }}>
              <div style={{ padding: "20px 28px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Playfair Display', serif", fontSize: 19, fontWeight: 700, color: ink }}>{checkoutStep === 3 ? "Order Confirmed" : "Checkout"}</div>
                {checkoutStep < 3 && <button onClick={() => setCheckoutOpen(false)} style={{ background: "none", border: "none", color: inkFaint, cursor: "pointer", fontSize: 18 }}>✕</button>}
              </div>

              {checkoutStep < 3 && (
                <div style={{ padding: "14px 28px", display: "flex", alignItems: "center", borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
                  {["Details", "Payment", "Confirm"].map((step, i) => (
                    <div key={step} style={{ display: "contents" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 22, height: 22, borderRadius: "50%", border: `1.5px solid ${checkoutStep > i + 1 ? burgundy : checkoutStep === i + 1 ? ink : border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: checkoutStep > i + 1 ? burgundy : checkoutStep === i + 1 ? ink : inkFaint, background: checkoutStep > i + 1 ? "rgba(122,19,48,0.08)" : "none" }}>{checkoutStep > i + 1 ? "✓" : i + 1}</div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: checkoutStep === i + 1 ? ink : inkFaint }}>{step}</span>
                      </div>
                      {i < 2 && <div style={{ flex: 1, height: 1, background: checkoutStep > i + 1 ? burgundy : border, margin: "0 12px" }} />}
                    </div>
                  ))}
                </div>
              )}

              <div style={{ flex: 1, overflowY: "auto" as const, padding: "24px 28px" }}>
                {checkoutStep === 1 && (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 15 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: burgundy, marginBottom: 4 }}>Contact & Delivery</div>
                    {[
                      { label: "First Name *", key: "firstName", placeholder: "Your first name" },
                      { label: "Last Name *", key: "lastName", placeholder: "Your last name" },
                      { label: "Email Address *", key: "email", placeholder: "your@email.com", type: "email" },
                      { label: "Phone Number *", key: "phone", placeholder: "0XX XXX XXXX", type: "tel" },
                      { label: "Street Address *", key: "address", placeholder: "123 Main Street" },
                      { label: "Suburb", key: "suburb", placeholder: "Suburb" },
                      { label: "City *", key: "city", placeholder: "City" },
                      { label: "Postal Code *", key: "postalCode", placeholder: "0000" },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={{ fontSize: 10.5, fontWeight: 600, color: formErrors[field.key] ? "#b3261e" : inkMuted, display: "block", marginBottom: 6 }}>{field.label}</label>
                        <input type={field.type || "text"} value={(form as any)[field.key]} placeholder={field.placeholder}
                          onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                          style={{ width: "100%", background: paper, border: `1.5px solid ${formErrors[field.key] ? "#b3261e" : border}`, color: ink, fontSize: 13.5, padding: "11px 14px", outline: "none", borderRadius: 10 }} />
                        {formErrors[field.key] && <div style={{ fontSize: 10.5, color: "#b3261e", marginTop: 4 }}>{formErrors[field.key]}</div>}
                      </div>
                    ))}
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 600, color: formErrors.province ? "#b3261e" : inkMuted, display: "block", marginBottom: 6 }}>Province *</label>
                      <select value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                        style={{ width: "100%", background: paper, border: `1.5px solid ${formErrors.province ? "#b3261e" : border}`, color: ink, fontSize: 13.5, padding: "11px 14px", outline: "none", borderRadius: 10 }}>
                        <option value="">Select province</option>
                        {["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Mpumalanga", "North West", "Free State", "Northern Cape"].map(pr => <option key={pr} value={pr}>{pr}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 10.5, fontWeight: 600, color: inkMuted, marginBottom: 10 }}>Shipping Method</div>
                      {[{ label: "Standard Delivery", eta: "3–5 business days", price: 80 }, { label: "Express / Same-Day", eta: "Order before 2PM", price: 150 }].map(opt => (
                        <div key={opt.label} onClick={() => setShippingCost(cartTotal >= FREE_SHIP ? 0 : opt.price)}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1.5px solid ${shippingCost === opt.price || cartTotal >= FREE_SHIP ? burgundy : border}`, padding: "13px 16px", marginBottom: 8, borderRadius: 12, cursor: "pointer", background: shippingCost === opt.price ? "rgba(122,19,48,0.04)" : "none" }}>
                          <div><div style={{ fontSize: 13, color: ink }}>{opt.label}</div><div style={{ fontSize: 10.5, color: inkFaint }}>{opt.eta}</div></div>
                          <div style={{ fontSize: 15, fontWeight: 700, color: cartTotal >= FREE_SHIP ? "#2f8f4e" : burgundy }}>{cartTotal >= FREE_SHIP ? "Free" : fmt(opt.price)}</div>
                        </div>
                      ))}
                    </div>
                    <div>
                      <label style={{ fontSize: 10.5, fontWeight: 600, color: inkMuted, display: "block", marginBottom: 6 }}>Gift Message / Notes (optional)</label>
                      <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="e.g. Happy Anniversary, love always..."
                        style={{ width: "100%", background: paper, border: `1.5px solid ${border}`, color: ink, fontSize: 13, padding: "11px 14px", outline: "none", resize: "vertical" as const, borderRadius: 10, lineHeight: 1.6 }} />
                    </div>
                    <button className="rf-add-btn" onClick={() => { if (validateForm()) setCheckoutStep(2); }} style={{ width: "100%", padding: 16, background: burgundy, color: "#fff", border: "none", borderRadius: 100, fontSize: 13, fontWeight: 700, cursor: "pointer", marginTop: 6 }}>Continue to Payment →</button>
                  </div>
                )}

                {checkoutStep === 2 && (
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 18 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: burgundy }}>Payment Method</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[{ key: "payfast", label: "Card (PayFast)" }, { key: "whatsapp", label: "WhatsApp Order" }, { key: "eft", label: "EFT" }].map(pm => (
                        <button key={pm.key} onClick={() => setForm(f => ({ ...f, paymentMethod: pm.key }))}
                          style={{ flex: 1, padding: "11px 6px", background: form.paymentMethod === pm.key ? "rgba(122,19,48,0.06)" : "none", border: `1.5px solid ${form.paymentMethod === pm.key ? burgundy : border}`, color: form.paymentMethod === pm.key ? burgundy : inkMuted, borderRadius: 12, fontSize: 11, fontWeight: 600, cursor: "pointer", textAlign: "center" as const }}>
                          {pm.label}
                        </button>
                      ))}
                    </div>

                    {form.paymentMethod === "payfast" && (
                      <div style={{ background: paper, border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
                        <div style={{ fontSize: 12, color: inkMuted, lineHeight: 1.8 }}>You'll be securely redirected to PayFast to complete your card payment. All major SA cards accepted.</div>
                      </div>
                    )}
                    {form.paymentMethod === "whatsapp" && (
                      <div style={{ background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.2)", borderRadius: 12, padding: 18 }}>
                        <div style={{ fontSize: 12, color: inkMuted, lineHeight: 1.8 }}>Your order will be sent to {s.store_name} via WhatsApp. Payment arrangements will be made directly with the florist.</div>
                      </div>
                    )}
                    {form.paymentMethod === "eft" && (() => {
                      const cc = s.checkout_config || {};
                      const eftRows = [["Bank", cc.eft_bank_name], ["Account Name", cc.eft_account_name || s.store_name], ["Account Number", cc.eft_account_number], ["Branch Code", cc.eft_branch_code]].filter(([, v]) => !!v);
                      return (
                        <div style={{ background: paper, border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
                          {cc.eft_account_number ? (
                            <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                              {eftRows.map(([k, v]) => <div key={k as string} style={{ display: "flex", justifyContent: "space-between" }}><span style={{ fontSize: 11, color: inkFaint }}>{k}</span><span style={{ fontSize: 13, fontWeight: 600, color: ink }}>{v}</span></div>)}
                            </div>
                          ) : <div style={{ fontSize: 12, color: inkMuted, lineHeight: 1.8 }}>EFT details will be sent to you after you place this order.</div>}
                        </div>
                      );
                    })()}

                    <div style={{ background: paper, border: `1px solid ${border}`, borderRadius: 12, padding: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: burgundy, marginBottom: 14 }}>Order Summary</div>
                      {cart.map((item, i) => {
                        const varText = Object.values(item.selectedVariants).join(", ");
                        return <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 9, fontSize: 12.5 }}><span style={{ color: inkMuted }}>{item.product.name} {varText && `(${varText})`} × {item.qty}</span><span style={{ color: ink }}>{fmt(effectivePrice(item.product, item.selectedVariants) * item.qty)}</span></div>;
                      })}
                      <div style={{ borderTop: `1px solid ${border}`, marginTop: 10, paddingTop: 10 }}>
                        {totalDiscount > 0 && <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}><span style={{ color: burgundy }}>Discount</span><span style={{ color: burgundy }}>−{fmt(totalDiscount)}</span></div>}
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6, fontSize: 12.5 }}><span style={{ color: inkMuted }}>Shipping</span><span style={{ color: finalShipping === 0 ? "#2f8f4e" : ink }}>{finalShipping === 0 ? "Free" : fmt(finalShipping)}</span></div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}><span style={{ fontSize: 12.5, fontWeight: 700, color: ink }}>Total</span><span style={{ fontSize: 20, fontWeight: 700, color: burgundy }}>{fmt(grandTotal)}</span></div>
                      </div>
                    </div>

                    {checkoutError && <div style={{ background: "rgba(179,38,30,0.06)", border: "1px solid rgba(179,38,30,0.25)", borderRadius: 12, padding: "12px 16px", color: "#b3261e", fontSize: 12, lineHeight: 1.6 }}>{checkoutError}</div>}

                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setCheckoutStep(1)} style={{ flex: 1, padding: 14, background: "none", color: inkMuted, border: `1.5px solid ${border}`, borderRadius: 100, fontSize: 11, fontWeight: 600, cursor: "pointer" }}>← Back</button>
                      <button className="rf-add-btn" onClick={handleCheckout} disabled={submitting}
                        style={{ flex: 2, padding: 16, background: burgundy, color: "#fff", border: "none", borderRadius: 100, fontSize: 12.5, fontWeight: 700, cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1 }}>
                        {submitting ? "Processing..." : form.paymentMethod === "whatsapp" ? "Send WhatsApp Order" : form.paymentMethod === "payfast" ? "Pay with PayFast →" : "Place EFT Order →"}
                      </button>
                    </div>
                  </div>
                )}

                {checkoutStep === 3 && (
                  <div style={{ display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", minHeight: 380, textAlign: "center" as const, gap: 14, animation: "fadeUp 0.5s ease" }}>
                    <div style={{ width: 60, height: 60, borderRadius: "50%", border: "2px solid rgba(47,143,78,0.3)", background: "rgba(47,143,78,0.08)", color: "#2f8f4e", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22 }}>✓</div>
                    <h2 style={{ fontFamily: "'Playfair Display', serif", fontSize: 30, fontWeight: 700, color: ink }}>Order confirmed</h2>
                    <p style={{ fontSize: 13, lineHeight: 1.8, color: inkMuted, maxWidth: 320 }}>Thank you! A confirmation has been sent to <strong style={{ color: ink }}>{form.email}</strong>. We'll be in touch with delivery details.</p>
                    <div style={{ fontSize: 11, color: inkFaint }}>Order ref: <span style={{ color: burgundy, fontWeight: 700 }}>{orderRef}</span></div>
                    <button className="rf-add-btn" onClick={() => { setCheckoutOpen(false); setCart([]); setCheckoutStep(1); }} style={{ marginTop: 10, padding: "13px 34px", background: burgundy, color: "#fff", border: "none", borderRadius: 100, fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}>Continue Shopping</button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}
