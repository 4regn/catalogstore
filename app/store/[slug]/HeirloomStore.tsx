"use client";

import { useState, useEffect, useRef, useTransition, type TouchEvent as ReactTouchEvent } from "react";
import Image from "next/image";
import { supabase } from "../../../lib/supabase";
import { useParams, useSearchParams, useRouter } from "next/navigation";

const pInCat = (p: { category: string }, cat: string) =>
  (p.category || "").split(",").map((c) => c.trim()).includes(cat);

/* ─── TYPES ─────────────────────────────────────────────── */
interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string;
  facebook?: string; twitter?: string;
}

// Where a hero CTA points. "products" = scroll-jump down to the product grid.
// "collection" = navigate to /store/<slug>/c/<collection-slug>. "url" = open an
// arbitrary URL (external supported). "none" = don't render the button at all.
type CtaTarget =
  | { type: "products" }
  | { type: "collection"; collection: string }
  | { type: "url"; url: string }
  | { type: "none" };
interface StoreConfig {
  announcement?: string;
  show_announcement?: boolean;
  ticker_texts?: string[];
  marquee_texts?: string[];
  ticker_speed?: number;
  hero_image?: string;
  hero_index?: string;
  hero_label?: string;
  hero_headline?: string;
  hero_headline_em?: string;
  hero_body?: string;
  hero_cta_primary?: string;
  hero_cta_secondary?: string;
  hero_cta_primary_target?: CtaTarget;
  hero_cta_secondary_target?: CtaTarget;
  footer_tagline?: string;
  footer_col1_label?: string;
  hero_countdown_label?: string;
  featured_product_id?: string;
  flash_sale_label?: string;
  flash_sale_title?: string;
  show_flash_sale?: boolean;
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
}
interface Seller {
  id: string; store_name: string; whatsapp_number: string;
  subdomain: string; template: string; primary_color: string;
  logo_url: string; tagline: string; description: string;
  collections: string[]; social_links: SocialLinks;
  store_config: StoreConfig; subscription_status?: string;
  checkout_config?: {
    eft_enabled?: boolean;
    payfast_enabled?: boolean;
    whatsapp_checkout_enabled?: boolean;
  };
}
interface Variant { name: string; options: string[]; images?: { [option: string]: string }; }
interface Product {
  id: string; name: string; price: number; old_price: number | null;
  category: string; image_url: string | null; images: string[];
  variants: Variant[]; in_stock: boolean; description: string;
  sort_order: number;
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
const pad = (n: number) => String(n).padStart(2, "0");
const slugify = (s: string) => s.toLowerCase().split(" — ")[0].split(" ")[0];

// URL-safe slug for collection names. "Rare Finds" -> "rare-finds", "Under R1000" -> "under-r1000".
// Used to build collection-page URLs from collection display names.
export const collectionSlug = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

interface StorePageProps {
  initialSeller?: Seller;
  initialProducts?: Product[];
  initialDiscountCodes?: any[];
  // When mode === "collection" the page renders just nav/footer/cart shell + a single
  // collection's products. The hero, categories grid, flash sale and newsletter sections
  // are skipped because they belong on the landing page.
  mode?: "home" | "collection";
  collectionName?: string;
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

export default function HeirloomStore({ initialSeller, initialProducts, initialDiscountCodes, mode = "home", collectionName }: StorePageProps = {}) {
  const isCollectionView = mode === "collection";
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  // Wrap router.push so we can show a progress bar at the top of the page during the
  // server-rendered collection / home navigations (otherwise the page just silently
  // reloads, which feels broken to customers used to traditional sites).
  const [isNavigating, startNavigation] = useTransition();
  const navigate = (path: string) => startNavigation(() => router.push(path));
  const slug = params.slug as string;
  const isEditMode = searchParams.get("editMode") === "true";

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
  const [liveHeroImage, setLiveHeroImage] = useState<string | null>(null);
  const [liveHeroIndex, setLiveHeroIndex] = useState<string | null>(null);
  const [liveHeroLabel, setLiveHeroLabel] = useState<string | null>(null);
  const [liveHeroHeadline, setLiveHeroHeadline] = useState<string | null>(null);
  const [liveHeroBody, setLiveHeroBody] = useState<string | null>(null);
  const [liveHeroCtaPrimary, setLiveHeroCtaPrimary] = useState<string | null>(null);
  const [liveHeroCtaSecondary, setLiveHeroCtaSecondary] = useState<string | null>(null);
  const [liveHeroCtaPrimaryTarget, setLiveHeroCtaPrimaryTarget] = useState<CtaTarget | null>(null);
  const [liveHeroCtaSecondaryTarget, setLiveHeroCtaSecondaryTarget] = useState<CtaTarget | null>(null);
  const [liveFooterTagline, setLiveFooterTagline] = useState<string | null>(null);
  const [liveFooterCol1Label, setLiveFooterCol1Label] = useState<string | null>(null);
  const [policyModal, setPolicyModal] = useState<{ title: string; content: string } | null>(null);
  const [contactOpen, setContactOpen] = useState(false);
  const [liveHeroCountdownLabel, setLiveHeroCountdownLabel] = useState<string | null>(null);
  const [liveTicker, setLiveTicker] = useState<string[] | null>(null);
  const [liveTickerSpeed, setLiveTickerSpeed] = useState<number | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  /* ─── PROMO ─── */
  const [promoCountdown, setPromoCountdown] = useState<PromoDiscount | null>(() => buildInitialPromos(initialDiscountCodes).countdown);
  const [promoDiscounts, setPromoDiscounts] = useState<PromoDiscount[]>(() => buildInitialPromos(initialDiscountCodes).discounts);

  /* ─── UI ─── */
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  // Lightbox gallery: when set, full-screen overlay shows the product's images and lets the
  // customer swipe / tap arrows / press arrow keys to browse, and pinch-zoom natively.
  const [lightbox, setLightbox] = useState<{ imgs: string[]; index: number } | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<{ [k: string]: string }>({});
  const [localQty, setLocalQty] = useState(1);
  const [variantError, setVariantError] = useState(false);

  /* ─── CART ─── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* ─── NAV ─── */
  const [, setScrolled] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const lastScrollY = useRef(0);

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

  /* ─── PROMO TICKER ─── */
  useEffect(() => {
    if (promoDiscounts.length === 0 && !promoCountdown?.expires_at) return;
    const tick = () => {
      const now = new Date().getTime();
      if (promoCountdown?.expires_at) {
        const diff = new Date(promoCountdown.expires_at).getTime() - now;
        if (diff <= 0) setPromoCountdown(null);
        else {
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          const tl = pad(h) + ":" + pad(m) + ":" + pad(s);
          setPromoCountdown((prev) => prev ? { ...prev, timeLeft: tl } : null);
        }
      }
      setPromoDiscounts((prev) =>
        prev.map((p) => {
          const diff = new Date(p.expires_at).getTime() - now;
          if (diff <= 0) return { ...p, timeLeft: "EXPIRED" };
          const h = Math.floor(diff / 3600000);
          const m = Math.floor((diff % 3600000) / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          return { ...p, timeLeft: pad(h) + ":" + pad(m) + ":" + pad(s) };
        }).filter((p) => p.timeLeft !== "EXPIRED")
      );
    };
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [promoDiscounts.length, promoCountdown?.expires_at]);

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
      if (e.data.heroImage !== undefined) setLiveHeroImage(e.data.heroImage);
      if (e.data.heroIndex !== undefined) setLiveHeroIndex(e.data.heroIndex);
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
      if (e.data.ticker !== undefined) setLiveTicker(e.data.ticker);
      if (e.data.tickerSpeed !== undefined) setLiveTickerSpeed(e.data.tickerSpeed);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  /* ─── SCROLL ─── */
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* ─── BODY SCROLL LOCK ─── */
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
    return () => window.removeEventListener("keydown", onKey);
    return () => { document.body.style.overflow = ""; };
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
      return `• ${i.product.name}${vars ? ` (${vars})` : ""} x ${i.qty} — ${fmt(i.product.price * i.qty)}`;
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
  // Checkout page reads cart from a base64-encoded `?cart=` URL param, not sessionStorage.
  // Match the encoding the other templates already use so checkout receives our items.
  const goToCheckout = () => {
    const payload = cart.map((i) => ({
      name: i.product.name,
      price: i.product.price,
      qty: i.qty,
      variant: Object.entries(i.selectedVariants).map(([k, v]) => k + ": " + v).join(", "),
      image: i.product.image_url || "",
    }));
    const encoded = btoa(JSON.stringify(payload));
    window.location.href = `/store/${slug}/checkout?cart=${encoded}`;
  };

  /* ─── DERIVED ─── */
  const allCategories = ["All", ...Array.from(new Set(products.flatMap((p) => (p.category || "").split(",").map((c) => c.trim()).filter(Boolean))))];
  const categoryList = allCategories.filter((c) => c !== "All").slice(0, 4);
  // Hamburger menu sourced from the seller's full collections list so it stays consistent
  // across home and collection pages (where `products` only contains one collection).
  const menuCategories = ["All", ...((seller?.collections || []).filter(Boolean))];
  // In collection view, the URL pins us to one collection. The server already filtered the
  // products for us (handles both named collections and the special "all" slug), so we just
  // render whatever it sent. The in-page activeCategory filter only applies on the home page.
  const effectiveCategory = isCollectionView && collectionName ? collectionName : activeCategory;
  const filtered = isCollectionView
    ? products
    : (activeCategory === "All" ? products : products.filter((p) => pInCat(p, activeCategory)));
  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const FREE_SHIP = seller?.store_config?.free_ship_threshold ?? null;
  const freeShipRem = FREE_SHIP ? Math.max(0, FREE_SHIP - cartTotal) : 0;

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
        <div style={{ width: 28, height: 28, border: "1px solid #e0dbd5", borderTopColor: "#111", borderRadius: "50%", animation: "spin 0.9s linear infinite" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }
  if (notFound || !seller) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#fff", padding: 32, textAlign: "center", fontFamily: "'DM Sans', sans-serif" }}>
        <div>
          <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, fontStyle: "italic", marginBottom: 12 }}>not found.</div>
          <div style={{ fontSize: 14, color: "#777" }}>This store doesn&apos;t exist or has been removed.</div>
        </div>
      </div>
    );
  }

  /* ─── DISPLAY VALUES ─── */
  const config = seller.store_config ?? {};
  const displayLogo = liveLogoUrl ?? seller.logo_url ?? null;
  const displayAnnouncement = liveAnnouncement ?? config.announcement ?? null;
  const displayHeroImage = liveHeroImage ?? config.hero_image ?? null;
  const displayHeroIndex = liveHeroIndex ?? config.hero_index ?? "";
  const displayHeroLabel = liveHeroLabel ?? config.hero_label ?? "";
  const displayHeroHeadline = liveHeroHeadline ?? config.hero_headline ?? "";
  const displayHeroEm = config.hero_headline_em ?? "";
  const displayHeroBody = liveHeroBody ?? config.hero_body ?? "";
  const displayCtaPrimary = liveHeroCtaPrimary ?? config.hero_cta_primary ?? "";
  // Default empty (not "Join Waitlist") -- there's no waitlist feature, so the
  // secondary CTA should only appear if the seller has explicitly set both its
  // label AND a target. Empty label or `none` target hides the button.
  const displayCtaSecondary = liveHeroCtaSecondary ?? config.hero_cta_secondary ?? "";
  const displayCtaPrimaryTarget: CtaTarget = liveHeroCtaPrimaryTarget ?? config.hero_cta_primary_target ?? { type: "products" };
  const displayCtaSecondaryTarget: CtaTarget = liveHeroCtaSecondaryTarget ?? config.hero_cta_secondary_target ?? { type: "none" };

  // Build a click handler for whatever destination the seller picked.
  const ctaClick = (target: CtaTarget) => () => {
    if (target.type === "products") {
      document.getElementById("hl-products")?.scrollIntoView({ behavior: "smooth" });
    } else if (target.type === "collection") {
      navigate(`/store/${slug}/c/${target.collection}`);
    } else if (target.type === "url") {
      if (target.url) window.open(target.url, "_blank", "noopener");
    }
    // target.type === "none" -> button shouldn't render at all; no-op fallback.
  };
  const showCtaPrimary = displayCtaPrimary.trim() !== "" && displayCtaPrimaryTarget.type !== "none";
  const showCtaSecondary = displayCtaSecondary.trim() !== "" && displayCtaSecondaryTarget.type !== "none";

  // Footer display values. footer_tagline takes priority over seller.description
  // (so the seller can have a different blurb in the footer vs. elsewhere). Falls
  // back through the chain so legacy data still renders.
  const displayFooterTagline = liveFooterTagline ?? config.footer_tagline ?? liveDescription ?? seller.description ?? seller.tagline ?? "";
  const displayFooterCol1 = liveFooterCol1Label ?? config.footer_col1_label ?? "Shop";
  const displayTicker = liveTicker ?? config.ticker_texts ?? config.marquee_texts ?? [];
  const tickerDuration = liveTickerSpeed ?? config.ticker_speed ?? 36;
  const showFlash = config.show_flash_sale ?? true;
  const flashLabel = config.flash_sale_label ?? "Limited Time";
  const flashTitle = config.flash_sale_title ?? "Flash Sale";
  const showNewsletter = config.show_newsletter ?? true;
  const nlLabel = config.newsletter_label ?? "Stay Posted";
  const nlTitle = config.newsletter_title ?? "First in line for the next drop.";
  const nlSub = config.newsletter_sub ?? "We email when new releases drop and when archive pieces restock. Nothing else, ever.";

  /* ─── FEATURED PRODUCT for hero pill ─── */
  const featuredProduct = config.featured_product_id
    ? products.find((p) => p.id === config.featured_product_id) ?? products[0]
    : products[0];

  /* ─── FLASH SALE PRODUCTS (those with active product-level promos) ─── */
  const flashSaleProducts = products.filter((p) => getProductPromo(p.id)).slice(0, 3);

  /* ─── HERO TIMER DISPLAY ─── */
  // Only render when there's a real active discount with show_countdown set.
  // Removed the previous decorative-only fallback so sellers without a sale
  // don't broadcast a fake "Drop ends in 04:22:15" countdown forever -- same
  // behaviour GC + SL already use.
  const heroTimerParts = promoCountdown?.timeLeft?.split(":") ?? null;

  /* ─── CATEGORY IMAGE: first product image in that category ─── */
  const catImage = (cat: string) => {
    const p = products.find((p) => pInCat(p, cat) && p.image_url);
    return p?.image_url || null;
  };
  const catCount = (cat: string) => products.filter((p) => pInCat(p, cat)).length;

  /* ─── IMAGE FALLBACK PATTERNS ─── */
  const imgPatternIdx = (i: number) => (i % 8) + 1;

  /* ─── EDIT SECTION WRAPPER ─── */
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
          outline: isHovered ? "2px solid #111" : "2px solid transparent",
          outlineOffset: -2,
          cursor: "pointer",
          transition: "outline-color 0.2s",
        }}
      >
        {isHovered && (
          <div style={{
            position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)",
            background: "#111", color: "#fff",
            fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase",
            padding: "5px 12px", zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap",
            borderRadius: 999, display: "inline-flex", alignItems: "center", gap: 6,
            boxShadow: "0 4px 14px rgba(0,0,0,0.3)",
          }}>
            <svg width="11" height="11" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="m4 16 1-3 9-9a1.5 1.5 0 0 1 2.5 1.5l-9 9-3 1Z"/>
              <path d="m12 5 2.5 2.5"/>
            </svg>
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
@import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:wght@300;400;500&family=Bebas+Neue&display=swap');
.hl-root *,.hl-root *::before,.hl-root *::after{box-sizing:border-box}
.hl-root{
  --ink:#111010;--paper:#fff;--mid:#f2f0ed;--warm:#ebe6e0;
  --dim:#595959;--rule:#e0dbd5;
  --serif:'DM Serif Display',Georgia,serif;
  --sans:'DM Sans',sans-serif;
  --display:'Bebas Neue',sans-serif;
  font-family:var(--sans);background:var(--paper);color:var(--ink);
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
.hl-ticker{background:var(--ink);color:var(--paper);padding:10px 0;overflow:hidden;white-space:nowrap}
.hl-ticker-inner{display:inline-flex;animation:hltick ${tickerDuration}s linear infinite}
.hl-ticker-inner span{font-size:11px;font-weight:500;letter-spacing:2.5px;text-transform:uppercase;padding:0 40px}
.hl-ticker-inner span::before{content:'—';margin-right:40px;opacity:0.3}
@keyframes hltick{from{transform:translateX(0)}to{transform:translateX(-50%)}}

.hl-nav{position:sticky;top:0;z-index:100;background:#fff;border-bottom:1px solid var(--rule);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;padding:0 48px;height:64px}
.hl-nav-left,.hl-nav-right-links{display:flex;gap:32px;align-items:center}
.hl-nav-right{display:flex;justify-content:flex-end;align-items:center;gap:24px}
.hl-link{font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:var(--dim);transition:color 0.2s;background:none;border:none;cursor:pointer;font-family:var(--sans)}
.hl-link:hover{color:var(--ink)}
.hl-logo{font-family:var(--serif);font-style:italic;font-size:26px;letter-spacing:1px;color:var(--ink);text-decoration:none;line-height:1;justify-self:center}
.hl-logo img{height:32px;width:auto;display:block}
.hl-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:200;background:var(--rule);overflow:hidden;pointer-events:none}
.hl-progress::after{content:"";position:absolute;top:0;left:0;height:100%;width:40%;background:var(--ink);border-radius:0 2px 2px 0;animation:hl-progress 0.8s ease-in-out infinite}
@keyframes hl-progress{from{transform:translateX(-40%)}to{transform:translateX(250%)}}
.hl-bag{font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:var(--ink);border:none;border-bottom:1px solid var(--ink);padding:0 0 1px;background:none;cursor:pointer;font-family:var(--sans)}
.hl-bag:hover{opacity:0.5}
.hl-bag-count{display:inline-block;margin-left:4px;font-weight:700}
.hl-burger{display:flex;background:none;border:none;cursor:pointer;width:24px;height:24px;flex-direction:column;justify-content:space-between;padding:5px 0}
.hl-burger span{display:block;width:100%;height:1px;background:var(--ink);transition:0.3s}

.hl-hero{position:relative;width:100%;height:100vh;min-height:640px;border-bottom:1px solid var(--rule);overflow:hidden;display:flex;align-items:flex-end;background:radial-gradient(ellipse at 75% 30%,rgba(90,80,70,0.4) 0%,transparent 60%),linear-gradient(180deg,#1a1715 0%,#0d0b0a 100%)}
.hl-hero.has-img{background:none}
.hl-hero-bgimg{position:absolute;inset:0;z-index:0;background-size:cover;background-position:center;background-repeat:no-repeat}
.hl-hero::before{content:'';position:absolute;inset:0;background-image:radial-gradient(circle at 30% 70%,rgba(255,240,220,0.06) 0%,transparent 50%),radial-gradient(circle at 70% 20%,rgba(255,220,180,0.04) 0%,transparent 40%);z-index:0;pointer-events:none}
.hl-hero-overlay{position:absolute;top:0;left:0;right:0;bottom:0;z-index:2;background:linear-gradient(to top,rgba(8,8,8,0.9) 0%,rgba(8,8,8,0.45) 50%,rgba(8,8,8,0.15) 100%)}
.hl-hero-left{position:relative;z-index:3;width:100%;max-width:720px;padding:0 72px 64px}
.hl-hero-index{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.45);margin-bottom:14px}
.hl-hero-label{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.55);margin-bottom:24px;display:flex;align-items:center;gap:12px}
.hl-hero-label::before{content:'';display:block;width:24px;height:1px;background:rgba(255,255,255,0.4)}
.hl-hero-h1{font-family:var(--serif);font-size:clamp(48px,6.5vw,86px);line-height:0.97;font-weight:400;color:#fff;margin-bottom:22px;letter-spacing:-0.5px}
.hl-hero-h1 em{font-style:italic;font-weight:400}
.hl-hero-body{font-size:15px;font-weight:300;line-height:1.7;color:rgba(255,255,255,0.62);max-width:440px;margin-bottom:36px;white-space:pre-line}
.hl-cta-row{display:flex;align-items:center;gap:24px;margin-bottom:40px;flex-wrap:wrap}
.hl-btn-solid{display:inline-block;background:#f9f7f4;color:#111;font-size:10px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;text-decoration:none;padding:15px 32px;transition:opacity 0.2s;border:none;cursor:pointer;font-family:var(--sans)}
.hl-btn-solid:hover{opacity:0.82}
.hl-btn-text{font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:rgba(255,255,255,0.65);border:none;border-bottom:1px solid rgba(255,255,255,0.25);padding:0 0 2px;transition:color 0.2s,border-color 0.2s;background:none;cursor:pointer;font-family:var(--sans)}
.hl-btn-text:hover{color:#fff;border-color:rgba(255,255,255,0.6)}
.hl-timer-row{display:flex;flex-direction:column;gap:6px}
.hl-timer-note{font-size:9px;letter-spacing:2.5px;text-transform:uppercase;color:rgba(255,255,255,0.42)}
.hl-timer-digits{font-family:var(--display);font-size:54px;letter-spacing:3px;line-height:1;color:#fff}
.hl-timer-digits .sep{color:rgba(255,255,255,0.22);margin:0 2px}

.hl-pill{position:absolute;bottom:64px;right:64px;z-index:3;background:rgba(0,0,0,0.4);border:1px solid rgba(255,255,255,0.16);padding:18px 22px;text-align:right;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);cursor:pointer}
.hl-pill-label{font-size:9px;letter-spacing:3px;text-transform:uppercase;color:rgba(255,255,255,0.5)}
.hl-pill-name{font-family:var(--serif);font-size:18px;line-height:1.2;margin-top:4px;color:#fff}
.hl-pill-price{font-size:12px;color:rgba(255,255,255,0.65);margin-top:4px;letter-spacing:0.5px}

.hl-rule{display:flex;align-items:center;justify-content:space-between;padding:28px 48px;border-bottom:1px solid var(--rule);background:#fff}
.hl-rule-left{font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#888}
.hl-rule-right{font-size:11px;letter-spacing:2px;text-transform:uppercase;text-decoration:none;color:var(--ink);border:none;border-bottom:1px solid var(--ink);padding:0 0 1px;background:none;cursor:pointer;font-family:var(--sans)}
.hl-rule-right:hover{opacity:0.5}

.hl-coll-header{padding:64px 48px 48px;border-bottom:1px solid var(--rule);background:#fff;display:flex;flex-direction:column;gap:8px;align-items:flex-start}
.hl-coll-back{display:inline-block;background:none;border:none;border-bottom:1px solid var(--rule);padding:0 0 2px;font-family:var(--sans);font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);text-decoration:none;cursor:pointer;transition:color 0.2s,border-color 0.2s}
.hl-coll-back:hover{color:var(--ink);border-color:var(--ink)}
.hl-coll-title{font-family:var(--serif);font-size:clamp(36px,5vw,64px);font-weight:400;color:var(--ink);line-height:1;margin:8px 0 4px;letter-spacing:-0.01em}
.hl-coll-count{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--dim)}
.hl-cat-row{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--rule);background:#fff}
.hl-cat-item{position:relative;overflow:hidden;border-right:1px solid var(--rule);text-decoration:none;color:var(--ink);display:block;cursor:pointer;background:none;border-top:none;border-bottom:none;border-left:none;font-family:var(--sans);text-align:left;padding:0;width:100%}
.hl-cat-item:last-child{border-right:none}
.hl-cat-img{width:100%;aspect-ratio:3/4;display:block;position:relative;overflow:hidden;background:var(--mid)}
.hl-cat-img-inner{position:absolute;inset:0;transition:transform 0.6s cubic-bezier(0.16,1,0.3,1);display:flex;align-items:flex-end;justify-content:flex-start;padding:22px;background-size:cover;background-position:center}
.hl-cat-item:hover .hl-cat-img-inner,.hl-cat-item:hover .hl-cat-img > img{transform:scale(1.05)}
.hl-cat-img > img{transition:transform 0.6s cubic-bezier(0.16,1,0.3,1)}
.hl-cat-mark{font-family:var(--serif);font-style:italic;font-size:46px;line-height:1;color:rgba(255,255,255,0.18);letter-spacing:-1px}
.hl-pat-1{background:linear-gradient(160deg,#3a342f 0%,#1f1c19 70%)}
.hl-pat-2{background:linear-gradient(160deg,#d8d2ca 0%,#b8b0a4 100%)}
.hl-pat-3{background:linear-gradient(160deg,#5a4f43 0%,#2a241f 80%)}
.hl-pat-4{background:linear-gradient(160deg,#a89b8b 0%,#7a6e5e 100%)}
.hl-pat-2 .hl-cat-mark,.hl-pat-2 .hl-p-mark,.hl-pat-4 .hl-p-mark,.hl-pat-6 .hl-p-mark,.hl-pat-8 .hl-p-mark{color:rgba(0,0,0,0.18)}
.hl-cat-foot{padding:20px 24px;border-top:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;background:#fff}
.hl-cat-name{font-size:13px;font-weight:500;letter-spacing:1px}
.hl-cat-count{font-size:11px;color:var(--dim)}

.hl-pgrid{display:grid;grid-template-columns:repeat(4,1fr);border-bottom:1px solid var(--rule);background:#fff}
.hl-pcard{border-right:1px solid var(--rule);border-bottom:1px solid var(--rule);text-decoration:none;color:var(--ink);display:block;position:relative;overflow:hidden;background:#fff;cursor:pointer}
.hl-pcard:nth-child(4n){border-right:none}
.hl-pcard:nth-last-child(-n+4){border-bottom:none}
.hl-pimg{aspect-ratio:1;overflow:hidden;position:relative;background:var(--mid);display:flex;align-items:center;justify-content:center}
.hl-pimg-inner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:transform 0.6s cubic-bezier(0.16,1,0.3,1);background-size:cover;background-position:center}
.hl-pcard:hover .hl-pimg-inner,.hl-pcard:hover .hl-pimg-img{transform:scale(1.06)}
.hl-pat-5{background:linear-gradient(135deg,#dad4ca 0%,#b8b0a4 100%)}
.hl-pat-6{background:linear-gradient(140deg,#2c2724 0%,#161311 100%)}
.hl-pat-7{background:linear-gradient(145deg,#a89b8b 0%,#7a6e5e 100%)}
.hl-pat-8{background:linear-gradient(135deg,#f0ebe3 0%,#d4cdc1 100%)}
.hl-p-mark{font-family:var(--serif);font-style:italic;font-size:32px;line-height:1;color:rgba(255,255,255,0.18);letter-spacing:-0.5px}
.hl-ptag{position:absolute;top:14px;left:14px;z-index:2;font-size:9px;letter-spacing:2px;text-transform:uppercase;background:var(--ink);color:var(--paper);padding:4px 10px}
.hl-ptag.archive{background:#5a4d3f;color:#f0e8d8}
.hl-ptag.low{background:#7a3a3a;color:#fff}
.hl-pwa{position:absolute;bottom:0;left:0;right:0;z-index:2;background:var(--ink);color:var(--paper);font-size:10px;letter-spacing:2px;text-transform:uppercase;text-align:center;padding:12px;transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);border:none;cursor:pointer;font-family:var(--sans);width:100%;text-decoration:none;display:block}
.hl-pcard:hover .hl-pwa{transform:translateY(0)}
.hl-pinfo{padding:18px 20px 22px;background:#fff}
.hl-pcat{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#888;margin-bottom:5px}
.hl-pname{font-family:var(--serif);font-size:17px;font-weight:400;margin-bottom:10px;line-height:1.25;color:#111}
.hl-pfoot{display:flex;justify-content:space-between;align-items:center}
.hl-pprice{font-size:13px;font-weight:500}
.hl-pprice .was{font-size:11px;color:var(--dim);text-decoration:line-through;margin-right:6px;font-weight:400}

.hl-flash{border-bottom:1px solid var(--rule);background:#fff}
.hl-flash-h{display:grid;grid-template-columns:1fr auto;align-items:center;padding:32px 48px;border-bottom:1px solid var(--rule);gap:32px;background:#fff}
.hl-flash-title{font-family:var(--display);font-size:38px;letter-spacing:3px;color:#111;line-height:1}
.hl-flash-cd{font-family:var(--display);font-size:38px;letter-spacing:2px;color:#111;line-height:1}
.hl-flash-cd .sep{color:var(--rule);margin:0 2px}
.hl-flash-lbl{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888;display:block;margin-bottom:6px}
.hl-flash-grid{display:grid;grid-template-columns:repeat(3,1fr);background:#fff}
.hl-flash-card{border-right:1px solid var(--rule);text-decoration:none;color:var(--ink);display:block;overflow:hidden;cursor:pointer;background:none;border-top:none;border-bottom:none;border-left:none;font-family:var(--sans);text-align:left;padding:0;width:100%}
.hl-flash-card:last-child{border-right:none}
.hl-flash-img{width:100%;aspect-ratio:1;display:flex;align-items:center;justify-content:center;position:relative;overflow:hidden;background:var(--mid)}
.hl-flash-img-inner{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;transition:transform 0.5s cubic-bezier(0.16,1,0.3,1);background-size:cover;background-position:center}
.hl-flash-card:hover .hl-flash-img-inner,.hl-flash-card:hover .hl-flash-img-img{transform:scale(1.04)}
.hl-flash-img-img{transition:transform 0.5s cubic-bezier(0.16,1,0.3,1)}
.hl-flash-info{padding:22px 26px;border-top:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;background:#fff}
.hl-flash-name{font-family:var(--serif);font-size:16px;line-height:1.3}
.hl-flash-prices{text-align:right}
.hl-flash-new{font-size:15px;font-weight:500;display:block;color:var(--ink)}
.hl-flash-old{font-size:11px;color:var(--dim);text-decoration:line-through}

.hl-newsletter{background:var(--mid);padding:96px 48px;text-align:center;border-bottom:1px solid var(--rule)}
.hl-nl-lbl{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:#888;margin-bottom:18px}
.hl-nl-title{font-family:var(--serif);font-style:italic;font-size:clamp(34px,4.5vw,52px);line-height:1.05;color:var(--ink);margin-bottom:18px;font-weight:400}
.hl-nl-sub{font-size:14px;color:var(--dim);max-width:480px;margin:0 auto 32px;line-height:1.6;font-weight:300}
.hl-nl-form{display:flex;max-width:460px;margin:0 auto;border-bottom:1px solid var(--ink)}
.hl-nl-form input{flex:1;background:none;border:none;outline:none;font-family:var(--sans);font-size:14px;padding:14px 0;color:var(--ink)}
.hl-nl-form input::placeholder{color:#aaa;font-weight:300}
.hl-nl-form button{background:none;border:none;cursor:pointer;font-family:var(--sans);font-size:11px;font-weight:500;letter-spacing:2px;text-transform:uppercase;color:var(--ink);padding:14px 0 14px 24px}

.hl-foot{background:#fff;color:var(--dim);padding:80px 48px 32px;border-top:1px solid var(--rule)}
.hl-foot-grid{display:grid;grid-template-columns:1.2fr 1fr 1fr 1fr;gap:64px;max-width:1400px;margin:0 auto 64px}
.hl-foot-brand{font-family:var(--serif);font-style:italic;font-size:30px;color:var(--ink);letter-spacing:1px;line-height:1;margin-bottom:14px}
.hl-foot-tag{font-size:13px;color:var(--dim);line-height:1.6;font-weight:300;max-width:280px;margin-bottom:24px}
.hl-foot-soc{display:flex;gap:16px;flex-wrap:wrap}
.hl-foot-soc a{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);text-decoration:none;border-bottom:1px solid var(--rule);padding-bottom:2px;transition:color 0.2s}
.hl-foot-soc a:hover{color:var(--ink);border-color:var(--ink)}
.hl-foot-col h4{font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--dim);margin-bottom:18px;font-weight:500}
.hl-foot-col ul{list-style:none;margin:0;padding:0}
.hl-foot-col li{margin-bottom:10px}
.hl-foot-col a{color:var(--ink);font-size:13px;font-weight:300;text-decoration:none;transition:color 0.2s}
.hl-foot-col a:hover{color:var(--dim)}
.hl-foot-bot{max-width:1400px;margin:0 auto;padding-top:32px;border-top:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:16px;font-size:11px;color:var(--dim);letter-spacing:1px}
.hl-foot-addr{margin-top:20px;font-size:12px;color:var(--dim);line-height:1.6;display:flex;gap:8px;align-items:flex-start}
.hl-pay-grid{display:flex;flex-wrap:wrap;gap:8px;margin-top:4px}
.hl-pay-icon{width:44px;height:28px;border:1px solid var(--rule);border-radius:4px;display:flex;align-items:center;justify-content:center;background:#fff}
.hl-pay-label{font-size:11px;color:var(--ink);font-weight:300;cursor:pointer;transition:color 0.2s;background:none;border:none;text-align:left;padding:0}
.hl-pay-label:hover{color:var(--dim)}
.hl-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px}
.hl-modal{background:#fff;border-radius:12px;max-width:520px;width:100%;max-height:80vh;overflow-y:auto;padding:40px;position:relative}
.hl-modal-close{position:absolute;top:16px;right:16px;background:none;border:none;font-size:20px;color:var(--dim);cursor:pointer;padding:4px 8px;line-height:1}
.hl-modal h3{font-family:var(--serif);font-style:italic;font-size:22px;color:var(--ink);margin:0 0 16px}
.hl-modal p{font-size:14px;color:var(--dim);line-height:1.7;margin:0;white-space:pre-wrap}
.hl-contact-list{list-style:none;margin:0;padding:0}
.hl-contact-list li{padding:10px 0;border-bottom:1px solid var(--rule);display:flex;align-items:center;gap:12px}
.hl-contact-list li:last-child{border-bottom:none}
.hl-contact-list a{color:var(--ink);font-size:13px;text-decoration:none;transition:color 0.2s}
.hl-contact-list a:hover{color:var(--dim)}
.hl-contact-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);width:80px;flex-shrink:0}

.hl-mm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:998;opacity:0;pointer-events:none;transition:opacity 0.3s}
.hl-mm-overlay.open{opacity:1;pointer-events:all}
.hl-mm{position:fixed;top:0;left:0;bottom:0;width:340px;max-width:90vw;background:#fff;z-index:999;transform:translateX(-100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;padding:28px}
.hl-mm.open{transform:translateX(0)}
.hl-mm-h{display:flex;justify-content:space-between;align-items:center;margin-bottom:40px}
.hl-mm-logo{font-family:var(--serif);font-style:italic;font-size:24px;color:var(--ink)}
.hl-mm-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink)}
.hl-mm nav{display:flex;flex-direction:column}
.hl-mm nav button{display:block;padding:16px 0;border-bottom:1px solid var(--rule);font-size:14px;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink);background:none;border-left:none;border-right:none;border-top:none;font-family:var(--sans);text-align:left;cursor:pointer}
.hl-mm-foot{margin-top:auto;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--dim)}

.hl-cart-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:1000;opacity:0;pointer-events:none;transition:opacity 0.3s}
.hl-cart-overlay.open{opacity:1;pointer-events:all}
.hl-cart{position:fixed;top:0;right:0;bottom:0;width:420px;max-width:100vw;background:#fff;z-index:1001;transform:translateX(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column}
.hl-cart.open{transform:translateX(0)}
.hl-cart-h{padding:24px 28px;border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center}
.hl-cart-h h3{font-family:var(--serif);font-size:22px;font-weight:400;letter-spacing:0.5px;margin:0}
.hl-cart-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink);padding:4px}
.hl-cart-items{flex:1;overflow-y:auto;padding:20px 28px}
.hl-cart-empty{display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:14px;color:var(--dim);text-align:center}
.hl-cart-empty-mark{font-family:var(--serif);font-style:italic;font-size:32px;opacity:0.3;line-height:1}
.hl-cart-item{display:grid;grid-template-columns:72px 1fr auto;gap:16px;padding:16px 0;border-bottom:1px solid var(--rule);align-items:start}
.hl-cart-item:last-child{border-bottom:none}
.hl-cart-item-img{width:72px;height:72px;background:linear-gradient(135deg,#d4cdc1 0%,#a89e8c 100%);display:flex;align-items:center;justify-content:center;background-size:cover;background-position:center}
.hl-cart-item-mark{font-family:var(--serif);font-style:italic;font-size:14px;color:rgba(0,0,0,0.18)}
.hl-cart-item-cat{font-size:9px;letter-spacing:2px;text-transform:uppercase;color:var(--dim);margin-bottom:3px}
.hl-cart-item-name{font-family:var(--serif);font-size:14px;margin-bottom:4px;line-height:1.3}
.hl-cart-item-var{font-size:11px;color:var(--dim);margin-bottom:10px}
.hl-cart-item-qty{display:flex;align-items:center;gap:10px}
.hl-qty-btn{width:24px;height:24px;border:1px solid var(--rule);background:none;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;color:var(--ink);transition:background 0.2s}
.hl-qty-btn:hover{background:var(--mid)}
.hl-qty-num{font-size:13px;min-width:16px;text-align:center}
.hl-cart-item-price{font-size:14px;font-weight:500;white-space:nowrap}
.hl-cart-item-rm{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--dim);background:none;border:none;cursor:pointer;padding:0;margin-top:6px;display:block}
.hl-cart-item-rm:hover{color:var(--ink)}
.hl-cart-foot{padding:20px 28px 32px;border-top:1px solid var(--rule)}
.hl-cart-sub{display:flex;justify-content:space-between;align-items:center;margin-bottom:8px}
.hl-cart-sub-lbl{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--dim)}
.hl-cart-sub-amt{font-family:var(--serif);font-size:22px}
.hl-cart-ship{font-size:11px;color:var(--dim);margin-bottom:20px;letter-spacing:0.3px}
.hl-cart-checkout{width:100%;background:var(--ink);color:#fff;border:none;padding:18px;font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;cursor:pointer;transition:opacity 0.2s}
.hl-cart-checkout:hover{opacity:0.85}
.hl-cart-wa{display:block;width:100%;background:none;border:1px solid var(--rule);margin-top:10px;padding:14px;font-family:var(--sans);font-size:10px;font-weight:500;letter-spacing:2px;text-transform:uppercase;cursor:pointer;color:var(--ink)}
.hl-cart-cont{display:block;text-align:center;margin-top:14px;font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:var(--dim);cursor:pointer;background:none;border:none;width:100%}
.hl-cart-cont:hover{color:var(--ink)}

.hl-pdp-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1002;opacity:0;pointer-events:none;transition:opacity 0.3s}
.hl-pdp-overlay.open{opacity:1;pointer-events:all}
.hl-pdp{position:fixed;top:0;right:0;bottom:0;width:100%;max-width:980px;background:#fff;z-index:1003;transform:translateX(100%);transition:transform 0.4s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;overflow-y:auto}
.hl-pdp.open{transform:translateX(0)}
.hl-pdp-h{position:sticky;top:0;background:#fff;z-index:5;padding:18px 32px;border-bottom:1px solid var(--rule);display:flex;justify-content:space-between;align-items:center}
.hl-pdp-bread{font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--dim)}
.hl-pdp-close{background:none;border:none;font-size:22px;cursor:pointer;color:var(--ink)}
.hl-pdp-grid{display:grid;grid-template-columns:1fr 1fr;gap:0;flex:1}
.hl-pdp-gal{background:#fff;min-height:600px;display:flex;flex-direction:column;padding:32px;gap:8px;border-right:1px solid var(--rule)}
.hl-pdp-main{flex:1;aspect-ratio:1;display:flex;align-items:center;justify-content:center;position:relative;background-size:cover;background-position:center;background-repeat:no-repeat;background-color:#fafafa;cursor:zoom-in;overflow:hidden;width:100%;max-width:100%;border-radius:2px}
.hl-pdp-main-mark{font-family:var(--serif);font-style:italic;font-size:48px;color:rgba(255,255,255,0.2);letter-spacing:-1px}
.hl-lb{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;padding:16px;animation:hl-lb-fade 0.2s ease-out}
@keyframes hl-lb-fade{from{opacity:0}to{opacity:1}}
.hl-lb-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;touch-action:pan-y pinch-zoom}
.hl-lb-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;-webkit-touch-callout:default;-webkit-user-select:none;user-select:none;pointer-events:none}
.hl-lb-close{position:fixed;top:18px;right:18px;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background 0.2s;font-family:var(--sans);font-weight:300}
.hl-lb-close:hover{background:rgba(255,255,255,0.18)}
.hl-lb-nav{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.06);color:#fff;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:background 0.2s,opacity 0.2s;line-height:0;font-family:Georgia,serif;padding-bottom:4px}
.hl-lb-nav:hover{background:rgba(255,255,255,0.16)}
.hl-lb-prev{left:18px}
.hl-lb-next{right:18px}
.hl-lb-dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:100px;background:rgba(255,255,255,0.06);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.hl-lb-dot{width:6px;height:6px;border-radius:50%;border:none;padding:0;background:rgba(255,255,255,0.35);cursor:pointer;transition:background 0.2s,transform 0.2s}
.hl-lb-dot:hover{background:rgba(255,255,255,0.6)}
.hl-lb-dot.active{background:#fff;transform:scale(1.3)}
@media (max-width:600px){
  .hl-lb-nav{width:40px;height:40px;font-size:22px}
  .hl-lb-prev{left:8px}
  .hl-lb-next{right:8px}
  .hl-lb-close{top:12px;right:12px;width:40px;height:40px}
}
.hl-pdp-thumbs{display:flex;gap:8px;flex-wrap:wrap}
.hl-pdp-thumb{width:64px;height:64px;border:1px solid transparent;cursor:pointer;display:flex;align-items:center;justify-content:center;background:none;background-size:cover;background-position:center;padding:0}
.hl-pdp-thumb.active{border-color:var(--ink)}
.hl-pdp-info{padding:48px 56px;display:flex;flex-direction:column;gap:0}
.hl-pdp-cat{font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--dim);margin-bottom:12px}
.hl-pdp-name{font-family:var(--serif);font-size:38px;line-height:1.1;font-weight:400;margin-bottom:14px;letter-spacing:-0.5px}
.hl-pdp-prow{display:flex;align-items:baseline;gap:14px;margin-bottom:24px}
.hl-pdp-price{font-size:22px;font-weight:500}
.hl-pdp-was{font-size:14px;color:var(--dim);text-decoration:line-through}
.hl-pdp-desc{font-size:14px;line-height:1.7;color:#555;margin:24px 0 32px;font-weight:300;white-space:pre-line}
.hl-pdp-section{border-top:1px solid var(--rule);padding:18px 0}
.hl-pdp-section-lbl{font-size:10px;letter-spacing:2.5px;text-transform:uppercase;color:var(--dim);margin-bottom:12px}
.hl-size-row{display:flex;gap:8px;flex-wrap:wrap}
.hl-size-btn{min-width:48px;padding:10px 14px;border:1px solid var(--rule);background:#fff;font-family:var(--sans);font-size:12px;font-weight:500;cursor:pointer;transition:all 0.15s;color:var(--ink)}
.hl-size-btn:hover{border-color:var(--ink)}
.hl-size-btn.active{background:var(--ink);color:#fff;border-color:var(--ink)}
.hl-pdp-actions{margin-top:auto;padding-top:32px;display:flex;flex-direction:column;gap:10px}
.hl-pdp-add{background:var(--ink);color:#fff;border:none;padding:18px;font-family:var(--sans);font-size:11px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;cursor:pointer;transition:opacity 0.2s}
.hl-pdp-add:hover{opacity:0.85}
.hl-pdp-err{color:#7a3a3a;font-size:11px;letter-spacing:1px;margin-top:8px}

@media (max-width:900px){
  .hl-nav{padding:0 20px;grid-template-columns:auto 1fr auto;height:56px}
  .hl-nav-right-links{display:none}
  .hl-burger{order:1}
  .hl-logo{font-size:22px;text-align:center;order:2}
  .hl-nav-right{order:3;gap:12px}
  .hl-hero-left{padding:0 28px 48px}
  .hl-pill{display:none}
  .hl-timer-digits{font-size:42px}
  .hl-rule{padding:22px 28px}
  .hl-rule-left{font-size:10px}
  .hl-cat-row,.hl-pgrid{grid-template-columns:repeat(2,1fr)}
  .hl-cat-item:nth-child(2),.hl-cat-item:nth-child(4){border-right:none}
  .hl-cat-item:nth-child(1),.hl-cat-item:nth-child(2){border-bottom:1px solid var(--rule)}
  .hl-pcard:nth-child(2n){border-right:none}
  .hl-pcard:nth-child(4n){border-right:1px solid var(--rule)}
  .hl-flash-h{padding:24px 28px;grid-template-columns:1fr;gap:16px}
  .hl-flash-grid{grid-template-columns:1fr}
  .hl-flash-card{border-right:none;border-bottom:1px solid var(--rule)}
  .hl-flash-card:last-child{border-bottom:none}
  .hl-newsletter{padding:64px 28px}
  .hl-foot{padding:64px 28px 32px}
  .hl-foot-grid{grid-template-columns:1fr;gap:40px}
  .hl-pdp-grid{grid-template-columns:1fr}
  .hl-pdp-gal{min-height:auto;padding:16px;border-right:none;border-bottom:1px solid var(--rule)}
  .hl-pdp-main{aspect-ratio:1;flex:0 0 auto;width:100%;height:auto}
  .hl-pdp-info{padding:32px 28px}
  .hl-pdp-name{font-size:30px}
  .hl-cart{width:100vw}
}
      `}</style>

      <div className="hl-root" style={isNavigating ? { opacity: 0.6, pointerEvents: "none", transition: "opacity 0.2s" } : undefined}>
        {isNavigating && <div className="hl-progress" aria-hidden="true" />}
        {/* TICKER */}
        {(displayTicker.length > 0) && (
          <div className="hl-ticker">
            <div className="hl-ticker-inner">
              {[...displayTicker, ...displayTicker].map((t, i) => (
                <span key={i}>{t}</span>
              ))}
            </div>
          </div>
        )}
        {displayAnnouncement && (
          <div style={{ background: "#1a1715", color: "#f0e8d8", padding: "8px 16px", fontSize: 11, letterSpacing: 2, textTransform: "uppercase", textAlign: "center" }}>
            {displayAnnouncement}
          </div>
        )}

        {/* MOBILE MENU */}
        <div className={"hl-mm-overlay" + (mobileNavOpen ? " open" : "")} onClick={() => setMobileNavOpen(false)} />
        <aside className={"hl-mm" + (mobileNavOpen ? " open" : "")}>
          <div className="hl-mm-h">
            <span className="hl-mm-logo">{seller.store_name}</span>
            <button className="hl-mm-close" onClick={() => setMobileNavOpen(false)}>✕</button>
          </div>
          <nav>
            {menuCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setMobileNavOpen(false);
                  // Both "All" and named collections go to /c/<slug>. The home page is the
                  // marketing landing (hero + categories grid + flash sale + newsletter);
                  // the All Products view is its own focused page.
                  navigate(`/store/${slug}/c/${cat === "All" ? "all" : collectionSlug(cat)}`);
                }}
              >
                {cat === "All" ? "All Products" : cat}
              </button>
            ))}
            <button onClick={() => { setMobileNavOpen(false); setCartOpen(true); }}>
              Cart ({cartCount})
            </button>
          </nav>
          <div className="hl-mm-foot">© {new Date().getFullYear()} {seller.store_name}</div>
        </aside>

        {/* CART */}
        <div className={"hl-cart-overlay" + (cartOpen ? " open" : "")} onClick={() => setCartOpen(false)} />
        <aside className={"hl-cart" + (cartOpen ? " open" : "")}>
          <div className="hl-cart-h">
            <h3>Your Bag</h3>
            <button className="hl-cart-close" onClick={() => setCartOpen(false)}>✕</button>
          </div>
          <div className="hl-cart-items">
            {cart.length === 0 ? (
              <div className="hl-cart-empty">
                <span className="hl-cart-empty-mark">empty.</span>
                <p style={{ fontSize: 13, letterSpacing: 1 }}>Your bag is empty</p>
              </div>
            ) : (
              cart.map((i, idx) => {
                const varStr = Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(" · ");
                return (
                  <div key={idx} className="hl-cart-item">
                    <div className="hl-cart-item-img" style={i.product.image_url ? { backgroundImage: `url("${i.product.image_url}")` } : {}}>
                      {!i.product.image_url && <span className="hl-cart-item-mark">h.</span>}
                    </div>
                    <div>
                      <div className="hl-cart-item-cat">{i.product.category}</div>
                      <div className="hl-cart-item-name">{i.product.name}</div>
                      {varStr && <div className="hl-cart-item-var">{varStr}</div>}
                      <div className="hl-cart-item-qty">
                        <button className="hl-qty-btn" onClick={() => changeQty(idx, -1)}>−</button>
                        <span className="hl-qty-num">{i.qty}</span>
                        <button className="hl-qty-btn" onClick={() => changeQty(idx, 1)}>+</button>
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="hl-cart-item-price">{fmt(i.product.price * i.qty)}</div>
                      <button className="hl-cart-item-rm" onClick={() => removeFromCart(idx)}>Remove</button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {cart.length > 0 && (
            <div className="hl-cart-foot">
              <div className="hl-cart-sub">
                <span className="hl-cart-sub-lbl">Subtotal</span>
                <span className="hl-cart-sub-amt">{fmt(cartTotal)}</span>
              </div>
              {FREE_SHIP && <p className="hl-cart-ship">{freeShipRem > 0 ? `Add ${fmt(freeShipRem)} more for free shipping` : "Free shipping unlocked ✓"}</p>}
              <button className="hl-cart-checkout" onClick={goToCheckout}>Checkout</button>
              {seller.checkout_config?.whatsapp_checkout_enabled && seller.whatsapp_number && (
                <button className="hl-cart-wa" onClick={orderViaWhatsApp}>Order via WhatsApp</button>
              )}
              <button className="hl-cart-cont" onClick={() => setCartOpen(false)}>Continue Browsing</button>
            </div>
          )}
        </aside>

        {/* PDP */}
        <div className={"hl-pdp-overlay" + (selectedProduct ? " open" : "")} onClick={() => setSelectedProduct(null)} />
        <aside className={"hl-pdp" + (selectedProduct ? " open" : "")}>
          {selectedProduct && (() => {
            const p = selectedProduct;
            const allImgs = [p.image_url, ...(p.images || [])].filter(Boolean) as string[];
            const mainImg = allImgs[activeImg] || p.image_url;
            const onSale = p.old_price && p.old_price > p.price;
            const idx = products.indexOf(p);
            const fallbackPattern = `hl-pat-${imgPatternIdx(idx)}`;
            return (
              <>
                <div className="hl-pdp-h">
                  <span className="hl-pdp-bread">{p.category} &nbsp;/&nbsp; {p.name}</span>
                  <button className="hl-pdp-close" onClick={() => setSelectedProduct(null)}>✕</button>
                </div>
                <div className="hl-pdp-grid">
                  <div className="hl-pdp-gal">
                    <div
                      className={"hl-pdp-main " + (mainImg ? "" : fallbackPattern)}
                      style={mainImg ? { backgroundImage: `url("${mainImg}")` } : {}}
                      role={allImgs.length > 0 ? "button" : undefined}
                      tabIndex={allImgs.length > 0 ? 0 : undefined}
                      onClick={() => { if (allImgs.length > 0) setLightbox({ imgs: allImgs, index: activeImg }); }}
                      onKeyDown={(e) => { if (allImgs.length > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); setLightbox({ imgs: allImgs, index: activeImg }); } }}
                      aria-label={allImgs.length > 0 ? "View images" : undefined}
                    >
                      {!mainImg && <span className="hl-pdp-main-mark">{slugify(p.name)}.</span>}
                    </div>
                    {allImgs.length > 1 && (
                      <div className="hl-pdp-thumbs">
                        {allImgs.map((img, i) => (
                          <button
                            key={i}
                            className={"hl-pdp-thumb" + (activeImg === i ? " active" : "")}
                            style={{ backgroundImage: `url("${img}")` }}
                            onClick={() => setActiveImg(i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="hl-pdp-info">
                    <div className="hl-pdp-cat">{p.category}</div>
                    <h2 className="hl-pdp-name">{p.name}</h2>
                    <div className="hl-pdp-prow">
                      <span className="hl-pdp-price">{fmt(p.price)}</span>
                      {onSale && <span className="hl-pdp-was">{fmt(p.old_price!)}</span>}
                    </div>
                    {p.description && <p className="hl-pdp-desc">{p.description}</p>}
                    {(p.variants || []).filter(v => v.options?.length > 0).map((v) => (
                      <div className="hl-pdp-section" key={v.name}>
                        <div className="hl-pdp-section-lbl">{v.name}</div>
                        <div className="hl-size-row">
                          {v.options.map((opt) => (
                            <button
                              key={opt}
                              className={"hl-size-btn" + (selectedVariants[v.name] === opt ? " active" : "")}
                              onClick={() => { setSelectedVariants((prev) => ({ ...prev, [v.name]: opt })); setVariantError(false); }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {variantError && <div className="hl-pdp-err">Please select all options</div>}
                    <div className="hl-pdp-actions">
                      <button className="hl-pdp-add" onClick={handleAddToCart}>
                        Add to Bag — {fmt(p.price * localQty)}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </aside>

        {/* IMAGE LIGHTBOX GALLERY — tap main PDP image to open. Swipe / arrow keys / arrow
            buttons to browse. Pinch to zoom natively. */}
        {lightbox && (
          <LightboxGallery
            imgs={lightbox.imgs}
            index={lightbox.index}
            onClose={() => setLightbox(null)}
            onIndex={(i) => setLightbox((s) => s ? { ...s, index: i } : s)}
          />
        )}

        {/* NAV */}
        <nav className="hl-nav">
          <div className="hl-nav-left">
            <button className="hl-burger" onClick={() => setMobileNavOpen(true)} aria-label="Menu"><span /><span /><span /></button>
          </div>
          <a href={`/store/${slug}`} className="hl-logo">
            {displayLogo ? <img src={displayLogo} alt={seller.store_name} /> : seller.store_name}
          </a>
          <div className="hl-nav-right">
            <button className="hl-bag" onClick={() => setCartOpen(true)}>
              Cart (<span className="hl-bag-count">{cartCount}</span>)
            </button>
          </div>
        </nav>

        {/* HERO — only on landing page */}
        {!isCollectionView && (
        <EditSection id="hero">
          <section
            className={"hl-hero" + (displayHeroImage ? " has-img" : "")}
          >
            {displayHeroImage && (
              <div className="hl-hero-bgimg">
                <Image
                  src={displayHeroImage}
                  alt=""
                  fill
                  priority
                  sizes="100vw"
                  quality={75}
                  style={{ objectFit: "cover", objectPosition: "center" }}
                />
              </div>
            )}
            <div className="hl-hero-overlay" />
            <div className="hl-hero-left">
              {displayHeroIndex && <div className="hl-hero-index">{displayHeroIndex}</div>}
              {displayHeroLabel && <div className="hl-hero-label">{displayHeroLabel}</div>}
              {displayHeroHeadline && (
                <h1 className="hl-hero-h1">
                  {(displayHeroEm ? displayHeroHeadline.split(displayHeroEm) : [displayHeroHeadline]).map((part, i, arr) => (
                    <span key={i}>
                      {part.split("\n").map((line, j) => (
                        <span key={j}>{line}{j < part.split("\n").length - 1 && <br />}</span>
                      ))}
                      {i < arr.length - 1 && <em>{displayHeroEm}</em>}
                    </span>
                  ))}
                </h1>
              )}
              {displayHeroBody && <p className="hl-hero-body">{displayHeroBody}</p>}
              {(showCtaPrimary || showCtaSecondary) && (
                <div className="hl-cta-row">
                  {showCtaPrimary && (
                    <button className="hl-btn-solid" onClick={ctaClick(displayCtaPrimaryTarget)}>
                      {displayCtaPrimary}
                    </button>
                  )}
                  {showCtaSecondary && (
                    <button className="hl-btn-text" onClick={ctaClick(displayCtaSecondaryTarget)}>
                      {displayCtaSecondary}
                    </button>
                  )}
                </div>
              )}
              {promoCountdown && heroTimerParts && (
                <div className="hl-timer-row">
                  <div className="hl-timer-note">
                    {liveHeroCountdownLabel ?? config.hero_countdown_label ?? `${promoCountdown.code} ends in`}
                  </div>
                  <div className="hl-timer-digits">
                    {heroTimerParts[0]}<span className="sep">:</span>{heroTimerParts[1]}<span className="sep">:</span>{heroTimerParts[2]}
                  </div>
                </div>
              )}
            </div>
            {featuredProduct && (
              <button className="hl-pill" onClick={() => openProduct(featuredProduct)}>
                <div className="hl-pill-label">{displayHeroLabel}</div>
                <div className="hl-pill-name">{featuredProduct.name}</div>
                <div className="hl-pill-price">{fmt(featuredProduct.price)}</div>
              </button>
            )}
          </section>
        </EditSection>
        )}

        {/* COLLECTION HEADER — only on collection page */}
        {isCollectionView && (
          <div className="hl-coll-header">
            <button
              type="button"
              className="hl-coll-back"
              onClick={() => {
                // Use browser-native back if there's history; otherwise fall back to the landing page.
                if (typeof window !== "undefined" && window.history.length > 1) router.back();
                else navigate(`/store/${slug}`);
              }}
            >
              ← Back
            </button>
            <h1 className="hl-coll-title">{collectionName}</h1>
            <div className="hl-coll-count">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</div>
          </div>
        )}

        {/* CATEGORIES — only on landing page */}
        {!isCollectionView && categoryList.length > 0 && (
          <EditSection id="categories">
            <div className="hl-rule">
              <span className="hl-rule-left">Categories</span>
              <button className="hl-rule-right" onClick={() => { setActiveCategory("All"); document.getElementById("hl-products")?.scrollIntoView({ behavior: "smooth" }); }}>View All →</button>
            </div>
            <div className="hl-cat-row">
              {categoryList.map((cat, i) => {
                const img = catImage(cat);
                const pat = `hl-pat-${(i % 4) + 1}`;
                return (
                  <button
                    key={cat}
                    className="hl-cat-item"
                    onClick={() => navigate(`/store/${slug}/c/${collectionSlug(cat)}`)}
                  >
                    <div className="hl-cat-img">
                      {img ? (
                        <img
                          src={img}
                          alt={cat}
                          loading="lazy"
                          decoding="async"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", transition: "transform 0.6s cubic-bezier(0.16,1,0.3,1)" }}
                        />
                      ) : (
                        <div className={"hl-cat-img-inner " + pat}>
                          <span className="hl-cat-mark">{cat.toLowerCase()}.</span>
                        </div>
                      )}
                    </div>
                    <div className="hl-cat-foot">
                      <span className="hl-cat-name">{cat}</span>
                      <span className="hl-cat-count">{catCount(cat)} {catCount(cat) === 1 ? "piece" : "pieces"}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </EditSection>
        )}

        {/* PRODUCTS */}
        <div id="hl-products">
          <div className="hl-rule">
            <span className="hl-rule-left">{effectiveCategory === "All" ? "Latest Arrivals" : effectiveCategory}</span>
            <button className="hl-rule-right">{filtered.length} {filtered.length === 1 ? "piece" : "pieces"}</button>
          </div>
          <EditSection id="products">
            <div className="hl-pgrid">
              {filtered.map((p, idx) => {
                const onSale = p.old_price && p.old_price > p.price;
                const promo = getProductPromo(p.id);
                const fallbackPat = `hl-pat-${imgPatternIdx(idx)}`;
                return (
                  <div key={p.id} className="hl-pcard" onClick={() => openProduct(p)}>
                    {promo && <span className="hl-ptag low">{promo.type === "percentage" ? `-${promo.value}%` : "Sale"}</span>}
                    {!promo && onSale && <span className="hl-ptag low">Sale</span>}
                    {!promo && !onSale && idx === 0 && <span className="hl-ptag">New</span>}
                    <div className="hl-pimg">
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.name}
                          loading="lazy"
                          decoding="async"
                          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", objectPosition: "center", transition: "transform 0.6s cubic-bezier(0.16,1,0.3,1)" }}
                          className="hl-pimg-img"
                        />
                      ) : (
                        <div className={"hl-pimg-inner " + fallbackPat}>
                          <span className="hl-p-mark">{slugify(p.name)}.</span>
                        </div>
                      )}
                    </div>
                    <button
                      className="hl-pwa"
                      type="button"
                      onClick={(e) => { e.stopPropagation(); openProduct(p); }}
                    >
                      Add to Bag
                    </button>
                    <div className="hl-pinfo">
                      <div className="hl-pcat">{p.category}</div>
                      <div className="hl-pname">{p.name}</div>
                      <div className="hl-pfoot">
                        <div className="hl-pprice">
                          {onSale && <span className="was">{fmt(p.old_price!)}</span>}
                          {fmt(p.price)}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </EditSection>
        </div>

        {/* FLASH SALE — only on landing page */}
        {!isCollectionView && showFlash && flashSaleProducts.length > 0 && (
          <EditSection id="flash">
            <div className="hl-flash">
              <div className="hl-flash-h">
                <div>
                  <span className="hl-flash-lbl">{flashLabel}</span>
                  <div className="hl-flash-title">{flashTitle}</div>
                </div>
                {flashSaleProducts[0] && getProductPromo(flashSaleProducts[0].id)?.timeLeft && (
                  <div className="hl-flash-cd">
                    {(() => {
                      const tl = getProductPromo(flashSaleProducts[0].id)?.timeLeft || "";
                      const parts = tl.split(":");
                      return (
                        <>
                          {parts[0]}<span className="sep">:</span>{parts[1]}<span className="sep">:</span>{parts[2]}
                        </>
                      );
                    })()}
                  </div>
                )}
              </div>
              <div className="hl-flash-grid">
                {flashSaleProducts.map((p, i) => {
                  const pat = `hl-pat-${imgPatternIdx(i + 4)}`;
                  return (
                    <button key={p.id} className="hl-flash-card" onClick={() => openProduct(p)}>
                      <div className="hl-flash-img">
                        {p.image_url ? (
                          <img
                            src={p.image_url}
                            alt={p.name}
                            loading="lazy"
                            style={{ objectFit: "cover", objectPosition: "center", position: "absolute", width: "100%", height: "100%" }}
                            className="hl-flash-img-img"
                          />
                        ) : (
                          <div className={"hl-flash-img-inner " + pat}>
                            <span className="hl-p-mark">{slugify(p.name)}.</span>
                          </div>
                        )}
                      </div>
                      <div className="hl-flash-info">
                        <div className="hl-flash-name">{p.name}</div>
                        <div className="hl-flash-prices">
                          <span className="hl-flash-new">{fmt(p.price)}</span>
                          {p.old_price && p.old_price > p.price && (
                            <span className="hl-flash-old">{fmt(p.old_price)}</span>
                          )}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </EditSection>
        )}

        {/* NEWSLETTER — only on landing page */}
        {!isCollectionView && showNewsletter && (
          <EditSection id="newsletter">
            <section className="hl-newsletter">
              <div className="hl-nl-lbl">{nlLabel}</div>
              <h2 className="hl-nl-title">{nlTitle}</h2>
              <p className="hl-nl-sub">{nlSub}</p>
              <form className="hl-nl-form" onSubmit={(e) => { e.preventDefault(); (e.currentTarget.querySelector("button") as HTMLButtonElement).textContent = "Joined ✓"; }}>
                <input type="email" placeholder="your@email.com" required />
                <button type="submit">Subscribe</button>
              </form>
            </section>
          </EditSection>
        )}

        {/* FOOTER */}
        <EditSection id="footer">
          <footer className="hl-foot">
            <div className="hl-foot-grid">
              <div>
                <div className="hl-foot-brand">{seller.store_name}</div>
                <p className="hl-foot-tag">{displayFooterTagline}</p>
                <div className="hl-foot-soc">
                  {seller.social_links?.instagram && <a href={seller.social_links.instagram} target="_blank" rel="noreferrer">Instagram</a>}
                  {seller.social_links?.tiktok && <a href={seller.social_links.tiktok} target="_blank" rel="noreferrer">TikTok</a>}
                  {seller.social_links?.facebook && <a href={seller.social_links.facebook} target="_blank" rel="noreferrer">Facebook</a>}
                  {seller.social_links?.twitter && <a href={seller.social_links.twitter} target="_blank" rel="noreferrer">Twitter</a>}
                  {seller.whatsapp_number && (
                    <a href={`https://wa.me/${seller.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">WhatsApp</a>
                  )}
                </div>
                {config.physical_address && (
                  <div className="hl-foot-addr">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--dim)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                    <span>{config.physical_address}</span>
                  </div>
                )}
              </div>
              <div className="hl-foot-col">
                <h4>{displayFooterCol1}</h4>
                <ul>
                  {menuCategories.slice(0, 5).map((cat) => {
                    const target = `/store/${slug}/c/${cat === "All" ? "all" : collectionSlug(cat)}`;
                    return (
                    <li key={cat}>
                      <a
                        href={target}
                        onClick={(e) => { e.preventDefault(); navigate(target); }}
                      >
                        {cat === "All" ? "All Products" : cat}
                      </a>
                    </li>
                    );
                  })}
                </ul>
              </div>
              <div className="hl-foot-col">
                <h4>Support</h4>
                <ul>
                  <li><button className="hl-pay-label" onClick={() => setPolicyModal({ title: "Shipping Policy", content: config.shipping_policy || "Contact us for details about our shipping policy." })}>Shipping</button></li>
                  <li><button className="hl-pay-label" onClick={() => setPolicyModal({ title: "Returns & Refunds", content: config.return_policy || "Contact us for details about our returns and refund policy." })}>Returns & Refunds</button></li>
                  <li><button className="hl-pay-label" onClick={() => setContactOpen(true)}>Contact</button></li>
                </ul>
              </div>
              <div className="hl-foot-col">
                <h4>Payment Methods</h4>
                <div className="hl-pay-grid">
                  {seller.checkout_config?.payfast_enabled && (<>
                    <span className="hl-pay-icon" title="Visa"><svg width="28" height="18" viewBox="0 0 28 18"><path d="M11.2 3.6l-2.4 10.8H6.4L8.8 3.6h2.4zm10.4 7l1.3-3.5.7 3.5h-2zm2.7 3.8h2.2l-1.9-10.8h-2c-.5 0-.9.3-1 .7l-3.6 10.1h2.5l.5-1.4h3l.3 1.4zm-6.3-3.5c0-2.8-3.9-3-3.9-4.2 0-.4.4-.8 1.2-.9.8-.1 2 .1 2.9.6l.5-2.4c-.7-.3-1.6-.5-2.7-.5-2.8 0-4.8 1.5-4.8 3.7 0 1.6 1.4 2.5 2.5 3 1.1.6 1.5.9 1.5 1.4 0 .8-.9 1.1-1.7 1.1-1 0-2.1-.3-3-.7l-.5 2.5c.7.3 2 .6 3.3.6 3 0 5-1.5 5-3.8zM7.2 3.6L3.6 14.4H1l-2-8.6c-.1-.5-.3-.6-.7-.8C-2.4 4.7-3.4 4.3-4.2 4l.1-.4h4c.5 0 1 .4 1.1.9l1 5.3 2.5-6.2h2.5z" transform="translate(4 0)" fill="var(--ink)"/></svg></span>
                    <span className="hl-pay-icon" title="Mastercard"><svg width="28" height="18" viewBox="0 0 28 18"><circle cx="10" cy="9" r="7" fill="none" stroke="var(--ink)" strokeWidth="1"/><circle cx="18" cy="9" r="7" fill="none" stroke="var(--ink)" strokeWidth="1"/></svg></span>
                    <span className="hl-pay-icon" title="Amex"><svg width="28" height="18" viewBox="0 0 28 18"><rect x="2" y="2" width="24" height="14" rx="2" fill="none" stroke="var(--ink)" strokeWidth="1"/><text x="14" y="11" textAnchor="middle" fontSize="7" fontWeight="700" fill="var(--ink)" fontFamily="sans-serif">AMEX</text></svg></span>
                    <span className="hl-pay-icon" title="Apple Pay"><svg width="28" height="18" viewBox="0 0 28 18"><text x="14" y="12" textAnchor="middle" fontSize="7" fontWeight="600" fill="var(--ink)" fontFamily="sans-serif">Pay</text></svg></span>
                    <span className="hl-pay-icon" title="Google Pay"><svg width="28" height="18" viewBox="0 0 28 18"><text x="14" y="12" textAnchor="middle" fontSize="7" fontWeight="600" fill="var(--ink)" fontFamily="sans-serif">GPay</text></svg></span>
                  </>)}
                  {seller.checkout_config?.eft_enabled && (
                    <button className="hl-pay-label" style={{ marginTop: 4 }} onClick={() => setPolicyModal({ title: "EFT / Direct Deposit", content: "Select EFT/Direct Deposit at checkout. You’ll receive payment instructions to complete your order via EFT." })}>EFT / Direct Deposit</button>
                  )}
                  {seller.checkout_config?.whatsapp_checkout_enabled && seller.whatsapp_number && (
                    <button className="hl-pay-label" style={{ marginTop: 4 }} onClick={() => setPolicyModal({ title: "WhatsApp Order", content: "Select WhatsApp Order at checkout to complete your order via WhatsApp with us." })}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--ink)"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.625.846 5.059 2.284 7.034L.789 23.468l4.573-1.46A11.93 11.93 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 21.818c-2.168 0-4.18-.637-5.882-1.727l-.42-.28-3.064.978.992-2.96-.298-.442A9.808 9.808 0 012.182 12c0-5.422 4.396-9.818 9.818-9.818S21.818 6.578 21.818 12 17.422 21.818 12 21.818z"/></svg>
                        WhatsApp Order
                      </span>
                    </button>
                  )}
                </div>
              </div>
            </div>
            <div className="hl-foot-bot">
              <span>© {new Date().getFullYear()} {seller.store_name}</span>
              <span style={{ fontStyle: "italic" }}>Powered by CatalogStore</span>
            </div>
          </footer>
        </EditSection>
      </div>

      {/* Policy / info modal */}
      {policyModal && (
        <div className="hl-modal-overlay" onClick={() => setPolicyModal(null)}>
          <div className="hl-modal" onClick={(e) => e.stopPropagation()}>
            <button className="hl-modal-close" onClick={() => setPolicyModal(null)}>✕</button>
            <h3>{policyModal.title}</h3>
            <p>{policyModal.content}</p>
          </div>
        </div>
      )}

      {/* Contact modal */}
      {contactOpen && (
        <div className="hl-modal-overlay" onClick={() => setContactOpen(false)}>
          <div className="hl-modal" onClick={(e) => e.stopPropagation()}>
            <button className="hl-modal-close" onClick={() => setContactOpen(false)}>✕</button>
            <h3>Contact Us</h3>
            <ul className="hl-contact-list">
              {seller.whatsapp_number && (
                <li>
                  <span className="hl-contact-label">WhatsApp</span>
                  <a href={`https://wa.me/${seller.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{seller.whatsapp_number}</a>
                </li>
              )}
              {config.contact_email && (
                <li>
                  <span className="hl-contact-label">Email</span>
                  <a href={`mailto:${config.contact_email}`}>{config.contact_email}</a>
                </li>
              )}
              {config.contact_phone && (
                <li>
                  <span className="hl-contact-label">Call</span>
                  <a href={`tel:${config.contact_phone.replace(/\s/g, "")}`}>{config.contact_phone}</a>
                </li>
              )}
              {seller.social_links?.instagram && (
                <li><span className="hl-contact-label">Instagram</span><a href={seller.social_links.instagram} target="_blank" rel="noreferrer">Instagram</a></li>
              )}
              {seller.social_links?.tiktok && (
                <li><span className="hl-contact-label">TikTok</span><a href={seller.social_links.tiktok} target="_blank" rel="noreferrer">TikTok</a></li>
              )}
              {seller.social_links?.facebook && (
                <li><span className="hl-contact-label">Facebook</span><a href={seller.social_links.facebook} target="_blank" rel="noreferrer">Facebook</a></li>
              )}
              {seller.social_links?.twitter && (
                <li><span className="hl-contact-label">X / Twitter</span><a href={seller.social_links.twitter} target="_blank" rel="noreferrer">X / Twitter</a></li>
              )}
              {config.operating_hours && (
                <li>
                  <span className="hl-contact-label">Hours</span>
                  <span style={{ fontSize: 13, color: "var(--ink)" }}>{config.operating_hours}</span>
                </li>
              )}
              {config.physical_address && (
                <li>
                  <span className="hl-contact-label">Address</span>
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

// Full-screen image gallery overlay used by the PDP. No tap-to-zoom badge — the affordance
// is just that the image is tappable. Once open, customers swipe left/right (mobile) or
// click the side arrows / press arrow keys (desktop) to browse all the product's images.
// Pinch-to-zoom is left to the browser since the image is a plain <img> with object-fit:
// contain — works natively on iOS/Android.
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
    if (Math.abs(dx) < 40) return; // ignore taps and tiny moves
    if (dx < 0 && index < imgs.length - 1) onIndex(index + 1);
    else if (dx > 0 && index > 0) onIndex(index - 1);
  };

  return (
    <div className="hl-lb" onClick={onClose} role="dialog" aria-modal="true" aria-label="Product images">
      <button
        className="hl-lb-close"
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      >
        ✕
      </button>

      <div
        className="hl-lb-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img src={imgs[index]} alt="" className="hl-lb-img" draggable={false} />
      </div>

      {imgs.length > 1 && (
        <>
          {index > 0 && (
            <button
              className="hl-lb-nav hl-lb-prev"
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
              aria-label="Previous image"
            >
              ‹
            </button>
          )}
          {index < imgs.length - 1 && (
            <button
              className="hl-lb-nav hl-lb-next"
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
              aria-label="Next image"
            >
              ›
            </button>
          )}
          <div className="hl-lb-dots" onClick={(e) => e.stopPropagation()}>
            {imgs.map((_, i) => (
              <button
                key={i}
                type="button"
                className={"hl-lb-dot" + (i === index ? " active" : "")}
                onClick={() => onIndex(i)}
                aria-label={`Image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}