"use client";

import { useState, useEffect, useLayoutEffect, useRef, useTransition, Fragment, type TouchEvent as ReactTouchEvent } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { supabase } from "../../../lib/supabase";
import { useParams, useRouter, usePathname } from "next/navigation";
import { effectiveStoreConfig } from "../../../lib/template-config";
import { useLiveVisitorPing } from "../../../lib/use-live-visitor-ping";
import { computeAutomaticBxgyDiscount, type AutomaticBxgyDiscount } from "../../../lib/automatic-discounts";

// Only ever rendered after a click/keyboard interaction (see `lightbox`
// state below) -- never needed for first paint, so it's split into its own
// chunk and loaded on demand instead of shipping in every storefront's
// initial JS. ssr:false is safe here: `lightbox` starts null on the server
// too (nothing seeds it from an initial/SSR prop), so this never has SSR
// markup to produce anyway.
const LightboxGallery = dynamic(() => import("./FourRegnLightbox"), { ssr: false });

// Same reasoning as LightboxGallery above -- the popup only ever matters
// once its own async data fetch resolves (2s+ after mount even in the best
// case, see FourRegnSalesPopup.tsx's START_DELAY_MS), so there's no SSR
// markup worth producing and no reason to ship its ~600 names/towns in the
// initial bundle for every visitor, including ones on modes where it never
// renders at all (see the isHomeView/isCollectionView gate below).
const FourRegnSalesPopup = dynamic(() => import("./FourRegnSalesPopup"), { ssr: false });

const pInCat = (p: { category: string }, cat: string) =>
  (p.category || "").split(",").map((c) => c.trim()).includes(cat);

// A product tagged "import"/"imports" (singular or plural, case-insensitive
// -- exactly what the seller confirmed Shopify uses) forces the 7-14 working
// day "premium" shipping method and hides every faster option, on both the
// cart page (a delivery-note banner) and checkout (the shipping-method
// list itself, see checkout_config.shipping_options' own is_premium flag).
const IMPORT_TAG_RE = /^imports?$/i;
const hasImportTag = (tags?: string[] | null) => (tags || []).some((t) => IMPORT_TAG_RE.test((t || "").trim()));

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
  // Manually-set hero pill (e.g. "7 YEAR ANNIVERSARY SALE") -- purely a
  // marketing label the seller types in themselves, same as
  // hero_sale_headline/announcement above; NOT imported from Shopify (unlike
  // the per-product promo badges, which come from real discount data -- see
  // product_promo_badges/getProductPromoBadge).
  show_hero_pill?: boolean;
  hero_pill_label?: string;
  // Small fine-print line under the hero CTA, e.g. "CHOOSE ANY 3 ELIGIBLE
  // TEES. LOWEST-PRICED TEE IS FREE" -- promo terms, not a headline.
  hero_disclaimer?: string;
  // BOGO-style offer callout above the headline, e.g. "Buy any 2 oversized
  // graphic tees\nGet a 3rd tee free" -- rendered by renderOfferLine() below
  // with any digit-leading word (2, 3rd) and a trailing "free" auto-
  // highlighted/pulsed in the accent color, matching the seller's own
  // reference design. hero_offer_note is the smaller fine-print line
  // directly under it, e.g. "Discount applied automatically at checkout."
  hero_offer_headline?: string;
  hero_offer_note?: string;
  // ABOUT section (landing page, above the newsletter) -- "Built for the
  // Culture" style brand story block, matching the real Shopify site.
  show_about?: boolean;
  about_eyebrow?: string;
  about_heading?: string;
  about_body?: string;
  about_stat1_value?: string;
  about_stat1_label?: string;
  about_stat2_value?: string;
  about_stat2_label?: string;
  about_cta_label?: string;
  // Per-collection cover image override, keyed by the collection's exact
  // name (same string as seller.collections entries / product.category
  // tokens). Value is a real URL -- either copied from one of that
  // collection's own products' image_url, or a fresh upload -- either way
  // just a URL by the time it lands here, no separate "source" needed.
  // Already editable in the dashboard (Dashboard -> Collections -> Set
  // cover image) and saved here, but catImage() below never actually read
  // it -- the upload worked, the storefront just silently ignored it.
  collection_images?: Record<string, string>;
  // Per-collection description, shown under the heading on that
  // collection's page. Keyed the same way as collection_images.
  collection_descriptions?: Record<string, string>;
  // Collections listed here are excluded from the nav menu, the "Shop by
  // Collection" grid, the /collections index, and Shop by Gender tiles --
  // but NOT from search, the homepage product grid, or any other
  // (non-hidden) collection the same products are also tagged with. See
  // hiddenCollectionsSet below.
  hidden_collections?: string[];
  // Winter Essentials coverflow (see WinterCoverflow). Pixels-per-frame
  // scroll speed, same range as the Liquid version's own setting
  // (0.2-2, default 0.6).
  winter_essentials_speed?: number;
  // Ordered slide list -- each entry is EITHER a product id (its image_url
  // is looked up live against this seller's current products, so it stays
  // correct if that product's photo changes later) OR a direct image URL
  // from a standalone upload (no matching product, e.g. a lifestyle/
  // banner-style photo instead of a product shot). Distinguished by shape:
  // a product id is a bare UUID, an upload is a URL (starts with "http"
  // or "/"). Unset/empty falls back to every "WINTER ESSENTIALS"-tagged
  // product in catalog order (see the isHomeView render call).
  winter_essentials_slides?: string[];
  // Winter Sale Marquee (see WinterSaleMarquee) -- same shape/resolution
  // rule as winter_essentials_slides above (product id OR direct URL),
  // just two independent lists, one per row. Unset/empty falls back to
  // every product in "BACK & FRONT PRINTED HOODIES" / "OVERSIZED PREMIUM
  // TEES" respectively (exact category match -- see the isHomeView render
  // call).
  winter_marquee_hoodie_slides?: string[];
  winter_marquee_tee_slides?: string[];
  standard_graphic_hoodies_slides?: string[];
  standard_graphic_hoodies_interval?: number;
}

// Auto-highlights a BOGO-style offer line the way the reference design
// does: any digit-leading token (e.g. "2", "3rd") in the accent color, and
// a trailing "free" (optionally with trailing punctuation) in the accent
// color with a pulsing heartbeat animation. Plain string in, mixed
// string/element array out -- safe to render directly inside a <p>/<span>.
function renderOfferLine(line: string, keyPrefix: string) {
  return line.split(/(\s+)/).map((word, i) => {
    if (/^\s+$/.test(word) || word === "") return word;
    if (/^free[.,!]?$/i.test(word)) {
      return <strong key={`${keyPrefix}-${i}`} className="fr-hero-offer-pulse">{word}</strong>;
    }
    if (/^\d/.test(word)) {
      return <span key={`${keyPrefix}-${i}`} className="fr-hero-offer-accent">{word}</span>;
    }
    return word;
  });
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
    yoco_enabled?: boolean;
    stitch_enabled?: boolean;
    whatsapp_checkout_enabled?: boolean;
  };
}
interface Variant { name: string; options: string[]; images?: { [option: string]: string[] }; priceDelta?: { [option: string]: number }; }
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
type WishlistItem = Pick<Product, "id" | "name" | "price" | "old_price" | "image_url" | "handle" | "in_stock" | "category">;
interface PromoDiscount {
  code: string; type: string; value: number; applies_to: string;
  expires_at: string; product_ids: string[]; collection_names: string[];
  timeLeft: string;
}
// Display-only badge (e.g. real Shopify "BUY 2 GET 1 FREE" imports, or a
// manually-created one) -- see product_promo_badges table. Distinct from
// PromoDiscount/discount_codes above: this never carries a % or $ value and
// never applies at checkout, it's purely a label shown on the product
// card/PDP. label is shown verbatim, unlike PromoDiscount's computed
// "-{value}%"/"Sale" text.
interface PromoBadge {
  label: string; scope: "product" | "collection";
  product_id: string | null; collection_name: string | null;
}

/* ─── HELPERS ────────────────────────────────────────────── */
const fmt = (n: number) => "R " + n.toLocaleString("en-ZA");
const variantDelta = (product: Product, selected: { [key: string]: string }): number =>
  (Array.isArray(product.variants) ? product.variants : []).reduce((sum, v) => {
    const chosen = selected[v.name];
    const d = chosen ? v.priceDelta?.[chosen] : undefined;
    return sum + (typeof d === "number" ? d : 0);
  }, 0);
const effectivePrice = (product: Product, selected: { [key: string]: string }): number =>
  Math.max(0, product.price + variantDelta(product, selected));
// The full photo SET for whichever option value is currently selected
// (e.g. every photo tagged under the White option of a "Colour" variant
// group -- a single value can legitimately have several: front, back,
// close-up) -- populated on import by scripts/migrate-4regn.ts's
// computeVariantImageMaps, only for option dimensions where Shopify's
// export actually had real per-value photos. Returns null when nothing's
// selected yet, or the selected product/variant has no per-value images
// (falls back to the product's plain image_url/images gallery everywhere
// this is used).
//
// preferredDim (the variant dimension the customer most recently
// clicked, see activeImageDim's own comment) is checked FIRST when
// present -- a product can have more than one dimension with real
// per-value photo sets (grouping by Size across every colour can also
// look like genuine differentiation), and blindly taking whichever
// dimension happens to come first in the array showed the wrong colour's
// photos whenever a different dimension's map won that race. Falls back
// to plain array order when preferredDim isn't set or doesn't resolve
// (e.g. a frozen cart item, which has no "currently active" dimension).
const resolveVariantImages = (product: Product, selected: { [key: string]: string }, preferredDim?: string | null): string[] | null => {
  const variants = Array.isArray(product.variants) ? product.variants : [];
  if (preferredDim) {
    const v = variants.find((v) => v.name === preferredDim);
    const chosen = v && selected[v.name];
    if (v?.images && chosen && v.images[chosen]?.length) return v.images[chosen];
  }
  for (const v of variants) {
    if (!v.images) continue;
    const chosen = selected[v.name];
    if (chosen && v.images[chosen]?.length) return v.images[chosen];
  }
  return null;
};
// Single-image convenience for spots that can only ever show one photo
// (a cart line item, a checkout summary row) -- the first photo of the
// resolved set, same as resolveVariantImages but never a list.
const resolveVariantImage = (product: Product, selected: { [key: string]: string }): string | null =>
  resolveVariantImages(product, selected)?.[0] || null;
const pad = (n: number) => String(n).padStart(2, "0");
const initials = (s: string) => (s || "").trim().slice(0, 1).toUpperCase();

// URL-safe slug for collection names, matching the same convention every
// other template uses for /store/<slug>/c/<collection-slug> links (4regn's
// own /collections/<collection-slug> links use the identical slug format,
// just a different path prefix -- see the route comment in
// app/store/[slug]/collections/[collection]/page.tsx for why).
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
  // The single most common real tag across this catalog for exactly this
  // chart (confirmed via scripts/check-4regn-size-chart-coverage.ts's
  // output: e.g. "Frank Ocean Graphic Tee" carries this tag but its NAME
  // doesn't contain any OVERSIZED_TEE_NAME_MATCHES phrase) was missing
  // entirely -- this key normalizes the same way the matching loop below
  // normalizes every tag (lowercase, whitespace stripped; a hyphen is
  // untouched by that, hence the literal "oversized-tee" key here rather
  // than "oversizedtee").
  "oversized-tee": "oversized_tee",
};

// Selection order matches the theme exactly: name-keyword match first (any
// hit wins, always oversized_tee), then the first matching tag (in the
// product's own tag order) wins. No match -> no chart at all, no fallback.
// Category (this store's collection membership -- comma-joined, same
// string pInCat's callers elsewhere in this file already match against)
// fallback for pants and jackets specifically, once no name/tag match is
// found. Confirmed necessary against the real site: a screenshot of
// 4regn.com's "Men's Classic Black A-Line Dress Pants" shows the exact
// ukmensizelabel table (UK 28/30/31/32/34/36, same waist/hips/height
// numbers already in SIZE_CHARTS), but that product -- like the vast
// majority of pants/jackets in this catalog -- isn't tagged with any
// TAG_SIZE_CHART_MAP key, even though a real, verified-accurate chart
// exists for it. Jackets get the same fallback by the same reasoning (an
// identical tag gap was visible in the coverage diagnostic's output for
// "Men/Women Jackets" category products), though that one's via analogy,
// not its own separate live screenshot -- flag it if a jacket turns out
// to need the other chart.
function getCategorySizeChartType(category: string | undefined): SizeChartType | null {
  const tokens = (category || "").split(",").map((c) => c.trim().toLowerCase());
  if (tokens.includes("women bottoms")) return "womenxsmalltoxlpants";
  if (tokens.includes("men bottoms")) return "ukmensizelabel";
  if (tokens.includes("women jackets")) return "womenjackets";
  if (tokens.includes("men jackets")) return "menjackets";
  return null;
}

export function getSizeChartType(product: { name: string; tags?: string[]; category?: string }): SizeChartType | null {
  const name = (product.name || "").toLowerCase();
  if (OVERSIZED_TEE_NAME_MATCHES.some((m) => name.includes(m))) return "oversized_tee";
  for (const tag of product.tags || []) {
    const key = (tag || "").toLowerCase().replace(/\s+/g, "");
    if (TAG_SIZE_CHART_MAP[key]) return TAG_SIZE_CHART_MAP[key];
  }
  return getCategorySizeChartType(product.category);
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
  initialPromoBadges?: PromoBadge[];
  initialProductId?: string;
  mode?: "home" | "collection" | "product" | "collections-index" | "policy" | "search";
  collectionName?: string;
  isSubdomain?: boolean;
  // mode="search" only -- the ?q= this page was server-rendered for
  // (already used to filter initialProducts server-side, see
  // app/store/[slug]/search/page.tsx). Kept separate from the header/mobile
  // overlay's own `searchQuery` state below: that one drives the live-typing
  // popup, this one is just for the page heading/on-page search box's
  // starting value, and the two only ever meet at the moment either one
  // navigates here.
  initialSearchQuery?: string;
  // Server-resolved product for the dedicated /p/<id> page (mode="product").
  // Unlike initialProductId (which the slide-over preview looks up from
  // `products` client-side), this is passed down already-resolved so the
  // dedicated page never depends on `products` having loaded.
  initialActiveProduct?: Product | null;
  // Which policy page to render for mode="policy".
  policyKey?: "shipping" | "returns" | "privacy" | "terms" | "contact";
  // Collection-page pagination (mode="collection" only) -- initialProducts
  // is already just the current page's slice (server-sorted+sliced, see
  // app/store/[slug]/collections/[collection]/page.tsx), not the whole collection.
  currentPage?: number;
  totalPages?: number;
  currentSort?: string;
  // Count of every product in the collection across all pages -- distinct
  // from initialProducts.length, which is just the current page's slice.
  totalProductCount?: number;
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

// 4regn's real Shopify nav (Catalog mega-menu with grouped sub-categories,
// Contact, Track Your Order), ported from the seller's own Shopify admin
// menu list -- replaces the flat, capped category list every other part
// of this file still uses (menuCategories). Static/hardcoded, not
// seller-editable: this app's collections are a flat name array with no
// parent/child grouping, so there's no data model this could read from
// yet. A few literal duplicate entries in the source list (JACKETS,
// SHOES, CAPS, Hoodies appearing twice, etc.) were deduped here rather
// than reproduced as visibly broken duplicate links. Groups with no
// `items` are themselves a direct collection link (their label doubles
// as the collection name); groups with `items` render as a sub-list.
// "Shop All Women"/"Shop All Men" point at this store's existing
// "ALL WOMEN"/"ALL MEN" umbrella collections (see partitionGenderCollections
// above) rather than a literal "Shop All Women" category, which wouldn't
// exist. Every other WOMEN/MEN sub-item is transformed to "Women <item>"/
// "Men <item>" when building its link -- matches the "Men <X>"/"Women <X>"
// naming convention partitionGenderCollections' own comment documents for
// this store's real per-gender collections; linking bare "Tops" instead of
// "Women Tops" would 404/empty for most of these.
const CATALOG_MENU: { label: string; items?: string[] }[] = [
  { label: "WOMEN", items: ["Shop All Women", "Tops", "Bottoms", "Jackets", "Accessories", "Bags", "Caps", "Shoes", "2pc Set", "Sunglasses", "Sweaters", "Hoodies", "Dresses"] },
  { label: "MEN", items: ["Shop All Men", "Tops", "Bottoms", "Jackets", "Hoodies", "2pc Sets", "Caps", "Accessories", "Shoes", "Knitwear", "Shirts", "Sunglasses", "Shorts", "Bags", "Sweaters"] },
  { label: "TEES", items: ["4REGN DEXIGN OVERSIZED TEES", "GRAPHIC TEES NEW EDITION", "STANDARD GRAPHIC TEES", "Travis Scott Cactus Jack Tees Collection", "COTTON EATERS GRAPHIC TEE Riky Rick", "PLAIN OVERSIZED DROP SHOULDER TEES", "CUSTOM PRINTED TEES"] },
  { label: "PANTS", items: ["4REGN CARGO PANTS", "CACTUS JACK SWEATPANTS", "PLAIN SWEATPANTS", "4REGN SKITZO PRINTED SWEATPANTS", "SHORTS"] },
  { label: "HEADWEAR", items: ["Beanies", "PRINTED TRUCKER CAPS", "PLAIN TRUCKER CAPS", "CUSTOM TRUCKER CAPS"] },
  { label: "JACKETS" },
  { label: "SHOES" },
  { label: "CAPS" },
  { label: "PLAIN CLOTHING", items: ["PLAIN HOODIES", "Plain Sweatpants", "PLAIN TRUCKER CAPS", "BEANIES", "PLAIN OVERSIZED DROP SHOULDER TEES"] },
  { label: "SPRING ESSENTIALS" },
  { label: "DRESSES" },
  { label: "SUNGLASSES" },
  { label: "GRAPHIC HOODIES" },
  { label: "SWEATERS" },
  { label: "KNITWEAR" },
  { label: "4REGN X LAVISH COLLECTION" },
  { label: "2 PIECE SETS" },
  { label: "BUTTONED SHIRTS" },
  { label: "BAGS" },
  { label: "ACCESSORIES" },
  { label: "CUSTOM", items: ["CUSTOM PRINTED TEES", "CUSTOM PRINTED HOODIES", "CUSTOM PRINTED SWEATERS", "CUSTOM PRINTED CAPS", "CUSTOM PRINTED SIDE BAGS"] },
  { label: "MFUDUMALO COMBOS COLLECTION" },
];

function NavigationProgress({ active }: { active: boolean }) {
  const [phase, setPhase] = useState<"idle" | "loading" | "finishing">("idle");
  const wasActive = useRef(false);

  useEffect(() => {
    if (active) {
      wasActive.current = true;
      setPhase("loading");
      return;
    }
    if (!wasActive.current) return;
    wasActive.current = false;
    setPhase("finishing");
    const hide = window.setTimeout(() => setPhase("idle"), 220);
    return () => window.clearTimeout(hide);
  }, [active]);

  return <div className={`fr-progress is-${phase}`} role="progressbar" aria-label="Loading next page" />;
}

export default function FourRegnStore({ initialSeller, initialProducts, initialDiscountCodes, initialPromoBadges, initialProductId, mode = "home", collectionName, isSubdomain, initialActiveProduct, policyKey, currentPage = 1, totalPages = 1, currentSort = "default", totalProductCount, initialSearchQuery }: StorePageProps = {}) {
  const isCollectionView = mode === "collection";
  const isHomeView = mode === "home";
  const isProductView = mode === "product";
  const isSearchView = mode === "search";
  const isCollectionsIndexView = mode === "collections-index";
  const isPolicyView = mode === "policy";
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isNavigating, startNavigation] = useTransition();
  // Keep the current page completely still while the destination is being
  // prepared. `scroll: false` also prevents Next's own navigation scroll
  // from firing early. The useLayoutEffect below resets the position only
  // after the destination content has committed, before its first paint.
  const navigate = (path: string) => {
    startNavigation(() => router.push(path, { scroll: false }));
  };
  const navigateToProducts = (path: string) => {
    startNavigation(() => router.push(path, { scroll: false }));
  };
  // Warms a destination route's RSC payload ahead of an actual click --
  // wired to onMouseEnter (desktop hover) and onTouchStart (fires before
  // touchend/click on mobile) on the most-clicked in-app links below
  // (product cards, category tiles, nav). None of these <a>/<button>
  // elements are Next's own <Link> component (which auto-prefetches),
  // they're plain elements + navigate()'s router.push(), so without this
  // there was never any head start -- every click began the fetch from
  // zero. With it, by the time navigate() actually runs, Next often
  // already has the data cached and the transition resolves near-
  // instantly instead of sitting in the pending/loading-fallback window.
  // Fire-and-forget: a prefetch failure just means no head start, not a
  // broken link (navigate() doesn't depend on this having succeeded).
  const prefetchPath = (path: string) => { try { router.prefetch(path); } catch {} };
  // Some homepage feature sections render ordinary anchors because their
  // reusable components only receive an href. Capture same-origin clicks at
  // the storefront root so those links use the same client navigation,
  // progress indicator and prefetched route cache as the explicit nav links.
  // External links, downloads, new-tab/modifier clicks and hash jumps retain
  // normal browser behaviour.
  const handleInternalLinkClick = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = (event.target as HTMLElement).closest("a[href]") as HTMLAnchorElement | null;
    if (!anchor || anchor.target || anchor.hasAttribute("download")) return;
    let destination: URL;
    try { destination = new URL(anchor.href, window.location.href); } catch { return; }
    if (destination.origin !== window.location.origin || destination.hash && destination.pathname === window.location.pathname && destination.search === window.location.search) return;
    event.preventDefault();
    navigate(destination.pathname + destination.search + destination.hash);
  };
  const slug = params.slug as string;
  // Read via window.location instead of useSearchParams() -- that hook
  // forces this whole (force-static) route to bail out to full
  // client-side rendering with no Suspense boundary wrapping just this
  // read, which was shipping real visitors and crawlers an empty shell +
  // spinner instead of server-rendered HTML. editMode only matters inside
  // the dashboard's live-preview iframe, never for a real shopper, so a
  // client-only read after mount is functionally identical there.
  const [isEditMode, setIsEditMode] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("editMode") === "true") setIsEditMode(true);
  }, []);
  const sp = (suffix: string = "") => (isSubdomain ? suffix || "/" : `/store/${slug}${suffix}`);
  // Collection-page pagination links -- page 1 has no ?page so the
  // canonical/default URL stays clean; sort is only appended when it isn't
  // the default, same reasoning. Reads the collection segment straight off
  // the route's own params rather than re-deriving it from collectionName
  // (which can be a display name like "All Products", not the URL slug).
  const collectionParam = params.collection as string | undefined;
  const buildCollectionHref = (page: number, sort: string) => {
    const qs = new URLSearchParams();
    if (page > 1) qs.set("page", String(page));
    if (sort && sort !== "default") qs.set("sort", sort);
    const q = qs.toString();
    return sp(`/collections/${collectionParam}`) + (q ? `?${q}` : "");
  };
  // Same shape as buildCollectionHref, for the dedicated /search results
  // page (mode="search") -- q always included so a copy-pasted URL keeps
  // working, page/sort only appended when non-default, matching the exact
  // same "clean canonical URL" convention.
  const buildSearchHref = (page: number, sort: string) => {
    const qs = new URLSearchParams();
    qs.set("q", initialSearchQuery || "");
    if (page > 1) qs.set("page", String(page));
    if (sort && sort !== "default") qs.set("sort", sort);
    return sp(`/search`) + `?${qs.toString()}`;
  };

  /* ─── DATA ─── */
  const [seller, setSeller] = useState<Seller | null>(initialSeller ?? null);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading] = useState(!initialSeller);
  const [notFound, setNotFound] = useState(false);
  // useState(initialProducts) above only seeds `products` on the very
  // first mount -- App Router does NOT remount this component just because
  // search params changed (same route, same [collection] segment value),
  // so navigating from page 1 to ?page=2 of the same collection re-renders
  // with a new initialProducts prop but never actually applied it, and the
  // grid kept showing page 1's products no matter which page was clicked.
  // Re-sync whenever the server hands down a genuinely new array (a real
  // navigation/sort/page change), without touching any client-side-only
  // mutations of `products` elsewhere (e.g. the initialSeller-missing
  // fallback fetch below, which calls setProducts itself).
  useEffect(() => {
    if (initialProducts) setProducts(initialProducts);
  }, [initialProducts]);

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
  const [liveShowHeroPill, setLiveShowHeroPill] = useState<boolean | null>(null);
  const [liveHeroPillLabel, setLiveHeroPillLabel] = useState<string | null>(null);
  const [liveHeroDisclaimer, setLiveHeroDisclaimer] = useState<string | null>(null);
  const [liveHeroOfferHeadline, setLiveHeroOfferHeadline] = useState<string | null>(null);
  const [liveHeroOfferNote, setLiveHeroOfferNote] = useState<string | null>(null);
  const [liveShowAbout, setLiveShowAbout] = useState<boolean | null>(null);
  const [liveAboutEyebrow, setLiveAboutEyebrow] = useState<string | null>(null);
  const [liveAboutHeading, setLiveAboutHeading] = useState<string | null>(null);
  const [liveAboutBody, setLiveAboutBody] = useState<string | null>(null);
  const [liveAboutStat1Value, setLiveAboutStat1Value] = useState<string | null>(null);
  const [liveAboutStat1Label, setLiveAboutStat1Label] = useState<string | null>(null);
  const [liveAboutStat2Value, setLiveAboutStat2Value] = useState<string | null>(null);
  const [liveAboutStat2Label, setLiveAboutStat2Label] = useState<string | null>(null);
  const [liveAboutCtaLabel, setLiveAboutCtaLabel] = useState<string | null>(null);
  const [policyModal, setPolicyModal] = useState<{ title: string; content: string } | null>(null);
  const [hoveredSection, setHoveredSection] = useState<string | null>(null);

  /* ─── PROMO ─── */
  const [promoCountdown, setPromoCountdown] = useState<PromoDiscount | null>(() => buildInitialPromos(initialDiscountCodes).countdown);
  const [promoDiscounts, setPromoDiscounts] = useState<PromoDiscount[]>(() => buildInitialPromos(initialDiscountCodes).discounts);
  const [promoBadges, setPromoBadges] = useState<PromoBadge[]>(initialPromoBadges || []);

  /* ─── UI ─── */
  const [activeCategory, setActiveCategory] = useState("All");
  const [productSort, setProductSort] = useState(currentSort);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState(initialSearchQuery || "");
  // Home view's own `products` (see FOUR_REGN_HOME_PRODUCT_COLUMNS in
  // ../page.tsx) is now id/category/image_url only -- name/price/handle
  // (needed for the search overlay's filter/display/routing) are fetched
  // lazily here, client-side, the first time a visitor actually opens
  // search, instead of shipping the seller's entire catalog (real-world:
  // ~1600 rows for 4regn) in every homepage's initial HTML just for a
  // rarely-opened search box. null = not fetched yet. Collection views
  // don't need this -- their own route fetch already includes name/price/
  // handle on `products` (see searchSource below). Product views DO need
  // this now too: it doubles as the source for "You Might Also Like" (see
  // relatedProducts below) since that candidate list used to come from a
  // server-side per-request ilike-OR scan across the whole catalog
  // (products/[handle]/page.tsx and p/[productId]/page.tsx both had it) --
  // on a product tagged into several of this store's broader collections
  // that unindexed scan could run long enough to blow the serverless
  // function's execution budget and 500 the entire page, and a 5s
  // AbortController guard around it still left the fetch itself as the
  // single most expensive thing this route did on every view. Reusing the
  // same lazy client fetch search already needed removes that query from
  // the server render path entirely -- worst case here is a "You Might
  // Also Like" row that pops in a beat after the rest of the page, not a
  // page that fails to load at all.
  const [searchProducts, setSearchProducts] = useState<Product[] | null>(null);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [lightbox, setLightbox] = useState<{ imgs: string[]; index: number } | null>(null);
  const [selectedVariants, setSelectedVariants] = useState<{ [k: string]: string }>({});
  // Which variant dimension (e.g. "Colour" vs "Size") the customer most
  // recently clicked -- a product can have MORE THAN ONE dimension with
  // real per-value photo sets (e.g. grouping by Size across every colour
  // can also look like genuine differentiation), and resolveVariantImages
  // used to just take whichever dimension came first in the array
  // regardless of what was actually just clicked. Reported directly: an
  // Apricot selection showing a Black photo. Reset alongside
  // selectedVariants whenever a different product opens.
  const [activeImageDim, setActiveImageDim] = useState<string | null>(null);
  const [localQty, setLocalQty] = useState(1);
  const [variantError, setVariantError] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [sizeChartTab, setSizeChartTab] = useState<"chart" | "measure">("chart");

  /* ─── CART ─── */
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartHydrated, setCartHydrated] = useState(false);
  const [automaticBxgyDiscounts, setAutomaticBxgyDiscounts] = useState<AutomaticBxgyDiscount[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [wishlist, setWishlist] = useState<WishlistItem[]>([]);
  const [wishlistOpen, setWishlistOpen] = useState(false);
  const wishlistStorageKey = seller?.subdomain ? `catalogstore-wishlist-v1:${seller.subdomain.toLowerCase()}` : null;

  useEffect(() => {
    if (!wishlistStorageKey) return;
    try {
      const parsed = JSON.parse(localStorage.getItem(wishlistStorageKey) || "[]");
      if (Array.isArray(parsed)) setWishlist(parsed.filter((p: any) => p && typeof p.id === "string" && typeof p.name === "string"));
    } catch {}
  }, [wishlistStorageKey]);
  useEffect(() => {
    if (!wishlistStorageKey) return;
    try { localStorage.setItem(wishlistStorageKey, JSON.stringify(wishlist)); } catch {}
  }, [wishlist, wishlistStorageKey]);

  const toggleWishlist = (product: Product) => {
    const exists = wishlist.some((p) => p.id === product.id);
    setWishlist((prev) => exists ? prev.filter((p) => p.id !== product.id) : [...prev, { id: product.id, name: product.name, price: product.price, old_price: product.old_price, image_url: product.image_url, handle: product.handle, in_stock: product.in_stock, category: product.category }]);
    fetch("/api/customer-account/wishlist", { method: exists ? "DELETE" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: seller?.subdomain, productId: product.id }) }).catch(() => {});
  };

  // Each route renders a fresh FourRegnStore instance, so component state
  // alone cannot carry a cart from a collection/product page back to Home.
  // Persist a compact, seller-scoped copy and restore it before enabling
  // writes; the hydration guard prevents the initial empty state from
  // overwriting the saved cart during the first client render.
  const cartStorageKey = seller?.subdomain ? `catalogstore-cart-v1:${seller.subdomain.toLowerCase()}` : null;
  useEffect(() => {
    if (!cartStorageKey) return;
    setCartHydrated(false);
    try {
      const saved = localStorage.getItem(cartStorageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          const restored = parsed.filter((item: any) =>
            item && item.product && typeof item.product.id === "string" &&
            typeof item.product.name === "string" && Number.isFinite(Number(item.product.price)) &&
            Number.isFinite(Number(item.qty)) && Number(item.qty) > 0
          ).map((item: any) => ({
            product: { ...item.product, price: Number(item.product.price) },
            qty: Math.max(1, Math.floor(Number(item.qty))),
            selectedVariants: item.selectedVariants && typeof item.selectedVariants === "object" ? item.selectedVariants : {},
          }));
          setCart(restored);
        }
      }
    } catch {
      // A corrupt/blocked storage entry must never stop the storefront.
    }
    setCartHydrated(true);
  }, [cartStorageKey]);

  useEffect(() => {
    if (!cartStorageKey || !cartHydrated) return;
    try {
      // Product descriptions and full gallery arrays are not needed by the
      // cart; excluding them keeps mobile localStorage safely below quota.
      const compactCart = cart.map(({ product, qty, selectedVariants }) => ({
        product: {
          id: product.id, name: product.name, price: product.price,
          old_price: product.old_price, category: product.category,
          image_url: product.image_url, variants: product.variants,
          in_stock: product.in_stock, tags: product.tags, handle: product.handle,
        },
        qty,
        selectedVariants,
      }));
      localStorage.setItem(cartStorageKey, JSON.stringify(compactCart));
    } catch {
      // Safari private mode/storage limits should not break cart controls.
    }
  }, [cart, cartHydrated, cartStorageKey]);

  useLiveVisitorPing(seller?.id, {
    cartItemCount: cart.reduce((sum, i) => sum + i.qty, 0),
    cartValue: cart.reduce((sum, i) => sum + i.product.price * i.qty, 0),
  });

  /* ─── NAV ─── */
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // Desktop: hover-open (mouseenter sets true, mouseleave sets false, see
  // the Catalog trigger + mega-menu panel below). Mobile: tap-toggled
  // accordion within the drawer (catalogAccordionOpen for the outer
  // Catalog section, mobileGroupOpen for which single group's sub-items
  // are expanded -- only one open at a time, closing the previous one
  // when a new one opens, since all 22 groups' items expanded
  // simultaneously would make the drawer unusably long).
  const [catalogHoverOpen, setCatalogHoverOpen] = useState(false);
  const [catalogAccordionOpen, setCatalogAccordionOpen] = useState(false);
  const [mobileGroupOpen, setMobileGroupOpen] = useState<string | null>(null);
  // "Women <item>"/"Men <item>" per this store's real per-gender collection
  // naming (see CATALOG_MENU's own comment) -- "Shop All Women"/"Shop All
  // Men" are the two special cases pointing at the umbrella collection
  // instead.
  const catalogItemHref = (group: string, item: string) => {
    if (item === "Shop All Women") return sp(`/collections/${collectionSlug("ALL WOMEN")}`);
    if (item === "Shop All Men") return sp(`/collections/${collectionSlug("ALL MEN")}`);
    const name = group === "WOMEN" ? `Women ${item}` : group === "MEN" ? `Men ${item}` : item;
    return sp(`/collections/${collectionSlug(name)}`);
  };
  // Home page only: nav is transparent (see .fr-nav--transparent) while
  // still over the hero image, then switches back to its normal solid
  // light/frosted bar (matching .fr-dock's own look) once scrolled past it
  // -- every other section on the page has a light background, and the
  // transparent nav's text/icons are light-on-dark for the hero specifically,
  // so staying transparent past it would make them unreadable. 500 is a
  // deliberately simple fixed threshold rather than measuring the hero's
  // actual rendered height (min-height:560px, but height:88vh grows past
  // that on a tall viewport) -- close enough that the switch happens
  // around the hero/next-section boundary without needing a ResizeObserver
  // just for this. Starts true on the very first render (matches
  // scrollY === 0 before any scroll event has fired) rather than false, so
  // there's no flash of a solid nav over the hero before the first scroll
  // listener callback runs.
  const [navOverHero, setNavOverHero] = useState(isHomeView);
  useEffect(() => {
    if (!isHomeView) return;
    const onScroll = () => setNavOverHero(window.scrollY < 500);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [isHomeView]);

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
        .eq("seller_id", s.id)
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
      const { data: badges } = await supabase
        .from("product_promo_badges").select("label, scope, product_id, collection_name")
        .eq("seller_id", s.id).eq("active", true);
      setPromoBadges(badges || []);
      setLoading(false);
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
    })();
  }, [slug, isEditMode]);

  // Separate from the LOAD effect above on purpose -- that one's entire
  // body is skipped whenever initialSeller is provided (the real live
  // page ALWAYS provides it, for SSR/SEO -- see app/store/[slug]/page.tsx),
  // which meant this fetch never actually ran in production when it lived
  // inside that block (confirmed live: the cart drawer showed no
  // automatic-discount line at all despite the checkout page, which gets
  // its rules via /api/seller-public instead, showing it correctly). Keyed
  // on seller?.id so it runs once seller data exists regardless of which
  // path provided it.
  useEffect(() => {
    if (!seller?.id) return;
    (async () => {
      const nowIso = new Date().toISOString();
      const { data: bxgy } = await supabase
        .from("automatic_bxgy_discounts")
        .select("id, title, buy_quantity, buy_collection_names, get_quantity, get_collection_names, effect_type, effect_value, starts_at, ends_at")
        .eq("seller_id", seller.id).eq("active", true);
      setAutomaticBxgyDiscounts((bxgy || []).filter((r: any) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso)));
    })();
  }, [seller?.id]);

  const getProductPromo = (productId: string) =>
    promoDiscounts.find((d) => d.applies_to === "product" && d.product_ids?.includes(productId));

  const getProductPromoBadge = (p: Product): PromoBadge | undefined => {
    const categories = (p.category || "").split(",").map((c) => c.trim().toUpperCase());
    // These are 4regn's permanent collection offers. Keep them ahead of
    // imported discount/% badges so the advertised multi-buy deal is the
    // one customers see on both cards and the product page.
    if (categories.includes("BACK & FRONT PRINTED HOODIES") || categories.includes("FRONT & BACK PRINTED HOODIES")) {
      return { label: "BUY 2 FOR R699", scope: "collection", product_id: null, collection_name: "BACK & FRONT PRINTED HOODIES" };
    }
    if (categories.includes("STANDARD GRAPHIC HOODIES")) {
      return { label: "BUY 2 FOR R599", scope: "collection", product_id: null, collection_name: "STANDARD GRAPHIC HOODIES" };
    }
    return promoBadges.find((b) => (b.scope === "product" && b.product_id === p.id) || (b.scope === "collection" && b.collection_name && pInCat(p, b.collection_name)));
  };

  /* ─── SEARCH (lazy catalog fetch) ─── */
  // Fires the first time a visitor on the home or product view opens
  // search -- see searchProducts' own comment above for why this isn't
  // just part of the page's initial data. Product views fire it
  // immediately on mount instead (see the isProductView check below):
  // this is also the data source for the "You Might Also Like" row now,
  // which the route no longer fetches server-side at all. Guarded so it
  // only ever fetches once per page load (searchProducts stays non-null,
  // including as an empty array, once resolved) rather than re-fetching
  // every time the overlay reopens.
  useEffect(() => {
    // Product view fires this eagerly (not gated on showSearch) -- it's
    // also the data source for the "You Might Also Like" row, which needs
    // to show up without the visitor ever opening search.
    if (!(isHomeView || isProductView || isCollectionView) || (!showSearch && !isProductView) || searchProducts !== null || searchLoading || !seller?.id) return;
    setSearchLoading(true);
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name, price, old_price, category, image_url, handle, tags, in_stock")
        .eq("seller_id", seller.id)
        .eq("status", "published")
        .order("sort_order", { ascending: true });
      // id/name/price/old_price/category/image_url/handle/tags -- the
      // search overlay's own results only read id/name/price/image_url/
      // handle (see searched/goToProduct); old_price is carried along for
      // relatedProducts' sale-badge ProductCard render, and tags for that
      // same relatedProducts' relevance scoring (see its own comment).
      // in_stock is carried along too, purely so ProductCard's Sold Out
      // badge/disabled-button state (see its own comment) is accurate here --
      // sold-out products are no longer hidden from the storefront (only a
      // draft/deleted product is), so this list needs to know which ones
      // to mark rather than silently omitting them like before.
      // Product's remaining fields (images, variants, description, etc.)
      // are never touched here, same trust boundary the server-side
      // narrow-column fetches elsewhere in this app already rely on.
      setSearchProducts((data || []) as unknown as Product[]);
      setSearchLoading(false);
    })();
  }, [isHomeView, isProductView, isCollectionView, showSearch, searchProducts, searchLoading, seller?.id]);
  // Collection view's `products` used to hold the WHOLE collection's
  // product list (search there was scoped to just the current collection),
  // but now that the collection route paginates server-side (24/page,
  // see c/[collection]/page.tsx), `products` there is only the current
  // page's slice -- searching it alone would silently miss everything not
  // on the visible page. Reuses the same lazily-fetched full-catalog array
  // home/product views already rely on, so search now covers the whole
  // store regardless of which collection page it was opened from.
  const searchSource = (isHomeView || isProductView || isCollectionView) ? (searchProducts ?? []) : products;

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
      if (e.data.showHeroPill !== undefined) setLiveShowHeroPill(e.data.showHeroPill);
      if (e.data.heroPillLabel !== undefined) setLiveHeroPillLabel(e.data.heroPillLabel);
      if (e.data.heroDisclaimer !== undefined) setLiveHeroDisclaimer(e.data.heroDisclaimer);
      if (e.data.heroOfferHeadline !== undefined) setLiveHeroOfferHeadline(e.data.heroOfferHeadline);
      if (e.data.heroOfferNote !== undefined) setLiveHeroOfferNote(e.data.heroOfferNote);
      if (e.data.showAbout !== undefined) setLiveShowAbout(e.data.showAbout);
      if (e.data.aboutEyebrow !== undefined) setLiveAboutEyebrow(e.data.aboutEyebrow);
      if (e.data.aboutHeading !== undefined) setLiveAboutHeading(e.data.aboutHeading);
      if (e.data.aboutBody !== undefined) setLiveAboutBody(e.data.aboutBody);
      if (e.data.aboutStat1Value !== undefined) setLiveAboutStat1Value(e.data.aboutStat1Value);
      if (e.data.aboutStat1Label !== undefined) setLiveAboutStat1Label(e.data.aboutStat1Label);
      if (e.data.aboutStat2Value !== undefined) setLiveAboutStat2Value(e.data.aboutStat2Value);
      if (e.data.aboutStat2Label !== undefined) setLiveAboutStat2Label(e.data.aboutStat2Label);
      if (e.data.aboutCtaLabel !== undefined) setLiveAboutCtaLabel(e.data.aboutCtaLabel);
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

  /* ─── SCROLL RESTORATION ─── Prevents the browser's native scroll-position
     memory from fighting Next.js App Router's client-side navigation (a
     sticky header + dynamically-sized above-the-fold content otherwise
     causes pages to briefly load scrolled near the bottom before jumping
     back to the top). Take explicit control and force the top on every real
     page-content change -- not just once on first mount. App Router reuses
     this same FourRegnStore instance across client-side navigations between
     routes that share a layout boundary, so an empty-deps effect here only
     ever fires on the very first load of a session; it needs pathname (and
     mode, since some navigations are query-param-driven and may not change
     the pathname) in its deps to re-run on every subsequent navigation too. */
  // useLayoutEffect, not useEffect: the latter fires after the browser has
  // already painted the new page at its carried-over scroll offset, which
  // is exactly the visible "loads at the bottom, then jumps to the top"
  // flash this effect exists to prevent. useLayoutEffect runs synchronously
  // before paint, so the correction happens before anything is shown.
  // currentPage/currentSort are in the deps too -- collection-page
  // pagination/sorting changes neither pathname nor mode (same route,
  // same mode="collection", only ?page/?sort differ), so without these
  // this effect never re-fired for a page-to-page click at all, which is
  // exactly why it looked inconsistent ("sometimes it scrolls, sometimes
  // it doesn't") rather than reliably broken or reliably working.
  useLayoutEffect(() => {
    if ("scrollRestoration" in window.history) window.history.scrollRestoration = "manual";
    // Collection view: land at the top of the product grid, not the very
    // top of the page. Scrolling all the way up re-shows the header/hero,
    // which looks identical on every page of the same collection -- from
    // the bottom of a long page, that reads as "nothing happened" until
    // scrolling back down to notice the products actually changed. The
    // grid is exactly the content that's different page to page, so
    // that's what should be the first thing back in view.
    const productsEl = (isCollectionView || isSearchView) ? document.getElementById("fr-products") : null;
    if (productsEl) productsEl.scrollIntoView({ block: "start", behavior: "instant" });
    else window.scrollTo(0, 0);
  }, [pathname, mode, currentPage, currentSort]);

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
    setActiveImageDim(null);
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
  // No hover/touch prefetch for product cards (unlike category/pagination
  // links elsewhere in this file, which still prefetch -- much lower
  // cardinality, never implicated below). A debounced version of this
  // existed briefly but wasn't enough: Vercel's request logs showed two
  // requests for the same product landing at the exact same millisecond,
  // one marked Prefetch: Yes and one not -- an ordinary hover-then-click
  // (ample time to clear any debounce) still fires the prefetch, then the
  // real navigation right behind it, and since a first-time product view
  // has no ISR cache yet, BOTH independently regenerate the same page
  // concurrently. That doubles the query load (seller/product/discount/
  // promo-badge, twice over) for one single page view, on a database with
  // only 15 pooled connections -- confirmed as the actual mechanism behind
  // this store's product-page 500s (the ~30-40s failures are connections
  // queuing behind that doubled load; a fast, zero-query failure moments
  // later on the same product is Next's own regeneration lock still
  // jammed from the collision, not a separate bug). Losing the prefetch
  // head start on click is a real cost, but it removes the trigger for
  // all of this instead of just narrowing its window.
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
      setActiveImageDim(null);
      setLocalQty(1);
      setVariantError(false);
    }
  }, [mode, initialActiveProduct?.id]);
  const handleAddToCart = () => {
    if (!selectedProduct || selectedProduct.in_stock === false) return;
    const validVariants = (Array.isArray(selectedProduct.variants) ? selectedProduct.variants : []).filter(v => Array.isArray(v.options) && v.options.length > 0);
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
    if (product.in_stock === false) return;
    const validVariants = (Array.isArray(product.variants) ? product.variants : []).filter(v => Array.isArray(v.options) && v.options.length > 0);
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
    if (product.in_stock === false) return;
    const validVariants = (Array.isArray(product.variants) ? product.variants : []).filter(v => Array.isArray(v.options) && v.options.length > 0);
    const allSelected = validVariants.every((v) => selectedVariants[v.name]);
    if (!allSelected && validVariants.length > 0) { setVariantError(true); return; }
    const payload = [{ id: product.id, name: product.name, price: effectivePrice(product, selectedVariants), qty: localQty, variant: Object.entries(selectedVariants).map(([k, v]) => k + ": " + v).join(", "), image: resolveVariantImage(product, selectedVariants) || product.image_url || "", selectedVariants, tags: product.tags || [] }];
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
      image: resolveVariantImage(i.product, i.selectedVariants) || i.product.image_url || "",
      selectedVariants: i.selectedVariants,
      tags: i.product.tags || [],
    }));
    const encoded = btoa(JSON.stringify(payload));
    window.location.href = sp(`/checkout?cart=${encoded}`);
  };

  /* ─── DERIVED ─── */
  const allCategories = ["All", ...Array.from(new Set(products.flatMap((p) => (p.category || "").split(",").map((c) => c.trim()).filter(Boolean))))];
  // catImage/catCount only need `products`, which is already in scope here --
  // moved up above categoryList/menuCategories/sellerCollections-derived
  // buckets below so every place that renders a browsable collection list
  // can filter out collections that currently match 0 products (sold out,
  // unpublished, or just not tagged to anything) before anything renders.
  const catImage = (cat: string) => {
    const override = config.collection_images?.[cat];
    if (override) return override;
    const p = products.find((p) => pInCat(p, cat) && p.image_url);
    return p?.image_url || null;
  };
  const catCount = (cat: string) => products.filter((p) => pInCat(p, cat)).length;
  // "Shop by Collection" grid: the seller's real, explicitly-ordered
  // collections list is the source of truth here (same list the nav/footer
  // already use below) so this grid can never drift from what the seller
  // actually configured. Only falls back to auto-derived product.category
  // tags for stores that haven't set up collections yet, so the grid isn't
  // simply empty for them. Either way, a collection that currently matches 0
  // products is never a clickable tile -- filtered out here so it can never
  // slip into any browsable listing below.
  // hidden_collections: collections the seller wants to keep un-browsable
  // (no nav link, no "Shop by Collection" tile, no /collections listing)
  // while their products stay fully visible everywhere else (search, the
  // homepage grid, any OTHER collection they're also tagged with, direct
  // product links). Filtered right here, at the one place sellerCollections
  // is built, so every downstream consumer (categoryList, menuCategories,
  // collectionsIndexList, Shop by Gender) inherits it automatically --
  // effectiveStoreConfig() is called directly rather than via the `config`
  // const below since that's defined later in this component and only
  // depends on `seller`, which is already in scope here.
  const hiddenCollectionsSet = new Set(seller ? ((effectiveStoreConfig(seller) as StoreConfig).hidden_collections || []) : []);
  const sellerCollections = (seller?.collections || []).filter(Boolean).filter((c) => !hiddenCollectionsSet.has(c));
  const categoryList = (sellerCollections.length > 0 ? sellerCollections : allCategories.filter((c) => c !== "All").slice(0, 8)).filter((cat) => catCount(cat) > 0);
  // Nav / menu links come straight from the seller's collections list -- no
  // fixed menu structure baked in here. "All" has no real per-collection
  // count and always stays; every other (real, named) entry is dropped once
  // it has 0 matching products.
  const menuCategories = ["All", ...sellerCollections.filter((cat) => catCount(cat) > 0)];
  const effectiveCategory = isSearchView
    ? (initialSearchQuery?.trim() ? `Search results for "${initialSearchQuery}"` : "Search")
    : isCollectionView && collectionName ? collectionName : activeCategory;
  // Real product search -- searchSource (see above: lazily-fetched on home
  // view, the same already-loaded `products` everywhere else), matched
  // against a free-text query by name and category instead of a fixed
  // active category. Null (not just an empty array) when the box is empty
  // so the overlay can tell "no query yet" apart from "query matched
  // nothing".
  const searchQueryTrimmed = searchQuery.trim().toLowerCase();
  const searched = searchQueryTrimmed
    ? searchSource.filter((p) =>
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
    // Collection AND search views: `products` is already the server-matched
    // set for this page (see app/store/[slug]/collections/[collection]/page.tsx
    // and .../search/page.tsx) -- just sort it, don't re-filter by activeCategory
    // (which stays "All" on both of these routes; it's a home-view-only tile
    // filter).
    const list = (isCollectionView || isSearchView)
      ? [...products]
      : (activeCategory === "All" ? [...products] : products.filter((p) => pInCat(p, activeCategory)));
    return sortProducts(list);
  })();
  // Per-collection product-preview rows used to render on the homepage
  // (one titled row per collection). Removed: the homepage already has a
  // "Shop by Collection" tile grid, a dedicated /collections/<collection> page per
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
  // Live preview of automatic Buy X Get Y savings -- same pricing function
  // /api/checkout/place-order uses for the real charge (see
  // lib/automatic-discounts.ts's own comment on why both sides share one
  // implementation).
  const automaticDiscount = automaticBxgyDiscounts.length && cart.length
    ? computeAutomaticBxgyDiscount(automaticBxgyDiscounts, cart.map((i) => ({ name: i.product.name, price: effectivePrice(i.product, i.selectedVariants), qty: i.qty, category: i.product.category })))
    : { totalDiscount: 0, applied: [] as { title: string; amount: number }[] };
  // Any import product shows the delivery note. This includes import-only
  // carts as well as carts mixing premium and general products, because the
  // full order follows the premium shipment's 7-14-working-day timeline.
  const cartHasImport = cart.some((i) => hasImportTag(i.product.tags));
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
  const displayHeroDisclaimer = liveHeroDisclaimer ?? config.hero_disclaimer ?? "";
  const displayHeroOfferHeadline = liveHeroOfferHeadline ?? config.hero_offer_headline ?? "";
  const displayHeroOfferNote = liveHeroOfferNote ?? config.hero_offer_note ?? "";
  const showAbout = liveShowAbout ?? config.show_about ?? true;
  const aboutEyebrow = liveAboutEyebrow ?? config.about_eyebrow ?? "Est. 2019 — South Africa";
  const aboutHeading = liveAboutHeading ?? config.about_heading ?? "Built for the Culture";
  const aboutBody = liveAboutBody ?? config.about_body ?? `Founded in 2019 by Nikless Mathonsi, ${seller.store_name} is South Africa's leading luxury streetwear brand. With over 110,000 successful deliveries nationwide, we've earned the trust of a growing community.\n\nWe don't just offer clothing — we create an experience. Join the ${seller.store_name} Family and let's shape the future of fashion together.`;
  const aboutStat1Value = liveAboutStat1Value ?? config.about_stat1_value ?? "110K+";
  const aboutStat1Label = liveAboutStat1Label ?? config.about_stat1_label ?? "Deliveries";
  const aboutStat2Value = liveAboutStat2Value ?? config.about_stat2_value ?? "2019";
  const aboutStat2Label = liveAboutStat2Label ?? config.about_stat2_label ?? "Est.";
  const aboutCtaLabel = liveAboutCtaLabel ?? config.about_cta_label ?? "Our Story";
  const displayCtaPrimary = liveHeroCtaPrimary ?? config.hero_cta_primary ?? "Shop the Collection";
  const displayCtaSecondary = liveHeroCtaSecondary ?? config.hero_cta_secondary ?? "";
  const displayCtaPrimaryTarget: CtaTarget = liveHeroCtaPrimaryTarget ?? config.hero_cta_primary_target ?? { type: "products" };
  const displayCtaSecondaryTarget: CtaTarget = liveHeroCtaSecondaryTarget ?? config.hero_cta_secondary_target ?? { type: "none" };

  const ctaClick = (target: CtaTarget) => () => {
    if (target.type === "products") {
      document.getElementById("fr-products")?.scrollIntoView({ behavior: "smooth" });
    } else if (target.type === "collection") {
      navigate(sp(`/collections/${target.collection}`));
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
  const nlSub = liveNewsletterSub ?? config.newsletter_sub ?? "Be the first to know about new collections and exclusive offers.";

  // Shop by Gender -- opt-out (default on), same "always show unless a
  // seller explicitly hides it" convention as SETLA/Newsletter above, since
  // it's the real 4regn homepage's default state too. Eyebrow/heading are
  // the only editable copy (no fixed category slots) -- everything else is
  // derived straight from the seller's real `collections` list below.
  const showShopByGender = liveShowShopByGender ?? config.show_shopbygender ?? true;
  // Hero pill (e.g. "7 YEAR ANNIVERSARY SALE") -- opt-in (default off),
  // unlike Newsletter/Shop by Gender above: an empty label would otherwise
  // render an empty pill by default on every seller's storefront.
  const showHeroPill = (liveShowHeroPill ?? config.show_hero_pill ?? false) && !!(liveHeroPillLabel ?? config.hero_pill_label);
  const heroPillLabel = liveHeroPillLabel ?? config.hero_pill_label ?? "";
  const sbgEyebrow = liveShopByGenderEyebrow ?? config.shopbygender_eyebrow ?? `${seller.store_name} Collection`;
  const sbgHeading = liveShopByGenderHeading ?? config.shopbygender_heading ?? "Shop by Category";
  // partitionGenderCollections only partitions by name convention -- it has
  // no idea about product counts, so a "Men <thing>"/"Women <thing>" (or
  // "ALL MEN"/"ALL WOMEN") collection with 0 matching products can slip
  // straight through it. Apply the same catCount(cat) > 0 guard used
  // everywhere else right after partitioning so these panels never get an
  // empty clickable tile either -- nothing else about how this section
  // works changes.
  const { men: sbgMenRaw, women: sbgWomenRaw } = partitionGenderCollections(sellerCollections);
  const filterGenderBucket = (b: GenderBucket): GenderBucket => ({
    shopAll: b.shopAll && catCount(b.shopAll) > 0 ? b.shopAll : null,
    items: b.items.filter((it) => catCount(it.name) > 0),
  });
  const sbgMen = filterGenderBucket(sbgMenRaw);
  const sbgWomen = filterGenderBucket(sbgWomenRaw);
  const sbgHasMen = sbgMen.items.length > 0;
  const sbgHasWomen = sbgWomen.items.length > 0;
  // Hide the whole section if neither bucket has real collections yet
  // (e.g. before migrate-4regn-collections.ts has run); hide just the
  // empty panel if only one gender has collections set up.
  const showShopByGenderSection = isHomeView && showShopByGender && (sbgHasMen || sbgHasWomen);

  // /collections index page (mode="collections-index") -- the seller's real
  // collections, zero-product ones filtered out the same as every other
  // browsable listing, sorted alphabetically (A-Z). The real theme's own
  // main-list-collections.liquid sort is a one-time merchant/theme-editor
  // setting, not a live customer control, so this is a fixed order rather
  // than an on-page picker.
  const collectionsIndexList = sellerCollections.filter((cat) => catCount(cat) > 0).sort((a, b) => a.localeCompare(b));

  // Single tile renderer for the homepage's capped "Shop by Collection"
  // grid. NOT shared with the /collections index page (mode=
  // "collections-index") -- that page matches the real theme's own
  // full-bleed image-tile main-list-collections.liquid grid one-for-one
  // instead (see the fr-collgrid-* markup/CSS below), which is a
  // deliberately different look from this capped teaser tile.
  const renderCatTile = (cat: string) => {
    const img = catImage(cat);
    return (
      <button key={cat} className="fr-cat-card" onClick={() => navigate(sp(`/collections/${collectionSlug(cat)}`))} onMouseEnter={() => prefetchPath(sp(`/collections/${collectionSlug(cat)}`))} onTouchStart={() => prefetchPath(sp(`/collections/${collectionSlug(cat)}`))}>
        <div className="fr-cat-img">
          {img ? (
            <>
              {/* REVERTED from next/image (see git history) -- catImage()
                  can return config.collection_images' seller-pasted
                  override URL, which is completely unconstrained (any
                  host at all, including leftover Shopify CDN URLs from
                  the original migration setup). next/image only proxies
                  images from hosts explicitly whitelisted in
                  next.config.ts (just *.supabase.co today); any collection
                  cover image hosted elsewhere silently 400'd through
                  /_next/image and fell back to the initials placeholder --
                  a real, confirmed regression (reported directly: "a lot
                  of the collections are missing their cover image now").
                  Plain <img> has no such domain restriction, so it's the
                  correct choice specifically for this uncontrolled-URL
                  case -- unlike the footer/nav logo and payment icons
                  nearby, which are all from a single verified, controlled
                  source and keep next/image. */}
              <img src={img} alt={cat} loading="lazy" decoding="async" onError={handleImgError} style={{ width: "100%", height: "auto", display: "block" }} />
              <span className="fr-cat-mark" style={{ display: "none" }}>{cat}</span>
            </>
          ) : <span className="fr-cat-mark">{cat}</span>}
        </div>
        <div className="fr-cat-foot">
          <div className="fr-cat-name">{cat}</div>
        </div>
      </button>
    );
  };

  /* Shared product-card markup -- used by the grouped collection rows, the
     flat fallback grid, and the collection-page grid, so all three stay in
     sync instead of drifting out of three copy-pasted blocks. */
  const ProductCard = ({ p, priority = false }: { p: Product; priority?: boolean }) => {
    const onSale = p.old_price && p.old_price > p.price;
    const salePct = onSale ? Math.round((1 - p.price / p.old_price!) * 100) : 0;
    const badge = getProductPromoBadge(p);
    const promo = getProductPromo(p.id);
    return (
      <div className="fr-pcard" onClick={() => goToProduct(p)}>
        <div className="fr-pimg">
          <button type="button" className={"fr-wish-btn" + (wishlist.some((w) => w.id === p.id) ? " active" : "")} aria-label="Toggle wishlist" onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }}><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button>
          {p.in_stock === false ? (
            <span className="fr-ptag soldout">Sold Out</span>
          ) : (
            <>
              {badge && <span className="fr-ptag sale">{badge.label}</span>}
              {!badge && promo && <span className="fr-ptag sale">{promo.type === "percentage" ? `-${promo.value}%` : "Sale"}</span>}
              {!badge && !promo && onSale && <span className="fr-ptag sale">{`-${salePct}%`}</span>}
              {showHeroPill && (badge || promo || onSale) && <span className="fr-ptag-anniv">{heroPillLabel}</span>}
            </>
          )}
          {p.image_url ? (
            <>
              <img src={p.image_url} alt={p.name} loading={priority ? "eager" : "lazy"} fetchPriority={priority ? "high" : "auto"} decoding="async" onError={handleImgError} style={{ width: "100%", height: "auto", display: "block" }} />
              <span className="fr-p-mark" style={{ display: "none" }}>{initials(p.name)}</span>
            </>
          ) : (
            <span className="fr-p-mark">{initials(p.name)}</span>
          )}
        </div>
        <div className="fr-pinfo">
          <div className="fr-pname">{p.name}</div>
          <div className="fr-pprice">
            {onSale && <span className="was">{fmt(p.old_price!)}</span>}
            {fmt(p.price)}
          </div>
          <button
            className="fr-pwa"
            type="button"
            disabled={p.in_stock === false}
            onClick={(e) => { e.stopPropagation(); if (p.in_stock === false) return; goToProduct(p); }}
          >
            {p.in_stock === false ? "Sold Out" : "Add to Cart"}
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
.fr-root *,.fr-root *::before,.fr-root *::after{box-sizing:border-box}
/* Search overlay, size-chart modal, cart drawer etc. render as SIBLINGS of
   .fr-root (see the closing </div> right before "MOBILE BOTTOM DOCK"), not
   descendants -- so every custom property (--ink, --card-radius, etc.) and
   color-scheme declared only on .fr-root never reached them: var(--ink)
   with no fallback is invalid there, so color fell back through the
   inherited chain to globals.css's body{color:#f5f5f5}, reading as
   near-invisible white-on-white text (search bar, size-chart values), and
   --card-radius/--card-shadow silently dropped modal corners/shadow the
   same way. Declaring everything on :root instead makes it available
   anywhere in the document regardless of DOM nesting. Safe globally: only
   one storefront template's <style> tag is ever mounted per page load. */
:root{
  color-scheme: light;
  --ink:#2e2a39;--paper-grad:linear-gradient(178deg, rgba(255,255,255,1), rgba(249,249,249,1) 48.5%, rgba(245,245,245,1) 97%);
  --paper-solid:#e6e6e6;--head-bg:#000000;--head-text:#fdfbf7;
  --brown:#765341;--purple:linear-gradient(320deg, #86106a, #5e3653 100%);--cream:#fdfbf7;--accent:#d64735;
  --btn-bg:#000000;--btn-text:#ffffff;--btn-radius:10px;--btn-shadow:0 4px 5px rgba(0,0,0,0.08);
  --card-radius:12px;--card-shadow:10px 10px 35px rgba(0,0,0,0.05);
  // Site-wide typography now matches the hero section's own look exactly
  // (was 'Quattrocento'/'Amiri', a Google Fonts pairing unrelated to it) --
  // the seller specifically asked for the hero's typeface everywhere,
  // headings and body copy (including product descriptions, which read
  // font-family off --body with no override of their own) alike. Same
  // literal font stack .fr-hero-h1/.fr-hero-pill/.fr-hero-offer already
  // used, so nothing about the hero itself changes -- this brings every
  // OTHER heading/body element in line with it instead. No system font
  // needs a <link>/@import, so that Google Fonts request is gone too.
  --serif:Arial,Helvetica,sans-serif;--body:Arial,Helvetica,sans-serif;
}
.fr-root{
  font-family:var(--body);background:var(--paper-grad);color:var(--ink);
  -webkit-font-smoothing:antialiased;overflow-x:hidden;
}
.fr-progress{position:fixed;top:0;left:0;right:0;height:3px;z-index:200;background:rgba(37,99,235,0.1);overflow:hidden;pointer-events:none}
.fr-progress.is-idle{display:none}
.fr-progress::after{content:"";position:absolute;inset:0;background:#2563eb;transform:scaleX(0);transform-origin:left center;border-radius:0 2px 2px 0}
.fr-progress.is-loading::after{animation:fr-progress 10s cubic-bezier(0.12,0.72,0.18,1) forwards}
.fr-progress.is-finishing::after{transform:scaleX(1);transition:transform 0.18s ease-out}
@keyframes fr-progress{0%{transform:scaleX(0)}8%{transform:scaleX(.2)}24%{transform:scaleX(.45)}50%{transform:scaleX(.7)}75%{transform:scaleX(.84)}100%{transform:scaleX(.94)}}
@keyframes fr-spin{to{transform:rotate(360deg)}}

/* Solid state (every page except the home hero, and the home page itself
   once scrolled past it) now matches the mobile bottom dock's own look --
   light frosted glass, dark ink icons/text -- instead of the old solid
   black bar var(--head-bg)/var(--head-text) used to paint here. Colors
   below (rgba(46,42,57,...) = --ink at various opacities, same literal
   .fr-dock-item already uses) are chosen to be the SAME values as the
   dock's, not just a similar dark tone, per the seller's own explicit ask
   that the hamburger/search/cart icons match the bottom nav's icon color. */
.fr-nav{position:sticky;top:0;z-index:100;background:rgba(255,255,255,0.85);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border-bottom:1px solid rgba(0,0,0,0.06);display:grid;grid-template-columns:auto 1fr auto;align-items:center;gap:24px;padding:0 40px;height:72px}
/* Home page only: transparent nav floating over the hero image instead of
   the solid frosted bar above. .fr-hero pulls itself up by exactly the
   nav's own height (kept in sync with the mobile height override below)
   so the hero image starts at the very top of the viewport, behind the
   now-see-through nav, instead of the nav pushing it down. Nav stays
   position:sticky throughout (only background/text-color change) -- while
   scrolled within the hero it's see-through with light text/icons (still
   legible against the hero's dark overlay, see .fr-nav--transparent's own
   child overrides below); past that point (navOverHero flips false, see
   the scroll effect below) it switches back to the solid light/dark-ink
   look every other section already uses. */
.fr-nav--transparent{background:transparent;backdrop-filter:none;-webkit-backdrop-filter:none;border-bottom:none}
.fr-nav--transparent .fr-burger span{background:var(--head-text)}
.fr-nav--transparent .fr-logo{color:var(--head-text)}
.fr-nav--transparent .fr-nav-link{color:rgba(253,251,247,0.75)}
.fr-nav--transparent .fr-nav-link:hover{color:var(--head-text)}
.fr-nav--transparent .fr-search-btn,.fr-nav--transparent .fr-cart-btn{color:var(--head-text)}
.fr-hero{margin-top:-72px}
.fr-nav-left{display:flex;align-items:center;gap:20px}
.fr-burger{display:none;background:none;border:none;cursor:pointer;width:24px;height:24px;flex-direction:column;justify-content:space-between;padding:5px 0}
.fr-burger span{display:block;width:100%;height:1px;background:var(--ink)}
.fr-logo{font-family:var(--serif);font-weight:700;font-size:24px;letter-spacing:0.5px;color:var(--ink);text-decoration:none;line-height:1;white-space:nowrap}
.fr-logo img{height:34px;width:auto;display:block;object-fit:contain}
.fr-nav-links{display:flex;gap:28px;align-items:center;justify-content:center;overflow:hidden}
/* Mobile-only duplicate of .fr-logo, rendered inside .fr-nav-links so it can
   occupy the nav's centered middle grid column once the real nav links hide
   there below 900px -- see the two mobile-breakpoint rules that toggle
   which of the two logo copies (this one vs. the .fr-nav-left one) is
   visible. Hidden by default so it never doubles up the logo on desktop. */
.fr-nav-links .fr-logo{display:none}
.fr-nav-link{font-family:var(--body);font-size:12px;font-weight:400;letter-spacing:1px;text-transform:uppercase;text-decoration:none;color:rgba(46,42,57,0.65);transition:color 0.2s;background:none;border:none;cursor:pointer;white-space:nowrap}
.fr-nav-link:hover{color:var(--ink)}
/* CATALOG MEGA-MENU -- desktop hover-open only (mobile gets the drawer's
   own tap accordion, see .fr-mm-group below); position:fixed rather than
   absolute so the panel can span the full viewport width regardless of
   .fr-nav-catalog's own narrow (just the "Catalog" link's) box -- an
   absolutely-positioned child sizes against its nearest positioned
   ancestor, which here would be this narrow wrapper, not the page. */
.fr-nav-catalog{position:relative}
.fr-catalog-menu{position:fixed;top:72px;left:0;right:0;background:#fff;border-top:1px solid rgba(0,0,0,0.08);box-shadow:0 24px 48px rgba(0,0,0,0.14);z-index:99;max-height:calc(100vh - 72px);overflow-y:auto}
.fr-catalog-menu-inner{max-width:1360px;margin:0 auto;padding:32px 40px;display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:28px 24px}
.fr-catalog-group{display:flex;flex-direction:column;gap:10px;min-width:0}
.fr-catalog-group-label{font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--ink)}
.fr-catalog-group-link{text-decoration:none;cursor:pointer;width:fit-content}
.fr-catalog-group-link:hover{text-decoration:underline;text-underline-offset:3px}
.fr-catalog-group ul{list-style:none;padding:0;margin:0;display:flex;flex-direction:column;gap:8px}
.fr-catalog-group ul a{font-family:var(--body);font-size:12.5px;line-height:1.4;color:rgba(46,42,57,0.65);text-decoration:none}
.fr-catalog-group ul a:hover{color:var(--ink);text-decoration:underline;text-underline-offset:3px}
.fr-nav-right{display:flex;justify-content:flex-end;align-items:center;gap:18px}
.fr-search-btn{background:none;border:none;cursor:pointer;color:rgba(46,42,57,0.5);padding:4px;display:flex;align-items:center}
.fr-cart-btn{position:relative;background:none;border:none;cursor:pointer;color:rgba(46,42,57,0.5);padding:4px;display:flex;align-items:center}
.fr-cart-count{position:absolute;top:-4px;right:-6px;min-width:16px;height:16px;padding:0 3px;border-radius:999px;background:var(--brown);color:var(--cream);font-size:9px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:var(--body)}

.fr-hero{position:relative;width:100%;min-height:560px;height:88vh;overflow:hidden;display:flex;align-items:flex-end;background:linear-gradient(160deg,#1a1715 0%,#000 100%)}
.fr-hero-bgimg{position:absolute;inset:0;z-index:0}
/* Top stop bumped from 0.12 -> 0.32 -- previously nearly clear, which
   worked fine when the top of the hero only ever sat under a solid black
   nav bar, but now the transparent nav (see .fr-nav--transparent) sits
   directly over this same area with light text, and 0.12 wasn't reliably
   dark enough for that text to stay legible against an arbitrary hero
   photo's own brightness. */
.fr-hero-overlay{position:absolute;inset:0;z-index:1;background:linear-gradient(to top,rgba(0,0,0,0.82) 0%,rgba(0,0,0,0.38) 55%,rgba(0,0,0,0.32) 100%)}
.fr-hero-inner{position:relative;z-index:2;width:100%;max-width:720px;padding:0 56px 72px;text-align:left}
.fr-hero-pill{display:inline-block;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:0.20em;text-transform:uppercase;color:var(--cream);background:var(--accent);padding:7px 16px;border-radius:999px;margin-bottom:16px}
.fr-hero-label{font-family:var(--body);font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(253,251,247,0.65);margin-bottom:18px;display:flex;align-items:center;gap:12px}
.fr-hero-label::before{content:'';display:block;width:26px;height:1px;background:rgba(253,251,247,0.4)}
.fr-hero-h1{font-family:Arial,Helvetica,sans-serif;font-weight:400;font-style:italic;letter-spacing:-0.06em;font-size:clamp(40px,7.5vw,92px);line-height:0.92;color:#fdfbf7;margin-bottom:20px;white-space:pre-line;text-shadow:0 3px 30px rgba(0,0,0,0.33)}
.fr-hero-body{font-family:var(--body);font-style:italic;font-size:16px;line-height:1.7;color:rgba(253,251,247,0.72);max-width:460px;margin-bottom:34px;white-space:pre-line}
.fr-hero-disclaimer{font-family:var(--body);font-size:10px;letter-spacing:0.5px;line-height:1.5;color:rgba(253,251,247,0.55);max-width:420px;margin-top:14px}
.fr-hero-offer{margin:0 0 18px;max-width:640px;font-family:Arial,Helvetica,sans-serif;font-size:clamp(14px,1.8vw,20px);line-height:1.55;font-weight:700;letter-spacing:0.10em;text-transform:uppercase;color:#fdfbf7;text-shadow:0 2px 18px rgba(0,0,0,0.45)}
.fr-hero-offer-accent{color:var(--accent)}
.fr-hero-offer-pulse{color:var(--accent);display:inline-block;animation:fr-heartbeat 1.2s ease-in-out infinite;transform-origin:center}
.fr-hero-offer-note{display:block;margin-top:6px;font-family:Arial,Helvetica,sans-serif;font-size:0.72em;font-weight:400;letter-spacing:0.13em;text-transform:uppercase;color:rgba(253,251,247,0.75)}
@keyframes fr-heartbeat{0%{transform:scale(1)}14%{transform:scale(1.12)}28%{transform:scale(1)}42%{transform:scale(1.14)}70%{transform:scale(1)}100%{transform:scale(1)}}
.fr-cta-row{display:flex;align-items:center;gap:22px;margin-bottom:36px;flex-wrap:wrap}
.fr-btn{display:inline-flex;align-items:center;justify-content:center;min-width:200px;min-height:56px;background:rgba(0,0,0,0.06);color:#fff;font-family:Arial,Helvetica,sans-serif;font-size:13px;font-weight:700;letter-spacing:0.28em;text-transform:uppercase;text-decoration:none;padding:0 28px;border-radius:2px;border:1.5px solid rgba(255,255,255,0.78);backdrop-filter:blur(2px);-webkit-backdrop-filter:blur(2px);cursor:pointer;transition:background 0.25s ease,color 0.25s ease,border-color 0.25s ease}
.fr-btn:hover{background:#fff;color:#111;border-color:#fff}
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
.fr-setla-beat{display:inline-block;transform-origin:center;animation:fr-setla-beat 2s ease-in-out infinite}
@keyframes fr-setla-beat{0%,20%,100%{transform:scale(1)}8%{transform:scale(1.14)}16%{transform:scale(1)}}
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

/* TICKER STRIP — ported 1:1 from the real site's ticker-strip.liquid
   section (same 5 default items, same infinite-marquee mechanics): black
   full-bleed bar between the SETLA banner and the rest of the homepage
   content, matching templates/index.json's actual section order. Repeats
   the item list 4x (.fr-ticker-track renders TICKER_ITEMS four times) so
   the strip has enough width to loop seamlessly at -50% regardless of
   viewport width, then animates continuously; -50% (not -100%) is exactly
   half of that 4x-repeated track, i.e. exactly 2 full item-list widths,
   so the loop point is invisible. */
.fr-ticker{background:#111111;overflow:hidden;padding:13px 0;white-space:nowrap}
.fr-ticker-track{display:inline-flex;animation:fr-ticker-roll 30s linear infinite}
.fr-ticker-item{display:inline-flex;align-items:center;gap:28px;padding:0 28px;font-size:9.5px;font-weight:700;letter-spacing:0.22em;text-transform:uppercase;color:rgba(255,255,255,0.85);font-family:var(--body)}
.fr-ticker-gem{color:rgba(255,255,255,0.4);font-size:10px;margin-left:28px}
@keyframes fr-ticker-roll{from{transform:translateX(0)}to{transform:translateX(-50%)}}

/* WINTER ESSENTIALS COVERFLOW — ported 1:1 from winter-essentials.liquid's
   own styles (see WinterCoverflow's comment for the JS behavior it
   drives). Fixed values instead of the Liquid version's per-section theme
   settings (background photo/colors, heading copy, motion tuning) --
   those were editable per-install there; here they're fixed to that
   section's own schema defaults, since there's no settings panel for this
   one yet. */
.fr-cef{background:#e8e8e8;color:#0a0a0a;overflow:hidden;font-family:var(--body)}
.fr-cef-head{text-align:center;padding:32px 20px 6px}
.fr-cef-eyebrow{font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8c8880;font-weight:700;margin-bottom:6px}
.fr-cef-title{font-family:var(--serif);font-weight:700;font-size:clamp(34px,7vw,72px);line-height:0.9;letter-spacing:1px;margin:0}
.fr-cef-sub{display:inline-block;margin-top:10px;color:#fff;font-family:var(--body);font-weight:700;font-size:clamp(14px,2.2vw,20px);letter-spacing:1px;padding:6px 22px;border-radius:40px;background:#e8503a;box-shadow:0 10px 28px -10px rgba(232,80,58,0.5)}
.fr-cef-stage{position:relative;width:100%;height:clamp(360px,56vh,600px);margin-top:18px;overflow:hidden}
.fr-cef-track{position:absolute;top:0;left:0;height:100%;display:flex;align-items:center;will-change:transform}
.fr-cef-slide{flex:0 0 auto;width:var(--cw,300px);display:flex;align-items:center;justify-content:center;padding:0 10px}
.fr-cef-card{width:100%;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 30px 60px -24px rgba(0,0,0,0.5);transform:scale(var(--s,0.7));display:block;will-change:transform}
.fr-cef-card img{width:100%;display:block;aspect-ratio:3/4;object-fit:cover}
.fr-cef-cta{text-align:center;padding:20px 20px 40px}
.fr-cef-btn{display:inline-block;background:#0a0a0a;color:#fff;padding:15px 40px;font-family:var(--body);font-weight:700;font-size:15px;letter-spacing:2px;text-decoration:none;border-radius:8px;box-shadow:0 12px 28px -8px rgba(0,0,0,0.45);transition:transform 0.3s ease}
.fr-cef-btn:hover{transform:translateY(-3px)}
.fr-cef-note{margin-top:10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8c8880;font-weight:600}
/* STANDARD GRAPHIC HOODIES — stacked deck ported from the supplied Liquid section. */
.fr-sdk{background:#e8e8e8;color:#0a0a0a;overflow:hidden;font-family:var(--body)}
.fr-sdk-wrap{min-height:700px;display:flex;flex-direction:column;justify-content:center;padding:32px 0 20px;overflow:hidden}
.fr-sdk-head{text-align:center;padding:0 20px 6px;flex-shrink:0}
.fr-sdk-eyebrow{font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8c8880;font-weight:700;margin-bottom:5px}
.fr-sdk-title{font-family:var(--serif);font-size:clamp(30px,6vw,64px);line-height:.92;letter-spacing:1px;margin:0}
.fr-sdk-deal{display:inline-block;margin-top:10px;color:#fff;font-family:var(--serif);font-size:clamp(16px,2.6vw,24px);letter-spacing:1.5px;padding:6px 22px;border-radius:40px;background:#e8503a;box-shadow:0 10px 28px -10px rgba(232,80,58,.5)}
.fr-sdk-stage{position:relative;width:100%;height:clamp(380px,58vh,580px);margin-top:14px;display:flex;align-items:center;justify-content:center}
.fr-sdk-card{position:absolute;width:clamp(240px,60vw,320px);border-radius:18px;overflow:hidden;background:#fff;box-shadow:0 30px 60px -24px rgba(0,0,0,.55);transition:transform .7s cubic-bezier(.6,.02,.2,1),opacity .7s;will-change:transform,opacity;display:block}
.fr-sdk-card.is-flying{transform:translateX(120%) rotate(12deg)!important;opacity:0!important}
.fr-sdk-card img{width:100%;display:block;aspect-ratio:3/4;object-fit:cover;object-position:center top}
.fr-sdk-cta{text-align:center;padding:18px 20px 0;flex-shrink:0}
.fr-sdk-btn{display:inline-block;background:#0a0a0a;color:#fff;padding:15px 40px;font-family:var(--serif);font-size:20px;letter-spacing:3px;text-decoration:none;border-radius:8px;box-shadow:0 12px 28px -8px rgba(0,0,0,.45);transition:transform .3s ease}
.fr-sdk-btn:hover{transform:translateY(-3px)}
.fr-sdk-note{margin-top:10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8c8880;font-weight:600}
@media(prefers-reduced-motion:reduce){.fr-sdk-card{transition:none}.fr-sdk-card.is-flying{transform:none!important;opacity:1!important}}

/* Winter Sale Marquee — ported from sections/4regn-winter-sale-landing.liquid
   ("4REGN Winter Marquee"). Colors/spacing below are the real values from
   this store's own templates/index.json settings (text #0a0a0a, muted
   #8c8880, no bg_image configured so it's always the #e8e8e8 fallback,
   deal-pill color #e8503a on both rows, 700px min-height, 30s scroll) --
   same "fixed to this install's real settings, no editor panel yet"
   approach as WinterCoverflow's own CSS comment above. Fixed class names
   (not the Liquid version's {{ section.id }}-suffixed ones) for the same
   reason the SETLA widget below uses fixed names -- only one of these is
   ever mounted at a time. */
.fr-fwm{background:#e8e8e8;color:#0a0a0a;overflow:hidden;font-family:'Montserrat',var(--body);min-height:700px;display:flex;flex-direction:column;padding:16px 0 20px}
.fr-fwm-logo{font-family:var(--serif);font-size:18px;letter-spacing:5px;text-align:center;padding:4px 0;flex-shrink:0}
.fr-fwm-hero{text-align:center;padding:6px 20px 2px;flex-shrink:0}
.fr-fwm-eyebrow{font-size:9px;letter-spacing:4px;text-transform:uppercase;color:#8c8880;font-weight:700;margin-bottom:4px}
.fr-fwm-title{font-family:var(--serif);font-size:clamp(28px,6vw,60px);line-height:0.92;letter-spacing:1px;margin:0}
.fr-fwm-thin{color:#8c8880}
.fr-fwm-sub{font-size:clamp(10px,1.3vw,13px);font-weight:300;color:#8c8880;max-width:460px;margin:8px auto 0;line-height:1.5}
.fr-fwm-rows{flex:1;display:flex;flex-direction:column;justify-content:center;gap:18px;padding:12px 0;min-height:0;overflow:hidden}
.fr-fwm-rowhead{text-align:center;margin-bottom:9px}
.fr-fwm-rowtitle{font-family:var(--serif);font-size:clamp(18px,3vw,26px);letter-spacing:2px;line-height:1}
.fr-fwm-deal{display:inline-block;margin-top:5px;color:#fff;font-family:var(--serif);font-size:clamp(13px,2vw,18px);letter-spacing:1.5px;padding:4px 16px;border-radius:40px;background:#e8503a;box-shadow:0 8px 22px -8px rgba(232,80,58,0.5)}
.fr-fwm-deal small{font-family:var(--body);font-weight:600;font-size:9px;letter-spacing:1px;opacity:0.85;margin-left:7px}
.fr-fwm-track{overflow:hidden}
.fr-fwm-marquee{display:flex;gap:14px;width:max-content;animation:fr-fwm-scroll 30s linear infinite}
.fr-fwm-marquee.reverse{animation:fr-fwm-scroll 30s linear infinite reverse}
@keyframes fr-fwm-scroll{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.fr-fwm-marquee:hover{animation-play-state:paused}
.fr-fwm-card{width:150px;flex-shrink:0;border-radius:10px;overflow:hidden;background:#fff;box-shadow:0 12px 30px -14px rgba(0,0,0,0.3);transition:transform 0.3s ease;display:block}
.fr-fwm-card:hover{transform:translateY(-4px)}
.fr-fwm-card img{width:100%;display:block;aspect-ratio:3/4;object-fit:cover;object-position:center top}
.fr-fwm-cta{text-align:center;padding:10px 20px 4px;flex-shrink:0}
.fr-fwm-buttons{display:flex;gap:12px;justify-content:center;flex-wrap:wrap}
.fr-fwm-btn{display:inline-block;background:#0a0a0a;color:#fff;padding:14px 30px;font-family:var(--serif);font-size:18px;letter-spacing:2px;text-decoration:none;border-radius:8px;transition:all 0.3s ease;box-shadow:0 10px 26px -8px rgba(0,0,0,0.4);border:2px solid #0a0a0a}
.fr-fwm-btn:hover{transform:translateY(-3px)}
.fr-fwm-btn small{display:block;font-family:var(--body);font-weight:600;font-size:8px;letter-spacing:1px;opacity:0.8;margin-top:2px}
.fr-fwm-btn-outline{background:transparent;color:#0a0a0a;box-shadow:none}
.fr-fwm-btn-outline:hover{background:#0a0a0a;color:#fff}
.fr-fwm-note{margin-top:10px;font-size:9px;letter-spacing:2px;text-transform:uppercase;color:#8c8880;font-weight:600}
@media(min-width:700px){.fr-fwm-card{width:175px}.fr-fwm-marquee{gap:18px}}
@media(prefers-reduced-motion:reduce){.fr-fwm-marquee{animation:none}}

/* SETLA product-page widget — ported 1:1 from setla-product-widget.liquid
   (same gradient, pill layout, and cents-based split math with the
   remainder folded into the last instalment, matching setla.4regn.com's
   own calculator). Fixed class names instead of the Liquid version's
   {{ section.id }}-suffixed ones -- only one PDP is ever mounted client-
   side at a time, so the uniqueness that guards against multiple Shopify
   sections on one page isn't needed here. */
.fr-setla-widget{margin-top:16px;padding:18px;border-radius:16px;background:linear-gradient(150deg,#068a1f,#045c14);font-family:var(--body);color:#fff}
.fr-setla-widget-label{display:flex;align-items:center;gap:9px;font-size:10.5px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:#fff;margin:0 0 14px}
.fr-setla-widget-mark{background:#0a0a0a;border-radius:7px;padding:4px 6px;display:flex;align-items:center;flex:0 0 auto;line-height:0}
.fr-setla-widget-mark img{height:12px;width:auto;display:block}
.fr-setla-widget-plan{margin:0 0 15px}
.fr-setla-widget-planrow{display:flex;align-items:baseline;justify-content:space-between;margin:0 0 8px}
.fr-setla-widget-planrow span{font-size:12px;color:rgba(255,255,255,0.78)}
.fr-setla-widget-planrow b{font-size:12px;font-weight:600;color:#fff}
.fr-setla-widget-pills{display:flex;gap:6px}
.fr-setla-widget-pill{flex:1;text-align:center;border-radius:999px;padding:10px 4px;border:1px solid rgba(255,255,255,0.32);background:rgba(255,255,255,0.08);color:#fff;font-size:12px}
.fr-setla-widget-pill.is-today{background:#fff;border-color:#fff;color:#045c14}
.fr-setla-widget-pill b{display:block;font-family:Georgia,"Times New Roman",serif;font-size:13px;font-weight:500}
.fr-setla-widget-pill small{display:block;font-size:8.6px;opacity:0.75;margin-top:2px;letter-spacing:0.03em}
.fr-setla-widget-foot{display:flex;align-items:center;justify-content:space-between;border-top:1px solid rgba(255,255,255,0.22);margin-top:4px;padding-top:14px;gap:10px}
.fr-setla-widget-foot span{font-size:10.5px;color:rgba(255,255,255,0.72)}
.fr-setla-widget-foot a{font-size:11.5px;font-weight:600;color:#fff;text-decoration:underline;text-underline-offset:3px}

/* Float BNPL widget container -- the widget itself renders its own DOM
   (see FloatWidget's own comment for why this is a plain imperative
   script-injection instead of a declarative <script> tag), so this file
   only owns the outer spacing, not the widget's internal styling. */
.fr-float-widget{margin-top:12px}

/* SHOP BY DEPARTMENT — clean editorial section matching the reference HTML:
   white background, slim borders, stacked men/women blocks, and circular
   category rails. */
.fr-sbd-section{background:#e8e8e8;border-top:1px solid #d9d9d9;border-bottom:1px solid #d9d9d9;padding:96px 0}
.fr-sbd-stack{display:flex;flex-direction:column;gap:76px}
.fr-sbd-block{max-width:1420px;margin:0 auto;width:100%}
.fr-sbd-header{display:flex;align-items:flex-end;justify-content:space-between;gap:24px;padding:0 32px 30px}
.fr-sbd-heading-wrap{min-width:0}
.fr-sbd-eyebrow{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#6d6d6d;margin:0 0 10px}
.fr-sbd-title{font-family:var(--body);font-size:clamp(34px,4.1vw,64px);line-height:.96;letter-spacing:-.05em;font-weight:700;margin:0;text-transform:uppercase;color:#080808}
.fr-sbd-viewall{font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;border-bottom:1px solid #050505;padding-bottom:4px;white-space:nowrap;flex-shrink:0;color:#050505;text-decoration:none}
.fr-sbd-rail{display:flex;gap:24px;overflow-x:auto;padding:0 max(32px,calc((100vw - 1420px)/2 + 32px)) 8px;scrollbar-width:none;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch}
.fr-sbd-rail::-webkit-scrollbar{display:none}
.fr-sbd-card{flex:0 0 156px;text-align:center;scroll-snap-align:start;text-decoration:none;color:inherit}
.fr-sbd-circle{width:156px;height:156px;border-radius:50%;overflow:hidden;background:#f3f3f3;margin-bottom:13px;border:1px solid #ededed;position:relative}
.fr-sbd-circle img{width:100%;height:100%;object-fit:cover;transition:transform .3s ease}
.fr-sbd-card:hover .fr-sbd-circle img{transform:scale(1.05)}
.fr-sbd-label{display:block;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase}
.fr-sbd-divider{height:1px;background:#dcdcdc;max-width:1420px;margin:0 auto}

@media(max-width:980px){
  .fr-sbd-section{padding:72px 0}
  .fr-sbd-stack{gap:54px}
  .fr-sbd-header{padding-left:18px;padding-right:18px}
  .fr-sbd-rail{padding-left:18px;padding-right:18px}
}

@media(max-width:620px){
  .fr-sbd-section{padding:58px 0}
  .fr-sbd-stack{gap:48px}
  .fr-sbd-header{display:flex;padding:0 14px 24px;align-items:flex-end}
  .fr-sbd-title{font-size:38px}
  .fr-sbd-rail{gap:16px;padding-left:14px;padding-right:14px}
  .fr-sbd-card{flex-basis:128px}
  .fr-sbd-circle{width:128px;height:128px}
  .fr-sbd-viewall{font-size:9px}
}

.fr-section{max-width:1360px;margin:0 auto;padding:64px 40px}
.fr-section-head{display:flex;align-items:center;justify-content:space-between;margin-bottom:32px;gap:20px;flex-wrap:wrap}
.fr-section-title{font-family:var(--serif);font-weight:700;font-size:clamp(24px,3vw,34px);color:var(--ink)}
.fr-sort-select{font-family:var(--body);font-size:12px;letter-spacing:0.5px;color:var(--ink);background:#fff;border:1px solid rgba(0,0,0,0.1);border-radius:8px;padding:8px 30px 8px 12px;cursor:pointer;outline:none;appearance:none;-webkit-appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%232e2a39'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.fr-count{font-family:var(--body);font-size:12px;color:rgba(46,42,57,0.55)}
.fr-search-page-bar{display:flex;gap:10px;margin-bottom:24px;max-width:480px}
.fr-search-page-input{flex:1;min-width:0;font-family:var(--body);font-size:14px;color:var(--ink);background:#fff;border:1px solid rgba(0,0,0,0.14);border-radius:8px;padding:11px 14px;outline:none}
.fr-search-page-input:focus{border-color:rgba(0,0,0,0.35)}
.fr-search-page-submit{font-family:var(--body);font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#fdfbf7;background:var(--ink);border:none;border-radius:8px;padding:0 22px;cursor:pointer}
.fr-search-page-empty{font-family:var(--body);font-size:14px;color:rgba(46,42,57,0.6);padding:40px 0}
.fr-coll-desc{font-family:var(--body);font-size:16px;line-height:1.65;color:rgba(46,42,57,0.78);max-width:820px;margin:28px 0 34px}
.fr-coll-desc p{margin:0 0 18px}.fr-coll-desc p:last-child{margin-bottom:0}.fr-coll-desc strong{font-weight:700}.fr-coll-desc em{font-style:italic}

.fr-coll-header{max-width:1360px;margin:0 auto;padding:56px 40px 8px;text-align:center}
.fr-coll-back{background:none;border:none;font-family:var(--body);font-size:12px;letter-spacing:1.5px;text-transform:uppercase;color:rgba(46,42,57,0.55);cursor:pointer;padding:0 0 18px;text-decoration:underline;text-underline-offset:3px}
.fr-coll-title{font-family:var(--serif);font-weight:700;font-size:clamp(32px,5vw,52px);color:var(--ink);margin-bottom:6px}
.fr-coll-count{font-family:var(--body);font-size:12px;color:rgba(46,42,57,0.55)}

.fr-cat-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:22px}
.fr-cat-viewall{display:inline-flex;align-items:center;gap:8px;padding:16px 36px;border:1.5px solid var(--ink);border-radius:var(--btn-radius);font-family:var(--body);font-size:13px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:var(--ink);text-decoration:none;transition:background 0.2s,color 0.2s}
.fr-cat-viewall:hover{background:var(--ink);color:#fff}
.fr-cat-card{background:#fff;border-radius:var(--card-radius);box-shadow:var(--card-shadow);overflow:hidden;cursor:pointer;border:none;padding:0;text-align:center;display:block;width:100%;font-family:var(--body)}
.fr-cat-img{width:100%;overflow:hidden;position:relative;min-height:160px;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
.fr-cat-img img{transition:transform 0.5s ease}
.fr-cat-card:hover .fr-cat-img img{transform:scale(1.05)}
.fr-cat-mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:700;font-size:22px;color:rgba(46,42,57,0.35);text-transform:capitalize}
.fr-cat-foot{padding:16px 14px 20px}
.fr-cat-name{font-family:var(--serif);font-weight:700;font-size:15px;color:var(--ink);margin-bottom:4px}
.fr-cat-count{font-size:11px;color:rgba(46,42,57,0.55)}

/* /collections index (mode="collections-index", fr-collgrid-*) -- matches
   the real 4regn.com "Collections" page, i.e. the real theme's own
   main-list-collections.liquid: a plain "Collections" heading (no eyebrow)
   over a warm-grey full-bleed section, and a simple 2/3-col full-bleed
   image-tile grid with a dark-overlay title on each tile. Deliberately not
   fr-cat-grid/fr-cat-card (the homepage's own, differently-styled, capped
   ~20-item "Shop by Collection" teaser, which stays untouched) and no
   longer the old compact row-list this page briefly used before. */
.fr-collgrid-page{background:#e8e6e3;padding:40px 0}
.fr-collgrid-heading{font-family:var(--serif);font-size:clamp(32px,5vw,52px);font-weight:400;font-style:italic;color:#111111;text-align:center;margin:0 0 32px}
.fr-collgrid{list-style:none;margin:0 auto;max-width:1360px;padding:0 20px;display:grid;grid-template-columns:repeat(2,1fr);gap:5px}
@media (min-width:750px){.fr-collgrid{grid-template-columns:repeat(3,1fr)}}
.fr-collgrid-item{position:relative;overflow:hidden;aspect-ratio:4/5;background-color:#e8e6e3}
.fr-collgrid-link{display:block;width:100%;height:100%;position:relative}
.fr-collgrid-img{width:100%;height:100%;object-fit:cover;display:block;transition:transform 1.5s ease}
.fr-collgrid-link:hover .fr-collgrid-img{transform:scale(1.05)}
.fr-collgrid-overlay{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(0,0,0,0.2);transition:background 0.3s ease}
.fr-collgrid-link:hover .fr-collgrid-overlay{background:rgba(0,0,0,0.35)}
.fr-collgrid-title{font-family:var(--serif) !important;font-size:clamp(1.4rem,3.5vw,2.8rem);color:#fff;text-transform:uppercase;font-style:italic;text-align:center;padding:0 15px;line-height:1.15}

.fr-pgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
.fr-pagination{display:flex;align-items:center;justify-content:center;gap:6px;margin-top:48px;flex-wrap:wrap}
.fr-pagination button{font-family:var(--body);font-size:13px;min-width:36px;height:36px;padding:0 8px;border-radius:8px;border:1px solid rgba(46,42,57,0.15);background:#fff;color:var(--ink);cursor:pointer;transition:all 0.15s}
.fr-pagination button:hover:not(:disabled){border-color:var(--ink);background:rgba(46,42,57,0.04)}
.fr-pagination button:disabled{opacity:0.35;cursor:default}
.fr-pagination button.is-active{background:var(--ink);border-color:var(--ink);color:#fff}
.fr-pagination-ellipsis{font-size:13px;color:rgba(46,42,57,0.4);padding:0 2px}
.fr-pcard{background:#fff;border-radius:var(--card-radius);box-shadow:var(--card-shadow);overflow:hidden;cursor:pointer;text-align:center;position:relative;transition:transform 0.2s}
.fr-pcard:hover{transform:translateY(-3px)}
.fr-pimg{width:100%;overflow:hidden;position:relative;min-height:160px;background:linear-gradient(140deg,#e7e2da,#cfc7bb)}
.fr-pimg img{transition:transform 0.5s ease}
.fr-pcard:hover .fr-pimg img{transform:scale(1.06)}
.fr-wish-btn{position:absolute;right:12px;top:12px;z-index:5;width:38px;height:38px;border-radius:50%;border:1px solid rgba(0,0,0,.08);background:rgba(255,255,255,.92);box-shadow:0 5px 16px rgba(0,0,0,.1);display:grid;place-items:center;cursor:pointer;color:#292735}.fr-wish-btn svg{width:19px;height:19px;fill:none;stroke:currentColor;stroke-width:1.8}.fr-wish-btn.active{background:#292735;color:#fff}.fr-wish-btn.active svg{fill:currentColor}.fr-pdp-main>.fr-wish-btn{left:auto;right:14px;top:14px}
.fr-wishlist{position:fixed;z-index:1002;top:0;right:0;height:100dvh;width:min(430px,100vw);background:#f6f6f4;box-shadow:-20px 0 50px rgba(0,0,0,.16);transform:translateX(105%);transition:transform .32s ease;display:flex;flex-direction:column}.fr-wishlist.open{transform:translateX(0)}.fr-wishlist-list{padding:15px;overflow:auto;display:grid;gap:10px}.fr-wishlist-item{display:grid;grid-template-columns:76px 1fr auto;gap:13px;align-items:center;padding:10px;background:#fff;border:1px solid #ddd;border-radius:13px;cursor:pointer}.fr-wishlist-item img{width:76px;height:92px;object-fit:cover;border-radius:8px;background:#eee}.fr-wishlist-item strong{font-size:12px;display:block;margin-bottom:7px}.fr-wishlist-item span{font-size:12px}.fr-wishlist-item button{border:0;background:none;font-size:20px;color:#888;cursor:pointer}.fr-wishlist-empty{padding:55px 25px;text-align:center;color:#777;font-size:12px;line-height:1.7}
.fr-p-mark{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-family:var(--serif);font-weight:700;font-size:26px;color:rgba(46,42,57,0.3)}
.fr-ptag{position:absolute;top:12px;left:12px;right:12px;z-index:2;font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:var(--cream);padding:4px 9px;border-radius:999px;background:var(--brown);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:fit-content;max-width:calc(100% - 68px)}
.fr-ptag.sale{background:var(--accent)}
.fr-ptag.soldout{background:#3a3a3a}
.fr-ptag-anniv{position:absolute;bottom:12px;left:12px;right:12px;z-index:2;font-size:8px;font-weight:700;letter-spacing:0.3px;text-transform:uppercase;color:var(--cream);padding:4px 9px;border-radius:999px;background:#000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:fit-content;max-width:100%}
.fr-pinfo{padding:18px 16px 22px}
.fr-pname{font-family:var(--serif);font-weight:700;font-size:16px;margin-bottom:8px;line-height:1.3;color:var(--ink)}
.fr-pprice{font-family:var(--body);font-size:14px;font-weight:700;color:var(--ink)}
.fr-pprice .was{font-size:12px;color:rgba(46,42,57,0.5);text-decoration:line-through;margin-right:6px;font-weight:400}
.fr-pwa{margin-top:12px;width:100%;background:var(--btn-bg);color:var(--btn-text);border:none;border-radius:var(--btn-radius);box-shadow:var(--btn-shadow);padding:10px;font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;cursor:pointer}
.fr-pwa:disabled,.fr-pdp-add:disabled,.fr-pdp-buynow:disabled{opacity:0.4;cursor:default;box-shadow:none}

/* Light/cream treatment -- matches 4regn's real "Join the 4REGN Family"
   section (light body background, not the dark "Stay in the know" style
   the rest of this template deliberately avoids outside the header/footer
   bookends). */
.fr-about{max-width:640px;margin:0 auto;padding:88px 40px 24px;text-align:left}
.fr-about-eyebrow{font-family:var(--body);font-size:11px;letter-spacing:3px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-bottom:18px}
.fr-about-heading{font-family:var(--serif);font-weight:700;font-size:clamp(32px,5vw,52px);color:var(--ink);margin-bottom:24px}
.fr-about-p{font-family:var(--body);font-size:15px;line-height:1.75;color:rgba(46,42,57,0.75);margin-bottom:20px;max-width:560px}
.fr-about-stats{display:flex;gap:48px;margin:32px 0 24px;padding-top:32px;border-top:1px solid rgba(0,0,0,0.1)}
.fr-about-stat-value{font-family:var(--serif);font-weight:700;font-size:clamp(28px,4vw,40px);color:var(--ink);line-height:1}
.fr-about-stat-label{font-family:var(--body);font-size:10px;letter-spacing:2px;text-transform:uppercase;color:rgba(46,42,57,0.5);margin-top:6px}
.fr-about-cta{display:inline-block;background:none;border:none;padding:0;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink);text-decoration:underline;text-underline-offset:5px;cursor:pointer}
/* No background override -- every other section (.fr-section, .fr-about)
   is transparent and just shows .fr-root's own --paper-grad through, this
   was the one exception explicitly painted a flat --cream, which read as
   a visibly different-colored block instead of a continuous page. */
.fr-newsletter{padding:88px 40px;text-align:center}
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
/* SETLA's logo mark is white -- invisible on the shared white card every
   other payment icon uses (reported directly: "makes the SETLA logo
   invisible"). Same card, just a black background for this one. */
.fr-pay-icon--setla{background:#000;border-color:#000}

.fr-modal-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:9999;display:flex;align-items:center;justify-content:center;padding:24px}
.fr-modal{background:#fff;border-radius:var(--card-radius);max-width:520px;width:100%;max-height:80vh;overflow-y:auto;padding:36px;position:relative;box-shadow:var(--card-shadow)}
.fr-modal-close{position:absolute;top:14px;right:14px;background:none;border:none;font-size:20px;color:var(--ink);cursor:pointer;padding:4px 8px;line-height:1}
.fr-modal h3{font-family:var(--serif);font-weight:700;font-size:22px;color:var(--ink);margin:0 0 16px}
.fr-modal p{font-size:14px;color:rgba(46,42,57,0.75);line-height:1.7;margin:0;white-space:pre-wrap}

.fr-search-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:1050;display:flex;align-items:flex-start;justify-content:center;padding:90px 24px 24px}
.fr-search-panel{background:#fff;border-radius:var(--card-radius);max-width:640px;width:100%;max-height:74vh;overflow:hidden;box-shadow:var(--card-shadow);display:flex;flex-direction:column}
.fr-search-bar{display:flex;align-items:center;gap:14px;padding:20px 24px;border-bottom:1px solid rgba(0,0,0,0.08);flex-shrink:0}
.fr-search-bar svg{flex-shrink:0;color:rgba(46,42,57,0.4)}
.fr-search-input{flex:1;min-width:0;border:none;outline:none;background:none;font-family:var(--serif);font-size:19px;color:var(--ink);-webkit-text-fill-color:var(--ink)}
.fr-search-input::placeholder{color:rgba(46,42,57,0.4)}
.fr-search-close{background:none;border:none;font-size:20px;color:rgba(46,42,57,0.5);cursor:pointer;padding:4px 6px;flex-shrink:0}
.fr-search-results{overflow-y:auto;padding:8px 12px}
.fr-search-empty,.fr-search-hint{padding:36px 12px;text-align:center;color:rgba(46,42,57,0.5);font-size:13px}
.fr-search-viewall{display:block;width:100%;text-align:left;background:none;border:none;border-bottom:1px solid rgba(0,0,0,0.08);padding:12px;margin-bottom:6px;font-family:var(--body);font-size:12px;letter-spacing:0.5px;color:var(--ink);font-weight:600;cursor:pointer}
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
/* Catalog accordion (mobile drawer) -- same button look as the top-level
   nav items above, but Catalog/each group toggle instead of navigating
   directly, revealing the next level nested and indented underneath. */
.fr-mm nav button.fr-mm-catalog-toggle,.fr-mm nav button.fr-mm-group-toggle{width:100%;display:flex;align-items:center;justify-content:space-between;gap:8px}
.fr-mm-chevron{display:inline-block;font-size:16px;transition:transform 0.2s;flex-shrink:0}
.fr-mm-chevron.open{transform:rotate(90deg)}
.fr-mm-catalog-groups{display:flex;flex-direction:column;padding-left:14px;border-left:1px solid rgba(253,251,247,0.14);margin-left:2px}
.fr-mm nav .fr-mm-catalog-groups button.fr-mm-group-toggle{font-size:12px;letter-spacing:1px;color:rgba(253,251,247,0.85)}
.fr-mm-group-items{display:flex;flex-direction:column;padding-left:14px;border-left:1px solid rgba(253,251,247,0.1);margin-left:2px}
.fr-mm nav .fr-mm-group-items button{padding:12px 0;font-size:11.5px;letter-spacing:0.8px;color:rgba(253,251,247,0.65);text-transform:none}
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
.fr-cart-import-note{background:rgba(214,71,53,0.06);border:1px solid rgba(214,71,53,0.18);border-radius:10px;padding:12px 14px;margin-bottom:16px}
.fr-cart-import-note strong{display:block;font-family:var(--body);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:var(--accent);margin-bottom:4px}
.fr-cart-import-note p{margin:0;font-size:12px;line-height:1.6;color:var(--ink)}
.fr-cart-import-note p strong{display:inline;font-size:12px;letter-spacing:normal;text-transform:none;color:var(--ink);margin:0}
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
.fr-pdp-desc{font-size:14px;line-height:1.7;color:rgba(46,42,57,0.75);margin:0 0 28px;font-style:italic}
.fr-pdp-desc-p{margin:0 0 14px}
.fr-pdp-desc-p:last-child{margin-bottom:0}
.fr-desc-table-wrap{overflow-x:auto;margin:0 0 20px;font-style:normal;border-radius:8px;border:1px solid rgba(0,0,0,0.08)}
.fr-desc-table{width:100%;border-collapse:collapse;font-size:12px}
.fr-desc-table th,.fr-desc-table td{padding:9px 12px;text-align:left;white-space:nowrap}
.fr-desc-table thead tr{background:var(--ink);color:#fff}
.fr-desc-table th{font-size:10px;font-weight:700;letter-spacing:1px;text-transform:uppercase}
.fr-desc-table tbody tr:nth-child(even){background:rgba(0,0,0,0.03)}
.fr-desc-table tbody td{border-top:1px solid rgba(0,0,0,0.06);color:var(--ink)}
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
.fr-pdp2-sizechart-btn{display:flex;align-items:center;gap:10px;width:100%;background:none;border:1.5px solid var(--ink);border-radius:var(--btn-radius);padding:15px 18px;margin:2px 0 20px;font-family:var(--body);font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:var(--ink);cursor:pointer;transition:background 0.2s}
.fr-pdp2-sizechart-btn:hover{background:rgba(0,0,0,0.03)}
.fr-pdp2-sizechart-btn span{flex:1;text-align:left}
.fr-pdp2-sizechart-chevron{flex-shrink:0;color:rgba(46,42,57,0.4)}

/* SIZE CHART MODAL content -- reuses fr-modal-overlay/fr-modal from the
   policy modal below for the overlay/close chrome. */
.fr-sc-tabs{display:flex;gap:4px;margin-bottom:18px;border-bottom:1px solid rgba(0,0,0,0.08)}
.fr-sc-tab{background:none;border:none;padding:8px 10px 12px;font-family:var(--body);font-size:11px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:rgba(46,42,57,0.5);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px}
.fr-sc-tab.active{color:var(--ink);border-bottom-color:var(--ink)}
.fr-sc-table-wrap{overflow-x:auto}
.fr-sc-table{width:100%;border-collapse:collapse;font-size:12px;font-family:var(--body)}
.fr-sc-table th,.fr-sc-table td{padding:9px 12px;text-align:left;border-bottom:1px solid rgba(0,0,0,0.06);white-space:nowrap;color:var(--ink)}
.fr-sc-table th{font-size:10px;letter-spacing:1px;text-transform:uppercase;color:rgba(46,42,57,0.5)}
.fr-sc-tip{margin:14px 0 0;font-size:12px;font-style:italic;color:rgba(46,42,57,0.6)}
.fr-sc-measure h4{font-family:var(--serif);font-weight:700;font-size:16px;margin:0 0 14px;color:var(--ink)}
.fr-sc-measure ol{margin:0;padding-left:20px;font-size:13px;line-height:1.85;color:rgba(46,42,57,0.75)}
.fr-sc-measure-diagrams{display:flex;gap:16px;margin-bottom:20px}
.fr-sc-measure-diagram{flex:1;min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px}
.fr-sc-measure-diagram img{width:100%;height:auto;border-radius:10px;border:1px solid rgba(0,0,0,0.06)}
.fr-sc-measure-diagram span{font-family:var(--body);font-size:10px;font-weight:700;letter-spacing:1.2px;text-transform:uppercase;color:rgba(46,42,57,0.5)}

/* COLLECTIONS INDEX (/collections) & POLICY PAGES (/policies/<policy>) */
.fr-policy-page{max-width:760px;margin:0 auto;padding:64px 40px 96px}
.fr-policy-title{font-family:var(--serif);font-weight:700;font-size:clamp(28px,4vw,40px);color:var(--ink);text-align:center;margin:0 0 32px}
.fr-policy-body{font-family:var(--body);font-size:14px;line-height:1.8;color:rgba(46,42,57,0.75)}
.fr-policy-body p{margin:0 0 18px}
.fr-policy-body p:last-child{margin-bottom:0}

/* Two independent iOS Safari bugs stacked on top of each other here, neither
   of which the earlier z-index/touch-action fixes touched:
   1) "position:fixed;inset:0" alone can size against the wrong viewport
      while Safari's dynamic address bar is animating/collapsed, leaving the
      box taller than what's actually visible and revealing black gaps top
      and bottom around the (correctly max-height:100%-constrained) image.
      "height:100dvh" (dynamic viewport height, iOS 15.4+) pins the box to
      whatever is truly on-screen right now instead of the stale layout
      viewport; kept "inset:0" for positioning since fixed/height together
      with top+bottom:0 is a well-defined over-constrained case (height
      wins, bottom is recomputed) -- min-height wouldn't have fixed this,
      since the buggy auto-height from inset:0 was already >= 100dvh, so a
      floor never kicks in; only clamping the actual height with "height"
      does.
   2) .fr-lb-nav/.fr-lb-dots were positioned with plain pixel offsets from
      the raw screen edge, which on a notch/Dynamic Island iPhone can land
      under the status bar / home-indicator area. "max(18px,
      env(safe-area-inset-*, 18px))" keeps the normal 18/24px gap on
      ordinary screens but grows to clear the safe area on notched ones.
      (Requires viewport-fit=cover on the page's viewport meta for the
      env() values to report non-zero -- see the 4regn PDP routes'
      viewport/generateViewport exports.)
   3) .fr-lb-close used to be position:fixed against the raw viewport too,
      which turned out to be a THIRD, worse iOS Safari bug on top of the
      other two: native pinch-zoom (touch-action:pinch-zoom on
      .fr-lb-stage, kept so visitors can zoom into a product photo) scales
      the VISUAL viewport, but a position:fixed element stays pinned to the
      LAYOUT viewport underneath it -- so once zoomed, the close button's
      on-screen position no longer matches where the CSS placed it, landing
      off-screen (reported directly: has to pinch back out repeatedly just
      to find it again) or letting scroll gestures fall through to the
      product page behind the fixed .fr-lb box instead of the lightbox
      (also reported: "stuck", scrolling the page while still looking at
      the image). Moved inside .fr-lb-stage as position:absolute instead --
      .fr-lb-stage isn't fixed, so it's ordinary zoomable layout content
      that pans/scales together with the image itself under pinch-zoom
      (same as every other non-fixed element on the page), staying
      reachable at any zoom level instead of independently pinned to a
      stale viewport. */
.fr-lb{position:fixed;inset:0;height:100dvh;z-index:1100;background:rgba(0,0,0,0.94);display:flex;align-items:center;justify-content:center;padding:16px}
.fr-lb-stage{position:relative;width:100%;height:100%;display:flex;align-items:center;justify-content:center;touch-action:pinch-zoom}
.fr-lb-img{max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;-webkit-user-select:none;user-select:none;pointer-events:none}
.fr-lb-close{position:absolute;top:max(12px, env(safe-area-inset-top, 12px));right:max(12px, env(safe-area-inset-right, 12px));width:44px;height:44px;border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.18);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);color:#fff;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;z-index:2}
.fr-lb-nav{position:fixed;top:50%;transform:translateY(-50%);width:48px;height:48px;border-radius:50%;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.18);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);color:#fff;font-size:28px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:0;padding-bottom:4px;z-index:2}
.fr-lb-prev{left:max(18px, env(safe-area-inset-left, 18px))}
.fr-lb-next{right:max(18px, env(safe-area-inset-right, 18px))}
.fr-lb-dots{position:fixed;bottom:max(24px, env(safe-area-inset-bottom, 24px));left:50%;transform:translateX(-50%);display:flex;gap:8px;align-items:center;padding:8px 12px;border-radius:100px;border:1px solid rgba(255,255,255,0.25);background:rgba(255,255,255,0.18);backdrop-filter:blur(12px) saturate(180%);-webkit-backdrop-filter:blur(12px) saturate(180%);z-index:2}
.fr-lb-dot{width:6px;height:6px;border-radius:50%;border:none;padding:0;background:rgba(255,255,255,0.35);cursor:pointer}
.fr-lb-dot.active{background:#fff;transform:scale(1.3)}

/* MOBILE BOTTOM DOCK — Home / Search / Cart / Account. Hidden on desktop;
   a light, semi-transparent "glass" pill fixed to the bottom of the
   viewport on mobile, matching the real 4regn.com mobile nav (a light
   gray backdrop behind a frosted near-white pill with dark text) -- the
   previous version here was a solid dark/black pill with light text,
   confirmed as a mismatch directly against the live reference site.
   No Wishlist icon -- that's a separate, not-yet-built feature. */
.fr-dock{display:none}
.fr-dock-item{position:relative;display:flex;flex:1;flex-direction:column;align-items:center;justify-content:center;gap:4px;background:none;border:none;color:rgba(46,42,57,0.5);cursor:pointer;padding:6px 4px;font-family:var(--body);font-size:9px;letter-spacing:0.5px;text-transform:uppercase;line-height:1}
.fr-dock-item.active{color:var(--ink)}
.fr-dock-count{position:absolute;top:4px;right:8px;min-width:14px;height:14px;padding:0 3px;border-radius:999px;background:var(--ink);color:#fff;font-size:8px;font-weight:700;display:flex;align-items:center;justify-content:center;font-family:var(--body)}

@media (max-width:900px){
  /* Keep the same 3-column "auto 1fr auto" track as desktop -- the middle
     column stays an empty flexible spacer even though .fr-nav-links itself
     is hidden below, which is what actually pushes the cart icon to the
     right edge. Swapping this to "auto auto 1fr" (as it was) put the
     flexible spacer *after* both real columns instead of between them, so
     the logo and cart icon collapsed together in the top-left with a dead
     empty gap on the right. */
  .fr-nav{padding:0 18px;grid-template-columns:auto 1fr auto;height:60px}
  .fr-hero{margin-top:-60px}
  .fr-burger{display:flex}
  .fr-logo{font-size:19px}
  /* Split the hamburger and logo apart on mobile: the burger stays alone in
     .fr-nav-left, and the logo re-appears centered inside .fr-nav-links
     (whose real nav-link children hide here) instead of being crammed next
     to the burger in the left corner. */
  .fr-nav-left .fr-logo{display:none}
  .fr-nav-links{display:flex}
  .fr-nav-link{display:none}
  .fr-nav-catalog{display:none}
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
  .fr-about{padding:56px 20px 16px}
  .fr-about-stats{gap:32px}
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
  .fr-dock{display:flex;position:fixed;left:0;right:0;bottom:0;width:100%;z-index:150;background:rgba(255,255,255,0.85);backdrop-filter:blur(14px) saturate(160%);-webkit-backdrop-filter:blur(14px) saturate(160%);border-top:1px solid rgba(0,0,0,0.06);padding:10px 4px max(10px, env(safe-area-inset-bottom, 10px));box-shadow:0 -6px 24px rgba(0,0,0,0.08);align-items:center;justify-content:space-around}
  .fr-search-overlay{padding:24px 14px}
  .fr-search-panel{max-height:88vh}
  .fr-search-bar{padding:16px 18px}
  .fr-search-input{font-size:17px}
}

/* "Recent purchase" popup -- ported verbatim from the live Shopify theme's
   snippets/regn-sales-popup.liquid (see FourRegnSalesPopup.tsx for the
   component + its own comment on what this widget actually does). Class
   names/z-index kept identical to the original so this is a faithful port,
   not a re-skin. */
#regn-popup-wrapper{position:fixed;top:80px;left:16px;z-index:99999;width:308px;opacity:0;transform:translateY(-12px) scale(0.97);transition:opacity 0.4s cubic-bezier(0.22,1,0.36,1),transform 0.4s cubic-bezier(0.22,1,0.36,1);pointer-events:none}
#regn-popup-wrapper.visible{opacity:1;transform:translateY(0) scale(1);pointer-events:all}
#regn-popup-link{display:block;text-decoration:none;border-radius:16px;position:relative}
#regn-popup-close{position:absolute;top:9px;right:9px;width:20px;height:20px;background:rgba(0,0,0,0.08);border:1px solid rgba(0,0,0,0.12);border-radius:50%;cursor:pointer;color:rgba(0,0,0,0.45);font-size:10px;display:flex;align-items:center;justify-content:center;transition:background 0.15s,color 0.15s;z-index:100000;line-height:1;padding:0}
#regn-popup-close:hover{background:rgba(0,0,0,0.15);color:#000}
#regn-popup-card{width:100%;background:rgba(255,255,255,0.75);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);border:1px solid rgba(255,255,255,0.9);border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.10),0 1px 0 rgba(255,255,255,1) inset;cursor:pointer;transition:background 0.2s}
#regn-popup-card:hover{background:rgba(255,255,255,0.88)}
.regn-popup-inner{display:flex;align-items:center;gap:12px;padding:13px 38px 13px 13px}
.regn-popup-img-wrap{width:56px;height:56px;border-radius:50%;overflow:hidden;flex-shrink:0;background:rgba(0,0,0,0.06);border:2px solid rgba(0,0,0,0.08);box-shadow:0 2px 8px rgba(0,0,0,0.08);display:flex;align-items:center;justify-content:center}
.regn-popup-img-wrap.loading::after{content:'';width:20px;height:20px;border:2px solid rgba(0,0,0,0.1);border-top-color:rgba(0,0,0,0.4);border-radius:50%;animation:regn-spin 0.7s linear infinite}
@keyframes regn-spin{to{transform:rotate(360deg)}}
.regn-popup-img{width:100%;height:100%;object-fit:cover;display:block}
.regn-popup-text{flex:1;min-width:0}
.regn-popup-who{font-size:12.5px;color:rgba(0,0,0,0.6);line-height:1.4}
.regn-popup-who strong{font-weight:700;color:#111111}
.regn-popup-product{font-size:13px;color:#111111;font-weight:700;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.01em}
.regn-popup-time{font-size:10.5px;color:rgba(0,0,0,0.4);margin-top:3px}
.regn-popup-progress{height:2px;background:rgba(0,0,0,0.06)}
.regn-popup-bar{height:100%;background:rgba(0,0,0,0.15);transform-origin:left}
.regn-popup-bar.running{animation:regn-drain var(--dur, 10s) linear forwards}
@keyframes regn-drain{from{transform:scaleX(1)}to{transform:scaleX(0)}}
@media(max-width:480px){#regn-popup-wrapper{left:10px;right:10px;width:auto;top:72px}}
      `}</style>

      <NavigationProgress active={isNavigating} />
      <div className="fr-root" onClick={handleInternalLinkClick}>
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
            <button
              className="fr-mm-catalog-toggle"
              onClick={() => setCatalogAccordionOpen((v) => !v)}
              aria-expanded={catalogAccordionOpen}
            >
              Catalog <span className={"fr-mm-chevron" + (catalogAccordionOpen ? " open" : "")}>›</span>
            </button>
            {catalogAccordionOpen && (
              <div className="fr-mm-catalog-groups">
                {CATALOG_MENU.map((group) => (
                  <div key={group.label} className="fr-mm-group">
                    {group.items ? (
                      <>
                        <button
                          className="fr-mm-group-toggle"
                          onClick={() => setMobileGroupOpen((g) => (g === group.label ? null : group.label))}
                          aria-expanded={mobileGroupOpen === group.label}
                        >
                          {group.label} <span className={"fr-mm-chevron" + (mobileGroupOpen === group.label ? " open" : "")}>›</span>
                        </button>
                        {mobileGroupOpen === group.label && (
                          <div className="fr-mm-group-items">
                            {group.items.map((item) => {
                              const href = catalogItemHref(group.label, item);
                              return (
                                <button key={item} onClick={() => { setMobileNavOpen(false); navigate(href); }}>
                                  {item}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </>
                    ) : (
                      <button
                        className="fr-mm-group-toggle"
                        onClick={() => { setMobileNavOpen(false); navigate(catalogItemHref(group.label, group.label)); }}
                      >
                        {group.label}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            <button onClick={() => { setMobileNavOpen(false); navigate(sp("/policies/contact")); }}>
              Contact
            </button>
            <button onClick={() => {
              setMobileNavOpen(false);
              window.open("https://track.4regn.com/", "_blank");
            }}>
              Track Your Order
            </button>
            <button onClick={() => { setMobileNavOpen(false); setCartOpen(true); }}>
              Cart ({cartCount})
            </button>
          </nav>
          <div className="fr-mm-foot">© {new Date().getFullYear()} {seller.store_name}</div>
        </aside>
        <div className={"fr-cart-overlay" + (wishlistOpen ? " open" : "")} onClick={() => setWishlistOpen(false)} />
        <aside className={"fr-wishlist" + (wishlistOpen ? " open" : "")} aria-label="Wishlist">
          <div className="fr-cart-h"><h3>Wishlist ({wishlist.length})</h3><button className="fr-cart-close" onClick={() => setWishlistOpen(false)}>✕</button></div>
          <div className="fr-wishlist-list">{wishlist.length ? wishlist.map((p) => <div className="fr-wishlist-item" key={p.id} onClick={() => { setWishlistOpen(false); navigate(sp(`/products/${p.handle || p.id}`)); }}>
            {p.image_url ? <img src={p.image_url} alt="" /> : <div />}
            <div><strong>{p.name}</strong><span>{fmt(p.price)}</span></div>
            <button onClick={(e) => { e.stopPropagation(); setWishlist((prev) => prev.filter((w) => w.id !== p.id)); fetch("/api/customer-account/wishlist", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: seller?.subdomain, productId: p.id }) }).catch(() => {}); }}>×</button>
          </div>) : <div className="fr-wishlist-empty">Your wishlist is waiting.<br/>Tap the heart on any product you love.</div>}</div>
        </aside>

        {/* CART */}
        <div className={"fr-cart-overlay" + (cartOpen ? " open" : "")} onClick={() => setCartOpen(false)} />
        <aside className={"fr-cart" + (cartOpen ? " open" : "")}>
          <div className="fr-cart-h">
            <h3>Your Cart</h3>
            <button className="fr-cart-close" onClick={() => setCartOpen(false)}>✕</button>
          </div>
          <div className="fr-cart-items">
            {cart.length === 0 ? (
              <div className="fr-cart-empty">
                <p style={{ fontSize: 13, letterSpacing: 0.5 }}>Your cart is empty</p>
              </div>
            ) : (
              cart.map((i, idx) => {
                const varStr = Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(" · ");
                const cartImg = resolveVariantImage(i.product, i.selectedVariants) || i.product.image_url;
                return (
                  <div key={idx} className="fr-cart-item">
                    <div className="fr-cart-item-img" style={cartImg ? { backgroundImage: `url("${cartImg}")` } : {}} />
                    <div>
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
              {cartHasImport && (
                <div className="fr-cart-import-note">
                  <strong>Delivery Note</strong>
                  <p>Your cart includes a premium product. Please allow <strong>7-14 working days</strong> for your full order to arrive.</p>
                </div>
              )}
              <div className="fr-cart-sub">
                <span className="fr-cart-sub-lbl">Subtotal</span>
                <span className="fr-cart-sub-amt">{fmt(cartTotal)}</span>
              </div>
              {automaticDiscount.applied.map((a) => (
                <div key={a.title} className="fr-cart-sub" style={{ marginTop: -4 }}>
                  <span className="fr-cart-sub-lbl" style={{ color: "#22c55e" }}>{a.title}</span>
                  <span style={{ color: "#22c55e", fontWeight: 700, fontSize: 13 }}>-{fmt(a.amount)}</span>
                </div>
              ))}
              {automaticDiscount.totalDiscount > 0 && (
                <div className="fr-cart-sub" style={{ marginTop: -4 }}>
                  <span className="fr-cart-sub-lbl" style={{ fontWeight: 800 }}>Total</span>
                  <span className="fr-cart-sub-amt" style={{ fontWeight: 800 }}>{fmt(Math.max(0, cartTotal - automaticDiscount.totalDiscount))}</span>
                </div>
              )}
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
            const baseImgs = (Array.isArray(p.images) && p.images.length > 0 ? p.images : [p.image_url]).filter(Boolean) as string[];
            // The full photo set for the currently-selected option (e.g.
            // every White photo) leads the gallery -- see
            // resolveVariantImages' own comment. Falls back to the plain
            // product gallery unchanged when nothing's selected yet or the
            // product has no per-value images at all.
            const variantImgs = resolveVariantImages(p, selectedVariants, activeImageDim);
            const allImgs = variantImgs?.length ? [...variantImgs, ...baseImgs.filter((img) => !variantImgs.includes(img))] : baseImgs;
            const onSale = p.old_price && p.old_price > p.price;
            return (
              <>
                <div className="fr-pdp-h">
                  <span className="fr-pdp-bread">{p.name}</span>
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
                    {p.description && <DescriptionText text={p.description} />}
                    {(Array.isArray(p.variants) ? p.variants : []).filter(v => Array.isArray(v.options) && v.options.length > 0).map((v) => (
                      <div className="fr-pdp-section" key={v.name}>
                        <div className="fr-pdp-section-lbl">{v.name}</div>
                        <div className="fr-size-row">
                          {v.options.map((opt) => (
                            <button
                              key={opt}
                              className={"fr-size-btn" + (selectedVariants[v.name] === opt ? " active" : "")}
                              onClick={() => { setSelectedVariants((prev) => ({ ...prev, [v.name]: opt })); setActiveImageDim(v.name); setVariantError(false); setActiveImg(0); }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {variantError && <div className="fr-pdp-err">Please select all options</div>}
                    <div className="fr-pdp-actions">
                      {p.in_stock === false ? (
                        <button className="fr-pdp-add" disabled>Sold Out</button>
                      ) : (
                        <>
                          <button className="fr-pdp-add" onClick={handleAddToCart}>
                            Add to Cart — {fmt(effectivePrice(p, selectedVariants) * localQty)}
                          </button>
                          <button className="fr-pdp-buynow" onClick={() => {
                            const validVariants = (Array.isArray(p.variants) ? p.variants : []).filter(v => Array.isArray(v.options) && v.options.length > 0);
                            const allSelected = validVariants.every((v) => selectedVariants[v.name]);
                            if (!allSelected && validVariants.length > 0) { setVariantError(true); return; }
                            const payload = [{ id: p.id, name: p.name, price: effectivePrice(p, selectedVariants), qty: localQty, variant: Object.entries(selectedVariants).map(([k, v]) => k + ": " + v).join(", "), image: resolveVariantImage(p, selectedVariants) || p.image_url || "", selectedVariants, tags: p.tags || [] }];
                            const encoded = btoa(JSON.stringify(payload));
                            window.location.href = sp(`/checkout?cart=${encoded}`);
                          }}>
                            Buy Now
                          </button>
                        </>
                      )}
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

        {/* "RECENT PURCHASE" POPUP -- same page scope as the live Shopify
            theme's own {% if template == 'index' or template.name ==
            'collection' %} guard around this snippet (theme.liquid). Not
            shown in edit mode -- a seller previewing their store in the
            dashboard iframe shouldn't see fabricated purchase notifications
            firing every 10s while they're trying to edit. */}
        {(isHomeView || isCollectionView) && !isEditMode && (
          <FourRegnSalesPopup slug={slug} isSubdomain={!!isSubdomain} />
        )}

        {/* NAV */}
        <nav className={"fr-nav" + (navOverHero ? " fr-nav--transparent" : "")}>
          <div className="fr-nav-left">
            <button className="fr-burger" onClick={() => setMobileNavOpen(true)} aria-label="Menu">
              <span /><span /><span />
            </button>
            {/* A re-run of the same real PageSpeed trace that flagged
                .fr-foot-logo (see that comment) showed this exact same
                logo file -- via this separate <img> instance in the nav --
                as the #1 offender all over again once the footer copy was
                fixed. Same treatment: next/image instead of a plain <img>.
                (.fr-logo img's own height:34px/width:auto CSS still governs
                final on-screen size either way.) */}
            <a href={sp()} className="fr-logo">
              {displayLogo ? <Image src={displayLogo} alt={seller.store_name} width={120} height={34} style={{ width: "auto" }} /> : seller.store_name}
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
              {displayLogo ? <Image src={displayLogo} alt={seller.store_name} width={120} height={34} style={{ width: "auto" }} /> : seller.store_name}
            </a>
            <div
              className="fr-nav-catalog"
              onMouseEnter={() => setCatalogHoverOpen(true)}
              onMouseLeave={() => setCatalogHoverOpen(false)}
            >
              <button
                type="button"
                className="fr-nav-link"
                onClick={() => setCatalogHoverOpen((v) => !v)}
                aria-expanded={catalogHoverOpen}
              >
                Catalog
              </button>
              {catalogHoverOpen && (
                <div className="fr-catalog-menu" onClick={() => setCatalogHoverOpen(false)}>
                  <div className="fr-catalog-menu-inner">
                    <div className="fr-catalog-group">
                      <a
                        className="fr-catalog-group-label fr-catalog-group-link"
                        href={sp("/collections")}
                        onClick={(e) => { e.preventDefault(); navigate(sp("/collections")); }}
                      >
                        View All Collections
                      </a>
                    </div>
                    {CATALOG_MENU.map((group) => (
                      <div key={group.label} className="fr-catalog-group">
                        {group.items ? (
                          <>
                            <span className="fr-catalog-group-label">{group.label}</span>
                            <ul>
                              {group.items.map((item) => (
                                <li key={item}>
                                  <a
                                    href={catalogItemHref(group.label, item)}
                                    onClick={(e) => { e.preventDefault(); navigate(catalogItemHref(group.label, item)); }}
                                  >
                                    {item}
                                  </a>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <a
                            className="fr-catalog-group-label fr-catalog-group-link"
                            href={catalogItemHref(group.label, group.label)}
                            onClick={(e) => { e.preventDefault(); navigate(catalogItemHref(group.label, group.label)); }}
                          >
                            {group.label}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <a href={sp("/policies/contact")} className="fr-nav-link" onClick={(e) => { e.preventDefault(); navigate(sp("/policies/contact")); }}>
              Contact
            </a>
            <a href="https://track.4regn.com/" target="_blank" rel="noreferrer" className="fr-nav-link">
              Track Your Order
            </a>
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
                {showHeroPill && <div className="fr-hero-pill">{heroPillLabel}</div>}
                {displayHeroLabel && <div className="fr-hero-label">{displayHeroLabel}</div>}
                {displayHeroOfferHeadline && (
                  <p className="fr-hero-offer">
                    {displayHeroOfferHeadline.split("\n").map((line, i, arr) => (
                      <Fragment key={i}>
                        {renderOfferLine(line, `offer-${i}`)}
                        {i < arr.length - 1 && <br />}
                      </Fragment>
                    ))}
                    {displayHeroOfferNote && <span className="fr-hero-offer-note">{displayHeroOfferNote}</span>}
                  </p>
                )}
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
                {displayHeroDisclaimer && <p className="fr-hero-disclaimer">{displayHeroDisclaimer}</p>}
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
                <h2 className="fr-setla-h1" aria-label="Buy now, pay later">
                  <span aria-hidden="true">
                    <span className="fr-setla-beat" style={{ animationDelay: "0s" }}>Buy</span>{" "}
                    <span className="fr-setla-beat" style={{ animationDelay: "0.5s" }}>now,</span>
                    <br />
                    <span className="fr-setla-beat" style={{ animationDelay: "1s" }}>Pay</span>{" "}
                    <span className="fr-setla-beat" style={{ animationDelay: "1.5s" }}>Later</span>
                  </span>
                </h2>
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

        {/* TICKER STRIP — only on landing page, sits right after the SETLA
            banner and before the rest of the homepage content, matching
            templates/index.json's real section order on the live store. */}
        {isHomeView && (
          <EditSection id="ticker-strip">
            <TickerStrip />
          </EditSection>
        )}

        {/* WINTER SALE MARQUEE — only on landing page, right after the
            ticker strip and before Winter Essentials, matching
            templates/index.json's real section order. Each row is scoped
            to one exact, confirmed-real collection (hoodies:
            "BACK & FRONT PRINTED HOODIES", tees: "OVERSIZED PREMIUM TEES"
            -- the actual Shopify Smart Collection titles behind
            hoodie_link/tee_link in the live section's own settings, not a
            loose text match) -- reported directly that the hoodie row was
            pulling in unrelated hoodie products under an earlier looser
            substring-match version of this. Dashboard-curated slides
            (Editor -> Winter Sale Marquee) win if set, same shape as
            Winter Essentials' own winter_essentials_slides; falls back to
            every product in that exact collection, in catalog order.
            Hides a row entirely if its collection currently has no
            products, same "hide empty collections" precedent as
            everywhere else in this file; hides the whole section only if
            BOTH rows are empty. */}
        {isHomeView && (() => {
          const resolveRow = (configuredSlides: string[] | undefined, exactCategory: string) => {
            const href = sp(`/collections/${collectionSlug(exactCategory)}`);
            if (configuredSlides && configuredSlides.length > 0) {
              const images = configuredSlides
                .map((entry) => (entry.startsWith("http") || entry.startsWith("/")) ? entry : products.find((p) => p.id === entry)?.image_url)
                .filter((url): url is string => !!url)
                .slice(0, 12);
              return { images, href };
            }
            const images = products.filter((p) => p.image_url && pInCat(p, exactCategory)).map((p) => p.image_url!).slice(0, 12);
            return { images, href };
          };
          const hoodie = resolveRow(config.winter_marquee_hoodie_slides, "BACK & FRONT PRINTED HOODIES");
          const tee = resolveRow(config.winter_marquee_tee_slides, "OVERSIZED PREMIUM TEES");
          if (hoodie.images.length === 0 && tee.images.length === 0) return null;
          return (
            <EditSection id="winter-sale-marquee">
              <WinterSaleMarquee hoodieImages={hoodie.images} teeImages={tee.images} hoodieHref={hoodie.href} teeHref={tee.href} />
            </EditSection>
          );
        })()}

        {/* WINTER ESSENTIALS COVERFLOW — only on landing page, right after
            the ticker strip. Images come from whatever products are
            actually tagged "WINTER ESSENTIALS" (see WinterCoverflow's own
            comment for why) -- renders nothing at all if that collection
            is currently empty, same "hide empty collections" precedent
            the rest of this file already follows elsewhere. All-caps to
            match this store's actual category value (confirmed against
            real product rows -- most of this store's own category tags
            are stored upper-case, e.g. "JACKETS"/"GRAPHIC HOODIES"). */}
        {isHomeView && (() => {
          // Dashboard-curated order/selection (Editor -> Winter Essentials)
          // wins if set -- each entry is either a product id (resolved
          // against this seller's current products, live, so a later photo
          // change stays correct) or a direct upload URL. Falls back to
          // every WINTER ESSENTIALS-tagged product in catalog order when
          // nothing's been curated yet.
          const configuredSlides = config.winter_essentials_slides;
          // Capped at 16 -- WinterCoverflow duplicates whatever it's given
          // to build the seamless-loop track (see its own comment), so an
          // uncapped list here doubles straight into <img> tag count. This
          // store's WINTER ESSENTIALS tag alone matches 80+ products;
          // rendering all of them (160+ <img> tags) on every single
          // homepage load was a real, confirmed hit to page weight and
          // Core Web Vitals, not just a theoretical one. 16 is already
          // generous for a coverflow no one scrubs through end to end.
          const images = (configuredSlides && configuredSlides.length > 0
            ? configuredSlides
                .map((entry) => (entry.startsWith("http") || entry.startsWith("/")) ? entry : products.find((p) => p.id === entry)?.image_url)
                .filter((url): url is string => !!url)
            : products.filter((p) => pInCat(p, "WINTER ESSENTIALS") && p.image_url).map((p) => p.image_url!)
          ).slice(0, 16);
          if (images.length === 0) return null;
          return (
            <EditSection id="winter-essentials">
              <WinterCoverflow
                images={images}
                href={sp(`/collections/${collectionSlug("WINTER ESSENTIALS")}`)}
                speed={config.winter_essentials_speed ?? 0.6}
              />
            </EditSection>
          );
        })()}

        {/* SHOP BY DEPARTMENT — landing-page section matched to the HTML
            reference you sent: clean editorial layout, slim borders, stacked
            department blocks, and circular category rails. */}
        {isHomeView && (() => {
          const configuredSlides = config.standard_graphic_hoodies_slides;
          const images = (configuredSlides && configuredSlides.length > 0
            ? configuredSlides
                .map((entry) => (entry.startsWith("http") || entry.startsWith("/")) ? entry : products.find((p) => p.id === entry)?.image_url)
                .filter((url): url is string => !!url)
            : products
                .filter((p) => pInCat(p, "STANDARD GRAPHIC HOODIES") && p.image_url)
                .map((p) => p.image_url!)
          ).slice(0, 12);
          if (images.length === 0) return null;
          return (
            <EditSection id="standard-graphic-hoodies">
              <StandardHoodieDeck
                images={images}
                href={sp("/collections/standard-graphic-hoodies")}
                interval={config.standard_graphic_hoodies_interval ?? 2200}
              />
            </EditSection>
          );
        })()}

        {showShopByGenderSection && (
          <EditSection id="shopbygender">
            <section className="fr-sbd-section">
              <div className="fr-sbd-stack">
                {sbgHasMen && (
                  <ShopByDepartmentBlock
                    title="Men."
                    departmentLabel={sbgEyebrow}
                    bucket={sbgMen}
                    catImage={catImage}
                    handleImgError={handleImgError}
                    hrefFor={(name) => sp(`/collections/${collectionSlug(name)}`)}
                    onNavigate={(name) => navigate(sp(`/collections/${collectionSlug(name)}`))}
                    viewAllLabel="Shop all men"
                  />
                )}
                {sbgHasMen && sbgHasWomen && <div className="fr-sbd-divider" aria-hidden="true" />}
                {sbgHasWomen && (
                  <ShopByDepartmentBlock
                    title="Women."
                    departmentLabel={sbgEyebrow}
                    bucket={sbgWomen}
                    catImage={catImage}
                    handleImgError={handleImgError}
                    hrefFor={(name) => sp(`/collections/${collectionSlug(name)}`)}
                    onNavigate={(name) => navigate(sp(`/collections/${collectionSlug(name)}`))}
                    viewAllLabel="Shop all women"
                  />
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
            {collectionName && config.collection_descriptions?.[collectionName] && (
              <div
                className="fr-coll-desc"
                dangerouslySetInnerHTML={{ __html: config.collection_descriptions[collectionName] }}
              />
            )}
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
          const baseImgs = (Array.isArray(p.images) && p.images.length > 0 ? p.images : [p.image_url]).filter(Boolean) as string[];
          // Same variant-leads-the-gallery logic as the slide-over PDP --
          // see resolveVariantImages' own comment.
          const variantImgs = resolveVariantImages(p, selectedVariants, activeImageDim);
          const allImgs = variantImgs?.length ? [...variantImgs, ...baseImgs.filter((img) => !variantImgs.includes(img))] : baseImgs;
          const onSale = p.old_price && p.old_price > p.price;
          const salePct = onSale ? Math.round((1 - p.price / p.old_price!) * 100) : 0;
          const pdpBadge = getProductPromoBadge(p);
          const pdpPromo = getProductPromo(p.id);
          const catTokens = (p.category || "").split(",").map((c) => c.trim()).filter(Boolean);
          // Skips a hidden collection (Dashboard -> Editor -> Collections'
          // Visible/Hidden toggle, hiddenCollectionsSet above) instead of
          // always taking catTokens[0] -- hiding a collection from
          // navigation/browsing but leaving every affected product's own
          // breadcrumb still announcing it defeats the point of hiding it.
          const firstRealCategory = catTokens.find((t) => !hiddenCollectionsSet.has(t)) || null;
          const sizeChartType = getSizeChartType(p);
          // Sourced from searchProducts (the lazy client-side catalog fetch
          // above), not `products` -- the server route no longer runs a
          // per-request related-products query, see searchProducts' own
          // comment for why.
          //
          // Ranked, not just "any shared category token, first 8 in
          // catalog order" (the old behaviour -- reported directly as
          // "awful": every product sharing even one broad token like
          // "Men" ranked identically to one sharing the exact same
          // sub-category, and since searchProducts never reorders, the
          // same 8 items showed up every single time regardless of fit).
          // Scored on: how many category tokens are shared (a product
          // matching 2 of 3 tokens is a better fit than one matching 1),
          // an extra bump for sharing the PRIMARY category specifically
          // (the strongest single signal), and shared tags (often a more
          // precise similarity signal than category alone, e.g. two
          // products both tagged "oversized-tee"). Ties are broken by
          // catalog order, same as before.
          const catTokenSet = new Set(catTokens);
          const pTagSet = new Set((p.tags || []).map((t) => t.toLowerCase()));
          const relatedProducts = (catTokens.length === 0 && pTagSet.size === 0)
            ? []
            : (searchProducts ?? [])
                .filter((rp) => rp.id !== p.id)
                .map((rp) => {
                  const rpCatTokens = (rp.category || "").split(",").map((c) => c.trim()).filter(Boolean);
                  const sharedCatCount = rpCatTokens.filter((t) => catTokenSet.has(t)).length;
                  const sharedTagCount = (rp.tags || []).filter((t) => pTagSet.has((t || "").toLowerCase())).length;
                  const primaryMatch = firstRealCategory && rpCatTokens.includes(firstRealCategory) ? 3 : 0;
                  const score = sharedCatCount + sharedTagCount * 2 + primaryMatch;
                  return { rp, score };
                })
                .filter((x) => x.score > 0)
                .sort((a, b) => b.score - a.score)
                .slice(0, 8)
                .map((x) => x.rp);
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
                      href={sp(`/collections/${collectionSlug(firstRealCategory)}`)}
                      onClick={(e) => { e.preventDefault(); navigate(sp(`/collections/${collectionSlug(firstRealCategory)}`)); }}
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
                      badges={<>
                        <button type="button" className={"fr-wish-btn" + (wishlist.some((w) => w.id === p.id) ? " active" : "")} aria-label="Toggle wishlist" onClick={(e) => { e.stopPropagation(); toggleWishlist(p); }}><svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg></button>
                        {p.in_stock === false ? (
                          <span className="fr-ptag soldout">Sold Out</span>
                        ) : (
                          <>
                            {pdpBadge && <span className="fr-ptag sale">{pdpBadge.label}</span>}
                            {!pdpBadge && pdpPromo && <span className="fr-ptag sale">{pdpPromo.type === "percentage" ? `-${pdpPromo.value}%` : "Sale"}</span>}
                            {!pdpBadge && !pdpPromo && onSale && <span className="fr-ptag sale">{`-${salePct}%`}</span>}
                            {showHeroPill && (pdpBadge || pdpPromo || onSale) && <span className="fr-ptag-anniv">{heroPillLabel}</span>}
                          </>
                        )}
                      </>}
                      alt={p.name}
                    />
                  </div>
                  <div className="fr-pdp-info">
                    <h1 className="fr-pdp-name">{p.name}</h1>
                    <div className="fr-pdp-prow">
                      <span className="fr-pdp-price">{fmt(effectivePrice(p, selectedVariants))}</span>
                      {onSale && <span className="fr-pdp-was">{fmt(p.old_price!)}</span>}
                    </div>
                    {p.description && <DescriptionText text={p.description} />}
                    {(Array.isArray(p.variants) ? p.variants : []).filter(v => Array.isArray(v.options) && v.options.length > 0).map((v) => (
                      <div className="fr-pdp-section" key={v.name}>
                        <div className="fr-pdp-section-lbl">{v.name}</div>
                        <div className="fr-size-row">
                          {v.options.map((opt) => (
                            <button
                              key={opt}
                              className={"fr-size-btn" + (selectedVariants[v.name] === opt ? " active" : "")}
                              onClick={() => { setSelectedVariants((prev) => ({ ...prev, [v.name]: opt })); setActiveImageDim(v.name); setVariantError(false); setActiveImg(0); }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    {sizeChartType && (
                      // Was a small underlined text link, easy to miss --
                      // matches the real site's own bordered, icon+chevron
                      // "SIZE CHART" button now (reported directly: "you can
                      // barely notice it on catalogstore" next to how
                      // prominent the same control is on 4regn.com).
                      <button
                        type="button"
                        className="fr-pdp2-sizechart-btn"
                        onClick={() => { setSizeChartTab("chart"); setSizeChartOpen(true); }}
                      >
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="10" rx="1"/><path d="M7 7v3M11 7v3M15 7v3"/></svg>
                        <span>Size Chart</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="fr-pdp2-sizechart-chevron"><path d="m9 6 6 6-6 6"/></svg>
                      </button>
                    )}
                    {variantError && <div className="fr-pdp-err">Please select all options</div>}
                    <div className="fr-pdp-actions">
                      {p.in_stock === false ? (
                        <button className="fr-pdp-add" disabled>Sold Out</button>
                      ) : (
                        <>
                          <button className="fr-pdp-add" onClick={() => addProductToCart(p)}>
                            Add to Cart — {fmt(effectivePrice(p, selectedVariants) * localQty)}
                          </button>
                          <button className="fr-pdp-buynow" onClick={() => buyNowFor(p)}>
                            Buy Now
                          </button>
                        </>
                      )}
                    </div>
                    <SetlaProductWidget price={effectivePrice(p, selectedVariants)} />
                    {/* FloatWidget temporarily disabled -- confirmed live that Float's
                        script renders its full onboarding/FAQ splash page instead of
                        the compact price-plan widget on this domain, taking over the
                        whole viewport. Almost certainly because merchant 17bb89-2 isn't
                        authorized for 4regn.catalogstore.co.za yet (it was presumably
                        set up against the original Shopify domain) -- needs whitelisting
                        in Float's own merchant dashboard before this can go back in.
                        The component itself is unchanged and ready; just re-add the
                        line below once that's sorted. */}
                    {/* <FloatWidget price={effectivePrice(p, selectedVariants)} /> */}
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
            (mode="collections-index"). Matches the real 4regn.com
            "Collections" page one-for-one: the real theme's own
            main-list-collections.liquid (Shopify's all-collections page
            template), a plain "Collections" heading with no eyebrow over a
            warm-grey full-bleed section, and a simple 2/3-col full-bleed
            image-tile grid with a dark-overlay title on each tile -- NOT
            the homepage's own separate "Shop by Collection" teaser section
            (different eyebrow/heading, capped ~20-item fr-cat-grid via
            renderCatTile, which stays completely untouched). No product
            count or sort control shown to the customer here; the real
            page's "sort" is a one-time merchant/theme-editor setting, so
            collectionsIndexList above is just fixed A-Z. */}
        {isCollectionsIndexView && (
          <EditSection id="collections">
            <div className="fr-collgrid-page">
              <h1 className="fr-collgrid-heading">Collections</h1>
              <ul className="fr-collgrid" role="list">
                {collectionsIndexList.map((cat) => {
                  const img = catImage(cat);
                  const target = sp(`/collections/${collectionSlug(cat)}`);
                  return (
                    <li key={cat} className="fr-collgrid-item">
                      <a
                        href={target}
                        className="fr-collgrid-link"
                        onClick={(e) => {
                          e.preventDefault();
                          // Edit mode: let the click bubble up to EditSection's
                          // own handler (opens the Collections panel) instead of
                          // navigating away to /collections/<collection> -- same guard
                          // goToProduct() already uses for product cards. Without
                          // this, every tile click here fired BOTH handlers (this
                          // one navigates first, since it's the innermost target;
                          // EditSection's postMessage fires right after on the
                          // same click) and the resulting navigation yanked the
                          // whole page out from under the editor before its panel
                          // could do anything useful -- reported as the "all
                          // collections" screen not responding to any edits.
                          if (isEditMode) return;
                          navigate(target);
                        }}
                      >
                        {img ? (
                          <>
                            <img src={img} alt={cat} loading="lazy" decoding="async" onError={handleImgError} className="fr-collgrid-img" />
                            <span className="fr-cat-mark" style={{ display: "none" }}>{cat}</span>
                            <div className="fr-collgrid-overlay">
                              <span className="fr-collgrid-title">{cat}</span>
                            </div>
                          </>
                        ) : <span className="fr-cat-mark">{cat}</span>}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </div>
          </EditSection>
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

        {/* COLLECTIONS GRID — only on landing page. id="collections" (not
            "categories") is load-bearing: it's what makes clicking this
            section in the dashboard preview open the Collections panel
            (reorder + cover image picker) -- a mismatched id here silently
            sends a section key the editor doesn't recognize, so nothing
            opens at all, which is exactly what made this un-editable. */}
        {isHomeView && categoryList.length > 0 && (
          <EditSection id="collections">
            <div className="fr-section" style={{ paddingBottom: 0 }}>
              <div className="fr-section-head">
                <h2 className="fr-section-title">Shop by Collection</h2>
              </div>
              <div className="fr-cat-grid">
                {categoryList.slice(0, 20).map(renderCatTile)}
              </div>
              {categoryList.length > 20 && (
                <div style={{ textAlign: "center", marginTop: 32 }}>
                  <a
                    href={sp("/collections")}
                    className="fr-cat-viewall"
                    onClick={(e) => { e.preventDefault(); navigate(sp("/collections")); }}
                  >
                    View All Collections →
                  </a>
                </div>
              )}
            </div>
          </EditSection>
        )}

        {/* PRODUCTS — collection page (or a store with no collections set
            up) gets a single flat, sortable grid. The homepage otherwise
            renders one titled row per collection instead of dumping every
            product into one undifferentiated wall. Not rendered at all for
            the dedicated product/collections-index/policy pages. */}
        {(isCollectionView || isSearchView) && ((isCollectionView || isSearchView) || !productGroups ? (
          <div id="fr-products" className="fr-section" style={{ paddingTop: (isCollectionView || isSearchView) ? 24 : undefined }}>
            {isSearchView && (
              <form
                className="fr-search-page-bar"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchQuery.trim();
                  if (q) navigate(sp(`/search?q=${encodeURIComponent(q)}`));
                }}
              >
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search products..."
                  aria-label="Search products"
                  className="fr-search-page-input"
                />
                <button type="submit" className="fr-search-page-submit">Search</button>
              </form>
            )}
            <div className="fr-section-head">
              <h2 className="fr-section-title">{isSearchView ? effectiveCategory : (effectiveCategory === "All" ? (liveProductsHeading ?? config.products_heading ?? "New Arrivals") : effectiveCategory)}</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                {isHomeView && (
                  <a
                    href={sp("/collections/all")}
                    onClick={(e) => { e.preventDefault(); navigate(sp("/collections/all")); }}
                    style={{ fontFamily: "var(--body)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}
                  >
                    View All Products
                  </a>
                )}
                <select
                  value={productSort}
                  onChange={(e) => {
                    // Collection/search view: sorting is done server-side
                    // against the WHOLE matched set, not just the page
                    // currently on screen -- so this re-navigates (resetting
                    // to page 1) rather than reordering the current page in
                    // place client-side.
                    if (isCollectionView) { setProductSort(e.target.value); navigateToProducts(buildCollectionHref(1, e.target.value)); }
                    else if (isSearchView) { setProductSort(e.target.value); navigateToProducts(buildSearchHref(1, e.target.value)); }
                    else setProductSort(e.target.value);
                  }}
                  className="fr-sort-select" aria-label="Sort products"
                >
                  <option value="default">Sort: Default</option>
                  <option value="latest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="az">A — Z</option>
                  <option value="za">Z — A</option>
                  <option value="price-low">Price: Low to High</option>
                  <option value="price-high">Price: High to Low</option>
                </select>
                <span className="fr-count">
                  {/* Collection/search view: filtered.length is just the
                      current page's count (up to PAGE_SIZE) -- show the
                      whole matched set's total instead, same as Shopify's
                      own collection/search pages do. */}
                  {(() => { const c = (isCollectionView || isSearchView) && totalProductCount != null ? totalProductCount : filtered.length; return <>{c} {c === 1 ? "product" : "products"}</>; })()}
                </span>
              </div>
            </div>
            {isSearchView && !initialSearchQuery?.trim() ? (
              <div className="fr-search-page-empty">Type a search term above to find products.</div>
            ) : isSearchView && filtered.length === 0 ? (
              <div className="fr-search-page-empty">No products match "{initialSearchQuery}".</div>
            ) : (
              <EditSection id="products">
                <div className="fr-pgrid">
                  {filtered.map((p, index) => <ProductCard key={p.id} p={p} priority={index < 4} />)}
                </div>
              </EditSection>
            )}
            {(isCollectionView || isSearchView) && totalPages > 1 && (
              <nav className="fr-pagination" aria-label={isSearchView ? "Search result pages" : "Collection pages"}>
                <button
                  type="button"
                  disabled={currentPage <= 1}
                  onClick={() => navigateToProducts((isSearchView ? buildSearchHref : buildCollectionHref)(currentPage - 1, productSort))}
                  onMouseEnter={() => currentPage > 1 && prefetchPath((isSearchView ? buildSearchHref : buildCollectionHref)(currentPage - 1, productSort))}
                  onTouchStart={() => currentPage > 1 && prefetchPath((isSearchView ? buildSearchHref : buildCollectionHref)(currentPage - 1, productSort))}
                  aria-label="Previous page"
                >‹</button>
                {(() => {
                  // Windowed page numbers (current ±2, always first/last),
                  // with an ellipsis standing in for any gap -- a large
                  // collection can be dozens of pages, so listing every one
                  // isn't practical.
                  const nums: (number | "…")[] = [];
                  const push = (n: number) => { if (nums[nums.length - 1] !== n) nums.push(n); };
                  push(1);
                  if (currentPage - 2 > 2) nums.push("…");
                  for (let n = Math.max(2, currentPage - 2); n <= Math.min(totalPages - 1, currentPage + 2); n++) push(n);
                  if (currentPage + 2 < totalPages - 1) nums.push("…");
                  if (totalPages > 1) push(totalPages);
                  return nums.map((n, i) =>
                    n === "…"
                      ? <span key={`e${i}`} className="fr-pagination-ellipsis" aria-hidden="true">…</span>
                      : (
                        <button
                          key={n}
                          type="button"
                          className={n === currentPage ? "is-active" : undefined}
                          aria-current={n === currentPage ? "page" : undefined}
                          onClick={() => n !== currentPage && navigateToProducts((isSearchView ? buildSearchHref : buildCollectionHref)(n, productSort))}
                          onMouseEnter={() => n !== currentPage && prefetchPath((isSearchView ? buildSearchHref : buildCollectionHref)(n, productSort))}
                          onTouchStart={() => n !== currentPage && prefetchPath((isSearchView ? buildSearchHref : buildCollectionHref)(n, productSort))}
                        >{n}</button>
                      )
                  );
                })()}
                <button
                  type="button"
                  disabled={currentPage >= totalPages}
                  onClick={() => navigateToProducts((isSearchView ? buildSearchHref : buildCollectionHref)(currentPage + 1, productSort))}
                  onMouseEnter={() => currentPage < totalPages && prefetchPath((isSearchView ? buildSearchHref : buildCollectionHref)(currentPage + 1, productSort))}
                  onTouchStart={() => currentPage < totalPages && prefetchPath((isSearchView ? buildSearchHref : buildCollectionHref)(currentPage + 1, productSort))}
                  aria-label="Next page"
                >›</button>
              </nav>
            )}
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
                            href={sp(`/collections/${collectionSlug(group.name!)}`)}
                            onClick={(e) => { e.preventDefault(); navigate(sp(`/collections/${collectionSlug(group.name!)}`)); }}
                            style={{ fontFamily: "var(--body)", fontSize: 12, letterSpacing: 1, textTransform: "uppercase", color: "var(--ink)", textDecoration: "underline", textUnderlineOffset: 3 }}
                          >
                            View All
                          </a>
                        )}
                        <span className="fr-count">{group.products.length} {group.products.length === 1 ? "product" : "products"}</span>
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

        {/* ABOUT — "Built for the Culture" brand story, only on landing
            page, directly above the newsletter (matches the real Shopify
            site's section order). */}
        {isHomeView && showAbout && (
          <EditSection id="about">
            <section className="fr-about">
              <div className="fr-about-eyebrow">{aboutEyebrow}</div>
              <h2 className="fr-about-heading">{aboutHeading}</h2>
              {aboutBody.split("\n\n").map((para, i) => <p key={i} className="fr-about-p">{para}</p>)}
              {(aboutStat1Value || aboutStat2Value) && (
                <div className="fr-about-stats">
                  {aboutStat1Value && (
                    <div className="fr-about-stat">
                      <div className="fr-about-stat-value">{aboutStat1Value}</div>
                      <div className="fr-about-stat-label">{aboutStat1Label}</div>
                    </div>
                  )}
                  {aboutStat2Value && (
                    <div className="fr-about-stat">
                      <div className="fr-about-stat-value">{aboutStat2Value}</div>
                      <div className="fr-about-stat-label">{aboutStat2Label}</div>
                    </div>
                  )}
                </div>
              )}
              {aboutCtaLabel && (
                <button type="button" className="fr-about-cta" onClick={() => setPolicyModal({ title: aboutHeading, content: aboutBody })}>
                  {aboutCtaLabel}
                </button>
              )}
            </section>
          </EditSection>
        )}

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
                  // Real PageSpeed trace flagged this as the single biggest
                  // image-payload offender on the whole homepage: a plain
                  // <img> shipping the raw uploaded logo (2885x1509, ~2.8MB)
                  // for a box rendered at 120x63 (.fr-foot-logo's own
                  // height:36px/max-width:180px). next/image resizes to
                  // what's actually displayed and serves WebP/AVIF instead.
                  ? <Image src={displayLogo} alt={seller.store_name} className="fr-foot-logo" width={180} height={36} style={{ width: "auto" }} />
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
                    const target = sp(`/collections/${cat === "All" ? "all" : collectionSlug(cat)}`);
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
                  {/* Was gated on payfast_enabled alone -- Visa/Mastercard/
                      Apple Pay/Capitec Pay are accepted by Yoco too (and
                      the "Yoco" logo itself makes no sense hidden behind a
                      DIFFERENT gateway's flag), so this whole card-brand
                      group vanished the moment a seller had Yoco on
                      without PayFast (reported directly: "only have setla
                      and float now" once 4regn's Yoco went live). Shows
                      whenever either card gateway is enabled. */}
                  {/* Real PageSpeed trace flagged every one of these --
                      up to 299KB PNGs (visa.png alone) for a badge
                      rendered at ~16px tall. next/image with each file's
                      real intrinsic dimensions (checked directly against
                      the files on disk) instead of a plain <img>; the same
                      height/width:auto/objectFit sizing as before is kept
                      via style so on-screen size is unchanged. */}
                  {(seller.checkout_config?.payfast_enabled || seller.checkout_config?.yoco_enabled) && (<>
                    <span className="fr-pay-icon" title="Visa"><Image src="/checkout/visa.png" alt="Visa" width={1568} height={585} style={{ height: 16, width: "auto", objectFit: "contain" }} /></span>
                    <span className="fr-pay-icon" title="Mastercard"><Image src="/checkout/mastercard.png" alt="Mastercard" width={1218} height={945} style={{ height: 16, width: "auto", objectFit: "contain" }} /></span>
                    <span className="fr-pay-icon" title="Apple Pay"><Image src="/checkout/applepay.png" alt="Apple Pay" width={1568} height={677} style={{ height: 14, width: "auto", objectFit: "contain" }} /></span>
                    <span className="fr-pay-icon" title="Yoco"><Image src="/checkout/yoco.png" alt="Yoco" width={484} height={200} style={{ height: 16, width: "auto", objectFit: "contain" }} /></span>
                    <span className="fr-pay-icon" title="Capitec Pay"><Image src="/checkout/capitecpay.png" alt="Capitec Pay" width={1441} height={585} style={{ height: 16, width: "auto", objectFit: "contain" }} /></span>
                  </>)}
                  {seller.checkout_config?.stitch_enabled && (
                    <span className="fr-pay-icon" title="Stitch"><Image src="/checkout/stitch.png" alt="Stitch" width={550} height={181} style={{ height: 16, width: "auto", objectFit: "contain" }} /></span>
                  )}
                  {showSetlaBanner && (
                    <span className="fr-pay-icon fr-pay-icon--setla" title="SETLA"><Image src="/setla/assets/setla-payments-logo.png" alt="SETLA" width={964} height={265} style={{ height: 12, width: "auto", objectFit: "contain" }} /></span>
                  )}
                  {/* Float: shown here to match the live Shopify store's own footer
                      (real accepted payment method there), even though the
                      on-page Float widget is currently disabled for this domain
                      -- see FloatWidget's own comment. The footer logo is just a
                      "we accept this" mark, not the interactive widget, so it's
                      unaffected by that domain-authorization issue. */}
                  <span className="fr-pay-icon" title="Float"><Image src="/checkout/float.png" alt="Float" width={360} height={188} style={{ height: 14, width: "auto", objectFit: "contain" }} /></span>
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

        {/* MOBILE BOTTOM DOCK */}
        <nav className="fr-dock" aria-label="Mobile navigation">
          <button type="button" className={"fr-dock-item" + (isHomeView ? " active" : "")} onClick={() => navigate(sp())}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="m3 11 9-8 9 8"/><path d="M5 10v10a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V10"/></svg>
            Home
          </button>
          <button type="button" className="fr-dock-item" onClick={() => setShowSearch(true)} aria-label="Search products">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
            Search
          </button>
          <button type="button" className="fr-dock-item" onClick={() => setWishlistOpen(true)} aria-label="Wishlist">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>
            {wishlist.length > 0 && <span className="fr-dock-count">{wishlist.length}</span>}
            Wishlist
          </button>
          <button type="button" className="fr-dock-item" onClick={() => setCartOpen(true)} aria-label="Cart">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
            {cartCount > 0 && <span className="fr-dock-count">{cartCount}</span>}
            Cart
          </button>
          <button type="button" className="fr-dock-item" onClick={() => navigate(sp("/account"))}>
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
                  <div className="fr-sc-measure-diagrams">
                    <div className="fr-sc-measure-diagram">
                      <Image src="/size-chart-measure-female.jpg" alt="Photo showing where to measure arm length, waist, hips and height on a female model" width={828} height={1530} />
                      <span>Women</span>
                    </div>
                    <div className="fr-sc-measure-diagram">
                      <Image src="/size-chart-measure-male.jpg" alt="Photo showing where to measure arm length, waist, hips and height on a male model" width={828} height={1530} />
                      <span>Men</span>
                    </div>
                  </div>
                  <ol>
                    <li><strong>1. Arm Length</strong> — Measure from the top of your shoulder down to your wrist.</li>
                    <li><strong>2. Waist</strong> — Measure the thinnest part of your waist.</li>
                    <li><strong>3. Hips</strong> — Measure the fullest part of your hips.</li>
                    <li><strong>4. Height</strong> — Measure your full height, standing straight.</li>
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
            <form
              className="fr-search-bar"
              onSubmit={(e) => {
                e.preventDefault();
                // Enter (or the header search icon on mobile, which submits
                // this same form): jump straight to the real, shareable
                // /search page instead of just filtering the popup -- lets
                // a seller type a query, copy the resulting URL, and send it
                // to a customer asking "do you have X," which the popup
                // alone (no URL of its own) couldn't do.
                const q = searchQuery.trim();
                if (!q) return;
                setShowSearch(false);
                navigate(sp(`/search?q=${encodeURIComponent(q)}`));
              }}
            >
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
            </form>
            <div className="fr-search-results">
              {(isHomeView || isProductView) && searchLoading && searchProducts === null ? (
                <div className="fr-search-hint">Loading products…</div>
              ) : searched === null ? (
                <div className="fr-search-hint">Start typing to search {seller.store_name}'s products.</div>
              ) : searched.length === 0 ? (
                <div className="fr-search-empty">No products match "{searchQuery.trim()}".</div>
              ) : (
                <>
                {searched.length > 12 && (
                  <button
                    type="button"
                    className="fr-search-viewall"
                    onClick={() => { setShowSearch(false); navigate(sp(`/search?q=${encodeURIComponent(searchQuery.trim())}`)); }}
                  >
                    View all {searched.length} results for "{searchQuery.trim()}" →
                  </button>
                )}
                {searched.slice(0, 12).map((p) => (
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
                    </div>
                    <div className="fr-search-item-price">{fmt(p.price)}</div>
                  </button>
                ))}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Renders a product description stored in the small custom markup
// htmlToDescriptionMarkup() (scripts/lib/migrate-shared.ts) produces:
// **bold**, __italic__, and [[color:VALUE]]...[[/color]] -- deliberately
// NOT real HTML, so this never touches dangerouslySetInnerHTML at all; even
// a bug in the tokenizer below can only ever produce a plain React element
// tree, never executable markup. A description with none of these markers
// (every description imported before this feature existed) just renders as
// plain paragraphs, which INLINE_MARKUP_RE naturally does nothing for --
// no separate "legacy" code path needed.
//
// Paragraphs come from blank lines (matching htmlToParagraphs()'s own
// paragraph-break convention); single newlines within a paragraph (used for
// pipe-separated table rows) become explicit <br/>s instead of relying on
// CSS white-space, so this can render as real elements instead of raw text.
const INLINE_MARKUP_RE = /\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|\[\[color:([^\]]+)\]\]([\s\S]+?)\[\[\/color\]\]/g;

function parseInlineMarkup(text: string, keyPrefix: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  let lastIndex = 0;
  let i = 0;
  // matchAll(), not a shared exec()/lastIndex loop -- INLINE_MARKUP_RE is a
  // single module-level regex, and this function recurses into each match's
  // own captured content (the strong/em/span children below) to handle
  // nested markup. A shared exec()/lastIndex loop breaks under that
  // recursion: every recursive call re-zeroes the SAME regex object's
  // lastIndex at its own top, so by the time it returns, the outer loop's
  // position is gone and its next exec() re-finds the first match from
  // scratch -- forever, for any description containing even one **bold**/
  // __italic__/[[color:]] token (deterministic infinite loop, not a rare
  // shape edge case -- confirmed as the real cause of this store's
  // product-page 500s, previously misread as a query-timeout/concurrency
  // issue because an infinite loop also runs out the platform's execution
  // budget and shows up as a slow, eventual crash). matchAll() creates its
  // own independent match iterator per call against the shared regex
  // object's source/flags, so recursive calls can't stomp on each other.
  for (const match of text.matchAll(INLINE_MARKUP_RE)) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = `${keyPrefix}-${i++}`;
    if (match[1] !== undefined) {
      nodes.push(<strong key={key}>{parseInlineMarkup(match[1], key)}</strong>);
    } else if (match[2] !== undefined) {
      nodes.push(<em key={key}>{parseInlineMarkup(match[2], key)}</em>);
    } else if (match[3] !== undefined && match[4] !== undefined) {
      nodes.push(<span key={key} style={{ color: match[3] }}>{parseInlineMarkup(match[4], key)}</span>);
    }
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

// A [[table]]/[[/table]]-wrapped paragraph (see htmlToDescriptionMarkup in
// scripts/lib/migrate-shared.ts) -- real Shopify size-chart tables, most
// commonly. First row is always the header (Shopify's own table exports are
// consistently <thead><tr><th>...) -- there's no separate marker for it, so
// this stays a fixed assumption rather than something the grammar needs to
// carry. Cells were joined with " | " on the way in for the same reason a
// tab character wasn't used there (see that function's comment); split back
// out the same way here.
function DescriptionTable({ rowsText, keyPrefix }: { rowsText: string; keyPrefix: string }) {
  const rows = rowsText.split("\n").filter((l) => l.trim()).map((line) => line.split(" | ").map((c) => c.trim()));
  if (!rows.length) return null;
  const [headerRow, ...bodyRows] = rows;
  return (
    <div className="fr-desc-table-wrap">
      <table className="fr-desc-table">
        <thead>
          <tr>{headerRow.map((cell, ci) => <th key={ci}>{parseInlineMarkup(cell, `${keyPrefix}-h-${ci}`)}</th>)}</tr>
        </thead>
        <tbody>
          {bodyRows.map((row, ri) => (
            <tr key={ri}>{row.map((cell, ci) => <td key={ci}>{parseInlineMarkup(cell, `${keyPrefix}-${ri}-${ci}`)}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DescriptionText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/);
  return (
    <div className="fr-pdp-desc">
      {paragraphs.map((para, pi) => {
        const trimmed = para.trim();
        // <table> is invalid inside a <p> (browsers/React would silently
        // break the DOM structure) -- table paragraphs render as a sibling
        // <div> instead of the shared <p> path below, which is also why the
        // outer wrapper here is a <div>, not a <p>, unlike before.
        if (trimmed.startsWith("[[table]]") && trimmed.endsWith("[[/table]]")) {
          const rowsText = trimmed.slice("[[table]]".length, -"[[/table]]".length);
          return <DescriptionTable key={pi} rowsText={rowsText} keyPrefix={`${pi}`} />;
        }
        return (
          <p key={pi} className="fr-pdp-desc-p">
            {para.split("\n").map((line, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {parseInlineMarkup(line, `${pi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

// Homepage ticker strip -- same 5 default items as the real site's
// ticker-strip.liquid section (not seller-editable yet, same as that
// section's own hardcoded settings defaults; wiring this into
// store_config would be the natural next step if 4regn wants to change
// the copy without a code change).
const TICKER_ITEMS = [
  "Trusted by 110,000+ Happy Customers",
  "Free Standard Delivery Nationwide",
  "Sale — Up to 50% Off",
  "Pay in 4 with SETLA",
  "Luxury Streetwear Brand",
];

function TickerStrip() {
  return (
    <div className="fr-ticker" aria-hidden="true">
      <div className="fr-ticker-track">
        {Array.from({ length: 4 }, (_, rep) =>
          TICKER_ITEMS.map((item, i) => (
            <span className="fr-ticker-item" key={`${rep}-${i}`}>
              {item}
              <span className="fr-ticker-gem">•</span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}

// "Winter Essentials" center-coverflow carousel -- ported from the real
// site's winter-essentials.liquid section: a continuously auto-scrolling
// strip of product cards where the one nearest the viewport's horizontal
// center scales up and the rest shrink toward the edges, looping
// seamlessly forever (no user interaction needed, though a click still
// goes to the collection). The Liquid version sources its slides from
// manually-picked "image block" uploads in the theme editor; this reads
// real, current product photos from whichever products are actually
// tagged into the "Winter Essentials" category instead (see the
// isHomeView render call below) -- no separate image-upload panel to
// build and keep in sync, and the carousel automatically reflects
// whatever's actually in stock rather than needing re-curating each
// season.
//
// Behavior ported 1:1 from the Liquid version's own <script>: the slide
// list is duplicated (2x) and the track's translateX position wraps at
// exactly half the duplicated track's width, so the loop point is
// invisible; per frame, each card's distance from the stage's horizontal
// center (as a 0-1 fraction of half the stage width) linearly interpolates
// its scale between centerScale and edgeScale. Diverges from the Liquid
// version in one place: prefers-reduced-motion actually freezes the
// animation loop here (the Liquid version only disabled a CSS transition
// that its own per-frame inline `transform` writes never used in the
// first place, so reduced-motion did nothing there).
function StandardHoodieDeck({ images, href, interval = 2200 }: { images: string[]; href: string; interval?: number }) {
  const [order, setOrder] = useState<number[]>(() => images.map((_, index) => index));
  const [flying, setFlying] = useState<number | null>(null);
  const orderRef = useRef(order);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const nextOrder = images.map((_, index) => index);
    orderRef.current = nextOrder;
    setOrder(nextOrder);
    setFlying(null);
  }, [images]);

  useEffect(() => {
    orderRef.current = order;
  }, [order]);

  useEffect(() => {
    if (images.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      const top = orderRef.current[0];
      if (top === undefined) return;
      setFlying(top);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = window.setTimeout(() => {
        setOrder((current) => current.length > 1 ? [...current.slice(1), current[0]] : current);
        setFlying(null);
      }, 700);
    }, Math.max(1000, interval));
    return () => {
      window.clearInterval(timer);
      if (timeoutRef.current !== null) window.clearTimeout(timeoutRef.current);
    };
  }, [images.length, interval]);

  if (images.length === 0) return null;
  return (
    <section className="fr-sdk">
      <div className="fr-sdk-wrap">
        <div className="fr-sdk-head">
          <div className="fr-sdk-eyebrow">Standard Graphic Hoodies</div>
          <h2 className="fr-sdk-title">WEAR THE CULTURE</h2>
          <div className="fr-sdk-deal">BUY 2 FOR R599</div>
        </div>
        <div className="fr-sdk-stage">
          {order.map((imageIndex, depth) => (
            <a
              key={imageIndex}
              href={href}
              className={`fr-sdk-card${flying === imageIndex ? " is-flying" : ""}`}
              style={{
                zIndex: order.length - depth,
                transform: `translateY(${depth * 8}px) scale(${Math.max(0.65, 1 - depth * 0.1).toFixed(3)})`,
                opacity: depth <= 4 ? 1 : 0,
                pointerEvents: depth === 0 ? "auto" : "none",
              }}
            >
              <Image
                src={images[imageIndex]}
                alt={`Standard Graphic Hoodie look ${imageIndex + 1}`}
                width={320}
                height={427}
                sizes="(max-width: 533px) 60vw, 320px"
              />
            </a>
          ))}
        </div>
        <div className="fr-sdk-cta">
          <a href={href} className="fr-sdk-btn">SHOP HOODIES</a>
          <div className="fr-sdk-note">Buy 2 For R599 · Ships Nationwide</div>
        </div>
      </div>
    </section>
  );
}

function WinterCoverflow({ images, href, speed = 0.6 }: { images: string[]; href: string; speed?: number }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const slides = images.length > 0 ? [...images, ...images] : [];

  useEffect(() => {
    const stage = stageRef.current;
    const track = trackRef.current;
    if (!stage || !track || slides.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const cards = Array.from(track.children) as HTMLElement[];
    const CENTER_SCALE = 1.1;
    const EDGE_SCALE = 0.6;
    const SPEED = speed;

    const sizeCards = () => {
      const vw = Math.min(window.innerWidth, 1200);
      const cw = Math.max(220, Math.min(360, vw * 0.42));
      cards.forEach((c) => c.style.setProperty("--cw", `${cw}px`));
    };
    sizeCards();

    let pos = 0;
    let half = 0;
    const measure = () => { half = cards[0].getBoundingClientRect().width * (cards.length / 2); };
    measure();

    let raf = 0;
    const frame = () => {
      pos += SPEED;
      if (pos >= half) pos -= half;
      track.style.transform = `translateX(${-pos}px)`;
      const stageRect = stage.getBoundingClientRect();
      const center = stageRect.left + stageRect.width / 2;
      cards.forEach((slide) => {
        const card = slide.firstElementChild as HTMLElement | null;
        if (!card) return;
        const r = slide.getBoundingClientRect();
        const sc = r.left + r.width / 2;
        let d = Math.abs(center - sc) / (stageRect.width / 2);
        if (d > 1) d = 1;
        const scale = Math.max(EDGE_SCALE, CENTER_SCALE - d * (CENTER_SCALE - EDGE_SCALE));
        card.style.setProperty("--s", scale.toFixed(3));
        card.style.zIndex = String(Math.round((1 - d) * 100));
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onResize = () => { sizeCards(); measure(); };
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [slides.length, speed]);

  if (images.length === 0) return null;

  return (
    <div className="fr-cef">
      <div className="fr-cef-head">
        <div className="fr-cef-eyebrow">Winter Essentials</div>
        <h2 className="fr-cef-title">BUNDLE UP.</h2>
        <div className="fr-cef-sub">7 YEAR ANNIVERSARY SALE — UP TO 70% OFF!</div>
      </div>
      <div className="fr-cef-stage" ref={stageRef}>
        <div className="fr-cef-track" ref={trackRef}>
          {slides.map((src, i) => (
            <div className="fr-cef-slide" key={i}>
              {/* Unlike the hero background/PDP badge images elsewhere in
                  this file, this one isn't decorative -- it's the only
                  content inside its own <a>, so an empty alt would leave
                  the link with no accessible name at all for screen readers
                  (and nothing for Google Image Search to index). There's no
                  per-slide label in `images` (just raw URLs), so this falls
                  back to the section's own heading context rather than
                  leaving it blank. */}
              {/* Real PageSpeed trace flagged this whole carousel as the
                  next-biggest image-payload offender after the footer logo
                  above -- 14 unique plain <img> slides (doubled for the
                  seamless-loop track, see slides below), each shipping the
                  raw ~828-2885px-wide uploaded photo for a card that only
                  ever renders 220-360px wide (sizeCards() below). next/image
                  resizes to what's actually on screen and serves WebP/AVIF;
                  `sizes` mirrors sizeCards()'s own `vw*0.42` clamp(220,360)
                  so the generated srcset matches the real rendered width. */}
              <a className="fr-cef-card" href={href}>
                <Image src={src} alt={`Winter Essentials look ${i + 1}`} width={360} height={480} sizes="(max-width: 524px) 42vw, (max-width: 857px) 220px, 360px" />
              </a>
            </div>
          ))}
        </div>
      </div>
      <div className="fr-cef-cta">
        <a href={href} className="fr-cef-btn">SHOP WINTER ESSENTIALS</a>
        <div className="fr-cef-note">Up to 70% Off · Anniversary Sale · Ships Nationwide</div>
      </div>
    </div>
  );
}

// Ported from the live Shopify theme's sections/4regn-winter-sale-landing.liquid
// ("4REGN Winter Marquee") -- two independent rows of product photos
// scrolling opposite directions (hoodies left, tees right), a deal pill
// per row, and two CTA buttons. Pure CSS animation (translateX -50% loop
// on a doubled list), unlike WinterCoverflow above -- the original section
// used a plain CSS keyframe marquee, not the scale/perspective JS effect
// WinterCoverflow has, so this stays that much simpler to match it.
// Copy/colors/links below are the REAL values from this store's own
// templates/index.json (not the section file's generic schema defaults --
// e.g. the schema's own default title is "STAY WARM. STAY" / "A LEGEND.",
// but the live site actually runs "STAY WARM." / "THIS WINTER").
function WinterSaleMarquee({ hoodieImages, teeImages, hoodieHref, teeHref }: { hoodieImages: string[]; teeImages: string[]; hoodieHref: string; teeHref: string }) {
  const hoodieSlides = hoodieImages.length > 0 ? [...hoodieImages, ...hoodieImages] : [];
  const teeSlides = teeImages.length > 0 ? [...teeImages, ...teeImages] : [];
  if (hoodieSlides.length === 0 && teeSlides.length === 0) return null;

  return (
    <div className="fr-fwm">
      <div className="fr-fwm-logo">4REGN</div>
      <div className="fr-fwm-hero">
        <div className="fr-fwm-eyebrow">Winter Drop</div>
        <h2 className="fr-fwm-title">STAY WARM. <span className="fr-fwm-thin">THIS WINTER</span></h2>
        <p className="fr-fwm-sub">Heavyweight hoodies and oversized premium tees repping the artists you love. Mix, match and save this winter.</p>
      </div>
      <div className="fr-fwm-rows">
        {hoodieSlides.length > 0 && (
          <div>
            <div className="fr-fwm-rowhead">
              <div className="fr-fwm-rowtitle">HOODIES</div>
              <span className="fr-fwm-deal">BUY 2 FOR R699<small>MIX ANY 2</small></span>
            </div>
            <div className="fr-fwm-track">
              <div className="fr-fwm-marquee">
                {hoodieSlides.map((src, i) => (
                  <a key={i} className="fr-fwm-card" href={hoodieHref}>
                    <Image src={src} alt={`Hoodie ${(i % hoodieImages.length) + 1}`} width={175} height={233} sizes="(max-width: 699px) 150px, 175px" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
        {teeSlides.length > 0 && (
          <div>
            <div className="fr-fwm-rowhead">
              <div className="fr-fwm-rowtitle">OVERSIZED PREMIUM TEES</div>
              <span className="fr-fwm-deal">BUY 2 GET 1 FREE<small>3 TEES FOR R700</small></span>
            </div>
            <div className="fr-fwm-track">
              <div className="fr-fwm-marquee reverse">
                {teeSlides.map((src, i) => (
                  <a key={i} className="fr-fwm-card" href={teeHref}>
                    <Image src={src} alt={`Oversized tee ${(i % teeImages.length) + 1}`} width={175} height={233} sizes="(max-width: 699px) 150px, 175px" />
                  </a>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
      <div className="fr-fwm-cta">
        <div className="fr-fwm-buttons">
          <a href={hoodieHref} className="fr-fwm-btn">SHOP HOODIES<small>2 FOR R699</small></a>
          <a href={teeHref} className="fr-fwm-btn fr-fwm-btn-outline">SHOP TEES<small>BUY 2 GET 1 FREE</small></a>
        </div>
        <div className="fr-fwm-note">Winter Only · Ships Nationwide</div>
      </div>
    </div>
  );
}

// SETLA "Pay in 4 / Pay half-half" product-page widget -- ported 1:1 from
// setla-product-widget.liquid (see that file's own comment for the design
// reasoning: solid SETLA-green so it reads as its own branded payment
// option instead of blending into the store). Cents-based math avoids the
// float-rounding drift plain Rand division would risk (e.g. an odd-cent
// price splitting unevenly) -- the leftover cent(s) from the integer
// division get folded into the LAST instalment, same as the Liquid
// version's own remainder handling.
function SetlaProductWidget({ price }: { price: number }) {
  if (!(price > 0)) return null;
  const cents = Math.round(price * 100);
  const fourBase = Math.floor(cents / 4);
  const fourRemainder = cents - fourBase * 4;
  const four = [fourBase, fourBase, fourBase, fourBase + fourRemainder].map((c) => c / 100);
  const halfBase = Math.floor(cents / 2);
  const halfRemainder = cents - halfBase * 2;
  const half = [halfBase, halfBase + halfRemainder].map((c) => c / 100);
  const r = (n: number) => n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <div className="fr-setla-widget">
      <p className="fr-setla-widget-label">
        <span className="fr-setla-widget-mark"><img src="/setla/assets/setla-payments-logo.png" alt="SETLA" /></span>
        Pay later with SETLA · 0% interest
      </p>
      <div className="fr-setla-widget-plan">
        <div className="fr-setla-widget-planrow"><span>Pay in 4</span><b>4 × R{r(four[0])}</b></div>
        <div className="fr-setla-widget-pills">
          <div className="fr-setla-widget-pill is-today"><b>R{r(four[0])}</b><small>TODAY</small></div>
          <div className="fr-setla-widget-pill"><b>R{r(four[1])}</b><small>2 WKS</small></div>
          <div className="fr-setla-widget-pill"><b>R{r(four[2])}</b><small>4 WKS</small></div>
          <div className="fr-setla-widget-pill"><b>R{r(four[3])}</b><small>6 WKS</small></div>
        </div>
      </div>
      <div className="fr-setla-widget-plan">
        <div className="fr-setla-widget-planrow"><span>Pay half / half</span><b>2 × R{r(half[0])}</b></div>
        <div className="fr-setla-widget-pills">
          <div className="fr-setla-widget-pill is-today"><b>R{r(half[0])}</b><small>TODAY</small></div>
          <div className="fr-setla-widget-pill"><b>R{r(half[1])}</b><small>30 DAYS</small></div>
        </div>
      </div>
      <div className="fr-setla-widget-foot">
        <span>Estimated for this item.</span>
        <a href="https://setla.4regn.com" target="_blank" rel="noopener noreferrer">Learn more about SETLA →</a>
      </div>
    </div>
  );
}

// Float (checkout.float.co.za) buy-now-pay-later widget -- same embed the
// live Shopify store uses, price baked into the script URL the same way
// (Shopify's version reads product.selected_or_first_available_variant.price
// once at render; this mirrors that by re-injecting the script whenever
// `price` changes instead of reacting to it declaratively). Plain
// imperative script injection via a ref, not a declarative <script src>
// JSX tag -- React doesn't reliably re-execute an external script when
// only its src changes on re-render, and this widget's price genuinely
// does change (variant selection), so the effect below removes and
// recreates the script element itself on every price change. The
// MutationObserver strips the widget's own "For orders over R0.01"
// boilerplate line exactly like the live store's own embed does (that
// text comes from Float's external script output, not something this
// app renders, so it can only be edited after the fact once it exists in
// the DOM).
function FloatWidget({ price }: { price: number }) {
  const containerRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !(price > 0)) return;
    container.innerHTML = "";
    const script = document.createElement("script");
    script.async = true;
    script.type = "application/javascript";
    script.src = `https://checkout.float.co.za/widgets/17bb89-2/float-details-widget?price=${price.toFixed(2)}`;
    container.appendChild(script);

    const stripBoilerplate = () => {
      container.querySelectorAll(".float-product-details .text > span").forEach((line) => {
        Array.from(line.childNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE && node.textContent?.includes("For orders over R0.01")) {
            node.textContent = node.textContent.replace(/\s*For orders over R0\.01/g, "");
          }
        });
      });
    };
    const observer = new MutationObserver(stripBoilerplate);
    observer.observe(container, { childList: true, subtree: true });
    stripBoilerplate();
    return () => {
      observer.disconnect();
      container.innerHTML = "";
    };
  }, [price]);
  return <div id="float-product-details-widget" className="fr-float-widget" ref={containerRef} />;
}

// PDP main image area, shared by the slide-over PDP and the dedicated
// full-page PDP -- replaces the old thumbnail-wall gallery (which pushed
// price/description far below the fold for products with 20-25+ images)
// with a single swipeable image, small prev/next overlay arrows, and a
// "n / total" counter badge. Swipe handling mirrors LightboxGallery's
// touch-swipe pattern (./FourRegnLightbox.tsx, same ~40px threshold), just
// against local touch state since this component doesn't own the active
// index itself.
function ProductGallery({ imgs, activeIndex, onIndexChange, onOpenLightbox, onImgError, alt, badges }: {
  imgs: string[];
  activeIndex: number;
  onIndexChange: (i: number) => void;
  onOpenLightbox: () => void;
  onImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  alt: string;
  badges?: React.ReactNode;
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
      {badges}
      {mainImg ? (
        <>
          <Image
            ref={imgRef}
            src={mainImg}
            alt={alt}
            fill
            sizes="(max-width: 900px) 100vw, 50vw"
            style={{ objectFit: "contain" }}
            // Only the image actually visible on first paint (index 0) --
            // this is the real LCP (Largest Contentful Paint) element on a
            // product page, so it should preload ahead of everything else
            // instead of competing on the same priority as offscreen/
            // not-yet-swiped-to images.
            priority={activeIndex === 0}
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
function ShopByDepartmentBlock({
  title,
  departmentLabel,
  bucket,
  catImage,
  handleImgError,
  hrefFor,
  onNavigate,
  viewAllLabel,
}: {
  title: string;
  departmentLabel: string;
  bucket: GenderBucket;
  catImage: (cat: string) => string | null;
  handleImgError: (e: React.SyntheticEvent<HTMLImageElement>) => void;
  hrefFor: (collectionName: string) => string;
  onNavigate: (collectionName: string) => void;
  viewAllLabel: string;
}) {
  return (
    <div className="fr-sbd-block">
      <div className="fr-sbd-header">
        <div className="fr-sbd-heading-wrap">
          <p className="fr-sbd-eyebrow">{departmentLabel}</p>
          <h3 className="fr-sbd-title">{title}</h3>
        </div>
        {bucket.shopAll && (
          <a
            href={hrefFor(bucket.shopAll)}
            className="fr-sbd-viewall"
            onClick={(e) => {
              e.preventDefault();
              onNavigate(bucket.shopAll!);
            }}
          >
            {viewAllLabel}
          </a>
        )}
      </div>
      <div className="fr-sbd-rail">
        {bucket.items.map((cat) => {
          const img = catImage(cat.name);
          return (
            <a
              key={cat.name}
              href={hrefFor(cat.name)}
              className="fr-sbd-card"
              onClick={(e) => {
                e.preventDefault();
                onNavigate(cat.name);
              }}
            >
              <div className="fr-sbd-circle">
                {img ? (
                  <>
                    <Image
                      src={img}
                      alt={cat.label}
                      fill
                      sizes="(max-width: 900px) 40vw, 156px"
                      style={{ objectFit: "cover" }}
                      onError={handleImgError}
                    />
                    <span className="fr-cat-mark" style={{ display: "none" }}>{cat.label}</span>
                  </>
                ) : (
                  <span className="fr-cat-mark">{cat.label}</span>
                )}
              </div>
              <span className="fr-sbd-label">{cat.label}</span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
