"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams, useSearchParams, useRouter } from "next/navigation";

const pInCat = (p: { category: string }, cat: string) =>
  (p.category || "").split(",").map((c) => c.trim()).includes(cat);

const FONT_PAIRS: Record<string, { heading: string; body: string; import: string }> = {
  "cormorant-jost": { heading: "'Cormorant Garamond', serif", body: "'Jost', sans-serif", import: "family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700" },
  "playfair-lato": { heading: "'Playfair Display', serif", body: "'Lato', sans-serif", import: "family=Playfair+Display:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Lato:wght@300;400;700" },
  "dm-serif-inter": { heading: "'DM Serif Display', serif", body: "'Inter', sans-serif", import: "family=DM+Serif+Display:ital@0;1&family=Inter:wght@300;400;500;600;700" },
  "libre-raleway": { heading: "'Libre Baskerville', serif", body: "'Raleway', sans-serif", import: "family=Libre+Baskerville:ital,wght@0,400;0,700;1,400&family=Raleway:wght@300;400;500;600;700" },
  "fraunces-outfit": { heading: "'Fraunces', serif", body: "'Outfit', sans-serif", import: "family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,300;1,9..144,400&family=Outfit:wght@300;400;500;600;700" },
  "eb-garamond-source": { heading: "'EB Garamond', serif", body: "'Source Sans 3', sans-serif", import: "family=EB+Garamond:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Source+Sans+3:wght@300;400;500;600;700" },
  "bodoni-montserrat": { heading: "'Bodoni Moda', serif", body: "'Montserrat', sans-serif", import: "family=Bodoni+Moda:ital,opsz,wght@0,6..96,400;0,6..96,500;0,6..96,600;0,6..96,700;1,6..96,400&family=Montserrat:wght@300;400;500;600;700" },
  "josefin-sans": { heading: "'Josefin Sans', sans-serif", body: "'Josefin Sans', sans-serif", import: "family=Josefin+Sans:wght@100;200;300;400;500;600;700" },
  "tenor-work": { heading: "'Tenor Sans', sans-serif", body: "'Work Sans', sans-serif", import: "family=Tenor+Sans&family=Work+Sans:wght@300;400;500;600;700" },
};

const TrustIcon = ({ id, size = 24, color }: { id: string; size?: number; color?: string }) => {
  const props = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: color || "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (id) {
    case "shield": return <svg {...props}><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/></svg>;
    case "star": return <svg {...props}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;
    case "diamond": return <svg {...props}><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/><path d="M12 22V9"/><path d="M6 3l6 6 6-6"/></svg>;
    case "truck": return <svg {...props}><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>;
    case "package": return <svg {...props}><path d="M21 10V7a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 7v10a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 17v-3"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>;
    case "refresh": return <svg {...props}><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg>;
    case "lock": return <svg {...props}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>;
    case "card": return <svg {...props}><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>;
    case "check": return <svg {...props}><polyline points="20 6 9 17 4 12"/></svg>;
    case "award": return <svg {...props}><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg>;
    case "tag": return <svg {...props}><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>;
    case "globe": return <svg {...props}><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>;
    case "heart": return <svg {...props}><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>;
    case "clock": return <svg {...props}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
    case "phone": return <svg {...props}><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.04 4.72 2 2 0 012 2.5h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 10a16 16 0 006 6l.36-.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>;
    case "map": return <svg {...props}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>;
    default: return <span style={{ fontSize: size }}>{id}</span>;
  }
};

interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string; template: string;
  primary_color: string; logo_url: string; banner_url: string; tagline: string; description: string;
  collections: string[];
  social_links: { whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string };
  store_config: { show_banner_text: boolean; show_marquee: boolean; show_collections: boolean; show_about: boolean; show_trust_bar: boolean; show_policies: boolean; announcement: string; about_image?: string; marquee_texts?: string[]; trust_items?: { icon: string; title: string; desc: string }[]; policy_items?: { title: string; desc: string }[]; footer_about?: string; shipping_policy?: string; return_policy?: string; contact_email?: string; contact_phone?: string; operating_hours?: string; physical_address?: string; show_address?: boolean; products_collapsed?: boolean };
  checkout_config?: { whatsapp_checkout_enabled?: boolean; payfast_enabled?: boolean; eft_enabled?: boolean };
  subscription_status?: string; trial_ends_at?: string;
}

interface Variant { name: string; options: string[]; images?: { [option: string]: string }; }
interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean; description: string;
  sort_order: number; created_at: string;
}

interface CartItem { product: Product; qty: number; selectedVariants: { [key: string]: string }; }

const fmt = (n: number) => "R" + Math.round(n).toLocaleString("en-ZA");
const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.style.display = "none"; };

interface StorePageProps {
  initialSeller?: Seller;
  initialProducts?: Product[];
  initialDiscountCodes?: any[];
  initialProductId?: string;
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

export default function StorePage({ initialSeller, initialProducts, initialDiscountCodes, initialProductId }: StorePageProps = {}) {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const slug = params.slug as string;
  const isEditMode = searchParams.get("editMode") === "true";

  /* Live edit overrides from postMessage */
  const [liveTagline, setLiveTagline]           = useState<string | null>(null);
  const [liveDescription, setLiveDescription]   = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null);
  const [liveTrustItems, setLiveTrustItems]     = useState<{ icon: string; title: string; desc: string }[] | null>(null);
  const [livePolicyItems, setLivePolicyItems]   = useState<{ title: string; desc: string }[] | null>(null);
  const [liveAboutImage, setLiveAboutImage]     = useState<string | null>(null);
  const [liveHeroTitle, setLiveHeroTitle]       = useState<string | null>(null);
  const [liveFontPair, setLiveFontPair]         = useState<string | null>(null);
  const [liveHeaderTransparent, setLiveHeaderTransparent] = useState<boolean | null>(null);
  const [liveHeaderBorder, setLiveHeaderBorder]           = useState<boolean | null>(null);
  const [liveBgColor, setLiveBgColor]                     = useState<string | null>(null);
  const [liveTextColor, setLiveTextColor]                 = useState<string | null>(null);
  const [liveMutedColor, setLiveMutedColor]               = useState<string | null>(null);
  const [liveCollLabel, setLiveCollLabel]                 = useState<string | null>(null);
  const [liveCollSubtitle, setLiveCollSubtitle]           = useState<string | null>(null);
  const [liveProductsLabel, setLiveProductsLabel]         = useState<string | null>(null);
  const [liveProductsHeading, setLiveProductsHeading]     = useState<string | null>(null);
  const [liveProductCardRatio, setLiveProductCardRatio]   = useState<string | null>(null);
  const [liveLogoUrl, setLiveLogoUrl]           = useState<string | null>(null);
  const [liveFooterAbout, setLiveFooterAbout]   = useState<string | null>(null);
  const [liveContactEmail, setLiveContactEmail] = useState<string | null>(null);
  const [liveContactPhone, setLiveContactPhone] = useState<string | null>(null);
  const [livePhysicalAddress, setLivePhysicalAddress] = useState<string | null>(null);
  const [liveOperatingHours, setLiveOperatingHours] = useState<string | null>(null);
  const [hoveredSection, setHoveredSection]     = useState<string | null>(null);
  const [policyModal, setPolicyModal]           = useState<{ title: string; content: string } | null>(null);
  const [contactOpen, setContactOpen]           = useState(false);
  const [productsExpanded, setProductsExpanded] = useState(!initialSeller?.store_config?.products_collapsed);
  const [collectionsExpanded, setCollectionsExpanded] = useState(!(initialSeller?.store_config as any)?.collections_collapsed);
  const [expandedPolicy, setExpandedPolicy]     = useState<number | null>(null);

  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [seller, setSeller] = useState<Seller | null>(initialSeller ?? null);
  const [products, setProducts] = useState<Product[]>(initialProducts ?? []);
  const [loading, setLoading] = useState(!initialSeller);
  const [notFound, setNotFound] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [productSort, setProductSort] = useState("default");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  const [modalQty, setModalQty] = useState(1);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [countdown, setCountdown] = useState(5);
  const [promoCountdown, setPromoCountdown] = useState<{ code: string; type: string; value: number; applies_to: string; expires_at: string; timeLeft: string } | null>(() => buildInitialPromos(initialDiscountCodes).countdown);
  const [promoDiscounts, setPromoDiscounts] = useState<{ code: string; type: string; value: number; applies_to: string; expires_at: string; product_ids: string[]; collection_names: string[]; timeLeft: string }[]>(() => buildInitialPromos(initialDiscountCodes).discounts);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setOrderStatus(p.get("order"));
    }
    if (initialSeller) {
      if (isEditMode) window.parent.postMessage({ type: "IFRAME_READY" }, "*");
      return;
    }
    loadStore();
  }, [slug]);

  useEffect(() => {
    if (!orderStatus) return;
    const timer = setInterval(() => setCountdown((c) => c - 1), 1000);
    const redirect = setTimeout(() => { window.location.href = "/store/" + slug; }, 5000);
    return () => { clearInterval(timer); clearTimeout(redirect); };
  }, [orderStatus, slug]);

  /* Listen for live updates from editor */
  useEffect(() => {
    if (!isEditMode) return;
    const handler = (e: MessageEvent) => {
      if (e.data?.type !== "LIVE_UPDATE") return;
      if (e.data.tagline      !== undefined) setLiveTagline(e.data.tagline);
      if (e.data.description  !== undefined) setLiveDescription(e.data.description);
      if (e.data.announcement !== undefined) setLiveAnnouncement(e.data.announcement);
      if (e.data.trustItems   !== undefined) setLiveTrustItems(e.data.trustItems);
      if (e.data.policyItems  !== undefined) setLivePolicyItems(e.data.policyItems);
      if (e.data.aboutImage   !== undefined) setLiveAboutImage(e.data.aboutImage || null);
      if (e.data.logoUrl      !== undefined) setLiveLogoUrl(e.data.logoUrl);
      if (e.data.heroTitle   !== undefined) setLiveHeroTitle(e.data.heroTitle);
      if (e.data.fontPair    !== undefined) setLiveFontPair(e.data.fontPair);
      if (e.data.headerTransparent !== undefined) setLiveHeaderTransparent(e.data.headerTransparent);
      if (e.data.headerBorder !== undefined) setLiveHeaderBorder(e.data.headerBorder);
      if (e.data.bgColor     !== undefined) setLiveBgColor(e.data.bgColor);
      if (e.data.textColor   !== undefined) setLiveTextColor(e.data.textColor);
      if (e.data.mutedColor  !== undefined) setLiveMutedColor(e.data.mutedColor);
      if (e.data.collLabel   !== undefined) setLiveCollLabel(e.data.collLabel);
      if (e.data.collSubtitle !== undefined) setLiveCollSubtitle(e.data.collSubtitle);
      if (e.data.productsLabel !== undefined) setLiveProductsLabel(e.data.productsLabel);
      if (e.data.productsHeading !== undefined) setLiveProductsHeading(e.data.productsHeading);
      if (e.data.productCardRatio !== undefined) setLiveProductCardRatio(e.data.productCardRatio);
      if (e.data.collectionsCollapsed !== undefined) setCollectionsExpanded(!e.data.collectionsCollapsed);
      if (e.data.footerAbout !== undefined) setLiveFooterAbout(e.data.footerAbout);
      if (e.data.contactEmail !== undefined) setLiveContactEmail(e.data.contactEmail);
      if (e.data.contactPhone !== undefined) setLiveContactPhone(e.data.contactPhone);
      if (e.data.physicalAddress !== undefined) setLivePhysicalAddress(e.data.physicalAddress);
      if (e.data.operatingHours !== undefined) setLiveOperatingHours(e.data.operatingHours);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  const loadStore = async () => {
    const { data: sd } = await supabase.from("sellers").select("id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, checkout_config, subscription_status, trial_ends_at").eq("subdomain", slug).single();
    if (!sd) { setNotFound(true); setLoading(false); return; }
    setSeller(sd);
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", sd.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true });
    if (pd) setProducts(pd);
    const { data: dcs } = await supabase.from("discount_codes").select("*").eq("seller_id", sd.id).eq("active", true).eq("show_countdown", true).not("expires_at", "is", null);
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
  };

  // Promo countdown ticker
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

  const getProductPromo = (productId: string) => promoDiscounts.find((d) => d.applies_to === "product" && d.product_ids?.includes(productId) && d.timeLeft);
  const getCollectionPromo = (colName: string) => promoDiscounts.find((d) => d.applies_to === "collection" && d.collection_names?.includes(colName) && d.timeLeft);

  const cfg = seller?.store_config || { show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, announcement: "" };
  const social = seller?.social_links || {};
  const accent = seller?.primary_color || "#9c7c62";
  const pageBg = liveBgColor ?? (cfg as any).bg_color ?? "#f6f3ef";
  const pageText = liveTextColor ?? (cfg as any).text_color ?? "#2a2a2e";
  const pageMuted = liveMutedColor ?? (cfg as any).muted_color ?? "#8a8690";
  const fontPairKey = liveFontPair ?? (cfg as any).font_pair ?? "cormorant-jost";
  const fonts = FONT_PAIRS[fontPairKey] || FONT_PAIRS["cormorant-jost"];
  const headerTransparent = liveHeaderTransparent !== null ? liveHeaderTransparent : (cfg as any).header_transparent === true;
  const headerBorder = liveHeaderBorder !== null ? liveHeaderBorder : (cfg as any).header_border !== false;
  const displayCollLabel = liveCollLabel ?? (cfg as any).coll_label ?? "Curated For You";
  const displayCollSubtitle = liveCollSubtitle ?? (cfg as any).coll_subtitle ?? "Shop by Collection";
  const displayProductsLabel = liveProductsLabel ?? (cfg as any).products_label ?? "Browse";
  const displayProductsHeading = liveProductsHeading ?? (cfg as any).products_heading ?? "All Collections";
  const cardRatio = liveProductCardRatio ?? (cfg as any).product_card_ratio ?? "3/4";
  const displayFooterAbout = liveFooterAbout ?? (cfg as any).footer_about ?? seller?.description ?? "";
  const displayContactEmail = liveContactEmail ?? (cfg as any).contact_email ?? "";
  const displayContactPhone = liveContactPhone ?? (cfg as any).contact_phone ?? "";
  const displayPhysicalAddress = livePhysicalAddress ?? (cfg as any).physical_address ?? "";
  const displayOperatingHours = liveOperatingHours ?? (cfg as any).operating_hours ?? "";
  const productsCollapsed = (cfg as any).products_collapsed === true;
  const collections = seller?.collections || [];
  const marqueeTexts = (cfg.marquee_texts !== undefined ? cfg.marquee_texts.filter((t: string) => t.trim()) : [seller?.tagline || "Premium Collection", "Free Delivery on Qualifying Orders", "Shipped Nationwide"]);
  const trustItems = cfg.trust_items?.length ? cfg.trust_items : [{ icon: "\u2605", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "\u2708", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "\u21BA", title: "Easy Returns", desc: "14-day policy" }, { icon: "\u26A1", title: "Secure Payment", desc: "Card & WhatsApp" }];
  const policyItems = livePolicyItems ?? (cfg.policy_items?.length ? cfg.policy_items : [{ title: "Shipping", desc: "Standard delivery 3-5 business days nationwide. Free shipping on qualifying orders." }, { title: "Returns", desc: "Return unworn items within 14 days for a full refund. Items must be in original condition." }, { title: "Payment", desc: "Secure card payments and WhatsApp checkout for a personal experience." }]);
  const cats = ["All", ...collections.filter((c) => products.some((p) => pInCat(p, c)))];
  const filtered = (() => {
    let list = activeCategory === "All" ? [...products] : products.filter((p) => pInCat(p, activeCategory));
    if (productSort === "az") list.sort((a, b) => a.name.localeCompare(b.name));
    else if (productSort === "za") list.sort((a, b) => b.name.localeCompare(a.name));
    else if (productSort === "latest") list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    else if (productSort === "oldest") list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    else if (productSort === "price-low") list.sort((a, b) => a.price - b.price);
    else if (productSort === "price-high") list.sort((a, b) => b.price - a.price);
    else list.sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    return list;
  })();
  const searched = searchQuery ? products.filter((p) => p.name.toLowerCase().includes(searchQuery.toLowerCase())) : null;

  const openProduct = (p: Product) => { setSelectedProduct(p); setActiveImageIndex(0); setModalQty(1); const d: { [k: string]: string } = {}; (p.variants || []).forEach((v) => { if (v.options?.length > 0) d[v.name] = v.options[0]; }); setSelectedVariants(d); if (!isEditMode) window.history.replaceState(null, "", `/store/${slug}/p/${p.id}`); };
  const closeProduct = () => { setSelectedProduct(null); setSelectedVariants({}); setModalQty(1); if (!isEditMode) window.history.replaceState(null, "", `/store/${slug}`); };

  useEffect(() => {
    if (initialProductId && products.length > 0 && !selectedProduct) {
      const p = products.find((pr) => pr.id === initialProductId);
      if (p) openProduct(p);
    }
  }, [initialProductId, products.length]);

  /* Escape closes whichever overlay is open. Customers expect this. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (policyModal) setPolicyModal(null);
      else if (contactOpen) setContactOpen(false);
      else if (selectedProduct) closeProduct();
      else if (showCart) setShowCart(false);
      else if (showSearch) { setShowSearch(false); setSearchQuery(""); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedProduct, showCart, showSearch]);

  /* Lock body scroll when any overlay is open */
  useEffect(() => {
    const open = !!selectedProduct || showCart || showSearch || !!policyModal || contactOpen;
    if (typeof document === "undefined") return;
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [selectedProduct, showCart, showSearch, policyModal, contactOpen]);

  const addToCart = (p: Product, qty: number = 1) => {
    const key = JSON.stringify(selectedVariants);
    const idx = cart.findIndex((i) => i.product.id === p.id && JSON.stringify(i.selectedVariants) === key);
    if (idx >= 0) { const u = [...cart]; u[idx].qty += qty; setCart(u); }
    else setCart([...cart, { product: p, qty, selectedVariants: { ...selectedVariants } }]);
    closeProduct(); setShowCart(true);
  };

  const removeFromCart = (i: number) => setCart(cart.filter((_, idx) => idx !== i));
  const updateQty = (i: number, d: number) => { const u = [...cart]; u[i].qty += d; if (u[i].qty < 1) u[i].qty = 1; setCart(u); };
  const subtotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  /* Promo discount */
  const lineDiscount = cart.reduce((sum, item) => {
    const productPromo = getProductPromo(item.product.id);
    const collectionPromo = item.product.category ? getCollectionPromo(item.product.category) : undefined;
    const promo = productPromo || collectionPromo;
    if (!promo) return sum;
    const lt = item.product.price * item.qty;
    return sum + (promo.type === "percentage" ? lt * (promo.value / 100) : Math.min(promo.value, lt));
  }, 0);
  const cartPromo = promoDiscounts.find((d) => d.applies_to === "cart");
  const afterLine = Math.max(0, subtotal - lineDiscount);
  const cartDiscount = cartPromo
    ? (cartPromo.type === "percentage" ? afterLine * (cartPromo.value / 100) : Math.min(cartPromo.value, afterLine))
    : 0;
  const cartTotal = Math.max(0, afterLine - cartDiscount);
  const totalDiscount = lineDiscount + cartDiscount;

  /* Normalize SA WhatsApp number: strip non-digits, then convert leading 0 to 27 */
  const normalizeWa = (raw: string) => {
    const digits = (raw || "").replace(/\D/g, "");
    if (!digits) return "";
    if (digits.startsWith("0")) return "27" + digits.substring(1);
    return digits;
  };

  const checkoutWhatsApp = () => {
    if (!seller?.whatsapp_number) return;
    let msg = "Hi! I'd like to order:\n\n";
    cart.forEach((i) => { msg += "- " + i.product.name; const v = Object.entries(i.selectedVariants); if (v.length > 0) msg += " (" + v.map(([k, val]) => k + ": " + val).join(", ") + ")"; msg += " x" + i.qty + " - " + fmt(i.product.price * i.qty) + "\n"; });
    if (totalDiscount > 0) msg += "\nDiscount: -" + fmt(totalDiscount);
    msg += "\nTotal: " + fmt(cartTotal);
    const phone = normalizeWa(seller.whatsapp_number);
    if (!phone) return;
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
  };

  const waPhone = normalizeWa(seller?.whatsapp_number || "");
  const waLink = waPhone ? "https://wa.me/" + waPhone : "#";

  /* Build a social URL from a raw value that might be a handle, partial URL, or full URL */
  const socialUrl = (raw: string | undefined, base: string) => {
    if (!raw) return "";
    const trimmed = raw.trim();
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    return `https://${base}${trimmed.replace(/^@/, "").replace(/^\/+/, "")}`;
  };

  /* Live overrides */
  const displayTagline      = liveTagline      ?? seller?.tagline      ?? "";
  const displayDescription  = liveDescription  ?? seller?.description  ?? "";
  const displayHeroTitle    = liveHeroTitle !== null ? liveHeroTitle : ((cfg as any).hero_title !== undefined ? (cfg as any).hero_title : (seller?.store_name || ""));
  const displayAnnouncement = liveAnnouncement ?? cfg.announcement     ?? "";
  const displayTrustItems   = liveTrustItems   ?? trustItems;
  const displayLogoUrl      = liveLogoUrl      ?? seller?.logo_url     ?? "";
  const accentColor         = seller?.primary_color || "#9c7c62";

  /* Edit mode section wrapper */
  const EditSection = ({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) => {
    if (!isEditMode) return <>{children}</>;
    const isHovered = hoveredSection === id;
    return (
      <div
        onMouseEnter={() => setHoveredSection(id)}
        onMouseLeave={() => setHoveredSection(null)}
        onClick={() => window.parent.postMessage({ type: "SECTION_CLICK", section: id }, "*")}
        style={{ position: "relative", outline: isHovered ? `2px solid ${accentColor}` : "2px solid transparent", outlineOffset: -2, cursor: "pointer", transition: "outline-color 0.2s", ...style }}
      >
        {isHovered && (
          <div style={{ position: "absolute", top: 8, left: "50%", transform: "translateX(-50%)", background: accentColor, color: "#fff", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", padding: "4px 12px", borderRadius: 100, zIndex: 9999, pointerEvents: "none", whiteSpace: "nowrap", boxShadow: "0 2px 8px rgba(0,0,0,0.2)" }}>
            ✏️ Click to edit
          </div>
        )}
        {children}
      </div>
    );
  };

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: fonts.body, background: "#f6f3ef" }}><p style={{ color: "#8a8690", fontSize: 15 }}>Loading store...</p></div>;
  if (notFound) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: fonts.body, background: "#f6f3ef" }}><h1 style={{ fontSize: 48, fontWeight: 300, color: "#2a2a2e", marginBottom: 8 }}>404</h1><p style={{ color: "#8a8690" }}>This store does not exist.</p></div>;

  const storeInactive = seller && seller.subscription_status !== "active" && !(seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (storeInactive && !orderStatus) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: fonts.body, background: "#f6f3ef", padding: "40px 24px", textAlign: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?${fonts.import}&display=swap');`}</style>
      {displayLogoUrl ? <img src={displayLogoUrl} alt="" onError={hideOnError} style={{ height: 48, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 32 }}>{seller?.store_name}</h2>}
      <h1 style={{ fontFamily: fonts.heading, fontSize: 32, fontWeight: 400, color: "#2a2a2e", marginBottom: 12 }}>Store Temporarily Unavailable</h1>
      <p style={{ fontSize: 15, color: "#8a8690", maxWidth: 400, lineHeight: 1.6 }}>This store is currently inactive. Please check back soon or contact the seller directly.</p>
    </div>
  );

  if (orderStatus === "success" || orderStatus === "cancelled") return (
    <div style={{ minHeight: "100vh", background: "#f6f3ef", fontFamily: fonts.body, color: "#2a2a2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
        {displayLogoUrl ? <img src={displayLogoUrl} alt="" onError={hideOnError} style={{ height: 44, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 32 }}>{seller?.store_name}</h2>}
        {orderStatus === "success" ? (<>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: fonts.heading, fontSize: 36, fontWeight: 400, marginBottom: 12 }}>Payment Successful!</h1>
          <p style={{ fontSize: 16, color: "#8a8690", lineHeight: 1.6, marginBottom: 8 }}>Thank you for your order. Your payment has been processed successfully.</p>
          <p style={{ fontSize: 14, color: "#b5b1ac", marginBottom: 40 }}>You will receive a confirmation shortly.</p>
        </>) : (<>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#ff3d6e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <h1 style={{ fontFamily: fonts.heading, fontSize: 36, fontWeight: 400, marginBottom: 12 }}>Payment Cancelled</h1>
          <p style={{ fontSize: 16, color: "#8a8690", lineHeight: 1.6, marginBottom: 8 }}>Your payment was not completed. No charges have been made.</p>
          <p style={{ fontSize: 14, color: "#b5b1ac", marginBottom: 40 }}>You can try again or choose a different payment method.</p>
        </>)}
        <a href={"/store/" + slug} style={{ display: "inline-block", padding: "16px 40px", background: "#2a2a2e", color: "#f6f3ef", borderRadius: 100, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", textDecoration: "none" }}>Return to Store</a>
        <p style={{ fontSize: 12, color: "#b5b1ac", marginTop: 16 }}>Redirecting in {countdown > 0 ? countdown : 0}s...</p>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?${fonts.import}&display=swap');
        @keyframes mscroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @media(max-width:768px){.sl-cols-g{grid-template-columns:1fr!important}.sl-pgrid{grid-template-columns:repeat(2,1fr)!important}.sl-story{grid-template-columns:1fr!important}.sl-trust{grid-template-columns:repeat(2,1fr)!important}.sl-polg{grid-template-columns:1fr!important}.sl-fttop{grid-template-columns:1fr!important}.sl-hero{height:70vh!important;min-height:400px!important}.sl-hnav{display:none!important}.sl-modal{flex-direction:column!important}.sl-header-grid{display:flex!important;justify-content:space-between!important}.sl-logo-img{height:36px!important;max-width:120px!important}}
      `}</style>
      <div style={{ minHeight: "100vh", background: pageBg, fontFamily: fonts.body, color: pageText }}>

        {/* ANNOUNCEMENT */}
        {displayAnnouncement && (
          <EditSection id="announcement">
            <div style={{ background: pageText, color: pageBg, textAlign: "center", padding: "10px 20px", fontSize: 11, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase" }}>{displayAnnouncement}</div>
          </EditSection>
        )}

        {/* HEADER */}
        <header style={{ position: headerTransparent ? "absolute" : "sticky", top: 0, left: 0, right: 0, zIndex: 100, background: headerTransparent ? "transparent" : pageBg + "eb", backdropFilter: headerTransparent ? "none" : "blur(24px)", WebkitBackdropFilter: headerTransparent ? "none" : "blur(24px)", borderBottom: headerBorder && !headerTransparent ? "1px solid rgba(0,0,0,0.06)" : "none" }}>
          <div className="sl-header-grid" style={{ maxWidth: 1340, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 72 }}>
            <div className="sl-hnav" style={{ display: "flex", gap: 32 }}>
              <button onClick={() => { setActiveCategory("All"); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ background: "none", border: "none", padding: 0, color: headerTransparent ? "rgba(255,255,255,0.7)" : pageMuted, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}>Shop All</button>
              {cats.length > 2 && (
                <button onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
                  style={{ background: "none", border: "none", padding: 0, color: headerTransparent ? "rgba(255,255,255,0.7)" : pageMuted, fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", fontFamily: "inherit" }}>Collections</button>
              )}
            </div>
            <div style={{ textAlign: "center", cursor: isEditMode ? "pointer" : "default" }}
              onClick={isEditMode ? () => window.parent.postMessage({ type: "SECTION_CLICK", section: "logo" }, "*") : undefined}>
              {displayLogoUrl ? (
                <img className="sl-logo-img" src={displayLogoUrl} alt={seller?.store_name} onError={hideOnError} style={{ height: 44, maxWidth: 160, objectFit: "contain" }} />
              ) : (
                <div>
                  <div style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase", color: headerTransparent ? "#fff" : pageText }}>{seller?.store_name}</div>
                  {displayTagline && <div style={{ fontSize: 9, letterSpacing: "0.2em", color: headerTransparent ? "rgba(255,255,255,0.6)" : pageMuted, textTransform: "uppercase", marginTop: -2 }}>{displayTagline}</div>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 20 }}>
              <button onClick={() => setShowSearch(true)} aria-label="Search" style={{ background: "none", border: "none", color: headerTransparent ? "rgba(255,255,255,0.7)" : pageMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
              </button>
              <button onClick={() => setShowCart(true)} aria-label="Cart" style={{ background: "none", border: "none", color: headerTransparent ? "rgba(255,255,255,0.7)" : pageMuted, cursor: "pointer", padding: 4, display: "flex", alignItems: "center", gap: 4, position: "relative" }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
                {cartCount > 0 && <span style={{ position: "absolute", top: -2, right: -6, width: 16, height: 16, borderRadius: "50%", background: accent, color: "#fff", fontSize: 8, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
              </button>
            </div>
          </div>
        </header>

        {/* PROMO COUNTDOWN */}
        {promoCountdown && promoCountdown.timeLeft && (
          <div style={{ background: "linear-gradient(90deg, " + accent + "08 0%, rgba(0,0,0,0.01) 50%, " + accent + "08 100%)", borderBottom: "1px solid " + accent + "18", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" as const }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.15em", color: pageMuted, textTransform: "uppercase" as const }}>Limited offer</span>
              <span style={{ fontFamily: fonts.body, fontSize: 14, fontWeight: 500, color: pageText }}>Use code <span style={{ padding: "3px 10px", background: accent + "10", border: "1px solid " + accent + "20", borderRadius: 4, fontWeight: 700, letterSpacing: "0.06em", fontSize: 13, color: accent }}>{promoCountdown.code}</span> for {promoCountdown.type === "percentage" ? promoCountdown.value + "% off" : "R" + promoCountdown.value + " off"}{promoCountdown.applies_to !== "cart" ? " " + promoCountdown.applies_to : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.12em", color: pageMuted, textTransform: "uppercase" as const }}>Ends in</span>
              <span style={{ fontFamily: fonts.body, fontSize: 16, fontWeight: 600, color: pageText, letterSpacing: "0.08em", background: accent + "0a", padding: "4px 12px", borderRadius: 6, border: "1px solid " + accent + "15" }}>{promoCountdown.timeLeft}</span>
            </div>
          </div>
        )}

        {!initialProductId && (<>
        {/* HERO */}
        <EditSection id="hero">
          <section className="sl-hero" style={{ position: "relative", height: seller?.banner_url ? "92vh" : "auto", minHeight: seller?.banner_url ? 500 : "auto", overflow: "hidden" }}>
            {seller?.banner_url ? (
              <>
                <img src={seller.banner_url} alt="" onError={hideOnError} fetchPriority="high" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${pageBg} 0%, ${pageBg}26 55%, transparent 100%)` }} />
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "flex-start", justifyContent: "flex-end", padding: "0 48px 60px", maxWidth: 640 }}>
                  {displayTagline && <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: pageMuted, marginBottom: 14 }}>— {displayTagline}</div>}
                  {displayHeroTitle && <h1 style={{ fontFamily: fonts.heading, fontSize: "clamp(42px, 7vw, 80px)", fontWeight: 300, fontStyle: "italic", color: pageText, letterSpacing: "0.02em", lineHeight: 1, marginBottom: 16 }}>{displayHeroTitle}</h1>}
                  {displayDescription && <p style={{ fontSize: 15, lineHeight: 1.7, color: pageMuted, fontWeight: 300, marginBottom: 24, maxWidth: 480 }}>{displayDescription}</p>}
                  <a href="#products" style={{ display: "inline-flex", padding: "16px 48px", background: "transparent", border: "1px solid " + accent, borderRadius: 0, color: accent, fontSize: 11, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" }}>{(seller?.store_config as any)?.hero_cta || "Shop Now"} &rarr;</a>
                </div>
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "80px 40px 60px" }}>
                {displayTagline && <div style={{ fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: pageMuted, marginBottom: 14 }}>— {displayTagline}</div>}
                {displayHeroTitle && <h1 style={{ fontFamily: fonts.heading, fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.02em", marginBottom: 12 }}>{displayHeroTitle}</h1>}
                {displayDescription && <p style={{ fontSize: 14, color: pageMuted, lineHeight: 1.7, maxWidth: 480, margin: "0 auto", marginBottom: 24 }}>{displayDescription}</p>}
                <a href="#products" style={{ display: "inline-flex", padding: "16px 48px", background: "transparent", border: "1px solid " + accent, borderRadius: 0, color: accent, fontSize: 11, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase", textDecoration: "none" }}>{(seller?.store_config as any)?.hero_cta || "Shop Now"} &rarr;</a>
              </div>
            )}
          </section>
        </EditSection>

        {/* MARQUEE */}
        {cfg.show_marquee && marqueeTexts.length > 0 && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap", padding: "14px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ display: "inline-flex", animation: "mscroll 30s linear infinite" }}>
              {[...Array(2)].map((_, r) => marqueeTexts.map((txt, i) => (
                <span key={r + "-" + i} style={{ fontFamily: fonts.heading, fontSize: 13, fontStyle: "italic", color: pageMuted, letterSpacing: "0.08em", padding: "0 40px" }}>
                  {txt}<em style={{ fontStyle: "normal", color: accent }}> &bull; </em>
                </span>
              )))}
            </div>
          </div>
        )}

        {/* COLLECTIONS */}
        {cfg.show_collections && collections.length > 0 && (
          <EditSection id="collections">
          <section style={{ padding: "80px 24px", maxWidth: 1600, margin: "0 auto" }}>
            {(() => { const collCollapsed = (cfg as any).collections_collapsed === true; return (
            <>
            <div style={{ textAlign: "center", cursor: collCollapsed ? "pointer" : "default" }} onClick={collCollapsed ? () => setCollectionsExpanded(!collectionsExpanded) : undefined}>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: pageMuted, marginBottom: 12 }}>{displayCollLabel}</div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: collectionsExpanded ? 56 : 0 }}>
                <h2 style={{ fontFamily: fonts.heading, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "0.02em" }}>{displayCollSubtitle}</h2>
                {collCollapsed && (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pageMuted} strokeWidth="1.5" strokeLinecap="round" style={{ transition: "transform 0.3s", transform: collectionsExpanded ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
                )}
              </div>
            </div>
            {collectionsExpanded && (<>
            {/* Asymmetric lookbook layout — pairs of collections alternate large/small */}
            {(() => {
              const collImages = (cfg as any).collection_images || {};
              const colData = collections.map((col) => ({
                name: col,
                count: products.filter((p) => pInCat(p, col)).length,
                img: collImages[col] || products.find((p) => pInCat(p, col) && p.image_url)?.image_url || "",
                promo: getCollectionPromo(col),
              }));
              const pairs: (typeof colData)[] = [];
              for (let i = 0; i < colData.length; i += 2) pairs.push(colData.slice(i, i + 2));

              const renderCard = (c: typeof colData[0], tall: boolean, idx: number) => (
                <div key={c.name} onClick={() => { setActiveCategory(c.name); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                  style={{ position: "relative", borderRadius: 12, overflow: "hidden", cursor: "pointer", minHeight: tall ? 520 : 340 }}>
                  {c.img ? (
                    <img src={c.img} alt={c.name} onError={hideOnError} loading="lazy" decoding="async" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(145deg, ${accent}12, ${accent}28)` }} />
                  )}
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.05) 50%, transparent 100%)" }} />
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: tall ? "36px 32px" : "28px 24px" }}>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", letterSpacing: "0.14em", textTransform: "uppercase", marginBottom: 8 }}>{c.count} Piece{c.count !== 1 ? "s" : ""}</div>
                    <div style={{ fontFamily: fonts.heading, fontSize: tall ? "clamp(24px, 3vw, 36px)" : "clamp(20px, 2.5vw, 28px)", color: "#fff", letterSpacing: "0.04em", fontWeight: 300, marginBottom: 10 }}>{c.name}</div>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
                      Explore <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </div>
                    {c.promo && (
                      <div style={{ marginTop: 12, display: "inline-flex", alignItems: "center", gap: 8, padding: "5px 12px", background: "rgba(0,0,0,0.45)", backdropFilter: "blur(10px)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.12)" }}>
                        <span style={{ fontSize: 9, color: "rgba(255,255,255,0.85)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{c.promo.code} {c.promo.type === "percentage" ? c.promo.value + "%" : "R" + c.promo.value} OFF</span>
                        <span style={{ fontSize: 11, color: "#fff", fontWeight: 700 }}>{c.promo.timeLeft}</span>
                      </div>
                    )}
                  </div>
                </div>
              );

              return (
                <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                  {pairs.map((pair, pi) => {
                    if (pair.length === 1) return (
                      <div key={pi} className="sl-cols-g" style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
                        {renderCard(pair[0], true, pi * 2)}
                      </div>
                    );
                    const flip = pi % 2 === 1;
                    return (
                      <div key={pi} className="sl-cols-g" style={{ display: "grid", gridTemplateColumns: "7fr 5fr", gap: 16 }}>
                        {renderCard(pair[flip ? 1 : 0], true, pi * 2)}
                        {renderCard(pair[flip ? 0 : 1], false, pi * 2 + 1)}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
            </>)}
            </>); })()}
          </section>
          </EditSection>
        )}

        {/* PRODUCTS */}
        <section id="products" style={{ padding: "80px 24px", maxWidth: 1600, margin: "0 auto" }}>
          <div style={{ textAlign: "center", cursor: productsCollapsed ? "pointer" : "default" }} onClick={productsCollapsed ? () => setProductsExpanded(!productsExpanded) : undefined}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: pageMuted, marginBottom: 12 }}>{displayProductsLabel}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 16, marginBottom: productsExpanded ? 48 : 0 }}>
              <h2 style={{ fontFamily: fonts.heading, fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, letterSpacing: "0.02em" }}>{displayProductsHeading}</h2>
              {productsCollapsed && (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pageMuted} strokeWidth="1.5" strokeLinecap="round" style={{ transition: "transform 0.3s", transform: productsExpanded ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
              )}
            </div>
          </div>

          {productsExpanded && (<>
          {cats.length > 2 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {cats.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: "10px 28px", borderRadius: 100, background: activeCategory === cat ? accent : "transparent", border: activeCategory === cat ? "1px solid " + accent : "1px solid rgba(0,0,0,0.06)", fontFamily: fonts.body, fontSize: 12, color: activeCategory === cat ? "#fff" : pageMuted, cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.3s" }}>{cat}</button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
            <select value={productSort} onChange={(e) => setProductSort(e.target.value)} style={{ padding: "8px 16px", background: pageBg, border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: pageMuted, fontFamily: fonts.body, fontSize: 12, letterSpacing: "0.04em", cursor: "pointer", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(0,0,0,0.2)'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }}>
              <option value="default">Default</option>
              <option value="latest">Latest</option>
              <option value="oldest">Oldest</option>
              <option value="az">A — Z</option>
              <option value="za">Z — A</option>
              <option value="price-low">Price: Low to High</option>
              <option value="price-high">Price: High to Low</option>
            </select>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: pageMuted }}>
              <p style={{ fontSize: 18 }}>No products yet</p>
              <p style={{ fontSize: 14, marginTop: 8 }}>Check back soon!</p>
            </div>
          ) : (
            <div className="sl-pgrid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
              {filtered.map((product) => (
                <div key={product.id} onClick={() => isEditMode ? openProduct(product) : router.push(`/store/${slug}/p/${product.id}`)} style={{ cursor: "pointer" }}>
                  <div style={{ ...(cardRatio !== "auto" ? { aspectRatio: cardRatio } : {}), borderRadius: 16, overflow: "hidden", marginBottom: 16, position: "relative", background: pageBg }}>
                    {product.image_url && (
                      <img src={product.image_url} alt={product.name} loading="lazy" decoding="async" style={{ width: "100%", height: cardRatio === "auto" ? "auto" : "100%", objectFit: cardRatio === "auto" ? "contain" : "cover", display: "block", transition: "transform 0.6s" }}
                        onError={(e) => { e.currentTarget.style.display = "none"; }} />
                    )}
                    <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, ${pageBg} 0%, ${pageBg}40 12%, transparent 40%)`, pointerEvents: "none" }} />
                    {product.old_price && (
                      <div style={{ position: "absolute", top: 12, left: 12, padding: "4px 12px", background: accent, color: "#fff", borderRadius: 100, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sale</div>
                    )}
                    {(() => { const pp = getProductPromo(product.id); return pp ? (
                      <div style={{ position: "absolute", bottom: 12, left: 12, right: 12, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 12px", background: "rgba(42,42,46,0.75)", backdropFilter: "blur(10px)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)" }}>
                        <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{pp.code} {pp.type === "percentage" ? pp.value + "%" : "R" + pp.value} OFF</span>
                        <span style={{ fontSize: 12, color: "#fff", fontWeight: 700, letterSpacing: "0.04em" }}>{pp.timeLeft}</span>
                      </div>
                    ) : null; })()}
                  </div>
                  <div style={{ fontFamily: fonts.heading, fontSize: 17, marginBottom: 4, letterSpacing: "0.01em" }}>{product.name}</div>
                  {product.category && <div style={{ fontSize: 11, color: pageMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{product.category}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: accent }}>{fmt(product.price)}</span>
                    {product.old_price && <span style={{ fontSize: 14, color: pageMuted, textDecoration: "line-through" }}>{fmt(product.old_price)}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
          </>)}
        </section>

        {/* ABOUT */}
        {cfg.show_about && (displayDescription || seller?.description) && (
          <EditSection id="about">
            {(() => {
              const aboutImg = liveAboutImage ?? cfg.about_image;
              return (
                <section className="sl-story" style={{ padding: "100px 32px", maxWidth: 1340, margin: "0 auto", display: "grid", gridTemplateColumns: aboutImg ? "1fr 1fr" : "1fr", gap: 60, alignItems: "center" }}>
                  {aboutImg && (
                    <div style={{ aspectRatio: "4/5", borderRadius: 16, overflow: "hidden" }}>
                      <img src={aboutImg} alt="" onError={hideOnError} loading="lazy" decoding="async" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    </div>
                  )}
                  <div style={{ textAlign: aboutImg ? "left" : "center" }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: pageMuted, marginBottom: 12 }}>Our Story</div>
                    <h2 style={{ fontFamily: fonts.heading, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 300, letterSpacing: "0.02em", marginBottom: 24, lineHeight: 1.2 }}>About {seller?.store_name}</h2>
                    <p style={{ fontSize: 15, lineHeight: 1.85, color: pageMuted, fontWeight: 300, maxWidth: aboutImg ? 440 : 640, margin: aboutImg ? undefined : "0 auto" }}>{displayDescription || seller?.description}</p>
                  </div>
                </section>
              );
            })()}
          </EditSection>
        )}

        {/* TRUST BAR */}
        {cfg.show_trust_bar && displayTrustItems.some(item => item.title?.trim()) && (
          <EditSection id="trust">
            <div className="sl-trust" style={{ padding: "60px 32px", maxWidth: 1340, margin: "0 auto", display: "grid", gridTemplateColumns: `repeat(${displayTrustItems.filter(item => item.title?.trim()).length}, 1fr)`, gap: 20, borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              {displayTrustItems.filter(item => item.title?.trim()).map((item, i) => (
                <div key={i} style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ marginBottom: 12, color: accent, display: "flex", justifyContent: "center" }}><TrustIcon id={item.icon} size={24} color={accent} /></div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: pageMuted, fontWeight: 300 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </EditSection>
        )}

        </>)}

        {/* FOOTER */}
        <EditSection id="footer">
        <footer style={{ background: pageText, color: pageBg, padding: "60px 32px 40px" }}>
          <div style={{ maxWidth: 1340, margin: "0 auto" }}>
            <div className="sl-fttop" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 48 }}>
              <div>
                <div style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{seller?.store_name}</div>
                {displayFooterAbout && <p style={{ fontSize: 13, opacity: 0.5, lineHeight: 1.7, fontWeight: 300, maxWidth: 280 }}>{displayFooterAbout.substring(0, 160)}{displayFooterAbout.length > 160 ? "..." : ""}</p>}
                {displayPhysicalAddress && (cfg as any).show_address !== false && (
                  <div style={{ display: "flex", alignItems: "flex-start", gap: 8, marginTop: 16, fontSize: 12, opacity: 0.4, lineHeight: 1.6 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0, marginTop: 2 }}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <span>{displayPhysicalAddress}</span>
                  </div>
                )}
              </div>
              <div>
                <h5 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>Shop</h5>
                {collections.slice(0, 4).map((c) => (
                  <button key={c} onClick={() => { setActiveCategory(c); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                    style={{ display: "block", padding: 0, background: "none", border: "none", textAlign: "left", fontSize: 13, opacity: 0.5, color: "inherit", marginBottom: 10, fontWeight: 300, cursor: "pointer", fontFamily: "inherit" }}>{c}</button>
                ))}
              </div>
              <div>
                <h5 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>Support</h5>
                {policyItems.map((p, i) => (
                  <div key={i} style={{ borderBottom: `1px solid ${pageBg}15` }}>
                    <button onClick={() => setExpandedPolicy(expandedPolicy === i ? null : i)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", background: "none", border: "none", cursor: "pointer", width: "100%", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
                      <span style={{ fontSize: 13, fontWeight: 300, opacity: 0.5 }}>{p.title}</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.4, transition: "transform 0.3s", transform: expandedPolicy === i ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    {expandedPolicy === i && (
                      <div style={{ padding: "0 0 14px", fontSize: 12, opacity: 0.4, lineHeight: 1.7, fontWeight: 300, whiteSpace: "pre-wrap" }}>{p.desc}</div>
                    )}
                  </div>
                ))}
                {(cfg as any).shipping_policy && !policyItems.some(p => p.title.toLowerCase().includes("ship")) && (
                  <div style={{ borderBottom: `1px solid ${pageBg}15` }}>
                    <button onClick={() => setExpandedPolicy(expandedPolicy === 100 ? null : 100)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", background: "none", border: "none", cursor: "pointer", width: "100%", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
                      <span style={{ fontSize: 13, fontWeight: 300, opacity: 0.5 }}>Shipping Policy</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.4, transition: "transform 0.3s", transform: expandedPolicy === 100 ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    {expandedPolicy === 100 && (
                      <div style={{ padding: "0 0 14px", fontSize: 12, opacity: 0.4, lineHeight: 1.7, fontWeight: 300, whiteSpace: "pre-wrap" }}>{(cfg as any).shipping_policy}</div>
                    )}
                  </div>
                )}
                {(cfg as any).return_policy && !policyItems.some(p => p.title.toLowerCase().includes("return")) && (
                  <div style={{ borderBottom: `1px solid ${pageBg}15` }}>
                    <button onClick={() => setExpandedPolicy(expandedPolicy === 101 ? null : 101)}
                      style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", background: "none", border: "none", cursor: "pointer", width: "100%", fontFamily: "inherit", textAlign: "left", color: "inherit" }}>
                      <span style={{ fontSize: 13, fontWeight: 300, opacity: 0.5 }}>Returns & Refunds</span>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ opacity: 0.4, transition: "transform 0.3s", transform: expandedPolicy === 101 ? "rotate(180deg)" : "rotate(0)" }}><path d="M6 9l6 6 6-6"/></svg>
                    </button>
                    {expandedPolicy === 101 && (
                      <div style={{ padding: "0 0 14px", fontSize: 12, opacity: 0.4, lineHeight: 1.7, fontWeight: 300, whiteSpace: "pre-wrap" }}>{(cfg as any).return_policy}</div>
                    )}
                  </div>
                )}
              </div>
              <div>
                <h5 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>Connect</h5>
                {(social.instagram || social.tiktok || social.facebook || social.twitter) && (
                  <div style={{ display: "flex", gap: 16, marginBottom: 16 }}>
                    {social.instagram && <a href={socialUrl(social.instagram, "instagram.com/")} target="_blank" rel="noreferrer" style={{ opacity: 0.5, color: "inherit", transition: "opacity 0.2s" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg></a>}
                    {social.tiktok && <a href={socialUrl(social.tiktok, "tiktok.com/@")} target="_blank" rel="noreferrer" style={{ opacity: 0.5, color: "inherit" }}><svg width="14" height="16" viewBox="0 0 448 512" fill="currentColor"><path d="M448 209.9a210.1 210.1 0 01-122.8-39.3v178.8A162.6 162.6 0 11185 188.3v89.9a74.6 74.6 0 1052.2 71.2V0h88a121 121 0 00122.8 121z"/></svg></a>}
                    {social.facebook && <a href={socialUrl(social.facebook, "facebook.com/")} target="_blank" rel="noreferrer" style={{ opacity: 0.5, color: "inherit" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg></a>}
                  </div>
                )}
                {seller?.whatsapp_number && <a href={waLink} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 13, opacity: 0.5, color: "inherit", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>WhatsApp</a>}
                {displayContactEmail && <a href={`mailto:${displayContactEmail}`} style={{ display: "block", fontSize: 13, opacity: 0.5, color: "inherit", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>{displayContactEmail}</a>}
                {displayContactPhone && <a href={`tel:${displayContactPhone.replace(/\s/g, "")}`} style={{ display: "block", fontSize: 13, opacity: 0.5, color: "inherit", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>{displayContactPhone}</a>}
                {displayOperatingHours && (
                  <div style={{ marginTop: 12 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.4, marginBottom: 8 }}>Hours</div>
                    <table style={{ fontSize: 12, opacity: 0.45, lineHeight: 1.8, borderCollapse: "collapse" }}>
                      <tbody>
                        {displayOperatingHours.split("\n").filter(Boolean).map((line: string, li: number) => {
                          const parts = line.split(/[:\-–—]/).map((s: string) => s.trim());
                          return (
                            <tr key={li}>
                              <td style={{ paddingRight: 16, fontWeight: 400, whiteSpace: "nowrap", verticalAlign: "top" }}>{parts[0]}</td>
                              <td style={{ fontWeight: 300, verticalAlign: "top" }}>{parts.slice(1).join(" – ") || ""}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
                {seller?.checkout_config?.payfast_enabled && (
                  <div style={{ marginTop: 16 }}>
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.4, marginBottom: 8 }}>Payment</div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                      <span title="Visa" style={{ width: 42, height: 26, border: `1px solid ${pageBg}20`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: pageBg + "10" }}><svg width="28" height="10" viewBox="0 0 50 16"><path d="M19.5 0.5l-4 15h-3.2l4-15h3.2zm16.3 9.7l1.7-4.6 1 4.6h-2.7zm3 5.3h3l-2.6-15h-2.8c-.6 0-1.1.4-1.4 1l-4.8 14h3.4l.7-1.9h4.1l.4 1.9zm-8.5-4.9c0-4-5.4-4.2-5.4-5.9 0-.5.5-1.1 1.6-1.2 1.1-.1 2.7.2 3.9.8l.7-3.2c-.9-.4-2.2-.7-3.6-.7-3.8 0-6.5 2-6.5 5 0 2.2 1.9 3.4 3.4 4.1 1.5.7 2 1.2 2 1.9 0 1-1.2 1.5-2.3 1.5-1.4 0-2.8-.4-4.1-1l-.7 3.3c.9.4 2.7.8 4.5.8 4 0 6.6-2 6.6-5.2zM12.5 0.5l-5 15H4.3L1 3.7c-.2-.7-.4-.9-1-1.2l-3-1.5.1-.5h5.4c.7 0 1.3.5 1.5 1.3l1.3 7.2 3.4-8.5h3.4z" fill="currentColor" opacity="0.7"/></svg></span>
                      <span title="Mastercard" style={{ width: 42, height: 26, border: `1px solid ${pageBg}20`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: pageBg + "10" }}><svg width="24" height="16" viewBox="0 0 24 16"><circle cx="8.5" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6"/><circle cx="15.5" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6"/></svg></span>
                      <span title="Amex" style={{ width: 42, height: 26, border: `1px solid ${pageBg}20`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: pageBg + "10" }}><svg width="28" height="16" viewBox="0 0 28 16"><rect x="2" y="1" width="24" height="14" rx="2" fill="none" stroke="currentColor" strokeWidth="0.8" opacity="0.6"/><text x="14" y="10" textAnchor="middle" fontSize="6" fontWeight="700" fill="currentColor" opacity="0.7" fontFamily="sans-serif">AMEX</text></svg></span>
                      <span title="Apple Pay" style={{ width: 42, height: 26, border: `1px solid ${pageBg}20`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: pageBg + "10" }}><svg width="28" height="14" viewBox="0 0 50 21"><path d="M9.4 2.2c-.6.7-1.5 1.3-2.5 1.2-.1-1 .4-2 .9-2.7C8.4.1 9.5-.4 10.4-.5c.1 1.1-.3 2.1-.9 2.7zm.9 1.4c-1.4-.1-2.6.8-3.2.8s-1.7-.8-2.8-.7C2.8 3.7 1.4 4.7.7 6.2c-1.4 2.7-.4 6.6 1 8.8.7 1 1.5 2.2 2.5 2.1 1-.1 1.4-.7 2.6-.7 1.2 0 1.5.7 2.6.6 1.1 0 1.8-1 2.5-2.1.8-1.2 1.1-2.3 1.1-2.4 0 0-2.2-.8-2.2-3.3 0-2.1 1.7-3 1.8-3.1-1-1.5-2.5-1.6-3.1-1.7z" fill="currentColor" opacity="0.7"/><path d="M21.8 1c3.4 0 5.7 2.3 5.7 5.8 0 3.4-2.4 5.8-5.8 5.8h-3.7v6h-2.8V1h6.6zm-3.8 9.3h3.1c2.3 0 3.6-1.3 3.6-3.5 0-2.2-1.3-3.5-3.6-3.5h-3.1v7zm11.2 4.5c0-2.2 1.7-3.6 4.7-3.7l3.5-.2v-1c0-1.4-1-2.2-2.5-2.2-1.5 0-2.4.7-2.6 1.8h-2.6c.1-2.4 2.1-4.1 5.3-4.1 3.1 0 5.1 1.6 5.1 4.2v8.8h-2.6v-2.1h-.1c-.8 1.4-2.3 2.3-4 2.3-2.4 0-4.1-1.5-4.1-3.8zm8.2-1.1v-1l-3.1.2c-1.6.1-2.4.8-2.4 1.8 0 1.1.9 1.8 2.3 1.8 1.8 0 3.2-1.2 3.2-2.8zm5 6.3v-2.2c.2 0 .6.1.9.1 1.3 0 2-.5 2.4-1.9l.3-.9L40 5.6h2.9l3.3 10.4h.1L49.5 5.6h2.8L47 18c-1.1 3.2-2.4 4.2-5.1 4.2-.3 0-.9 0-1.3-.1z" fill="currentColor" opacity="0.7"/></svg></span>
                      <span title="Google Pay" style={{ width: 42, height: 26, border: `1px solid ${pageBg}20`, borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", background: pageBg + "10" }}><svg width="28" height="14" viewBox="0 0 40 16"><path d="M19.4 7.8v4.7h-1.5V1h3.9c1 0 1.8.3 2.5 1 .7.6 1 1.4 1 2.3 0 1-.3 1.7-1 2.3-.7.6-1.5.9-2.4.9h-2.5zm0-5.4v4h2.5c.6 0 1.1-.2 1.5-.6.4-.4.6-.9.6-1.4 0-.6-.2-1-.6-1.4-.4-.4-.9-.6-1.5-.6h-2.5zm10.8 2c1.1 0 2 .3 2.6.9.6.6 1 1.5 1 2.6v5.3h-1.4v-1.2h-.1c-.6 1-1.4 1.4-2.5 1.4-.9 0-1.7-.3-2.3-.8-.6-.5-.9-1.2-.9-2 0-.9.3-1.6 1-2.1.7-.5 1.6-.7 2.7-.7 1 0 1.8.2 2.3.5v-.4c0-.6-.2-1.1-.7-1.5-.4-.4-1-.6-1.6-.6-.9 0-1.6.4-2.1 1.2l-1.3-.8c.7-1.2 1.8-1.7 3.2-1.7zm-2 6.1c0 .5.2.8.6 1.1.4.3.8.4 1.3.4.7 0 1.4-.3 1.9-.8.5-.5.8-1.1.8-1.7-.5-.4-1.1-.6-2.1-.6-.7 0-1.3.2-1.7.5-.5.3-.8.7-.8 1.2zm11.4-5.8l-4.9 11.3h-1.5l1.8-4-3.2-7.3h1.6l2.3 5.5h0l2.2-5.5h1.6z" fill="currentColor" opacity="0.7"/></svg></span>
                    </div>
                  </div>
                )}
                {seller?.checkout_config?.eft_enabled && (
                  <div style={{ fontSize: 12, opacity: 0.45, marginTop: 8 }}>EFT / Direct Deposit</div>
                )}
                {seller?.checkout_config?.whatsapp_checkout_enabled && seller?.whatsapp_number && (
                  <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, opacity: 0.45, marginTop: 4 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                    WhatsApp Order
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 32, borderTop: `1px solid ${pageBg}15`, flexWrap: "wrap", gap: 12 }}>
              <p style={{ fontSize: 11, opacity: 0.3 }}>&copy; {new Date().getFullYear()} {seller?.store_name}</p>
              <p style={{ fontSize: 10, opacity: 0.3, letterSpacing: "0.08em", textTransform: "uppercase" }}>Powered by <a href="https://catalogstore.co.za" target="_blank" rel="noreferrer" style={{ color: accent, textDecoration: "none", fontWeight: 500 }}>CatalogStore</a></p>
            </div>
          </div>
        </footer>
        </EditSection>

        {/* PRODUCT DETAIL PAGE — full page view when navigating to /store/[slug]/p/[productId] */}
        {selectedProduct && initialProductId && !isEditMode && (
          <section style={{ padding: "40px 24px 80px", maxWidth: 1200, margin: "0 auto" }}>
            <button onClick={() => router.push(`/store/${slug}`)} style={{ display: "inline-flex", alignItems: "center", gap: 8, background: "none", border: "none", color: pageMuted, cursor: "pointer", fontFamily: fonts.body, fontSize: 13, letterSpacing: "0.04em", marginBottom: 32, padding: 0 }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="m11 5-5 5 5 5"/><path d="M16 10H6"/></svg>
              Back to store
            </button>
            <div className="sl-modal" style={{ display: "flex", gap: 48, alignItems: "flex-start" }}>
              <div style={{ flex: 1.2, position: "sticky", top: 100 }}>
                <div style={{ borderRadius: 16, overflow: "hidden", background: "#f5f5f5", aspectRatio: "4/5" }}>
                  {selectedProduct.images?.length > 0 ? <img src={selectedProduct.images[activeImageIndex]} alt="" onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #e0d5ca, #cdc0b2)" }} />}
                </div>
                {selectedProduct.images?.length > 1 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                    {selectedProduct.images.map((img: string, i: number) => <img key={i} src={img} alt="" onError={hideOnError} onClick={() => setActiveImageIndex(i)} style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover", cursor: "pointer", border: activeImageIndex === i ? "2px solid " + accent : "2px solid transparent", flexShrink: 0 }} />)}
                  </div>
                )}
              </div>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {selectedProduct.category && <p style={{ fontSize: 11, color: pageMuted, textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 12 }}>{selectedProduct.category}</p>}
                <h1 style={{ fontFamily: fonts.heading, fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 300, letterSpacing: "0.01em", marginBottom: 16, lineHeight: 1.2 }}>{selectedProduct.name}</h1>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 28 }}>
                  <span style={{ fontSize: 28, fontWeight: 500, color: accent }}>{fmt(selectedProduct.price)}</span>
                  {selectedProduct.old_price && <span style={{ fontSize: 20, color: pageMuted, textDecoration: "line-through" }}>{fmt(selectedProduct.old_price)}</span>}
                </div>
                {selectedProduct.description && <p style={{ fontSize: 15, lineHeight: 1.8, color: pageMuted, marginBottom: 32, fontWeight: 300 }}>{selectedProduct.description}</p>}
                {selectedProduct.variants?.filter((v: any) => v.options?.length > 0).length > 0 && (
                  <div style={{ marginBottom: 32 }}>
                    {selectedProduct.variants.filter((v: any) => v.options?.length > 0).map((v: any) => (
                      <div key={v.name} style={{ marginBottom: 20 }}>
                        <p style={{ fontSize: 12, color: pageMuted, marginBottom: 10, letterSpacing: "0.06em", textTransform: "uppercase" }}>{v.name}: <strong style={{ color: pageText }}>{selectedVariants[v.name]}</strong></p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {v.options.map((opt: string) => (
                            <button key={opt} onClick={() => { setSelectedVariants({ ...selectedVariants, [v.name]: opt }); const varImg = v.images?.[opt]; if (varImg && selectedProduct.images?.length > 0) { const imgIdx = selectedProduct.images.indexOf(varImg); if (imgIdx >= 0) setActiveImageIndex(imgIdx); } }} style={{ padding: "12px 24px", border: selectedVariants[v.name] === opt ? "2px solid " + pageText : "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: pageBg, fontFamily: fonts.body, fontSize: 13, fontWeight: selectedVariants[v.name] === opt ? 600 : 400, cursor: "pointer", color: pageText }}>{opt}</button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 0", marginBottom: 20, borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                  <span style={{ fontSize: 11, color: pageMuted, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: fonts.body, fontWeight: 500 }}>Quantity</span>
                  <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 100, overflow: "hidden" }}>
                    <button onClick={() => setModalQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" style={{ width: 40, height: 40, background: "none", border: "none", color: pageText, cursor: "pointer", fontSize: 18, fontFamily: fonts.body }}>−</button>
                    <span style={{ minWidth: 36, textAlign: "center", fontSize: 15, fontWeight: 500, color: pageText }}>{modalQty}</span>
                    <button onClick={() => setModalQty((q) => Math.min(999, q + 1))} aria-label="Increase quantity" style={{ width: 40, height: 40, background: "none", border: "none", color: pageText, cursor: "pointer", fontSize: 18, fontFamily: fonts.body }}>+</button>
                  </div>
                </div>
                <button onClick={() => addToCart(selectedProduct, modalQty)} style={{ padding: "20px 36px", background: accent, color: "#fff", border: "none", borderRadius: 100, fontFamily: fonts.body, fontSize: 14, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", width: "100%" }}>Add to Cart &mdash; {fmt(selectedProduct.price * modalQty)}</button>
              </div>
            </div>
          </section>
        )}

        {/* PRODUCT MODAL — editor preview only */}
        {selectedProduct && (!initialProductId || isEditMode) && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closeProduct}>
            <div style={{ background: "#fff", borderRadius: 20, maxWidth: 900, width: "92%", maxHeight: "90vh", overflow: "auto", position: "relative", padding: "32px" }} onClick={(e) => e.stopPropagation()}>
              <button onClick={closeProduct} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#f5f5f5", border: "none", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", zIndex: 10 }}>&times;</button>
              <div className="sl-modal" style={{ display: "flex", gap: 36 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", background: "#f5f5f5", aspectRatio: "3/4" }}>
                    {selectedProduct.images?.length > 0 ? <img src={selectedProduct.images[activeImageIndex]} alt="" onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" onError={hideOnError} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #e0d5ca, #cdc0b2)" }} />}
                  </div>
                  {selectedProduct.images?.length > 1 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                      {selectedProduct.images.map((img, i) => <img key={i} src={img} alt="" onError={hideOnError} onClick={() => setActiveImageIndex(i)} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: activeImageIndex === i ? "2px solid " + accent : "2px solid transparent", flexShrink: 0 }} />)}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  {selectedProduct.category && <p style={{ fontSize: 11, color: pageMuted, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{selectedProduct.category}</p>}
                  <h2 style={{ fontFamily: fonts.heading, fontSize: 28, fontWeight: 400, letterSpacing: "0.01em", marginBottom: 12 }}>{selectedProduct.name}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 24, fontWeight: 500, color: accent }}>{fmt(selectedProduct.price)}</span>
                    {selectedProduct.old_price && <span style={{ fontSize: 18, color: pageMuted, textDecoration: "line-through" }}>{fmt(selectedProduct.old_price)}</span>}
                  </div>
                  {selectedProduct.description && <p style={{ fontSize: 14, lineHeight: 1.7, color: pageMuted, marginBottom: 24 }}>{selectedProduct.description}</p>}
                  {selectedProduct.variants?.filter((v) => v.options?.length > 0).length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      {selectedProduct.variants.filter((v) => v.options?.length > 0).map((v) => (
                        <div key={v.name} style={{ marginBottom: 16 }}>
                          <p style={{ fontSize: 13, color: pageMuted, marginBottom: 8 }}>{v.name}: <strong style={{ color: pageText }}>{selectedVariants[v.name]}</strong></p>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {v.options.map((opt) => (
                              <button key={opt} onClick={() => { setSelectedVariants({ ...selectedVariants, [v.name]: opt }); const varImg = v.images?.[opt]; if (varImg && selectedProduct.images?.length > 0) { const imgIdx = selectedProduct.images.indexOf(varImg); if (imgIdx >= 0) setActiveImageIndex(imgIdx); } }} style={{ padding: "10px 20px", border: selectedVariants[v.name] === opt ? "2px solid " + pageText : "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: pageBg, fontFamily: fonts.body, fontSize: 13, fontWeight: selectedVariants[v.name] === opt ? 600 : 400, cursor: "pointer", color: pageText }}>{opt}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {/* Quantity picker */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", marginBottom: 16, borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                    <span style={{ fontSize: 11, color: pageMuted, letterSpacing: "0.1em", textTransform: "uppercase", fontFamily: fonts.body, fontWeight: 500 }}>Quantity</span>
                    <div style={{ display: "flex", alignItems: "center", border: "1px solid rgba(0,0,0,0.1)", borderRadius: 100, overflow: "hidden" }}>
                      <button onClick={() => setModalQty((q) => Math.max(1, q - 1))} aria-label="Decrease quantity" style={{ width: 36, height: 36, background: "none", border: "none", color: pageText, cursor: "pointer", fontSize: 16, fontFamily: fonts.body }}>−</button>
                      <span style={{ minWidth: 32, textAlign: "center", fontSize: 14, fontWeight: 500, color: pageText }}>{modalQty}</span>
                      <button onClick={() => setModalQty((q) => Math.min(999, q + 1))} aria-label="Increase quantity" style={{ width: 36, height: 36, background: "none", border: "none", color: pageText, cursor: "pointer", fontSize: 16, fontFamily: fonts.body }}>+</button>
                    </div>
                  </div>
                  <button onClick={() => addToCart(selectedProduct, modalQty)} style={{ padding: "18px 32px", background: accent, color: "#fff", border: "none", borderRadius: 100, fontFamily: fonts.body, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", width: "100%", marginTop: "auto" }}>Add to Cart &mdash; {fmt(selectedProduct.price * modalQty)}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CART DRAWER */}
        {showCart && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 300 }} onClick={() => setShowCart(false)}>
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "90vw", background: pageBg, display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.08)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <h3 style={{ fontFamily: fonts.heading, fontSize: 22, fontWeight: 400 }}>Your Cart ({cartCount})</h3>
                <button onClick={() => setShowCart(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: pageMuted }}>&times;</button>
              </div>
              {cart.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: pageMuted }}>Your cart is empty</p></div>
              ) : (
                <>
                  <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
                    {cart.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                        {item.product.image_url && <img src={item.product.image_url} alt="" onError={hideOnError} loading="lazy" decoding="async" style={{ width: 80, height: 100, borderRadius: 10, objectFit: "cover" }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: fonts.heading, fontSize: 16, marginBottom: 4 }}>{item.product.name}</div>
                          {Object.keys(item.selectedVariants).length > 0 && <div style={{ fontSize: 12, color: pageMuted, marginBottom: 8 }}>{Object.entries(item.selectedVariants).map(([k, v]) => k + ": " + v).join(" \u2022 ")}</div>}
                          <div style={{ fontSize: 14, fontWeight: 500, color: accent, marginBottom: 8 }}>{fmt(item.product.price * item.qty)}{item.qty > 1 && <span style={{ fontSize: 11, color: pageMuted, marginLeft: 6, fontWeight: 400 }}>({fmt(item.product.price)} each)</span>}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={() => updateQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.1)", background: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                            <button onClick={() => updateQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.1)", background: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                            <button onClick={() => removeFromCart(idx)} style={{ marginLeft: "auto", background: "none", border: "none", color: pageMuted, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "24px 28px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    {totalDiscount > 0 && (
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 13, color: accent, letterSpacing: "0.04em", textTransform: "uppercase" }}>Discount</span>
                        <span style={{ fontSize: 14, color: accent }}>−{fmt(totalDiscount)}</span>
                      </div>
                    )}
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <span style={{ fontSize: 14, color: pageMuted, letterSpacing: "0.04em", textTransform: "uppercase" }}>Total</span>
                      <span style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 500 }}>{fmt(cartTotal)}</span>
                    </div>
                    <button onClick={() => {
                      const payload = JSON.stringify(cart.map(i => ({ id: i.product.id, name: i.product.name, price: i.product.price, qty: i.qty, variant: Object.entries(i.selectedVariants).map(([k,v]) => k+": "+v).join(", "), image: i.product.image_url || "" })));
                      const encoded = btoa(unescape(encodeURIComponent(payload)));
                      window.location.href = "/store/" + slug + "/checkout?cart=" + encoded;
                    }} style={{ width: "100%", padding: 18, background: accent, color: "#fff", border: "none", borderRadius: 100, fontFamily: fonts.body, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", marginBottom: 8 }}>Proceed to Checkout</button>
                    {seller?.checkout_config?.whatsapp_checkout_enabled !== false && <button onClick={checkoutWhatsApp} style={{ width: "100%", padding: 18, background: "#25d366", color: "#fff", border: "none", borderRadius: 100, fontFamily: fonts.body, fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>Checkout via WhatsApp</button>}
                    <p style={{ textAlign: "center", fontSize: 11, color: pageMuted, marginTop: 12 }}>You'll be taken to WhatsApp to confirm</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* SEARCH OVERLAY */}
        {showSearch && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, background: pageBg + "f7", backdropFilter: "blur(40px)", padding: "0 32px", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center", height: 80 }}>
              <input type="text" autoFocus placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "16px 0", background: "none", border: "none", borderBottom: "1px solid rgba(0,0,0,0.06)", fontFamily: fonts.heading, fontSize: 24, fontWeight: 300, color: pageText, outline: "none" }} />
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ background: "none", border: "none", fontSize: 24, color: pageMuted, cursor: "pointer", marginLeft: 16 }}>&times;</button>
            </div>
            {searched && searched.length > 0 && (
              <div style={{ width: "100%", maxWidth: 600, paddingBottom: 24 }}>
                {searched.slice(0, 6).map((p) => (
                  <div key={p.id} onClick={() => { setShowSearch(false); setSearchQuery(""); if (isEditMode) { openProduct(p); } else { router.push(`/store/${slug}/p/${p.id}`); } }} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", cursor: "pointer" }}>
                    {p.image_url && <img src={p.image_url} alt="" onError={hideOnError} loading="lazy" decoding="async" style={{ width: 48, height: 60, borderRadius: 8, objectFit: "cover" }} />}
                    <div><div style={{ fontSize: 15 }}>{p.name}</div><div style={{ fontSize: 13, color: accent }}>{fmt(p.price)}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* POLICY MODAL */}
        {policyModal && (
          <div onClick={() => setPolicyModal(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: pageBg, borderRadius: 20, maxWidth: 520, width: "100%", padding: "40px 36px", position: "relative" }}>
              <button onClick={() => setPolicyModal(null)} style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.04)", border: "none", fontSize: 14, cursor: "pointer", color: pageMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
              <h3 style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 400, letterSpacing: "0.02em", marginBottom: 20, color: pageText }}>{policyModal.title}</h3>
              <p style={{ fontSize: 14, lineHeight: 1.85, color: pageMuted, fontWeight: 300, whiteSpace: "pre-wrap" }}>{policyModal.content}</p>
            </div>
          </div>
        )}

        {/* CONTACT MODAL */}
        {contactOpen && (
          <div onClick={() => setContactOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 24 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: pageBg, borderRadius: 20, maxWidth: 440, width: "100%", padding: "40px 36px", position: "relative" }}>
              <button onClick={() => setContactOpen(false)} style={{ position: "absolute", top: 16, right: 16, width: 32, height: 32, borderRadius: "50%", background: "rgba(0,0,0,0.04)", border: "none", fontSize: 14, cursor: "pointer", color: pageMuted, display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
              <h3 style={{ fontFamily: fonts.heading, fontSize: 24, fontWeight: 400, letterSpacing: "0.02em", marginBottom: 24, color: pageText }}>Contact Us</h3>
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {seller?.whatsapp_number && (
                  <a href={waLink} target="_blank" rel="noreferrer" style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(37,211,102,0.06)", border: "1px solid rgba(37,211,102,0.15)", borderRadius: 12, textDecoration: "none", color: pageText, fontSize: 14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
                    <div><div style={{ fontWeight: 500 }}>WhatsApp</div><div style={{ fontSize: 12, color: pageMuted }}>{seller.whatsapp_number}</div></div>
                  </a>
                )}
                {(cfg as any).contact_email && (
                  <a href={`mailto:${(cfg as any).contact_email}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, textDecoration: "none", color: pageText, fontSize: 14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pageMuted} strokeWidth="1.5" strokeLinecap="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
                    <div><div style={{ fontWeight: 500 }}>Email</div><div style={{ fontSize: 12, color: pageMuted }}>{(cfg as any).contact_email}</div></div>
                  </a>
                )}
                {(cfg as any).contact_phone && (
                  <a href={`tel:${((cfg as any).contact_phone || "").replace(/\s/g, "")}`} style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, textDecoration: "none", color: pageText, fontSize: 14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pageMuted} strokeWidth="1.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.04 4.72 2 2 0 012 2.5h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 10a16 16 0 006 6l.36-.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg>
                    <div><div style={{ fontWeight: 500 }}>Phone</div><div style={{ fontSize: 12, color: pageMuted }}>{(cfg as any).contact_phone}</div></div>
                  </a>
                )}
                {(cfg as any).operating_hours && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, fontSize: 14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pageMuted} strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    <div><div style={{ fontWeight: 500 }}>Hours</div><div style={{ fontSize: 12, color: pageMuted }}>{(cfg as any).operating_hours}</div></div>
                  </div>
                )}
                {(cfg as any).physical_address && (
                  <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "14px 16px", background: "rgba(0,0,0,0.02)", border: "1px solid rgba(0,0,0,0.06)", borderRadius: 12, fontSize: 14 }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={pageMuted} strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>
                    <div><div style={{ fontWeight: 500 }}>Address</div><div style={{ fontSize: 12, color: pageMuted }}>{(cfg as any).physical_address}</div></div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* WHATSAPP FLOAT */}
        {seller?.whatsapp_number && seller?.checkout_config?.whatsapp_checkout_enabled !== false && (
          <a href={waLink} target="_blank" rel="noreferrer" aria-label={`Chat with ${seller?.store_name || "us"} on WhatsApp`} style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(37,211,102,0.3)", zIndex: 50, textDecoration: "none" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </a>
        )}

      </div>
    </>
  );
}
