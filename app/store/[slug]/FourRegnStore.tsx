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
  privacy_policy?: string;
  terms_of_service?: string;
  contact_email?: string;
  contact_phone?: string;
  operating_hours?: string;
  physical_address?: string;
  products_heading?: string;
  show_setla_banner?: boolean;
  setla_eyebrow?: string;
  setla_lead?: string;
  setla_badge?: string;
  setla_note?: string;
  setla_cta_primary?: string;
  setla_cta_secondary?: string;
  setla_photo_url?: string;
  show_shopbygender?: boolean;
  shopbygender_eyebrow?: string;
  shopbygender_heading?: string;
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
  sort_order: number; created_at?: string; tags?: string[];
  // SEO-friendly Shopify-derived handle, once backfilled -- see
  // goToProduct() below. Optional: not every product has one yet (a fresh
  // product created directly on the platform, or before the handle backfill
  // has run), and every other seller/template never sets this at all.
  handle?: string;
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

/* ─── SIZE CHARTS ────────────────────────────────────────────
   Ported verbatim from the real 4regn Shopify theme's size-chart tables +
   selection logic (product name keywords first, then a tag lookup). Not
   editable/seller-configurable -- this is fixed reference data, same as the
   SETLA copy above. */
export type SizeChartType =
  | "oversized_tee"
  | "womenjackets"
  | "menjackets"
  | "ukmensizelabel"
  | "menxsmallto3xlpants"
  | "womenxsmalltoxlpants";

export const SIZE_CHARTS: Record<SizeChartType, { headers: string[]; rows: string[][] }> = {
  oversized_tee: {
    headers: ["Label Size", "Bust (cm)", "Waist (cm)", "Height (cm)"],
    rows: [
      ["XS", "88-92", "74-78", "170-175"],
      ["S", "92-96", "78-82", "170-175"],
      ["M", "96-100", "82-86", "175-180"],
      ["L", "100-105", "86-91", "180-185"],
      ["XL", "105-110", "91-96", "185-190"],
      ["XXL", "110-115", "96-102", "185-190"],
    ],
  },
  womenjackets: {
    headers: ["Label Size", "Bust (cm)", "Waist (cm)", "Hips (cm)", "Height (cm)"],
    rows: [
      ["S", "86-90", "66-70", "91-95", "165-170"],
      ["M", "90-94", "70-74", "95-99", "170-175"],
      ["L", "95-101", "75-81", "100-106", "175-180"],
      ["XL", "101-107", "81-87", "106-112", "175-180"],
    ],
  },
  menjackets: {
    headers: ["Label Size", "Bust (cm)", "Waist (cm)", "Height (cm)"],
    rows: [
      ["S", "92-96", "78-82", "170-175"],
      ["M", "96-100", "82-86", "175-180"],
      ["L", "100-105", "86-91", "180-185"],
      ["XL", "105-110", "91-96", "185-190"],
      ["XXL", "110-115", "96-102", "185-190"],
    ],
  },
  ukmensizelabel: {
    headers: ["UK Size", "Waist (cm)", "Hips (cm)", "Height (cm)"],
    rows: [
      ["28", "70-74", "86-90", "165-170"],
      ["30", "74-78", "90-94", "170-175"],
      ["31", "78-82", "94-98", "170-175"],
      ["32", "82-86", "98-102", "175-180"],
      ["34", "86-91", "102-107", "180-185"],
      ["36", "91-96", "107-112", "185-190"],
    ],
  },
  menxsmallto3xlpants: {
    headers: ["Label Size", "Waist (cm)", "Hips (cm)", "Height (cm)"],
    rows: [
      ["XS", "74-78", "90-94", "170-175"],
      ["S", "78-82", "94-98", "170-175"],
      ["M", "82-86", "98-102", "175-180"],
      ["L", "86-91", "102-107", "180-185"],
      ["XL", "91-96", "107-112", "185-190"],
      ["XXL", "96-102", "112-118", "185-190"],
      ["XXXL", "103-109", "119-125", "190-195"],
    ],
  },
  womenxsmalltoxlpants: {
    headers: ["Label Size", "UK", "Bust (cm)", "Waist (cm)", "Hips (cm)", "Height (cm)"],
    rows: [
      ["XS", "6", "82-86", "62-66", "87-91", "160-165"],
      ["S", "8", "86-90", "66-70", "91-95", "165-170"],
      ["M", "10", "90-94", "70-74", "95-99", "170-175"],
      ["L", "12/14", "95-101", "75-81", "100-106", "175-180"],
      ["XL", "16", "101-107", "81-87", "106-112", "175-180"],
      ["XXL", "18", "107-113", "87-93", "112-118", "180-185"],
    ],
  },
};

const OVERSIZED_TEE_NAME_MATCHES = [
  "oversized tee", "premium oversized", "4regn", "butterfly effect", "oversized t-shirt", "oversized tshirt",
];
const TAG_SIZE_CHART_MAP: Record<string, SizeChartType> = {
  womenjackets: "womenjackets",
  menjackets: "menjackets",
  ukmensizelabel: "ukmensizelabel",
  menxsmallto3xlpants: "menxsmallto3xlpants",
  womenxsmalltoxlpants: "womenxsmalltoxlpants",
};

// Selection order matches the theme exactly: name-keyword match first (any
// hit wins, always oversized_tee), then the first matching tag (in the
// product's own tag order) wins. No match -> no chart at all, no fallback.
export function getSizeChartType(product: { name: string; tags?: string[] }): SizeChartType | null {
  const name = (product.name || "").toLowerCase();
  if (OVERSIZED_TEE_NAME_MATCHES.some((m) => name.includes(m))) return "oversized_tee";
  for (const tag of product.tags || []) {
    const key = (tag || "").toLowerCase().replace(/\s+/g, "");
    if (TAG_SIZE_CHART_MAP[key]) return TAG_SIZE_CHART_MAP[key];
  }
  return null;
}

/* ─── SHOP BY GENDER ────────────────────────────────────────
   Splits the seller's real, seller-editable `collections` list into a
   "men" and a "women" bucket, purely by name convention -- no fixed
   category slots, no hardcoded 4regn collection names. This mirrors the
   real shape `migrate-4regn-collections.ts` (and any seller who names
   their own collections the same way) produces: "ALL MEN" / "ALL WOMEN"
   as the two "shop everything" collections, and "Men <thing>" / "Women
   <thing>" for everything else -- e.g. "Men Tops" becomes the tile label
   "Tops". Collections that don't match either prefix (unisex/seasonal/etc)
   simply don't appear in this section; they still show up in "Shop by
   Collection" and the product grid below. */
export interface GenderCollectionItem { name: string; label: string; }
export interface GenderBucket { shopAll: string | null; items: GenderCollectionItem[]; }
const GENDER_ALL_MEN_RE = /^all\s+men$/i;
const GENDER_ALL_WOMEN_RE = /^all\s+women$/i;
const GENDER_MEN_PREFIX_RE = /^men\s+(.+)$/i;
const GENDER_WOMEN_PREFIX_RE = /^women\s+(.+)$/i;
export function partitionGenderCollections(collections: string[]): { men: GenderBucket; women: GenderBucket } {
  const men: GenderBucket = { shopAll: null, items: [] };
  const women: GenderBucket = { shopAll: null, items: [] };
  for (const raw of collections || []) {
    const name = (raw || "").trim();
    if (!name) continue;
    if (GENDER_ALL_MEN_RE.test(name)) { if (!men.shopAll) men.shopAll = name; continue; }
    if (GENDER_ALL_WOMEN_RE.test(name)) { if (!women.shopAll) women.shopAll = name; continue; }
    const menMatch = GENDER_MEN_PREFIX_RE.exec(name);
    if (menMatch) { men.items.push({ name, label: menMatch[1].trim() }); continue; }
    const womenMatch = GENDER_WOMEN_PREFIX_RE.exec(name);
    if (womenMatch) { women.items.push({ name, label: womenMatch[1].trim() }); continue; }
  }
  return { men, women };
}

interface StorePageProps {
  initialSeller?: Seller;
  initialProducts?: Product[];
  initialDiscountCodes?: any[];
  initialProductId?: string;
  mode?: "home" | "collection" | "product" | "collections-index" | "policy";
  collectionName?: string;
  isSubdomain?: boolean;
  // Server-resolved product for the dedicated /p/<id> page (mode="product").
  // Unlike initialProductId (which the slide-over preview looks up from
  // `products` client-side), this is passed down already-resolved so the
  // dedicated page never depends on `products` having loaded.
  initialActiveProduct?: Product | null;
  // Which policy page to render for mode="policy".
  policyKey?: "shipping" | "returns" | "privacy" | "terms" | "contact";
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

export default function FourRegnStore({ initialSeller, initialProducts, initialDiscountCodes, initialProductId, mode = "home", collectionName, isSubdomain, initialActiveProduct, policyKey }: StorePageProps = {}) {
  const isCollectionView = mode === "collection";
  const isHomeView = mode === "home";
  const isProductView = mode === "product";
  const isCollectionsIndexView = mode === "collections-index";
  const isPolicyView = mode === "policy";
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
  const [liveShowNewsletter, setLiveShowNewsletter] = useState<boolean | null>(null);
  const [liveNewsletterLabel, setLiveNewsletterLabel] = useState<string | null>(null);
  const [liveNewsletterTitle, setLiveNewsletterTitle] = useState<string | null>(null);
  const [liveNewsletterSub, setLiveNewsletterSub] = useState<string | null>(null);
  const [liveShowShopByGender, setLiveShowShopByGender] = useState<boolean | null>(null);
  const [liveShopByGenderEyebrow, setLiveShopByGenderEyebrow] = useState<string | null>(null);
  const [liveShopByGenderHeading, setLiveShopByGenderHeading] = useState<string | null>(null);
  const [policyModal, setPolicyModal] = useState<{ title: string; content: string } | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  /* ─── PROMO ─── */
  const [promoCountdown, setPromoCountdown] = useState<PromoDiscount | null>(() => buildInitialPromos(initialDiscountCodes).countdown);
  const [promoDiscounts, setPromoDiscounts] = useState<PromoDiscount[]>(() => buildInitialPromos(initialDiscountCodes).discounts);

  /* ─── UI ─── */
  const [activeCategory, setActiveCategory] = useState("All");
  const [productSort, setProductSort] = useState("default");
  // Sort control for the dedicated /collections index list -- same
  // state/select shape as productSort above, just a different option set
  // (name and product-count based, no date/price since collections have
  // neither) for the fr-collist-* compact list below.
  const [collectionSort, setCollectionSort] = useState("az");
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState<{ imgs: string[]; index: number } | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<{ [k: string]: string }>({});
  const [localQty, setLocalQty] = useState(1);
  const [variantError, setVariantError] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [sizeChartTab, setSizeChartTab] = useState<"chart" | "measure">("chart");

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
      if (e.data.showNewsletter !== undefined) setLiveShowNewsletter(e.data.showNewsletter);
      if (e.data.newsletterLabel !== undefined) setLiveNewsletterLabel(e.data.newsletterLabel);
      if (e.data.newsletterTitle !== undefined) setLiveNewsletterTitle(e.data.newsletterTitle);
      if (e.data.newsletterSub !== undefined) setLiveNewsletterSub(e.data.newsletterSub);
      if (e.data.showShopByGender !== undefined) setLiveShowShopByGender(e.data.showShopByGender);
      if (e.data.shopByGenderEyebrow !== undefined) setLiveShopByGenderEyebrow(e.data.shopByGenderEyebrow);
      if (e.data.shopByGenderHeading !== undefined) setLiveShopByGenderHeading(e.data.shopByGenderHeading);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  /* ─── BODY SCROLL LOCK + LIGHTBOX/SEARCH KEYS ─── */
  useEffect(() => {
    document.body.style.overflow = (cartOpen || !!selectedProduct || mobileNavOpen || !!lightbox || showSearch || sizeChartOpen) ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (lightbox) setLightbox(null);
        else if (showSearch) { setShowSearch(false); setSearchQuery(""); }
      } else if (lightbox && e.key === "ArrowLeft" && lightbox.imgs.length > 1) {
        setLightbox((s) => s ? { ...s, index: (s.index - 1 + s.imgs.length) % s.imgs.length } : s);
      } else if (lightbox && e.key === "ArrowRight" && lightbox.imgs.length > 1) {
        setLightbox((s) => s ? { ...s, index: (s.index + 1) % s.imgs.length } : s);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [cartOpen, selectedProduct, mobileNavOpen, lightbox, showSearch, sizeChartOpen]);

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
  // Every product now gets its own real, shareable, indexable URL. Once a
  // product has a real (Shopify-derived or generated) handle, link straight
  // to the SEO-friendly /products/<handle> page matching 4regn's real
  // storefront's URL format; a product with no handle yet (not backfilled,
  // or the migration hasn't run at all) falls back to the /p/<id> route
  // exactly as it worked before. Inside the Online Visual Editor iframe we
  // keep opening the in-page modal instead, same as other templates, so
  // editing doesn't navigate the preview away from the section being edited.
  const goToProduct = (p: Product) => {
    if (isEditMode) { openProduct(p); return; }
    navigate(sp(p.handle ? `/products/${p.handle}` : `/p/${p.id}`));
  };
  // Shared broken-image fallback for grid thumbnails (product + collection
  // cards): if the stored image URL 404s/expires, swap in the initials
  // "frame" mark instead of leaving the browser's tiny broken-image icon
  // floating in the corner of an otherwise-empty card.
  const handleImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    e.currentTarget.style.display = "none";
    const fallback = e.currentTarget.parentElement?.querySelector<HTMLElement>(".fr-p-mark, .fr-cat-mark");
    if (fallback) fallback.style.display = "flex";
  };
  // Dedicated product-detail page (mode="product") -- resets the same
  // gallery/variant state the slide-over's openProduct() resets, but for
  // initialActiveProduct instead of a card click. Keyed on the product id so
  // navigating from one dedicated product page to another (e.g. via "You
  // Might Also Like") resets the gallery/variant picker instead of carrying
  // the previous product's selection over.
  useEffect(() => {
    if (mode === "product" && initialActiveProduct) {
      setActiveImg(0);
      setSelectedVariants({});
      setLocalQty(1);
      setVariantError(false);
    }
  }, [mode, initialActiveProduct?.id]);
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
  // Same add-to-cart validation/logic as handleAddToCart above, generalized
  // to take an explicit product so the dedicated product-detail page
  // (mode="product", which never sets selectedProduct) can reuse it for its
  // own Add to Bag button.
  const addProductToCart = (product: Product) => {
    const validVariants = (product.variants || []).filter(v => v.options?.length > 0);
    const allSelected = validVariants.every((v) => selectedVariants[v.name]);
    if (!allSelected && validVariants.length > 0) {
      setVariantError(true);
      return;
    }
    addToCart(product, localQty, selectedVariants);
    setCartOpen(true);
  };
  // Same Buy Now logic as the slide-over PDP's inline handler further below,
  // generalized the same way for the dedicated product page.
  const buyNowFor = (product: Product) => {
    const validVariants = (product.variants || []).filter(v => v.options?.length > 0);
    const allSelected = validVariants.every((v) => selectedVariants[v.name]);
    if (!allSelected && validVariants.length > 0) { setVariantError(true); return; }
    const payload = [{ id: product.id, name: product.name, price: effectivePrice(product, selectedVariants), qty: localQty, variant: Object.entries(selectedVariants).map(([k, v]) => k + ": " + v).join(", "), image: product.image_url || "", selectedVariants }];
    const encoded = btoa(JSON.stringify(payload));
    window.location.href = sp(`/checkout?cart=${encoded}`);
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
  // "Shop by Collection" grid: the seller's real, explicitly-ordered
  // collections list is the source of truth here (same list the nav/footer
  // already use below) so this grid can never drift from what the seller
  // actually configured. Only falls back to auto-derived product.category
  // tags for stores that haven't set up collections yet, so the grid isn't
  // simply empty for them.
  const sellerCollections = (seller?.collections || []).filter(Boolean);
  const categoryList = sellerCollections.length > 0 ? sellerCollections : allCategories.filter((c) => c !== "All").slice(0, 8);
  // Nav / menu links come straight from the seller's collections list -- no
  // fixed menu structure baked in here.
  const menuCategories = ["All", ...sellerCollections];
  const effectiveCategory = isCollectionView && collectionName ? collectionName : activeCategory;
  // Real product search -- same `products` source the category-filter grid
  // above already uses, matched against a free-text query by name and
  // category instead of a fixed active category. Null (not just an empty
  // array) when the box is empty so the overlay can tell "no query yet"
  // apart from "query matched nothing".
  const searchQueryTrimmed = searchQuery.trim().toLowerCase();
  const searched = searchQueryTrimmed
    ? products.filter((p) =>
        p.name.toLowerCase().includes(searchQueryTrimmed) ||
        (p.category || "").toLowerCase().includes(searchQueryTrimmed)
      )
    : null;
  const sortProducts = (list: Product[]) => {
    const out = [...list];
    if (productSort === "az") out.sort((a, b) => a.name.localeCompare(b.name));
    else if (productSort === "za") out.sort((a, b) => b.name.localeCompare(a.name));
    else if (productSort === "latest") out.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
    else if (productSort === "oldest") out.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
    else if (productSort === "price-low") out.sort((a, b) => a.price - b.price);
    else if (productSort === "price-high") out.sort((a, b) => b.price - a.price);
    return out;
  };
  const filtered = (() => {
    const list = isCollectionView
      ? [...products]
      : (activeCategory === "All" ? [...products] : products.filter((p) => pInCat(p, activeCategory)));
    return sortProducts(list);
  })();
  // Per-collection product-preview rows used to render on the homepage
  // (one titled row per collection). Removed: the homepage already has a
  // "Shop by Collection" tile grid, a dedicated /c/<collection> page per
  // collection, and a "View All Products" link, so repeating every
  // collection's products again here was redundant. The grouping logic is
  // kept (and still selectable below) in case a future view wants it, but
  // it is hardcoded off for the home view -- productGroups is always null
  // there, so the homepage now always falls through to the flat single-grid
  // path below (the same one collection pages already use).
  const productGroups = (false && isHomeView && sellerCollections.length > 0)
    ? (() => {
        // name: null marks the catch-all "everything else" row, whose
        // heading uses the seller's configurable Products heading rather
        // than a hardcoded label (resolved at render time, once `config`
        // is in scope below).
        const groups: { name: string | null; products: Product[] }[] = [];
        const claimed = new Set<string>();
        for (const cat of sellerCollections) {
          const inCat = products.filter((p) => pInCat(p, cat));
          if (inCat.length === 0) continue;
          inCat.forEach((p) => claimed.add(p.id));
          groups.push({ name: cat, products: sortProducts(inCat) });
        }
        const leftover = products.filter((p) => !claimed.has(p.id));
        if (leftover.length > 0) {
          groups.push({ name: null, products: sortProducts(leftover) });
        }
        return groups;
      })()
    : null;
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

  // SETLA promo strip -- 4regn's real storefront advertises SETLA (buy-now-
  // pay-later) right under the hero, so it's opt-out (default on) rather
  // than opt-in, with real copy pre-filled as the default. Links out to the
  // SETLA marketing subdomain the same way the rest of the platform does --
  // not a per-seller-editable link, since it's platform routing, not brand
  // content.
  const showSetlaBanner = config.show_setla_banner ?? true;
  const setlaEyebrow = config.setla_eyebrow ?? `Flexible payments on ${seller.store_name}`;
  const setlaLead = config.setla_lead ?? "Eligible customers can shop with SETLA and split selected purchases into interest-free instalments — with your payment plan shown clearly before you commit.";
  const setlaBadge = config.setla_badge ?? "Interest-free SETLA payment options";
  const setlaNote = config.setla_note ?? "Subject to eligibility and affordability assessment. Personal spending limits and available payment options may vary.";
  const setlaCtaPrimary = config.setla_cta_primary ?? "Discover my SETLA limit";
  const setlaCtaSecondary = config.setla_cta_secondary ?? "See how SETLA works";
  const setlaPhotoUrl = (config as any).setla_photo_url || null;

  const displayFooterTagline = liveFooterTagline ?? config.footer_tagline ?? liveDescription ?? seller.description ?? seller.tagline ?? "";
  const displayFooterCol1 = liveFooterCol1Label ?? config.footer_col1_label ?? "Shop";
  // Opt-out (default on) -- 4regn's real storefront always shows the "Join
  // the 4REGN Family" signup, so unlike Soft Luxury's newsletter (opt-in)
  // this only hides when a seller has explicitly turned it off.
  const showNewsletter = liveShowNewsletter ?? config.show_newsletter ?? true;
  const nlLabel = liveNewsletterLabel ?? config.newsletter_label ?? "Join the Family";
  const nlTitle = liveNewsletterTitle ?? config.newsletter_title ?? `Join the ${seller.store_name} Family`;
  const nlSub = liveNewsletterSub ?? config.newsletter_sub ?? "We'll email you about new arrivals and restocks. Nothing else.";

  // Shop by Gender -- opt-out (default on), same "always show unless a
  // seller explicitly hides it" convention as SETLA/Newsletter above, since
  // it's the real 4regn homepage's default state too. Eyebrow/heading are
  // the only editable copy (no fixed category slots) -- everything else is
  // derived straight from the seller's real `collections` list below.
  const showShopByGender = liveShowShopByGender ?? config.show_shopbygender ?? true;
  const sbgEyebrow = liveShopByGenderEyebrow ?? config.shopbygender_eyebrow ?? `${seller.store_name} Collection`;
  const sbgHeading = liveShopByGenderHeading ?? config.shopbygender_heading ?? "Shop by Category";
  const { men: sbgMen, women: sbgWomen } = partitionGenderCollections(sellerCollections);
  const sbgHasMen = sbgMen.items.length > 0;
  const sbgHasWomen = sbgWomen.items.length > 0;
  // Hide the whole section if neither bucket has real collections yet
  // (e.g. before migrate-4regn-collections.ts has run); hide just the
  // empty panel if only one gender has collections set up.
  const showShopByGenderSection = isHomeView && showShopByGender && (sbgHasMen || sbgHasWomen);

  const catImage = (cat: string) => {
    const p = products.find((p) => pInCat(p, cat) && p.image_url);
    return p?.image_url || null;
  };
  const catCount = (cat: string) => products.filter((p) => pInCat(p, cat)).length;

  // Sort order for the /collections index list (collectionSort state) --
  // only computed there, but cheap enough (72-ish collections, not
  // thousands of products) to just derive on every render like `filtered`
  // above rather than memoize.
  const sortedSellerCollections = [...sellerCollections].sort((a, b) => {
    if (collectionSort === "za") return b.localeCompare(a);
    if (collectionSort === "most") return catCount(b) - catCount(a);
    if (collectionSort === "fewest") return catCount(a) - catCount(b);
    return a.localeCompare(b); // "az" (default)
  });

  // Single tile renderer shared by the homepage's capped "Shop by
  // Collection" grid and the uncapped /collections index page, so both stay
  // in sync instead of two copy-pasted blocks.
  const renderCatTile = (cat: string) => {
    const img = catImage(cat);
    return (
      <button key={cat} className="fr-cat-card" onClick={() => navigate(sp(`/c/${collectionSlug(cat)}`))}>
        <div className="fr-cat-img">
          {img ? (
            <>
              <Image src={img} alt={cat} fill sizes="(max-width: 900px) 50vw, 25vw" style={{ objectFit: "contain" }} onError={handleImgError} />
              <span className="fr-cat-mark" style={{ display: "none" }}>{cat}</span>
            </>
          ) : <span className="fr-cat-mark">{cat}</span>}
        </div>
        <div className="fr-cat-foot">
          <div className="fr-cat-name">{cat}</div>
          <div className="fr-cat-count">{catCount(cat)} {catCount(cat) === 1 ? "piece" : "pieces"}</div>
        </div>
      </button>
    );
  };

  /* Shared product-card markup -- used by the grouped collection rows, the
     flat fallback grid, and the collection-page grid, so all three stay in
     sync instead of drifting out of three copy-pasted blocks. */
  const ProductCard = ({ p }: { p: Product }) => {
    const onSale = p.old_price && p.old_price > p.price;
    const promo = getProductPromo(p.id);
    return (
      <div className="fr-pcard" onClick={() => goToProduct(p)}>
        {promo && <span className="fr-ptag sale">{promo.type === "percentage" ? `-${promo.value}%` : "Sale"}</span>}
        {!promo && onSale && <span className="fr-ptag sale">Sale</span>}
        <div className="fr-pimg">
          {p.image_url ? (
            <>
              <Image src={p.image_url} alt={p.name} fill sizes="(max-width: 900px) 50vw, 25vw" style={{ objectFit: "cover" }} onError={handleImgError} />
              <span className="fr-p-mark" style={{ display: "none" }}>{initials(p.name)}</span>
            </>
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
          <button className="fr-pwa" type="button" onClick={(e) => { e.stopPropagation(); goToProduct(p); }}>
            Add to Bag
          </button>
        </div>
      </div>
    );
  };

  /* Shared contact-info list -- rendered on the dedicated Contact page
     (policyKey="contact"). */
  const ContactInfoList = () => (
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
  );

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
@keyframes fr-spin{to{transform:rotate(360deg)}}

.fr-nav{position:sticky;top:0;z-index:100;background:var(--head-bg);display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;padding:0 40px;height:72px}
.fr-nav-left{display:flex;align-items:center;gap:20px}
.fr-burger{display:none;background:none;border:none;cursor:pointer;width:24px;height:24px;flex-direction:column;justify-content:space-between;padding:5px 0}
.fr-burger span{display:block;width:100%;height:1px;background:var(--head-text)}
.fr-logo{font-family:var(--serif);font-weight:700;font-size:24px;letter-spacing:0.5px;color:var(--head-text);text-decoration:none;line-height:1;white-space:nowrap}
.fr-logo img{height:34px;width:auto;display:block;object-fit:contain}
.fr-nav-links{display:flex;gap:28px;align-items:center;justify-content:center;overflow:hidden}
/* Mobile-only duplicate of .fr-logo, rendered inside .fr-nav-links so it can
   occupy the nav's centered middle grid column once the real nav links hide
   there below 900px -- see the two mobile-breakpoint rules that toggle
   which of the two logo copies (this one vs. the .fr-nav-left one) is
   visible. Hidden by default so it never doubles up the logo on desktop. */
.fr-nav-links .fr-logo{display:none}
.fr-nav-link{font-family:var(--body);font-size:12px;font-weight:400;letter-spacing:1px;text-transform:uppercase;text-decoration:none;color:rgba(253,251,247,0.75);transition:color 0.2s;background:none;border:none;cursor:pointer;white-space:nowrap}
.fr-nav-link:hover{color:var(--head-text)}
.fr-nav-right{display:flex;justify-content:flex-end;align-items:center;gap:18px}
.fr-search-btn{background:none;border:none;cursor:pointer;color:var(--head-text);padding:4px;display:flex;align-items:center}
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

/* SETLA's own green identity (matches setla.4regn.com and the SETLA
   customer dashboard) -- deliberately not 4regn's black/brown/purple. */
.fr-setla{position:relative;min-height:560px;overflow:hidden;background:#050505;isolation:isolate}
.fr-setla::after{content:'';position:absolute;inset:0;pointer-events:none;background:linear-gradient(90deg,rgba(5,5,5,.99) 0%,rgba(5,5,5,.95) 30%,rgba(5,5,5,.6) 47%,rgba(5,5,5,.1) 68%,rgba(5,5,5,.1) 100%);z-index:1}
.fr-setla-photo{position:absolute;inset:0 0 0 39%;z-index:0}
.fr-setla-glow{position:absolute;z-index:1;width:380px;height:380px;border-radius:50%;background:rgba(0,117,23,.24);filter:blur(120px);left:18%;bottom:-160px;pointer-events:none}
/* This is flex with no flex-direction -- meaning its 5 direct children
   (eyebrow, h1, lead paragraph, cta row, note) were laid out as a
   horizontal ROW by default instead of the stacked text block the design
   clearly calls for (max-width:560px on the headline, left-aligned copy).
   That's the real root cause of the SETLA banner looking "cropped/doesn't
   fit": every line was being squeezed to fit side-by-side in one row and
   wrapping/overlapping instead of reading top-to-bottom. flex-direction:
   column fixes the stacking; align-items:flex-start keeps the left-aligned
   layout (align-items now controls the horizontal cross-axis); justify-
   content:center keeps the original vertical-centering intent (now the
   main axis). */
.fr-setla-inner{position:relative;z-index:2;max-width:1360px;min-height:560px;margin:0 auto;padding:64px 40px 96px;display:flex;flex-direction:column;justify-content:center;align-items:flex-start}
.fr-setla-eyebrow{display:flex;align-items:center;gap:10px;color:#4ade80;font-family:var(--body);font-size:12px;letter-spacing:0.25em;text-transform:uppercase;font-weight:700;margin-bottom:18px}
.fr-setla-eyebrow::before{content:'';width:26px;height:1px;background:#4ade80}
.fr-setla-h1{margin:0;font-family:var(--serif);font-size:clamp(40px,6vw,76px);line-height:0.92;letter-spacing:-0.02em;font-weight:700;color:#f7f7f7;max-width:560px}
.fr-setla-lead{max-width:480px;color:#d1d6d2;font-family:var(--body);font-size:15px;line-height:1.65;margin:22px 0 0}
.fr-setla .fr-cta-row{margin-top:28px}
.fr-setla-btn{height:52px;padding:0 22px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font-family:var(--body);font-weight:700;text-transform:uppercase;letter-spacing:0.1em;font-size:11px;transition:transform 0.2s ease}
.fr-setla-btn:hover{transform:translateY(-2px)}
.fr-setla-btn-primary{background:linear-gradient(90deg,#0c8f26,#25c749);box-shadow:0 12px 30px rgba(24,184,61,0.25);color:#fff}
.fr-setla-btn-secondary{border:1px solid rgba(255,255,255,0.2);background:rgba(0,0,0,0.34);color:#f7f7f7}
.fr-setla-note{margin-top:14px;color:#8f9891;font-family:var(--body);font-size:11px;line-height:1.5;max-width:460px}
.fr-setla-plans{position:absolute;z-index:3;left:40px;bottom:28px;display:flex;gap:10px}
.fr-setla-plan{display:flex;align-items:center;gap:10px;min-height:58px;padding:12px 15px;border:1px solid rgba(74,222,128,0.19);border-radius:16px;background:rgba(7,10,8,0.82);box-shadow:0 10px 30px rgba(0,0,0,0.18)}
.fr-setla-plan-num{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:rgba(24,184,61,0.13);color:#4ade80;border:1px solid rgba(74,222,128,0.22);font-weight:700}
.fr-setla-plan strong{display:block;font-family:var(--body);font-size:12px;margin-bottom:2px;color:#f7f7f7}
.fr-setla-plan span{display:block;font-family:var(--body);color:#929c94;font-size:10px}
.fr-setla-badge{position:absolute;z-index:3;right:28px;bottom:28px;padding:12px 14px;border:1px solid rgba(255,255,255,0.12);border-radius:15px;background:rgba(5,5,5,0.56);display:flex;align-items:center;gap:9px;color:#d8ddd9;font-family:var(--body);font-size:11px}
.fr-setla-badge i{display:block;width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 16px #4ade80}

/* SHOP BY GENDER — ported 1:1 from the real 4regn.com "Shop by Gender"
   section (chrome-spinning glass panels, drag/arrow-scrollable circular
   category tiles). Class names prefixed .fr-sbg- (not the raw Shopify
   .sbg- names) to match this file's naming convention. */
.fr-sbg-section{padding:40px 20px;background:#EBEBEB}
.fr-sbg-inner{max-width:1200px;margin:0 auto;display:flex;flex-direction:column;gap:20px}
.fr-sbg-header{text-align:center}
.fr-sbg-eyebrow{font-size:10px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:#8C8880;margin-bottom:6px}
.fr-sbg-heading{font-size:clamp(16px,2vw,22px);font-weight:400;letter-spacing:7px;text-transform:uppercase;color:#1a1a1a;margin:0}
.fr-sbg-panels{display:flex;flex-direction:row;gap:0;align-items:stretch}
.fr-sbg-panel{flex:1;min-width:0;border-radius:24px;padding:2.5px;position:relative;overflow:hidden;box-shadow:0 16px 44px rgba(0,0,0,0.09),0 3px 10px rgba(0,0,0,0.05);transition:transform 0.3s ease;background:rgba(175,173,175,0.4)}
.fr-sbg-panel::before{content:'';position:absolute;inset:-100%;background:conic-gradient(from 0deg, transparent 0deg, transparent 55deg, rgba(200,198,202,0.3) 70deg, rgba(255,255,255,0.95) 85deg, rgba(220,218,222,0.6) 98deg, rgba(255,255,255,0.3) 110deg, transparent 125deg, transparent 360deg);animation:fr-sbg-chrome-spin 3s linear infinite;z-index:0}
@keyframes fr-sbg-chrome-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.fr-sbg-panel::after{content:'';position:absolute;inset:2.5px;border-radius:22px;background:#EBEBEB;z-index:1;pointer-events:none}
.fr-sbg-panel:hover{transform:translateY(-3px)}
.fr-sbg-panel-inner{background:rgba(255,255,255,0.56);backdrop-filter:blur(48px) saturate(175%);-webkit-backdrop-filter:blur(48px) saturate(175%);border-radius:22px;height:100%;padding:28px 18px 24px;display:flex;flex-direction:column;align-items:center;gap:14px;position:relative;overflow:hidden;z-index:2}
.fr-sbg-panel-title{font-family:var(--serif);font-size:clamp(28px,4vw,48px);font-weight:700;letter-spacing:7px;color:#1a1a1a;text-transform:uppercase;text-align:center;margin:0;transition:letter-spacing 0.3s}
.fr-sbg-panel:hover .fr-sbg-panel-title{letter-spacing:11px}
.fr-sbg-shopall{display:inline-flex;align-items:center;gap:6px;padding:7px 18px;border-radius:40px;background:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.05),inset 0 1px 0 rgba(255,255,255,0.9);font-size:10px;font-weight:600;letter-spacing:2.5px;text-transform:uppercase;color:#555;text-decoration:none;transition:all 0.22s;white-space:nowrap;cursor:pointer}
.fr-sbg-shopall:hover{background:rgba(255,255,255,0.88);color:#1a1a1a;transform:scale(1.03)}
.fr-sbg-track-wrap{width:100%;position:relative}
.fr-sbg-track-wrap::after{content:'';position:absolute;top:0;right:0;bottom:0;width:56px;border-radius:0 22px 22px 0;background:linear-gradient(to right, rgba(235,235,235,0), rgba(235,235,235,0.92));pointer-events:none;opacity:1;transition:opacity 0.25s}
.fr-sbg-track-wrap.at-end::after{opacity:0}
.fr-sbg-track{display:flex;gap:14px;overflow-x:auto;padding:8px 2px 4px;scrollbar-width:none;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;cursor:grab}
.fr-sbg-track::-webkit-scrollbar{display:none}
.fr-sbg-track:active{cursor:grabbing}
.fr-sbg-cat-item{display:flex;flex-direction:column;align-items:center;gap:9px;flex-shrink:0;scroll-snap-align:start;text-decoration:none;transition:transform 0.3s cubic-bezier(0.34,1.56,0.64,1)}
.fr-sbg-cat-item:hover{transform:translateY(-5px) scale(1.03)}
.fr-sbg-circle-frame{width:clamp(70px,10vw,130px);height:clamp(70px,10vw,130px);border-radius:50%;flex-shrink:0;position:relative;overflow:hidden;background:rgba(172,170,172,0.35);box-shadow:0 5px 20px rgba(0,0,0,0.1),0 1px 5px rgba(0,0,0,0.05);transition:box-shadow 0.3s}
.fr-sbg-circle-frame::before{content:'';position:absolute;inset:-100%;background:conic-gradient(from 0deg, transparent 0deg, transparent 60deg, rgba(200,198,202,0.25) 72deg, rgba(255,255,255,0.95) 82deg, rgba(220,218,224,0.5) 90deg, rgba(255,255,255,0.2) 100deg, transparent 112deg, transparent 360deg);animation:fr-sbg-circle-spin 2.5s linear infinite;z-index:0;pointer-events:none}
@keyframes fr-sbg-circle-spin{0%{transform:rotate(0deg)}100%{transform:rotate(360deg)}}
.fr-sbg-circle-frame::after{content:'';position:absolute;inset:2px;border-radius:50%;background:#EBEBEB;z-index:1;pointer-events:none}
.fr-sbg-cat-item:hover .fr-sbg-circle-frame{box-shadow:0 10px 30px rgba(0,0,0,0.14)}
.fr-sbg-circle-img{position:absolute;inset:2px;border-radius:50%;overflow:hidden;background:#d8d4ce;z-index:2}
.fr-sbg-circle-img img{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%;transition:transform 0.45s ease}
.fr-sbg-cat-item:hover .fr-sbg-circle-img img{transform:scale(1.07)}
.fr-sbg-cat-label{font-size:9px;font-weight:600;letter-spacing:2px;text-transform:uppercase;color:#444;background:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.88);padding:4px 11px;border-radius:30px;white-space:nowrap;transition:all 0.2s}
.fr-sbg-cat-item:hover .fr-sbg-cat-label{background:rgba(255,255,255,0.85);color:#1a1a1a}
.fr-sbg-arrow-row{display:flex;justify-content:space-between;align-items:center;width:100%}
.fr-sbg-arrow{width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.5);border:1px solid rgba(255,255,255,0.9);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#666;box-shadow:0 1px 6px rgba(0,0,0,0.06);transition:all 0.2s;font-size:13px;line-height:1;padding:0}
.fr-sbg-arrow:hover{background:rgba(255,255,255,0.92);color:#1a1a1a;transform:scale(1.1)}
.fr-sbg-dots{display:flex;gap:4px;align-items:center}
.fr-sbg-dot{width:4px;height:4px;border-radius:999px;background:rgba(0,0,0,0.18);transition:all 0.25s ease;padding:0;border:none}
.fr-sbg-dot.active{width:14px;background:rgba(0,0,0,0.55)}
.fr-sbg-divider{width:1px;flex-shrink:0;align-self:stretch;margin:0 10px;background:linear-gradient(to bottom, transparent 0%, rgba(150,148,150,0.28) 15%, rgba(190,188,190,0.45) 35%, rgba(255,255,255,0.7) 50%, rgba(190,188,190,0.45) 65%, rgba(150,148,150,0.28) 85%, transparent 100%);position:relative;overflow:hidden}
.fr-sbg-divider-shimmer{position:absolute;left:0;right:0;height:50px;background:linear-gradient(to bottom, transparent, rgba(255,255,255,0.88) 50%, transparent);animation:fr-sbg-divider-flow 2.8s ease-in-out infinite}
@keyframes fr-sbg-divider-flow{0%{top:-100%}100%{top:100%}}

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
.fr-cat-img img{width:100%;height:100%;object-fit:contain;display:block;transition:transform 0.5s ease}
.fr-cat-card:hover .fr-cat-img img{transform:scale(1.05)}
.fr-cat-mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:700;font-size:22px;color:rgba(46,42,57,0.35);text-transform:capitalize}
.fr-cat-foot{padding:16px 14px 20px}
.fr-cat-name{font-family:var(--serif);font-weight:700;font-size:15px;color:var(--ink);margin-bottom:4px}
.fr-cat-count{font-size:11px;color:rgba(46,42,57,0.55)}

/* /collections index -- compact, dense, sortable row list (fr-collist-*).
   Deliberately not fr-cat-grid/fr-cat-card: a full 4:5-tile grid of a
   seller's whole (often 70+) collection list is too visually heavy, unlike
   the homepage's own capped ~20-item teaser that fr-cat-grid stays reserved
   for. */
.fr-collist{display:flex;flex-direction:column;background:#fff;border-radius:var(--card-radius);box-shadow:var(--card-shadow);overflow:hidden}
.fr-collist-row{display:flex;align-items:center;gap:16px;padding:12px 18px;text-decoration:none;color:inherit;font-family:var(--body);border-bottom:1px solid rgba(0,0,0,0.06);cursor:pointer;background:none;transition:background 0.15s}
.fr-collist-row:last-child{border-bottom:none}
.fr-collist-row:hover{background:rgba(0,0,0,0.02)}
.fr-collist-thumb{position:relative;width:60px;height:60px;flex-shrink:0;border-radius:8px;overflow:hidden;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
.fr-collist-thumb img{width:100%;height:100%;object-fit:cover;display:block}
.fr-collist-thumb .fr-cat-mark{font-size:11px}
.fr-collist-name{flex:1;font-family:var(--serif);font-weight:700;font-size:15px;color:var(--ink)}
.fr-collist-count{font-size:12px;color:rgba(46,42,57,0.55);white-space:nowrap}
.fr-collist-arrow{font-size:18px;color:rgba(46,42,57,0.35);line-height:1}

.fr-pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.fr-pcard{background:#fff;border-radius:var(--card-radius);box-shadow:var(--card-shadow);overflow:hidden;cursor:pointer;text-align:center;position:relative;transition:transform 0.2s}
.fr-pcard:hover{transform:translateY(-3px)}
.fr-pimg{width:100%;aspect-ratio:4/5;overflow:hidden;position:relative;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
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

/* Light/cream treatment -- matches 4regn's real "Join the 4REGN Family"
   section (light body background, not the dark "Stay in the know" style
   the rest of this template deliberately avoids outside the header/footer
   bookends). */
.fr-newsletter{background:var(--cream);padding:88px 40px;text-align:center}
.fr-nl-lbl{font-size:10px;letter-spacing:3px;text-transform:uppercase;color:rgba(46,42,57,0.55);margin-bottom:16px}
.fr-nl-title{font-family:var(--serif);font-weight:700;font-size:clamp(28px,4vw,44px);color:var(--ink);margin-bottom:16px}
.fr-nl-sub{font-size:14px;color:rgba(46,42,57,0.65);max-width:460px;margin:0 auto 28px;line-height:1.6}
.fr-nl-form{display:flex;max-width:440px;margin:0 auto;gap:8px}
.fr-nl-form input{flex:1;background:#fff;border:1px solid rgba(0,0,0,0.12);border-radius:var(--btn-radius);outline:none;font-family:var(--body);font-size:13px;padding:13px 16px;color:var(--ink)}
.fr-nl-form input::placeholder{color:rgba(46,42,57,0.4)}
.fr-nl-form button{background:var(--btn-bg);color:var(--btn-text);border:none;border-radius:var(--btn-radius);cursor:pointer;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;padding:13px 22px}

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

.fr-search-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1050;display:flex;align-items:flex-start;justify-content:center;padding:90px 24px 24px}
.fr-search-panel{background:#fff;border-radius:var(--card-radius);max-width:640px;width:100%;max-height:74vh;overflow:hidden;box-shadow:var(--card-shadow);display:flex;flex-direction:column}
.fr-search-bar{display:flex;align-items:center;gap:14px;padding:20px 24px;border-bottom:1px solid rgba(0,0,0,0.08);flex-shrink:0}
.fr-search-bar svg{flex-shrink:0;color:rgba(46,42,57,0.4)}
.fr-search-input{flex:1;min-width:0;border:none;outline:none;background:none;font-family:var(--serif);font-size:19px;color:var(--ink)}
.fr-search-close{background:none;border:none;font-size:20px;color:rgba(46,42,57,0.5);cursor:pointer;padding:4px 6px;flex-shrink:0}
.fr-search-results{overflow-y:auto;padding:8px 12px}
.fr-search-empty,.fr-search-hint{padding:36px 12px;text-align:center;color:rgba(46,42,57,0.5);font-size:13px}
.fr-search-item{display:flex;align-items:center;gap:14px;padding:12px;border-radius:10px;cursor:pointer;text-align:left;background:none;border:none;width:100%}
.fr-search-item:hover{background:rgba(0,0,0,0.04)}
.fr-search-item-img{width:52px;height:64px;border-radius:6px;object-fit:cover;flex-shrink:0;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
.fr-search-item-info{flex:1;min-width:0}
.fr-search-item-name{font-family:var(--serif);font-weight:700;font-size:14px;color:var(--ink);margin-bottom:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.fr-search-item-cat{font-size:10px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.5)}
.fr-search-item-price{font-size:13px;font-weight:700;color:var(--ink);flex-shrink:0}
.fr-contact-list{list-style:none;margin:0;padding:0}
.fr-contact-list li{padding:10px 0;border-bottom:1px solid rgba(0,0,0,0.08);display:flex;align-items:center;gap:12px}
.fr-contact-list li:last-child{border-bottom:none}
.fr-contact-list a{color:var(--ink);font-size:13px;text-decoration:none}
.fr-contact-label{font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);width:82px;flex-shrink:0}

.fr-mm-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:998;opacity:0;pointer-events:none;transition:opacity 0.3s}
.fr-mm-overlay.open{opacity:1;pointer-events:all}
.fr-mm{position:fixed;top:0;left:0;bottom:0;width:320px;max-width:90vw;background:#000;color:#fdfbf7;z-index:999;transform:translateX(-100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column;padding:26px;overflow-y:auto;overscroll-behavior:contain}
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
.fr-pdp-gal{background:#fff;min-height:600px;display:flex;flex-direction:column;padding:20px;gap:10px;border-right:1px solid rgba(0,0,0,0.06)}
.fr-pdp-main{flex:1;aspect-ratio:4/5;display:flex;align-items:center;justify-content:center;position:relative;background-color:#f5f5f5;cursor:zoom-in;overflow:hidden;width:100%;border-radius:var(--card-radius)}
.fr-pdp-main img{width:100%;height:100%;object-fit:contain;display:block}
.fr-pdp-loading{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(245,245,245,0.6);z-index:2;pointer-events:none}
.fr-pdp-loading-spin{width:26px;height:26px;border:2px solid rgba(0,0,0,0.1);border-top-color:rgba(0,0,0,0.4);border-radius:50%;animation:fr-spin 0.9s linear infinite}
.fr-pdp-nav{position:absolute;top:50%;transform:translateY(-50%);width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.7);color:#1a1a1a;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;padding-bottom:2px;box-shadow:0 1px 6px rgba(0,0,0,0.12);transition:all 0.2s;z-index:1}
.fr-pdp-nav:hover{background:rgba(255,255,255,0.95);transform:translateY(-50%) scale(1.08)}
.fr-pdp-nav-prev{left:14px}
.fr-pdp-nav-next{right:14px}
.fr-pdp-imgcount{position:absolute;bottom:14px;right:14px;padding:5px 11px;border-radius:100px;background:rgba(0,0,0,0.55);color:#fff;font-size:11px;letter-spacing:0.5px;font-family:var(--body);line-height:1;z-index:1}
.fr-pdp-info{padding:44px 52px;display:flex;flex-direction:column}
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

/* DEDICATED PRODUCT PAGE (/p/<id>, mode="product") — outer wrapper +
   breadcrumb are new; everything inside .fr-pdp-grid reuses the slide-over
   PDP's own fr-pdp-* classes above verbatim so the two stay visually
   identical. */
.fr-pdp2-page{max-width:1360px;margin:0 auto;padding:40px 40px 0}
/* Reuses .fr-coll-back's text treatment (the collection page's own "← Back"
   link) verbatim for visual consistency; this override just left-aligns it
   since .fr-coll-back's centering comes from its own parent
   (.fr-coll-header{text-align:center}), which this page doesn't have. */
.fr-pdp2-back{display:block;text-align:left}
.fr-pdp2-bread{display:flex;flex-wrap:wrap;gap:8px;align-items:center;font-family:var(--body);font-size:11px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.55);margin-bottom:28px}
.fr-pdp2-bread a{color:rgba(46,42,57,0.55);text-decoration:none}
.fr-pdp2-bread a:hover{color:var(--ink);text-decoration:underline}
.fr-pdp2-bread .sep{color:rgba(46,42,57,0.3)}
.fr-pdp2-bread .current{color:var(--ink)}
.fr-pdp2-sizechart-btn{align-self:flex-start;background:none;border:none;padding:0;margin:-6px 0 20px;font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;text-decoration:underline;text-underline-offset:3px;color:var(--ink);cursor:pointer}

/* SIZE CHART MODAL content -- reuses fr-modal-overlay/fr-modal from the
   policy modal below for the overlay/close chrome. */
.fr-sc-tabs{display:flex;gap:4px;margin-bottom:18px;border-bottom:1px solid rgba(0,0,0,0.08)}
.fr-sc-tab{background:none;border:none;padding:8px 10px 12px;font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:rgba(46,42,57,0.5);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.fr-sc-tab.active{color:var(--ink);border-bottom-color:var(--ink)}
.fr-sc-table-wrap{overflow-x:auto}
.fr-sc-table{width:100%;border-collapse:collapse;font-size:12px;font-family:var(--body)}
.fr-sc-table th,.fr-sc-table td{padding:9px 12px;text-align:left;border-bottom:1px solid rgba(0,0,0,0.06);white-space:nowrap}
.fr-sc-table th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(46,42,57,0.5)}
.fr-sc-tip{margin:14px 0 0;font-size:12px;font-style:italic;color:rgba(46,42,57,0.6)}
.fr-sc-measure h4{font-family:var(--serif);font-weight:700;font-size:16px;margin:0 0 14px;color:var(--ink)}
.fr-sc-measure ol{margin:0;padding-left:20px;font-size:13px;line-height:1.85;color:rgba(46,42,57,0.75)}

/* COLLECTIONS INDEX (/collections) & POLICY PAGES (/policies/<policy>) */
.fr-policy-page{max-width:760px;margin:0 auto;padding:64px 40px 96px}
.fr-policy-title{font-family:var(--serif);font-weight:700;font-size:clamp(28px,4vw,40px);color:var(--ink);text-align:center;margin:0 0 32px}
.fr-policy-body{font-family:var(--body);font-size:14px;line-height:1.8;color:rgba(46,42,57,0.75)}
.fr-policy-body p{margin:0 0 18px}
.fr-policy-body p:last-child{margin-bottom:0}

.fr-lb{position:fixed;inset:0;z-index:1100;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;padding:16px}
.fr-lb-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;touch-action:pinch-zoom}
.fr-lb-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;-webkit-user-select:none;user-select:none;pointer-events:none}
.fr-lb-close{position:fixed;top:18px;right:18px;width:44px;height:44px;border-radius:50%;border:none;background:rgba(255,255,255,0.1);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}
.fr-lb-nav{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#fff;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;padding-bottom:4px;z-index:2}
.fr-lb-prev{left:18px}
.fr-lb-next{right:18px}
.fr-lb-dots{position:fixed;bottom:24px;left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:100px;background:rgba(255,255,255,0.08);z-index:2}
.fr-lb-dot{width:6px;height:6px;border-radius:50%;border:none;padding:0;background:rgba(255,255,255,0.35);cursor:pointer}
.fr-lb-dot.active{background:#fff;transform:scale(1.3)}

/* MOBILE BOTTOM DOCK — Home / Search / Cart / Account. Hidden on desktop;
   shown as a floating pill fixed to the bottom of the viewport on mobile
   (matches the real 4regn.com mobile nav). No Wishlist icon -- that's a
   separate, not-yet-built feature. */
.fr-dock{display:none}
.fr-dock-item{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;background:none;border:none;color:rgba(253,251,247,0.6);cursor:pointer;padding:8px 14px;font-family:var(--body);font-size:9px;letter-spacing:0.5px;text-transform:uppercase;line-height:1}
.fr-dock-item.active{color:#fdfbf7}
.fr-dock-count{position:absolute;top:2px;right:6px;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:var(--brown);color:var(--cream);font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:var(--body)}

@media (max-width:900px){
  /* Keep the same 3-column "auto 1fr auto" track as desktop -- the middle
     column stays an empty flexible spacer even though .fr-nav-links itself
     is hidden below, which is what actually pushes the cart icon to the
     right edge. Swapping this to "auto auto 1fr" (as it was) put the
     flexible spacer *after* both real columns instead of between them, so
     the logo and cart icon collapsed together in the top-left with a dead
     empty gap on the right. */
  .fr-nav{padding:0 18px;grid-template-columns:auto 1fr auto;height:60px}
  .fr-burger{display:flex}
  .fr-logo{font-size:19px}
  /* Split the hamburger and logo apart on mobile: the burger stays alone in
     .fr-nav-left, and the logo re-appears centered inside .fr-nav-links
     (whose real nav-link children hide here) instead of being crammed next
     to the burger in the left corner. */
  .fr-nav-left .fr-logo{display:none}
  .fr-nav-links{display:flex}
  .fr-nav-link{display:none}
  .fr-nav-links .fr-logo{display:block}
  .fr-hero-inner{padding:0 24px 48px}
  /* The photo was absolutely positioned (out of flow) as a fixed 340px top
     strip while the section's own height was driven only by its in-flow
     flex children (min-height:0). Whenever that in-flow content (inner +
     plans + badge) rendered shorter than 340px -- routine at 375-414px
     widths -- the section itself shrank below 340px, and overflow:hidden
     then clipped the photo to whatever short height was left, cropping it
     and cramming the text/badges on top of it. Fix: let the photo cover
     the *whole* section (like desktop) and give the section a real
     min-height so it never collapses under the photo; justify-content
     pins the text block to the bottom of that space, over the darkest
     part of the gradient, instead of overlapping the image from the top. */
  .fr-setla{min-height:620px;display:flex;flex-direction:column;justify-content:flex-end}
  .fr-setla::after{background:linear-gradient(180deg,rgba(5,5,5,.04) 0%,rgba(5,5,5,.14) 35%,rgba(5,5,5,.9) 63%,rgba(5,5,5,1) 100%)}
  .fr-setla-photo{inset:0}
  /* align-items stays flex-start (left-aligned text, matching desktop) --
     vertical position is handled by the outer .fr-setla's
     justify-content:flex-end above, which pins this whole block to the
     bottom of the section. */
  .fr-setla-inner{min-height:0;padding:28px 20px 16px;justify-content:flex-end;flex:0 0 auto}
  .fr-setla-h1{font-size:clamp(38px,13vw,60px);max-width:100%}
  .fr-setla-plans{position:relative;left:auto;right:auto;bottom:auto;margin:0 20px 8px;display:grid;grid-template-columns:1fr 1fr;gap:8px}
  .fr-setla-badge{position:relative;left:auto;right:auto;bottom:auto;margin:0 20px 18px;padding:4px 0 0;border:0;background:transparent}
  .fr-sbg-section{padding:28px 12px}
  .fr-sbg-panel{border-radius:18px}
  .fr-sbg-panel-inner{padding:18px 10px 16px;gap:12px;border-radius:16px}
  .fr-sbg-panel-title{font-size:clamp(20px,7vw,30px);letter-spacing:5px}
  .fr-sbg-panel:hover .fr-sbg-panel-title{letter-spacing:7px}
  .fr-sbg-shopall{font-size:8px;padding:6px 14px}
  .fr-sbg-circle-frame{width:clamp(58px,20vw,90px);height:clamp(58px,20vw,90px)}
  .fr-sbg-track{gap:10px}
  .fr-sbg-cat-label{font-size:7.5px;padding:3px 9px}
  .fr-sbg-divider{margin:0 6px}
  .fr-section{padding:48px 20px}
  .fr-coll-header{padding:40px 20px 4px}
  .fr-cat-grid,.fr-pgrid{grid-template-columns:repeat(2,1fr);gap:14px}
  .fr-collist-row{padding:10px 14px;gap:12px}
  .fr-collist-thumb{width:48px;height:48px}
  .fr-collist-name{font-size:13px}
  .fr-collist-count{font-size:11px}
  .fr-newsletter{padding:56px 20px}
  .fr-foot{padding:56px 20px 24px}
  .fr-foot-grid{grid-template-columns:1fr;gap:36px}
  .fr-pdp-grid{grid-template-columns:1fr}
  .fr-pdp-gal{min-height:auto;padding:16px;border-right:none;border-bottom:1px solid rgba(0,0,0,0.06)}
  .fr-pdp-info{padding:28px 22px}
  .fr-pdp-name{font-size:26px}
  .fr-pdp2-page{padding:24px 20px 0}
  .fr-policy-page{padding:48px 20px 64px}
  .fr-cart{width:100vw}
  .fr-root{padding-bottom:78px}
  .fr-dock{display:flex;position:fixed;left:50%;bottom:16px;transform:translateX(-50%);z-index:150;background:rgba(0,0,0,0.92);backdrop-filter:blur(10px);border-radius:999px;padding:6px 4px;gap:2px;box-shadow:0 10px 30px rgba(0,0,0,0.35);align-items:center}
  .fr-search-overlay{padding:24px 14px}
  .fr-search-panel{max-height:88vh}
  .fr-search-bar{padding:16px 18px}
  .fr-search-input{font-size:17px}
}
      `}</style>

      <div className="fr-root">
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
            const allImgs = (p.images && p.images.length > 0 ? p.images : [p.image_url]).filter(Boolean) as string[];
            const onSale = p.old_price && p.old_price > p.price;
            return (
              <>
                <div className="fr-pdp-h">
                  <span className="fr-pdp-bread">{p.category} &nbsp;/&nbsp; {p.name}</span>
                  <button className="fr-pdp-close" onClick={() => setSelectedProduct(null)}>✕</button>
                </div>
                <div className="fr-pdp-grid">
                  <div className="fr-pdp-gal">
                    <ProductGallery
                      imgs={allImgs}
                      activeIndex={activeImg}
                      onIndexChange={setActiveImg}
                      onOpenLightbox={() => { if (allImgs.length > 0) setLightbox({ imgs: allImgs, index: activeImg }); }}
                      onImgError={handleImgError}
                      alt={p.name}
                    />
                  </div>
                  <div className="fr-pdp-info">
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
            {/* Mobile-only duplicate of the .fr-nav-left logo above -- hidden
                on desktop (.fr-nav-links .fr-logo{display:none}), shown here
                only under the 900px breakpoint once the real links below
                hide, so the logo visually centers instead of sitting
                crammed next to the hamburger. Same markup/click-to-home
                behavior as the original. */}
            <a href={sp()} className="fr-logo">
              {displayLogo ? <img src={displayLogo} alt={seller.store_name} /> : seller.store_name}
            </a>
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
            <button className="fr-search-btn" onClick={() => setShowSearch(true)} aria-label="Search products" title="Search products">
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            </button>
            <button className="fr-cart-btn" onClick={() => setCartOpen(true)} aria-label="Cart">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
              {cartCount > 0 && <span className="fr-cart-count">{cartCount}</span>}
            </button>
          </div>
        </nav>

        {/* HERO — only on landing page */}
        {isHomeView && (
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

        {/* SETLA PROMO STRIP — only on landing page. Ported from the real
            "SETLA Hero Banner" Liquid section on 4regn's live site: SETLA's
            own green brand (not 4regn's black/brown/purple palette -- SETLA
            is a distinct financial product with its own established
            identity, same green used across setla.4regn.com and the SETLA
            customer dashboard), full-bleed photo panel, plan chips, and a
            live-dot badge. Headline and plan-chip labels are SETLA product
            branding, not 4regn brand copy, so unlike the rest of this
            component they're fixed text rather than editable fields --
            matches the real section, which doesn't expose them as settings
            either. */}
        {isHomeView && showSetlaBanner && (
          <EditSection id="setla">
            <section className="fr-setla">
              {setlaPhotoUrl && (
                <div className="fr-setla-photo">
                  <Image src={setlaPhotoUrl} alt="" fill sizes="100vw" quality={75} style={{ objectFit: "cover" }} />
                </div>
              )}
              <div className="fr-setla-glow" />
              <div className="fr-setla-inner">
                <div className="fr-setla-eyebrow">{setlaEyebrow}</div>
                <h2 className="fr-setla-h1">Buy now,<br />Pay Later</h2>
                <p className="fr-setla-lead">{setlaLead}</p>
                <div className="fr-cta-row">
                  <a className="fr-setla-btn fr-setla-btn-primary" href="https://setla.4regn.com/signup.html" target="_blank" rel="noopener noreferrer">{setlaCtaPrimary} →</a>
                  <a className="fr-setla-btn fr-setla-btn-secondary" href="https://setla.4regn.com/faq.html" target="_blank" rel="noopener noreferrer">{setlaCtaSecondary}</a>
                </div>
                <p className="fr-setla-note">{setlaNote}</p>
              </div>
              <div className="fr-setla-plans" aria-label="SETLA payment options">
                <div className="fr-setla-plan"><div className="fr-setla-plan-num">4</div><div><strong>4 instalments</strong><span>Over 6 weeks</span></div></div>
                <div className="fr-setla-plan"><div className="fr-setla-plan-num">2</div><div><strong>2 instalments</strong><span>Monthly</span></div></div>
              </div>
              <div className="fr-setla-badge"><i />{setlaBadge}</div>
            </section>
          </EditSection>
        )}

        {/* SHOP BY GENDER — only on landing page. Ported from the real
            "4REGN - Shop by Gender" Liquid section: two glass panels (MEN /
            WOMEN) with a horizontally-scrollable row of circular category
            tiles. Unlike the real Shopify section (12 fixed per-gender
            settings slots), the tiles here are entirely derived from the
            seller's real `collections` list via partitionGenderCollections
            -- "Men <X>" / "Women <X>" become tiles, "ALL MEN" / "ALL WOMEN"
            become the "Shop All" button target. No fixed category list is
            baked in, so this stays generic for any seller who names their
            collections this way, not just 4regn. */}
        {showShopByGenderSection && (
          <EditSection id="shopbygender">
            <section className="fr-sbg-section">
              <div className="fr-sbg-inner">
                <div className="fr-sbg-header">
                  <p className="fr-sbg-eyebrow">{sbgEyebrow}</p>
                  <h2 className="fr-sbg-heading">{sbgHeading}</h2>
                </div>
                <div className="fr-sbg-panels">
                  {sbgHasMen && (
                    <ShopByGenderPanel
                      title="MEN"
                      genderLabel="Men"
                      bucket={sbgMen}
                      catImage={catImage}
                      handleImgError={handleImgError}
                      hrefFor={(name) => sp(`/c/${collectionSlug(name)}`)}
                      onNavigate={(name) => navigate(sp(`/c/${collectionSlug(name)}`))}
                    />
                  )}
                  {sbgHasMen && sbgHasWomen && (
                    <div className="fr-sbg-divider" aria-hidden="true"><div className="fr-sbg-divider-shimmer" /></div>
                  )}
                  {sbgHasWomen && (
                    <ShopByGenderPanel
                      title="WOMEN"
                      genderLabel="Women"
                      bucket={sbgWomen}
                      catImage={catImage}
                      handleImgError={handleImgError}
                      hrefFor={(name) => sp(`/c/${collectionSlug(name)}`)}
                      onNavigate={(name) => navigate(sp(`/c/${collectionSlug(name)}`))}
                    />
                  )}
                </div>
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

        {/* PRODUCT DETAIL — dedicated /p/<id> page (mode="product"). Real
            full page, not the slide-over: breadcrumb, then the exact same
            gallery/info/variant/actions markup + state the slide-over PDP
            below uses (just re-targeted at initialActiveProduct instead of
            selectedProduct), plus a size-chart button/modal and a "You Might
            Also Like" row the slide-over doesn't have. */}
        {isProductView && initialActiveProduct && (() => {
          const p = initialActiveProduct;
          const allImgs = (p.images && p.images.length > 0 ? p.images : [p.image_url]).filter(Boolean) as string[];
          const onSale = p.old_price && p.old_price > p.price;
          const catTokens = (p.category || "").split(",").map((c) => c.trim()).filter(Boolean);
          const firstRealCategory = catTokens[0] || null;
          const sizeChartType = getSizeChartType(p);
          const relatedProducts = catTokens.length > 0
            ? products.filter((rp) => rp.id !== p.id && catTokens.some((t) => pInCat(rp, t))).slice(0, 8)
            : [];
          return (
            <>
              <div className="fr-pdp2-page">
                <button type="button" className="fr-coll-back fr-pdp2-back" onClick={() => router.back()}>
                  ‹ Back
                </button>
                <div className="fr-pdp2-bread">
                  <a href={sp("/")} onClick={(e) => { e.preventDefault(); navigate(sp("/")); }}>Home</a>
                  {firstRealCategory && (<>
                    <span className="sep">/</span>
                    <a
                      href={sp(`/c/${collectionSlug(firstRealCategory)}`)}
                      onClick={(e) => { e.preventDefault(); navigate(sp(`/c/${collectionSlug(firstRealCategory)}`)); }}
                    >
                      {firstRealCategory}
                    </a>
                  </>)}
                  <span className="sep">/</span>
                  <span className="current">{p.name}</span>
                </div>
                <div className="fr-pdp-grid">
                  <div className="fr-pdp-gal">
                    <ProductGallery
                      imgs={allImgs}
                      activeIndex={activeImg}
                      onIndexChange={setActiveImg}
                      onOpenLightbox={() => { if (allImgs.length > 0) setLightbox({ imgs: allImgs, index: activeImg }); }}
                      onImgError={handleImgError}
                      alt={p.name}
                    />
                  </div>
                  <div className="fr-pdp-info">
                    <h1 className="fr-pdp-name">{p.name}</h1>
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
                    {sizeChartType && (
                      <button
                        type="button"
                        className="fr-pdp2-sizechart-btn"
                        onClick={() => { setSizeChartTab("chart"); setSizeChartOpen(true); }}
                      >
                        Size Chart
                      </button>
                    )}
                    {variantError && <div className="fr-pdp-err">Please select all options</div>}
                    <div className="fr-pdp-actions">
                      <button className="fr-pdp-add" onClick={() => addProductToCart(p)}>
                        Add to Bag — {fmt(effectivePrice(p, selectedVariants) * localQty)}
                      </button>
                      <button className="fr-pdp-buynow" onClick={() => buyNowFor(p)}>
                        Buy Now
                      </button>
                    </div>
                  </div>
                </div>
              </div>
              {relatedProducts.length > 0 && (
                <div className="fr-section">
                  <div className="fr-section-head">
                    <h2 className="fr-section-title">You Might Also Like</h2>
                  </div>
                  <div className="fr-pgrid">
                    {relatedProducts.map((rp) => <ProductCard key={rp.id} p={rp} />)}
                  </div>
                </div>
              )}
            </>
          );
        })()}

        {/* ALL COLLECTIONS — dedicated /collections index page
            (mode="collections-index"). Deliberately NOT the homepage's big
            4:5-tile fr-cat-grid (via renderCatTile) -- that's fine for a
            capped ~20-item teaser row, but far too heavy for the seller's
            full (sometimes 70+) collection list, which was the actual
            complaint ("way too many collections which makes the page
            full"). This is its own compact, dense, sortable row list
            instead; the homepage's own grid/renderCatTile is untouched. */}
        {isCollectionsIndexView && (
          <div className="fr-section">
            <div className="fr-section-head">
              <h2 className="fr-section-title">All Collections</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <select value={collectionSort} onChange={(e) => setCollectionSort(e.target.value)} className="fr-sort-select" aria-label="Sort collections">
                  <option value="az">A — Z</option>
                  <option value="za">Z — A</option>
                  <option value="most">Most Products</option>
                  <option value="fewest">Fewest Products</option>
                </select>
                <span className="fr-count">{sortedSellerCollections.length} {sortedSellerCollections.length === 1 ? "collection" : "collections"}</span>
              </div>
            </div>
            <div className="fr-collist">
              {sortedSellerCollections.map((cat) => {
                const img = catImage(cat);
                const count = catCount(cat);
                const target = sp(`/c/${collectionSlug(cat)}`);
                return (
                  <a
                    key={cat}
                    href={target}
                    className="fr-collist-row"
                    onClick={(e) => { e.preventDefault(); navigate(target); }}
                  >
                    <div className="fr-collist-thumb">
                      {img ? (
                        <>
                          <Image src={img} alt={cat} fill sizes="(max-width: 900px) 48px, 60px" style={{ objectFit: "cover" }} onError={handleImgError} />
                          <span className="fr-cat-mark" style={{ display: "none" }}>{cat}</span>
                        </>
                      ) : <span className="fr-cat-mark">{cat}</span>}
                    </div>
                    <div className="fr-collist-name">{cat}</div>
                    <div className="fr-collist-count">{count} {count === 1 ? "piece" : "pieces"}</div>
                    <span className="fr-collist-arrow" aria-hidden="true">›</span>
                  </a>
                );
              })}
            </div>
          </div>
        )}

        {/* POLICY / CONTACT PAGE — dedicated /policies/<policy> page
            (mode="policy"). Same StoreConfig fields (and fallback copy) the
            policy modal already reads, and the same contact info the
            Contact modal already renders, just inline on a real page. */}
        {isPolicyView && policyKey === "contact" && (
          <div className="fr-policy-page">
            <h1 className="fr-policy-title">Contact</h1>
            <ContactInfoList />
          </div>
        )}
        {isPolicyView && policyKey && policyKey !== "contact" && (() => {
          const POLICY_META: Record<"shipping" | "returns" | "privacy" | "terms", { heading: string; body: string }> = {
            shipping: { heading: "Shipping Policy", body: config.shipping_policy || "Contact us for details about our shipping policy." },
            returns: { heading: "Returns & Refunds", body: config.return_policy || "Contact us for details about our returns and refund policy." },
            privacy: { heading: "Privacy Policy", body: config.privacy_policy || "Contact us for details about our privacy policy." },
            terms: { heading: "Terms of Service", body: config.terms_of_service || "Contact us for details about our terms of service." },
          };
          const meta = POLICY_META[policyKey];
          return (
            <div className="fr-policy-page">
              <h1 className="fr-policy-title">{meta.heading}</h1>
              <div className="fr-policy-body">
                {meta.body.split("\n\n").map((para, i) => <p key={i}>{para}</p>)}
              </div>
            </div>
          );
        })()}

        {/* COLLECTIONS GRID — only on landing page */}
        {isHomeView && categoryList.length > 0 && (
          <EditSection id="categories">
            <div className="fr-section" style={{ paddingBottom: 0 }}>
              <div className="fr-section-head">
                <h2 className="fr-section-title">Shop by Collection</h2>
              </div>
              <div className="fr-cat-grid">
                {categoryList.slice(0, 20).map(renderCatTile)}
                {categoryList.length > 20 && (
                  <a
                    href={sp("/collections")}
                    className="fr-cat-card"
                    onClick={(e) => { e.preventDefault(); navigate(sp("/collections")); }}
                  >
                    <div className="fr-cat-img" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <span className="fr-cat-mark">View All Collections</span>
                    </div>
                    <div className="fr-cat-foot">
                      <div className="fr-cat-name">View More →</div>
                    </div>
                  </a>
                )}
              </div>
            </div>
          </EditSection>
        )}

        {/* PRODUCTS — collection page (or a store with no collections set
            up) gets a single flat, sortable grid. The homepage otherwise
            renders one titled row per collection instead of dumping every
            product into one undifferentiated wall. Not rendered at all for
            the dedicated product/collections-index/policy pages. */}
        {isCollectionView && (isCollectionView || !productGroups ? (
          <div id="fr-products" className="fr-section" style={{ paddingTop: isCollectionView ? 24 : undefined }}>
            <div className="fr-section-head">
              <h2 className="fr-section-title">{effectiveCategory === "All" ? (liveProductsHeading ?? config.products_heading ?? "New Arrivals") : effectiveCategory}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                {isHomeView && (
                  <a
                    href={sp("/c/all")}
                    onClick={(e) => { e.preventDefault(); navigate(sp("/c/all")); }}
                    style={{ fontFamily: "var(--body)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}
                  >
                    View All Products
                  </a>
                )}
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
                {filtered.map((p) => <ProductCard key={p.id} p={p} />)}
              </div>
            </EditSection>
          </div>
        ) : (
          <div id="fr-products">
            <EditSection id="products">
              {productGroups.map((group, gi) => {
                const label = group.name ?? (liveProductsHeading ?? config.products_heading ?? "New Arrivals");
                const isNamedCollection = group.name !== null;
                return (
                  <div key={group.name ?? "__other__"} className="fr-section" style={{ paddingTop: gi === 0 ? undefined : 0 }}>
                    <div className="fr-section-head">
                      <h2 className="fr-section-title">{label}</h2>
                      <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                        {isNamedCollection && (
                          <a
                            href={sp(`/c/${collectionSlug(group.name!)}`)}
                            onClick={(e) => { e.preventDefault(); navigate(sp(`/c/${collectionSlug(group.name!)}`)); }}
                            style={{ fontFamily: "var(--body)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}
                          >
                            View All
                          </a>
                        )}
                        <span className="fr-count">{group.products.length} {group.products.length === 1 ? "piece" : "pieces"}</span>
                      </div>
                    </div>
                    <div className="fr-pgrid">
                      {group.products.slice(0, 8).map((p) => <ProductCard key={p.id} p={p} />)}
                    </div>
                  </div>
                );
              })}
            </EditSection>
          </div>
        ))}

        {/* NEWSLETTER — only on landing page */}
        {isHomeView && showNewsletter && (
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
                  <li><a href={sp("/policies/shipping")} onClick={(e) => { e.preventDefault(); navigate(sp("/policies/shipping")); }}>Shipping</a></li>
                  <li><a href={sp("/policies/returns")} onClick={(e) => { e.preventDefault(); navigate(sp("/policies/returns")); }}>Returns & Refunds</a></li>
                  <li><a href={sp("/policies/privacy")} onClick={(e) => { e.preventDefault(); navigate(sp("/policies/privacy")); }}>Privacy Policy</a></li>
                  <li><a href={sp("/policies/terms")} onClick={(e) => { e.preventDefault(); navigate(sp("/policies/terms")); }}>Terms of Service</a></li>
                  <li><a href={sp("/policies/contact")} onClick={(e) => { e.preventDefault(); navigate(sp("/policies/contact")); }}>Contact</a></li>
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

        {/* MOBILE BOTTOM DOCK — Home / Search / Cart / Account only (no
            Wishlist icon: that's a separate, not-yet-built feature). Search
            opens the same real product-search overlay as the header search
            icon; Account opens the same Contact panel everything else in
            this template already uses in place of a not-yet-built
            account/login system. */}
        <nav className="fr-dock" aria-label="Mobile navigation">
          <button type="button" className={"fr-dock-item" + (isHomeView ? " active" : "")} onClick={() => navigate(sp())}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>
            Home
          </button>
          <button type="button" className="fr-dock-item" onClick={() => setShowSearch(true)} aria-label="Search products">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            Search
          </button>
          <button type="button" className="fr-dock-item" onClick={() => setCartOpen(true)} aria-label="Cart">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            {cartCount > 0 && <span className="fr-dock-count">{cartCount}</span>}
            Cart
          </button>
          <button type="button" className="fr-dock-item" onClick={() => navigate(sp("/policies/contact"))}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.5-7 8-7s8 3 8 7"/></svg>
            Account
          </button>
        </nav>
      </div>

      {/* Size chart modal -- opened from the dedicated product page's Size
          Chart button. Reuses the same fr-modal-overlay/fr-modal
          overlay/close pattern as the policy modal below; table/tab content
          uses new fr-sc- classes. */}
      {sizeChartOpen && initialActiveProduct && (() => {
        const sizeChartType = getSizeChartType(initialActiveProduct);
        if (!sizeChartType) return null;
        const chart = SIZE_CHARTS[sizeChartType];
        return (
          <div className="fr-modal-overlay" onClick={() => setSizeChartOpen(false)}>
            <div className="fr-modal" onClick={(e) => e.stopPropagation()}>
              <button className="fr-modal-close" onClick={() => setSizeChartOpen(false)}>✕</button>
              <h3>Size Guide</h3>
              <div className="fr-sc-tabs">
                <button
                  type="button"
                  className={"fr-sc-tab" + (sizeChartTab === "chart" ? " active" : "")}
                  onClick={() => setSizeChartTab("chart")}
                >
                  Size Chart
                </button>
                <button
                  type="button"
                  className={"fr-sc-tab" + (sizeChartTab === "measure" ? " active" : "")}
                  onClick={() => setSizeChartTab("measure")}
                >
                  How to Measure
                </button>
              </div>
              {sizeChartTab === "chart" ? (
                <div className="fr-sc-table-wrap">
                  <table className="fr-sc-table">
                    <thead>
                      <tr>{chart.headers.map((h) => <th key={h}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                      {chart.rows.map((row, i) => (
                        <tr key={i}>{row.map((cell, j) => <td key={j}>{cell}</td>)}</tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="fr-sc-tip">All measurements in CM. If you are between sizes, we recommend sizing up.</p>
                </div>
              ) : (
                <div className="fr-sc-measure">
                  <h4>How to Measure (cm)</h4>
                  <ol>
                    <li><strong>Bust</strong> — Measure the circumference of the fullest part of your bust.</li>
                    <li><strong>Waist</strong> — Measure the thinnest part of your waist.</li>
                    <li><strong>Hips</strong> — Measure the fullest part of your hips.</li>
                    <li><strong>Height</strong> — Measure your height.</li>
                  </ol>
                </div>
              )}
            </div>
          </div>
        );
      })()}

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

      {/* Search overlay -- real product search, opened from the header
          search icon and the mobile dock's Search item. Reuses the same
          `products` list + name/category matching the activeCategory grid
          filter above already relies on (see `searched`), just driven by
          free text instead of a fixed category, so results update live as
          the seller's customer types. */}
      {showSearch && (
        <div className="fr-search-overlay" onClick={() => { setShowSearch(false); setSearchQuery(""); }}>
          <div className="fr-search-panel" onClick={(e) => e.stopPropagation()}>
            <div className="fr-search-bar">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                autoFocus
                className="fr-search-input"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search products"
              />
              <button type="button" className="fr-search-close" onClick={() => { setShowSearch(false); setSearchQuery(""); }} aria-label="Close search">✕</button>
            </div>
            <div className="fr-search-results">
              {searched === null ? (
                <div className="fr-search-hint">Start typing to search {seller.store_name}'s products.</div>
              ) : searched.length === 0 ? (
                <div className="fr-search-empty">No products match "{searchQuery.trim()}".</div>
              ) : (
                searched.slice(0, 12).map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className="fr-search-item"
                    onClick={() => { setShowSearch(false); setSearchQuery(""); goToProduct(p); }}
                  >
                    {p.image_url ? (
                      <img src={p.image_url} alt="" loading="lazy" decoding="async" className="fr-search-item-img" onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    ) : (
                      <div className="fr-search-item-img" />
                    )}
                    <div className="fr-search-item-info">
                      <div className="fr-search-item-name">{p.name}</div>
                      {p.category && <div className="fr-search-item-cat">{p.category}</div>}
                    </div>
                    <div className="fr-search-item-price">{fmt(p.price)}</div>
                  </button>
                ))
              )}
            </div>
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

// PDP main image area, shared by the slide-over PDP and the dedicated
// full-page PDP -- replaces the old thumbnail-wall gallery (which pushed
// price/description far below the fold for products with 20-25+ images)
// with a single swipeable image, small prev/next overlay arrows, and a
// "n / total" counter badge. Swipe handling mirrors LightboxGallery's
// touch-swipe pattern above (same ~40px threshold), just against local
// touch state since this component doesn't own the active index itself.
function ProductGallery({ imgs, activeIndex, onIndexChange, onOpenLightbox, onImgError, alt }: {
  imgs: string[];
  activeIndex: number;
  onIndexChange: (i: number) => void;
  onOpenLightbox: () => void;
  onImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  alt: string;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  const [imgLoaded, setImgLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);
  const mainImg = imgs[activeIndex];

  // Reset the loading indicator whenever the active image changes -- the
  // <img>'s onLoad below flips it back to true once the new image is
  // actually painted. Also check img.complete right after: a server-rendered
  // (or already-browser-cached) image can finish loading before React even
  // attaches the onLoad listener, in which case that event never fires and
  // the spinner would otherwise get stuck forever -- .complete catches that.
  useEffect(() => {
    setImgLoaded(false);
    if (imgRef.current?.complete) setImgLoaded(true);
  }, [mainImg]);

  // Prefetch the images on either side of the active one so swiping/tapping
  // the arrows repeatedly doesn't feel "frozen" on a slow connection --
  // by the time the user reaches a neighbor, the browser has likely already
  // cached it. Uses the global window.Image constructor (this file already
  // imports `Image` from next/image for its <Image> components, so that
  // name is taken -- window.Image avoids the collision).
  useEffect(() => {
    const preload = (url: string | undefined) => {
      if (!url) return;
      const img = new window.Image();
      img.src = url;
    };
    preload(imgs[activeIndex - 1]);
    preload(imgs[activeIndex + 1]);
  }, [imgs, activeIndex]);

  const onTouchStart = (e: ReactTouchEvent) => setTouchStartX(e.touches[0].clientX);
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && activeIndex < imgs.length - 1) onIndexChange(activeIndex + 1);
    else if (dx > 0 && activeIndex > 0) onIndexChange(activeIndex - 1);
  };

  return (
    <div
      className="fr-pdp-main"
      role={imgs.length > 0 ? "button" : undefined}
      tabIndex={imgs.length > 0 ? 0 : undefined}
      onClick={() => { if (imgs.length > 0) onOpenLightbox(); }}
      onKeyDown={(e) => { if (imgs.length > 0 && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpenLightbox(); } }}
      aria-label={imgs.length > 0 ? "View images" : undefined}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      {mainImg ? (
        <>
          <Image
            ref={imgRef}
            src={mainImg}
            alt={alt}
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            style={{ objectFit: "contain" }}
            onError={onImgError}
            onLoad={() => setImgLoaded(true)}
          />
          <span className="fr-p-mark" style={{ display: "none" }}>{initials(alt)}</span>
          {!imgLoaded && (
            <div className="fr-pdp-loading" aria-hidden="true">
              <div className="fr-pdp-loading-spin" />
            </div>
          )}
        </>
      ) : (
        <span className="fr-p-mark">{initials(alt)}</span>
      )}
      {imgs.length > 1 && (
        <>
          {activeIndex > 0 && (
            <button className="fr-pdp-nav fr-pdp-nav-prev" type="button" onClick={(e) => { e.stopPropagation(); onIndexChange(activeIndex - 1); }} aria-label="Previous image">‹</button>
          )}
          {activeIndex < imgs.length - 1 && (
            <button className="fr-pdp-nav fr-pdp-nav-next" type="button" onClick={(e) => { e.stopPropagation(); onIndexChange(activeIndex + 1); }} aria-label="Next image">›</button>
          )}
          <span className="fr-pdp-imgcount">{activeIndex + 1} / {imgs.length}</span>
        </>
      )}
    </div>
  );
}

// One "MEN" or "WOMEN" glass panel for the Shop by Gender section --
// horizontally scrollable row of circular category tiles ported from the
// real "4REGN - Shop by Gender" Liquid section's JS: arrow buttons scroll by
// one tile-width, dots track scroll position, desktop drag-to-scroll (a
// >5px pointer move before treating it as a drag, so ordinary clicks on a
// tile still navigate), and the right-edge fade hides once scrolled to the
// end. Defined outside FourRegnStore (like LightboxGallery above) since it
// needs no closures over store state -- everything it needs is passed in.
function ShopByGenderPanel({ title, genderLabel, bucket, catImage, handleImgError, hrefFor, onNavigate }: {
  title: string;
  genderLabel: string;
  bucket: GenderBucket;
  catImage: (cat: string) => string | null;
  handleImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  hrefFor: (collectionName: string) => string;
  onNavigate: (collectionName: string) => void;
}) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [activeDot, setActiveDot] = useState(0);
  const [atEnd, setAtEnd] = useState(false);
  const dragRef = useRef({ moved: false });

  const updateScrollState = () => {
    const el = trackRef.current;
    if (!el) return;
    const children = Array.from(el.children) as HTMLElement[];
    if (children.length > 0) {
      let idx = 0;
      let min = Infinity;
      children.forEach((c, i) => {
        const d = Math.abs(c.offsetLeft - el.scrollLeft);
        if (d < min) { min = d; idx = i; }
      });
      setActiveDot(idx);
    }
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  };

  useEffect(() => { updateScrollState(); }, [bucket.items.length]);

  const scrollByOne = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const first = el.children[0] as HTMLElement | undefined;
    const gap = parseFloat(getComputedStyle(el).columnGap || "14") || 14;
    const step = first ? first.getBoundingClientRect().width + gap : el.clientWidth * 0.8;
    el.scrollBy({ left: dir * step, behavior: "smooth" });
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = trackRef.current;
    if (!el) return;
    const startX = e.clientX;
    const startScroll = el.scrollLeft;
    dragRef.current.moved = false;
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      if (Math.abs(dx) > 5) dragRef.current.moved = true;
      el.scrollLeft = startScroll - dx;
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div className="fr-sbg-panel">
      <div className="fr-sbg-panel-inner">
        <h3 className="fr-sbg-panel-title">{title}</h3>
        {bucket.shopAll && (
          <a
            href={hrefFor(bucket.shopAll)}
            className="fr-sbg-shopall"
            onClick={(e) => { e.preventDefault(); onNavigate(bucket.shopAll!); }}
          >
            Shop All {genderLabel} →
          </a>
        )}
        <div className={"fr-sbg-track-wrap" + (atEnd ? " at-end" : "")}>
          <div
            className="fr-sbg-track"
            ref={trackRef}
            onScroll={updateScrollState}
            onMouseDown={onMouseDown}
          >
            {bucket.items.map((cat) => {
              const img = catImage(cat.name);
              return (
                <a
                  key={cat.name}
                  href={hrefFor(cat.name)}
                  className="fr-sbg-cat-item"
                  onClick={(e) => {
                    e.preventDefault();
                    if (dragRef.current.moved) { dragRef.current.moved = false; return; }
                    onNavigate(cat.name);
                  }}
                >
                  <div className="fr-sbg-circle-frame">
                    <div className="fr-sbg-circle-img">
                      {img ? (
                        <>
                          <Image src={img} alt={cat.label} fill sizes="(max-width: 900px) 20vw, 10vw" style={{ objectFit: "cover" }} onError={handleImgError} />
                          <span className="fr-cat-mark" style={{ display: "none" }}>{cat.label}</span>
                        </>
                      ) : <span className="fr-cat-mark">{cat.label}</span>}
                    </div>
                  </div>
                  <span className="fr-sbg-cat-label">{cat.label}</span>
                </a>
              );
            })}
          </div>
        </div>
        <div className="fr-sbg-arrow-row">
          <button type="button" className="fr-sbg-arrow" aria-label={`Previous ${genderLabel.toLowerCase()} categories`} onClick={() => scrollByOne(-1)}>←</button>
          <div className="fr-sbg-dots">
            {bucket.items.map((_, i) => (
              <span key={i} className={"fr-sbg-dot" + (i === activeDot ? " active" : "")} />
            ))}
          </div>
          <button type="button" className="fr-sbg-arrow" aria-label={`Next ${genderLabel.toLowerCase()} categories`} onClick={() => scrollByOne(1)}>→</button>
        </div>
      </div>
    </div>
  );
}
