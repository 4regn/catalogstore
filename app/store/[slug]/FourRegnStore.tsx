"use client";

import { useState, useEffect, useRef, useTransition, type TouchEvent as ReactTouchEvent } from "react";
import Image from "next/image";
import { supabase } from "../../../lib/supabase";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { effectiveStoreConfig } from "../../../lib/template-config";
import { useLiveVisitorPing } from "../../../lib/use-live-visitor-ping";

const pInCat = (p: { category: string }, cat: string) =>
  (p.category || "").split(",").map((c) => c.trim()).includes(cat);

/* ─── TYPES ─────────────────────────────────────────────── */
interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string;
  facebook?: string; twitter?: string;
}

type CtaTarget =
  | { type: "products" }
  | { type: "collection"; collection: string }
  | { type: "url"; url: string }
  | { type: "none" };
interface StoreConfig {
  announcement?: string;
  show_announcement?: boolean;
  hero_image_position?: string;
  hero_label?: string;
  hero_headline?: string;
  hero_body?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
  hero_cta_primary_target?: CtaTarget;
  hero_cta_secondary_target?: CtaTarget;
  footer_tagline?: string;
  footer_col1_label?: string;
  hero_countdown_label?: string;
  hero_sale_headline?: string;
  show_newsletter?: boolean;
  newsletter_label?: string;
  newsletter_title?: string;
  newsletter_sub?: string;
  free_ship_threshold?: number;
  shipping_policy?: string;
  return_policy?: string;
  contact_email?: string;
  contact_phone?: string;
  operating_hours?: string;
  physical_address?: string;
  products_heading?: string;
}
interface Seller {
  id: string; store_name: string; whatsapp_number: string;
  subdomain: string; template: string; primary_color: string;
  logo_url: string; banner_url: string; tagline: string; description: string;
  collections: string[]; social_links: SocialLinks;
  store_config: StoreConfig; template_configs?: Record<string, any>; subscription_status?: string;
  checkout_config?: {
    eft_enabled?: boolean;
    payfast_enabled?: boolean;
    whatsapp_checkout_enabled?: boolean;
  };
}
interface Variant { name: string; options: string[]; images?: { [option: string]: string }; priceDelta?: { [option: string]: number }; }
interface Product {
  id: string; name: string; price: number; old_price: number | null;
  category: string; image_url: string | null; images: string[];
  variants: Variant[]; in_stock: boolean; description: string;
  sort_order: number; created_at?: string;
}
interface CartItem {
  product: Product; qty: number;
  selectedVariants: { [key: string]: string };
}
interface PromoDiscount {
  code: string; type: string; value: number; applies_to: string;
  expires_at: string; product_ids: string[]; collection_names: string[];
  timeLeft: string;
}

/* ─── HELPERS ────────────────────────────────────────────── */
const fmt = (n: number) => "R " + n.toLocaleString("en-ZA");
const variantDelta = (product: Product, selected: { [key: string]: string }): number =>
  (product.variants || []).reduce((sum, v) => {
    const chosen = selected[v.name];
    const d = chosen ? v.priceDelta?.[chosen] : undefined;
    return sum + (typeof d === "number" ? d : 0);
  }, 0);
const effectivePrice = (product: Product, selected: { [key: string]: string }): number =>
  Math.max(0, product.price + variantDelta(product, selected));
const pad = (n: number) => String(n).padStart(2, "0");
const initials = (s: string) => (s || "").trim().slice(0, 1).toUpperCase();

// URL-safe slug for collection names, matching the same convention every
// other template uses for /store/<slug>/c/<collection-slug> links.
export const collectionSlug = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

interface StorePageProps {
  initialSeller?: Seller;
  initialProducts?: Product[];
  initialDiscountCodes?: any[];
  initialProductId?: string;
  mode?: "home" | "collection";
  collectionName?: string;
  isSubdomain?: boolean;
}

const buildInitialPromos = (dcs: any[] | undefined): { discounts: PromoDiscount[]; countdown: PromoDiscount | null } => {
  if (!dcs || dcs.length === 0) return { discounts: [], countdown: null };
  const active = dcs
    .filter((d: any) => new Date(d.expires_at) > new Date())
    .map((d: any) => ({
      code: d.code, type: d.type, value: d.value, applies_to: d.applies_to || "cart",
      expires_at: d.expires_at, product_ids: d.product_ids || [], collection_names: d.collection_names || [], timeLeft: ""
    })) as PromoDiscount[];
  const storePromo = active.find((d) => d.applies_to === "cart" || d.applies_to === "shipping");
  return { discounts: active, countdown: storePromo ? { ...storePromo, timeLeft: "" } : null };
};

/* Ticks on its own so the countdown's per-second re-render stays scoped to
   this tiny subtree instead of the whole store (same reasoning as Heirloom's
   version -- avoids flickering the product grid images every second). */
function PromoCountdown({ expiresAt, children }: { expiresAt: string; children: (timeLeft: string | null) => React.ReactNode }) {
  const [timeLeft, setTimeLeft] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => {
      const diff = new Date(expiresAt).getTime() - Date.now();
      if (diff <= 0) { setTimeLeft(null); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTimeLeft((d > 0 ? d + "d " : "") + pad(h) + ":" + pad(m) + ":" + pad(s));
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [expiresAt]);
  return <>{children(timeLeft)}</>;
}

export default function FourRegnStore({ initialSeller, initialProducts, initialDiscountCodes, initialProductId, mode = "home", collectionName, isSubdomain }: StorePageProps = {}) {
  const isCollectionView = mode === "collection";
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const navigate = (path: string) => startNavigation(() => router.push(path));
  const slug = params.slug as string;
  const isEditMode = searchParams.get("editMode") === "true";
  const sp = (suffix: string = "") => (isSubdomain ? suffix || "/" : `/store/${slug}${suffix}`);

  /* ─── DATA ─── */
  const [seller, setSeller] = useState<Seller | null>(initialSeller ?? null);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading] = useState(!initialSeller);
  const [notFound, setNotFound] = useState(false);

  /* ─── LIVE EDIT ─── */
  const [liveTagline, setLiveTagline] = useState<string | null>(null);
  const [liveDescription, setLiveDescription] = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null);
  const [liveLogoUrl, setLiveLogoUrl] = useState<string | null>(null);
  const [liveHeroLabel, setLiveHeroLabel] = useState<string | null>(null);
  const [liveHeroHeadline, setLiveHeroHeadline] = useState<string | null>(null);
  const [liveHeroBody, setLiveHeroBody] = useState<string | null>(null);
  const [liveHeroCtaPrimary, setLiveHeroCtaPrimary] = useState<string | null>(null);
  const [liveHeroCtaSecondary, setLiveHeroCtaSecondary] = useState<string | null>(null);
  const [liveHeroCtaPrimaryTarget, setLiveHeroCtaPrimaryTarget] = useState<CtaTarget | null>(null);
  const [liveHeroCtaSecondaryTarget, setLiveHeroCtaSecondaryTarget] = useState<CtaTarget | null>(null);
  const [liveFooterTagline, setLiveFooterTagline] = useState<string | null>(null);
  const [liveFooterCol1Label, setLiveFooterCol1Label] = useState<string | null>(null);
  const [liveHeroCountdownLabel, setLiveHeroCountdownLabel] = useState<string | null>(null);
  const [liveHeroSaleHeadline, setLiveHeroSaleHeadline] = useState<string | null>(null);
  const [liveProductsHeading, setLiveProductsHeading] = useState<string | null>(null);
  const [policyModal, setPolicyModal] = useState<{ title: string; content: string } | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  /* ─── PROMO ─── */
  const [promoCountdown, setPromoCountdown] = useState<PromoDiscount | null>(() => buildInitialPromos(initialDiscountCodes).countdown);
  const [promoDiscounts, setPromoDiscounts] = useState<PromoDiscount[]>(() => buildInitialPromos(initialDiscountCodes).discounts);

  /* ─── UI ─── */
  const [activeCategory, setActiveCategory] = useState("All");
  const [productSort, setProductSort] = useState("default");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState<{ imgs: string[]; index: number } | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<{ [k: string]: string }>({});
  const [localQty, setLocalQty] = useState(1);
  const [variantError, setVariantError] = useState(false);

  /* ─── CART ─── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  useLiveVisitorPing(seller?.id, {
    cartItemCount: cart.reduce((sum, i) => sum + i.qty, 0),
    cartValue: cart.reduce((sum, i) => sum + i.product.price * i.qty, 0),
  });

  /* ─── NAV ─── */
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
        .eq("seller_id", s.id).eq("in_stock", true)
        .order("sort_order", { ascending: true });
      setProducts(p || []);
      const { data: dcs } = await supabase
        .from("discount_codes").select("*")
        .eq("seller_id", s.id).eq("active", true).eq("show_countdown", true)
        .not("expires_at", "is", null);
      if (dcs && dcs.length > 0) {
        const activePromos = dcs
          .filter((d: any) => new Date(d.expires_at) > new Date())
          .map((d: any) => ({
            code: d.code, type: d.type, value: d.value,
            applies_to: d.applies_to || "cart",
            expires_at: d.expires_at,
            product_ids: d.product_ids || [],
            collection_names: d.collection_names || [],
            timeLeft: "",
          })) as PromoDiscount[];
        setPromoDiscounts(activePromos);
        const storePromo = activePromos.find(
          (d) => d.applies_to === "cart" || d.applies_to === "shipping"
        );
        if (storePromo) setPromoCountdown({ ...storePromo, timeLeft: "" });
      }
      setLoading(false);
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
    })();
  }, [slug, isEditMode]);

  const getProductPromo = (productId: string) =>
    promoDiscounts.find((d) => d.applies_to === "product" && d.product_ids?.includes(productId));

  /* ─── LIVE EDIT POSTMESSAGE ─── */
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "LIVE_UPDATE") return;
      if (e.data.tagline !== undefined) setLiveTagline(e.data.tagline);
      if (e.data.description !== undefined) setLiveDescription(e.data.description);
      if (e.data.announcement !== undefined) setLiveAnnouncement(e.data.announcement);
      if (e.data.logoUrl !== undefined) setLiveLogoUrl(e.data.logoUrl);
      if (e.data.heroLabel !== undefined) setLiveHeroLabel(e.data.heroLabel);
      if (e.data.heroHeadline !== undefined) setLiveHeroHeadline(e.data.heroHeadline);
      if (e.data.heroBody !== undefined) setLiveHeroBody(e.data.heroBody);
      if (e.data.heroCtaPrimary !== undefined) setLiveHeroCtaPrimary(e.data.heroCtaPrimary);
      if (e.data.heroCtaSecondary !== undefined) setLiveHeroCtaSecondary(e.data.heroCtaSecondary);
      if (e.data.heroCtaPrimaryTarget !== undefined) setLiveHeroCtaPrimaryTarget(e.data.heroCtaPrimaryTarget);
      if (e.data.heroCtaSecondaryTarget !== undefined) setLiveHeroCtaSecondaryTarget(e.data.heroCtaSecondaryTarget);
      if (e.data.footerTagline !== undefined) setLiveFooterTagline(e.data.footerTagline);
      if (e.data.footerCol1Label !== undefined) setLiveFooterCol1Label(e.data.footerCol1Label);
      if (e.data.heroCountdownLabel !== undefined) setLiveHeroCountdownLabel(e.data.heroCountdownLabel);
      if (e.data.heroSaleHeadline !== undefined) setLiveHeroSaleHeadline(e.data.heroSaleHeadline);
      if (e.data.productsHeading !== undefined) setLiveProductsHeading(e.data.productsHeading);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  /* ─── BODY SCROLL LOCK + LIGHTBOX KEYS ─── */
  useEffect(() => {
    document.body.style.overflow = (cartOpen || !!selectedProduct || mobileNavOpen || !!lightbox) ? "hidden" : "";
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLightbox(null);
      else if (e.key === "ArrowLeft" && lightbox.imgs.length > 1) {
        setLightbox((s) => s ? { ...s, index: (s.index - 1 + s.imgs.length) % s.imgs.length } : s);
      } else if (e.key === "ArrowRight" && lightbox.imgs.length > 1) {
        setLightbox((s) => s ? { ...s, index: (s.index + 1) % s.imgs.length } : s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [cartOpen, selectedProduct, mobileNavOpen, lightbox]);

  /* ─── CART OPS ─── */
  const addToCart = (product: Product, qty: number, variants: { [k: string]: string }) => {
    setCart((prev) => {
      const key = product.id + JSON.stringify(variants);
      const existing = prev.find((i) => i.product.id + JSON.stringify(i.selectedVariants) === key);
      if (existing) return prev.map((i) => i === existing ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { product, qty, selectedVariants: variants }];
    });
  };
  const removeFromCart = (idx: number) => setCart((prev) => prev.filter((_, i) => i !== idx));
  const changeQty = (idx: number, d: number) =>
    setCart((prev) => prev.map((i, n) => n === idx ? { ...i, qty: Math.max(1, i.qty + d) } : i));

  const orderViaWhatsApp = () => {
    if (!seller) return;
    const lines = cart.map(i => {
      const vars = Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `• ${i.product.name}${vars ? ` (${vars})` : ""} x ${i.qty} — ${fmt(effectivePrice(i.product, i.selectedVariants) * i.qty)}`;
    });
    const msg = [
      `Hi! I'd like to place an order with ${seller.store_name}:`,
      "", ...lines, "",
      `Total: ${fmt(cartTotal)}`,
    ].join("\n");
    const num = (seller.whatsapp_number || "").replace(/\D/g, "");
    if (!num) return;
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* ─── PDP ACTIONS ─── */
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
    const allSelected = validVariants.every((v) => selectedVariants[v.name]);
    if (!allSelected && validVariants.length > 0) {
      setVariantError(true);
      return;
    }
    addToCart(selectedProduct, localQty, selectedVariants);
    setSelectedProduct(null);
    setCartOpen(true);
  };

  /* ─── CHECKOUT (redirect to existing route) ─── */
  // Same base64 `?cart=` encoding every other template uses -- the checkout
  // page decodes this param, not any client-side storage.
  const goToCheckout = () => {
    const payload = cart.map((i) => ({
      id: i.product.id,
      name: i.product.name,
      price: effectivePrice(i.product, i.selectedVariants),
      qty: i.qty,
      variant: Object.entries(i.selectedVariants).map(([k, v]) => k + ": " + v).join(", "),
      image: i.product.image_url || "",
      selectedVariants: i.selectedVariants,
    }));
    const encoded = btoa(JSON.stringify(payload));
    window.location.href = sp(`/checkout?cart=${encoded}`);
  };

  /* ─── DERIVED ─── */
  const allCategories = ["All", ...Array.from(new Set(products.flatMap((p) => (p.category || "").split(",").map((c) => c.trim()).filter(Boolean))))];
  const categoryList = allCategories.filter((c) => c !== "All").slice(0, 4);
  // Nav / menu links come straight from the seller's collections list -- no
  // fixed menu structure baked in here.
  const menuCategories = ["All", ...((seller?.collections || []).filter(Boolean))];
  const effectiveCategory = isCollectionView && collectionName ? collectionName : activeCategory;
  const filtered = (() => {
    const list = isCollectionView
      ? [...products]
      : (activeCategory === "All" ? [...products] : products.filter((p) => pInCat(p, activeCategory)));
    if (productSort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (productSort === "za") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (productSort === "latest") list.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    else if (productSort === "oldest") list.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    else if (productSort === "price-low") list.sort((a, b) => a.price - b.price);
    else if (productSort === "price-high") list.sort((a, b) => b.price - a.price);
    return list;
  })();
  const cartTotal = cart.reduce((s, i) => s + effectivePrice(i.product, i.selectedVariants) * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const FREE_SHIP = seller?.store_config?.free_ship_threshold ?? null;
  const freeShipRem = FREE_SHIP ? Math.max(0, FREE_SHIP - cartTotal) : 0;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000" }}>
        <div style={{ width: 28, height: 28, border: "1px solid rgba(253,251,247,0.2)", borderTopColor: "#fdfbf7", borderRadius: "50%", animation: "fr-spin 0.9s linear infinite" }} />
        <style>{`@keyframes fr-spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (notFound || !seller) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#000", padding: 32, textAlign: "center", fontFamily: "'Amiri', serif", color: "#fdfbf7" }}>
        <div>
          <div style={{ fontFamily: "'Quattrocento', serif", fontSize: 32, marginBottom: 12 }}>Not found.</div>
          <div style={{ fontSize: 14, opacity: 0.6 }}>This store doesn&apos;t exist or has been removed.</div>
        </div>
      </div>
    );
  }

  /* ─── DISPLAY VALUES ─── */
  const config = effectiveStoreConfig(seller) as StoreConfig;
  const displayLogo = liveLogoUrl ?? seller.logo_url ?? null;
  const displayAnnouncement = liveAnnouncement ?? config.announcement ?? null;
  // Hero image is the seller's generic Store Banner (already editable from
  // the main Dashboard -> My Store -> Branding panel for every template,
  // no per-template upload needed). Focal point comes from the same
  // hero_image_position field Soft Luxury's FocalPointPicker writes.
  const displayHeroImage = seller.banner_url || null;
  const heroPosRaw = (config as any).hero_image_position || "center";
  const heroImageObjectPosition =
    heroPosRaw === "top" ? "center top" :
    heroPosRaw === "bottom" ? "center bottom" :
    heroPosRaw === "center" ? "center center" :
    /^[\d.]+%\s+[\d.]+%$/.test(heroPosRaw) ? heroPosRaw :
    "center center";
  const displayHeroLabel = liveHeroLabel ?? config.hero_label ?? "";
  // Falls back to tagline/store name so the hero never reads empty even
  // before the seller has typed a dedicated headline.
  const displayHeroHeadline = liveHeroHeadline ?? config.hero_headline ?? seller.tagline ?? seller.store_name;
  const displayHeroBody = liveHeroBody ?? config.hero_body ?? seller.description ?? "";
  const displayCtaPrimary = liveHeroCtaPrimary ?? config.hero_cta_primary ?? "Shop the Collection";
  const displayCtaSecondary = liveHeroCtaSecondary ?? config.hero_cta_secondary ?? "";
  const displayCtaPrimaryTarget: CtaTarget = liveHeroCtaPrimaryTarget ?? config.hero_cta_primary_target ?? { type: "products" };
  const displayCtaSecondaryTarget: CtaTarget = liveHeroCtaSecondaryTarget ?? config.hero_cta_secondary_target ?? { type: "none" };

  const ctaClick = (target: CtaTarget) => () => {
    if (target.type === "products") {
      document.getElementById("fr-products")?.scrollIntoView({ behavior: "smooth" });
    } else if (target.type === "collection") {
      navigate(sp(`/c/${target.collection}`));
    } else if (target.type === "url") {
      if (target.url) window.open(target.url, "_blank", "noopener");
    }
  };
  const showCtaPrimary = displayCtaPrimary.trim() !== "" && displayCtaPrimaryTarget.type !== "none";
  const showCtaSecondary = displayCtaSecondary.trim() !== "" && displayCtaSecondaryTarget.type !== "none";

  const displayFooterTagline = liveFooterTagline ?? config.footer_tagline ?? liveDescription ?? seller.description ?? seller.tagline ?? "";
  const displayFooterCol1 = liveFooterCol1Label ?? config.footer_col1_label ?? "Shop";
  const showNewsletter = config.show_newsletter ?? true;
  const nlLabel = config.newsletter_label ?? "Stay in the Know";
  const nlTitle = config.newsletter_title ?? "Be first to see what's new.";
  const nlSub = config.newsletter_sub ?? "We'll email you about new arrivals and restocks. Nothing else.";

  const catImage = (cat: string) => {
    const p = products.find((p) => pInCat(p, cat) && p.image_url);
    return p?.image_url || null;
  };
  const catCount = (cat: string) => products.filter((p) => pInCat(p, cat)).length;

  /* ─── EDIT SECTION WRAPPER (same iframe-postMessage affordance as the
       other templates -- lets the Online Visual Editor highlight sections) ─── */
  const EditSection = ({ id, children }: { id: string; children: React.ReactNode }) => {
    if (!isEditMode) return <>{children}</>;
    const isHovered = hoveredSection === id;
    return (
      <div
        onMouseEnter={() => setHoveredSection(id)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={(e) => {
          e.stopPropagation();
          window.parent.postMessage({ type: "SECTION_CLICK", section: id }, "*");
        }}
        style={{
          position: "relative",
          outline: isHovered ? "2px solid #000" : "2px solid transparent",
          outlineOffset: -2,
          cursor: "pointer",
          transition: "outline-color 0.2s",
        }}
      >
        {isHovered && (
          <div style={{
            position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
            background: "#000", color: "#fdfbf7",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "5px 12px", zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap",
            borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}>
            Click to edit
          </div>
        )}
        {children}
      </div>
    );
  };

  return (
    <>
      <style>{`
@import url('https://fonts.googleapis.com/css2?family=Quattrocento:wght@400;700&family=Amiri:ital,wght@0,400;0,700;1,400;1,700&display=swap');
.fr-root *,.fr-root *::before,.fr-root *::after{box-sizing:border-box}
.fr-root{
  --ink:#2e2a39;--paper-grad:linear-gradient(178deg, rgba(255,255,255,1), rgba(249,249,249,1) 48.5%, rgba(245,245,245,1) 97%);
  --paper-solid:#e6e6e6;--head-bg:#000000;--head-text:#fdfbf7;
  --brown:#765341;--purple:linear-gradient(320deg, #86106a, #5e3653 100%);--cream:#fdfbf7;
  --btn-bg:#000000;--btn-text:#ffffff;--btn-radius:10px;--btn-shadow:0 4px 5px rgba(0,0,0,0.08);
  --card-radius:12px;--card-shadow:10px 10px 35px rgba(0,0,0,0.05);
  --serif:'Quattrocento',Georgia,serif;--body:'Amiri',Georgia,serif;
  font-family:var(--body);background:var(--paper-grad);color:var(--ink);
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
.fr-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:200;background:rgba(0,0,0,0.08);overflow:hidden;pointer-events:none}
.fr-progress::after{content:"";position:absolute;top:0;left:0;height:100%;width:40%;background:#000;border-radius:0 2px 2px 0;animation:fr-progress 0.8s ease-in-out infinite}
@keyframes fr-progress{from{transform:translateX(-40%)}to{transform:translateX(250%)}}

.fr-nav{position:sticky;top:0;z-index:100;background:var(--head-bg);display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;padding:0 40px;height:72px}
.fr-nav-left{display:flex;align-items:center;gap:20px}
.fr-burger{display:none;background:none;border:none;cursor:pointer;width:24px;height:24px;flex-direction:column;justify-content:space-between;padding:5px 0}
.fr-burger span{display:block;width:100%;height:1px;background:var(--head-text)}
.fr-logo{font-family:var(--serif);font-weight:700;font-size:24px;letter-spacing:0.5px;color:var(--head-text);text-decoration:none;line-height:1;white-space:nowrap}
.fr-logo img{height:34px;width:auto;display:block;object-fit:contain}
.fr-nav-links{display:flex;gap:28px;align-items:center;justify-content:center;overflow:hidden}
.fr-nav-link{font-family:var(--body);font-size:12px;font-weight:400;letter-spacing:1px;text-transform:uppercase;text-decoration:none;color:rgba(253,251,247,0.75);transition:color 0.2s;background:none;border:none;cursor:pointer;white-space:nowrap}
.fr-nav-link:hover{color:var(--head-text)}
.fr-nav-right{display:flex;justify-content:flex-end;align-items:center;gap:18px}
.fr-cart-btn{position:relative;background:none;border:none;cursor:pointer;color:var(--head-text);padding:4px;display:flex;align-items:center}
.fr-cart-count{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:999px;background:var(--brown);color:var(--cream);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:var(--body)}

.fr-hero{position:relative;width:100%;min-height:560px;height:88vh;overflow:hidden;display:flex;align-items:flex-end;background:linear-gradient(160deg,#1a1715 0%,#000 100%)}
.fr-hero-bgimg{position:absolute;inset:0;z-index:0}
.fr-hero-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(to top,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.38) 55%,rgba(0,0,0,0.12) 100%)}
.fr-hero-inner{position:relative;z-index:2;width:100%;max-width:720px;padding:0 56px 72px;text-align:left}
.fr-hero-label{font-family:var(--body);font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(253,251,247,0.65);margin-bottom:18px;display:flex;align-items:center;gap:12px}
.fr-hero-label::before{content:'';display:block;width:26px;height:1px;background:rgba(253,251,247,0.4)}
.fr-hero-h1{font-family:var(--serif);font-weight:700;font-size:clamp(38px,6vw,72px);line-height:1.05;color:#fdfbf7;margin-bottom:20px;white-space:pre-line}
.fr-hero-body{font-family:var(--body);font-style:italic;font-size:16px;line-height:1.7;color:rgba(253,251,247,0.72);max-width:460px;margin-bottom:34px;white-space:pre-line}
.fr-cta-row{display:flex;align-items:center;gap:22px;margin-bottom:36px;flex-wrap:wrap}
.fr-btn{display:inline-flex;align-items:center;justify-content:center;background:var(--btn-bg);color:var(--btn-text);font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;padding:15px 30px;border-radius:var(--btn-radius);box-shadow:var(--btn-shadow);border:none;cursor:pointer;transition:opacity 0.2s}
.fr-btn:hover{opacity:0.85}
.fr-btn-ghost{display:inline-flex;align-items:center;justify-content:center;background:transparent;color:var(--head-text);font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;text-decoration:none;padding:14px 28px;border-radius:var(--btn-radius);border:1px solid rgba(253,251,247,0.4);cursor:pointer;transition:background 0.2s}
.fr-btn-ghost:hover{background:rgba(253,251,247,0.08)}
.fr-timer-row{display:flex;flex-direction:column;gap:6px}
.fr-sale-headline{font-family:var(--serif);font-weight:700;font-size:24px;color:#fdfbf7;line-height:1.1;margin-bottom:2px}
.fr-timer-note{font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(253,251,247,0.5)}
.fr-timer-digits{font-family:var(--serif);font-weight:700;font-size:38px;letter-spacing:2px;line-height:1;color:#fdfbf7}
.fr-timer-digits .sep{color:rgba(253,251,247,0.3);margin:0 2px}

.fr-section{max-width:1360px;margin:0 auto;padding:64px 40px}
.fr-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;gap:20px;flex-wrap:wrap}
.fr-section-title{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3vw,34px);color:var(--ink)}
.fr-sort-select{font-family:var(--body);font-size:12px;letter-spacing:0.5px;color:var(--ink);background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;padding:8px 30px 8px 12px;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%232e2a39'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.fr-count{font-family:var(--body);font-size:12px;color:rgba(46,42,57,0.55)}

.fr-coll-header{max-width:1360px;margin:0 auto;padding:56px 40px 8px;text-align:center}
.fr-coll-back{background:none;border:none;font-family:var(--body);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.55);cursor:pointer;padding:0 0 18px;text-decoration:underline;text-underline-offset:3px}
.fr-coll-title{font-family:var(--serif);font-weight:700;font-size:clamp(32px,5vw,52px);color:var(--ink);margin-bottom:6px}
.fr-coll-count{font-family:var(--body);font-size:12px;color:rgba(46,42,57,0.55)}

.fr-cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.fr-cat-card{background:#fff;border-radius:var(--card-radius);box-shadow:var(--card-shadow);overflow:hidden;cursor:pointer;border:none;padding:0;text-align:center;display:block;width:100%;font-family:var(--body)}
.fr-cat-img{width:100%;aspect-ratio:4/5;overflow:hidden;position:relative;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
.fr-cat-img img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s ease}
.fr-cat-card:hover .fr-cat-img img{transform:scale(1.05)}
.fr-cat-mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:700;font-size:22px;color:rgba(46,42,57,0.35);text-transform:capitalize}
.fr-cat-foot{padding:16px 14px 20px}
.fr-cat-name{font-family:var(--serif);font-weight:700;font-size:15px;color:var(--ink);margin-bottom:4px}
.fr-cat-count{font-size:11px;color:rgba(46,42,57,0.55)}

.fr-pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.fr-pcard{background:#fff;border-radius:var(--card-radius);box-shadow:var(--card-shadow);overflow:hidden;cursor:pointer;text-align:center;position:relative;transition:transform 0.2s}
.fr-pcard:hover{transform:translateY(-3px)}
.fr-pimg{aspect-ratio:1;overflow:hidden;position:relative;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
.fr-pimg img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s ease}
.fr-pcard:hover .fr-pimg img{transform:scale(1.06)}
.fr-p-mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:700;font-size:26px;color:rgba(46,42,57,0.3)}
.fr-ptag{position:absolute;top:12px;left:12px;z-index:2;font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:var(--cream);padding:5px 11px;border-radius:999px;background:var(--brown)}
.fr-ptag.sale{background:var(--purple)}
.fr-pinfo{padding:18px 16px 22px}
.fr-pcat{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-bottom:6px}
.fr-pname{font-family:var(--serif);font-weight:700;font-size:16px;margin-bottom:8px;line-height:1.3;color:var(--ink)}
.fr-pprice{font-family:var(--body);font-size:14px;font-weight:700;color:var(--ink)}
.fr-pprice .was{font-size:12px;color:rgba(46,42,57,0.5);text-decoration:line-through;margin-right:6px;font-weight:400}
.fr-pwa{margin-top:12px;width:100%;background:var(--btn-bg);color:var(--btn-text);border:none;border-radius:var(--btn-radius);box-shadow:var(--btn-shadow);padding:10px;font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer}

.fr-newsletter{background:#000;padding:88px 40px;text-align:center}
.fr-nl-lbl{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(253,251,247,0.55);margin-bottom:16px}
.fr-nl-title{font-family:var(--serif);font-weight:700;font-size:clamp(28px,4vw,44px);color:#fdfbf7;margin-bottom:16px}
.fr-nl-sub{font-size:14px;color:rgba(253,251,247,0.65);max-width:460px;margin:0 auto 28px;line-height:1.6}
.fr-nl-form{display:flex;max-width:440px;margin:0 auto;gap:8px}
.fr-nl-form input{flex:1;background:rgba(253,251,247,0.08);border:1px solid rgba(253,251,247,0.2);border-radius:var(--btn-radius);outline:none;font-family:var(--body);font-size:13px;padding:13px 16px;color:#fdfbf7}
.fr-nl-form input::placeholder{color:rgba(253,251,247,0.4)}
.fr-nl-form button{background:#fdfbf7;color:#000;border:none;border-radius:var(--btn-radius);cursor:pointer;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:13px 22px}

.fr-foot{background:#f5f5f5;color:rgba(46,42,57,0.75);padding:72px 40px 28px}
.fr-foot-grid{display:grid;grid-template-columns:1.3fr 1fr 1fr 1fr;gap:56px;max-width:1360px;margin:0 auto 56px}
.fr-foot-brand{font-family:var(--serif);font-weight:700;font-size:24px;color:var(--ink);margin-bottom:14px}
.fr-foot-logo{height:36px;max-width:180px;object-fit:contain;margin-bottom:14px;display:block}
.fr-foot-tag{font-size:13px;color:rgba(46,42,57,0.65);line-height:1.6;max-width:280px;margin-bottom:22px}
.fr-foot-soc{display:flex;gap:10px;flex-wrap:wrap}
.fr-foot-soc a{width:34px;height:34px;border-radius:50%;background:#000;color:#fdfbf7;display:flex;align-items:center;justify-content:center;text-decoration:none;transition:opacity 0.2s}
.fr-foot-soc a:hover{opacity:0.75}
.fr-foot-col h4{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-bottom:16px;font-weight:700;font-family:var(--body)}
.fr-foot-col ul{list-style:none;margin:0;padding:0}
.fr-foot-col li{margin-bottom:10px}
.fr-foot-col a,.fr-foot-col button{color:var(--ink);font-size:13px;text-decoration:none;transition:color 0.2s;background:none;border:none;cursor:pointer;padding:0;font-family:var(--body);text-align:left}
.fr-foot-col a:hover,.fr-foot-col button:hover{color:var(--brown)}
.fr-foot-bot{max-width:1360px;margin:0 auto;padding-top:28px;border-top:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:14px;font-size:11px;color:rgba(46,42,57,0.5)}
.fr-pay-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:6px}
.fr-pay-icon{width:42px;height:26px;border:1px solid rgba(0,0,0,0.1);border-radius:6px;display:flex;align-items:center;justify-content:center;background:#fff}

.fr-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px}
.fr-modal{background:#fff;border-radius:var(--card-radius);max-width:520px;width:100%;max-height:80vh;overflow-y:auto;padding:36px;position:relative;box-shadow:var(--card-shadow)}
.fr-modal-close{position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;color:var(--ink);cursor:pointer;padding:4px 8px;line-height:1}
.fr-modal h3{font-family:var(--serif);font-weight:700;font-size:22px;color:var(--ink);margin:0 0 16px}
.fr-modal p{font-size:14px;color:rgba(46,42,57,0.75);line-height:1.7;margin:0;white-space:pre-wrap}
.fr-contact-list{list-style:none;margin:0;padding:0}
.fr-contact-list li{padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;gap:12px}
.fr-contact-list li:last-child{border-bottom:none}
.fr-contact-list a{color:var(--ink);font-size:13px;text-decoration:none}
.fr-contact-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);width:82px;flex-shrink:0}

.fr-mm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:998;opacity:0;pointer-events:none;transition:opacity 0.3s}
.fr-mm-overlay.open{opacity:1;pointer-events:all}
.fr-mm{position:fixed;top:0;left:0;bottom:0;width:320px;max-width:90vw;background:#000;color:#fdfbf7;z-index:999;transform:translateX(-100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;padding:26px}
.fr-mm.open{transform:translateX(0)}
.fr-mm-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:36px}
.fr-mm-logo{font-family:var(--serif);font-weight:700;font-size:22px}
.fr-mm-close{background:none;border:none;font-size:22px;cursor:pointer;color:#fdfbf7}
.fr-mm nav{display:flex;flex-direction:column}
.fr-mm nav button{display:block;padding:15px 0;border-bottom:1px solid rgba(253,251,247,0.14);font-size:13px;letter-spacing:1.5px;text-transform:uppercase;color:#fdfbf7;background:none;border-left:none;border-right:none;border-top:none;font-family:var(--body);text-align:left;cursor:pointer}
.fr-mm-foot{margin-top:auto;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(253,251,247,0.5)}

.fr-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;opacity:0;pointer-events:none;transition:opacity 0.3s}
.fr-cart-overlay.open{opacity:1;pointer-events:all}
.fr-cart{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;background:#fff;z-index:1001;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column}
.fr-cart.open{transform:translateX(0)}
.fr-cart-h{padding:22px 26px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center}
.fr-cart-h h3{font-family:var(--serif);font-weight:700;font-size:20px;margin:0;color:var(--ink)}
.fr-cart-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink);padding:4px}
.fr-cart-items{flex:1;overflow-y:auto;padding:18px 26px}
.fr-cart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:12px;color:rgba(46,42,57,0.5);text-align:center}
.fr-cart-item{display:grid;grid-template-columns:70px 1fr auto;gap:14px;padding:16px 0;border-bottom:1px solid rgba(0,0,0,0.06);align-items:start}
.fr-cart-item:last-child{border-bottom:none}
.fr-cart-item-img{width:70px;height:70px;border-radius:8px;background:linear-gradient(140deg,#e7e2da,#cfc7bb);background-size:cover;background-position:center}
.fr-cart-item-cat{font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-bottom:3px}
.fr-cart-item-name{font-family:var(--serif);font-weight:700;font-size:14px;margin-bottom:4px;line-height:1.3;color:var(--ink)}
.fr-cart-item-var{font-size:11px;color:rgba(46,42,57,0.55);margin-bottom:8px}
.fr-cart-item-qty{display:flex;align-items:center;gap:10px}
.fr-qty-btn{width:24px;height:24px;border:1px solid rgba(0,0,0,0.12);border-radius:6px;background:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:var(--ink)}
.fr-qty-num{font-size:13px;min-width:16px;text-align:center}
.fr-cart-item-price{font-size:14px;font-weight:700;white-space:nowrap;color:var(--ink)}
.fr-cart-item-rm{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(46,42,57,0.5);background:none;border:none;cursor:pointer;padding:0;margin-top:6px;display:block}
.fr-cart-foot{padding:20px 26px 28px;border-top:1px solid rgba(0,0,0,0.08)}
.fr-cart-sub{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.fr-cart-sub-lbl{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.55)}
.fr-cart-sub-amt{font-family:var(--serif);font-weight:700;font-size:20px;color:var(--ink)}
.fr-cart-ship{font-size:11px;color:rgba(46,42,57,0.55);margin-bottom:18px}
.fr-cart-checkout{width:100%;background:var(--btn-bg);color:var(--btn-text);border:none;border-radius:var(--btn-radius);box-shadow:var(--btn-shadow);padding:16px;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer}
.fr-cart-wa{display:block;width:100%;background:#fff;border:1px solid rgba(0,0,0,0.15);border-radius:var(--btn-radius);margin-top:10px;padding:13px;font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer;color:var(--ink)}
.fr-cart-cont{display:block;text-align:center;margin-top:14px;font-size:11px;letter-spacing:1px;text-transform:uppercase;color:rgba(46,42,57,0.55);cursor:pointer;background:none;border:none;width:100%}

.fr-pdp-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1002;opacity:0;pointer-events:none;transition:opacity 0.3s}
.fr-pdp-overlay.open{opacity:1;pointer-events:all}
.fr-pdp{position:fixed;top:0;right:0;bottom:0;width:100%;max-width:980px;background:#fff;z-index:1003;transform:translateX(100%);transition:transform 0.4s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;overflow-y:auto}
.fr-pdp.open{transform:translateX(0)}
.fr-pdp-h{position:sticky;top:0;background:#fff;z-index:5;padding:18px 30px;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;justify-content:space-between;align-items:center}
.fr-pdp-bread{font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.55)}
.fr-pdp-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink)}
.fr-pdp-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1}
.fr-pdp-gal{background:#fff;min-height:600px;display:flex;flex-direction:column;padding:32px;gap:10px;border-right:1px solid rgba(0,0,0,0.06)}
.fr-pdp-main{flex:1;aspect-ratio:1;display:flex;align-items:center;justify-content:center;position:relative;background-size:cover;background-position:center;background-color:#f5f5f5;cursor:zoom-in;overflow:hidden;width:100%;border-radius:var(--card-radius)}
.fr-pdp-thumbs{display:flex;gap:8px;flex-wrap:wrap}
.fr-pdp-thumb{width:62px;height:62px;border:1px solid transparent;border-radius:8px;cursor:pointer;background:none;background-size:cover;background-position:center;padding:0}
.fr-pdp-thumb.active{border-color:#000}
.fr-pdp-info{padding:44px 52px;display:flex;flex-direction:column}
.fr-pdp-cat{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-bottom:12px}
.fr-pdp-name{font-family:var(--serif);font-weight:700;font-size:32px;line-height:1.15;margin-bottom:14px;color:var(--ink)}
.fr-pdp-prow{display:flex;align-items:baseline;gap:14px;margin-bottom:22px}
.fr-pdp-price{font-size:20px;font-weight:700;color:var(--ink)}
.fr-pdp-was{font-size:14px;color:rgba(46,42,57,0.5);text-decoration:line-through}
.fr-pdp-desc{font-size:14px;line-height:1.7;color:rgba(46,42,57,0.75);margin:0 0 28px;white-space:pre-line;font-style:italic}
.fr-pdp-section{border-top:1px solid rgba(0,0,0,0.07);padding:16px 0}
.fr-pdp-section-lbl{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-bottom:12px}
.fr-size-row{display:flex;gap:8px;flex-wrap:wrap}
.fr-size-btn{min-width:46px;padding:10px 14px;border:1px solid rgba(0,0,0,0.12);border-radius:8px;background:#fff;font-family:var(--body);font-size:12px;font-weight:700;cursor:pointer;color:var(--ink)}
.fr-size-btn.active{background:#000;color:#fdfbf7;border-color:#000}
.fr-pdp-actions{margin-top:auto;padding-top:28px;display:flex;flex-direction:column;gap:10px}
.fr-pdp-add{background:var(--btn-bg);color:var(--btn-text);border:none;border-radius:var(--btn-radius);box-shadow:var(--btn-shadow);padding:17px;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer}
.fr-pdp-buynow{background:transparent;color:var(--ink);border:1.5px solid #000;border-radius:var(--btn-radius);padding:17px;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;cursor:pointer}
.fr-pdp-err{color:#a13a3a;font-size:11px;letter-spacing:0.5px;margin-top:8px}

.fr-lb{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;padding:16px}
.fr-lb-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;touch-action:pan-y pinch-zoom}
.fr-lb-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;-webkit-user-select:none;user-select:none;pointer-events:none}
.fr-lb-close{position:fixed;top:18px;right:18px;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center}
.fr-lb-nav{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#fff;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;padding-bottom:4px}
.fr-lb-prev{left:18px}
.fr-lb-next{right:18px}
.fr-lb-dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:100px;background:rgba(255,255,255,0.08)}
.fr-lb-dot{width:6px;height:6px;border-radius:50%;border:none;padding:0;background:rgba(255,255,255,0.35);cursor:pointer}
.fr-lb-dot.active{background:#fff;transform:scale(1.3)}

@media (max-width:900px){
  .fr-nav{padding:0 18px;grid-template-columns:auto auto 1fr;height:60px}
  .fr-burger{display:flex;order:1}
  .fr-logo{font-size:19px;order:2}
  .fr-nav-links{display:none}
  .fr-nav-right{order:3}
  .fr-hero-inner{padding:0 24px 48px}
  .fr-section{padding:48px 20px}
  .fr-coll-header{padding:40px 20px 4px}
  .fr-cat-grid,.fr-pgrid{grid-template-columns:repeat(2,1fr);gap:14px}
  .fr-newsletter{padding:56px 20px}
  .fr-foot{padding:56px 20px 24px}
  .fr-foot-grid{grid-template-columns:1fr;gap:36px}
  .fr-pdp-grid{grid-template-columns:1fr}
  .fr-pdp-gal{min-height:auto;padding:16px;border-right:none;border-bottom:1px solid rgba(0,0,0,0.06)}
  .fr-pdp-info{padding:28px 22px}
  .fr-pdp-name{font-size:26px}
  .fr-cart{width:100vw}
}
      `}</style>

      <div className="fr-root" style={isNavigating ? { opacity: 0.6, pointerEvents: "none", transition: "opacity 0.2s" } : undefined}>
        {isNavigating && <div className="fr-progress" aria-hidden="true" />}
        {displayAnnouncement && (
          <div style={{ background: "#000", color: "#fdfbf7", padding: "8px 16px", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", textAlign: "center", fontFamily: "'Amiri', serif" }}>
            {displayAnnouncement}
          </div>
        )}

        {/* MOBILE MENU */}
        <div className={"fr-mm-overlay" + (mobileNavOpen ? " open" : "")} onClick={() => setMobileNavOpen(false)} />
        <aside className={"fr-mm" + (mobileNavOpen ? " open" : "")}>
          <div className="fr-mm-h">
            <span className="fr-mm-logo">{seller.store_name}</span>
            <button className="fr-mm-close" onClick={() => setMobileNavOpen(false)}>✕</button>
          </div>
          <nav>
            {menuCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setMobileNavOpen(false);
                  navigate(sp(`/c/${cat === "All" ? "all" : collectionSlug(cat)}`));
                }}
              >
                {cat === "All" ? "All Products" : cat}
              </button>
            ))}
            <button onClick={() => { setMobileNavOpen(false); setCartOpen(true); }}>
              Cart ({cartCount})
            </button>
          </nav>
          <div className="fr-mm-foot">© {new Date().getFullYear()} {seller.store_name}</div>
        </aside>

        {/* CART */}
        <div className={"fr-cart-overlay" + (cartOpen ? " open" : "")} onClick={() => setCartOpen(false)} />
        <aside className={"fr-cart" + (cartOpen ? " open" : "")}>
          <div className="fr-cart-h">
            <h3>Your Bag</h3>
            <button className="fr-cart-close" onClick={() => setCartOpen(false)}>✕</button>
          </div>
          <div className="fr-cart-items">
            {cart.length === 0 ? (
              <div className="fr-cart-empty">
                <p style={{ fontSize: 13, letterSpacing: 0.5 }}>Your bag is empty</p>
              </div>
            ) : (
              cart.map((i, idx) => {
                const varStr = Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(" · ");
                return (
                  <div key={idx} className="fr-cart-item">
                    <div className="fr-cart-item-img" style={i.product.image_url ? { backgroundImage: `url("${i.product.image_url}")` } : {}} />
                    <div>
                      <div className="fr-cart-item-cat">{i.product.category}</div>
                      <div className="fr-cart-item-name">{i.product.name}</div>
                      {varStr && <div className="fr-cart-item-var">{varStr}</div>}
                      <div className="fr-cart-item-qty">
                        <button className="fr-qty-btn" onClick={() => changeQty(idx, -1)}>−</button>
                        <span className="fr-qty-num">{i.qty}</span>
                        <button className="fr-qty-btn" onClick={() => changeQty(idx, 1)}>+</button>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="fr-cart-item-price">{fmt(effectivePrice(i.product, i.selectedVariants) * i.qty)}</div>
                      <button className="fr-cart-item-rm" onClick={() => removeFromCart(idx)}>Remove</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {cart.length > 0 && (
            <div className="fr-cart-foot">
              <div className="fr-cart-sub">
                <span className="fr-cart-sub-lbl">Subtotal</span>
                <span className="fr-cart-sub-amt">{fmt(cartTotal)}</span>
              </div>
              {FREE_SHIP && <p className="fr-cart-ship">{freeShipRem > 0 ? `Add ${fmt(freeShipRem)} more for free shipping` : "Free shipping unlocked ✓"}</p>}
              <button className="fr-cart-checkout" onClick={goToCheckout}>Checkout</button>
              {seller.checkout_config?.whatsapp_checkout_enabled && seller.whatsapp_number && (
                <button className="fr-cart-wa" onClick={orderViaWhatsApp}>Order via WhatsApp</button>
              )}
              <button className="fr-cart-cont" onClick={() => setCartOpen(false)}>Continue Browsing</button>
            </div>
          )}
        </aside>

        {/* PDP */}
        <div className={"fr-pdp-overlay" + (selectedProduct ? " open" : "")} onClick={() => setSelectedProduct(null)} />
        <aside className={"fr-pdp" + (selectedProduct ? " open" : "")}>
          {selectedProduct && (() => {
            const p = selectedProduct;
            const allImgs = [p.image_url, ...(p.images || [])].filter(Boolean) as string[];
            const mainImg = allImgs[activeImg] || p.image_url;
            const onSale = p.old_price && p.old_price > p.price;
            return (
              <>
                <div className="fr-pdp-h">
                  <span className="fr-pdp-bread">{p.category} &nbsp;/&nbsp; {p.name}</span>
                  <button className="fr-pdp-close" onClick={() => setSelectedProduct(null)}>✕</button>
                </div>
                <div className="fr-pdp-grid">
                  <div className="fr-pdp-gal">
                    <div
                      className="fr-pdp-main"
                      style={mainImg ? { backgroundImage: `url("${mainImg}")` } : {}}
                      role={allImgs.length > 0 ? "button" : undefined}
                      tabIndex={allImgs.length > 0 ? 0 : undefined}
                      onClick={() => { if (allImgs.length > 0) setLightbox({ imgs: allImgs, index: activeImg }); }}
                      onKeyDown={(e) => { if (allImgs.length > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setLightbox({ imgs: allImgs, index: activeImg }); } }}
                      aria-label={allImgs.length > 0 ? "View images" : undefined}
                    >
                      {!mainImg && <span className="fr-p-mark">{initials(p.name)}</span>}
                    </div>
                    {allImgs.length > 1 && (
                      <div className="fr-pdp-thumbs">
                        {allImgs.map((img, i) => (
                          <button
                            key={i}
                            className={"fr-pdp-thumb" + (activeImg === i ? " active" : "")}
                            style={{ backgroundImage: `url("${img}")` }}
                            onClick={() => setActiveImg(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="fr-pdp-info">
                    <div className="fr-pdp-cat">{p.category}</div>
                    <h2 className="fr-pdp-name">{p.name}</h2>
                    <div className="fr-pdp-prow">
                      <span className="fr-pdp-price">{fmt(effectivePrice(p, selectedVariants))}</span>
                      {onSale && <span className="fr-pdp-was">{fmt(p.old_price!)}</span>}
                    </div>
                    {p.description && <p className="fr-pdp-desc">{p.description}</p>}
                    {(p.variants || []).filter(v => v.options?.length > 0).map((v) => (
                      <div className="fr-pdp-section" key={v.name}>
                        <div className="fr-pdp-section-lbl">{v.name}</div>
                        <div className="fr-size-row">
                          {v.options.map((opt) => (
                            <button
                              key={opt}
                              className={"fr-size-btn" + (selectedVariants[v.name] === opt ? " active" : "")}
                              onClick={() => { setSelectedVariants((prev) => ({ ...prev, [v.name]: opt })); setVariantError(false); }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {variantError && <div className="fr-pdp-err">Please select all options</div>}
                    <div className="fr-pdp-actions">
                      <button className="fr-pdp-add" onClick={handleAddToCart}>
                        Add to Bag — {fmt(effectivePrice(p, selectedVariants) * localQty)}
                      </button>
                      <button className="fr-pdp-buynow" onClick={() => {
                        const validVariants = (p.variants || []).filter(v => v.options?.length > 0);
                        const allSelected = validVariants.every((v) => selectedVariants[v.name]);
                        if (!allSelected && validVariants.length > 0) { setVariantError(true); return; }
                        const payload = [{ id: p.id, name: p.name, price: effectivePrice(p, selectedVariants), qty: localQty, variant: Object.entries(selectedVariants).map(([k, v]) => k + ": " + v).join(", "), image: p.image_url || "", selectedVariants }];
                        const encoded = btoa(JSON.stringify(payload));
                        window.location.href = sp(`/checkout?cart=${encoded}`);
                      }}>
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </aside>

        {/* IMAGE LIGHTBOX GALLERY */}
        {lightbox && (
          <LightboxGallery
            imgs={lightbox.imgs}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onIndex={(i) => setLightbox((s) => s ? { ...s, index: i } : s)}
          />
        )}

        {/* NAV */}
        <nav className="fr-nav">
          <div className="fr-nav-left">
            <button className="fr-burger" onClick={() => setMobileNavOpen(true)} aria-label="Menu">
              <span /><span /><span />
            </button>
            <a href={sp()} className="fr-logo">
              {displayLogo ? <img src={displayLogo} alt={seller.store_name} /> : seller.store_name}
            </a>
          </div>
          <div className="fr-nav-links">
            {menuCategories.slice(0, 6).map((cat) => {
              const target = sp(`/c/${cat === "All" ? "all" : collectionSlug(cat)}`);
              return (
                <a key={cat} href={target} className="fr-nav-link" onClick={(e) => { e.preventDefault(); navigate(target); }}>
                  {cat === "All" ? "All Products" : cat}
                </a>
              );
            })}
          </div>
          <div className="fr-nav-right">
            <button className="fr-cart-btn" onClick={() => setCartOpen(true)} aria-label="Cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              {cartCount > 0 && <span className="fr-cart-count">{cartCount}</span>}
            </button>
          </div>
        </nav>

        {/* HERO — only on landing page */}
        {!isCollectionView && (
          <EditSection id="hero">
            <section className="fr-hero">
              {displayHeroImage && (
                <div className="fr-hero-bgimg">
                  <Image
                    src={displayHeroImage}
                    alt=""
                    fill
                    priority
                    sizes="100vw"
                    quality={75}
                    style={{ objectFit: "cover", objectPosition: heroImageObjectPosition }}
                  />
                </div>
              )}
              <div className="fr-hero-overlay" />
              <div className="fr-hero-inner">
                {displayHeroLabel && <div className="fr-hero-label">{displayHeroLabel}</div>}
                {displayHeroHeadline && <h1 className="fr-hero-h1">{displayHeroHeadline}</h1>}
                {displayHeroBody && <p className="fr-hero-body">{displayHeroBody}</p>}
                {(showCtaPrimary || showCtaSecondary) && (
                  <div className="fr-cta-row">
                    {showCtaPrimary && (
                      <button className="fr-btn" onClick={ctaClick(displayCtaPrimaryTarget)}>
                        {displayCtaPrimary}
                      </button>
                    )}
                    {showCtaSecondary && (
                      <button className="fr-btn-ghost" onClick={ctaClick(displayCtaSecondaryTarget)}>
                        {displayCtaSecondary}
                      </button>
                    )}
                  </div>
                )}
                {promoCountdown && (
                  <PromoCountdown expiresAt={promoCountdown.expires_at}>
                    {(timeLeft) => timeLeft && (
                      <div className="fr-timer-row">
                        {(liveHeroSaleHeadline ?? config.hero_sale_headline) && <div className="fr-sale-headline">{liveHeroSaleHeadline ?? config.hero_sale_headline}</div>}
                        <div className="fr-timer-note">
                          {liveHeroCountdownLabel ?? config.hero_countdown_label ?? `${promoCountdown.code} ends in`}
                        </div>
                        <div className="fr-timer-digits">{timeLeft}</div>
                      </div>
                    )}
                  </PromoCountdown>
                )}
              </div>
            </section>
          </EditSection>
        )}

        {/* COLLECTION HEADER — only on collection page */}
        {isCollectionView && (
          <div className="fr-coll-header">
            <button
              type="button"
              className="fr-coll-back"
              onClick={() => {
                if (typeof window !== "undefined" && window.history.length > 1) router.back();
                else navigate(sp());
              }}
            >
              ← Back
            </button>
            <h1 className="fr-coll-title">{collectionName}</h1>
            <div className="fr-coll-count">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</div>
          </div>
        )}

        {/* COLLECTIONS GRID — only on landing page */}
        {!isCollectionView && categoryList.length > 0 && (
          <EditSection id="categories">
            <div className="fr-section" style={{ paddingBottom: 0 }}>
              <div className="fr-section-head">
                <h2 className="fr-section-title">Shop by Collection</h2>
              </div>
              <div className="fr-cat-grid">
                {categoryList.map((cat) => {
                  const img = catImage(cat);
                  return (
                    <button key={cat} className="fr-cat-card" onClick={() => navigate(sp(`/c/${collectionSlug(cat)}`))}>
                      <div className="fr-cat-img">
                        {img ? <img src={img} alt={cat} loading="lazy" decoding="async" /> : <span className="fr-cat-mark">{cat}</span>}
                      </div>
                      <div className="fr-cat-foot">
                        <div className="fr-cat-name">{cat}</div>
                        <div className="fr-cat-count">{catCount(cat)} {catCount(cat) === 1 ? "piece" : "pieces"}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </EditSection>
        )}

        {/* PRODUCTS */}
        <div id="fr-products" className="fr-section" style={{ paddingTop: isCollectionView ? 24 : undefined }}>
          <div className="fr-section-head">
            <h2 className="fr-section-title">{effectiveCategory === "All" ? (liveProductsHeading ?? config.products_heading ?? "New Arrivals") : effectiveCategory}</h2>
            <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
              <select value={productSort} onChange={(e) => setProductSort(e.target.value)} className="fr-sort-select" aria-label="Sort products">
                <option value="default">Sort: Default</option>
                <option value="latest">Newest</option>
                <option value="oldest">Oldest</option>
                <option value="az">A — Z</option>
                <option value="za">Z — A</option>
                <option value="price-low">Price: Low to High</option>
                <option value="price-high">Price: High to Low</option>
              </select>
              <span className="fr-count">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</span>
            </div>
          </div>
          <EditSection id="products">
            <div className="fr-pgrid">
              {filtered.map((p) => {
                const onSale = p.old_price && p.old_price > p.price;
                const promo = getProductPromo(p.id);
                return (
                  <div key={p.id} className="fr-pcard" onClick={() => openProduct(p)}>
                    {promo && <span className="fr-ptag sale">{promo.type === "percentage" ? `-${promo.value}%` : "Sale"}</span>}
                    {!promo && onSale && <span className="fr-ptag sale">Sale</span>}
                    <div className="fr-pimg">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name} loading="lazy" decoding="async" />
                      ) : (
                        <span className="fr-p-mark">{initials(p.name)}</span>
                      )}
                    </div>
                    <div className="fr-pinfo">
                      <div className="fr-pcat">{p.category}</div>
                      <div className="fr-pname">{p.name}</div>
                      <div className="fr-pprice">
                        {onSale && <span className="was">{fmt(p.old_price!)}</span>}
                        {fmt(p.price)}
                      </div>
                      <button className="fr-pwa" type="button" onClick={(e) => { e.stopPropagation(); openProduct(p); }}>
                        Add to Bag
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </EditSection>
        </div>

        {/* NEWSLETTER — only on landing page */}
        {!isCollectionView && showNewsletter && (
          <EditSection id="newsletter">
            <section className="fr-newsletter">
              <div className="fr-nl-lbl">{nlLabel}</div>
              <h2 className="fr-nl-title">{nlTitle}</h2>
              <p className="fr-nl-sub">{nlSub}</p>
              <form className="fr-nl-form" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector("button") as HTMLButtonElement).textContent = "Joined ✓"; }}>
                <input type="email" placeholder="your@email.com" required />
                <button type="submit">Subscribe</button>
              </form>
            </section>
          </EditSection>
        )}

        {/* FOOTER */}
        <EditSection id="footer">
          <footer className="fr-foot">
            <div className="fr-foot-grid">
              <div>
                {displayLogo
                  ? <img src={displayLogo} alt={seller.store_name} className="fr-foot-logo" />
                  : <div className="fr-foot-brand">{seller.store_name}</div>}
                <p className="fr-foot-tag">{displayFooterTagline}</p>
                <div className="fr-foot-soc">
                  {seller.social_links?.instagram && (
                    <a href={seller.social_links.instagram} target="_blank" rel="noreferrer" aria-label="Instagram">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1"/></svg>
                    </a>
                  )}
                  {seller.social_links?.tiktok && (
                    <a href={seller.social_links.tiktok} target="_blank" rel="noreferrer" aria-label="TikTok">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M16.6 5.82s.51.5 0 0A4.278 4.278 0 0 1 15.54 3h-3.09v12.4a2.592 2.592 0 0 1-2.59 2.5c-1.42 0-2.6-1.16-2.6-2.6 0-1.72 1.66-3.02 3.37-2.48V9.66c-3.45-.46-6.47 2.22-6.47 5.64 0 3.33 2.76 5.7 5.69 5.7 3.14 0 5.69-2.55 5.69-5.7V9.01a7.35 7.35 0 0 0 4.31 1.38V7.3s-1.88.09-3.25-1.48Z"/></svg>
                    </a>
                  )}
                  {seller.social_links?.facebook && (
                    <a href={seller.social_links.facebook} target="_blank" rel="noreferrer" aria-label="Facebook">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M13.5 21v-7.5H16l.5-3h-3V8.25c0-.87.24-1.46 1.49-1.46H16.6V4.14C16.3 4.1 15.28 4 14.1 4c-2.44 0-4.11 1.49-4.11 4.22V10.5H7.5v3H10V21h3.5Z"/></svg>
                    </a>
                  )}
                  {seller.social_links?.twitter && (
                    <a href={seller.social_links.twitter} target="_blank" rel="noreferrer" aria-label="X / Twitter">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M18.9 3H22l-7.6 8.7L23 21h-6.9l-5.4-6.6L4.5 21H1.4l8.1-9.3L1 3h7.1l4.9 6.1L18.9 3Zm-1.2 16h1.7L7.4 4.9H5.6L17.7 19Z"/></svg>
                    </a>
                  )}
                  {seller.whatsapp_number && (
                    <a href={`https://wa.me/${seller.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.468l4.573-1.46A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.18-.637-5.882-1.727l-.42-.28-3.064.978.992-2.96-.298-.442A9.808 9.808 0 012.182 12c0-5.422 4.396-9.818 9.818-9.818S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/></svg>
                    </a>
                  )}
                </div>
                {config.physical_address && (
                  <div style={{ marginTop: 20, fontSize: 12, color: "rgba(46,42,57,0.65)", lineHeight: 1.6, display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    <span>{config.physical_address}</span>
                  </div>
                )}
              </div>
              <div className="fr-foot-col">
                <h4>{displayFooterCol1}</h4>
                <ul>
                  {menuCategories.slice(0, 5).map((cat) => {
                    const target = sp(`/c/${cat === "All" ? "all" : collectionSlug(cat)}`);
                    return (
                      <li key={cat}>
                        <a href={target} onClick={(e) => { e.preventDefault(); navigate(target); }}>
                          {cat === "All" ? "All Products" : cat}
                        </a>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <div className="fr-foot-col">
                <h4>Support</h4>
                <ul>
                  <li><button onClick={() => setPolicyModal({ title: "Shipping Policy", content: config.shipping_policy || "Contact us for details about our shipping policy." })}>Shipping</button></li>
                  <li><button onClick={() => setPolicyModal({ title: "Returns & Refunds", content: config.return_policy || "Contact us for details about our returns and refund policy." })}>Returns & Refunds</button></li>
                  <li><button onClick={() => setContactOpen(true)}>Contact</button></li>
                </ul>
              </div>
              <div className="fr-foot-col">
                <h4>Payment Methods</h4>
                <div className="fr-pay-grid">
                  {seller.checkout_config?.payfast_enabled && (<>
                    <span className="fr-pay-icon" title="Visa">VISA</span>
                    <span className="fr-pay-icon" title="Mastercard">MC</span>
                  </>)}
                  {seller.checkout_config?.eft_enabled && (
                    <button onClick={() => setPolicyModal({ title: "EFT / Direct Deposit", content: "Select EFT/Direct Deposit at checkout. You’ll receive payment instructions to complete your order via EFT." })} style={{ marginTop: 4, fontSize: 12 }}>EFT / Direct Deposit</button>
                  )}
                  {seller.checkout_config?.whatsapp_checkout_enabled && seller.whatsapp_number && (
                    <button onClick={() => setPolicyModal({ title: "WhatsApp Order", content: "Select WhatsApp Order at checkout to complete your order via WhatsApp with us." })} style={{ marginTop: 4, fontSize: 12 }}>WhatsApp Order</button>
                  )}
                </div>
              </div>
            </div>
            <div className="fr-foot-bot">
              <span>© {new Date().getFullYear()} {seller.store_name}</span>
              <span style={{ fontStyle: "italic" }}>Powered by CatalogStore</span>
            </div>
          </footer>
        </EditSection>
      </div>

      {/* Policy / info modal */}
      {policyModal && (
        <div className="fr-modal-overlay" onClick={() => setPolicyModal(null)}>
          <div className="fr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="fr-modal-close" onClick={() => setPolicyModal(null)}>✕</button>
            <h3>{policyModal.title}</h3>
            <p>{policyModal.content}</p>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {contactOpen && (
        <div className="fr-modal-overlay" onClick={() => setContactOpen(false)}>
          <div className="fr-modal" onClick={(e) => e.stopPropagation()}>
            <button className="fr-modal-close" onClick={() => setContactOpen(false)}>✕</button>
            <h3>Contact Us</h3>
            <ul className="fr-contact-list">
              {seller.whatsapp_number && (
                <li>
                  <span className="fr-contact-label">WhatsApp</span>
                  <a href={`https://wa.me/${seller.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{seller.whatsapp_number}</a>
                </li>
              )}
              {config.contact_email && (
                <li>
                  <span className="fr-contact-label">Email</span>
                  <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>
                </li>
              )}
              {config.contact_phone && (
                <li>
                  <span className="fr-contact-label">Call</span>
                  <a href={`tel:${config.contact_phone.replace(/\s/g, "")}`}>{config.contact_phone}</a>
                </li>
              )}
              {seller.social_links?.instagram && (
                <li><span className="fr-contact-label">Instagram</span><a href={seller.social_links.instagram} target="_blank" rel="noreferrer">Instagram</a></li>
              )}
              {seller.social_links?.tiktok && (
                <li><span className="fr-contact-label">TikTok</span><a href={seller.social_links.tiktok} target="_blank" rel="noreferrer">TikTok</a></li>
              )}
              {seller.social_links?.facebook && (
                <li><span className="fr-contact-label">Facebook</span><a href={seller.social_links.facebook} target="_blank" rel="noreferrer">Facebook</a></li>
              )}
              {seller.social_links?.twitter && (
                <li><span className="fr-contact-label">X / Twitter</span><a href={seller.social_links.twitter} target="_blank" rel="noreferrer">X / Twitter</a></li>
              )}
              {config.operating_hours && (
                <li>
                  <span className="fr-contact-label">Hours</span>
                  <span style={{ fontSize: 13, color: "var(--ink)" }}>{config.operating_hours}</span>
                </li>
              )}
              {config.physical_address && (
                <li>
                  <span className="fr-contact-label">Address</span>
                  <span style={{ fontSize: 13, color: "var(--ink)" }}>{config.physical_address}</span>
                </li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}

// Full-screen lightbox gallery for the PDP -- same swipe/arrow-key/pinch-zoom
// behaviour as Heirloom's version, restyled for this template's local class
// names since it isn't exported from HeirloomStore.tsx.
function LightboxGallery({ imgs, index, onClose, onIndex }: {
  imgs: string[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const onTouchStart = (e: ReactTouchEvent) => setTouchStartX(e.touches[0].clientX);
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && index < imgs.length - 1) onIndex(index + 1);
    else if (dx > 0 && index > 0) onIndex(index - 1);
  };

  return (
    <div className="fr-lb" onClick={onClose} role="dialog" aria-modal="true" aria-label="Product images">
      <button className="fr-lb-close" type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">✕</button>
      <div className="fr-lb-stage" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <img src={imgs[index]} alt="" className="fr-lb-img" draggable={false} />
      </div>
      {imgs.length > 1 && (
        <>
          {index > 0 && (
            <button className="fr-lb-nav fr-lb-prev" type="button" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} aria-label="Previous image">‹</button>
          )}
          {index < imgs.length - 1 && (
            <button className="fr-lb-nav fr-lb-next" type="button" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} aria-label="Next image">›</button>
          )}
          <div className="fr-lb-dots" onClick={(e) => e.stopPropagation()}>
            {imgs.map((_, i) => (
              <button key={i} type="button" className={"fr-lb-dot" + (i === index ? " active" : "")} onClick={() => onIndex(i)} aria-label={`Image ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
