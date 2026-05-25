"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";
import { revalidateStore } from "../../actions/revalidate-store";

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
  store_config: {
    announcement?: string;
    trust_items?: { icon: string; title: string; desc: string }[];
    policy_items?: { title: string; desc: string }[];
    hero_subtext?: string;
    circle_title?: string;
    circle_subtitle?: string;
    products_label?: string;
    products_heading?: string;
    about_label?: string;
    about_title?: string;
    coll_label?: string;
    coll_subtitle?: string;
    ticker_texts?: string[];
    ticker_speed?: number;
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
  };
}

// Hero CTA destinations -- mirror the type in HeirloomStore so the editor and
// the storefront agree. Adding new targets here requires updating the
// storefront's switch statement too.
type CtaTarget =
  | { type: "products" }
  | { type: "collection"; collection: string }
  | { type: "url"; url: string }
  | { type: "none" };

type ActiveSection =
  | "announcement" | "logo" | "hero" | "ticker" | "circle" | "products" | "collections"
  | "policies" | "promise" | "about" | "testimonials" | "cta" | "trust" | "footer"
  | null;

const SECTION_LABELS: Record<string, string> = {
  announcement: "📢 Announcement Bar",
  logo:         "🏷 Store Logo",
  hero:         "🏠 Hero Section",
  ticker:       "📣 Promo Ticker",
  circle:       "⭕ Browse by Category",
  products:     "🛍 Products",
  collections:  "📂 Collections",
  policies:     "📋 Shipping & Policies",
  promise:      "💎 Our Promise",
  about:        "📖 About / Story",
  testimonials: "💬 Testimonials",
  cta:          "🚀 Call to Action",
  trust:        "✅ Trust Bar",
  footer:       "🔗 Footer",
};

export default function StoreEditor() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const [seller, setSeller]           = useState<Seller | null>(null);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [saved, setSaved]             = useState(false);
  const [activeSection, setActiveSection] = useState<ActiveSection>(null);
  const [panelVisible, setPanelVisible]   = useState(false);
  const [iframeReady, setIframeReady]     = useState(false);

  /* Local editable state */
  const [tagline, setTagline]           = useState("");
  const [description, setDescription]   = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [trustItems, setTrustItems]     = useState<{ icon: string; title: string; desc: string }[]>([]);
  const [testimonialText, setTestimonialText] = useState("I've been buying hair for years and nothing compares. Three months in and my bundles still look freshly installed. This is the one.");
  const [ctaHeadline, setCtaHeadline]         = useState("Your next look starts here");
  const [ctaSubtext, setCtaSubtext]           = useState("Browse our full collection and find the perfect bundles, closures, and frontals for your signature style.");
  const [aboutTitle, setAboutTitle]           = useState("");
  const [heroSubtext, setHeroSubtext]         = useState("Premium Hair Collection · SA Delivered");
  const [circleTitle, setCircleTitle]         = useState("Shop by Texture");
  const [circleSubtitle, setCircleSubtitle]   = useState("Find your signature look");
  const [productsLabel, setProductsLabel]     = useState("The Edit");
  const [productsHeading, setProductsHeading] = useState("Latest arrivals");
  const [aboutLabel, setAboutLabel]           = useState("Our Story");
  const [collLabel, setCollLabel]             = useState("Featured Collections");
  const [collSubtitle, setCollSubtitle]       = useState("Find your signature look");
  const [collOrder, setCollOrder]             = useState<string[]>([]);
  const [tickerTexts, setTickerTexts]         = useState<string[]>(["FREE DELIVERY ON ORDERS OVER R800", "UP TO 35% SALE RUNNING", "NEW ARRIVALS JUST DROPPED"]);
  const [tickerSpeed, setTickerSpeed]         = useState(20);
  const [bgColor, setBgColor]                 = useState("#0a0908");
  const [heroTextColor, setHeroTextColor]     = useState("#f0e6d3");
  const [circleTextColor, setCircleTextColor] = useState("#f0e6d3");
  const [prodTextColor, setProdTextColor]     = useState("#f0e6d3");
  const [aboutTextColor, setAboutTextColor]   = useState("#f0e6d3");
  const [collTextColor, setCollTextColor]     = useState("#f0e6d3");
  const [ctaTextColor, setCtaTextColor]       = useState("#f0e6d3");
  const [trustTextColor, setTrustTextColor]     = useState("#f0e6d3");
  const [footerTextColor, setFooterTextColor]   = useState("#f0e6d3");
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
  const heroImageRef = useRef<HTMLInputElement>(null);

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
  const [footerCol2Label, setFooterCol2Label]         = useState("Support");
  const [footerCol3Label, setFooterCol3Label]         = useState("Pay");
  const [footerSupportLinks, setFooterSupportLinks]   = useState<string[]>(["Shipping", "Returns", "Sizing", "Contact"]);
  const [footerPayLinks, setFooterPayLinks]           = useState<string[]>(["Card", "EFT", "PayFast", "WhatsApp Order"]);

  /* Editable label above the hero countdown timer. Empty string = default to
     `<CODE> ends in` from the active discount; sellers can override to e.g.
     "Limited drop ends in". */
  const [heroCountdownLabel, setHeroCountdownLabel]   = useState("");

  /* ─── LOAD ─── */
  useEffect(() => {
    (async () => {
      // getSession() is local; getUser() validates against Supabase (extra round-trip).
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) { router.push("/login"); return; }
      // Explicit columns — only what the editor actually uses. Skipping the bigger
      // checkout_config / subscription_* / payfast_* fields keeps this row small.
      const { data: s } = await supabase.from("sellers").select("id, email, store_name, subdomain, template, tagline, description, logo_url, banner_url, whatsapp_number, primary_color, collections, store_config").eq("email", user.email).single();
      if (!s) { router.push("/dashboard"); return; }
      setSeller(s);
      setTagline(s.tagline || "");
      setDescription(s.description || "");
      setAnnouncement(s.store_config?.announcement || "");
      setTrustItems(s.store_config?.trust_items || [
        { icon: "◆", title: "100% Human Hair", desc: "Every bundle tested before it ships" },
        { icon: "◆", title: "Fast Dispatch", desc: "Order before 1PM, ships same day" },
        { icon: "◆", title: "Easy Returns", desc: "14-day returns on unopened items" },
        { icon: "◆", title: "Real Support", desc: "WhatsApp us — we actually reply" },
      ]);
      setCollOrder(s.collections || []);
      if (s.store_config?.hero_subtext) setHeroSubtext(s.store_config.hero_subtext);
      if (s.store_config?.circle_title) setCircleTitle(s.store_config.circle_title);
      if (s.store_config?.circle_subtitle) setCircleSubtitle(s.store_config.circle_subtitle);
      if (s.store_config?.products_label) setProductsLabel(s.store_config.products_label);
      if (s.store_config?.products_heading) setProductsHeading(s.store_config.products_heading);
      if (s.store_config?.about_label) setAboutLabel(s.store_config.about_label);
      if (s.store_config?.about_title) setAboutTitle(s.store_config.about_title);
      if (s.store_config?.coll_label) setCollLabel(s.store_config.coll_label);
      if (s.store_config?.coll_subtitle) setCollSubtitle(s.store_config.coll_subtitle);
      if (s.store_config?.ticker_texts?.length) setTickerTexts(s.store_config.ticker_texts);
      if (s.store_config?.ticker_speed) setTickerSpeed(s.store_config.ticker_speed);
      if (s.store_config?.bg_color) setBgColor(s.store_config.bg_color);
      if (s.store_config?.hero_text_color) setHeroTextColor(s.store_config.hero_text_color);
      if (s.store_config?.circle_text_color) setCircleTextColor(s.store_config.circle_text_color);
      if (s.store_config?.products_text_color) setProdTextColor(s.store_config.products_text_color);
      if (s.store_config?.about_text_color) setAboutTextColor(s.store_config.about_text_color);
      if (s.store_config?.coll_text_color) setCollTextColor(s.store_config.coll_text_color);
      if (s.store_config?.cta_text_color) setCtaTextColor(s.store_config.cta_text_color);
      if (s.store_config?.trust_text_color) setTrustTextColor(s.store_config.trust_text_color);
      if (s.store_config?.footer_text_color) setFooterTextColor(s.store_config.footer_text_color);
      if (s.store_config?.promise_label) setPromiseLabel(s.store_config.promise_label);
      if (s.store_config?.promise_title) setPromiseTitle(s.store_config.promise_title);
      if (s.store_config?.promise_items?.length) setPromiseItems(s.store_config.promise_items);
      if (s.store_config?.promise_images) setPromiseImages(s.store_config.promise_images);
      setLogoPreview(s.logo_url || "");
      setHeroImagePreview(s.store_config?.hero_image || "");
      setHeroImageUrl(s.store_config?.hero_image || "");
      // Heirloom-specific hero fields
      setHeroIndex(s.store_config?.hero_index ?? "");
      setHeroLabel(s.store_config?.hero_label ?? "");
      setHeroHeadline(s.store_config?.hero_headline ?? "");
      setHeroBody(s.store_config?.hero_body ?? "");
      setHeroCtaPrimary(s.store_config?.hero_cta_primary ?? "");
      setHeroCtaSecondary(s.store_config?.hero_cta_secondary ?? "");
      setHeroCtaPrimaryTarget(s.store_config?.hero_cta_primary_target ?? { type: "products" });
      setHeroCtaSecondaryTarget(s.store_config?.hero_cta_secondary_target ?? { type: "none" });
      // Heirloom footer
      setFooterTagline(s.store_config?.footer_tagline ?? s.description ?? "");
      setFooterCol1Label(s.store_config?.footer_col1_label ?? "Shop");
      setFooterCol2Label(s.store_config?.footer_col2_label ?? "Support");
      setFooterCol3Label(s.store_config?.footer_col3_label ?? "Pay");
      setFooterSupportLinks(s.store_config?.footer_support_links?.length ? s.store_config.footer_support_links : ["Shipping", "Returns", "Sizing", "Contact"]);
      setFooterPayLinks(s.store_config?.footer_pay_links?.length ? s.store_config.footer_pay_links : ["Card", "EFT", "PayFast", "WhatsApp Order"]);
      setHeroCountdownLabel(s.store_config?.hero_countdown_label ?? "");
      setLoading(false);
    })();
  }, []);

  /* ─── LISTEN FOR SECTION CLICKS FROM IFRAME ─── */
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "SECTION_CLICK") {
        setActiveSection(e.data.section as ActiveSection);
        setPanelVisible(true);
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
  useEffect(() => { postUpdate({ aboutLabel }); }, [aboutLabel]);
  useEffect(() => { postUpdate({ collLabel }); }, [collLabel]);
  useEffect(() => { postUpdate({ collSubtitle }); }, [collSubtitle]);
  useEffect(() => { if (collOrder.length > 0) postUpdate({ collOrder }); }, [collOrder]);
  useEffect(() => { postUpdate({ heroImage: heroImagePreview }); }, [heroImagePreview]);
  useEffect(() => { postUpdate({ ticker: tickerTexts }); }, [tickerTexts]);
  useEffect(() => { postUpdate({ tickerSpeed }); }, [tickerSpeed]);
  useEffect(() => { postUpdate({ bgColor }); }, [bgColor]);
  useEffect(() => { postUpdate({ heroTextColor }); }, [heroTextColor]);
  useEffect(() => { postUpdate({ circleTextColor }); }, [circleTextColor]);
  useEffect(() => { postUpdate({ prodTextColor }); }, [prodTextColor]);
  useEffect(() => { postUpdate({ aboutTextColor }); }, [aboutTextColor]);
  useEffect(() => { postUpdate({ collTextColor }); }, [collTextColor]);
  useEffect(() => { postUpdate({ ctaTextColor }); }, [ctaTextColor]);
  useEffect(() => { postUpdate({ trustTextColor }); }, [trustTextColor]);
  useEffect(() => { postUpdate({ footerTextColor }); }, [footerTextColor]);
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
  useEffect(() => { postUpdate({ footerCol2Label }); }, [footerCol2Label]);
  useEffect(() => { postUpdate({ footerCol3Label }); }, [footerCol3Label]);
  useEffect(() => { postUpdate({ footerSupportLinks }); }, [footerSupportLinks]);
  useEffect(() => { postUpdate({ footerPayLinks }); }, [footerPayLinks]);
  useEffect(() => { postUpdate({ heroCountdownLabel }); }, [heroCountdownLabel]);

  /* ─── SAVE ─── */
  const save = async () => {
    if (!seller) return;
    setSaving(true);
    let logoUrl = seller.logo_url;
    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = `logos/${seller.id}-${Date.now()}.${ext}`;
      await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true });
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      logoUrl = data.publicUrl;
    }
    await supabase.from("sellers").update({
      tagline, description, logo_url: logoUrl,
      collections: collOrder.length > 0 ? collOrder : seller.collections,
      store_config: {
        ...seller.store_config,
        announcement,
        trust_items: trustItems,
        hero_subtext: heroSubtext,
        circle_title: circleTitle,
        circle_subtitle: circleSubtitle,
        products_label: productsLabel,
        products_heading: productsHeading,
        about_label: aboutLabel,
        about_title: aboutTitle,
        coll_label: collLabel,
        coll_subtitle: collSubtitle,
          ticker_texts: tickerTexts,
          ticker_speed: tickerSpeed,
          bg_color: bgColor,
          hero_text_color: heroTextColor,
          circle_text_color: circleTextColor,
          products_text_color: prodTextColor,
          about_text_color: aboutTextColor,
          coll_text_color: collTextColor,
          cta_text_color: ctaTextColor,
          trust_text_color: trustTextColor,
          footer_text_color: footerTextColor,
          hero_image: heroImageUrl || heroImagePreview || undefined,
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
          footer_col2_label: footerCol2Label,
          footer_col3_label: footerCol3Label,
          footer_support_links: footerSupportLinks,
          footer_pay_links: footerPayLinks,
          hero_countdown_label: heroCountdownLabel,
      },
    }).eq("id", seller.id);
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
  const G = "#ff3d6e";
  const N = "#ff3d6e";
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
    fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 4, lineHeight: 1.45,
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
      <div style={{ height: 52, background: "#111116", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 20px", flexShrink: 0, zIndex: 100 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <button onClick={() => router.push("/dashboard")}
            style={{ background: "none", border: "none", color: "rgba(245,245,245,0.35)", cursor: "pointer", fontSize: 18, padding: "4px 8px", borderRadius: 6, transition: "color 0.2s" }}>
            ←
          </button>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.08)" }} />
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#f5f5f5" }}>{seller?.store_name}</div>
            <div style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", letterSpacing: "0.04em" }}>
              {panelVisible && activeSection ? SECTION_LABELS[activeSection] : "Click any section to edit"}
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Device toggle */}
          <div style={{ display: "flex", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, overflow: "hidden" }}>
            {[{ icon: "🖥", label: "desktop" }, { icon: "📱", label: "mobile" }].map(d => (
              <button key={d.label} title={d.label}
                onClick={() => {
                  const iframe = iframeRef.current;
                  if (!iframe) return;
                  if (d.label === "mobile") {
                    iframe.style.width = "390px";
                    iframe.style.margin = "0 auto";
                    iframe.style.display = "block";
                    iframe.style.borderRadius = "20px";
                    iframe.style.border = "8px solid #222";
                  } else {
                    iframe.style.width = "100%";
                    iframe.style.margin = "0";
                    iframe.style.borderRadius = "0";
                    iframe.style.border = "none";
                  }
                }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, padding: "6px 10px" }}>
                {d.icon}
              </button>
            ))}
          </div>

          {/* Open in new tab */}
          {seller?.subdomain && (
            <a href={`/store/${seller.subdomain}`} target="_blank" rel="noreferrer"
              style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(245,245,245,0.35)", textDecoration: "none", padding: "6px 12px", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
              Open Store ↗
            </a>
          )}

          {/* Save */}
          <button onClick={save} disabled={saving}
            style={{ padding: "8px 20px", background: saved ? "#22c55e" : G, color: "#fff", border: "none", borderRadius: 8, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", letterSpacing: "0.04em", transition: "background 0.3s" }}>
            {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
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
              <div style={{ fontSize: 11, color: "rgba(245,245,245,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Loading your store...</div>
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
        <div style={{
          position: "absolute",
          bottom: panelVisible ? 24 : -400,
          left: "50%", transform: "translateX(-50%)",
          width: "min(520px, calc(100vw - 48px))",
          background: "#1a1a22",
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
          <div style={{ padding: "14px 20px", borderBottom: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: "#f5f5f5" }}>
              {activeSection ? SECTION_LABELS[activeSection] : ""}
            </div>
            <button onClick={() => setPanelVisible(false)}
              style={{ background: "none", border: "none", color: "rgba(245,245,245,0.35)", cursor: "pointer", fontSize: 18, lineHeight: 1, padding: "2px 6px" }}>
              ×
            </button>
          </div>

          {/* Panel body */}
          <div style={{ padding: "16px 20px", overflowY: "auto", flex: 1 }}>

            {/* ANNOUNCEMENT */}
            {activeSection === "announcement" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Announcement Text</label>
                <input value={announcement} onChange={e => setAnnouncement(e.target.value)}
                  placeholder="e.g. Free delivery on orders over R800 🎉"
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Shows as the gold bar at the very top of your store. Leave empty to hide it.</div>
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
                    : <div style={{ textAlign: "center" }}><div style={{ fontSize: 32, opacity: 0.25 }}>🏷</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.3)", marginTop: 6 }}>Click to upload your logo</div></div>
                  }
                </div>
                <input ref={logoRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Your logo shows in the top-left nav and the footer. If you leave it empty your store name will appear there instead.</div>
                {logoPreview && (
                  <button onClick={() => { setLogoPreview(""); setLogoFile(null); }}
                    style={{ padding: "8px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 6, color: "#ff3d6e", cursor: "pointer", fontSize: 11 }}>
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
                      : <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>🖼</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.5)", marginTop: 6 }}>Click to upload hero image</div></div>}
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
                      if (!error) { const { data } = supabase.storage.from("store-assets").getPublicUrl(path); const finalUrl = data.publicUrl + "?t=" + Date.now(); setHeroImagePreview(finalUrl); setHeroImageUrl(finalUrl); postUpdate({ heroImage: finalUrl }); }
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
                  <input value={heroCountdownLabel} onChange={e => setHeroCountdownLabel(e.target.value)}
                    placeholder="e.g. Limited drop ends in" style={inputStyle} />
                  <div style={{ ...hintStyle, marginTop: 8 }}>
                    Label above the countdown timer. Leave empty to auto-show
                    &quot;<em>{`<CODE>`}</em> ends in&quot; based on the active
                    discount. The timer itself only appears when a real discount
                    code with &quot;Show Countdown&quot; is active — manage codes
                    in <strong>Dashboard → Discounts</strong>.
                  </div>
                </div>

                {/* Text color (shared) */}
                <div style={{ marginTop: 6, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                    <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Headline Color</span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <label style={{ width: 28, height: 28, borderRadius: 6, background: heroTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                        <input type="color" value={heroTextColor} onChange={e => setHeroTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                      </label>
                      <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{heroTextColor}</span>
                      <button onClick={() => setHeroTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* HERO — Crown / Soft Luxury / Glass Chrome (legacy mapping) */}
            {activeSection === "hero" && seller?.template !== "heirloom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Background Image</label>
                  <div onClick={() => heroImageRef.current?.click()}
                    style={{ width: "100%", height: 120, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.25)", background: "rgba(255,255,255,0.04)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {heroImagePreview
                      ? <img src={heroImagePreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center" }}><div style={{ fontSize: 28 }}>🖼</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.5)", marginTop: 6 }}>Click to upload hero image</div></div>
                    }
                  </div>
                  <input ref={heroImageRef} type="file" accept="image/*"
                    onChange={async e => {
                      const f = e.target.files?.[0]; if (!f || !seller) return;
                      // Show preview immediately from local file
                      const reader = new FileReader();
                      reader.onload = ev => {
                        const localUrl = ev.target?.result as string;
                        setHeroImagePreview(localUrl);
                        postUpdate({ heroImage: localUrl });
                      };
                      reader.readAsDataURL(f);
                      // Also upload to storage for persistence
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
                  <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 4 }}>Full-screen background on your homepage. Different from your logo.</div>
                </div>
                <div>
                  <label style={labelStyle}>Tagline (Hero Headline)</label>
                  <input value={tagline} onChange={e => setTagline(e.target.value)}
                    placeholder="e.g. Wear your crown with confidence"
                    style={inputStyle} />
                  <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 5 }}>The big text on your homepage. 5–8 words works best.</div>
                </div>
                <div>
                  <label style={labelStyle}>Hero Subtext</label>
                  <input value={heroSubtext} onChange={e => setHeroSubtext(e.target.value)}
                    placeholder="e.g. Premium Hair Collection · SA Delivered"
                    style={inputStyle} />
                  <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 4 }}>Small uppercase text above the main headline. Leave empty to hide.</div>
                </div>
                <div>
                  <label style={labelStyle}>Subtitle</label>
                  <textarea value={description} onChange={e => setDescription(e.target.value)}
                    rows={3} placeholder="Short description under the headline..."
                    style={{ ...inputStyle, resize: "vertical" }} />
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Headline Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: heroTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={heroTextColor} onChange={e => setHeroTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{heroTextColor}</span>
                    <button onClick={() => setHeroTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* PROMO TICKER */}
            {activeSection === "ticker" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={labelStyle}>Promo Messages</label>
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 4 }}>These scroll across the top of your store. One message per line.</div>
                {tickerTexts.map((txt, i) => (
                  <div key={i} style={{ display: "flex", gap: 8 }}>
                    <input value={txt}
                      onChange={e => { const u = [...tickerTexts]; u[i] = e.target.value; setTickerTexts(u); }}
                      placeholder="e.g. FREE DELIVERY OVER R500"
                      style={{ ...inputStyle, flex: 1 }} />
                    {tickerTexts.length > 1 && (
                      <button onClick={() => setTickerTexts(tickerTexts.filter((_, j) => j !== i))}
                        style={{ width: 32, height: 38, background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 6, color: "#ff3d6e", cursor: "pointer", fontSize: 14 }}>×</button>
                    )}
                  </div>
                ))}
                <button onClick={() => setTickerTexts([...tickerTexts, ""])}
                  style={{ padding: "8px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "rgba(245,245,245,0.4)", cursor: "pointer", fontSize: 12 }}>
                  + Add message
                </button>
                <div style={{ marginTop: 8 }}>
                  <label style={{ ...labelStyle, display: "flex", justifyContent: "space-between" }}>
                    <span>Scroll Speed</span>
                    <span style={{ color: "rgba(245,245,245,0.4)" }}>{tickerSpeed}s</span>
                  </label>
                  <input type="range" min={8} max={60} value={tickerSpeed} onChange={e => setTickerSpeed(Number(e.target.value))}
                    style={{ width: "100%", marginTop: 6, accentColor: "#c4a265" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>
                    <span>Fast</span><span>Slow</span>
                  </div>
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 6 }}>Suggested</label>
                  {["FREE DELIVERY ON ORDERS OVER R500", "UP TO 50% OFF ON SELECTED ITEMS", "NEW ARRIVALS JUST DROPPED", "LIMITED STOCK — ORDER NOW"].map(preset => (
                    <button key={preset} onClick={() => { if (!tickerTexts.includes(preset)) setTickerTexts([...tickerTexts, preset]); }}
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
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Small uppercase label above the circles. Leave empty to hide.</div>
                <label style={labelStyle}>Section Subtitle</label>
                <input value={circleSubtitle} onChange={e => setCircleSubtitle(e.target.value)}
                  placeholder="e.g. Find your signature look"
                  style={inputStyle} />

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: circleTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={circleTextColor} onChange={e => setCircleTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{circleTextColor}</span>
                    <button onClick={() => setCircleTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
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
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Small uppercase text above the heading.</div>
                <label style={labelStyle}>Section Heading</label>
                <input value={productsHeading} onChange={e => setProductsHeading(e.target.value)}
                  placeholder="e.g. Latest arrivals"
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 4 }}>The big heading above your products grid.</div>
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  To add or edit products, go to your <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: G, cursor: "pointer", fontSize: 12, fontWeight: 700, padding: 0 }}>Dashboard →</button>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: prodTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={prodTextColor} onChange={e => setProdTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{prodTextColor}</span>
                    <button onClick={() => setProdTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* COLLECTIONS */}
            {activeSection === "collections" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Section Label</label>
                <input value={collLabel} onChange={e => setCollLabel(e.target.value)}
                  placeholder="e.g. Featured Collections"
                  style={inputStyle} />
                <label style={labelStyle}>Section Subtitle</label>
                <input value={collSubtitle} onChange={e => setCollSubtitle(e.target.value)}
                  placeholder="e.g. Find your signature look"
                  style={inputStyle} />
                <label style={labelStyle}>Collection Order</label>
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 6 }}>Drag to reorder how collections appear on your store.</div>
                {collOrder.length > 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
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
                        style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, cursor: "grab", userSelect: "none" }}>
                        <span style={{ color: "rgba(245,245,245,0.3)", fontSize: 14 }}>⠿</span>
                        <span style={{ flex: 1, fontSize: 13 }}>{col}</span>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          <button onClick={() => { if (i === 0) return; const u = [...collOrder]; [u[i-1], u[i]] = [u[i], u[i-1]]; setCollOrder(u); }}
                            style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 4, color: "rgba(245,245,245,0.5)", cursor: "pointer", fontSize: 10, padding: "2px 6px" }}>▲</button>
                          <button onClick={() => { if (i === collOrder.length-1) return; const u = [...collOrder]; [u[i], u[i+1]] = [u[i+1], u[i]]; setCollOrder(u); }}
                            style={{ background: "rgba(255,255,255,0.06)", border: "none", borderRadius: 4, color: "rgba(245,245,245,0.5)", cursor: "pointer", fontSize: 10, padding: "2px 6px" }}>▼</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.3)" }}>
                    Collections come from your product categories. Add products with categories in the dashboard first.
                  </div>
                )}
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: circleTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={circleTextColor} onChange={e => setCircleTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{circleTextColor}</span>
                    <button onClick={() => setCircleTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: collTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={collTextColor} onChange={e => setCollTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{collTextColor}</span>
                    <button onClick={() => setCollTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* ABOUT */}
            {activeSection === "about" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Section Label</label>
                <input value={aboutLabel} onChange={e => setAboutLabel(e.target.value)}
                  placeholder="e.g. Our Story"
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Small uppercase text above the heading. Leave empty to hide.</div>
                <label style={labelStyle}>Section Heading</label>
                <input value={aboutTitle} onChange={e => setAboutTitle(e.target.value)}
                  placeholder="e.g. Hair that moves with you."
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 4 }}>Leave empty to show no heading.</div>
                <label style={labelStyle}>Brand Story / About Text</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={5} placeholder="Tell your customers who you are, what you sell, and why they should trust you..."
                  style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>This shows in the About section. Be genuine — 2 to 4 sentences is enough.</div>

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: aboutTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={aboutTextColor} onChange={e => setAboutTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{aboutTextColor}</span>
                    <button onClick={() => setAboutTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

            {/* TRUST BAR */}
            {activeSection === "trust" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={labelStyle}>Trust Bar Items</label>
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Click an icon to pick it. Leave title empty to hide an item.</div>
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
                    <div style={{ display: "flex", gap: 8 }}>
                      <input value={item.title} onChange={e => { const u = [...trustItems]; u[i] = { ...u[i], title: e.target.value }; setTrustItems(u); }}
                        placeholder="Title" style={{ ...inputStyle, flex: 1 }} />
                      <input value={item.desc} onChange={e => { const u = [...trustItems]; u[i] = { ...u[i], desc: e.target.value }; setTrustItems(u); }}
                        placeholder="Description" style={{ ...inputStyle, flex: 2 }} />
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: trustTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={trustTextColor} onChange={e => setTrustTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{trustTextColor}</span>
                    <button onClick={() => setTrustTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
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
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Use a real review from a happy customer. Short and specific works better than long and vague.</div>
              </div>
            )}

            {/* CTA BANNER */}
            {activeSection === "cta" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>CTA Headline</label>
                <input value={ctaHeadline} onChange={e => setCtaHeadline(e.target.value)}
                  placeholder="e.g. Your next look starts here"
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 4 }}>The big text in the full-width banner near the bottom of the page.</div>
                <label style={labelStyle}>CTA Subtext</label>
                <textarea value={ctaSubtext} onChange={e => setCtaSubtext(e.target.value)}
                  rows={3} placeholder="e.g. Browse our full collection..."
                  style={{ ...inputStyle, resize: "vertical" }} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>The smaller descriptive text below the headline.</div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: aboutTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={aboutTextColor} onChange={e => setAboutTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{aboutTextColor}</span>
                    <button onClick={() => setAboutTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: trustTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={trustTextColor} onChange={e => setTrustTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{trustTextColor}</span>
                    <button onClick={() => setTrustTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Text Color</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: ctaTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={ctaTextColor} onChange={e => setCtaTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{ctaTextColor}</span>
                    <button onClick={() => setCtaTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
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
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Small uppercase text above the heading. Leave empty to hide.</div>
                <label style={labelStyle}>Section Heading</label>
                <input value={promiseTitle} onChange={e => setPromiseTitle(e.target.value)}
                  placeholder="e.g. Built on trust, delivered with care"
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 4 }}>The big heading at the top of this section.</div>
                <label style={labelStyle}>Promise Items</label>
                {promiseItems.map((item, i) => (
                  <div key={i} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Item {i+1}</div>
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
                          : <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)" }}>Click to upload image</div>
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
            {activeSection === "policies" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <label style={labelStyle}>Shipping & Policies</label>
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 4 }}>Edit what shows in the Shipping / Returns / Payment section.</div>
                {(seller?.store_config?.policy_items || [
                  { title: "Shipping", desc: "" },
                  { title: "Returns",  desc: "" },
                  { title: "Payment",  desc: "" },
                ]).map((pol, i) => {
                  const policyItems = seller?.store_config?.policy_items || [
                    { title: "Shipping", desc: "Free delivery on orders over R500. Standard 2–4 days nationwide." },
                    { title: "Returns",  desc: "14-day returns on all unopened products in original packaging." },
                    { title: "Payment",  desc: "Secure card payments via PayFast. EFT accepted. WhatsApp orders welcome." },
                  ];
                  return (
                    <div key={i} style={{ padding: "12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                      <input
                        defaultValue={policyItems[i]?.title || pol.title}
                        onBlur={async e => {
                          if (!seller) return;
                          const items = [...(seller.store_config?.policy_items || policyItems)];
                          items[i] = { ...items[i], title: e.target.value };
                          await supabase.from("sellers").update({ store_config: { ...seller.store_config, policy_items: items } }).eq("id", seller.id);
                          setSeller({ ...seller, store_config: { ...seller.store_config, policy_items: items } });
                          if (seller.subdomain) void revalidateStore(seller.subdomain).catch(() => {});
                        }}
                        placeholder="e.g. Shipping"
                        style={{ ...inputStyle, fontWeight: 700 }} />
                      <textarea
                        defaultValue={policyItems[i]?.desc || pol.desc}
                        onBlur={async e => {
                          if (!seller) return;
                          const items = [...(seller.store_config?.policy_items || policyItems)];
                          items[i] = { ...items[i], desc: e.target.value };
                          await supabase.from("sellers").update({ store_config: { ...seller.store_config, policy_items: items } }).eq("id", seller.id);
                          setSeller({ ...seller, store_config: { ...seller.store_config, policy_items: items } });
                          if (seller.subdomain) void revalidateStore(seller.subdomain).catch(() => {});
                        }}
                        placeholder="Description..."
                        rows={3}
                        style={{ ...inputStyle, resize: "vertical" }} />
                    </div>
                  );
                })}
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Changes save automatically when you click out of a field.</div>
              </div>
            )}

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
                  <label style={labelStyle}>Column 2 Heading</label>
                  <input value={footerCol2Label} onChange={e => setFooterCol2Label(e.target.value)}
                    placeholder="Support" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Column 2 Link Labels</label>
                  {footerSupportLinks.map((txt, i) => (
                    <input key={i} value={txt}
                      onChange={e => { const u = [...footerSupportLinks]; u[i] = e.target.value; setFooterSupportLinks(u); }}
                      placeholder={["Shipping", "Returns", "Sizing", "Contact"][i] || ""}
                      style={{ ...inputStyle, marginBottom: 6 }} />
                  ))}
                  <div style={hintStyle}>Last link auto-links to your WhatsApp number if set.</div>
                </div>

                <div>
                  <label style={labelStyle}>Column 3 Heading</label>
                  <input value={footerCol3Label} onChange={e => setFooterCol3Label(e.target.value)}
                    placeholder="Pay" style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Column 3 Link Labels</label>
                  {footerPayLinks.map((txt, i) => (
                    <input key={i} value={txt}
                      onChange={e => { const u = [...footerPayLinks]; u[i] = e.target.value; setFooterPayLinks(u); }}
                      placeholder={["Card", "EFT", "PayFast", "WhatsApp Order"][i] || ""}
                      style={{ ...inputStyle, marginBottom: 6 }} />
                  ))}
                  <div style={hintStyle}>Any label containing &quot;WhatsApp&quot; will open the cart on click.</div>
                </div>

                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  Social links (Instagram, TikTok, Facebook, X, WhatsApp) appear automatically below the tagline based on what you&apos;ve set in Dashboard → My Store.
                </div>
              </div>
            )}

            {/* FOOTER — Crown / Soft Luxury / Glass Chrome (legacy mapping) */}
            {activeSection === "footer" && seller?.template !== "heirloom" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <label style={labelStyle}>Footer Tagline</label>
                <input value={tagline} onChange={e => setTagline(e.target.value)}
                  placeholder="e.g. Premium quality. Delivered across SA."
                  style={inputStyle} />
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginBottom: 8 }}>The short line under your name/logo in the footer.</div>
                <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                  Your logo (if uploaded) will show automatically in the footer. Social links are managed in Dashboard → My Store.
                </div>
                <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)" }}>
                  <div style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(245,245,245,0.3)", marginBottom: 8 }}>Colors</div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Text Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: footerTextColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={footerTextColor} onChange={e => setFooterTextColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{footerTextColor}</span>
                    <button onClick={() => setFooterTextColor("#f0e6d3")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, marginTop: 6 }}>
                  <span style={{ fontSize: 11, color: "rgba(245,245,245,0.45)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Page Background</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: bgColor as string, border: "1px solid rgba(255,255,255,0.15)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={bgColor} onChange={e => setBgColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 10, color: "rgba(245,245,245,0.3)", fontFamily: "monospace" }}>{bgColor}</span>
                    <button onClick={() => setBgColor("#0a0908")} style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", background: "none", border: "none", cursor: "pointer" }}>↺</button>
                  </div>
                </div>
                </div>
              </div>
            )}

          </div>

          {/* Panel save button */}
          <div style={{ padding: "12px 20px", borderTop: "1px solid rgba(255,255,255,0.06)", flexShrink: 0, display: "flex", gap: 10 }}>
            <button onClick={save} disabled={saving}
              style={{ flex: 1, padding: "10px", background: G, color: "#fff", border: "none", borderRadius: 8, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer" }}>
              {saving ? "Saving..." : saved ? "✓ Saved!" : "Save Changes"}
            </button>
            <button onClick={() => setPanelVisible(false)}
              style={{ padding: "10px 16px", background: "rgba(255,255,255,0.04)", color: "rgba(245,245,245,0.4)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, fontSize: 12, cursor: "pointer" }}>
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
            <span style={{ fontSize: 14 }}>👆</span>
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


/* ─── CTA TARGET PICKER ───────────────────────────────────
   Lets the seller pick what a hero button does: scroll to products,
   navigate to a specific collection page, open a custom URL, or hide
   the button entirely. Reused for both primary and secondary CTAs. */
function CtaTargetPicker({
  target,
  onChange,
  collections,
}: {
  target: CtaTarget;
  onChange: (t: CtaTarget) => void;
  collections: string[];
}) {
  const baseInput: React.CSSProperties = {
    width: "100%", padding: "9px 11px",
    background: "rgba(255,255,255,0.04)",
    border: "1px solid rgba(255,255,255,0.08)",
    borderRadius: 8, color: "#f5f5f5",
    fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif",
    outline: "none",
  };
  const labelMini: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
    textTransform: "uppercase", color: "rgba(245,245,245,0.35)",
    display: "block", marginBottom: 5,
  };
  return (
    <div>
      <label style={labelMini}>Link to</label>
      <select
        value={target.type}
        onChange={e => {
          const t = e.target.value as CtaTarget["type"];
          if (t === "products") onChange({ type: "products" });
          else if (t === "collection") onChange({ type: "collection", collection: target.type === "collection" ? target.collection : "" });
          else if (t === "url") onChange({ type: "url", url: target.type === "url" ? target.url : "" });
          else onChange({ type: "none" });
        }}
        style={baseInput}
      >
        <option value="products">↓ Scroll to products section</option>
        <option value="collection">Collection page</option>
        <option value="url">Custom URL</option>
        <option value="none">No link — hide button</option>
      </select>

      {target.type === "collection" && (
        <div style={{ marginTop: 8 }}>
          <label style={labelMini}>Collection</label>
          <select
            value={target.collection}
            onChange={e => onChange({ type: "collection", collection: e.target.value })}
            style={baseInput}
          >
            <option value="">— Choose a collection —</option>
            {collections.map(c => (
              <option key={c} value={collectionSlug(c)}>{c}</option>
            ))}
          </select>
          {collections.length === 0 && (
            <div style={{ fontSize: 10, color: "rgba(245,245,245,0.4)", marginTop: 4 }}>
              Add collections in the dashboard to link to them here.
            </div>
          )}
        </div>
      )}

      {target.type === "url" && (
        <div style={{ marginTop: 8 }}>
          <label style={labelMini}>URL</label>
          <input
            type="url"
            value={target.url}
            placeholder="https://..."
            onChange={e => onChange({ type: "url", url: e.target.value })}
            style={baseInput}
          />
        </div>
      )}
    </div>
  );
}
