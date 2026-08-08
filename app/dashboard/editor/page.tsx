"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { revalidateStore } from "../../actions/revalidate-store";
import { canonicalStoreUrl } from "../../../lib/store-url";
import CtaTargetPicker, { type CtaTarget } from "../../components/CtaTargetPicker";
import FocalPointPicker from "../../components/FocalPointPicker";
import { effectiveStoreConfig, pickTemplateFields, omitTemplateFields } from "../../../lib/template-config";

// Mirror HeirloomStore's collectionSlug. Inlined (not imported) so the editor
// bundle doesn't have to drag the whole 1300-line storefront component just
// to compute a slug -- that was bloating the dashboard load.
const collectionSlug = (name: string) =>
  name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// Monoline SVG icon set. Replaces emoji (🏠 ✏️ 📱 🖥 etc.) which felt cheap
// against the dark/orange brand. All icons are 1.5px stroke at 20x20 viewBox,
// pure CSS-controllable via currentColor. One place to add new icons.
type IconName =
  | "announcement" | "logo" | "hero" | "ticker" | "circle" | "products"
  | "collections" | "policies" | "promise" | "about" | "testimonials"
  | "cta" | "trust" | "footer"
  | "desktop" | "mobile" | "pencil" | "image" | "external"
  | "arrow-left" | "check";

function EditorIcon({ name, size = 16, stroke = 1.5, className }: { name: IconName; size?: number; stroke?: number; className?: string }) {
  const common = {
    width: size, height: size, viewBox: "0 0 20 20", fill: "none",
    stroke: "currentColor", strokeWidth: stroke,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    className,
  };
  switch (name) {
    case "announcement": return <svg {...common}><path d="M15 4 5 8H3v4h2l10 4V4Z"/><path d="M16 7v6"/></svg>;
    case "logo": return <svg {...common}><circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3"/></svg>;
    case "hero": return <svg {...common}><path d="M3 9 10 3l7 6v8a1 1 0 0 1-1 1h-4v-6H8v6H4a1 1 0 0 1-1-1V9Z"/></svg>;
    case "ticker": return <svg {...common}><path d="M3 7h14"/><path d="M3 13h14"/><circle cx="6" cy="7" r="0.8"/><circle cx="14" cy="13" r="0.8"/></svg>;
    case "circle": return <svg {...common}><circle cx="6" cy="6" r="2.5"/><circle cx="14" cy="6" r="2.5"/><circle cx="6" cy="14" r="2.5"/><circle cx="14" cy="14" r="2.5"/></svg>;
    case "products": return <svg {...common}><path d="M4 6h12l-1 11H5L4 6Z"/><path d="M7 6V4a3 3 0 0 1 6 0v2"/></svg>;
    case "collections": return <svg {...common}><path d="M3 6a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"/></svg>;
    case "policies": return <svg {...common}><rect x="4" y="3" width="12" height="14" rx="1"/><path d="M7 7h6"/><path d="M7 10h6"/><path d="M7 13h4"/></svg>;
    case "promise": return <svg {...common}><path d="M10 3 3 7l7 4 7-4-7-4Z"/><path d="m3 11 7 4 7-4"/><path d="m3 15 7 4 7-4"/></svg>;
    case "about": return <svg {...common}><path d="M4 4h8a3 3 0 0 1 3 3v10H7a3 3 0 0 1-3-3V4Z"/><path d="M4 14a3 3 0 0 1 3-3h8"/></svg>;
    case "testimonials": return <svg {...common}><path d="M3 5a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1h-5l-3 3v-3H4a1 1 0 0 1-1-1V5Z"/></svg>;
    case "cta": return <svg {...common}><path d="M17 3 9 11"/><path d="M17 3v6"/><path d="M17 3h-6"/><path d="m6 14 1 3 3-3-2-2-2 2Z"/></svg>;
    case "trust": return <svg {...common}><path d="M10 3 4 5v5c0 4 2.5 6 6 7 3.5-1 6-3 6-7V5l-6-2Z"/><path d="m8 10 1.5 1.5L13 8"/></svg>;
    case "footer": return <svg {...common}><path d="m8 10 4-4a3 3 0 0 1 4 4l-2 2"/><path d="m12 10-4 4a3 3 0 0 1-4-4l2-2"/></svg>;
    case "desktop": return <svg {...common}><rect x="3" y="4" width="14" height="9" rx="1"/><path d="M7 17h6"/><path d="M10 13v4"/></svg>;
    case "mobile": return <svg {...common}><rect x="6" y="3" width="8" height="14" rx="1.5"/><circle cx="10" cy="14.5" r="0.6" fill="currentColor"/></svg>;
    case "pencil": return <svg {...common}><path d="m4 16 1-3 9-9a1.5 1.5 0 0 1 2.5 1.5l-9 9-3 1Z"/><path d="m12 5 2.5 2.5"/></svg>;
    case "image": return <svg {...common}><rect x="3" y="3" width="14" height="14" rx="1.5"/><circle cx="7" cy="7" r="1.2"/><path d="m3 14 5-4 4 3 5-5v9H3v-3Z"/></svg>;
    case "external": return <svg {...common}><path d="M7 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3"/><path d="M11 3h6v6"/><path d="m17 3-7 7"/></svg>;
    case "arrow-left": return <svg {...common}><path d="m11 5-5 5 5 5"/><path d="M16 10H6"/></svg>;
    case "check": return <svg {...common}><path d="m4 10 4 4 8-8"/></svg>;
  }
}

/* ─── TYPES ─── */
interface Seller {
  id: string; store_name: string; subdomain: string; template: string;
  tagline: string; description: string; logo_url: string; banner_url: string;
  whatsapp_number: string; primary_color: string; collections: string[];
  social_links?: { instagram?: string; tiktok?: string; whatsapp?: string; facebook?: string; twitter?: string };
  template_configs?: Record<string, any>;
  store_config: {
    announcement?: string;
    show_announcement?: boolean;
    trust_items?: { icon: string; title: string; desc: string }[];
    policy_items?: { title: string; desc: string; icon?: string }[];
    policies_heading?: string;
    policies_message?: string;
    policies_bg_image?: string;
    hero_subtext?: string;
    circle_title?: string;
    circle_subtitle?: string;
    products_label?: string;
    products_heading?: string;
    about_label?: string;
    about_title?: string;
    coll_label?: string;
    coll_subtitle?: string;
    collections_layout?: string;
    hero_image_position?: string;
    hero_image_behavior?: string;
    hero_layout?: string;
    hero_text_position?: string;
    hero_image_fade?: boolean;
    hero_split_image_2?: string;
    show_marquee?: boolean;
    show_collections?: boolean;
    hero_button_style?: string;
    hero_button_color?: string;
    hero_button_size?: string;
    hero_headline_style?: string;
    header_style?: string;
    show_newsletter?: boolean;
    newsletter_label?: string;
    newsletter_copyright?: string;
    ticker_texts?: string[];
    ticker_speed?: number;
    marquee_texts?: string[];
    marquee_speed?: number;
    bg_color?: string;
    hero_text_color?: string;
    circle_text_color?: string;
    products_text_color?: string;
    about_text_color?: string;
    coll_text_color?: string;
    cta_text_color?: string;
    trust_text_color?: string;
    promise_title?: string;
    promise_items?: { num: string; title: string; desc: string }[];
    promise_images?: (string | null)[];
    promise_label?: string;
    hero_image?: string;
    hero_video_url?: string;
    // Heirloom hero fields -- editor and storefront both read these.
    hero_index?: string;
    hero_label?: string;
    hero_headline?: string;
    hero_body?: string;
    hero_cta_primary?: string;
    hero_cta_secondary?: string;
    hero_cta_primary_target?: CtaTarget;
    hero_cta_secondary_target?: CtaTarget;
    // Heirloom footer
    footer_tagline?: string;
    footer_col1_label?: string;
    footer_col2_label?: string;
    footer_col3_label?: string;
    footer_support_links?: string[];
    footer_pay_links?: string[];
    hero_countdown_label?: string;
    hero_cta?: string;
    hero_title?: string;
    text_color?: string;
    muted_color?: string;
    font_pair?: string;
    header_transparent?: boolean;
    header_transparent_color?: string;
    header_border?: boolean;
    collection_images?: Record<string, string>;
    footer_about?: string;
    products_collapsed?: boolean;
    product_card_ratio?: string;
    collections_collapsed?: boolean;
    operating_hours_structured?: DayHours[];
  };
}

interface DayHours {
  day: string;
  status: "open" | "closed";
  open: string;
  close: string;
  lunch_start: string;
  lunch_end: string;
}

type ActiveSection =
  | "announcement" | "logo" | "hero" | "ticker" | "circle" | "products" | "collections"
  | "policies" | "promise" | "about" | "testimonials" | "cta" | "trust" | "footer" | "occasions"
  | "setla" | "newsletter" | "shopbygender" | "ticker-strip" | "winter-essentials"
  | null;

const SECTION_LABELS: Record<string, { icon: IconName; label: string }> = {
  announcement: { icon: "announcement", label: "Announcement Bar" },
  logo:         { icon: "logo",         label: "Store Logo" },
  hero:         { icon: "hero",         label: "Hero Section" },
  ticker:       { icon: "ticker",       label: "Marquee Ticker" },
  circle:       { icon: "circle",       label: "Browse by Category" },
  products:     { icon: "products",     label: "Products" },
  collections:  { icon: "collections",  label: "Collections" },
  policies:     { icon: "policies",     label: "Shipping & Policies" },
  promise:      { icon: "promise",      label: "Our Promise" },
  about:        { icon: "about",        label: "About / Story" },
  testimonials: { icon: "testimonials", label: "Testimonials" },
  cta:          { icon: "cta",          label: "Call to Action" },
  trust:        { icon: "trust",        label: "Trust Bar" },
  footer:       { icon: "footer",       label: "Footer" },
  occasions:    { icon: "circle",       label: "Shop by Occasion" },
  setla:        { icon: "cta",          label: "SETLA Promo Strip" },
  newsletter:   { icon: "cta",          label: "Newsletter" },
  shopbygender: { icon: "circle",       label: "Shop by Gender" },
  "ticker-strip":      { icon: "ticker", label: "4regn Ticker Strip" },
  "winter-essentials": { icon: "image",  label: "Winter Essentials" },
};

// Compact icon+label inline component for the chrome.
function SectionTag({ section, color = "rgba(245,245,245,0.6)" }: { section: keyof typeof SECTION_LABELS; color?: string }) {
  const s = SECTION_LABELS[section];
  if (!s) return null;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color }}>
      <EditorIcon name={s.icon} size={13} />
      <span>{s.label}</span>
    </span>
  );
}

export default function StoreEditor() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [seller, setSeller]           = useState<Seller | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);
  const [panelVisible, setPanelVisible]   = useState(false);
  // Some panels (Collections' per-item image/description/reorder list, for
  // one) genuinely outgrow the default floating popup's 520px/60vh box.
  // Lets a seller expand the panel to the full viewport instead of
  // scrolling a cramped inner box, then shrink it back to the normal
  // floating popup. Reset on every section switch -- expanding to edit one
  // section shouldn't silently carry over and full-screen the next
  // unrelated one someone clicks into.
  const [panelExpanded, setPanelExpanded] = useState(false);
  const [iframeReady, setIframeReady]     = useState(false);
  const [previewExpanded, setPreviewExpanded] = useState(false);
  const [deviceMode, setDeviceMode] = useState<"desktop" | "mobile">("desktop");
  // Landing-page template showcase phones are ~340-430px wide depending on
  // viewport; "expanded" mobile preview targets the wider end of that range
  // instead of the compact 390px default editing frame.
  const applyDeviceStyle = (mode: "desktop" | "mobile", expanded: boolean) => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    if (mode === "mobile") {
      iframe.style.width = expanded ? "430px" : "390px";
      iframe.style.margin = "0 auto";
      iframe.style.display = "block";
      iframe.style.borderRadius = expanded ? "32px" : "20px";
      iframe.style.border = expanded ? "10px solid #222" : "8px solid #222";
    } else {
      iframe.style.width = "100%";
      iframe.style.margin = "0";
      iframe.style.borderRadius = "0";
      iframe.style.border = "none";
    }
  };

  /* Local editable state */
  const [tagline, setTagline]           = useState("");
  const [description, setDescription]   = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [showAnnouncement, setShowAnnouncement] = useState(false);
  const [trustItems, setTrustItems]     = useState<{ icon: string; title: string; desc: string }[]>([]);
  const [testimonialText, setTestimonialText] = useState("I've been buying hair for years and nothing compares. Three months in and my bundles still look freshly installed. This is the one.");
  const [ctaHeadline, setCtaHeadline]         = useState("Your next look starts here");
  const [ctaSubtext, setCtaSubtext]           = useState("Browse our full collection and find the perfect bundles, closures, and frontals for your signature style.");
  const [aboutTitle, setAboutTitle]           = useState("");
  const [heroSubtext, setHeroSubtext]         = useState("Premium Hair Collection · SA Delivered");
  const [circleTitle, setCircleTitle]         = useState("Shop by Texture");
  const [circleSubtitle, setCircleSubtitle]   = useState("Find your signature look");
  const [productsLabel, setProductsLabel]     = useState("");
  const [productsHeading, setProductsHeading] = useState("");
  const [productCardRatio, setProductCardRatio] = useState("3/4");
  const [aboutLabel, setAboutLabel]           = useState("Our Story");
  const [collLabel, setCollLabel]             = useState("Featured Collections");
  const [collSubtitle, setCollSubtitle]       = useState("Find your signature look");
  const [collectionsLayout, setCollectionsLayout] = useState("lookbook");
  const [collOrder, setCollOrder]             = useState<string[]>([]);
  const [hiddenCollections, setHiddenCollections] = useState<string[]>([]);
  // Named "marquee" (not "ticker") to match the field the storefronts
  // actually render (store_config.marquee_texts) -- this used to save to a
  // disconnected `ticker_texts` field that Soft Luxury and Glass Chrome
  // never read, so editing "Promo Ticker" here had zero effect on either.
  // Still dual-writes ticker_texts on save so Crown/Heirloom (which read
  // that field) keep working without needing their own migration today.
  const [marqueeTexts, setMarqueeTexts]       = useState<string[]>(["FREE DELIVERY ON ORDERS OVER R800", "UP TO 35% SALE RUNNING", "NEW ARRIVALS JUST DROPPED"]);
  const [marqueeSpeed, setMarqueeSpeed]       = useState(20);
  const [bgColor, setBgColor]                 = useState("#f6f3ef");
  const [textColor, setTextColor]             = useState("#2a2a2e");
  const [mutedColor, setMutedColor]           = useState("#8a8690");
  const [heroTextColor, setHeroTextColor]     = useState("#f0e6d3");
  const [circleTextColor, setCircleTextColor] = useState("#f0e6d3");
  const [prodTextColor, setProdTextColor]     = useState("#f0e6d3");
  const [aboutTextColor, setAboutTextColor]   = useState("#f0e6d3");
  const [collTextColor, setCollTextColor]     = useState("#f0e6d3");
  const [ctaTextColor, setCtaTextColor]       = useState("#f0e6d3");
  const [trustTextColor, setTrustTextColor]     = useState("#f0e6d3");
  /* Footer colors default to "" (not a fixed hex) so an untouched seller
     keeps inheriting the site's bg/text/muted colors dynamically at
     render time, instead of a hardcoded value getting baked into
     store_config the next time they hit Save. */
  const [footerTextColor, setFooterTextColor]   = useState("");
  const [footerBgColor, setFooterBgColor]       = useState("");
  const [footerMutedColor, setFooterMutedColor] = useState("");
  const [promoBgColor, setPromoBgColor]         = useState("");
  const [promoBgStyle, setPromoBgStyle]         = useState<"glass" | "transparent" | "color">("glass");
  const [promoTextColor, setPromoTextColor]     = useState("");
  const [promoTimerColor, setPromoTimerColor]   = useState("");
  const [salePillColor, setSalePillColor]       = useState("");
  const [percentOffPillColor, setPercentOffPillColor] = useState("");
  const [showPercentOffPill, setShowPercentOffPill] = useState(true);
  const [promiseLabel, setPromiseLabel]         = useState("Our Promise");
  const [promiseTitle, setPromiseTitle]         = useState("Built on trust, delivered with care");
  const [promiseItems, setPromiseItems]         = useState([
    { num: "01", title: "Quality Materials", desc: "Every product carefully sourced and quality-checked before it ships to you." },
    { num: "02", title: "Fast Dispatch",      desc: "Orders placed before 1PM are dispatched same day. Nationwide delivery." },
    { num: "03", title: "Easy Returns",       desc: "Not happy? Return unopened items within 14 days — no questions asked." },
    { num: "04", title: "Secure Payment",     desc: "Pay safely via card, EFT, or WhatsApp. Your details are always protected." },
  ]);
  const [promiseImages, setPromiseImages]       = useState<(string|null)[]>([null,null,null,null]);
  const promiseImgRefs = [useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null), useRef<HTMLInputElement>(null)];
  const [logoFile, setLogoFile]         = useState<File | null>(null);
  const [logoPreview, setLogoPreview]   = useState("");
  const [heroImagePreview, setHeroImagePreview] = useState("");
  const [heroImageUrl, setHeroImageUrl]           = useState("");
  const [heroVideoUrl, setHeroVideoUrl]           = useState("");
  const [heroSplitImage2, setHeroSplitImage2]     = useState("");
  // Velour
  const [brandName, setBrandName] = useState("");
  const [brandSubtitle, setBrandSubtitle] = useState("");
  const [monogramLetters, setMonogramLetters] = useState("");
  const [velourCity, setVelourCity] = useState("");
  const [calloutAvailable, setCalloutAvailable] = useState(true);
  const [calloutArea, setCalloutArea] = useState("");
  const [hoursWeekdays, setHoursWeekdays] = useState("");
  const [hoursSaturday, setHoursSaturday] = useState("");
  const [hoursSunday, setHoursSunday] = useState("");
  const [accentColor, setAccentColor] = useState("");
  const [paymentMethods, setPaymentMethods] = useState<string[]>(["visa", "mastercard", "applepay", "googlepay", "eft"]);
  const [velourInstagram, setVelourInstagram] = useState("");
  const [velourTiktok, setVelourTiktok] = useState("");
  const [velourWhatsapp, setVelourWhatsapp] = useState("");
  const [heroImagePosition, setHeroImagePosition] = useState("center");
  const [heroImageBehavior, setHeroImageBehavior] = useState("still");
  const [heroLayout, setHeroLayout] = useState("default");
  const [heroTextPosition, setHeroTextPosition] = useState("bottom-left");
  const [heroImageFade, setHeroImageFade] = useState(true);
  const [showMarquee, setShowMarquee] = useState(true);
  const [showCollections, setShowCollections] = useState(true);
  const [heroButtonStyle, setHeroButtonStyle] = useState("outline");
  const [heroButtonColor, setHeroButtonColor] = useState("");
  const [heroButtonSize, setHeroButtonSize] = useState("md");
  const [heroHeadlineStyle, setHeroHeadlineStyle] = useState("elegant");
  const [headerStyle, setHeaderStyle] = useState("icons");
  const [showNewsletter, setShowNewsletter] = useState(false);
  const [newsletterLabel, setNewsletterLabel] = useState("Newsletter");
  const [newsletterCopyright, setNewsletterCopyright] = useState("");
  // 4regn's newsletter section ("Join the [Store] Family") -- title/sub
  // text, separate from Soft Luxury's label+copyright fields above.
  const [newsletterTitle, setNewsletterTitle] = useState("");
  const [newsletterSub, setNewsletterSub] = useState("");
  const heroImageRef = useRef<HTMLInputElement>(null);
  const setlaPhotoRef = useRef<HTMLInputElement>(null);
  const heroVideoRef = useRef<HTMLInputElement>(null);
  const heroSplitImage2Ref = useRef<HTMLInputElement>(null);
  const policiesBgRef = useRef<HTMLInputElement>(null);

  /* Heirloom-specific hero fields. The previous editor reused Crown's mapping
     (tagline -> headline, description -> subtitle) which was wrong for
     Heirloom -- it left the actual headline + eyebrow + label + CTA labels
     uneditable. These fields are independent and only surfaced in the hero
     panel when seller.template === "heirloom". */
  const [heroIndex, setHeroIndex]               = useState("");
  const [heroLabel, setHeroLabel]               = useState("");
  const [heroHeadline, setHeroHeadline]         = useState("");
  const [heroBody, setHeroBody]                 = useState("");
  const [heroCtaPrimary, setHeroCtaPrimary]     = useState("");
  const [heroCtaSecondary, setHeroCtaSecondary] = useState("");
  const [heroCtaPrimaryTarget, setHeroCtaPrimaryTarget]     = useState<CtaTarget>({ type: "products" });
  const [heroCtaSecondaryTarget, setHeroCtaSecondaryTarget] = useState<CtaTarget>({ type: "none" });

  /* Heirloom footer fields -- same pattern as the hero, template-aware. */
  const [footerTagline, setFooterTagline]             = useState("");
  const [footerCol1Label, setFooterCol1Label]         = useState("Shop");
  const [shippingPolicy, setShippingPolicy]           = useState("");
  const [returnPolicy, setReturnPolicy]               = useState("");
  // Global (not template-scoped) like shipping/return policy above -- same
  // popup-in-the-footer mechanism, just two more entries in it.
  const [privacyPolicy, setPrivacyPolicy]             = useState("");
  const [termsOfService, setTermsOfService]           = useState("");

  /* Editable label above the hero countdown timer. Empty string = default to
     `<CODE> ends in` from the active discount; sellers can override to e.g.
     "Limited drop ends in". */
  const [heroCountdownLabel, setHeroCountdownLabel]   = useState("");
  const [heroSaleHeadline, setHeroSaleHeadline]       = useState("");
  // 4regn hero pill -- e.g. "7 YEAR ANNIVERSARY SALE". Purely a manual
  // marketing label (opt-in, default off), unlike the per-product promo
  // badges imported from real Shopify discounts (product_promo_badges,
  // scripts/import-4regn-discounts.ts -- no dashboard UI for those yet).
  const [showHeroPill, setShowHeroPill] = useState(false);
  const [heroPillLabel, setHeroPillLabel] = useState("");
  const [heroDisclaimer, setHeroDisclaimer] = useState("");
  const [heroOfferHeadline, setHeroOfferHeadline] = useState("");
  const [heroOfferNote, setHeroOfferNote] = useState("");
  // 4regn About section ("Built for the Culture") -- separate state from
  // aboutLabel/aboutTitle/description below, which belong to the OTHER
  // templates' generic About panel and don't apply here.
  const [showAbout4regn, setShowAbout4regn] = useState(true);
  const [about4regnEyebrow, setAbout4regnEyebrow] = useState("");
  const [about4regnHeading, setAbout4regnHeading] = useState("");
  const [about4regnBody, setAbout4regnBody] = useState("");
  const [about4regnStat1Value, setAbout4regnStat1Value] = useState("");
  const [about4regnStat1Label, setAbout4regnStat1Label] = useState("");
  const [about4regnStat2Value, setAbout4regnStat2Value] = useState("");
  const [about4regnStat2Label, setAbout4regnStat2Label] = useState("");
  const [about4regnCtaLabel, setAbout4regnCtaLabel] = useState("");
  // 4regn SETLA promo strip
  const [showSetlaBanner, setShowSetlaBanner] = useState(true);
  const [setlaEyebrow, setSetlaEyebrow]       = useState("");
  const [setlaLead, setSetlaLead]             = useState("");
  const [setlaBadge, setSetlaBadge]           = useState("");
  const [setlaNote, setSetlaNote]             = useState("");
  const [setlaCtaPrimary, setSetlaCtaPrimary]     = useState("");
  const [setlaCtaSecondary, setSetlaCtaSecondary] = useState("");
  const [setlaPhotoUrl, setSetlaPhotoUrl]         = useState("");
  // 4regn Shop by Gender -- eyebrow/heading are the only editable copy; the
  // category tiles themselves are derived from the seller's real
  // `collections` list (Men.../Women... names), not editable settings here.
  const [showShopByGender, setShowShopByGender] = useState(true);
  const [shopByGenderEyebrow, setShopByGenderEyebrow] = useState("");
  const [shopByGenderHeading, setShopByGenderHeading] = useState("");
  const [heroCta, setHeroCta]                         = useState("");
  const [heroCtaTarget, setHeroCtaTarget]             = useState<CtaTarget>({ type: "products" });
  const [heroTitle, setHeroTitle]                     = useState("");
  const [fontPair, setFontPair]                       = useState("cormorant-jost");
  const [headerTransparent, setHeaderTransparent]     = useState(false);
  const [headerTransparentColor, setHeaderTransparentColor] = useState("#ffffff");
  const [headerBorder, setHeaderBorder]               = useState(true);
  const [collectionImages, setCollectionImages]       = useState<Record<string, string>>({});
  const [collectionDescriptions, setCollectionDescriptions] = useState<Record<string, string>>({});
  // Lazily-fetched (only once, when the Collections panel is first opened)
  // so every other editor section doesn't pay for a products query it
  // never needs. Just enough columns to render a "pick a cover from one of
  // this collection's own products" thumbnail picker.
  const [pickerProducts, setPickerProducts] = useState<{ id: string; name: string; image_url: string | null; category: string }[] | null>(null);
  const [coverPickerFor, setCoverPickerFor] = useState<string | null>(null);
  const [pickerLoading, setPickerLoading] = useState(false);
  const openCoverPicker = async (col: string) => {
    setCoverPickerFor(col);
    if (pickerProducts || !seller) return;
    setPickerLoading(true);
    const { data } = await supabase.from("products").select("id, name, image_url, category").eq("seller_id", seller.id).not("image_url", "is", null);
    setPickerProducts(data || []);
    setPickerLoading(false);
  };
  // Winter Essentials coverflow -- speed + an ordered slide list (product
  // ids mixed with direct upload URLs, see StoreConfig.winter_essentials_slides'
  // own comment). Shares pickerProducts with the Collections cover-image
  // picker (see the effect below, which also covers resolving thumbnails
  // for already-saved product-id slides -- not just the "add" picker).
  const [winterSpeed, setWinterSpeed] = useState(0.6);
  const [winterSlides, setWinterSlides] = useState<string[]>([]);
  const [winterPickerOpen, setWinterPickerOpen] = useState(false);
  const [winterDragIdx, setWinterDragIdx] = useState<number | null>(null);
  // Loads pickerProducts as soon as this panel opens (not just when the
  // "add" picker is clicked) -- already-saved product-id slides need it
  // too, to resolve their thumbnails.
  useEffect(() => {
    if (activeSection !== "winter-essentials" || pickerProducts || !seller) return;
    setPickerLoading(true);
    supabase.from("products").select("id, name, image_url, category").eq("seller_id", seller.id).not("image_url", "is", null)
      .then(({ data }) => { setPickerProducts(data || []); setPickerLoading(false); });
  }, [activeSection, pickerProducts, seller]);
  // pickerProducts is already ensured by the effect above whenever this
  // panel is open -- this just needs to toggle the picker grid itself.
  const loadWinterPicker = () => setWinterPickerOpen(v => !v);
  const [footerAbout, setFooterAbout]                 = useState("");
  const [productsCollapsed, setProductsCollapsed]     = useState(false);
  const [contactEmail, setContactEmail]               = useState("");
  const [contactPhone, setContactPhone]               = useState("");
  const [physicalAddress, setPhysicalAddress]         = useState("");
  const [operatingHours, setOperatingHours]           = useState("");
  const [policyItems, setPolicyItems]                 = useState<{ title: string; desc: string }[]>([]);
  const [collectionsCollapsed, setCollectionsCollapsed] = useState(false);

  const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  const DEFAULT_HOURS: DayHours[] = DAYS.map(d => ({ day: d, status: "open" as const, open: "09:00", close: "17:00", lunch_start: "", lunch_end: "" }));
  const [hoursStructured, setHoursStructured] = useState<DayHours[]>(DEFAULT_HOURS);

  const TIME_OPTIONS = (() => {
    const opts: string[] = [];
    for (let h = 0; h < 24; h++) for (let m = 0; m < 60; m += 30) opts.push(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`);
    return opts;
  })();

  const updateDayHours = (idx: number, patch: Partial<DayHours>) => {
    const u = [...hoursStructured];
    u[idx] = { ...u[idx], ...patch };
    setHoursStructured(u);
  };

  /* ─── LOAD ─── */
  useEffect(() => {
    (async () => {
      // getSession() is local; getUser() validates against Supabase (extra round-trip).
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.push("/login"); return; }
      // Explicit columns — only what the editor actually uses. Skipping the bigger
      // checkout_config / subscription_* / payfast_* fields keeps this row small.
      const { data: s } = await supabase.from("sellers").select("id, email, store_name, subdomain, template, tagline, description, logo_url, banner_url, whatsapp_number, primary_color, collections, social_links, store_config, template_configs, subscription_status").eq("email", user.email).single();
      if (!s) { router.push("/dashboard"); return; }
      if (s.subscription_status === "pending") { router.push("/dashboard/billing"); return; }
      setSeller(s);
      // Merge this template's saved customizations over the global fields --
      // see lib/template-config.ts. Falls back to the legacy flat
      // store_config for whichever template the seller was already on, so
      // nothing changes the moment this ships.
      const cfg: any = effectiveStoreConfig(s);
      setTagline(s.tagline || "");
      setDescription(s.description || "");
      setAnnouncement(cfg?.announcement || "");
      setShowAnnouncement(cfg?.show_announcement === true);
      setTrustItems(cfg?.trust_items || [
        { icon: "◆", title: "100% Human Hair", desc: "Every bundle tested before it ships" },
        { icon: "◆", title: "Fast Dispatch", desc: "Order before 1PM, ships same day" },
        { icon: "◆", title: "Easy Returns", desc: "14-day returns on unopened items" },
        { icon: "◆", title: "Real Support", desc: "WhatsApp us — we actually reply" },
      ]);
      setCollOrder(s.collections || []);
      if (cfg?.hero_subtext) setHeroSubtext(cfg.hero_subtext);
      if (cfg?.circle_title) setCircleTitle(cfg.circle_title);
      if (cfg?.circle_subtitle) setCircleSubtitle(cfg.circle_subtitle);
      const isSL = s.template === "soft-luxury" || s.template === "glass-futuristic";
      setProductsLabel(cfg?.products_label || (isSL ? "Browse" : "The Edit"));
      setProductsHeading(cfg?.products_heading || (isSL ? "All Collections" : "Latest arrivals"));
      if (cfg?.product_card_ratio) setProductCardRatio(cfg.product_card_ratio);
      if (cfg?.about_label) setAboutLabel(cfg.about_label);
      if (cfg?.about_title) setAboutTitle(cfg.about_title);
      setCollLabel(cfg?.coll_label || (isSL ? "Curated For You" : "Featured Collections"));
      setCollSubtitle(cfg?.coll_subtitle || (isSL ? "Shop by Collection" : "Find your signature look"));
      setCollectionsLayout(cfg?.collections_layout || "lookbook");
      setHeroImagePosition(cfg?.hero_image_position || "center");
      setHeroImageBehavior(cfg?.hero_image_behavior || "still");
      { const rawLayout = (cfg as any)?.hero_layout || "default";
        setHeroLayout(rawLayout === "centered" ? "default" : rawLayout);
        setHeroTextPosition((cfg as any)?.hero_text_position || (rawLayout === "centered" ? "center" : "bottom-left"));
      }
      setHeroImageFade((cfg as any)?.hero_image_fade !== false);
      setShowMarquee(cfg?.show_marquee !== false);
      setShowCollections(cfg?.show_collections !== false);
      setHeroButtonStyle((cfg as any)?.hero_button_style || "outline");
      setHeroButtonColor((cfg as any)?.hero_button_color || "");
      setHeroButtonSize((cfg as any)?.hero_button_size || "md");
      setHeroHeadlineStyle((cfg as any)?.hero_headline_style || "elegant");
      setHeaderStyle((cfg as any)?.header_style || "icons");
      // Soft Luxury's newsletter is opt-in (defaults off, per its own
      // wording: "Show email signup..."). 4regn's real storefront always
      // shows its newsletter signup, so it's opt-out instead -- defaults on
      // unless a seller has explicitly switched it off. Using the same
      // "=== true" default for both templates was the actual bug behind it
      // never showing on 4regn: this editor's Save button always writes
      // show_newsletter for whichever template is currently selected (see
      // `editedFields` below), so simply opening the editor and saving any
      // unrelated change -- on a store that had never touched this toggle --
      // silently persisted `show_newsletter: false` into 4regn's saved
      // config every time, permanently hiding a section that was supposed
      // to default to visible.
      setShowNewsletter(s.template === "4regn" ? (cfg as any)?.show_newsletter !== false : (cfg as any)?.show_newsletter === true);
      setNewsletterLabel((cfg as any)?.newsletter_label || "Newsletter");
      setNewsletterCopyright((cfg as any)?.newsletter_copyright || "");
      setNewsletterTitle((cfg as any)?.newsletter_title || "");
      setNewsletterSub((cfg as any)?.newsletter_sub || "");
      if (cfg?.marquee_texts?.length) setMarqueeTexts(cfg.marquee_texts);
      else if (cfg?.ticker_texts?.length) setMarqueeTexts(cfg.ticker_texts);
      if (cfg?.marquee_speed) setMarqueeSpeed(cfg.marquee_speed);
      else if (cfg?.ticker_speed) setMarqueeSpeed(cfg.ticker_speed);
      if (cfg?.bg_color) setBgColor(cfg.bg_color);
      if (cfg?.text_color) setTextColor(cfg.text_color);
      if (cfg?.muted_color) setMutedColor(cfg.muted_color);
      if (cfg?.hero_text_color) setHeroTextColor(cfg.hero_text_color);
      if (cfg?.circle_text_color) setCircleTextColor(cfg.circle_text_color);
      if (cfg?.products_text_color) setProdTextColor(cfg.products_text_color);
      if (cfg?.about_text_color) setAboutTextColor(cfg.about_text_color);
      if (cfg?.coll_text_color) setCollTextColor(cfg.coll_text_color);
      if (cfg?.cta_text_color) setCtaTextColor(cfg.cta_text_color);
      if (cfg?.trust_text_color) setTrustTextColor(cfg.trust_text_color);
      if (cfg?.footer_text_color) setFooterTextColor(cfg.footer_text_color);
      if (cfg?.footer_bg_color) setFooterBgColor(cfg.footer_bg_color);
      if (cfg?.footer_muted_color) setFooterMutedColor(cfg.footer_muted_color);
      if (cfg?.promo_bg_color) setPromoBgColor(cfg.promo_bg_color);
      if (cfg?.promo_bg_style) setPromoBgStyle(cfg.promo_bg_style);
      if (cfg?.promo_text_color) setPromoTextColor(cfg.promo_text_color);
      if (cfg?.promo_timer_color) setPromoTimerColor(cfg.promo_timer_color);
      if (cfg?.sale_pill_color) setSalePillColor(cfg.sale_pill_color);
      if (cfg?.percent_off_pill_color) setPercentOffPillColor(cfg.percent_off_pill_color);
      if (cfg?.show_percent_off_pill === false) setShowPercentOffPill(false);
      if (cfg?.promise_label) setPromiseLabel(cfg.promise_label);
      if (cfg?.promise_title) setPromiseTitle(cfg.promise_title);
      if (cfg?.promise_items?.length) setPromiseItems(cfg.promise_items);
      if (cfg?.promise_images) setPromiseImages(cfg.promise_images);
      setLogoPreview(s.logo_url || "");
      setHeroImagePreview(cfg?.hero_image || "");
      setHeroImageUrl(cfg?.hero_image || "");
      setHeroVideoUrl((cfg as any)?.hero_video_url || "");
      setHeroSplitImage2((cfg as any)?.hero_split_image_2 || "");
      setBrandName((cfg as any)?.brand_name ?? s.store_name ?? "");
      setBrandSubtitle((cfg as any)?.brand_subtitle || "");
      setMonogramLetters((cfg as any)?.monogram_letters || "");
      setVelourCity((cfg as any)?.city || "");
      setCalloutAvailable((cfg as any)?.callout_available !== false);
      setCalloutArea((cfg as any)?.callout_area || "");
      setHoursWeekdays((cfg as any)?.business_hours?.weekdays || "");
      setHoursSaturday((cfg as any)?.business_hours?.saturday || "");
      setHoursSunday((cfg as any)?.business_hours?.sunday || "");
      setAccentColor((cfg as any)?.accent_color || "");
      if ((cfg as any)?.payment_methods?.length) setPaymentMethods((cfg as any).payment_methods);
      setVelourInstagram(s.social_links?.instagram || "");
      setVelourTiktok(s.social_links?.tiktok || "");
      setVelourWhatsapp(s.whatsapp_number || "");
      if (!cfg?.hero_image && s.banner_url && (s.template === "soft-luxury" || s.template === "glass-futuristic" || s.template === "4regn")) {
        setHeroImagePreview(s.banner_url);
        setHeroImageUrl(s.banner_url);
      }
      // Heirloom-specific hero fields
      setHeroIndex(cfg?.hero_index ?? "");
      setHeroLabel(cfg?.hero_label ?? "");
      setHeroHeadline(cfg?.hero_headline ?? "");
      setHeroBody(cfg?.hero_body ?? "");
      setHeroCtaPrimary(cfg?.hero_cta_primary ?? "");
      setHeroCtaSecondary(cfg?.hero_cta_secondary ?? "");
      setHeroCtaPrimaryTarget(cfg?.hero_cta_primary_target ?? { type: "products" });
      setHeroCtaSecondaryTarget(cfg?.hero_cta_secondary_target ?? { type: "none" });
      // Heirloom footer
      setFooterTagline(cfg?.footer_tagline ?? s.description ?? "");
      setFooterCol1Label(cfg?.footer_col1_label ?? "Shop");
      setShippingPolicy((s.store_config as any)?.shipping_policy ?? "");
      setReturnPolicy((s.store_config as any)?.return_policy ?? "");
      setPrivacyPolicy((s.store_config as any)?.privacy_policy ?? "");
      setTermsOfService((s.store_config as any)?.terms_of_service ?? "");
      setHeroCountdownLabel(cfg?.hero_countdown_label ?? "");
      setHeroSaleHeadline((cfg as any)?.hero_sale_headline ?? "");
      // 4regn hero pill
      setShowHeroPill((cfg as any)?.show_hero_pill ?? false);
      setHeroPillLabel((cfg as any)?.hero_pill_label ?? "");
      setHeroDisclaimer((cfg as any)?.hero_disclaimer ?? "");
      setHeroOfferHeadline((cfg as any)?.hero_offer_headline ?? "");
      setHeroOfferNote((cfg as any)?.hero_offer_note ?? "");
      setShowAbout4regn((cfg as any)?.show_about ?? true);
      setAbout4regnEyebrow((cfg as any)?.about_eyebrow ?? "");
      setAbout4regnHeading((cfg as any)?.about_heading ?? "");
      setAbout4regnBody((cfg as any)?.about_body ?? "");
      setAbout4regnStat1Value((cfg as any)?.about_stat1_value ?? "");
      setAbout4regnStat1Label((cfg as any)?.about_stat1_label ?? "");
      setAbout4regnStat2Value((cfg as any)?.about_stat2_value ?? "");
      setAbout4regnStat2Label((cfg as any)?.about_stat2_label ?? "");
      setAbout4regnCtaLabel((cfg as any)?.about_cta_label ?? "");
      // 4regn SETLA promo strip
      setShowSetlaBanner((cfg as any)?.show_setla_banner ?? true);
      setSetlaEyebrow((cfg as any)?.setla_eyebrow ?? "");
      setSetlaLead((cfg as any)?.setla_lead ?? "");
      setSetlaBadge((cfg as any)?.setla_badge ?? "");
      setSetlaNote((cfg as any)?.setla_note ?? "");
      setSetlaCtaPrimary((cfg as any)?.setla_cta_primary ?? "");
      setSetlaCtaSecondary((cfg as any)?.setla_cta_secondary ?? "");
      setSetlaPhotoUrl((cfg as any)?.setla_photo_url ?? "");
      // 4regn Shop by Gender
      setShowShopByGender((cfg as any)?.show_shopbygender ?? true);
      setShopByGenderEyebrow((cfg as any)?.shopbygender_eyebrow ?? "");
      setShopByGenderHeading((cfg as any)?.shopbygender_heading ?? "");
      setHeroCta(cfg?.hero_cta ?? "");
      setHeroCtaTarget(cfg?.hero_cta_target ?? { type: "products" });
      setHeroTitle(cfg?.hero_title !== undefined ? cfg.hero_title : (s.store_name || ""));
      if (cfg?.font_pair) setFontPair(cfg.font_pair);
      setHeaderTransparent(cfg?.header_transparent === true);
      setHeaderTransparentColor(cfg?.header_transparent_color || "#ffffff");
      setHeaderBorder(cfg?.header_border !== false);
      if (cfg?.collection_images) setCollectionImages(cfg.collection_images);
      if (cfg?.collection_descriptions) setCollectionDescriptions(cfg.collection_descriptions);
      if (cfg?.hidden_collections) setHiddenCollections(cfg.hidden_collections);
      if (cfg?.winter_essentials_speed !== undefined) setWinterSpeed(cfg.winter_essentials_speed);
      if (cfg?.winter_essentials_slides) setWinterSlides(cfg.winter_essentials_slides);
      if (cfg?.footer_about) setFooterAbout(cfg.footer_about);
      setProductsCollapsed(cfg?.products_collapsed === true);
      setCollectionsCollapsed(cfg?.collections_collapsed === true);
      if ((s.store_config as any)?.contact_email) setContactEmail((s.store_config as any).contact_email);
      if ((s.store_config as any)?.contact_phone) setContactPhone((s.store_config as any).contact_phone);
      if ((s.store_config as any)?.physical_address) setPhysicalAddress((s.store_config as any).physical_address);
      if ((s.store_config as any)?.operating_hours) setOperatingHours((s.store_config as any).operating_hours);
      if ((s.store_config as any)?.operating_hours_structured?.length) setHoursStructured((s.store_config as any).operating_hours_structured);
      setPolicyItems(cfg?.policy_items || [
        { title: "Shipping", desc: "Standard delivery 3-5 business days nationwide. Free shipping on qualifying orders." },
        { title: "Returns", desc: "Return unworn items within 14 days for a full refund. Items must be in original condition." },
        { title: "Payment", desc: "Secure card payments and WhatsApp checkout for a personal experience." },
      ]);
      setLoading(false);
    })();
  }, []);

  /* ─── LISTEN FOR SECTION CLICKS FROM IFRAME ─── */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SECTION_CLICK") {
        setActiveSection(e.data.section as ActiveSection);
        setPanelVisible(true);
        setPanelExpanded(false);
      }
      if (e.data?.type === "IFRAME_READY") {
        setIframeReady(true);
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  /* ─── SEND LIVE UPDATES TO IFRAME ─── */
  const postUpdate = useCallback((payload: Record<string, unknown>) => {
    iframeRef.current?.contentWindow?.postMessage({ type: "LIVE_UPDATE", ...payload }, "*");
  }, []);

  /* Live update on every field change */
  useEffect(() => { postUpdate({ tagline }); }, [tagline]);
  useEffect(() => { postUpdate({ description }); }, [description]);
  useEffect(() => { postUpdate({ announcement }); }, [announcement]);
  useEffect(() => { postUpdate({ showAnnouncement }); }, [showAnnouncement]);
  useEffect(() => { postUpdate({ trustItems }); }, [trustItems]);
  useEffect(() => { postUpdate({ testimonialText }); }, [testimonialText]);
  useEffect(() => { postUpdate({ ctaHeadline }); }, [ctaHeadline]);
  useEffect(() => { postUpdate({ ctaSubtext }); }, [ctaSubtext]);
  useEffect(() => { postUpdate({ aboutTitle }); }, [aboutTitle]);
  useEffect(() => { postUpdate({ heroSubtext }); }, [heroSubtext]);
  useEffect(() => { postUpdate({ circleTitle }); }, [circleTitle]);
  useEffect(() => { postUpdate({ circleSubtitle }); }, [circleSubtitle]);
  useEffect(() => { postUpdate({ productsLabel }); }, [productsLabel]);
  useEffect(() => { postUpdate({ productsHeading }); }, [productsHeading]);
  useEffect(() => { postUpdate({ productCardRatio }); }, [productCardRatio]);
  useEffect(() => { postUpdate({ aboutLabel }); }, [aboutLabel]);
  useEffect(() => { postUpdate({ collLabel }); }, [collLabel]);
  useEffect(() => { postUpdate({ collSubtitle }); }, [collSubtitle]);
  useEffect(() => { postUpdate({ collectionsLayout }); }, [collectionsLayout]);
  useEffect(() => { postUpdate({ heroImagePosition }); }, [heroImagePosition]);
  useEffect(() => { postUpdate({ heroImageBehavior }); }, [heroImageBehavior]);
  useEffect(() => { postUpdate({ heroLayout }); }, [heroLayout]);
  useEffect(() => { postUpdate({ heroTextPosition }); }, [heroTextPosition]);
  useEffect(() => { postUpdate({ heroImageFade }); }, [heroImageFade]);
  useEffect(() => { postUpdate({ heroSplitImage2 }); }, [heroSplitImage2]);
  useEffect(() => { postUpdate({ brandName }); }, [brandName]);
  useEffect(() => { postUpdate({ brandSubtitle }); }, [brandSubtitle]);
  useEffect(() => { postUpdate({ monogramLetters }); }, [monogramLetters]);
  useEffect(() => { postUpdate({ city: velourCity }); }, [velourCity]);
  useEffect(() => { postUpdate({ calloutAvailable }); }, [calloutAvailable]);
  useEffect(() => { postUpdate({ calloutArea }); }, [calloutArea]);
  useEffect(() => { postUpdate({ businessHours: { weekdays: hoursWeekdays, saturday: hoursSaturday, sunday: hoursSunday } }); }, [hoursWeekdays, hoursSaturday, hoursSunday]);
  useEffect(() => { postUpdate({ paymentMethods }); }, [paymentMethods]);
  useEffect(() => { postUpdate({ showMarquee }); }, [showMarquee]);
  useEffect(() => { postUpdate({ showCollections }); }, [showCollections]);
  useEffect(() => { postUpdate({ heroButtonStyle }); }, [heroButtonStyle]);
  useEffect(() => { postUpdate({ heroButtonColor }); }, [heroButtonColor]);
  useEffect(() => { postUpdate({ heroButtonSize }); }, [heroButtonSize]);
  useEffect(() => { postUpdate({ heroHeadlineStyle }); }, [heroHeadlineStyle]);
  useEffect(() => { postUpdate({ headerStyle }); }, [headerStyle]);
  useEffect(() => { postUpdate({ showNewsletter }); }, [showNewsletter]);
  useEffect(() => { postUpdate({ newsletterLabel }); }, [newsletterLabel]);
  useEffect(() => { postUpdate({ newsletterTitle }); }, [newsletterTitle]);
  useEffect(() => { postUpdate({ newsletterSub }); }, [newsletterSub]);
  useEffect(() => { postUpdate({ showShopByGender }); }, [showShopByGender]);
  useEffect(() => { postUpdate({ shopByGenderEyebrow }); }, [shopByGenderEyebrow]);
  useEffect(() => { postUpdate({ shopByGenderHeading }); }, [shopByGenderHeading]);
  useEffect(() => { postUpdate({ newsletterCopyright }); }, [newsletterCopyright]);
  useEffect(() => { if (collOrder.length > 0) postUpdate({ collOrder }); }, [collOrder]);
  useEffect(() => { postUpdate({ heroImage: heroImagePreview }); }, [heroImagePreview]);
  useEffect(() => { postUpdate({ heroVideo: heroVideoUrl }); }, [heroVideoUrl]);
  useEffect(() => { postUpdate({ marqueeTexts }); }, [marqueeTexts]);
  useEffect(() => { postUpdate({ marqueeSpeed }); }, [marqueeSpeed]);
  useEffect(() => { postUpdate({ bgColor }); }, [bgColor]);
  useEffect(() => { postUpdate({ textColor }); }, [textColor]);
  useEffect(() => { postUpdate({ mutedColor }); }, [mutedColor]);
  useEffect(() => { postUpdate({ heroTextColor }); }, [heroTextColor]);
  useEffect(() => { postUpdate({ circleTextColor }); }, [circleTextColor]);
  useEffect(() => { postUpdate({ prodTextColor }); }, [prodTextColor]);
  useEffect(() => { postUpdate({ aboutTextColor }); }, [aboutTextColor]);
  useEffect(() => { postUpdate({ collTextColor }); }, [collTextColor]);
  useEffect(() => { postUpdate({ ctaTextColor }); }, [ctaTextColor]);
  useEffect(() => { postUpdate({ trustTextColor }); }, [trustTextColor]);
  useEffect(() => { postUpdate({ footerTextColor }); }, [footerTextColor]);
  useEffect(() => { postUpdate({ footerBgColor }); }, [footerBgColor]);
  useEffect(() => { postUpdate({ footerMutedColor }); }, [footerMutedColor]);
  useEffect(() => { postUpdate({ promoBgColor }); }, [promoBgColor]);
  useEffect(() => { postUpdate({ promoBgStyle }); }, [promoBgStyle]);
  useEffect(() => { postUpdate({ promoTextColor }); }, [promoTextColor]);
  useEffect(() => { postUpdate({ promoTimerColor }); }, [promoTimerColor]);
  useEffect(() => { postUpdate({ salePillColor }); }, [salePillColor]);
  useEffect(() => { postUpdate({ percentOffPillColor }); }, [percentOffPillColor]);
  useEffect(() => { postUpdate({ showPercentOffPill }); }, [showPercentOffPill]);
  useEffect(() => { postUpdate({ promiseLabel }); }, [promiseLabel]);
  useEffect(() => { postUpdate({ promiseTitle }); }, [promiseTitle]);
  useEffect(() => { postUpdate({ promiseItems }); }, [promiseItems]);
  useEffect(() => { postUpdate({ promiseImages }); }, [promiseImages]);
  useEffect(() => { if (logoPreview) postUpdate({ logoUrl: logoPreview }); }, [logoPreview]);

  /* Heirloom hero — live updates */
  useEffect(() => { postUpdate({ heroIndex }); }, [heroIndex]);
  useEffect(() => { postUpdate({ heroLabel }); }, [heroLabel]);
  useEffect(() => { postUpdate({ heroHeadline }); }, [heroHeadline]);
  useEffect(() => { postUpdate({ heroBody }); }, [heroBody]);
  useEffect(() => { postUpdate({ heroCtaPrimary }); }, [heroCtaPrimary]);
  useEffect(() => { postUpdate({ heroCtaSecondary }); }, [heroCtaSecondary]);
  useEffect(() => { postUpdate({ heroCtaPrimaryTarget }); }, [heroCtaPrimaryTarget]);
  useEffect(() => { postUpdate({ heroCtaSecondaryTarget }); }, [heroCtaSecondaryTarget]);

  /* Heirloom footer — live updates */
  useEffect(() => { postUpdate({ footerTagline }); }, [footerTagline]);
  useEffect(() => { postUpdate({ footerCol1Label }); }, [footerCol1Label]);
  useEffect(() => { postUpdate({ shippingPolicy }); }, [shippingPolicy]);
  useEffect(() => { postUpdate({ returnPolicy }); }, [returnPolicy]);
  useEffect(() => { postUpdate({ heroCountdownLabel }); }, [heroCountdownLabel]);
  useEffect(() => { postUpdate({ heroSaleHeadline }); }, [heroSaleHeadline]);
  useEffect(() => { postUpdate({ showHeroPill }); }, [showHeroPill]);
  useEffect(() => { postUpdate({ heroPillLabel }); }, [heroPillLabel]);
  useEffect(() => { postUpdate({ heroDisclaimer }); }, [heroDisclaimer]);
  useEffect(() => { postUpdate({ heroOfferHeadline }); }, [heroOfferHeadline]);
  useEffect(() => { postUpdate({ heroOfferNote }); }, [heroOfferNote]);
  useEffect(() => { postUpdate({ showAbout: showAbout4regn }); }, [showAbout4regn]);
  useEffect(() => { postUpdate({ aboutEyebrow: about4regnEyebrow }); }, [about4regnEyebrow]);
  useEffect(() => { postUpdate({ aboutHeading: about4regnHeading }); }, [about4regnHeading]);
  useEffect(() => { postUpdate({ aboutBody: about4regnBody }); }, [about4regnBody]);
  useEffect(() => { postUpdate({ aboutStat1Value: about4regnStat1Value }); }, [about4regnStat1Value]);
  useEffect(() => { postUpdate({ aboutStat1Label: about4regnStat1Label }); }, [about4regnStat1Label]);
  useEffect(() => { postUpdate({ aboutStat2Value: about4regnStat2Value }); }, [about4regnStat2Value]);
  useEffect(() => { postUpdate({ aboutStat2Label: about4regnStat2Label }); }, [about4regnStat2Label]);
  useEffect(() => { postUpdate({ aboutCtaLabel: about4regnCtaLabel }); }, [about4regnCtaLabel]);
  useEffect(() => { postUpdate({ heroTitle }); }, [heroTitle]);
  useEffect(() => { postUpdate({ heroCta }); }, [heroCta]);
  useEffect(() => { postUpdate({ heroCtaTarget }); }, [heroCtaTarget]);
  useEffect(() => { postUpdate({ fontPair }); }, [fontPair]);
  useEffect(() => { postUpdate({ headerTransparent }); }, [headerTransparent]);
  useEffect(() => { postUpdate({ headerTransparentColor }); }, [headerTransparentColor]);
  useEffect(() => { postUpdate({ headerBorder }); }, [headerBorder]);
  useEffect(() => { postUpdate({ footerAbout }); }, [footerAbout]);
  useEffect(() => { postUpdate({ contactEmail }); }, [contactEmail]);
  useEffect(() => { postUpdate({ contactPhone }); }, [contactPhone]);
  useEffect(() => { postUpdate({ physicalAddress }); }, [physicalAddress]);
  useEffect(() => { postUpdate({ operatingHours }); }, [operatingHours]);
  useEffect(() => { postUpdate({ policyItems }); }, [policyItems]);
  useEffect(() => { postUpdate({ collectionsCollapsed }); }, [collectionsCollapsed]);
  useEffect(() => { postUpdate({ productsCollapsed }); }, [productsCollapsed]);
  useEffect(() => {
    const lines = hoursStructured.map(h => {
      if (h.status === "closed") return `${h.day}: Closed`;
      let line = `${h.day}: ${h.open} – ${h.close}`;
      if (h.lunch_start && h.lunch_end) line += ` (Lunch ${h.lunch_start} – ${h.lunch_end})`;
      return line;
    }).join("\n");
    setOperatingHours(lines);
  }, [hoursStructured]);

  /* ─── SAVE ─── */
  const save = async () => {
    if (!seller) return;
    setSaving(true);
    let logoUrl: string | null = seller.logo_url;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = `logos/${seller.id}-${Date.now()}.${ext}`;
      await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true });
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      logoUrl = data.publicUrl;
    } else if (!logoPreview && seller.logo_url) {
      logoUrl = null;
    }
    // heroImagePreview is set IMMEDIATELY on file selection (for instant
    // preview) to a raw base64 data: URL, well before the async Supabase
    // Storage upload resolves into heroImageUrl -- so saving while that
    // upload is still in flight (e.g. clicking Save right after picking a
    // new hero image) previously fell through to heroImagePreview here and
    // persisted the raw base64 string straight into the database. Confirmed
    // as a real, live bug via a production DevTools trace: a seller's
    // sellers.banner_url/store_config.hero_image ended up holding a multi-
    // hundred-KB base64 blob instead of a real Storage URL, which then got
    // embedded into every single storefront page load's HTML (SELLER_COLUMNS
    // selects banner_url on every route) -- a huge, completely unnecessary
    // and unintended chunk of every page's payload, on top of not even being
    // a valid persistent image reference. Never persist a data: URL; fall
    // back to the seller's existing value instead (same "only overwrite with
    // a genuinely new upload" pattern logoUrl already uses safely above) --
    // functionally identical to as if no new image had been selected yet.
    const heroImageIsUnresolvedPreview = heroImagePreview.startsWith("data:");
    const heroUrl = heroImageUrl || (heroImageIsUnresolvedPreview ? undefined : heroImagePreview) || undefined;
    // Same bug class as heroImage above: the "Second Panel Image" file input
    // sets heroSplitImage2 to a raw base64 preview immediately on selection,
    // before the async Storage upload resolves into the real URL -- saving
    // in that window previously would have persisted the base64 blob
    // straight into template_configs. Fall back to whatever was already
    // saved (same "as if no new image had been selected yet" behavior as
    // heroImage/logoUrl) rather than ever writing an unresolved preview.
    const heroSplitImage2IsUnresolvedPreview = heroSplitImage2.startsWith("data:");
    const heroSplitImage2Url = heroSplitImage2IsUnresolvedPreview
      ? (effectiveStoreConfig(seller)?.hero_split_image_2 || "")
      : heroSplitImage2;
    const isBannerTemplate = seller.template === "soft-luxury" || seller.template === "glass-futuristic" || seller.template === "4regn";

    // Everything the editor manages, in one place. pickTemplateFields /
    // omitTemplateFields (lib/template-config.ts) route each key to either
    // this template's own slot in template_configs or the shared global
    // store_config, so switching templates later can't clobber another
    // template's saved look.
    const editedFields: Record<string, any> = {
      announcement,
      show_announcement: showAnnouncement,
      trust_items: trustItems,
      hero_subtext: heroSubtext,
      circle_title: circleTitle,
      circle_subtitle: circleSubtitle,
      products_label: productsLabel,
      products_heading: productsHeading,
      product_card_ratio: productCardRatio,
      about_label: aboutLabel,
      about_title: aboutTitle,
      coll_label: collLabel,
      coll_subtitle: collSubtitle,
      collections_layout: collectionsLayout,
      hero_image_position: heroImagePosition,
      hero_image_behavior: heroImageBehavior,
      hero_layout: heroLayout,
      hero_text_position: heroTextPosition,
      hero_image_fade: heroImageFade,
      hero_split_image_2: heroSplitImage2Url,
      brand_name: brandName || undefined,
      brand_subtitle: brandSubtitle,
      monogram_letters: monogramLetters,
      city: velourCity,
      callout_available: calloutAvailable,
      callout_area: calloutArea,
      business_hours: { weekdays: hoursWeekdays, saturday: hoursSaturday, sunday: hoursSunday },
      accent_color: accentColor || undefined,
      payment_methods: paymentMethods,
      show_marquee: showMarquee,
      show_collections: showCollections,
      hero_button_style: heroButtonStyle,
      hero_button_color: heroButtonColor,
      hero_button_size: heroButtonSize,
      hero_headline_style: heroHeadlineStyle,
      header_style: headerStyle,
      show_newsletter: showNewsletter,
      newsletter_label: newsletterLabel,
      newsletter_copyright: newsletterCopyright,
      newsletter_title: newsletterTitle,
      newsletter_sub: newsletterSub,
      // 4regn footer legal links
      privacy_policy: privacyPolicy,
      terms_of_service: termsOfService,
      marquee_texts: marqueeTexts,
      marquee_speed: marqueeSpeed,
      // Dual-write for Crown/Heirloom, which still read ticker_texts directly.
      ticker_texts: marqueeTexts,
      ticker_speed: marqueeSpeed,
      bg_color: bgColor,
      text_color: textColor,
      muted_color: mutedColor,
      hero_text_color: heroTextColor,
      circle_text_color: circleTextColor,
      products_text_color: prodTextColor,
      about_text_color: aboutTextColor,
      coll_text_color: collTextColor,
      cta_text_color: ctaTextColor,
      trust_text_color: trustTextColor,
      // These default to "" (no override) in state — save null rather than
      // an empty string so the storefront's site-color fallback kicks in,
      // and so a previously-saved value gets actively cleared once the
      // seller resets it here (an empty string alone wouldn't overwrite
      // a stale hex value already sitting in the config).
      footer_text_color: footerTextColor || null,
      footer_bg_color: footerBgColor || null,
      footer_muted_color: footerMutedColor || null,
      promo_bg_color: promoBgColor || null,
      promo_bg_style: promoBgStyle,
      promo_text_color: promoTextColor || null,
      promo_timer_color: promoTimerColor || null,
      sale_pill_color: salePillColor || null,
      percent_off_pill_color: percentOffPillColor || null,
      show_percent_off_pill: showPercentOffPill,
      hero_image: heroUrl,
      hero_video_url: heroVideoUrl || undefined,
      promise_label: promiseLabel,
      promise_title: promiseTitle,
      promise_items: promiseItems,
      promise_images: promiseImages,
      // Heirloom-specific hero fields. Empty strings are kept (sellers
      // sometimes deliberately blank a field), but undefined would fall
      // back to template defaults at render time.
      hero_index: heroIndex,
      hero_label: heroLabel,
      hero_headline: heroHeadline,
      hero_body: heroBody,
      hero_cta_primary: heroCtaPrimary,
      hero_cta_secondary: heroCtaSecondary,
      hero_cta_primary_target: heroCtaPrimaryTarget,
      hero_cta_secondary_target: heroCtaSecondaryTarget,
      // Heirloom footer
      footer_tagline: footerTagline,
      footer_col1_label: footerCol1Label,
      shipping_policy: shippingPolicy,
      return_policy: returnPolicy,
      hero_countdown_label: heroCountdownLabel,
      hero_sale_headline: heroSaleHeadline,
      show_hero_pill: showHeroPill,
      hero_pill_label: heroPillLabel,
      hero_disclaimer: heroDisclaimer,
      hero_offer_headline: heroOfferHeadline,
      hero_offer_note: heroOfferNote,
      show_about: showAbout4regn,
      about_eyebrow: about4regnEyebrow,
      about_heading: about4regnHeading,
      about_body: about4regnBody,
      about_stat1_value: about4regnStat1Value,
      about_stat1_label: about4regnStat1Label,
      about_stat2_value: about4regnStat2Value,
      about_stat2_label: about4regnStat2Label,
      about_cta_label: about4regnCtaLabel,
      show_setla_banner: showSetlaBanner,
      setla_eyebrow: setlaEyebrow,
      setla_lead: setlaLead,
      setla_badge: setlaBadge,
      setla_note: setlaNote,
      setla_cta_primary: setlaCtaPrimary,
      setla_cta_secondary: setlaCtaSecondary,
      setla_photo_url: setlaPhotoUrl,
      show_shopbygender: showShopByGender,
      shopbygender_eyebrow: shopByGenderEyebrow,
      shopbygender_heading: shopByGenderHeading,
      hero_cta: heroCta || undefined,
      hero_cta_target: heroCtaTarget,
      hero_title: heroTitle,
      font_pair: fontPair,
      header_transparent: headerTransparent,
      header_transparent_color: headerTransparentColor,
      header_border: headerBorder,
      collection_images: collectionImages,
      collection_descriptions: collectionDescriptions,
      hidden_collections: hiddenCollections,
      winter_essentials_speed: winterSpeed,
      winter_essentials_slides: winterSlides,
      footer_about: footerAbout || undefined,
      products_collapsed: productsCollapsed || undefined,
      collections_collapsed: collectionsCollapsed || undefined,
      contact_email: contactEmail || undefined,
      contact_phone: contactPhone || undefined,
      physical_address: physicalAddress || undefined,
      operating_hours: operatingHours || undefined,
      operating_hours_structured: hoursStructured,
      policy_items: policyItems,
    };
    const newStoreConfig = { ...omitTemplateFields(seller.store_config || {}), ...omitTemplateFields(editedFields) };
    const newTemplateConfigs = {
      ...(seller.template_configs || {}),
      [seller.template]: {
        ...(seller.template_configs?.[seller.template] || pickTemplateFields(seller.store_config || {})),
        ...pickTemplateFields(editedFields),
      },
    };
    const socialLinksUpdate = seller.template === "velour"
      ? { social_links: { ...seller.social_links, instagram: velourInstagram || undefined, tiktok: velourTiktok || undefined }, whatsapp_number: velourWhatsapp }
      : {};
    await supabase.from("sellers").update({
      tagline, description, logo_url: logoUrl,
      ...(isBannerTemplate && heroUrl ? { banner_url: heroUrl } : {}),
      collections: collOrder.length > 0 ? collOrder : seller.collections,
      store_config: newStoreConfig,
      template_configs: newTemplateConfigs,
      ...socialLinksUpdate,
    }).eq("id", seller.id);
    setSeller({ ...seller, store_config: newStoreConfig, template_configs: newTemplateConfigs, ...socialLinksUpdate });
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
    if (seller.subdomain) void revalidateStore(seller.subdomain).catch(() => {});
  };

  /* ─── LOGO UPLOAD ─── */
  const handleLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setLogoFile(f);
    const reader = new FileReader();
    reader.onload = ev => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(f);
  };

  const logoRef = useRef<HTMLInputElement>(null);

  /* ─── STYLES ─── */
  const G = "#ff6b35";
  const N = "#ff6b35";
  const inputStyle: React.CSSProperties = {
    width: "100%", padding: "10px 12px",
    background: "rgba(255,255,255,0.06)",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: 8, color: "#f5f5f5",
    fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif",
    outline: "none", lineHeight: 1.5,
  };
  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase", color: "rgba(245,245,245,0.4)",
    display: "block", marginBottom: 6,
  };
  const hintStyle: React.CSSProperties = {
    fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4, lineHeight: 1.5,
  };
  const ctaCardStyle: React.CSSProperties = {
    padding: 12, background: "rgba(255,255,255,0.025)",
    border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10,
  };
  const ctaCardTitle: React.CSSProperties = {
    fontSize: 11, fontWeight: 800, textTransform: "uppercase",
    letterSpacing: "0.08em", color: "rgba(245,245,245,0.55)", marginBottom: 8,
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0a0e", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ width: 32, height: 32, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: G, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ height: "100vh", display: "flex", flexDirection: "column", background: "#0a0a0e", fontFamily: "'Schibsted Grotesk', sans-serif", overflow: "hidden" }}>

      {/* ── TOP BAR ── */}
      <div style={{ height: 52, background: "#0a0a0e", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => router.push("/dashboard")} aria-label="Back to dashboard"
            style={{ background: "none", border: "none", color: "rgba(245,245,245,0.4)", cursor: "pointer", padding: "6px 8px", borderRadius: 6, display: "flex", alignItems: "center" }}>
            <EditorIcon name="arrow-left" size={18} />
          </button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f5f5f5" }}>{seller?.store_name}</div>
            <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", letterSpacing: "0.04em" }}>
              {panelVisible && activeSection ? <SectionTag section={activeSection} color="rgba(245,245,245,0.45)" /> : "Click any section to edit"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Device toggle -- desktop / mobile preview */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
            {([
              { name: "desktop" as const, label: "Desktop" },
              { name: "mobile" as const,  label: "Mobile" },
            ]).map(d => (
              <button key={d.name} title={d.label} aria-label={`${d.label} preview`}
                onClick={() => {
                  setDeviceMode(d.name);
                  applyDeviceStyle(d.name, previewExpanded);
                }}
                style={{ background: deviceMode === d.name ? "rgba(255,255,255,0.06)" : "none", border: "none", cursor: "pointer", padding: "8px 12px", color: deviceMode === d.name ? "#fff" : "rgba(245,245,245,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <EditorIcon name={d.name} size={16} />
              </button>
            ))}
          </div>

          {/* Expand/Collapse Preview -- only meaningful in Mobile mode, where it
              enlarges the phone preview closer to the size used on the landing
              page's template showcase instead of the default compact frame. */}
          {deviceMode === "mobile" && (
            <button title={previewExpanded ? "Collapse Preview" : "Expand Preview"} aria-label={previewExpanded ? "Collapse Preview" : "Expand Preview"}
              onClick={() => {
                const next = !previewExpanded;
                setPreviewExpanded(next);
                applyDeviceStyle("mobile", next);
              }}
              style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, cursor: "pointer", padding: "8px 12px", color: "rgba(245,245,245,0.6)", display: "flex", alignItems: "center", gap: 6, fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {previewExpanded ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
              )}
              {previewExpanded ? "Collapse" : "Expand"}
            </button>
          )}

          {/* Open in new tab */}
          {seller?.subdomain && (
            <a href={canonicalStoreUrl(seller.subdomain)} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(245,245,245,0.6)", textDecoration: "none", padding: "8px 14px", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, display: "inline-flex", alignItems: "center", gap: 8, transition: "color 0.15s, border-color 0.15s" }}>
              Open Store <EditorIcon name="external" size={13} />
            </a>
          )}

          {/* Save -- premium dark button with subtle orange accent. Lets the
              brand color show up as a hint (thin border + glow) rather than a
              paint -- feels editorial against any storefront aesthetic. */}
          <button onClick={save} disabled={saving}
            style={{
              padding: "9px 22px",
              background: saved
                ? "linear-gradient(135deg,#16a34a 0%,#15803d 100%)"
                : "linear-gradient(135deg,#1c1c20 0%,#0d0d11 100%)",
              color: "#fff",
              border: saved ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,107,53,0.35)",
              borderRadius: 100,
              fontFamily: "'Schibsted Grotesk', sans-serif",
              fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
              cursor: saving ? "not-allowed" : "pointer",
              boxShadow: saved ? "0 4px 18px rgba(34,197,94,0.18)" : "0 4px 18px rgba(255,107,53,0.15)",
              transition: "all 0.25s ease",
              display: "inline-flex", alignItems: "center", gap: 8,
            }}>
            {saved && <EditorIcon name="check" size={13} stroke={2.5} />}
            {saving ? "Saving" : saved ? "Saved" : "Save"}
          </button>
        </div>
      </div>

      {/* ── MAIN: IFRAME ── */}
      <div style={{ flex: 1, position: "relative", overflow: "hidden" }}>

        {/* iframe */}
        <div style={{ width: "100%", height: "100%", background: "#111", display: "flex", flexDirection: "column", alignItems: "center", overflow: "auto" }}>
          {!iframeReady && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "#0a0a0e", zIndex: 5, flexDirection: "column", gap: 16 }}>
              <div style={{ width: 36, height: 36, border: "2px solid rgba(255,255,255,0.08)", borderTopColor: G, borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
              <div style={{ fontSize: 13, color: "rgba(245,245,245,0.4)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Loading your store...</div>
            </div>
          )}
          {seller?.subdomain && (
            <iframe
              ref={iframeRef}
              src={`/store/${seller.subdomain}?editMode=true`}
              style={{ width: "100%", height: "100%", border: "none", display: "block", transition: "width 0.3s" }}
              onLoad={() => setIframeReady(true)}
            />
          )}
        </div>

        {/* ── FLOATING EDIT PANEL ── */}
        <div style={panelExpanded ? {
          position: "absolute",
          inset: panelVisible ? 0 : "100% 0 0 0",
          background: "#0d0d11",
          border: "none",
          borderRadius: 0,
          boxShadow: "none",
          zIndex: 50,
          transition: "inset 0.4s cubic-bezier(0.16,1,0.3,1)",
          overflow: "hidden",
          maxHeight: "100vh",
          display: "flex",
          flexDirection: "column",
        } : {
          position: "absolute",
          bottom: panelVisible ? 24 : -400,
          left: "50%", transform: "translateX(-50%)",
          width: "min(520px, calc(100vw - 48px))",
          background: "#0d0d11",
          border: "1px solid rgba(255,255,255,0.1)",
          borderRadius: 20,
          boxShadow: "0 -4px 60px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04)",
          zIndex: 50,
          transition: "bottom 0.4s cubic-bezier(0.16,1,0.3,1)",
          overflow: "hidden",
          maxHeight: "60vh",
          display: "flex",
          flexDirection: "column",
        }}>
          {/* Panel header */}
          <div style={{ padding: "16px 22px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
              {activeSection && SECTION_LABELS[activeSection] && (
                <>
                  <span style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 28, height: 28, borderRadius: 8, background: "rgba(255,107,53,0.08)", color: "#ff6b35" }}>
                    <EditorIcon name={SECTION_LABELS[activeSection].icon} size={15} stroke={1.7} />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 700, color: "#f5f5f5", letterSpacing: "-0.01em" }}>{SECTION_LABELS[activeSection].label}</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <button onClick={() => setPanelExpanded(v => !v)} aria-label={panelExpanded ? "Shrink panel" : "Expand panel"} title={panelExpanded ? "Shrink panel" : "Expand panel"}
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(245,245,245,0.5)",
                  cursor: "pointer", borderRadius: 8,
                  padding: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                }}>
                {panelExpanded ? (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/></svg>
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>
                )}
              </button>
              <button onClick={() => setPanelVisible(false)} aria-label="Close panel"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  color: "rgba(245,245,245,0.5)",
                  cursor: "pointer", borderRadius: 8,
                  padding: 6, display: "inline-flex", alignItems: "center", justifyContent: "center",
                  transition: "all 0.15s ease",
                }}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m5 5 10 10"/><path d="m15 5-10 10"/>
                </svg>
              </button>
            </div>
          </div>

          {/* Panel body */}
          <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>

            {/* ANNOUNCEMENT */}
            {activeSection === "announcement" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={showAnnouncement} onChange={e => setShowAnnouncement(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show announcement bar</span>
                </label>
                <label style={labelStyle}>Announcement Text</label>
                <input value={announcement} onChange={e => setAnnouncement(e.target.value)}
                  placeholder="e.g. Free delivery on orders over R800 🎉"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Shows as the bar at the very top of your store.</div>
              </div>
            )}

            {/* LOGO */}
            {activeSection === "logo" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Store Logo</label>
                <div onClick={() => logoRef.current?.click()}
                  style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {logoPreview
                    ? <img src={logoPreview} alt="" style={{ maxHeight: "100%", maxWidth: "100%", objectFit: "contain" }} />
                    : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.3)" }}><EditorIcon name="image" size={28} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload your logo</div></div>
                  }
                </div>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Your logo shows in the top-left nav and the footer. If you leave it empty your store name will appear there instead.</div>
                {logoPreview && (
                  <button onClick={() => { setLogoPreview(""); setLogoFile(null); }}
                    style={{ padding: "8px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 6, color: "#ff6b35", cursor: "pointer", fontSize: 11 }}>
                    Remove logo
                  </button>
                )}
              </div>
            )}

            {/* HERO — Heirloom variant. The pre-existing block below was
                Crown-shaped (tagline => headline, description => subtitle)
                which mangled Heirloom's structure -- Heirloom's headline
                lives in config.hero_headline, not seller.tagline. We branch
                on template and render the right form. */}
            {activeSection === "hero" && seller?.template === "heirloom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {/* Hero background image (shared upload UI) */}
                <div>
                  <label style={labelStyle}>Hero Background Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero image</div></div>}
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroImagePreview(localUrl); postUpdate({ heroImage: localUrl }); };
                      reader.readAsDataURL(f);
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_image_${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); const finalUrl = data.publicUrl; setHeroImagePreview(finalUrl); setHeroImageUrl(finalUrl); postUpdate({ heroImage: finalUrl }); }
                    }} style={{ display: "none" }} />
                </div>

                <div>
                  <label style={labelStyle}>Hero Eyebrow (release tag)</label>
                  <input value={heroIndex} onChange={e => setHeroIndex(e.target.value)} placeholder={`${seller.store_name} · Release 01`} style={inputStyle} />
                  <div style={hintStyle}>Tiny tag at the very top of the hero, e.g. &quot;4REGN · RELEASE 01&quot;.</div>
                </div>

                <div>
                  <label style={labelStyle}>Hero Label</label>
                  <input value={heroLabel} onChange={e => setHeroLabel(e.target.value)} placeholder="Pick of the Week" style={inputStyle} />
                  <div style={hintStyle}>The smaller line above the headline, e.g. &quot;PICK OF THE WEEK&quot;.</div>
                </div>

                <div>
                  <label style={labelStyle}>Hero Headline</label>
                  <textarea value={heroHeadline} onChange={e => setHeroHeadline(e.target.value)} rows={3} placeholder={"Built to outlast\nthe season."} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
                  <div style={hintStyle}>The big italic text in the hero. Use a line break to control where the headline wraps. Aim for 4-8 words.</div>
                </div>

                <div>
                  <label style={labelStyle}>Hero Body</label>
                  <textarea value={heroBody} onChange={e => setHeroBody(e.target.value)} rows={3} placeholder="Short sentence under the headline." style={{ ...inputStyle, resize: "vertical", minHeight: 64 }} />
                </div>

                {/* Primary CTA */}
                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Primary Button</div>
                  <input value={heroCtaPrimary} onChange={e => setHeroCtaPrimary(e.target.value)} placeholder="Shop the Drop" style={inputStyle} />
                  <div style={{ height: 10 }} />
                  <CtaTargetPicker target={heroCtaPrimaryTarget} onChange={setHeroCtaPrimaryTarget} collections={seller.collections || []} />
                </div>

                {/* Secondary CTA */}
                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Secondary Button <span style={{ fontWeight: 400, color: "rgba(245,245,245,0.3)" }}>(optional)</span></div>
                  <input value={heroCtaSecondary} onChange={e => setHeroCtaSecondary(e.target.value)} placeholder="e.g. View Collection — leave blank to hide" style={inputStyle} />
                  <div style={{ height: 10 }} />
                  <CtaTargetPicker target={heroCtaSecondaryTarget} onChange={setHeroCtaSecondaryTarget} collections={seller.collections || []} />
                  <div style={{ ...hintStyle, marginTop: 8 }}>Leave the label empty or set the link to &quot;Hide button&quot; if you don&apos;t need a second CTA.</div>
                </div>

                {/* Sale Countdown */}
                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Sale Countdown</div>
                  <input value={heroSaleHeadline} onChange={e => setHeroSaleHeadline(e.target.value)}
                    placeholder="e.g. Summer Sale" style={inputStyle} />
                  <div style={{ ...hintStyle, marginTop: 4, marginBottom: 12 }}>
                    Big headline shown above the countdown, e.g. &quot;Summer Sale&quot; or &quot;50% Off Everything&quot;. Leave empty to hide.
                  </div>
                  <input value={heroCountdownLabel} onChange={e => setHeroCountdownLabel(e.target.value)}
                    placeholder="e.g. Limited drop ends in" style={inputStyle} />
                  <div style={{ ...hintStyle, marginTop: 8 }}>
                    Smaller label above the countdown timer. Leave empty to auto-show
                    &quot;<em>{`<CODE>`}</em> ends in&quot; based on the active
                    discount. The timer itself only appears when a real discount
                    code with &quot;Show Countdown&quot; is active — manage codes
                    in <strong>Dashboard → Discounts</strong>.
                  </div>
                </div>

                {/* Text color (shared) */}
                <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Headline Color</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ width: 28, height: 28, borderRadius: 6, background: heroTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                        <input type="color" value={heroTextColor} onChange={e => setHeroTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{heroTextColor}</span>
                      <button onClick={() => setHeroTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                    </div>
                  </div>
                </div>

                {/* Transparent header */}
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Header</div>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={headerTransparent} onChange={e => setHeaderTransparent(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                    <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Transparent header (overlays hero image)</span>
                  </label>
                  {headerTransparent && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 8, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Icon &amp; Text Color</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ width: 24, height: 24, borderRadius: 6, background: headerTransparentColor, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                          <input type="color" value={headerTransparentColor} onChange={e => setHeaderTransparentColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                        </label>
                        <span style={{ fontSize: 9, color: "rgba(245,245,245,0.42)", fontFamily: "monospace" }}>{headerTransparentColor}</span>
                        <button onClick={() => setHeaderTransparentColor("#ffffff")} style={{ fontSize: 9, color: "rgba(245,245,245,0.35)", background: "none", border: "none", cursor: "pointer" }}>&#8634;</button>
                      </div>
                    </div>
                  )}
                  <div style={{ fontSize: 10, color: "rgba(245,245,245,0.42)", marginTop: 6 }}>Only used on the landing page while a hero image is set.</div>
                </div>
              </div>
            )}

            {/* HERO — Soft Luxury / Glass Chrome (banner_url based) */}
            {activeSection === "hero" && (seller?.template === "soft-luxury" || seller?.template === "glass-futuristic") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Background Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero image</div></div>
                    }
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroImagePreview(localUrl); postUpdate({ heroImage: localUrl }); };
                      reader.readAsDataURL(f);
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_image_${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); const finalUrl = data.publicUrl; setHeroImagePreview(finalUrl); setHeroImageUrl(finalUrl); postUpdate({ heroImage: finalUrl }); }
                    }} style={{ display: "none" }} />
                  {heroImagePreview && <button onClick={() => { setHeroImagePreview(""); setHeroImageUrl(""); postUpdate({ heroImage: "" }); }} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>Full-screen background on your homepage hero section.</div>
                </div>
                {seller?.template === "soft-luxury" && (
                  <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <label style={labelStyle}>Banner Position</label>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Click or drag on the preview to pick the exact point that stays visible on desktop -- fixes portrait banners getting cropped oddly on wide screens.</div>
                    <div style={{ marginBottom: 16 }}>
                      <FocalPointPicker value={heroImagePosition} onChange={setHeroImagePosition} imageUrl={heroImagePreview} />
                    </div>
                    <label style={labelStyle}>Banner Motion</label>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>See how each option looks live in the preview.</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                      {([{ v: "still", l: "Still" }, { v: "ambient", l: "Ambient" }, { v: "breathing", l: "Breathing" }] as const).map(o => (
                        <button key={o.v} onClick={() => setHeroImageBehavior(o.v)}
                          style={{ padding: "8px 4px", borderRadius: 6, border: heroImageBehavior === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: heroImageBehavior === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: heroImageBehavior === o.v ? "#fff" : "rgba(245,245,245,0.5)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                          {o.l}
                        </button>
                      ))}
                    </div>
                    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", marginTop: 16, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={heroImageFade} onChange={e => setHeroImageFade(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                      <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Fade overlay behind text (turn off for full photo clarity)</span>
                    </label>
                    <div style={{ marginTop: 16 }}>
                      <label style={labelStyle}>Banner Layout</label>
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 10 }}>Pick how your homepage banner is composed, so your store doesn&apos;t look like every other Soft Luxury store.</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {([
                          { key: "default", name: "Full Image", desc: "Full-bleed photo — position the text anywhere over it" },
                          { key: "split", name: "Split Screen", desc: "Photo on one side, text panel on the other" },
                        ] as const).map((opt) => (
                          <button key={opt.key} onClick={() => setHeroLayout(opt.key)}
                            style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", padding: "10px 12px", background: heroLayout === opt.key ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: heroLayout === opt.key ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, cursor: "pointer", width: "100%", textAlign: "left" }}>
                            <span style={{ fontSize: 13, color: heroLayout === opt.key ? "rgba(245,245,245,0.9)" : "rgba(245,245,245,0.5)", fontWeight: heroLayout === opt.key ? 500 : 400 }}>{opt.name}</span>
                            <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)" }}>{opt.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    {heroLayout === "split" && (
                      <div style={{ marginTop: 16 }}>
                        <label style={labelStyle}>Second Panel Image</label>
                        <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 10 }}>Optional. Adds a photo behind the text panel instead of a plain color background.</div>
                        <div onClick={() => heroSplitImage2Ref.current?.click()}
                          style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {heroSplitImage2
                            ? <img src={heroSplitImage2} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 12, marginTop: 6 }}>Click to upload</div></div>}
                        </div>
                        <input ref={heroSplitImage2Ref} type="file" accept="image/*"
                          onChange={async e => {
                            const f = e.target.files?.[0]; if (!f || !seller) return;
                            const reader = new FileReader();
                            reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroSplitImage2(localUrl); };
                            reader.readAsDataURL(f);
                            const ext = f.name.split(".").pop();
                            const path = `${seller.id}/hero_split_2_${Date.now()}.${ext}`;
                            const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                            if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); setHeroSplitImage2(data.publicUrl); }
                          }} style={{ display: "none" }} />
                        {heroSplitImage2 && <button onClick={() => setHeroSplitImage2("")} style={{ marginTop: 6, fontSize: 12, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                      </div>
                    )}
                    {heroLayout === "default" && (
                      <div style={{ marginTop: 16 }}>
                        <label style={labelStyle}>Text Position</label>
                        <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 10 }}>Where the headline, description, and button sit over the photo.</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gridTemplateRows: "repeat(3, 40px)", gap: 6 }}>
                          {([
                            { v: "top-left", col: 1, row: 1, l: "⌜" }, { v: "", col: 2, row: 1, l: "" }, { v: "top-right", col: 3, row: 1, l: "⌝" },
                            { v: "", col: 1, row: 2, l: "" }, { v: "center", col: 2, row: 2, l: "◉" }, { v: "", col: 3, row: 2, l: "" },
                            { v: "bottom-left", col: 1, row: 3, l: "⌞" }, { v: "bottom-center", col: 2, row: 3, l: "▬" }, { v: "bottom-right", col: 3, row: 3, l: "⌟" },
                          ] as const).map((o, i) => o.v ? (
                            <button key={o.v} title={o.v.replace("-", " ")} onClick={() => setHeroTextPosition(o.v)}
                              style={{ gridColumn: o.col, gridRow: o.row, display: "flex", alignItems: "center", justifyContent: "center", borderRadius: 6, border: heroTextPosition === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: heroTextPosition === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: heroTextPosition === o.v ? "#fff" : "rgba(245,245,245,0.4)", fontSize: 16, cursor: "pointer", transition: "all 0.2s" }}>
                              {o.l}
                            </button>
                          ) : <div key={i} style={{ gridColumn: o.col, gridRow: o.row }} />)}
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <label style={labelStyle}>Headline Style</label>
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Elegant matches the classic Soft Luxury look. Bold is punchier — closer to a modern lifestyle/streetwear feel.</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                        {([{ v: "elegant", l: "Elegant", d: "Light, italic serif" }, { v: "bold", l: "Bold", d: "Heavy, upright sans" }] as const).map(o => (
                          <button key={o.v} onClick={() => setHeroHeadlineStyle(o.v)}
                            style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: 6, border: heroHeadlineStyle === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: heroHeadlineStyle === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: heroHeadlineStyle === o.v ? "#fff" : "rgba(245,245,245,0.5)", cursor: "pointer", transition: "all 0.2s", textAlign: "left" }}>
                            <span style={{ fontSize: 11, fontWeight: heroHeadlineStyle === o.v ? 600 : 400 }}>{o.l}</span>
                            <span style={{ fontSize: 9, color: "rgba(245,245,245,0.35)" }}>{o.d}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div style={{ marginTop: 16 }}>
                      <label style={labelStyle}>Shop Now Button</label>
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Style</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6, marginBottom: 12 }}>
                        {([{ v: "outline", l: "Outline" }, { v: "filled", l: "Filled" }] as const).map(o => (
                          <button key={o.v} onClick={() => setHeroButtonStyle(o.v)}
                            style={{ padding: "8px 4px", borderRadius: 6, border: heroButtonStyle === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: heroButtonStyle === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: heroButtonStyle === o.v ? "#fff" : "rgba(245,245,245,0.5)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Size</div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 12 }}>
                        {([{ v: "sm", l: "Small" }, { v: "md", l: "Medium" }, { v: "lg", l: "Large" }] as const).map(o => (
                          <button key={o.v} onClick={() => setHeroButtonSize(o.v)}
                            style={{ padding: "8px 4px", borderRadius: 6, border: heroButtonSize === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: heroButtonSize === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: heroButtonSize === o.v ? "#fff" : "rgba(245,245,245,0.5)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                            {o.l}
                          </button>
                        ))}
                      </div>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Button Color</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <label style={{ width: 24, height: 24, borderRadius: 6, background: heroButtonColor || seller?.primary_color || "#9c7c62", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                            <input type="color" value={heroButtonColor || seller?.primary_color || "#9c7c62"} onChange={e => setHeroButtonColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                          </label>
                          <span style={{ fontSize: 9, color: "rgba(245,245,245,0.42)", fontFamily: "monospace" }}>{heroButtonColor || seller?.primary_color || "#9c7c62"}</span>
                          <button onClick={() => setHeroButtonColor("")} style={{ fontSize: 9, color: "rgba(245,245,245,0.35)", background: "none", border: "none", cursor: "pointer" }}>&#8634;</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", marginTop: 6 }}>Defaults to your brand color. Reset to sync back to it automatically.</div>
                    </div>
                  </div>
                )}
                <div>
                  <label style={labelStyle}>Tagline (Hero Headline)</label>
                  <input value={tagline} onChange={e => setTagline(e.target.value)}
                    placeholder="e.g. Elegance redefined"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 5 }}>The big text in your hero section. 3–6 words works best.</div>
                </div>
                <div>
                  <label style={labelStyle}>Brand Name (Hero)</label>
                  <input value={heroTitle} onChange={e => setHeroTitle(e.target.value)}
                    placeholder="Your store name"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>The large brand name in your hero. Leave blank to hide it.</div>
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={3} placeholder="A short sentence about your brand..."
                    style={{ ...inputStyle, resize: "vertical" }} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>Shown in the hero section and footer About blurb.</div>
                </div>
                <div>
                  <label style={labelStyle}>Button Text</label>
                  <input value={heroCta} onChange={e => setHeroCta(e.target.value)}
                    placeholder="Shop Now"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>The call-to-action button in your hero. Leave blank for &quot;Shop Now&quot;.</div>
                  <div style={{ height: 10 }} />
                  <CtaTargetPicker target={heroCtaTarget} onChange={setHeroCtaTarget} collections={seller?.collections || []} />
                </div>
                <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Color Scheme</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {([
                      { label: "Page Background", value: bgColor, set: setBgColor, reset: "#f6f3ef" },
                      { label: "Text Color", value: textColor, set: setTextColor, reset: "#2a2a2e" },
                      { label: "Muted Text", value: mutedColor, set: setMutedColor, reset: "#8a8690" },
                    ] as const).map(({ label, value, set, reset }) => (
                      <div key={label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <label style={{ width: 24, height: 24, borderRadius: 6, background: value, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                            <input type="color" value={value} onChange={e => set(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                          </label>
                          <span style={{ fontSize: 9, color: "rgba(245,245,245,0.42)", fontFamily: "monospace" }}>{value}</span>
                          <button onClick={() => set(reset)} style={{ fontSize: 9, color: "rgba(245,245,245,0.35)", background: "none", border: "none", cursor: "pointer" }}>&#8634;</button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", marginTop: 8 }}>Customize your store&apos;s palette. Brand color is set in Dashboard &rarr; Edit My Store.</div>
                </div>
                <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Typography</div>
                  {(() => {
                    const FONT_PAIR_OPTIONS = [
                      { key: "cormorant-jost", heading: "Cormorant Garamond", body: "Jost" },
                      { key: "playfair-lato", heading: "Playfair Display", body: "Lato" },
                      { key: "dm-serif-inter", heading: "DM Serif Display", body: "Inter" },
                      { key: "libre-raleway", heading: "Libre Baskerville", body: "Raleway" },
                      { key: "fraunces-outfit", heading: "Fraunces", body: "Outfit" },
                      { key: "eb-garamond-source", heading: "EB Garamond", body: "Source Sans" },
                      { key: "bodoni-montserrat", heading: "Bodoni Moda", body: "Montserrat" },
                      { key: "josefin-sans", heading: "Josefin Sans", body: "Josefin Sans" },
                      { key: "tenor-work", heading: "Tenor Sans", body: "Work Sans" },
                      { key: "cinzel-nunito", heading: "Cinzel", body: "Nunito Sans" },
                      { key: "spectral-manrope", heading: "Spectral", body: "Manrope" },
                      { key: "unbounded-karla", heading: "Unbounded", body: "Karla" },
                    ] as const;
                    return (
                      <select
                        value={fontPair}
                        onChange={(e) => setFontPair(e.target.value as typeof fontPair)}
                        style={{ ...inputStyle, colorScheme: "dark" }}
                      >
                        {FONT_PAIR_OPTIONS.map((fp) => (
                          <option key={fp.key} value={fp.key}>{fp.heading} / {fp.body}</option>
                        ))}
                      </select>
                    );
                  })()}
                  <div style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", marginTop: 8 }}>Choose a font pair — changes apply live across your entire store.</div>
                </div>
                <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Header</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {seller?.template === "soft-luxury" && (
                      <div style={{ marginBottom: 6 }}>
                        <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Nav Style</div>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 6 }}>
                          {([{ v: "icons", l: "Icons", d: "Menu, search, cart icons" }, { v: "minimal", l: "Minimal Text", d: "SEARCH · BAG · MENU" }] as const).map(o => (
                            <button key={o.v} onClick={() => setHeaderStyle(o.v)}
                              style={{ display: "flex", flexDirection: "column", gap: 2, padding: "8px 10px", borderRadius: 6, border: headerStyle === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: headerStyle === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: headerStyle === o.v ? "#fff" : "rgba(245,245,245,0.5)", cursor: "pointer", transition: "all 0.2s", textAlign: "left" }}>
                              <span style={{ fontSize: 11, fontWeight: headerStyle === o.v ? 600 : 400 }}>{o.l}</span>
                              <span style={{ fontSize: 9, color: "rgba(245,245,245,0.35)" }}>{o.d}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={headerTransparent} onChange={e => setHeaderTransparent(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                      <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Transparent header (overlays hero image)</span>
                    </label>
                    {headerTransparent && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Icon &amp; Text Color</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <label style={{ width: 24, height: 24, borderRadius: 6, background: headerTransparentColor, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                            <input type="color" value={headerTransparentColor} onChange={e => setHeaderTransparentColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                          </label>
                          <span style={{ fontSize: 9, color: "rgba(245,245,245,0.42)", fontFamily: "monospace" }}>{headerTransparentColor}</span>
                          <button onClick={() => setHeaderTransparentColor("#ffffff")} style={{ fontSize: 9, color: "rgba(245,245,245,0.35)", background: "none", border: "none", cursor: "pointer" }}>&#8634;</button>
                        </div>
                      </div>
                    )}
                    {headerTransparent && (
                      <div style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", padding: "0 2px" }}>Only used while the header is overlapping your hero image. Switch to a dark color if your banner is light.</div>
                    )}
                    <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                      <input type="checkbox" checked={headerBorder} onChange={e => setHeaderBorder(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                      <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show header border line</span>
                    </label>
                  </div>
                </div>

                {seller?.template === "soft-luxury" && (
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Newsletter</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                        <input type="checkbox" checked={showNewsletter} onChange={e => setShowNewsletter(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                        <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show email signup at the bottom of the hero</span>
                      </label>
                      {showNewsletter && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          <div>
                            <input value={newsletterLabel} onChange={e => setNewsletterLabel(e.target.value)}
                              placeholder="Newsletter" style={inputStyle} />
                            <div style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", marginTop: 6 }}>Label above the email field.</div>
                          </div>
                          <div>
                            <input value={newsletterCopyright} onChange={e => setNewsletterCopyright(e.target.value)}
                              placeholder={`©${new Date().getFullYear()} ${(seller?.store_name || "YOUR STORE").toUpperCase()}`} style={inputStyle} />
                            <div style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", marginTop: 6 }}>Copyright line under the signup form. Leave blank to auto-fill with your store name and the current year.</div>
                          </div>
                          <div style={{ fontSize: 12, color: "rgba(245,245,245,0.45)" }}>Subscribers are viewable from Newsletter in the sidebar.</div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {seller?.template === "soft-luxury" && (
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 4 }}>Countdown Pill</div>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 12 }}>Shown just under the header when a discount code has "Show countdown" enabled. Only one discount displays at a time — it needs "Applies To" set to Cart or Shipping, Active, and a future expiry date.</div>

                    <label style={labelStyle}>Background Style</label>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 10 }}>
                      {([{ v: "glass", l: "Glass" }, { v: "transparent", l: "Transparent" }, { v: "color", l: "Color" }] as const).map(o => (
                        <button key={o.v} onClick={() => setPromoBgStyle(o.v)}
                          style={{ padding: "8px 4px", borderRadius: 6, border: promoBgStyle === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: promoBgStyle === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: promoBgStyle === o.v ? "#fff" : "rgba(245,245,245,0.5)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                          {o.l}
                        </button>
                      ))}
                    </div>

                    {[
                      ...(promoBgStyle === "color" ? [{ label: "Background", value: promoBgColor, setValue: setPromoBgColor, fallback: "", fallbackLabel: "auto" }] : []),
                      { label: "Text", value: promoTextColor, setValue: setPromoTextColor, fallback: textColor, fallbackLabel: "default" },
                      { label: "Timer", value: promoTimerColor, setValue: setPromoTimerColor, fallback: seller?.primary_color || "#9c7c62", fallbackLabel: "brand color" },
                    ].map((c) => (
                      <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ width: 28, height: 28, borderRadius: 6, background: c.value || c.fallback || "#9c7c62", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                            <input type="color" value={c.value || c.fallback || "#9c7c62"} onChange={e => c.setValue(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                          </label>
                          <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{c.value || `(${c.fallbackLabel})`}</span>
                          {c.value && <button onClick={() => c.setValue("")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* HERO — 4regn (banner_url + focal point, like Soft Luxury, plus
                Heirloom-style hero copy/CTA/countdown fields). No transparent-
                header or split-layout options -- the storefront's header is a
                fixed solid black bar and the hero is a single full-bleed
                layout, so those controls would do nothing here. */}
            {activeSection === "hero" && seller?.template === "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Background Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero image</div></div>}
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroImagePreview(localUrl); postUpdate({ heroImage: localUrl }); };
                      reader.readAsDataURL(f);
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_image_${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); const finalUrl = data.publicUrl; setHeroImagePreview(finalUrl); setHeroImageUrl(finalUrl); postUpdate({ heroImage: finalUrl }); }
                    }} style={{ display: "none" }} />
                  {heroImagePreview && <button onClick={() => { setHeroImagePreview(""); setHeroImageUrl(""); postUpdate({ heroImage: "" }); }} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                </div>

                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <label style={labelStyle}>Banner Position</label>
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Click or drag on the preview to pick the exact point that stays visible on desktop -- fixes portrait banners getting cropped oddly on wide screens.</div>
                  <div style={{ marginBottom: 16 }}>
                    <FocalPointPicker value={heroImagePosition} onChange={setHeroImagePosition} imageUrl={heroImagePreview} />
                  </div>
                </div>

                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <label style={labelStyle}>Hero Label</label>
                  <input value={heroLabel} onChange={e => setHeroLabel(e.target.value)} placeholder="e.g. NEW SEASON" style={inputStyle} />
                  <div style={hintStyle}>The smaller line above the headline.</div>
                </div>

                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <label style={{ ...labelStyle, display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="checkbox" checked={showHeroPill} onChange={e => setShowHeroPill(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                    Promo Pill
                  </label>
                  <input value={heroPillLabel} onChange={e => setHeroPillLabel(e.target.value)}
                    placeholder="e.g. 7 YEAR ANNIVERSARY SALE" style={{ ...inputStyle, marginTop: 8 }} disabled={!showHeroPill} />
                  <div style={hintStyle}>Small rounded label shown above the hero content -- a manual marketing callout you set yourself, separate from any per-product sale badges shown on individual products.</div>
                </div>

                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <label style={labelStyle}>Offer Callout</label>
                  <textarea value={heroOfferHeadline} onChange={e => setHeroOfferHeadline(e.target.value)} rows={2}
                    placeholder={"Buy any 2 oversized graphic tees\nGet a 3rd tee free"} style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
                  <div style={{ ...hintStyle, marginTop: 4, marginBottom: 10 }}>
                    BOGO-style callout above the headline. Use a line break for the second line. Any number (2, 3rd) and a trailing &quot;free&quot; are automatically highlighted and pulse in red -- type it plainly, no special formatting needed. Leave empty to hide.
                  </div>
                  <input value={heroOfferNote} onChange={e => setHeroOfferNote(e.target.value)}
                    placeholder="e.g. Discount applied automatically at checkout." style={inputStyle} />
                  <div style={hintStyle}>Small fine-print line directly under the offer. Leave empty to hide.</div>
                </div>

                <div>
                  <label style={labelStyle}>Hero Headline</label>
                  <textarea value={heroHeadline} onChange={e => setHeroHeadline(e.target.value)} rows={3} placeholder={seller?.tagline || seller?.store_name || "Built to outlast the season."} style={{ ...inputStyle, resize: "vertical", minHeight: 80 }} />
                  <div style={hintStyle}>Leave empty to fall back to your store tagline.</div>
                </div>

                <div>
                  <label style={labelStyle}>Hero Body</label>
                  <textarea value={heroBody} onChange={e => setHeroBody(e.target.value)} rows={3} placeholder={seller?.description || "Short sentence under the headline."} style={{ ...inputStyle, resize: "vertical", minHeight: 64 }} />
                  <div style={hintStyle}>Leave empty to fall back to your store description.</div>
                </div>

                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Primary Button</div>
                  <input value={heroCtaPrimary} onChange={e => setHeroCtaPrimary(e.target.value)} placeholder="Shop the Collection" style={inputStyle} />
                  <div style={{ height: 10 }} />
                  <CtaTargetPicker target={heroCtaPrimaryTarget} onChange={setHeroCtaPrimaryTarget} collections={seller.collections || []} />
                </div>

                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Secondary Button <span style={{ fontWeight: 400, color: "rgba(245,245,245,0.3)" }}>(optional)</span></div>
                  <input value={heroCtaSecondary} onChange={e => setHeroCtaSecondary(e.target.value)} placeholder="e.g. View Collection — leave blank to hide" style={inputStyle} />
                  <div style={{ height: 10 }} />
                  <CtaTargetPicker target={heroCtaSecondaryTarget} onChange={setHeroCtaSecondaryTarget} collections={seller.collections || []} />
                </div>

                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Sale Countdown</div>
                  <input value={heroSaleHeadline} onChange={e => setHeroSaleHeadline(e.target.value)}
                    placeholder="e.g. Summer Sale" style={inputStyle} />
                  <div style={{ ...hintStyle, marginTop: 4, marginBottom: 12 }}>
                    Big headline shown above the countdown. Leave empty to hide.
                  </div>
                  <input value={heroCountdownLabel} onChange={e => setHeroCountdownLabel(e.target.value)}
                    placeholder="e.g. Limited drop ends in" style={inputStyle} />
                  <div style={{ ...hintStyle, marginTop: 8 }}>
                    Smaller label above the countdown timer. Leave empty to auto-show
                    &quot;<em>{`<CODE>`}</em> ends in&quot; based on the active
                    discount. The timer itself only appears when a real discount
                    code with &quot;Show Countdown&quot; is active — manage codes
                    in <strong>Dashboard → Discounts</strong>.
                  </div>
                </div>

                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <label style={labelStyle}>Promo Disclaimer</label>
                  <input value={heroDisclaimer} onChange={e => setHeroDisclaimer(e.target.value)}
                    placeholder="e.g. Choose any 3 eligible tees. Lowest-priced tee is free." style={inputStyle} />
                  <div style={hintStyle}>Small fine-print line under the buttons, e.g. terms for the promo pill above. Leave empty to hide.</div>
                </div>
              </div>
            )}

            {/* SETLA PROMO STRIP — 4regn only. Links to the SETLA marketing
                subdomain are fixed (platform routing, not brand content),
                so only the surrounding copy and the show/hide toggle are
                editable here. */}
            {activeSection === "setla" && seller?.template === "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={showSetlaBanner} onChange={e => setShowSetlaBanner(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show the SETLA promo strip under the hero</span>
                </label>

                <div>
                  <label style={labelStyle}>Photo</label>
                  <div onClick={() => setlaPhotoRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {setlaPhotoUrl
                      ? <img src={setlaPhotoUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Optional — customers wearing your clothing works best</div></div>}
                  </div>
                  <input ref={setlaPhotoRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/setla_photo_${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); setSetlaPhotoUrl(data.publicUrl); }
                    }} style={{ display: "none" }} />
                  {setlaPhotoUrl && <button onClick={() => setSetlaPhotoUrl("")} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                </div>

                <div>
                  <label style={labelStyle}>Badge Text</label>
                  <input value={setlaBadge} onChange={e => setSetlaBadge(e.target.value)} placeholder="Interest-free SETLA payment options" style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Eyebrow</label>
                  <input value={setlaEyebrow} onChange={e => setSetlaEyebrow(e.target.value)} placeholder={`Flexible payments on ${seller.store_name}`} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Lead Text</label>
                  <textarea value={setlaLead} onChange={e => setSetlaLead(e.target.value)} rows={3} placeholder="Eligible customers can shop with SETLA and split selected purchases into interest-free instalments..." style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                </div>

                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Primary Button</div>
                  <input value={setlaCtaPrimary} onChange={e => setSetlaCtaPrimary(e.target.value)} placeholder="Discover my SETLA limit" style={inputStyle} />
                  <div style={hintStyle}>Links to SETLA sign-up. The destination isn&apos;t editable here — only the label.</div>
                </div>

                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Secondary Button</div>
                  <input value={setlaCtaSecondary} onChange={e => setSetlaCtaSecondary(e.target.value)} placeholder="See how SETLA works" style={inputStyle} />
                  <div style={hintStyle}>Links to the SETLA FAQ. The destination isn&apos;t editable here — only the label.</div>
                </div>

                <div>
                  <label style={labelStyle}>Fine Print</label>
                  <textarea value={setlaNote} onChange={e => setSetlaNote(e.target.value)} rows={2} placeholder="Subject to eligibility and affordability assessment..." style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
                </div>
              </div>
            )}

            {/* SHOP BY GENDER — 4regn only. The MEN/WOMEN category tiles
                themselves aren't editable here -- they're derived straight
                from the seller's real Collections list (any collection
                named "Men <thing>" / "Women <thing>", plus "ALL MEN" /
                "ALL WOMEN" for the Shop All buttons). Manage that list from
                Dashboard → Collections; only the section's show/hide toggle
                and heading copy live here. */}
            {activeSection === "shopbygender" && seller?.template === "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={showShopByGender} onChange={e => setShowShopByGender(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show the Shop by Gender section</span>
                </label>

                <div>
                  <label style={labelStyle}>Eyebrow</label>
                  <input value={shopByGenderEyebrow} onChange={e => setShopByGenderEyebrow(e.target.value)} placeholder={`${seller.store_name} Collection`} style={inputStyle} />
                </div>

                <div>
                  <label style={labelStyle}>Heading</label>
                  <input value={shopByGenderHeading} onChange={e => setShopByGenderHeading(e.target.value)} placeholder="Shop by Category" style={inputStyle} />
                </div>

                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  The MEN and WOMEN category tiles come from your real Collections list — add collections named &quot;Men Tops&quot;, &quot;Women Dresses&quot;, etc. (and &quot;ALL MEN&quot; / &quot;ALL WOMEN&quot; for the Shop All buttons) from <strong>Dashboard → Collections</strong>. A gender panel only appears once it has at least one matching collection.
                </div>
              </div>
            )}

            {/* WINTER ESSENTIALS COVERFLOW — 4regn only */}
            {activeSection === "winter-essentials" && seller?.template === "4regn" && (() => {
              const winterTagged = (pickerProducts || []).filter(p =>
                (p.category || "").split(",").map(c => c.trim()).includes("WINTER ESSENTIALS")
              );
              const resolveThumb = (entry: string) => {
                if (entry.startsWith("http") || entry.startsWith("/")) return entry;
                return (pickerProducts || []).find(p => p.id === entry)?.image_url || null;
              };
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Scroll Speed</label>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <input type="range" min={0.2} max={2} step={0.1} value={winterSpeed}
                        onChange={e => setWinterSpeed(parseFloat(e.target.value))}
                        style={{ flex: 1, accentColor: "#9c7c62" }} />
                      <span style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", width: 32, textAlign: "right" }}>{winterSpeed.toFixed(1)}</span>
                    </div>
                    <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", marginTop: 4 }}>Higher is faster. Default 0.6.</div>
                  </div>

                  <div>
                    <label style={labelStyle}>Slides</label>
                    <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", marginBottom: 8 }}>
                      Drag to reorder. Leave empty to automatically show every product tagged &quot;WINTER ESSENTIALS&quot;, in catalog order.
                    </div>
                    {winterSlides.length === 0 ? (
                      <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)" }}>
                        Using automatic order ({winterTagged.length} tagged product{winterTagged.length !== 1 ? "s" : ""}).
                      </div>
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {winterSlides.map((entry, i) => {
                          const thumb = resolveThumb(entry);
                          return (
                            <div key={i}
                              draggable
                              onDragStart={() => setWinterDragIdx(i)}
                              onDragOver={e => e.preventDefault()}
                              onDrop={e => {
                                e.preventDefault();
                                if (winterDragIdx === null || winterDragIdx === i) return;
                                const u = [...winterSlides];
                                const [item] = u.splice(winterDragIdx, 1);
                                u.splice(i, 0, item);
                                setWinterSlides(u);
                                setWinterDragIdx(null);
                              }}
                              onDragEnd={() => setWinterDragIdx(null)}
                              style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "grab", opacity: winterDragIdx === i ? 0.4 : 1 }}>
                              <span style={{ color: "rgba(245,245,245,0.3)", fontSize: 13 }}>⠿</span>
                              {thumb ? (
                                <img src={thumb} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} />
                              ) : (
                                <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />
                              )}
                              <span style={{ flex: 1, fontSize: 11, color: "rgba(245,245,245,0.4)" }}>
                                {entry.startsWith("http") || entry.startsWith("/") ? "Uploaded image" : ((pickerProducts || []).find(p => p.id === entry)?.name || "Product")}
                              </span>
                              <button onClick={() => setWinterSlides(winterSlides.filter((_, j) => j !== i))}
                                style={{ width: 24, height: 24, borderRadius: "50%", background: "rgba(255,107,53,0.08)", border: "none", color: "#ff6b35", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>×</button>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  <div style={{ display: "flex", gap: 10 }}>
                    <button type="button" onClick={loadWinterPicker}
                      style={{ flex: 1, fontSize: 12, color: "rgba(245,245,245,0.6)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                      + Add from Winter Essentials products
                    </button>
                    <label style={{ flex: 1, textAlign: "center", fontSize: 12, color: "rgba(245,245,245,0.6)", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: "8px 10px", cursor: "pointer" }}>
                      + Upload custom image
                      <input type="file" accept="image/*" style={{ display: "none" }} onChange={async e => {
                        const f = e.target.files?.[0]; if (!f || !seller) return;
                        const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
                        const path = `${seller.id}/winter_essentials_${Date.now()}.${ext}`;
                        const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                        if (!error) {
                          const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
                          setWinterSlides([...winterSlides, data.publicUrl]);
                        }
                      }} />
                    </label>
                  </div>

                  {winterPickerOpen && (
                    pickerLoading ? (
                      <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", padding: "8px 0" }}>Loading your products…</div>
                    ) : winterTagged.length === 0 ? (
                      <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", padding: "8px 0" }}>No products tagged &quot;WINTER ESSENTIALS&quot; yet.</div>
                    ) : (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 6, maxHeight: 200, overflowY: "auto", padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                        {winterTagged.map(p => (
                          <button key={p.id} type="button" title={p.name}
                            onClick={() => setWinterSlides([...winterSlides, p.id])}
                            style={{ padding: 0, border: winterSlides.includes(p.id) ? "2px solid #9c7c62" : "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", overflow: "hidden", background: "none", aspectRatio: "1", lineHeight: 0 }}>
                            <img src={p.image_url!} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                          </button>
                        ))}
                      </div>
                    )
                  )}
                </div>
              );
            })()}

            {/* HERO — Crown (store_config.hero_image based) */}
            {activeSection === "hero" && seller?.template === "crown" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Background Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero image</div></div>
                    }
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroImagePreview(localUrl); postUpdate({ heroImage: localUrl }); };
                      reader.readAsDataURL(f);
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_image.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) {
                        const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
                        const finalUrl = data.publicUrl + "?t=" + Date.now();
                        setHeroImagePreview(finalUrl);
                        setHeroImageUrl(finalUrl);
                        postUpdate({ heroImage: finalUrl });
                      }
                    }}
                    style={{ display: "none" }} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>Full-screen background on your homepage. Different from your logo.</div>
                </div>
                <div>
                  <label style={labelStyle}>Hero Video (optional)</label>
                  <div onClick={() => heroVideoRef.current?.click()}
                    style={{ width: "100%", height: 80, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroVideoUrl
                      ? <span style={{ fontSize: 12, color: "rgba(245,245,245,0.6)" }}>Video uploaded ✓</span>
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={22} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero video</div></div>
                    }
                  </div>
                  <input ref={heroVideoRef} type="file" accept="video/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_video.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) {
                        const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
                        setHeroVideoUrl(data.publicUrl + "?t=" + Date.now());
                      }
                    }}
                    style={{ display: "none" }} />
                  {heroVideoUrl && <button onClick={() => setHeroVideoUrl("")} style={{ marginTop: 6, fontSize: 12, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>When set, this plays instead of the hero image.</div>
                </div>
                <div>
                  <label style={labelStyle}>Tagline (Hero Headline)</label>
                  <input value={tagline} onChange={e => setTagline(e.target.value)}
                    placeholder="e.g. Wear your crown with confidence"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 5 }}>The big text on your homepage. 5–8 words works best.</div>
                </div>
                <div>
                  <label style={labelStyle}>Hero Subtext</label>
                  <input value={heroSubtext} onChange={e => setHeroSubtext(e.target.value)}
                    placeholder="e.g. Premium Hair Collection · SA Delivered"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>Small uppercase text above the main headline. Leave empty to hide.</div>
                </div>
                <div>
                  <label style={labelStyle}>Subtitle</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={3} placeholder="Short description under the headline..."
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Headline Color</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ width: 28, height: 28, borderRadius: 6, background: heroTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                        <input type="color" value={heroTextColor} onChange={e => setHeroTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{heroTextColor}</span>
                      <button onClick={() => setHeroTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* HERO — Rosefields (hero_title + tagline + description) */}
            {activeSection === "hero" && seller?.template === "rosefields" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero image</div></div>
                    }
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroImagePreview(localUrl); postUpdate({ heroImage: localUrl }); };
                      reader.readAsDataURL(f);
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_image_${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); const finalUrl = data.publicUrl; setHeroImagePreview(finalUrl); setHeroImageUrl(finalUrl); postUpdate({ heroImage: finalUrl }); }
                    }} style={{ display: "none" }} />
                  {heroImagePreview && <button onClick={() => { setHeroImagePreview(""); setHeroImageUrl(""); postUpdate({ heroImage: "" }); }} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>The bouquet photo behind your homepage hero. Sized to fit the photo — no cropping to a fixed height.</div>
                </div>
                <div>
                  <label style={labelStyle}>Hero Title</label>
                  <input value={heroTitle} onChange={e => setHeroTitle(e.target.value)}
                    placeholder="Every Bouquet"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 5 }}>The large headline. 2–4 words works best.</div>
                </div>
                <div>
                  <label style={labelStyle}>Script Tagline</label>
                  <input value={tagline} onChange={e => setTagline(e.target.value)}
                    placeholder="Tells a Story"
                    style={inputStyle} />
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>The italic script line under the headline.</div>
                </div>
                <div>
                  <label style={labelStyle}>Description</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={3} placeholder="Luxury roses handcrafted with love for life's most meaningful moments."
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
              </div>
            )}

            {/* HERO — Velour */}
            {activeSection === "hero" && seller?.template === "velour" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={26} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload hero photo</div></div>
                    }
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      const reader = new FileReader();
                      reader.onload = ev => { const localUrl = ev.target?.result as string; setHeroImagePreview(localUrl); postUpdate({ heroImage: localUrl }); };
                      reader.readAsDataURL(f);
                      const ext = f.name.split(".").pop();
                      const path = `${seller.id}/hero_image_${Date.now()}.${ext}`;
                      const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); const finalUrl = data.publicUrl; setHeroImagePreview(finalUrl); setHeroImageUrl(finalUrl); postUpdate({ heroImage: finalUrl }); }
                    }} style={{ display: "none" }} />
                  {heroImagePreview && <button onClick={() => { setHeroImagePreview(""); setHeroImageUrl(""); postUpdate({ heroImage: "" }); }} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                </div>
                <div>
                  <label style={labelStyle}>Brand Name</label>
                  <input value={brandName} onChange={e => setBrandName(e.target.value)} placeholder="GracefulBeaty" style={inputStyle} />
                  <div style={hintStyle}>The large name shown in the hero, nav and footer. Defaults to your store name, but you can set a different public-facing brand name here.</div>
                </div>
                <div>
                  <label style={labelStyle}>Brand Subtitle</label>
                  <input value={brandSubtitle} onChange={e => setBrandSubtitle(e.target.value)} placeholder="by Lebo Coka" style={inputStyle} />
                  <div style={hintStyle}>Shown smaller, directly under your brand name.</div>
                </div>
                <div>
                  <label style={labelStyle}>Motto</label>
                  <input value={tagline} onChange={e => setTagline(e.target.value)} placeholder="Enhancing Beauty. Empowering You." style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Hero Body Text</label>
                  <textarea value={heroSubtext} onChange={e => setHeroSubtext(e.target.value)} rows={3}
                    placeholder="Professional makeup artistry and hair installation services — in studio or at your door."
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div>
                  <label style={labelStyle}>Hero Eyebrow</label>
                  <input value={heroLabel} onChange={e => setHeroLabel(e.target.value)} placeholder="Makeup Artist · Hair Specialist" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Monogram Letters</label>
                  <input value={monogramLetters} onChange={e => setMonogramLetters(e.target.value.slice(0, 3))} placeholder="LC" style={inputStyle} />
                  <div style={hintStyle}>Shown as a ghost watermark in the hero and chat avatar.</div>
                </div>
                <div>
                  <label style={labelStyle}>City</label>
                  <input value={velourCity} onChange={e => setVelourCity(e.target.value)} placeholder="Durban" style={inputStyle} />
                </div>
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                    <input type="checkbox" checked={calloutAvailable} onChange={e => setCalloutAvailable(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                    <label style={{ fontSize: 13 }}>Offer callout (mobile) service</label>
                  </div>
                  {calloutAvailable && (
                    <div>
                      <label style={labelStyle}>Callout Area</label>
                      <input value={calloutArea} onChange={e => setCalloutArea(e.target.value)} placeholder="Available across Durban" style={inputStyle} />
                    </div>
                  )}
                </div>
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 10 }}>Business Hours</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    <div><label style={labelStyle}>Weekdays</label><input value={hoursWeekdays} onChange={e => setHoursWeekdays(e.target.value)} placeholder="08:00–18:00" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Saturday</label><input value={hoursSaturday} onChange={e => setHoursSaturday(e.target.value)} placeholder="09:00–16:00" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Sunday</label><input value={hoursSunday} onChange={e => setHoursSunday(e.target.value)} placeholder="By Appointment" style={inputStyle} /></div>
                  </div>
                </div>
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 4 }}>Accent Color</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                    <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)" }}>Gold Accent</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ width: 28, height: 28, borderRadius: 6, background: accentColor || "#C9A96E", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                        <input type="color" value={accentColor || "#C9A96E"} onChange={e => setAccentColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                      </label>
                      <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{accentColor || "#C9A96E"}{!accentColor && " (default)"}</span>
                      {accentColor && <button onClick={() => setAccentColor("")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>}
                    </div>
                  </div>
                  <div style={hintStyle}>Your primary brand color is set from Dashboard → My Store → Branding.</div>
                </div>
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 10 }}>Payment Methods Shown in Footer</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {[{ v: "visa", label: "Visa" }, { v: "mastercard", label: "Mastercard" }, { v: "applepay", label: "Apple Pay" }, { v: "googlepay", label: "Google Pay" }, { v: "eft", label: "EFT" }].map(opt => (
                      <div key={opt.v} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <input type="checkbox" checked={paymentMethods.includes(opt.v)} onChange={e => setPaymentMethods(prev => e.target.checked ? [...prev, opt.v] : prev.filter(x => x !== opt.v))} style={{ accentColor: "#9c7c62" }} />
                        <label style={{ fontSize: 13 }}>{opt.label}</label>
                      </div>
                    ))}
                  </div>
                </div>
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 10 }}>Contact Info</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div><label style={labelStyle}>Email</label><input value={contactEmail} onChange={e => setContactEmail(e.target.value)} placeholder="e.g. hello@yourstudio.co.za" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Phone</label><input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="e.g. 081 540 5149" style={inputStyle} /></div>
                    <div><label style={labelStyle}>Studio Address</label><textarea value={physicalAddress} onChange={e => setPhysicalAddress(e.target.value)} rows={2} placeholder="West Walk Building, 6th Floor, Office 620B" style={{ ...inputStyle, resize: "vertical" }} /></div>
                  </div>
                </div>
                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 10 }}>Socials &amp; WhatsApp</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div><label style={labelStyle}>Instagram URL</label><input value={velourInstagram} onChange={e => setVelourInstagram(e.target.value)} placeholder="https://instagram.com/yourbrand" style={inputStyle} /></div>
                    <div><label style={labelStyle}>TikTok URL</label><input value={velourTiktok} onChange={e => setVelourTiktok(e.target.value)} placeholder="https://tiktok.com/@yourbrand" style={inputStyle} /></div>
                    <div><label style={labelStyle}>WhatsApp Number</label><input value={velourWhatsapp} onChange={e => setVelourWhatsapp(e.target.value)} placeholder="27815405149" style={inputStyle} /></div>
                  </div>
                  <div style={hintStyle}>Used for the footer social icons, the chat widget WhatsApp fallback, and booking WhatsApp confirmations. Services and bookings are managed from the Services and Bookings pages in your dashboard.</div>
                </div>
              </div>
            )}

            {/* SHOP BY OCCASION — Rosefields */}
            {activeSection === "occasions" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 12, color: "rgba(245,245,245,0.6)", lineHeight: 1.6 }}>
                  The occasion list (Anniversary, Birthday, Proposal, etc.) isn&apos;t editable yet — it&apos;s a fixed set for now. Each one scrolls a visitor to your products when tapped.
                </div>
              </div>
            )}

            {/* PROMO TICKER */}
            {activeSection === "ticker" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                {(seller?.template === "soft-luxury" || seller?.template === "glass-futuristic" || seller?.template === "crown") && (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={showMarquee} onChange={e => setShowMarquee(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                    <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show this section on my store</span>
                  </label>
                )}
                <label style={labelStyle}>Marquee Messages</label>
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>These scroll across the top of your store. One message per line.</div>
                {marqueeTexts.map((txt, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <input value={txt}
                      onChange={e => { const u = [...marqueeTexts]; u[i] = e.target.value; setMarqueeTexts(u); }}
                      placeholder="e.g. FREE DELIVERY OVER R500"
                      style={{ ...inputStyle, flex: 1 }} />
                    {marqueeTexts.length > 1 && (
                      <button onClick={() => setMarqueeTexts(marqueeTexts.filter((_, j) => j !== i))}
                        style={{ width: 32, height: 38, background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 6, color: "#ff6b35", cursor: "pointer", fontSize: 14 }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setMarqueeTexts([...marqueeTexts, ""])}
                  style={{ padding: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(245,245,245,0.4)", cursor: "pointer", fontSize: 12 }}>
                  + Add message
                </button>
                <div style={{ marginTop: 8 }}>
                  <label style={{ ...labelStyle, display: "flex", justifyContent: "space-between" }}>
                    <span>Scroll Speed</span>
                    <span style={{ color: "rgba(245,245,245,0.4)" }}>{marqueeSpeed}s</span>
                  </label>
                  <input type="range" min={8} max={60} value={marqueeSpeed} onChange={e => setMarqueeSpeed(Number(e.target.value))}
                    style={{ width: "100%", marginTop: 6, accentColor: "#c4a265" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "rgba(245,245,245,0.5)", marginTop: 2 }}>
                    <span>Fast</span><span>Slow</span>
                  </div>
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Suggested</label>
                  {["FREE DELIVERY ON ORDERS OVER R500", "UP TO 50% OFF ON SELECTED ITEMS", "NEW ARRIVALS JUST DROPPED", "LIMITED STOCK — ORDER NOW"].map(preset => (
                    <button key={preset} onClick={() => { if (!marqueeTexts.includes(preset)) setMarqueeTexts([...marqueeTexts, preset]); }}
                      style={{ display: "block", width: "100%", marginBottom: 4, padding: "7px 10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, color: "rgba(245,245,245,0.4)", cursor: "pointer", fontSize: 10, textAlign: "left", letterSpacing: "0.04em" }}>
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* CIRCLE STRIP */}
            {activeSection === "circle" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Section Title</label>
                <input value={circleTitle} onChange={e => setCircleTitle(e.target.value)}
                  placeholder="e.g. Shop by Texture"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Small uppercase label above the circles. Leave empty to hide.</div>
                <label style={labelStyle}>Section Subtitle</label>
                <input value={circleSubtitle} onChange={e => setCircleSubtitle(e.target.value)}
                  placeholder="e.g. Find your signature look"
                  style={inputStyle} />

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: circleTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={circleTextColor} onChange={e => setCircleTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{circleTextColor}</span>
                    <button onClick={() => setCircleTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* PRODUCTS */}
            {activeSection === "products" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Section Label</label>
                <input value={productsLabel} onChange={e => setProductsLabel(e.target.value)}
                  placeholder="e.g. The Edit"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Small uppercase text above the heading.</div>
                <label style={labelStyle}>Section Heading</label>
                <input value={productsHeading} onChange={e => setProductsHeading(e.target.value)}
                  placeholder="e.g. Latest arrivals"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>The big heading above your products grid.</div>
                <label style={labelStyle}>Image Shape</label>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                  {[{ v: "3/4", l: "Portrait" }, { v: "1/1", l: "Square" }, { v: "4/3", l: "Landscape" }, { v: "auto", l: "Original" }].map(o => (
                    <button key={o.v} onClick={() => setProductCardRatio(o.v)}
                      style={{ padding: "8px 4px", borderRadius: 6, border: productCardRatio === o.v ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: productCardRatio === o.v ? `${G}15` : "rgba(255,255,255,0.03)", color: productCardRatio === o.v ? "#fff" : "rgba(245,245,245,0.5)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                      {o.l}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>How product images are cropped in the grid.</div>
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  To add or edit products, go to your <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: G, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}>Dashboard →</button>
                </div>
                {(seller?.template === "soft-luxury" || seller?.template === "glass-futuristic") && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 12 }}>Collapsed by default</div>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Click to expand on the storefront</div>
                  </div>
                  <button onClick={() => setProductsCollapsed(!productsCollapsed)} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative", background: productsCollapsed ? G : "rgba(255,255,255,0.08)", transition: "background 0.2s" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: productsCollapsed ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
                </div>
                )}

                {seller?.template === "soft-luxury" && (
                  <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Sale Pills</div>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Discounted products always show a "Sale" pill on the top left.</div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Sale Pill Color</span>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <label style={{ width: 28, height: 28, borderRadius: 6, background: salePillColor || seller?.primary_color || "#9c7c62", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                          <input type="color" value={salePillColor || seller?.primary_color || "#9c7c62"} onChange={e => setSalePillColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                        </label>
                        <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{salePillColor || seller?.primary_color || "#9c7c62"}{!salePillColor && " (brand color)"}</span>
                        {salePillColor && <button onClick={() => setSalePillColor("")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>}
                      </div>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", marginTop: 8 }}>
                      <div>
                        <div style={{ fontSize: 12 }}>Show % off pill</div>
                        <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Adds a "-20%" pill on the top right too</div>
                      </div>
                      <button onClick={() => setShowPercentOffPill(!showPercentOffPill)} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative", background: showPercentOffPill ? G : "rgba(255,255,255,0.08)", transition: "background 0.2s" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: showPercentOffPill ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
                    </div>
                    {showPercentOffPill && (
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>% Off Pill Color</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ width: 28, height: 28, borderRadius: 6, background: percentOffPillColor || seller?.primary_color || "#9c7c62", border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                            <input type="color" value={percentOffPillColor || seller?.primary_color || "#9c7c62"} onChange={e => setPercentOffPillColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                          </label>
                          <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{percentOffPillColor || seller?.primary_color || "#9c7c62"}{!percentOffPillColor && " (brand color)"}</span>
                          {percentOffPillColor && <button onClick={() => setPercentOffPillColor("")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>}
                        </div>
                      </div>
                    )}
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 6 }}>Each pill has its own color — changing one won't affect the other.</div>
                  </div>
                )}

                {seller?.template !== "soft-luxury" && seller?.template !== "glass-futuristic" && (
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: prodTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={prodTextColor} onChange={e => setProdTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{prodTextColor}</span>
                    <button onClick={() => setProdTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                )}
              </div>
            )}

            {/* COLLECTIONS */}
            {activeSection === "collections" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {(seller?.template === "soft-luxury" || seller?.template === "glass-futuristic") && (
                  <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                    <input type="checkbox" checked={showCollections} onChange={e => setShowCollections(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                    <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show this section on my store</span>
                  </label>
                )}
                <label style={labelStyle}>Section Label</label>
                <input value={collLabel} onChange={e => setCollLabel(e.target.value)}
                  placeholder="e.g. Featured Collections"
                  style={inputStyle} />
                <label style={labelStyle}>Section Subtitle</label>
                <input value={collSubtitle} onChange={e => setCollSubtitle(e.target.value)}
                  placeholder="e.g. Find your signature look"
                  style={inputStyle} />

                {seller?.template === "soft-luxury" && (
                  <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <label style={labelStyle}>Layout</label>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 10 }}>Pick how your collections are displayed — a nice way to make your store feel less like everyone else's.</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      {([
                        { key: "lookbook", name: "Lookbook", desc: "Alternating large/small pairs — editorial feel" },
                        { key: "circles", name: "Circles", desc: "Round thumbnails, two per row" },
                        { key: "grid", name: "Grid", desc: "Clean, uniform three-column grid" },
                      ] as const).map((opt) => (
                        <button key={opt.key} onClick={() => setCollectionsLayout(opt.key)}
                          style={{ display: "flex", flexDirection: "column", gap: 2, alignItems: "flex-start", padding: "10px 12px", background: collectionsLayout === opt.key ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.02)", border: collectionsLayout === opt.key ? "1px solid rgba(255,255,255,0.2)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 8, cursor: "pointer", width: "100%", textAlign: "left" }}>
                          <span style={{ fontSize: 13, color: collectionsLayout === opt.key ? "rgba(245,245,245,0.9)" : "rgba(245,245,245,0.5)", fontWeight: collectionsLayout === opt.key ? 500 : 400 }}>{opt.name}</span>
                          <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)" }}>{opt.desc}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <label style={labelStyle}>Collection Order</label>
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 6 }}>Drag to reorder how collections appear on your store. Click a collection&apos;s Visible/Hidden tag to hide it from navigation, the collection grid and the Collections page -- its products stay visible everywhere else (search, other collections, direct links).</div>
                {collOrder.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {collOrder.map((col, i) => (
                      <div key={col}
                        draggable
                        onDragStart={e => { e.dataTransfer.setData("text/plain", String(i)); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={e => e.preventDefault()}
                        onDrop={e => {
                          e.preventDefault();
                          const from = Number(e.dataTransfer.getData("text/plain"));
                          if (from === i) return;
                          const u = [...collOrder];
                          const [item] = u.splice(from, 1);
                          u.splice(i, 0, item);
                          setCollOrder(u);
                        }}
                        style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", cursor: "grab", userSelect: "none" }}>
                          <span style={{ color: "rgba(245,245,245,0.3)", fontSize: 14 }}>⠿</span>
                          <span style={{ flex: 1, fontSize: 13, color: hiddenCollections.includes(col) ? "rgba(245,245,245,0.4)" : undefined }}>{col}</span>
                          <button
                            type="button"
                            onClick={() => setHiddenCollections(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col])}
                            title={hiddenCollections.includes(col) ? "Hidden from browsing -- click to unhide" : "Visible -- click to hide from browsing"}
                            style={{
                              fontSize: 9, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em", padding: "4px 8px", borderRadius: 6, cursor: "pointer",
                              background: hiddenCollections.includes(col) ? "rgba(255,107,53,0.12)" : "rgba(255,255,255,0.06)",
                              border: hiddenCollections.includes(col) ? "1px solid rgba(255,107,53,0.3)" : "1px solid rgba(255,255,255,0.08)",
                              color: hiddenCollections.includes(col) ? "#ff6b35" : "rgba(245,245,245,0.4)",
                            }}
                          >
                            {hiddenCollections.includes(col) ? "Hidden" : "Visible"}
                          </button>
                          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                            <button onClick={() => { if (i === 0) return; const u = [...collOrder]; [u[i-1], u[i]] = [u[i], u[i-1]]; setCollOrder(u); }}
                              style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 4, color: "rgba(245,245,245,0.5)", cursor: "pointer", fontSize: 10, padding: "2px 6px" }}>▲</button>
                            <button onClick={() => { if (i === collOrder.length-1) return; const u = [...collOrder]; [u[i], u[i+1]] = [u[i+1], u[i]]; setCollOrder(u); }}
                              style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 4, color: "rgba(245,245,245,0.5)", cursor: "pointer", fontSize: 10, padding: "2px 6px" }}>▼</button>
                          </div>
                        </div>
                        <div style={{ padding: "0 12px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                          {collectionImages[col] ? (
                            <img src={collectionImages[col]} alt="" style={{ width: 48, height: 48, borderRadius: 6, objectFit: "cover" }} />
                          ) : (
                            <div style={{ width: 48, height: 48, borderRadius: 6, background: "rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, color: "rgba(245,245,245,0.35)" }}>+</div>
                          )}
                          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", gap: 10 }}>
                              <label style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                {collectionImages[col] ? "Change image" : "Upload image"}
                                <input type="file" accept="image/*" onChange={async (e) => {
                                  const f = e.target.files?.[0]; if (!f || !seller) return;
                                  const ext = f.name.split(".").pop()?.toLowerCase() || "jpg";
                                  const path = `${seller.id}/collection_${col.replace(/\s+/g, "_").toLowerCase()}_${Date.now()}.${ext}`;
                                  const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                                  if (!error) {
                                    const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
                                    setCollectionImages(prev => ({ ...prev, [col]: data.publicUrl }));
                                  }
                                }} style={{ display: "none" }} />
                              </label>
                              <button type="button" onClick={() => openCoverPicker(coverPickerFor === col ? "" : col)}
                                style={{ fontSize: 12, color: "rgba(245,245,245,0.45)", background: "none", border: "none", cursor: "pointer", padding: 0, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Choose from product
                              </button>
                            </div>
                            {collectionImages[col] && (
                              <button onClick={() => setCollectionImages(prev => { const n = { ...prev }; delete n[col]; return n; })}
                                style={{ fontSize: 9, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", padding: 0, textAlign: "left", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>
                            )}
                          </div>
                        </div>
                        {coverPickerFor === col && (
                          <div style={{ padding: "0 12px 12px" }}>
                            {pickerLoading ? (
                              <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", padding: "8px 0" }}>Loading your products…</div>
                            ) : (() => {
                              const matches = (pickerProducts || []).filter(p =>
                                (p.category || "").split(",").map(c => c.trim()).includes(col)
                              );
                              if (matches.length === 0) {
                                return <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", padding: "8px 0" }}>No products with an image in this collection yet.</div>;
                              }
                              return (
                                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))", gap: 6, maxHeight: 180, overflowY: "auto", padding: 8, background: "rgba(0,0,0,0.2)", borderRadius: 8 }}>
                                  {matches.map(p => (
                                    <button key={p.id} type="button" title={p.name}
                                      onClick={() => { setCollectionImages(prev => ({ ...prev, [col]: p.image_url! })); setCoverPickerFor(null); }}
                                      style={{ padding: 0, border: collectionImages[col] === p.image_url ? "2px solid #9c7c62" : "1px solid rgba(255,255,255,0.1)", borderRadius: 6, cursor: "pointer", overflow: "hidden", background: "none", aspectRatio: "1", lineHeight: 0 }}>
                                      <img src={p.image_url!} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                                    </button>
                                  ))}
                                </div>
                              );
                            })()}
                          </div>
                        )}
                        <div style={{ padding: "0 12px 12px" }}>
                          <textarea
                            value={collectionDescriptions[col] ?? ""}
                            onChange={e => setCollectionDescriptions(prev => ({ ...prev, [col]: e.target.value }))}
                            placeholder="Optional collection description, shown under the heading on this collection's page..."
                            rows={2}
                            style={{ ...inputStyle, fontSize: 12, resize: "vertical", width: "100%" }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.3)" }}>
                    Collections come from your product categories. Add products with categories in the dashboard first.
                  </div>
                )}
                {(seller?.template === "soft-luxury" || seller?.template === "glass-futuristic") && (
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderTop: "1px solid rgba(255,255,255,0.06)", marginTop: 12 }}>
                  <div>
                    <div style={{ fontSize: 12 }}>Collapsed by default</div>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Click to expand on the storefront</div>
                  </div>
                  <button onClick={() => setCollectionsCollapsed(!collectionsCollapsed)} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative", background: collectionsCollapsed ? G : "rgba(255,255,255,0.08)", transition: "background 0.2s" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: collectionsCollapsed ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
                </div>
                )}
                {seller?.template !== "soft-luxury" && seller?.template !== "glass-futuristic" && (<>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: circleTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={circleTextColor} onChange={e => setCircleTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{circleTextColor}</span>
                    <button onClick={() => setCircleTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: collTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={collTextColor} onChange={e => setCollTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{collTextColor}</span>
                    <button onClick={() => setCollTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                </>)}
              </div>
            )}

            {/* ABOUT — 4regn's "Built for the Culture" brand-story block.
                Separate panel/fields from the generic About section below
                (which other templates use) -- different config keys
                entirely (about_eyebrow, about_heading, about_body,
                about_stat1/2_value/label, about_cta_label vs aboutLabel,
                aboutTitle, description here). */}
            {activeSection === "about" && seller?.template === "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={showAbout4regn} onChange={e => setShowAbout4regn(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show this section on my store</span>
                </label>
                <div>
                  <label style={labelStyle}>Eyebrow</label>
                  <input value={about4regnEyebrow} onChange={e => setAbout4regnEyebrow(e.target.value)} placeholder="e.g. Est. 2019 — South Africa" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Heading</label>
                  <input value={about4regnHeading} onChange={e => setAbout4regnHeading(e.target.value)} placeholder="e.g. Built for the Culture" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Brand Story</label>
                  <textarea value={about4regnBody} onChange={e => setAbout4regnBody(e.target.value)} rows={6}
                    placeholder={"Founded in 2019 by...\n\nWe don't just offer clothing — we create an experience..."}
                    style={{ ...inputStyle, resize: "vertical" }} />
                  <div style={hintStyle}>Use a blank line between paragraphs. Leave empty to use the default story text.</div>
                </div>
                <div style={ctaCardStyle}>
                  <div style={ctaCardTitle}>Stats Row</div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <input value={about4regnStat1Value} onChange={e => setAbout4regnStat1Value(e.target.value)} placeholder="110K+" style={{ ...inputStyle, flex: 1 }} />
                    <input value={about4regnStat1Label} onChange={e => setAbout4regnStat1Label(e.target.value)} placeholder="Deliveries" style={{ ...inputStyle, flex: 1 }} />
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 8 }}>
                    <input value={about4regnStat2Value} onChange={e => setAbout4regnStat2Value(e.target.value)} placeholder="2019" style={{ ...inputStyle, flex: 1 }} />
                    <input value={about4regnStat2Label} onChange={e => setAbout4regnStat2Label(e.target.value)} placeholder="Est." style={{ ...inputStyle, flex: 1 }} />
                  </div>
                  <div style={{ ...hintStyle, marginTop: 8 }}>Leave a value empty to hide that stat.</div>
                </div>
                <div>
                  <label style={labelStyle}>Link Label</label>
                  <input value={about4regnCtaLabel} onChange={e => setAbout4regnCtaLabel(e.target.value)} placeholder="Our Story" style={inputStyle} />
                  <div style={hintStyle}>Opens the full story text in a popup. Leave empty to hide the link.</div>
                </div>
              </div>
            )}

            {/* ABOUT — generic (Heirloom etc.) */}
            {activeSection === "about" && seller?.template !== "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Section Label</label>
                <input value={aboutLabel} onChange={e => setAboutLabel(e.target.value)}
                  placeholder="e.g. Our Story"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Small uppercase text above the heading. Leave empty to hide.</div>
                <label style={labelStyle}>Section Heading</label>
                <input value={aboutTitle} onChange={e => setAboutTitle(e.target.value)}
                  placeholder="e.g. Hair that moves with you."
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>Leave empty to show no heading.</div>
                <label style={labelStyle}>Brand Story / About Text</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={5} placeholder="Tell your customers who you are, what you sell, and why they should trust you..."
                  style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>This shows in the About section. Be genuine — 2 to 4 sentences is enough.</div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: aboutTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={aboutTextColor} onChange={e => setAboutTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{aboutTextColor}</span>
                    <button onClick={() => setAboutTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* TRUST BAR */}
            {activeSection === "trust" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={labelStyle}>Trust Bar Items</label>
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Click an icon to pick it. Leave title empty to hide an item.</div>
                {trustItems.map((item, i) => (
                  <div key={i} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {[
                        { id: "shield",   svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/></svg> },
                        { id: "star",     svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
                        { id: "diamond",  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/><path d="M12 22V9"/><path d="M6 3l6 6 6-6"/></svg> },
                        { id: "truck",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
                        { id: "package", svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10V7a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 7v10a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 17v-3"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
                        { id: "refresh",  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> },
                        { id: "lock",     svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> },
                        { id: "card",     svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
                        { id: "check",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
                        { id: "award",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> },
                        { id: "tag",      svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
                        { id: "globe",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
                        { id: "heart",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> },
                        { id: "clock",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
                        { id: "phone",    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.04 4.72 2 2 0 012 2.5h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 10a16 16 0 006 6l.36-.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> },
                        { id: "map",      svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> },
                      ].map(({ id, svg }) => (
                        <button key={id} onClick={() => { const u = [...trustItems]; u[i] = { ...u[i], icon: id }; setTrustItems(u); }}
                          title={id}
                          style={{ width: 36, height: 36, borderRadius: 6, border: item.icon === id ? "2px solid #c4a265" : "1px solid rgba(255,255,255,0.1)", background: item.icon === id ? "rgba(196,162,101,0.12)" : "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: item.icon === id ? "#c4a265" : "rgba(245,245,245,0.5)" }}>
                          {svg}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <input value={item.title} onChange={e => { const u = [...trustItems]; u[i] = { ...u[i], title: e.target.value }; setTrustItems(u); }}
                        placeholder="Title" style={{ ...inputStyle, flex: 1 }} />
                      <input value={item.desc} onChange={e => { const u = [...trustItems]; u[i] = { ...u[i], desc: e.target.value }; setTrustItems(u); }}
                        placeholder="Description" style={{ ...inputStyle, flex: 2 }} />
                      {trustItems.length > 1 && <button onClick={() => setTrustItems(trustItems.filter((_, idx) => idx !== i))}
                        style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,107,53,0.06)", border: "none", color: "#ff6b35", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>&times;</button>}
                    </div>
                  </div>
                ))}
                {trustItems.length < 6 && (
                  <button onClick={() => setTrustItems([...trustItems, { icon: "shield", title: "", desc: "" }])}
                    style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", marginTop: 4, letterSpacing: "0.06em" }}>+ Add Item</button>
                )}

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: trustTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={trustTextColor} onChange={e => setTrustTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{trustTextColor}</span>
                    <button onClick={() => setTrustTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* TESTIMONIALS */}
            {activeSection === "testimonials" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Testimonial Quote</label>
                <textarea value={testimonialText} onChange={e => setTestimonialText(e.target.value)}
                  rows={4} placeholder="What your best customer said..."
                  style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Use a real review from a happy customer. Short and specific works better than long and vague.</div>
              </div>
            )}

            {/* CTA BANNER */}
            {activeSection === "cta" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>CTA Headline</label>
                <input value={ctaHeadline} onChange={e => setCtaHeadline(e.target.value)}
                  placeholder="e.g. Your next look starts here"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>The big text in the full-width banner near the bottom of the page.</div>
                <label style={labelStyle}>CTA Subtext</label>
                <textarea value={ctaSubtext} onChange={e => setCtaSubtext(e.target.value)}
                  rows={3} placeholder="e.g. Browse our full collection..."
                  style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>The smaller descriptive text below the headline.</div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: aboutTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={aboutTextColor} onChange={e => setAboutTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{aboutTextColor}</span>
                    <button onClick={() => setAboutTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: trustTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={trustTextColor} onChange={e => setTrustTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{trustTextColor}</span>
                    <button onClick={() => setTrustTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: ctaTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={ctaTextColor} onChange={e => setCtaTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{ctaTextColor}</span>
                    <button onClick={() => setCtaTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* PROMISE */}
            {activeSection === "promise" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={labelStyle}>Section Label</label>
                <input value={promiseLabel} onChange={e => setPromiseLabel(e.target.value)}
                  placeholder="e.g. Our Promise"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Small uppercase text above the heading. Leave empty to hide.</div>
                <label style={labelStyle}>Section Heading</label>
                <input value={promiseTitle} onChange={e => setPromiseTitle(e.target.value)}
                  placeholder="e.g. Built on trust, delivered with care"
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>The big heading at the top of this section.</div>
                <label style={labelStyle}>Promise Items</label>
                {promiseItems.map((item, i) => (
                  <div key={i} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Item {i+1}</div>
                    <input value={item.title}
                      onChange={e => { const u = [...promiseItems]; u[i] = { ...u[i], title: e.target.value }; setPromiseItems(u); }}
                      placeholder="e.g. Quality Materials"
                      style={{ ...inputStyle, marginBottom: 4 }} />
                    <textarea value={item.desc}
                      onChange={e => { const u = [...promiseItems]; u[i] = { ...u[i], desc: e.target.value }; setPromiseItems(u); }}
                      placeholder="Short description..." rows={2}
                      style={{ ...inputStyle, resize: "vertical" }} />
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 4 }}>Section Image</label>
                      <div onClick={() => promiseImgRefs[i].current?.click()}
                        style={{ width: "100%", height: 72, borderRadius: 8, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                        {promiseImages[i]
                          ? <img src={promiseImages[i]!} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                          : <div style={{ fontSize: 12, color: "rgba(245,245,245,0.5)" }}>Click to upload image</div>
                        }
                      </div>
                      <input ref={promiseImgRefs[i]} type="file" accept="image/*"
                        onChange={async e => {
                          const f = e.target.files?.[0]; if (!f || !seller) return;
                          const ext = f.name.split(".").pop();
                          const path = `${seller.id}/promise_${i}.${ext}`;
                          const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                          if (!error) {
                            const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
                            const u = [...promiseImages]; u[i] = data.publicUrl + "?t=" + Date.now();
                            setPromiseImages(u);
                          }
                        }}
                        style={{ display: "none" }} />
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* POLICIES */}
            {activeSection === "policies" && (() => {
              const isRosefields = seller?.template === "rosefields";
              // Occasion-themed icon set for Rosefields' "Why Choose Us" cards
              // -- matches the Shop by Occasion icons already used on that
              // template, so this section's icons feel like part of the same
              // theme instead of generic e-commerce trust badges.
              const ROSEFIELDS_POLICY_ICONS: { v: string; label: string }[] = [
                { v: "flower", label: "Fresh / Just Because" },
                { v: "hands",  label: "I'm Sorry" },
                { v: "ring",   label: "Anniversary" },
                { v: "ring2",  label: "Proposal" },
                { v: "cake",   label: "Birthday" },
                { v: "petal",  label: "New Baby" },
                { v: "none",   label: "No Icon" },
              ];
              const PolicyIconPreview = ({ id }: { id: string }) => {
                const st = { width: 15, height: 15, stroke: "currentColor", fill: "none", strokeWidth: 1.4, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
                switch (id) {
                  case "ring": return <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="15" r="6" /><path d="M9 9l3-6 3 6" /></svg>;
                  case "ring2": return <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="14" r="5.5" /><path d="M8.5 8.5 12 3l3.5 5.5" /></svg>;
                  case "cake": return <svg {...st} viewBox="0 0 24 24"><path d="M4 21v-8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8" /><path d="M2 21h20" /><path d="M4 16h16" /></svg>;
                  case "hands": return <svg {...st} viewBox="0 0 24 24"><path d="M12 3c3 3 3 8 0 11-3-3-3-8 0-11Z" /><path d="M4 12c3-3 8-3 11 0-3 3-8 3-11 0Z" /><path d="M20 12c-3 3-8 3-11 0 3-3 8-3 11 0Z" /></svg>;
                  case "petal": return <svg {...st} viewBox="0 0 24 24"><path d="M12 3c3 3 3 8 0 11-3-3-3-8 0-11Z" /><path d="M4 12c3-3 8-3 11 0-3 3-8 3-11 0Z" /><path d="M20 12c-3 3-8 3-11 0 3-3 8-3 11 0Z" /><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" /></svg>;
                  case "none": return <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M5.5 5.5l13 13" /></svg>;
                  default: return <svg {...st} viewBox="0 0 24 24"><circle cx="12" cy="9" r="4.2" /><path d="M8.4 6.4a4.2 4.2 0 0 1 7.2 0" /><path d="M9 12.5C7 14 6 16.5 6 19.5" /><path d="M15 12.5c2 1.5 3 4 3 7" /><path d="M12 13v8.5" /></svg>;
                }
              };
              const defaultPolicyItems = isRosefields ? [
                { title: "Fresh Every Morning", desc: "Roses are cut and prepped fresh each day for maximum vase life.", icon: "flower" },
                { title: "Expertly Arranged", desc: "Arranged by professional florists trained in classic technique.", icon: "hands" },
                { title: "Same Day Delivery", desc: "Order before 2PM for same-day delivery. R800+ ships free.", icon: "ring2" },
                { title: "Custom Message", desc: "Add a personal, handwritten-style message card to any bouquet.", icon: "petal" },
              ] : [
                { title: "Shipping", desc: "Free delivery on orders over R500. Standard 2–4 days nationwide.", icon: "flower" },
                { title: "Returns",  desc: "14-day returns on all unopened products in original packaging.", icon: "hands" },
                { title: "Payment",  desc: "Secure card payments via PayFast. EFT accepted. WhatsApp orders welcome.", icon: "ring" },
              ];
              // Always write through BOTH the direct Supabase update (so the
              // change is saved immediately, matching the "saves on blur"
              // copy below) and the editor's own `policyItems` state --
              // otherwise the persistent "Save Changes" button elsewhere on
              // screen writes its own stale, page-load-time copy of
              // `policyItems` right after and silently reverts this edit.
              const updatePolicyItem = async (i: number, patch: Record<string, string>) => {
                if (!seller) return;
                const base = seller.store_config?.policy_items?.length ? seller.store_config.policy_items : (policyItems.length ? policyItems : defaultPolicyItems);
                const items = [...base];
                items[i] = { ...items[i], ...patch };
                await supabase.from("sellers").update({ store_config: { ...seller.store_config, policy_items: items } }).eq("id", seller.id);
                setSeller({ ...seller, store_config: { ...seller.store_config, policy_items: items } });
                setPolicyItems(items);
                if (seller.subdomain) void revalidateStore(seller.subdomain).catch(() => {});
              };
              const currentItems = seller?.store_config?.policy_items || defaultPolicyItems;
              // Same direct-write-on-blur pattern as updatePolicyItem, kept as
              // flat/global store_config fields (not template-scoped) so they
              // read back the same way policy_items already does.
              const POLICIES_FIELD_LIVE_KEY: Record<string, string> = {
                policies_heading: "policiesHeading",
                policies_message: "policiesMessage",
                policies_bg_image: "policiesBgImage",
              };
              const updatePoliciesField = async (patch: Record<string, string>) => {
                if (!seller) return;
                const nextConfig = { ...seller.store_config, ...patch };
                await supabase.from("sellers").update({ store_config: nextConfig }).eq("id", seller.id);
                setSeller({ ...seller, store_config: nextConfig });
                const livePatch: Record<string, string> = {};
                for (const [k, v] of Object.entries(patch)) livePatch[POLICIES_FIELD_LIVE_KEY[k] || k] = v;
                postUpdate(livePatch);
                if (seller.subdomain) void revalidateStore(seller.subdomain).catch(() => {});
              };
              const policiesBgImage = seller?.store_config?.policies_bg_image || "";
              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <label style={labelStyle}>Shipping & Policies</label>
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 4 }}>Edit what shows in the Shipping / Returns / Payment section.</div>
                  <div style={{ fontSize: 11.5, color: "rgba(245,245,245,0.65)", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.25)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.5 }}>
                    Looking to add couriers or delivery methods (PAXI, Aramex, Courier Guy...)? That&apos;s managed in your main <strong>Dashboard → Checkout → Shipping</strong> tab, not here. This panel only edits the text and icons shown below.
                  </div>
                  {isRosefields && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10 }}>
                      <div>
                        <label style={labelStyle}>Section Background Image</label>
                        <div onClick={() => policiesBgRef.current?.click()}
                          style={{ width: "100%", height: 100, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                          {policiesBgImage
                            ? <img src={policiesBgImage} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                            : <div style={{ textAlign: "center", color: "rgba(245,245,245,0.5)" }}><EditorIcon name="image" size={22} /><div style={{ fontSize: 11, marginTop: 6 }}>Click to upload background image</div></div>
                          }
                        </div>
                        <input ref={policiesBgRef} type="file" accept="image/*"
                          onChange={async e => {
                            const f = e.target.files?.[0]; if (!f || !seller) return;
                            const ext = f.name.split(".").pop();
                            const path = `${seller.id}/policies_bg_${Date.now()}.${ext}`;
                            const { error } = await supabase.storage.from("store-assets").upload(path, f, { upsert: true });
                            if (!error) {
                              const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
                              await updatePoliciesField({ policies_bg_image: data.publicUrl });
                            }
                          }} style={{ display: "none" }} />
                        {policiesBgImage && <button onClick={() => updatePoliciesField({ policies_bg_image: "" })} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>}
                        <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginTop: 4 }}>Defaults to your hero photo if left empty.</div>
                      </div>
                      <div>
                        <label style={labelStyle}>Section Heading</label>
                        <input
                          defaultValue={seller?.store_config?.policies_heading || ""}
                          onBlur={e => updatePoliciesField({ policies_heading: e.target.value })}
                          placeholder={`Why Choose ${seller?.store_name || "Rosefields"}?`}
                          style={inputStyle} />
                      </div>
                      <div>
                        <label style={labelStyle}>Trust Message</label>
                        <textarea
                          defaultValue={seller?.store_config?.policies_message || ""}
                          onBlur={e => updatePoliciesField({ policies_message: e.target.value })}
                          placeholder="Optional line shown above the icons below, e.g. Trusted by 5,000+ happy customers across South Africa."
                          rows={2}
                          style={{ ...inputStyle, resize: "vertical" }} />
                      </div>
                    </div>
                  )}
                  {currentItems.map((pol: any, i: number) => (
                    <div key={i} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      {isRosefields && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(245,245,245,0.4)", marginBottom: 6 }}>Icon</div>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }}>
                            {ROSEFIELDS_POLICY_ICONS.map(opt => {
                              const active = (pol.icon || defaultPolicyItems[i]?.icon || "flower") === opt.v;
                              return (
                                <button key={opt.v} title={opt.label} onClick={() => updatePolicyItem(i, { icon: opt.v })}
                                  style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: "8px 0", borderRadius: 8, border: active ? `1.5px solid ${G}` : "1px solid rgba(255,255,255,0.1)", background: active ? `${G}22` : "rgba(255,255,255,0.03)", color: active ? "#fff" : "rgba(245,245,245,0.5)", cursor: "pointer", transition: "all 0.2s" }}>
                                  <PolicyIconPreview id={opt.v} />
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                      <input
                        defaultValue={pol.title}
                        onBlur={e => updatePolicyItem(i, { title: e.target.value })}
                        placeholder="e.g. Shipping"
                        style={{ ...inputStyle, fontWeight: 700 }} />
                      <textarea
                        defaultValue={pol.desc}
                        onBlur={e => updatePolicyItem(i, { desc: e.target.value })}
                        placeholder="Description..."
                        rows={3}
                        style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                  ))}
                  <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)" }}>Changes save automatically when you click out of a field.</div>
                </div>
              );
            })()}

            {/* FOOTER */}
            {/* FOOTER — Heirloom variant. Heirloom's footer has its own
                tagline (under the wordmark), 3 column headings, and 4+4 link
                labels in the Support + Pay columns. Editor previously only
                exposed Crown's "Footer Tagline" → seller.tagline, but Heirloom
                doesn't use seller.tagline for the footer at all -- it uses
                seller.description, then falls back to config.footer_tagline. */}
            {activeSection === "footer" && seller?.template === "heirloom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Footer Tagline</label>
                  <textarea value={footerTagline} onChange={e => setFooterTagline(e.target.value)}
                    rows={2} placeholder="e.g. Limited-run pieces, made deliberately. Made in South Africa."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
                  <div style={hintStyle}>Short line under your brand name in the footer.</div>
                </div>

                <div>
                  <label style={labelStyle}>Column 1 Heading</label>
                  <input value={footerCol1Label} onChange={e => setFooterCol1Label(e.target.value)}
                    placeholder="Shop" style={inputStyle} />
                  <div style={hintStyle}>Links auto-populate from your collections — only the heading is editable here.</div>
                </div>

                <div>
                  <label style={labelStyle}>Shipping Policy</label>
                  <textarea value={shippingPolicy} onChange={e => setShippingPolicy(e.target.value)}
                    rows={4} placeholder="e.g. We deliver nationwide within 3-5 business days..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                  <div style={hintStyle}>Shown in a popup when customers click &quot;Shipping&quot; in the footer.</div>
                </div>

                <div>
                  <label style={labelStyle}>Return / Refund Policy</label>
                  <textarea value={returnPolicy} onChange={e => setReturnPolicy(e.target.value)}
                    rows={4} placeholder="e.g. We accept returns within 14 days of purchase..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                  <div style={hintStyle}>Shown in a popup when customers click &quot;Returns &amp; Refunds&quot; in the footer.</div>
                </div>

                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  Support column shows Shipping, Returns &amp; Refunds, and Contact links. Payment Methods column auto-populates from your checkout settings. Social links and contact info come from Dashboard → My Store.
                </div>
              </div>
            )}

            {/* FOOTER — 4regn. Same shape as Heirloom's footer panel above
                (same field names, same popup mechanism) plus the two legal
                links 4regn's footer was missing entirely: Privacy Policy
                and Terms of Service. */}
            {activeSection === "footer" && seller?.template === "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Footer Tagline</label>
                  <textarea value={footerTagline} onChange={e => setFooterTagline(e.target.value)}
                    rows={2} placeholder="e.g. Premium streetwear, made deliberately. Made in South Africa."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
                  <div style={hintStyle}>Short line under your logo in the footer.</div>
                </div>

                <div>
                  <label style={labelStyle}>Column 1 Heading</label>
                  <input value={footerCol1Label} onChange={e => setFooterCol1Label(e.target.value)}
                    placeholder="Shop" style={inputStyle} />
                  <div style={hintStyle}>Links auto-populate from your collections — only the heading is editable here.</div>
                </div>

                <div>
                  <label style={labelStyle}>Shipping Policy</label>
                  <textarea value={shippingPolicy} onChange={e => setShippingPolicy(e.target.value)}
                    rows={4} placeholder="e.g. We deliver nationwide within 3-5 business days..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                  <div style={hintStyle}>Shown in a popup when customers click &quot;Shipping&quot; in the footer.</div>
                </div>

                <div>
                  <label style={labelStyle}>Return / Refund Policy</label>
                  <textarea value={returnPolicy} onChange={e => setReturnPolicy(e.target.value)}
                    rows={4} placeholder="e.g. We accept returns within 14 days of purchase..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                  <div style={hintStyle}>Shown in a popup when customers click &quot;Returns &amp; Refunds&quot; in the footer.</div>
                </div>

                <div>
                  <label style={labelStyle}>Privacy Policy</label>
                  <textarea value={privacyPolicy} onChange={e => setPrivacyPolicy(e.target.value)}
                    rows={4} placeholder="e.g. What information we collect and how we use it..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                  <div style={hintStyle}>Shown in a popup when customers click &quot;Privacy Policy&quot; in the footer.</div>
                </div>

                <div>
                  <label style={labelStyle}>Terms of Service</label>
                  <textarea value={termsOfService} onChange={e => setTermsOfService(e.target.value)}
                    rows={4} placeholder="e.g. By placing an order with us, you agree to..."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 72 }} />
                  <div style={hintStyle}>Shown in a popup when customers click &quot;Terms of Service&quot; in the footer.</div>
                </div>

                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  Support column shows Shipping, Returns &amp; Refunds, Privacy Policy, Terms of Service, and Contact links. Payment Methods column auto-populates from your checkout settings. Social links and contact info come from Dashboard → My Store.
                </div>
              </div>
            )}

            {/* NEWSLETTER — 4regn. Reached by clicking the newsletter
                section in the live preview, same as Hero/SETLA. Defaults to
                visible (see the template-aware default in the hydration
                effect above) -- this panel is only for turning it off or
                customizing its copy, not for turning it on. */}
            {activeSection === "newsletter" && seller?.template === "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, cursor: "pointer" }}>
                  <input type="checkbox" checked={showNewsletter} onChange={e => setShowNewsletter(e.target.checked)} style={{ accentColor: "#9c7c62" }} />
                  <span style={{ fontSize: 13, color: "rgba(245,245,245,0.58)" }}>Show newsletter signup</span>
                </label>
                {showNewsletter && (
                  <>
                    <div>
                      <label style={labelStyle}>Eyebrow Label</label>
                      <input value={newsletterLabel} onChange={e => setNewsletterLabel(e.target.value)}
                        placeholder="Join the Family" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Headline</label>
                      <input value={newsletterTitle} onChange={e => setNewsletterTitle(e.target.value)}
                        placeholder={`Join the ${seller?.store_name || "Store"} Family`} style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Subtext</label>
                      <textarea value={newsletterSub} onChange={e => setNewsletterSub(e.target.value)}
                        rows={2} placeholder="We'll email you about new arrivals and restocks. Nothing else."
                        style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                  </>
                )}
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  Shown as a light-background section above the footer. Subscribers are viewable from Newsletter in the sidebar.
                </div>
              </div>
            )}

            {/* FOOTER — Soft Luxury / Glass Chrome */}
            {activeSection === "footer" && (seller?.template === "soft-luxury" || seller?.template === "glass-futuristic") && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Footer About Text</label>
                  <textarea value={footerAbout} onChange={e => setFooterAbout(e.target.value)}
                    rows={3} placeholder="Short about text for the footer. Leave empty to use your store description."
                    style={{ ...inputStyle, resize: "vertical", minHeight: 56 }} />
                  <div style={hintStyle}>Separate from the hero description — you can have different text here.</div>
                </div>

                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Policies</div>
                  {policyItems.map((pol, i) => (
                    <div key={i} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, marginBottom: 8 }}>
                      <input value={pol.title} onChange={e => { const u = [...policyItems]; u[i] = { ...u[i], title: e.target.value }; setPolicyItems(u); }}
                        placeholder="Policy title" style={{ ...inputStyle, fontWeight: 600, marginBottom: 6 }} />
                      <textarea value={pol.desc} onChange={e => { const u = [...policyItems]; u[i] = { ...u[i], desc: e.target.value }; setPolicyItems(u); }}
                        placeholder="Policy content..." rows={2} style={{ ...inputStyle, resize: "vertical" }} />
                      {policyItems.length > 1 && (
                        <button onClick={() => setPolicyItems(policyItems.filter((_, idx) => idx !== i))}
                          style={{ marginTop: 4, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.06em" }}>Remove</button>
                      )}
                    </div>
                  ))}
                  <button onClick={() => setPolicyItems([...policyItems, { title: "", desc: "" }])}
                    style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>+ Add Policy</button>
                  <div style={hintStyle}>Policies expand inline in the footer Support column.</div>
                </div>

                <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 12 }}>Contact Info</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <label style={labelStyle}>Email</label>
                      <input value={contactEmail} onChange={e => setContactEmail(e.target.value)}
                        placeholder="e.g. hello@yourstore.co.za" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Phone</label>
                      <input value={contactPhone} onChange={e => setContactPhone(e.target.value)}
                        placeholder="e.g. 012 345 6789" style={inputStyle} />
                    </div>
                    <div>
                      <label style={labelStyle}>Physical Address</label>
                      <textarea value={physicalAddress} onChange={e => setPhysicalAddress(e.target.value)}
                        rows={2} placeholder="e.g. 123 Main Rd, Cape Town" style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                    <div>
                      <label style={labelStyle}>Operating Hours</label>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {hoursStructured.map((h, i) => (
                          <div key={h.day} style={{ padding: "8px 10px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: h.status === "open" ? 6 : 0 }}>
                              <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.7)", minWidth: 70 }}>{h.day.slice(0, 3)}</span>
                              <select value={h.status} onChange={e => updateDayHours(i, { status: e.target.value as "open" | "closed" })}
                                style={{ ...inputStyle, padding: "4px 8px", fontSize: 10, width: "auto", minWidth: 70 }}>
                                <option value="open">Open</option>
                                <option value="closed">Closed</option>
                              </select>
                            </div>
                            {h.status === "open" && (
                              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9, color: "rgba(245,245,245,0.3)", minWidth: 36 }}>Hours</span>
                                  <select value={h.open} onChange={e => updateDayHours(i, { open: e.target.value })}
                                    style={{ ...inputStyle, padding: "3px 6px", fontSize: 10, flex: 1 }}>
                                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                  <span style={{ fontSize: 12, color: "rgba(245,245,245,0.5)" }}>to</span>
                                  <select value={h.close} onChange={e => updateDayHours(i, { close: e.target.value })}
                                    style={{ ...inputStyle, padding: "3px 6px", fontSize: 10, flex: 1 }}>
                                    {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                  </select>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                                  <span style={{ fontSize: 9, color: "rgba(245,245,245,0.3)", minWidth: 36 }}>Lunch</span>
                                  {h.lunch_start ? (
                                    <>
                                      <select value={h.lunch_start} onChange={e => updateDayHours(i, { lunch_start: e.target.value })}
                                        style={{ ...inputStyle, padding: "3px 6px", fontSize: 10, flex: 1 }}>
                                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                      <span style={{ fontSize: 12, color: "rgba(245,245,245,0.5)" }}>to</span>
                                      <select value={h.lunch_end} onChange={e => updateDayHours(i, { lunch_end: e.target.value })}
                                        style={{ ...inputStyle, padding: "3px 6px", fontSize: 10, flex: 1 }}>
                                        {TIME_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                                      </select>
                                      <button onClick={() => updateDayHours(i, { lunch_start: "", lunch_end: "" })}
                                        style={{ background: "none", border: "none", color: "#ff6b35", fontSize: 12, cursor: "pointer", padding: 0 }}>&times;</button>
                                    </>
                                  ) : (
                                    <button onClick={() => updateDayHours(i, { lunch_start: "12:00", lunch_end: "13:00" })}
                                      style={{ background: "none", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 4, color: "rgba(245,245,245,0.3)", fontSize: 9, cursor: "pointer", padding: "2px 8px" }}>+ Add</button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                      <div style={hintStyle}>Set hours per day. Displayed as a table in the footer.</div>
                    </div>
                  </div>
                </div>

                {seller?.template === "soft-luxury" && (
                  <div style={{ paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                    <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 4 }}>Footer Colors</div>
                    <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>Defaults to your site's colors above — only change these to make the footer stand out on its own.</div>
                    {[
                      { label: "Background", value: footerBgColor, setValue: setFooterBgColor, fallback: bgColor },
                      { label: "Text", value: footerTextColor, setValue: setFooterTextColor, fallback: textColor },
                      { label: "Muted Text", value: footerMutedColor, setValue: setFooterMutedColor, fallback: mutedColor },
                    ].map((c) => (
                      <div key={c.label} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>{c.label}</span>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <label style={{ width: 28, height: 28, borderRadius: 6, background: c.value || c.fallback, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                            <input type="color" value={c.value || c.fallback} onChange={e => c.setValue(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                          </label>
                          <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{c.value || c.fallback}{!c.value && " (default)"}</span>
                          {c.value && <button onClick={() => c.setValue("")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* FOOTER — Crown (legacy mapping) */}
            {activeSection === "footer" && seller?.template !== "heirloom" && seller?.template !== "soft-luxury" && seller?.template !== "glass-futuristic" && seller?.template !== "4regn" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Footer Tagline</label>
                <input value={tagline} onChange={e => setTagline(e.target.value)}
                  placeholder="e.g. Premium quality. Delivered across SA."
                  style={inputStyle} />
                <div style={{ fontSize: 13, color: "rgba(245,245,245,0.52)", marginBottom: 8 }}>The short line under your name/logo in the footer.</div>
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  Your logo (if uploaded) will show automatically in the footer. Social links are managed in Dashboard → My Store.
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.45)", marginBottom: 8 }}>Colors</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: footerTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={footerTextColor} onChange={e => setFooterTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{footerTextColor}</span>
                    <button onClick={() => setFooterTextColor("#f0e6d3")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "rgba(245,245,245,0.55)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Page Background</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: bgColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.4)", fontFamily: "monospace" }}>{bgColor}</span>
                    <button onClick={() => setBgColor("#0a0908")} style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

          </div>

          {/* Panel save button */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{
                flex: 1, padding: "12px", borderRadius: 100,
                background: saved
                  ? "linear-gradient(135deg,#16a34a 0%,#15803d 100%)"
                  : "linear-gradient(135deg,#1c1c20 0%,#0d0d11 100%)",
                border: saved ? "1px solid rgba(34,197,94,0.4)" : "1px solid rgba(255,107,53,0.35)",
                color: "#fff", fontFamily: "'Schibsted Grotesk', sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                cursor: saving ? "not-allowed" : "pointer",
                boxShadow: saved ? "0 4px 18px rgba(34,197,94,0.18)" : "0 4px 18px rgba(255,107,53,0.15)",
                transition: "all 0.25s ease",
                display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 8,
              }}>
              {saved && <EditorIcon name="check" size={13} stroke={2.5} />}
              {saving ? "Saving" : saved ? "Saved" : "Save Changes"}
            </button>
            <button onClick={() => setPanelVisible(false)}
              style={{
                padding: "12px 18px", borderRadius: 100,
                background: "transparent", color: "rgba(245,245,245,0.5)",
                border: "1px solid rgba(255,255,255,0.1)",
                fontFamily: "'Schibsted Grotesk', sans-serif",
                fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase",
                cursor: "pointer", transition: "all 0.2s ease",
              }}>
              Done
            </button>
          </div>
        </div>

        {/* Hint when no section selected */}
        {iframeReady && !panelVisible && (
          <div style={{
            position: "absolute", bottom: 24, left: "50%", transform: "translateX(-50%)",
            background: "rgba(20,20,28,0.92)", backdropFilter: "blur(12px)",
            border: "1px solid rgba(255,255,255,0.1)", borderRadius: 100,
            padding: "10px 20px",
            display: "flex", alignItems: "center", gap: 8,
            pointerEvents: "none",
          }}>
            <span style={{ display: "inline-flex", color: "rgba(255,107,53,0.85)" }}><EditorIcon name="pencil" size={14} /></span>
            <span style={{ fontSize: 12, color: "rgba(245,245,245,0.6)", letterSpacing: "0.02em" }}>Click any section on your store to edit it</span>
          </div>
        )}

      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        * { box-sizing: border-box; margin: 0; padding: 0; }
      `}</style>
    </div>
  );
}
