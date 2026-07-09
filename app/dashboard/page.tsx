"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";
import { revalidateStore } from "../actions/revalidate-store";
import { canonicalStoreUrl } from "../../lib/store-url";
import { FONT_PAIRS, DEFAULT_FONT_PAIR_KEY } from "../../lib/font-pairs";
import CtaTargetPicker, { type CtaTarget } from "../components/CtaTargetPicker";
import Spinner from "../components/Spinner";

// Monoline SVG icon set for the sidebar/header/panels -- 1.6px stroke,
// currentColor, 20x20 viewBox. Mirrors the icon component already
// established in the Online Visual Editor so both surfaces feel like one
// product instead of mixing hand-drawn icons with emoji.
type DashIconName =
  | "overview" | "launch" | "health" | "products" | "collections" | "orders"
  | "cart" | "discount" | "editor" | "theme" | "store" | "domain" | "payment"
  | "analytics" | "share" | "qrcode" | "settings" | "account" | "check"
  | "warning" | "pending" | "external" | "bell" | "chevron-down" | "trend-up"
  | "eye" | "box" | "sparkle";

function DashIcon({ name, size = 15, stroke = 1.6, className }: { name: DashIconName; size?: number; stroke?: number; className?: string }) {
  const c = { width: size, height: size, viewBox: "0 0 20 20", fill: "none", stroke: "currentColor", strokeWidth: stroke, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, className };
  switch (name) {
    case "overview": return <svg {...c}><rect x="3" y="3" width="6" height="6" rx="1"/><rect x="11" y="3" width="6" height="6" rx="1"/><rect x="3" y="11" width="6" height="6" rx="1"/><rect x="11" y="11" width="6" height="6" rx="1"/></svg>;
    case "launch": return <svg {...c}><path d="M10 2c2 1.5 3.5 4 3.5 7 0 2-1 4-3.5 6-2.5-2-3.5-4-3.5-6 0-3 1.5-5.5 3.5-7Z"/><circle cx="10" cy="8" r="1.3"/><path d="M7 13.5 5 17l3-1.2"/><path d="M13 13.5 15 17l-3-1.2"/></svg>;
    case "health": return <svg {...c}><path d="M10 3a4 4 0 0 1 7 2.5c0 3.5-4 6-7 9.5-3-3.5-7-6-7-9.5A4 4 0 0 1 10 3Z"/><path d="M5.5 9h2l1.2-2.2L10 11l1.2-2h2.3"/></svg>;
    case "products": return <svg {...c}><path d="M4 6h12l-1 11H5L4 6Z"/><path d="M7 6V4a3 3 0 0 1 6 0v2"/></svg>;
    case "collections": return <svg {...c}><path d="M3 6a1 1 0 0 1 1-1h4l2 2h7a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6Z"/></svg>;
    case "orders": return <svg {...c}><path d="M5 4h10l1 13H4L5 4Z"/><path d="M7.5 4v-.5a2.5 2.5 0 0 1 5 0V4"/><path d="M7 9h6"/></svg>;
    case "cart": return <svg {...c}><circle cx="7" cy="16" r="1.2"/><circle cx="14" cy="16" r="1.2"/><path d="M2 3h2l1.6 9.3a1.5 1.5 0 0 0 1.5 1.2h7a1.5 1.5 0 0 0 1.47-1.2L17 6H4.5"/></svg>;
    case "discount": return <svg {...c}><path d="M4 10.5V5a1 1 0 0 1 1-1h5.5L17 10.5 10.5 17 4 10.5Z"/><circle cx="7.5" cy="7.5" r="1.2"/></svg>;
    case "editor": return <svg {...c}><path d="m4 16 1-3 9-9a1.5 1.5 0 0 1 2.5 1.5l-9 9-3 1Z"/><path d="m12 5 2.5 2.5"/></svg>;
    case "theme": return <svg {...c}><circle cx="10" cy="10" r="7"/><circle cx="7.2" cy="8" r="1"/><circle cx="9.5" cy="5.8" r="1"/><circle cx="13" cy="7" r="1"/><path d="M10 17a7 7 0 0 0 1-13.9"/></svg>;
    case "store": return <svg {...c}><path d="M3 8l1-4h12l1 4"/><path d="M3 8a2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0 2 2 0 0 0 4 0"/><path d="M4 8v8h12V8"/><path d="M8 16v-4h4v4"/></svg>;
    case "domain": return <svg {...c}><circle cx="10" cy="10" r="7"/><path d="M3 10h14"/><path d="M10 3a11 11 0 0 1 0 14"/><path d="M10 3a11 11 0 0 0 0 14"/></svg>;
    case "payment": return <svg {...c}><rect x="2" y="5" width="16" height="11" rx="1.5"/><path d="M2 8.5h16"/><path d="M5 12.5h3"/></svg>;
    case "analytics": return <svg {...c}><path d="M4 16V9"/><path d="M10 16V4"/><path d="M16 16v-6"/><path d="M3 16h14"/></svg>;
    case "share": return <svg {...c}><circle cx="15" cy="5" r="2"/><circle cx="5" cy="10" r="2"/><circle cx="15" cy="15" r="2"/><path d="m6.8 9 6.4-3"/><path d="m6.8 11 6.4 3"/></svg>;
    case "qrcode": return <svg {...c}><rect x="3" y="3" width="5" height="5" rx="0.8"/><rect x="12" y="3" width="5" height="5" rx="0.8"/><rect x="3" y="12" width="5" height="5" rx="0.8"/><path d="M12 12h2v2h-2z"/><path d="M15 12h2v5h-4v-2"/><path d="M12 17h1"/></svg>;
    case "settings": return <svg {...c}><circle cx="10" cy="10" r="2.5"/><path d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.1 4.9l-1.4 1.4M6.3 13.7l-1.4 1.4M15.1 15.1l-1.4-1.4M6.3 6.3 4.9 4.9"/></svg>;
    case "account": return <svg {...c}><circle cx="10" cy="7" r="3"/><path d="M4 17c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/></svg>;
    case "check": return <svg {...c}><path d="m4 10 4 4 8-8"/></svg>;
    case "warning": return <svg {...c}><path d="M10 3 2.5 16.5h15L10 3Z"/><path d="M10 8.5v3.5"/><circle cx="10" cy="14.3" r="0.4" fill="currentColor"/></svg>;
    case "pending": return <svg {...c}><circle cx="10" cy="10" r="7"/><path d="M10 6v4l2.5 1.5"/></svg>;
    case "external": return <svg {...c}><path d="M7 4H4a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-3"/><path d="M11 3h6v6"/><path d="m17 3-7 7"/></svg>;
    case "bell": return <svg {...c}><path d="M10 3a4 4 0 0 0-4 4v2.5c0 1-.4 2-1.2 2.7L4 13h12l-.8-.8c-.8-.7-1.2-1.7-1.2-2.7V7a4 4 0 0 0-4-4Z"/><path d="M8 16a2 2 0 0 0 4 0"/></svg>;
    case "chevron-down": return <svg {...c}><path d="m5 7.5 5 5 5-5"/></svg>;
    case "trend-up": return <svg {...c}><path d="M3 13.5 8 9l3 3 6-6.5"/><path d="M13 5.5h4v4"/></svg>;
    case "eye": return <svg {...c}><path d="M2 10s3-5.5 8-5.5S18 10 18 10s-3 5.5-8 5.5S2 10 2 10Z"/><circle cx="10" cy="10" r="2.3"/></svg>;
    case "box": return <svg {...c}><path d="M10 2.5 17 6v8l-7 3.5L3 14V6l7-3.5Z"/><path d="M3 6l7 3.5L17 6"/><path d="M10 9.5V17"/></svg>;
    case "sparkle": return <svg {...c}><path d="M10 2v4M10 14v4M2 10h4M14 10h4"/><path d="m5 5 2 2M13 13l2 2M15 5l-2 2M7 13l-2 2"/></svg>;
  }
}

const productInCat = (cat: string, product: { category: string }) =>
  (product.category || "").split(",").map((c) => c.trim()).filter(Boolean).includes(cat);
const addCat = (current: string, col: string) => {
  const cats = (current || "").split(",").map((c) => c.trim()).filter(Boolean);
  if (!cats.includes(col)) cats.push(col);
  return cats.join(",");
};
const removeCat = (current: string, col: string) =>
  (current || "").split(",").map((c) => c.trim()).filter((c) => c && c !== col).join(",");

interface Variant { name: string; options: string[]; images?: { [option: string]: string }; priceDelta?: { [option: string]: number }; }

interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string;
}

interface StoreConfig {
  show_banner_text: boolean; show_marquee: boolean; show_collections: boolean;
  show_about: boolean; show_trust_bar: boolean; show_policies: boolean;
  show_newsletter: boolean; show_announcement: boolean; announcement: string;
  marquee_texts: string[]; trust_items: { icon: string; title: string; desc: string }[];
  policy_items: { title: string; desc: string }[];
  footer_about?: string;
  test_checkout_passed?: boolean;
  contact_email?: string;
  contact_phone?: string;
  operating_hours?: string;
  physical_address?: string;
  shipping_policy?: string;
  return_policy?: string;
  free_ship_threshold?: number | null;
  hero_title?: string;
  hero_cta?: string;
  hero_cta_target?: CtaTarget;
  font_pair?: string;
  hero_image_position?: string;
  hero_image_behavior?: string;
}

interface CheckoutConfig {
  eft_enabled: boolean; eft_bank_name: string; eft_account_number: string; eft_account_name: string;
  eft_branch_code: string; eft_account_type: string; eft_instructions: string;
  payfast_enabled: boolean; payfast_merchant_id: string; payfast_merchant_key: string;
  delivery_enabled: boolean; pickup_enabled: boolean; pickup_address: string; pickup_instructions: string;
  shipping_options: { name: string; price: number }[];
  whatsapp_checkout_enabled: boolean;
}

interface Seller {
  id: string; email: string; store_name: string; whatsapp_number: string; subdomain: string;
  template: string; plan: string; primary_color: string; logo_url: string; banner_url: string;
  tagline: string; description: string; collections: string[];
  social_links: SocialLinks; store_config: StoreConfig; checkout_config: CheckoutConfig;
  subscription_status: string; subscription_plan: string; subscription_grace_until: string | null; trial_ends_at: string; subscription_started_at: string;
  payfast_subscription_token: string | null;
  custom_domain?: string | null;
  custom_domain_status?: string | null;
}

interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean;
  status: string; sort_order: number; description: string; created_at: string;
}

interface Order {
  id: string; order_number: number; customer_name: string; customer_phone: string;
  customer_email: string;
  items: { name: string; qty: number; price: number; variant?: string; image?: string }[]; total: number;
  status: string; payment_status: string; created_at: string;
  shipping_address: { address: string; apartment?: string; city: string; province: string; postal_code: string } | null;
  fulfillment_method: string; shipping_option: string; shipping_cost: number; payment_method: string;
}

const SELLER_COLUMNS = "id, email, store_name, whatsapp_number, subdomain, template, plan, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, checkout_config, subscription_status, subscription_plan, subscription_grace_until, trial_ends_at, subscription_started_at, payfast_subscription_token, custom_domain, custom_domain_status";
const PRODUCT_COLUMNS = "id, name, price, old_price, category, image_url, images, variants, in_stock, status, sort_order, description, created_at";
const ORDER_COLUMNS = "id, order_number, customer_name, customer_phone, customer_email, items, total, status, payment_status, created_at, shipping_address, fulfillment_method, shipping_option, shipping_cost, payment_method";
const DISCOUNT_COLUMNS = "id, code, type, value, min_order, max_uses, used_count, active, expires_at, created_at, applies_to, product_ids, collection_names, show_countdown, description";
const PRODUCTS_LIMIT = 500;
const ORDERS_LIMIT = 100;
const DISCOUNTS_LIMIT = 100;

const TEMPLATES = [
  { id: "soft-luxury", name: "Soft Luxury", desc: "Warm cream tones with elegant serif typography", colors: { bg: "#f6f3ef", card: "#ffffff", text: "#2a2a2e" } },
  { id: "glass-futuristic", name: "Glass Chrome", desc: "Dark futuristic theme with chrome metallic accents", colors: { bg: "#030305", card: "#0b0b0f", text: "#f0f0f0" } },
  { id: "crown", name: "Crown", desc: "Dark luxury hair store — gold accents, editorial typography", colors: { bg: "#0a0908", card: "#1a1816", text: "#f0e6d3" } },
  { id: "heirloom", name: "Heirloom", desc: "Editorial archive — italic serifs, hairline grids, drop pacing", colors: { bg: "#ffffff", card: "#f2f0ed", text: "#111010" } },
];

const COLOR_PRESETS = ["#ff6b35", "#ff6b35", "#111111", "#00d4aa", "#8b5cf6", "#e74c3c", "#2563eb", "#d4a017", "#16a34a", "#ec4899"];

type TabKey = "overview" | "products" | "collections" | "orders" | "mystore" | "checkout" | "discounts" | "abandoned" | "domains" | "analytics" | "qrcode";

// ── DASHBOARD THEME PALETTES ─────────────────────────────────────────────────
// Active palette is exposed as CSS custom properties on the dashboard root via
// the data-theme attribute + the <style> block below. Semantic colors (green
// success, amber warning, red danger, accent orange) stay identical in both.
const THEME = {
  dark: {
    "--bg": "#030303", "--panel": "rgba(255,255,255,0.02)", "--panel-2": "rgba(255,255,255,0.04)",
    "--border": "rgba(255,255,255,0.07)", "--text": "#f5f5f5", "--muted": "rgba(245,245,245,0.45)",
    "--muted-2": "rgba(245,245,245,0.25)", "--input-bg": "rgba(255,255,255,0.04)",
    "--panel-solid": "#080808", "--topbar": "rgba(3,3,3,0.9)", "--toggle-off": "rgba(255,255,255,0.1)",
  },
  light: {
    "--bg": "#f5f5f6", "--panel": "#ffffff", "--panel-2": "#fafafa",
    "--border": "rgba(0,0,0,0.08)", "--text": "#131316", "--muted": "rgba(19,19,22,0.55)",
    "--muted-2": "rgba(19,19,22,0.35)", "--input-bg": "rgba(0,0,0,0.03)",
    "--panel-solid": "#ffffff", "--topbar": "rgba(245,245,246,0.92)", "--toggle-off": "rgba(0,0,0,0.15)",
  },
} as const;
const themeVars = (t: keyof typeof THEME) => Object.entries(THEME[t]).map(([k, v]) => k + ":" + v + ";").join("");

export default function Dashboard() {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productFilter, setProductFilter] = useState<"published" | "draft" | "trashed">("published");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProductIds, setSelectedProductIds] = useState<Set<string>>(new Set());
  const [showBulkPrice, setShowBulkPrice] = useState(false);
  const [bulkMode, setBulkMode] = useState<"percent" | "flat" | "set">("percent");
  const [bulkDirection, setBulkDirection] = useState<"increase" | "decrease">("increase");
  const [bulkValue, setBulkValue] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);

  const [showForm, setShowForm] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formComparePrice, setFormComparePrice] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImages, setFormImages] = useState<File[]>([]);
  const [formPreviews, setFormPreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [dragImgIdx, setDragImgIdx] = useState<number | null>(null);
  const [touchDropIdx, setTouchDropIdx] = useState<number | null>(null);
  const [formVariants, setFormVariants] = useState<Variant[]>([]);
  const [formSaving, setFormSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [storeTemplate, setStoreTemplate] = useState("soft-luxury");
  const [storeColor, setStoreColor] = useState("#ff6b35");
  const [storeTagline, setStoreTagline] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [storeCollections, setStoreCollections] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({ show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, show_announcement: false, announcement: "", marquee_texts: ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: [{ icon: "star", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "truck", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "refresh", title: "Easy Returns", desc: "14-day policy" }, { icon: "lock", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy on unworn items." }, { title: "Payment", desc: "All major cards via Yoco + WhatsApp checkout." }], footer_about: "", test_checkout_passed: false, hero_title: "", hero_cta: "", hero_cta_target: { type: "products" }, font_pair: DEFAULT_FONT_PAIR_KEY, hero_image_position: "center", hero_image_behavior: "still" });
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaved, setStoreSaved] = useState(false);
  const [testCheckoutResult, setTestCheckoutResult] = useState<{ passed: boolean; issues: string[] } | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [domainInput, setDomainInput] = useState("");
  const [domainStatus, setDomainStatus] = useState<{ domain: string; verified: boolean; misconfigured: boolean; requiredDnsRecords: { type: string; name: string; value: string }[] } | null>(null);
  const [domainLoading, setDomainLoading] = useState(false);
  const [domainError, setDomainError] = useState("");
  const [domainUrlCopied, setDomainUrlCopied] = useState(false);
  const [domainTabLoaded, setDomainTabLoaded] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [growDismissed, setGrowDismissed] = useState(() => typeof window !== "undefined" && localStorage.getItem("cs_grow_dismissed") === "1");
  const growSessionCounted = useRef(false);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig>({ eft_enabled: false, eft_bank_name: "", eft_account_number: "", eft_account_name: "", eft_branch_code: "", eft_account_type: "", eft_instructions: "", payfast_enabled: false, payfast_merchant_id: "", payfast_merchant_key: "", delivery_enabled: true, pickup_enabled: false, pickup_address: "", pickup_instructions: "", shipping_options: [], whatsapp_checkout_enabled: true });
  const [checkoutView, setCheckoutView] = useState<"payments" | "shipping">("payments");
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutSaved, setCheckoutSaved] = useState(false);
  const [newShipName, setNewShipName] = useState("");
  const [newShipPrice, setNewShipPrice] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderSaved, setOrderSaved] = useState(false);
  const [orderNotification, setOrderNotification] = useState<{ order_number: string; customer_name: string; total: number; id: string } | null>(null);
  const [hasMoreOrders, setHasMoreOrders] = useState(false);
  const [loadingMoreOrders, setLoadingMoreOrders] = useState(false);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [productSort, setProductSort] = useState("manual");

  interface DiscountCode { id: string; code: string; type: string; value: number; min_order: number; max_uses: number | null; used_count: number; active: boolean; expires_at: string | null; created_at: string; applies_to: string; product_ids: string[]; collection_names: string[]; show_countdown: boolean; description?: string | null; }
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [dcCode, setDcCode] = useState("");
  const [dcType, setDcType] = useState("percentage");
  const [dcValue, setDcValue] = useState("");
  const [dcMinOrder, setDcMinOrder] = useState("");
  const [dcMaxUses, setDcMaxUses] = useState("");
  const [dcExpires, setDcExpires] = useState("");
  const [dcDescription, setDcDescription] = useState("");
  const [dcSaving, setDcSaving] = useState(false);
  const [showDcForm, setShowDcForm] = useState(false);
  const [dcAppliesTo, setDcAppliesTo] = useState("cart");
  const [dcProductIds, setDcProductIds] = useState<string[]>([]);
  const [dcCollections, setDcCollections] = useState<string[]>([]);
  const [dcShowCountdown, setDcShowCountdown] = useState(false);
  const [dcEditId, setDcEditId] = useState<string | null>(null);
  const [openDiscountCat, setOpenDiscountCat] = useState<string | null>("cart");
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [templateOpen, setTemplateOpen] = useState(true);
  const [logoRemoved, setLogoRemoved] = useState(false);
  const [bannerRemoved, setBannerRemoved] = useState(false);

  const [theme, setTheme] = useState<"dark" | "light">("dark");
  useEffect(() => {
    const saved = localStorage.getItem("cs_dash_theme");
    if (saved === "light" || saved === "dark") setTheme(saved);
  }, []);
  const toggleTheme = () => setTheme((t) => { const next = t === "dark" ? "light" : "dark"; localStorage.setItem("cs_dash_theme", next); return next; });

  useEffect(() => { checkAuth(); }, []);

  const switchTab = (t: TabKey) => { setTab(t); setSidebarOpen(false); };

  const checkAuth = async () => {
    // getSession() reads from local storage — no network round-trip,
    // unlike getUser() which validates the JWT against Supabase.
    const { data: { session } } = await supabase.auth.getSession();
    const user = session?.user;
    if (!user) { router.push("/login"); return; }
    // Fetch seller + products + orders + discounts in a single parallel batch
    const [sellerRes, pdResult, odResult, dcResult] = await Promise.all([
      supabase.from("sellers").select(SELLER_COLUMNS).eq("id", user.id).single(),
      supabase.from("products").select(PRODUCT_COLUMNS).eq("seller_id", user.id).order("sort_order", { ascending: true }).limit(PRODUCTS_LIMIT),
      supabase.from("orders").select(ORDER_COLUMNS).eq("seller_id", user.id).order("created_at", { ascending: false }).limit(ORDERS_LIMIT),
      supabase.from("discount_codes").select(DISCOUNT_COLUMNS).eq("seller_id", user.id).order("created_at", { ascending: false }).limit(DISCOUNTS_LIMIT),
    ]);
    const sd = sellerRes.data;
    if (sd) { setSeller(sd); setStoreTemplate(sd.template || "soft-luxury"); setStoreColor(sd.primary_color || "#ff6b35"); setStoreTagline(sd.tagline || ""); setStoreDescription(sd.description || ""); setLogoPreview(sd.logo_url || ""); setBannerPreview(sd.banner_url || ""); setStoreCollections(sd.collections || []); setSocialLinks(sd.social_links || {}); const c = sd.store_config || {} as any; setStoreConfig({ show_banner_text: c.show_banner_text !== false, show_marquee: c.show_marquee !== false, show_collections: c.show_collections !== false, show_about: c.show_about !== false, show_trust_bar: c.show_trust_bar !== false, show_policies: c.show_policies !== false, show_newsletter: !!c.show_newsletter, show_announcement: !!c.show_announcement, announcement: c.announcement || "", marquee_texts: c.marquee_texts?.length ? c.marquee_texts : ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: c.trust_items?.length ? c.trust_items : [{ icon: "star", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "truck", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "refresh", title: "Easy Returns", desc: "14-day policy" }, { icon: "lock", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: c.policy_items?.length ? c.policy_items : [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy." }, { title: "Payment", desc: "Cards via Yoco + WhatsApp checkout." }], footer_about: c.footer_about || "", test_checkout_passed: !!c.test_checkout_passed, contact_email: c.contact_email || "", contact_phone: c.contact_phone || "", operating_hours: c.operating_hours || "", physical_address: c.physical_address || "", shipping_policy: c.shipping_policy || "", return_policy: c.return_policy || "", free_ship_threshold: c.free_ship_threshold ?? null, hero_title: c.hero_title !== undefined ? c.hero_title : (sd.store_name || ""), hero_cta: c.hero_cta || "", hero_cta_target: c.hero_cta_target || { type: "products" }, font_pair: c.font_pair || DEFAULT_FONT_PAIR_KEY, hero_image_position: c.hero_image_position || "center", hero_image_behavior: c.hero_image_behavior || "still" }); const cc = sd.checkout_config || {} as any; setCheckoutConfig({ eft_enabled: !!cc.eft_enabled, eft_bank_name: cc.eft_bank_name || "", eft_account_number: cc.eft_account_number || "", eft_account_name: cc.eft_account_name || "", eft_branch_code: cc.eft_branch_code || "", eft_account_type: cc.eft_account_type || "", eft_instructions: cc.eft_instructions || "", payfast_enabled: !!cc.payfast_enabled, payfast_merchant_id: cc.payfast_merchant_id || "", payfast_merchant_key: cc.payfast_merchant_key || "", delivery_enabled: cc.delivery_enabled !== false, pickup_enabled: !!cc.pickup_enabled, pickup_address: cc.pickup_address || "", pickup_instructions: cc.pickup_instructions || "", shipping_options: cc.shipping_options || [], whatsapp_checkout_enabled: cc.whatsapp_checkout_enabled !== false }); }
    if (pdResult.data) setProducts(pdResult.data);
    if (odResult.data) {
      setOrders(odResult.data);
      setHasMoreOrders(odResult.data.length >= ORDERS_LIMIT);
    }
    if (dcResult.data) setDiscountCodes(dcResult.data);
    setLoading(false);

    const channel = supabase.channel("orders-" + user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: "seller_id=eq." + user.id }, (payload: any) => {
      const newOrder = payload.new;
      setOrders((prev) => [newOrder, ...prev]);
      setOrderNotification({ order_number: newOrder.order_number || newOrder.id?.substring(0, 8), customer_name: newOrder.customer_name || "Customer", total: newOrder.total, id: newOrder.id });
      try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 880; gain.gain.value = 0.15; osc.start(); osc.stop(ctx.currentTime + 0.15); setTimeout(() => { const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain(); osc2.connect(gain2); gain2.connect(ctx.destination); osc2.frequency.value = 1100; gain2.gain.value = 0.15; osc2.start(); osc2.stop(ctx.currentTime + 0.2); }, 180); } catch {}
      setTimeout(() => setOrderNotification(null), 10000);
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const revalidateMyStore = () => {
    const sub = seller?.subdomain;
    if (sub) void revalidateStore(sub).catch(() => {});
  };

  const loadMoreOrders = async () => {
    if (!seller || loadingMoreOrders) return;
    setLoadingMoreOrders(true);
    const { data } = await supabase.from("orders").select(ORDER_COLUMNS).eq("seller_id", seller.id).order("created_at", { ascending: false }).range(orders.length, orders.length + ORDERS_LIMIT - 1);
    if (data && data.length > 0) {
      setOrders((prev) => [...prev, ...data]);
      setHasMoreOrders(data.length >= ORDERS_LIMIT);
    } else {
      setHasMoreOrders(false);
    }
    setLoadingMoreOrders(false);
  };
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { alert("Logo must be under 5MB"); return; } setLogoFile(f); setLogoRemoved(false); const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); };
  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { alert("Banner must be under 5MB"); return; } setBannerFile(f); setBannerRemoved(false); const r = new FileReader(); r.onload = (ev) => setBannerPreview(ev.target?.result as string); r.readAsDataURL(f); };

  const getAccessToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || "";
  };

  const refreshDomainStatus = async () => {
    const token = await getAccessToken();
    if (!token) return;
    setDomainLoading(true);
    try {
      const res = await fetch("/api/domains/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }) });
      const data = await res.json();
      if (res.ok) setDomainStatus(data.status || null);
    } catch {}
    setDomainLoading(false);
  };

  const connectDomain = async () => {
    if (!domainInput.trim()) return;
    setDomainLoading(true); setDomainError("");
    const token = await getAccessToken();
    try {
      const res = await fetch("/api/domains/connect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ domain: domainInput.trim(), access_token: token }) });
      const data = await res.json();
      if (!res.ok) { setDomainError(data.error || "Couldn't connect that domain."); }
      else { setDomainStatus(data.status); setDomainInput(""); if (seller) setSeller({ ...seller, custom_domain: data.status.domain } as any); }
    } catch { setDomainError("Couldn't reach the server. Try again."); }
    setDomainLoading(false);
  };

  const removeDomain = async () => {
    if (!confirm("Disconnect this domain? Your store link automatically falls back to the free catalogstore.co.za subdomain.")) return;
    setDomainLoading(true); setDomainError("");
    const token = await getAccessToken();
    try {
      const res = await fetch("/api/domains/remove", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ access_token: token }) });
      const data = await res.json();
      if (!res.ok) { setDomainError(data.error || "Couldn't remove that domain."); }
      else { setDomainStatus(null); if (seller) setSeller({ ...seller, custom_domain: null } as any); }
    } catch { setDomainError("Couldn't reach the server. Try again."); }
    setDomainLoading(false);
  };

  useEffect(() => {
    if (tab === "domains" && seller?.custom_domain && !domainTabLoaded) {
      setDomainTabLoaded(true);
      refreshDomainStatus();
    }
  }, [tab, seller?.custom_domain, domainTabLoaded]);

  const saveStoreSettings = async () => {
    if (!seller) return; setStoreSaving(true); setStoreSaved(false);
    let logoUrl: string | null = logoRemoved ? null : (seller.logo_url || ""); let bannerUrl: string | null = bannerRemoved ? null : (seller.banner_url || "");
    if (logoFile) { const ext = logoFile.name.split(".").pop(); const path = seller.id + "/logo." + ext; await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); logoUrl = data.publicUrl + "?t=" + Date.now(); }
    if (bannerFile) { const ext = bannerFile.name.split(".").pop(); const path = seller.id + "/banner." + ext; await supabase.storage.from("store-assets").upload(path, bannerFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); bannerUrl = data.publicUrl + "?t=" + Date.now(); }
    const mergedConfig = { ...seller.store_config, ...storeConfig };
    const { error } = await supabase.from("sellers").update({ template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl, banner_url: bannerUrl, collections: storeCollections, social_links: socialLinks, store_config: mergedConfig }).eq("id", seller.id);
    if (!error) { setSeller({ ...seller, template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl || "", banner_url: bannerUrl || "", collections: storeCollections, social_links: socialLinks, store_config: mergedConfig }); setLogoFile(null); setBannerFile(null); setLogoRemoved(false); setBannerRemoved(false); setStoreSaved(true); setTimeout(() => setStoreSaved(false), 3000); revalidateMyStore(); }
    setStoreSaving(false);
  };

  const resetForm = () => { setFormName(""); setFormPrice(""); setFormComparePrice(""); setFormCategory(""); setFormDescription(""); setFormImages([]); setFormPreviews([]); setExistingImages([]); setFormVariants([]); setUploadProgress(""); setEditingId(null); setShowForm(false); };
  const startEdit = (p: Product) => { setEditingId(p.id); setFormName(p.name); setFormPrice(String(p.price)); setFormComparePrice(p.old_price ? String(p.old_price) : ""); setFormCategory(p.category || ""); setFormDescription(p.description || ""); setFormImages([]); setFormPreviews([]); setExistingImages(p.images || []); setFormVariants(p.variants || []); setShowForm(true); };

  const addVariant = () => setFormVariants([...formVariants, { name: "", options: [""] }]);
  const removeVariant = (i: number) => setFormVariants(formVariants.filter((_, idx) => idx !== i));
  const updateVariantName = (i: number, n: string) => { const u = [...formVariants]; u[i].name = n; setFormVariants(u); };
  const addVariantOption = (vi: number) => { const u = [...formVariants]; u[vi].options.push(""); setFormVariants(u); };
  const updateVariantOption = (vi: number, oi: number, v: string) => { const u = [...formVariants]; u[vi].options[oi] = v; setFormVariants(u); };
  const removeVariantOption = (vi: number, oi: number) => { const u = [...formVariants]; u[vi].options = u[vi].options.filter((_, i) => i !== oi); setFormVariants(u); };

  const PRESET_VARIANTS = [{ name: "Size", options: ["S", "M", "L", "XL"] }, { name: "Color", options: ["Black", "White"] }, { name: "Material", options: ["Cotton", "Polyester"] }];
  const addPresetVariant = (p: Variant) => { if (!formVariants.some((v) => v.name.toLowerCase() === p.name.toLowerCase())) setFormVariants([...formVariants, { ...p, options: [...p.options] }]); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []); if (!files.length) return;
    e.target.value = ""; // reset input so same files can be re-selected if needed
    const slotsLeft = maxImages - formImages.length - existingImages.length;
    if (slotsLeft <= 0) { alert("You've reached the maximum of " + maxImages + " photos."); return; }
    const valid = files.filter((f) => { if (!f.type.startsWith("image/")) return false; if (f.size > 5*1024*1024) { alert(f.name + " is too large (max 5MB)"); return false; } return true; });
    const toAdd = valid.slice(0, slotsLeft); // only take what fits
    if (valid.length > slotsLeft) alert("Only " + slotsLeft + " slot" + (slotsLeft !== 1 ? "s" : "") + " left — added the first " + slotsLeft + " photo" + (slotsLeft !== 1 ? "s" : "") + ".");
    setFormImages((p) => [...p, ...toAdd]);
    toAdd.forEach((file) => { const r = new FileReader(); r.onload = (ev) => setFormPreviews((p) => [...p, ev.target?.result as string]); r.readAsDataURL(file); });
  };
  const removeNewImage = (i: number) => { setFormImages((p) => p.filter((_, idx) => idx !== i)); setFormPreviews((p) => p.filter((_, idx) => idx !== i)); };
  const removeExistingImage = (i: number) => setExistingImages((p) => p.filter((_, idx) => idx !== i));
  const reorderImages = (from: number, to: number) => {
    if (from === to) return;
    const eLen = existingImages.length;
    const combined = [...existingImages, ...formPreviews];
    const combinedFiles = [...Array(eLen).fill(null), ...formImages];
    const [movedUrl] = combined.splice(from, 1);
    const [movedFile] = combinedFiles.splice(from, 1);
    combined.splice(to, 0, movedUrl);
    combinedFiles.splice(to, 0, movedFile);
    setExistingImages(combined.filter((_, i) => !combinedFiles[i]));
    const newFiles: File[] = []; const newPreviews: string[] = [];
    combined.forEach((url, i) => { if (combinedFiles[i]) { newFiles.push(combinedFiles[i]); newPreviews.push(url); } });
    setFormImages(newFiles); setFormPreviews(newPreviews);
  };
  const handleTouchMove = (e: React.TouchEvent) => {
    if (dragImgIdx === null) return;
    const touch = e.touches[0];
    const el = document.elementFromPoint(touch.clientX, touch.clientY)?.closest("[data-imgidx]") as HTMLElement | null;
    setTouchDropIdx(el ? parseInt(el.dataset.imgidx!, 10) : null);
  };
  const handleTouchEnd = () => {
    if (dragImgIdx !== null && touchDropIdx !== null && dragImgIdx !== touchDropIdx) reorderImages(dragImgIdx, touchDropIdx);
    setDragImgIdx(null); setTouchDropIdx(null);
  };

  // ── PARALLEL IMAGE UPLOAD ────────────────────────────────────────────────────
  const uploadImages = async (sellerId: string, productId: string): Promise<string[]> => {
    setUploadProgress("Uploading " + formImages.length + " image" + (formImages.length > 1 ? "s" : "") + "...");
    const results = await Promise.all(
      formImages.map(async (file, i) => {
        const ext = file.name.split(".").pop();
        const path = sellerId + "/" + productId + "/" + Date.now() + "-" + i + "." + ext;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) return null;
        return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      })
    );
    setUploadProgress("");
    return results.filter(Boolean) as string[];
  };

  const cleanVariants = (v: Variant[]): Variant[] => v.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), options: x.options.filter((o) => o.trim()).map((o) => o.trim()), images: x.images || {}, priceDelta: x.priceDelta || {} })).filter((x) => x.options.length > 0);

  // The variant-image picker shows existing URLs alongside FileReader base64 previews of newly added files.
  // If the seller picks a fresh-upload preview, that base64 must be remapped to the eventual Storage URL
  // before save, otherwise we persist megabytes of base64 into the row. Any base64 we can't map (stale
  // entry from a previous bug, or whose upload failed) is dropped — never persist data: URLs.
  const remapVariantImages = (variants: Variant[], previewToUrl: Map<string, string>): Variant[] =>
    variants.map((v) => {
      if (!v.images) return v;
      const next: { [k: string]: string } = {};
      for (const [opt, img] of Object.entries(v.images)) {
        if (typeof img !== "string" || !img) continue;
        if (img.startsWith("data:")) {
          const url = previewToUrl.get(img);
          if (url) next[opt] = url;
        } else {
          next[opt] = img;
        }
      }
      return { ...v, images: next };
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormSaving(true); setUploadProgress("");
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    if (editingId) {
      let allImages = [...existingImages];
      let newUrls: string[] = [];
      if (formImages.length > 0) { newUrls = await uploadImages(user.id, editingId); allImages = [...allImages, ...newUrls]; }
      const previewToUrl = new Map<string, string>(formPreviews.map((p, i) => [p, newUrls[i] || ""] as [string, string]));
      const cv = remapVariantImages(cleanVariants(formVariants), previewToUrl);
      const { error } = await supabase.from("products").update({ name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, description: formDescription, images: allImages, image_url: allImages[0] || null, variants: cv }).eq("id", editingId);
      if (!error) { setProducts(products.map((p) => p.id === editingId ? { ...p, name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, description: formDescription, images: allImages, image_url: allImages[0] || null, variants: cv } : p)); revalidateMyStore(); }
    } else {
      // ── PARALLEL: upload images and insert product at the same time ──────────
      const tempId = Date.now().toString();
      const [uploadedUrls, insertResult] = await Promise.all([
        formImages.length > 0 ? uploadImages(user.id, tempId) : Promise.resolve([]),
        supabase.from("products").insert({ seller_id: user.id, name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, description: formDescription, in_stock: true, variants: [], status: "published", images: [], image_url: null }).select().single(),
      ]);
      const { data, error } = insertResult;
      if (error || !data) { setFormSaving(false); return; }
      const previewToUrl = new Map<string, string>(formPreviews.map((p, i) => [p, uploadedUrls[i] || ""] as [string, string]));
      const cv = remapVariantImages(cleanVariants(formVariants), previewToUrl);
      const followUp: Record<string, unknown> = {};
      if (uploadedUrls.length > 0) { followUp.images = uploadedUrls; followUp.image_url = uploadedUrls[0] || null; }
      if (cv.length > 0) { followUp.variants = cv; }
      if (Object.keys(followUp).length > 0) { await supabase.from("products").update(followUp).eq("id", data.id); }
      setProducts([{ ...data, images: uploadedUrls, image_url: uploadedUrls[0] || null, variants: cv }, ...products]);
      revalidateMyStore();
    }
    resetForm(); setFormSaving(false);
  };

  const toggleStock = async (id: string, cur: boolean) => { await supabase.from("products").update({ in_stock: !cur }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, in_stock: !cur } : p)); revalidateMyStore(); };
  const trashProduct = async (id: string) => { await supabase.from("products").update({ status: "trashed" }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, status: "trashed" } : p)); revalidateMyStore(); };
  const restoreProduct = async (id: string) => { await supabase.from("products").update({ status: "published" }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, status: "published" } : p)); revalidateMyStore(); };
  const deleteForever = async (id: string) => { if (!confirm("Permanently delete this product? This cannot be undone.")) return; await supabase.from("products").delete().eq("id", id); setProducts(products.filter((p) => p.id !== id)); revalidateMyStore(); };
  const duplicateProduct = async (p: Product) => {
    if (!seller) return;
    if (!canAddProduct) { alert(`You've reached your plan limit of ${planLimits.products} products.` + (isFreePlan ? " Upgrade to Pro for up to 100 products." : "")); return; }
    const { data, error } = await supabase.from("products").insert({
      seller_id: seller.id,
      name: p.name + " (Copy)",
      price: p.price,
      old_price: p.old_price,
      category: p.category,
      description: p.description,
      in_stock: p.in_stock,
      variants: p.variants || [],
      status: "draft",
      images: p.images || [],
      image_url: p.image_url,
    }).select().single();
    if (!error && data) { setProducts([data, ...products]); }
  };

  const toggleProductSelected = (id: string) => {
    setSelectedProductIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const applyBulkPrice = async () => {
    const value = parseFloat(bulkValue);
    if (!Number.isFinite(value) || value < 0) { alert("Enter a valid number."); return; }
    const targets = products.filter((p) => selectedProductIds.has(p.id));
    if (targets.length === 0) return;
    setBulkApplying(true);
    try {
      const updates = targets.map((p) => {
        let newPrice = p.price;
        if (bulkMode === "percent") {
          const factor = value / 100;
          newPrice = bulkDirection === "increase" ? p.price * (1 + factor) : p.price * (1 - factor);
        } else if (bulkMode === "flat") {
          newPrice = bulkDirection === "increase" ? p.price + value : p.price - value;
        } else {
          newPrice = value;
        }
        newPrice = Math.max(0, Math.round(newPrice * 100) / 100);
        return { id: p.id, price: newPrice };
      });
      await Promise.all(updates.map((u) => supabase.from("products").update({ price: u.price }).eq("id", u.id)));
      const priceById = new Map(updates.map((u) => [u.id, u.price]));
      setProducts(products.map((p) => priceById.has(p.id) ? { ...p, price: priceById.get(p.id)! } : p));
      revalidateMyStore();
      setShowBulkPrice(false);
      setSelectedProductIds(new Set());
      setBulkValue("");
    } finally {
      setBulkApplying(false);
    }
  };
  const toggleDraft = async (id: string, currentStatus: string) => { const newStatus = currentStatus === "draft" ? "published" : "draft"; await supabase.from("products").update({ status: newStatus }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, status: newStatus } : p)); revalidateMyStore(); };
  const reorderProduct = async (id: string, direction: "up" | "down") => {
    const list = [...products].filter((p) => (p.status || "published") !== "trashed").sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    const idx = list.findIndex((p) => p.id === id); if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    const updates = list.map((p, i) => ({ ...p, sort_order: i }));
    const a = updates[idx]; const b = updates[swapIdx];
    updates[idx] = { ...b, sort_order: idx }; updates[swapIdx] = { ...a, sort_order: swapIdx };
    await Promise.all([supabase.from("products").update({ sort_order: swapIdx }).eq("id", a.id), supabase.from("products").update({ sort_order: idx }).eq("id", b.id)]);
    setProducts(products.map((p) => { if (p.id === a.id) return { ...p, sort_order: swapIdx }; if (p.id === b.id) return { ...p, sort_order: idx }; return p; }));
    revalidateMyStore();
  };
  const initSortOrders = async () => {
    const unordered = products.filter((p) => p.sort_order === null || p.sort_order === undefined);
    if (unordered.length > 0) {
      const maxOrder = Math.max(0, ...products.filter((p) => p.sort_order !== null && p.sort_order !== undefined).map((p) => p.sort_order));
      for (let i = 0; i < unordered.length; i++) { await supabase.from("products").update({ sort_order: maxOrder + i + 1 }).eq("id", unordered[i].id); }
      setProducts(products.map((p) => { if (p.sort_order === null || p.sort_order === undefined) { const uIdx = unordered.findIndex((u) => u.id === p.id); return { ...p, sort_order: maxOrder + uIdx + 1 }; } return p; }));
    }
  };
  useEffect(() => { if (products.length > 0 && seller) initSortOrders(); }, [products.length > 0 && seller?.id]);
  const emptyTrash = async () => { if (!confirm("Permanently delete all trashed products? This cannot be undone.")) return; const trashed = products.filter((p) => p.status === "trashed"); for (const p of trashed) { await supabase.from("products").delete().eq("id", p.id); } setProducts(products.filter((p) => p.status !== "trashed")); revalidateMyStore(); };

  const handleCsvUpload = async (file: File) => {
    if (!seller) return;
    setCsvUploading(true); setCsvResult("");
    try {
      if (file.size > 10 * 1024 * 1024) { setCsvResult("CSV is too large. Please keep it under 10MB."); return; }
      setCsvResult("Uploading and processing CSV…");
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;
      if (!token) { setCsvResult("Not authenticated. Please refresh and try again."); return; }

      const formData = new FormData();
      formData.append("file", file);
      formData.append("seller_id", seller.id);
      formData.append("access_token", token);
      formData.append("existing_count", String(products.length));

      const resp = await fetch("/api/csv-import", { method: "POST", body: formData });
      const result = await resp.json();

      if (!resp.ok) { setCsvResult(result.error || "Import failed"); return; }

      if (result.products) {
        setProducts((prev) => [...result.products, ...prev]);
      }
      const fmt = result.isShopify ? " (Shopify)" : "";
      const imgInfo = result.imagesUploaded > 0 ? `, ${result.imagesUploaded} images uploaded` : "";
      const imgFail = result.imagesFailed > 0 ? `, ${result.imagesFailed} images failed` : "";
      const planSkip = result.skippedForPlanLimit > 0 ? `, ${result.skippedForPlanLimit} skipped (plan limit reached)` : "";
      setCsvResult(result.added + " product" + (result.added !== 1 ? "s" : "") + " imported" + fmt + (result.errors > 0 ? ", " + result.errors + " skipped (invalid)" : "") + imgInfo + imgFail + planSkip + ".");
      if (result.added > 0) revalidateMyStore();
    } catch (e: any) {
      setCsvResult("Couldn't import CSV: " + (e?.message || "unknown error"));
    } finally {
      setCsvUploading(false);
    }
  };

  if (loading) return <Spinner fullscreen label="Loading dashboard" />;

  const trialActive = seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) > new Date();
  const trialDaysLeft = seller?.trial_ends_at ? Math.max(0, Math.ceil((new Date(seller.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const isSubscribed = seller?.subscription_status === "active";
  const isExpiredTrial = seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) <= new Date();
  const isExpired = seller?.subscription_status === "expired" || isExpiredTrial;
  const isAdmin = seller?.email === "info@4regn.com";

  if (isExpired && typeof window !== "undefined") {
    window.location.href = "/dashboard/billing";
    return (<div style={{ minHeight: "100vh", background: THEME[theme]["--bg"], display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}><p style={{ color: THEME[theme]["--muted"] }}>Redirecting to billing...</p></div>);
  }

  const publishedCount = products.filter((p) => p.status === "published" || !p.status).length;
  const draftCount = products.filter((p) => p.status === "draft").length;
  const trashedCount = products.filter((p) => p.status === "trashed").length;
  const todayOrders = orders.filter((o) => !(o.payment_method === "payfast" && o.payment_status === "pending") && new Date(o.created_at).toDateString() === new Date().toDateString());
  const totalRevenue = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
  const visibleOrders = orders.filter((o) => !(o.payment_method === "payfast" && o.payment_status === "pending"));
  const abandonedOrders = orders.filter((o) => o.payment_method === "payfast" && o.payment_status === "pending");
  const totalImageSlots = existingImages.length + formImages.length;
  const filteredProducts = products.filter((p) => { const status = p.status || "published"; if (status !== productFilter) return false; if (searchQuery) { const q = searchQuery.toLowerCase(); return p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q); } return true; }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  // ── LAUNCH PROGRESS ── "Can this merchant successfully receive an order
  // today?" Everything counted here is required for a real sale; anything
  // that just helps the merchant grow belongs in Grow Your Business instead.
  const hasLogo = !!seller?.logo_url;
  const hasHeroCustomized = !!(storeTagline.trim() || storeDescription.trim() || (storeConfig.hero_title || "").trim());
  const hasBrandColor = storeColor !== "#ff6b35";
  const storeCustomized = hasLogo && hasHeroCustomized && hasBrandColor;
  const hasProduct = products.length > 0;
  const shippingConfigured = checkoutConfig.delivery_enabled || (checkoutConfig.pickup_enabled && !!checkoutConfig.pickup_address.trim());
  const paymentConfigured = (checkoutConfig.eft_enabled && !!checkoutConfig.eft_account_number.trim()) || (checkoutConfig.payfast_enabled && !!checkoutConfig.payfast_merchant_id.trim() && !!checkoutConfig.payfast_merchant_key.trim());
  const testCheckoutPassed = !!storeConfig.test_checkout_passed && hasProduct && shippingConfigured && paymentConfigured;
  const launchSteps = [
    { key: "account", label: "Account Created", done: true },
    { key: "customize", label: "Customize Your Store", done: storeCustomized, tab: "mystore" as TabKey },
    { key: "product", label: "Add First Product", done: hasProduct, tab: "products" as TabKey },
    { key: "shipping", label: "Configure Shipping or Pickup", done: shippingConfigured, tab: "checkout" as TabKey },
    { key: "payment", label: "Configure Payment Method", done: paymentConfigured, tab: "checkout" as TabKey },
    { key: "test", label: "Run Test Checkout", done: testCheckoutPassed },
    { key: "ready", label: "Ready To Sell", done: hasProduct && shippingConfigured && paymentConfigured && testCheckoutPassed },
  ];
  const launchDoneCount = launchSteps.filter((s) => s.done).length;
  const launchPercent = Math.round((launchDoneCount / launchSteps.length) * 100);
  const launchComplete = launchPercent === 100;
  const nextLaunchStep = launchSteps.find((s) => !s.done);
  const goToLaunchStep = (step: typeof launchSteps[number]) => {
    if (!("tab" in step) || !step.tab) return;
    if (step.key === "shipping") setCheckoutView("shipping");
    else if (step.key === "payment") setCheckoutView("payments");
    switchTab(step.tab);
  };
  const healthSignals = [storeCustomized, hasProduct, shippingConfigured, paymentConfigured, testCheckoutPassed];
  const healthScore = Math.round((healthSignals.filter(Boolean).length / healthSignals.length) * 100);

  const runTestCheckout = async () => {
    const issues: string[] = [];
    if (!hasProduct) issues.push("Add at least one product.");
    if (!shippingConfigured) issues.push("Enable delivery, or enable pickup with a pickup address.");
    if (!paymentConfigured) issues.push("Enable EFT with your account number, or enable PayFast with your merchant credentials.");
    if (issues.length > 0) {
      setTestCheckoutResult({ passed: false, issues });
      return;
    }
    setTestCheckoutResult({ passed: true, issues: [] });
    if (seller) {
      const updatedConfig = { ...storeConfig, test_checkout_passed: true };
      setStoreConfig(updatedConfig);
      await supabase.from("sellers").update({ store_config: { ...seller.store_config, test_checkout_passed: true } }).eq("id", seller.id);
      setSeller({ ...seller, store_config: { ...seller.store_config, test_checkout_passed: true } });
    }
  };

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff6b35)";

  // ── SHARED PRESENTATION TOKENS (12 inputs / 16 cards / 100 pills) ──────────
  const inputStyle: React.CSSProperties = { width: "100%", padding: "12px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6, display: "block" };
  const sectionCard: React.CSSProperties = { marginBottom: 24, padding: "24px 20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 };
  const sectionHeaderRow: React.CSSProperties = { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8, gap: 12 };
  // Self-contained enable/disable toggle for a section's own header --
  // replaces the old standalone "Section Visibility" panel.
  const SectionToggle = ({ configKey }: { configKey: "show_announcement" | "show_marquee" | "show_trust_bar" | "show_policies" }) => (
    <button onClick={() => setStoreConfig({ ...storeConfig, [configKey]: !storeConfig[configKey] })} style={{ width: 40, height: 22, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: storeConfig[configKey] ? N : "var(--toggle-off)", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: 16, height: 16, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: storeConfig[configKey] ? 21 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
    </button>
  );
  const sectionLabel: React.CSSProperties = { fontSize: 10, fontWeight: 800, color: "var(--muted-2)", textTransform: "uppercase", letterSpacing: "0.12em", padding: "0 12px", marginBottom: 6 };

  const navSections: { label: string | null; items: { key: TabKey; name: string; icon: DashIconName; count?: number; badge?: string; action?: () => void }[] }[] = [
    { label: null, items: [{ key: "overview", name: "Overview", icon: "overview" }] },
    {
      label: "Launch",
      items: [
        { key: "overview", name: "Launch Progress", icon: "launch", badge: `${launchDoneCount}/${launchSteps.length}` },
      ],
    },
    {
      label: "My Store",
      items: [
        { key: "mystore", name: "My Store", icon: "store" },
        { key: "domains", name: "Domain", icon: "domain" },
        { key: "checkout", name: "Payments", icon: "payment", action: () => { setCheckoutView("payments"); switchTab("checkout"); } },
        { key: "checkout", name: "Shipping", icon: "box", action: () => { setCheckoutView("shipping"); switchTab("checkout"); } },
      ],
    },
    {
      label: "Sell",
      items: [
        { key: "products", name: "Products", icon: "products", count: publishedCount },
        { key: "collections", name: "Collections", icon: "collections", count: storeCollections.length },
        { key: "orders", name: "Orders", icon: "orders", count: visibleOrders.length },
        { key: "abandoned", name: "Abandoned Carts", icon: "cart", count: abandonedOrders.length },
        { key: "discounts", name: "Discounts", icon: "discount", count: discountCodes.length },
      ],
    },
    {
      label: "Design",
      items: [
        { key: "mystore", name: "Themes", icon: "theme", action: () => { switchTab("mystore"); setTemplateOpen(true); } },
      ],
    },
    {
      label: "Grow",
      items: [
        { key: "analytics", name: "Analytics", icon: "analytics" },
        { key: "overview", name: "Share Store", icon: "share", action: () => setShareModalOpen(true) },
        { key: "qrcode", name: "QR Code", icon: "qrcode" },
      ],
    },
  ];
  const storeInitials = (seller?.store_name || "CS").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
  const isFreePlan = seller?.subscription_status === "free";
  const planLimits = isFreePlan
    ? { products: 15, images: 5, collections: 10, templates: 1 }
    : { products: 100, images: 20, collections: 10, templates: 4 };
  const activeProductCount = products.filter((p) => p.status !== "trashed").length;
  const canAddProduct = activeProductCount < planLimits.products;
  const canAddCollection = storeCollections.length < planLimits.collections;
  const maxImages = planLimits.images;

  // ── GROW YOUR BUSINESS ── plan-aware upsell list shown once launch is
  // complete. Pro sellers already have templates/product limits unlocked,
  // so those items are swapped for informational copy instead of an
  // upgrade CTA; a connected custom domain retires the card entirely.
  const domainConnected = !!seller?.custom_domain && seller?.custom_domain_status === "verified";
  const growComplete = !isFreePlan && domainConnected;
  const growItems: { label: string; desc: React.ReactNode; fn: () => void; cta: string }[] = [];
  if (isFreePlan) {
    growItems.push({ label: "Connect Custom Domain", desc: "Use yourstore.co.za instead of the free subdomain", fn: () => router.push("/dashboard/billing"), cta: "Upgrade" });
  } else if (!domainConnected) {
    growItems.push({
      label: "Connect Custom Domain",
      desc: <><i>Since you're on the Pro plan</i> — contact domain support to move from "{seller?.subdomain}.catalogstore.co.za" to your own domain (subject to availability).</>,
      fn: () => switchTab("domains"),
      cta: "Suggested",
    });
  }
  if (isFreePlan) {
    growItems.push({ label: "Unlock Premium Templates", desc: "3 more storefront designs beyond Soft Luxury", fn: () => switchTab("mystore"), cta: "Upgrade" });
  } else {
    growItems.push({ label: "3 More Premium Templates", desc: <>3 more premium templates available. <i>You're on the Pro plan.</i></>, fn: () => { switchTab("mystore"); setTemplateOpen(true); }, cta: "Browse" });
  }
  if (isFreePlan) {
    growItems.push({ label: "Increase Product Limits", desc: "Up to 100 products instead of 15", fn: () => router.push("/dashboard/billing"), cta: "Upgrade" });
    growItems.push({ label: "Additional Product Images", desc: "20 photos per product instead of 5", fn: () => router.push("/dashboard/billing"), cta: "Upgrade" });
  }
  // Fades the card out after ~5 dashboard sessions once launch is complete,
  // or immediately if the seller closes it manually.
  if (typeof window !== "undefined" && launchComplete && !growDismissed && !growSessionCounted.current) {
    growSessionCounted.current = true;
    if (localStorage.getItem("cs_grow_dismissed") !== "1") {
      const seen = parseInt(localStorage.getItem("cs_grow_sessions_seen") || "0", 10) + 1;
      localStorage.setItem("cs_grow_sessions_seen", String(seen));
      if (seen > 5) { localStorage.setItem("cs_grow_dismissed", "1"); setGrowDismissed(true); }
    }
  }
  const dismissGrow = () => { localStorage.setItem("cs_grow_dismissed", "1"); setGrowDismissed(true); };

  return (
    <div data-theme={theme}>
      <style>{`
        [data-theme="dark"] { ${themeVars("dark")} color-scheme: dark; }
        [data-theme="light"] { ${themeVars("light")} color-scheme: light; }
        @media (min-width: 769px) { .mobile-topbar { display: none !important; } .sidebar-overlay { display: none !important; } .sidebar { transform: translateX(0) !important; } .main-content { margin-left: 260px !important; } .desktop-topbar { display: flex !important; } }
        @media (max-width: 768px) { .sidebar { transform: translateX(-100%); } .sidebar.open { transform: translateX(0) !important; } .main-content { margin-left: 0 !important; padding: 16px !important; padding-top: 72px !important; } .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } .form-grid-3 { grid-template-columns: 1fr !important; } .actions-grid { grid-template-columns: 1fr !important; } .quick-actions-grid { grid-template-columns: repeat(2, 1fr) !important; } .overview-panels-grid { grid-template-columns: 1fr !important; } .product-row-inner { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; } .product-actions { flex-wrap: wrap !important; } .templates-grid { grid-template-columns: 1fr !important; } .logo-banner-grid { grid-template-columns: 1fr !important; } }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {orderNotification && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, animation: "slideIn 0.3s ease", width: "90%", maxWidth: 420 }}>
          <div onClick={() => { setTab("orders"); setOrderNotification(null); }} style={{ padding: "16px 20px", background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, backdropFilter: "blur(20px)", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg></div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#22c55e", marginBottom: 2 }}>New Order!</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>#{orderNotification.order_number} — {orderNotification.customer_name}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e", whiteSpace: "nowrap" as const }}>R{orderNotification.total}</div>
            <button onClick={(e) => { e.stopPropagation(); setOrderNotification(null); }} style={{ background: "none", border: "none", color: "var(--muted-2)", fontSize: 18, cursor: "pointer", padding: 4 }}>&times;</button>
          </div>
        </div>
      )}

      <div style={{ minHeight: "100vh", background: "var(--bg)", display: "flex", fontFamily: "'Schibsted Grotesk', sans-serif", color: "var(--text)" }}>

        <div className="mobile-topbar" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "var(--topbar)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid var(--border)" }}>
          <button onClick={() => setSidebarOpen(true)} style={{ width: 40, height: 40, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#9776;</button>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const }}>CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span></div>
          <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ width: 40, height: 40, background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {theme === "dark"
              ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
              : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>}
          </button>
        </div>

        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99 }} />}

        <aside className={"sidebar" + (sidebarOpen ? " open" : "")} style={{ width: 260, borderRight: "1px solid var(--border)", padding: "24px 16px", display: "flex", flexDirection: "column", justifyContent: "space-between", gap: 24, position: "fixed", top: 0, left: 0, bottom: 0, background: "var(--panel-solid)", zIndex: 100, transition: "transform 0.3s ease", overflowY: "auto" as const }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, padding: "0 4px" }}>CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span></div>

            <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px" }}>
              <div style={{ width: 38, height: 38, borderRadius: "50%", background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800, flexShrink: 0 }}>{storeInitials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 800, whiteSpace: "nowrap" as const, overflow: "hidden", textOverflow: "ellipsis" }}>{seller?.store_name || "My Store"}</span>
                  {(seller?.subscription_status === "active" || seller?.subscription_status === "trial") && (
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, fontWeight: 800, color: "#22c55e", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}><span style={{ width: 5, height: 5, borderRadius: "50%", background: "#22c55e" }} />Live</span>
                  )}
                </div>
                {seller?.subdomain && <a href={canonicalStoreUrl(seller.subdomain)} target="_blank" style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 10, color: "var(--muted-2)", textDecoration: "none" }}>{seller.subdomain}.catalogstore.co.za <DashIcon name="external" size={10} /></a>}
              </div>
            </div>

            {isFreePlan && (
              <div style={{ padding: "14px 16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12 }}>
                <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: "var(--muted-2)", marginBottom: 4 }}>Free Plan</div>
                <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10, lineHeight: 1.5 }}>Upgrade to unlock more features and grow your business.</div>
                <a href="/dashboard/billing" style={{ display: "block", padding: "9px 0", background: "transparent", border: "1px solid " + N, borderRadius: 8, color: N, fontSize: 11, fontWeight: 800, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Upgrade Plan</a>
              </div>
            )}

            <nav style={{ display: "flex", flexDirection: "column" }}>
              {navSections.map((section, si) => (
                <div key={si} style={{ marginTop: si === 0 ? 0 : 18, display: "flex", flexDirection: "column", gap: 2 }}>
                  {section.label && <div style={sectionLabel}>{section.label}</div>}
                  {section.items.map((item) => {
                    const active = !item.action && tab === item.key;
                    return (
                      <button key={item.name} onClick={() => { if (item.action) { item.action(); return; } switchTab(item.key); if (item.key === "collections") setSelectedCollection(null); }} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, padding: "9px 12px", background: active ? "rgba(255,107,53,0.08)" : "transparent", border: "none", borderLeft: active ? "2px solid " + N : "2px solid transparent", borderRadius: "0 10px 10px 0", color: active ? "var(--text)" : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: active ? 800 : 600, textAlign: "left" as const, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.05em", transition: "all 0.2s" }}>
                        <span style={{ display: "flex", alignItems: "center", gap: 9 }}><DashIcon name={item.icon} size={14} className="dash-nav-icon" />{item.name}</span>
                        {item.badge && <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 800, background: active ? "rgba(255,107,53,0.15)" : "var(--panel-2)", border: "1px solid " + (active ? "rgba(255,107,53,0.15)" : "var(--border)"), color: active ? N : "var(--muted-2)" }}>{item.badge}</span>}
                        {typeof item.count === "number" && item.count > 0 && <span style={{ padding: "2px 8px", borderRadius: 100, fontSize: 10, fontWeight: 800, background: active ? "rgba(255,107,53,0.15)" : "var(--panel-2)", border: "1px solid " + (active ? "rgba(255,107,53,0.15)" : "var(--border)"), color: active ? N : "var(--muted-2)" }}>{item.count}</span>}
                      </button>
                    );
                  })}
                </div>
              ))}
            </nav>
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <a href="/dashboard/editor" style={{ display: "block", padding: "12px 16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Online Visual Editor</a>
            {seller?.subdomain && <a href={canonicalStoreUrl(seller.subdomain)} target="_blank" style={{ display: "block", padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 12, color: N, fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>View My Store</a>}
            <a href="/dashboard/billing" style={{ display: "block", padding: "12px 16px", background: seller?.subscription_status === "active" ? "rgba(34,197,94,0.06)" : seller?.subscription_status === "trial" ? "rgba(251,191,36,0.06)" : seller?.subscription_status === "past_due" ? "rgba(251,191,36,0.1)" : "rgba(255,107,53,0.06)", border: seller?.subscription_status === "active" ? "1px solid rgba(34,197,94,0.12)" : seller?.subscription_status === "trial" ? "1px solid rgba(251,191,36,0.12)" : seller?.subscription_status === "past_due" ? "1px solid rgba(251,191,36,0.3)" : "1px solid rgba(255,107,53,0.12)", borderRadius: 12, textDecoration: "none", textAlign: "center" as const }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: seller?.subscription_status === "active" ? "#22c55e" : seller?.subscription_status === "trial" ? "#fbbf24" : seller?.subscription_status === "past_due" ? "#fbbf24" : "#ff6b35" }}>{seller?.subscription_status === "active" ? "Active Plan" : seller?.subscription_status === "trial" ? "Free Trial" : seller?.subscription_status === "past_due" ? "Payment Failed" : "Inactive"}</div>
              <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 2 }}>{seller?.subscription_status === "active" ? "Click to view plan or upgrade" : seller?.subscription_status === "trial" ? "Click to choose a plan" : seller?.subscription_status === "past_due" ? "Update card before store goes offline" : "Click to reactivate or upgrade"}</div>
            </a>
            {seller?.email === "info@4regn.com" && <a href="/admin" style={{ display: "block", padding: "12px 16px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)", borderRadius: 12, color: "#8b5cf6", fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Admin Panel</a>}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginTop: 4 }}>
              <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ display: "flex", alignItems: "center", gap: 8, padding: "9px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                {theme === "dark"
                  ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
                  : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>}
                {theme === "dark" ? "Dark Mode" : "Light Mode"}
              </button>
              <button onClick={handleLogout} style={{ padding: "9px 14px", background: "transparent", border: "none", color: "var(--muted-2)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Log Out</button>
            </div>
          </div>
        </aside>

        <main className="main-content" style={{ flex: 1, marginLeft: 260, padding: "36px 40px" }}>

          <div className="desktop-topbar" style={{ display: "none", alignItems: "center", justifyContent: "flex-end", gap: 10, marginBottom: 28 }}>
            <button onClick={toggleTheme} title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"} style={{ height: 38, padding: "0 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", cursor: "pointer", display: "flex", alignItems: "center", gap: 7, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
              {theme === "dark"
                ? <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
                : <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" /></svg>}
              {theme === "dark" ? "Dark Mode" : "Light Mode"}
            </button>
            <div style={{ position: "relative", width: 38, height: 38, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--muted)", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <DashIcon name="bell" size={16} />
              {orderNotification && <span style={{ position: "absolute", top: 7, right: 7, width: 7, height: 7, borderRadius: "50%", background: N, border: "1.5px solid var(--panel)" }} />}
            </div>
            <div style={{ position: "relative" }}>
              <button onClick={() => setProfileMenuOpen((v) => !v)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px 6px 6px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 100, cursor: "pointer" }}>
                <span style={{ width: 26, height: 26, borderRadius: "50%", background: G, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>{storeInitials}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: "var(--text)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{seller?.store_name || "My Store"}</span>
                <DashIcon name="chevron-down" size={12} className="dash-muted-icon" />
              </button>
              {profileMenuOpen && (
                <>
                  <div onClick={() => setProfileMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 149 }} />
                  <div style={{ position: "absolute", top: "calc(100% + 8px)", right: 0, width: 180, background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 12, boxShadow: "0 12px 32px rgba(0,0,0,0.18)", zIndex: 150, overflow: "hidden" }}>
                    <button onClick={() => { setProfileMenuOpen(false); switchTab("mystore"); }} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: "none", border: "none", color: "var(--text)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" as const }}><DashIcon name="settings" size={13} /> Settings</button>
                    <button onClick={handleLogout} style={{ width: "100%", display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", background: "none", border: "none", borderTop: "1px solid var(--border)", color: "var(--muted)", fontSize: 12, fontWeight: 600, cursor: "pointer", textAlign: "left" as const }}><DashIcon name="external" size={13} /> Log Out</button>
                  </div>
                </>
              )}
            </div>
          </div>

          {trialActive && !isSubscribed && (
            <a href="/dashboard/billing" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 12, marginBottom: 24, textDecoration: "none", flexWrap: "wrap" as const, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>
                <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left on your free trial</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>- Subscribe now to keep your store live</span>
              </div>
              <span style={{ padding: "6px 16px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 100, fontSize: 11, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Subscribe</span>
            </a>
          )}

          {isFreePlan && (
            <a href="/dashboard/billing" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 24, textDecoration: "none", flexWrap: "wrap" as const, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                <span style={{ fontSize: 13, color: "var(--text)", fontWeight: 700 }}>You're on the Free plan</span>
                <span style={{ fontSize: 12, color: "var(--muted)" }}>- {activeProductCount}/{planLimits.products} products used - Upgrade for more products, templates & a custom domain</span>
              </div>
              <span style={{ padding: "6px 16px", background: G, borderRadius: 100, fontSize: 11, fontWeight: 800, color: "#fff", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Upgrade</span>
            </a>
          )}

          {tab === "overview" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Overview</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Welcome back, {seller?.store_name} — here's a quick look at your store.</p>

            <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--muted-2)", marginBottom: 12 }}>Quick Actions</h3>
            <div className="quick-actions-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 12, marginBottom: 24 }}>
              {[
                { icon: "products" as DashIconName, label: "Add Product", fn: () => { switchTab("products"); resetForm(); setShowForm(true); } },
                { icon: "orders" as DashIconName, label: "View Orders", fn: () => switchTab("orders") },
                { icon: "store" as DashIconName, label: "Edit My Store", fn: () => switchTab("mystore") },
                { icon: "share" as DashIconName, label: "Share Store", fn: () => setShareModalOpen(true) },
                { icon: "analytics" as DashIconName, label: "Analytics", fn: () => switchTab("analytics") },
              ].map((a, i) => (
                <button key={i} onClick={a.fn} style={{ padding: "18px 10px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, color: "var(--text)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textTransform: "uppercase" as const, letterSpacing: "0.03em" }}>
                  <span style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(255,107,53,0.1)", color: N, display: "flex", alignItems: "center", justifyContent: "center" }}><DashIcon name={a.icon} size={17} /></span>
                  <span>{a.label}</span>
                </button>
              ))}
            </div>

            <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.08em", color: "var(--muted-2)", marginBottom: 12 }}>Today's Overview</h3>
            <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 24 }}>
              {[{ n: publishedCount, l: "Published" }, { n: visibleOrders.length, l: "Total Orders" }, { n: todayOrders.length, l: "Orders Today" }, { n: "R" + totalRevenue.toFixed(0), l: "Revenue", c: N }].map((s, i) => (
                <div key={i} style={{ padding: 20, background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
                  <div style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: s.c || "var(--text)" }}>{s.n}</div>
                  <div style={{ fontSize: 10, color: "var(--muted-2)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
                </div>
              ))}
            </div>

            {launchComplete && !growComplete && !growDismissed && (
              <div style={{ marginBottom: 24, padding: "24px 20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 16 }}>
                  <span style={{ width: 46, height: 46, borderRadius: 14, background: "rgba(255,107,53,0.1)", color: N, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <DashIcon name="sparkle" size={22} stroke={1.6} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 2 }}>Grow Your Business</h3>
                    <p style={{ fontSize: 12, color: "var(--muted-2)" }}>You're ready to sell. Here's how to grow from here — none of this is required.</p>
                  </div>
                  <button onClick={dismissGrow} title="Dismiss" style={{ width: 28, height: 28, flexShrink: 0, background: "transparent", border: "1px solid var(--border)", borderRadius: "50%", color: "var(--muted-2)", cursor: "pointer", fontSize: 15, lineHeight: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  {growItems.map((item) => (
                    <button key={item.label} onClick={item.fn} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", textAlign: "left" as const, gap: 12 }}>
                      <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{item.label}</div><div style={{ fontSize: 11, color: "var(--muted-2)" }}>{item.desc}</div></div>
                      <span style={{ fontSize: 11, color: N, fontWeight: 800, textTransform: "uppercase" as const, flexShrink: 0, marginLeft: 12, whiteSpace: "nowrap" as const }}>{item.cta} &rarr;</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="overview-panels-grid" style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16, marginBottom: 24 }}>
              <div style={{ padding: "20px 18px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Launch Progress</h3>
                  <span style={{ fontSize: 12, fontWeight: 900, color: N }}>{launchPercent}%</span>
                </div>
                <div style={{ height: 6, borderRadius: 100, background: "var(--toggle-off)", overflow: "hidden", marginBottom: 14 }}>
                  <div style={{ height: "100%", width: `${launchPercent}%`, background: G, borderRadius: 100, transition: "width 0.3s" }} />
                </div>
                {nextLaunchStep && (
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" as const, padding: "12px 14px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.18)", borderRadius: 12, marginBottom: 14 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 9, fontWeight: 800, color: N, textTransform: "uppercase" as const, letterSpacing: "0.08em", marginBottom: 3 }}>Next Step</div>
                      <div style={{ fontSize: 13, fontWeight: 700 }}>{nextLaunchStep.label}</div>
                    </div>
                    <button onClick={() => { if (nextLaunchStep.key === "test") runTestCheckout(); else goToLaunchStep(nextLaunchStep); }} style={{ padding: "8px 16px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 10, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const, flexShrink: 0 }}>
                      {nextLaunchStep.key === "test" ? "Run Test" : "Continue"}
                    </button>
                  </div>
                )}
                <div>
                  {launchSteps.map((step) => (
                    <div key={step.key} style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 0", borderBottom: "1px solid var(--border)" }}>
                      <span style={{ width: 18, height: 18, borderRadius: "50%", background: step.done ? "#22c55e" : "var(--toggle-off)", color: step.done ? "#fff" : "var(--muted-2)", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 900 }}>{step.done ? "✓" : ""}</span>
                      <span style={{ flex: 1, fontSize: 12, fontWeight: 600, color: step.done ? "var(--muted)" : "var(--text)" }}>{step.label}</span>
                      {!step.done && step.key === "test" && (
                        <button onClick={runTestCheckout} style={{ padding: "5px 12px", background: N, color: "#fff", border: "none", borderRadius: 100, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Run</button>
                      )}
                      {!step.done && "tab" in step && step.tab && (
                        <button onClick={() => goToLaunchStep(step)} style={{ padding: "5px 12px", background: "transparent", border: "1px solid " + N, color: N, borderRadius: 100, fontSize: 10, fontWeight: 800, cursor: "pointer" }}>Set Up</button>
                      )}
                    </div>
                  ))}
                </div>
                {testCheckoutResult && (
                  <div style={{ marginTop: 12, padding: "12px 14px", background: testCheckoutResult.passed ? "rgba(34,197,94,0.06)" : "rgba(255,107,53,0.06)", border: "1px solid " + (testCheckoutResult.passed ? "rgba(34,197,94,0.2)" : "rgba(255,107,53,0.2)"), borderRadius: 12 }}>
                    {testCheckoutResult.passed ? (
                      <div style={{ fontSize: 12, fontWeight: 700, color: "#22c55e" }}>Test checkout passed — your store is ready to receive an order.</div>
                    ) : (
                      <>
                        <div style={{ fontSize: 12, fontWeight: 700, color: N, marginBottom: 6 }}>Not quite ready yet:</div>
                        <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: "var(--muted)" }}>
                          {testCheckoutResult.issues.map((issue, i) => <li key={i} style={{ marginBottom: 3 }}>{issue}</li>)}
                        </ul>
                      </>
                    )}
                  </div>
                )}
              </div>

              <div style={{ padding: "20px 18px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, display: "flex", flexDirection: "column" as const, alignItems: "center" }}>
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 14, alignSelf: "flex-start" }}>Store Health</h3>
                <div style={{ position: "relative" as const, width: 120, height: 120, marginBottom: 14 }}>
                  <svg width="120" height="120" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="50" fill="none" stroke="var(--toggle-off)" strokeWidth="10" />
                    <circle cx="60" cy="60" r="50" fill="none" stroke={N} strokeWidth="10" strokeLinecap="round" strokeDasharray={2 * Math.PI * 50} strokeDashoffset={2 * Math.PI * 50 * (1 - healthScore / 100)} transform="rotate(-90 60 60)" style={{ transition: "stroke-dashoffset 0.3s" }} />
                  </svg>
                  <div style={{ position: "absolute" as const, top: 0, left: 0, right: 0, bottom: 0, display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center" }}>
                    <span style={{ fontSize: 26, fontWeight: 900, letterSpacing: "-0.03em" }}>{healthScore}%</span>
                    <span style={{ fontSize: 9, color: "var(--muted-2)", textTransform: "uppercase" as const, letterSpacing: "0.06em", fontWeight: 700 }}>{healthScore === 100 ? "Healthy" : healthScore >= 60 ? "Good" : "Needs Work"}</span>
                  </div>
                </div>
                <p style={{ fontSize: 11, color: "var(--muted-2)", textAlign: "center" as const }}>
                  {healthScore === 100 ? "Everything's set up and running smoothly." : `${healthSignals.filter(Boolean).length} of ${healthSignals.length} checks passing.`}
                </p>
              </div>
            </div>
          </div>)}

          {tab === "products" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Products</h1><p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>Manage the products in your store.</p></div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <button onClick={() => { if (!canAddProduct) { alert(`You've reached your plan limit of ${planLimits.products} products.` + (isFreePlan ? " Upgrade to Pro for up to 100 products." : "")); return; } if (showForm) resetForm(); else { resetForm(); setShowForm(true); setProductFilter("published"); } }} style={{ padding: "12px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const }}>{showForm ? "Cancel" : "+ Add Product"}</button>
                <label style={{ padding: "12px 18px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: 100, color: "#2563eb", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {csvUploading ? "Importing..." : "Import CSV"}
                  <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); e.target.value = ""; }} style={{ display: "none" }} />
                </label>
              </div>
            </div>

            {csvResult && (
              <div style={{ padding: "14px 18px", background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#2563eb", fontWeight: 600 }}>{csvResult}</span>
                <button onClick={() => setCsvResult("")} style={{ background: "none", border: "none", color: "var(--muted-2)", cursor: "pointer", fontSize: 14 }}>&times;</button>
              </div>
            )}

            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" as const }}>
              {([{ key: "published" as const, label: "Published", count: publishedCount }, { key: "draft" as const, label: "Drafts", count: draftCount }, { key: "trashed" as const, label: "Trash", count: trashedCount }]).map((f) => (
                <button key={f.key} onClick={() => { setProductFilter(f.key); setSearchQuery(""); }} style={{ padding: "8px 16px", background: productFilter === f.key ? "rgba(255,107,53,0.08)" : "var(--panel)", border: productFilter === f.key ? "1px solid rgba(255,107,53,0.15)" : "1px solid var(--border)", borderRadius: 100, color: productFilter === f.key ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "flex", gap: 6, alignItems: "center" }}>
                  {f.label} <span style={{ background: productFilter === f.key ? "rgba(255,107,53,0.15)" : "var(--border)", padding: "2px 8px", borderRadius: 100, fontSize: 10 }}>{f.count}</span>
                </button>
              ))}
            </div>

            <div style={{ marginBottom: 20, display: "flex", gap: 12, flexWrap: "wrap" as const, alignItems: "center" }}>
              <input type="text" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", maxWidth: 400, padding: "11px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
              {selectedProductIds.size > 0 && (
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 8px 8px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 100 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: N }}>{selectedProductIds.size} selected</span>
                  <button onClick={() => setShowBulkPrice(true)} style={{ padding: "8px 16px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Bulk Edit Prices</button>
                  <button onClick={() => setSelectedProductIds(new Set())} style={{ padding: "8px 12px", background: "transparent", border: "none", color: "var(--muted)", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Clear</button>
                </div>
              )}
            </div>

            {productFilter === "trashed" && trashedCount > 0 && (
              <div style={{ marginBottom: 16 }}>
                <button onClick={emptyTrash} style={{ padding: "8px 18px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 100, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Empty Trash</button>
              </div>
            )}

            {showForm && (<div style={{ padding: "24px 20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 16 }}>{editingId ? "Edit Product" : "New Product"}</h3>
              <form onSubmit={handleSubmit}>

                {/* 1. PHOTOS FIRST */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Product Photos (max {maxImages})</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {[...existingImages.map((url, i) => ({ type: "existing" as const, src: url, idx: i })), ...formPreviews.map((p, i) => ({ type: "new" as const, src: p, idx: i }))].map((img, combinedIdx) => (
                      <div
                        key={img.type + img.idx}
                        data-imgidx={combinedIdx}
                        draggable
                        onDragStart={(e) => { setDragImgIdx(combinedIdx); e.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; }}
                        onDrop={(e) => { e.preventDefault(); if (dragImgIdx !== null && dragImgIdx !== combinedIdx) reorderImages(dragImgIdx, combinedIdx); setDragImgIdx(null); }}
                        onDragEnd={() => setDragImgIdx(null)}
                        onTouchStart={() => setDragImgIdx(combinedIdx)}
                        onTouchMove={handleTouchMove}
                        onTouchEnd={handleTouchEnd}
                        style={{ width: 80, height: 80, borderRadius: 12, overflow: "hidden", position: "relative" as const, border: (dragImgIdx === combinedIdx || touchDropIdx === combinedIdx) ? "2px solid " + N : "1px solid var(--border)", cursor: "grab", opacity: dragImgIdx === combinedIdx ? 0.5 : 1, transition: "opacity 0.15s, border-color 0.15s", touchAction: "none" }}
                      >
                        <img src={img.src} alt="" draggable={false} style={{ width: "100%", height: "100%", objectFit: "cover" as const, pointerEvents: "none" }} />
                        <button type="button" onClick={() => img.type === "existing" ? removeExistingImage(img.idx) : removeNewImage(img.idx)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>
                        {combinedIdx === 0 ? (
                          <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>
                        ) : (
                          <button type="button" onClick={() => reorderImages(combinedIdx, 0)} title="Set as main image" style={{ position: "absolute" as const, bottom: 3, left: 3, right: 3, padding: "1px 4px", background: "rgba(0,0,0,0.65)", border: "none", color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const, cursor: "pointer", whiteSpace: "nowrap" as const, overflow: "hidden" as const, textOverflow: "ellipsis" as const }}>Set Main</button>
                        )}
                      </div>
                    ))}
                    {totalImageSlots < maxImages && (<button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 12, border: "1px dashed var(--border)", background: "var(--panel)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 2 }}><span style={{ fontSize: 20, color: "var(--muted-2)" }}>+</span><span style={{ fontSize: 9, color: "var(--muted-2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Photo</span></button>)}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                  </div>
                  <p style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 6 }}>Drag photos to reorder. First photo is the main product image.</p>
                </div>

                {/* 2. NAME & 3. PRICE */}
                <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Product Name</label>
                    <input type="text" placeholder="e.g. Oversized Graphic Tee" value={formName} onChange={(e) => setFormName(e.target.value)} required style={inputStyle} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ ...labelStyle, marginBottom: 0 }}>Selling Price (R)</label>
                    <input type="number" placeholder="e.g. 299" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={inputStyle} />
                    <input type="number" placeholder="Original price e.g. 399 (shows crossed out)" value={formComparePrice} onChange={(e) => setFormComparePrice(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: "var(--panel)", border: "1px dashed var(--border)", borderRadius: 12, color: "var(--muted)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                    {formComparePrice && parseFloat(formComparePrice) > parseFloat(formPrice || "0") && (
                      <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>{Math.round((1 - parseFloat(formPrice) / parseFloat(formComparePrice)) * 100)}% off — <span style={{ textDecoration: "line-through", color: "var(--muted-2)" }}>R{formComparePrice}</span> → R{formPrice}</span>
                    )}
                  </div>
                </div>

                {/* 4. VARIANTS */}
                <div style={{ marginBottom: 20, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Variants (optional)</label>
                  {formVariants.length === 0 && (<div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 16, flexWrap: "wrap" as const }}>{PRESET_VARIANTS.map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={{ padding: "8px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={{ padding: "8px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Custom</button></div>)}
                  {formVariants.map((v, vi) => (<div key={vi} style={{ padding: "14px 16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 10, marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" as const, gap: 8 }}>
                      <input type="text" placeholder="Variant name" value={v.name} onChange={(e) => updateVariantName(vi, e.target.value)} style={{ padding: "10px 12px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 13, fontWeight: 700, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", maxWidth: 200 }} />
                      <button type="button" onClick={() => removeVariant(vi)} style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const }}>Remove</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                      {v.options.map((o, oi) => (<div key={oi} style={{ display: "flex", alignItems: "center", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}><input type="text" placeholder="e.g. Large" value={o} onChange={(e) => updateVariantOption(vi, oi, e.target.value)} style={{ width: 80, padding: "8px 10px", background: "transparent", border: "none", color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />{v.options.length > 1 && <button type="button" onClick={() => removeVariantOption(vi, oi)} style={{ padding: 8, background: "transparent", border: "none", borderLeft: "1px solid var(--border)", color: "var(--muted-2)", fontSize: 10, cursor: "pointer" }}>&#10005;</button>}</div>))}
                      <button type="button" onClick={() => addVariantOption(vi)} style={{ padding: "8px 12px", background: "transparent", border: "1px dashed var(--border)", borderRadius: 8, color: "var(--muted-2)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>+ Add</button>
                    </div>
                    {v.options.some((o) => o.trim()) && (
                      <div style={{ marginTop: 12, padding: "12px", background: "var(--panel)", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Price adjustment per {v.name} option</div>
                        <p style={{ fontSize: 10, color: "var(--muted-2)", marginBottom: 8 }}>Optional. Adds to the base price when a customer picks that option — leave at 0 for no change.</p>
                        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                          {v.options.filter((o) => o.trim()).map((opt, oi) => (
                            <div key={oi} style={{ display: "flex", alignItems: "center", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, overflow: "hidden" }}>
                              <span style={{ padding: "8px 0 8px 10px", fontSize: 11, color: "var(--muted)", fontWeight: 600 }}>{opt}</span>
                              <span style={{ padding: "8px 2px 8px 8px", fontSize: 11, color: "var(--muted-2)" }}>+R</span>
                              <input
                                type="number"
                                step="0.01"
                                placeholder="0"
                                value={v.priceDelta?.[opt] ?? ""}
                                onChange={(e) => {
                                  const u = [...formVariants];
                                  if (!u[vi].priceDelta) u[vi].priceDelta = {};
                                  const n = parseFloat(e.target.value);
                                  u[vi].priceDelta![opt] = Number.isFinite(n) ? n : 0;
                                  setFormVariants(u);
                                }}
                                style={{ width: 60, padding: "8px 10px 8px 0", background: "transparent", border: "none", color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(existingImages.length > 0 || formPreviews.length > 0) && v.options.some((o) => o.trim()) && (
                      <div style={{ marginTop: 12, padding: "12px", background: "var(--panel)", borderRadius: 8, border: "1px solid var(--border)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Assign images to {v.name} options</div>
                        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                          {v.options.filter((o) => o.trim()).map((opt, oi) => {
                            const allImgs = [...existingImages, ...formPreviews];
                            const currentImg = v.images?.[opt] || "";
                            return (
                              <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: "var(--muted)", minWidth: 60, fontWeight: 600 }}>{opt}</span>
                                <div style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto" as const }}>
                                  <div onClick={() => { const u = [...formVariants]; if (!u[vi].images) u[vi].images = {}; u[vi].images![opt] = ""; setFormVariants(u); }} style={{ width: 36, height: 36, borderRadius: 6, border: !currentImg ? "2px solid " + N : "1px solid var(--border)", background: "var(--panel)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 8, color: "var(--muted-2)" }}>None</div>
                                  {allImgs.map((img, imgIdx) => (<img key={imgIdx} src={img} alt="" onClick={() => { const u = [...formVariants]; if (!u[vi].images) u[vi].images = {}; u[vi].images![opt] = img; setFormVariants(u); }} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" as const, cursor: "pointer", border: currentImg === img ? "2px solid " + N : "1px solid var(--border)", flexShrink: 0, opacity: currentImg === img ? 1 : 0.5 }} />))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>))}
                  {formVariants.length > 0 && (<div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" as const }}>{PRESET_VARIANTS.filter((p) => !formVariants.some((v) => v.name.toLowerCase() === p.name.toLowerCase())).map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={{ padding: "8px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={{ padding: "8px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Custom</button></div>)}
                </div>

                {/* 5. DESCRIPTION */}
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: "block", fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, marginBottom: 8 }}>Description (optional)</label>
                  <textarea
                    placeholder="Tell shoppers about this piece — fabric, fit, story, anything that helps them decide."
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    rows={5}
                    style={{ ...inputStyle, resize: "vertical" as const, lineHeight: 1.5 }}
                  />
                </div>

                {/* 6. COLLECTION with auto-create */}
                <div style={{ marginBottom: 20 }}>
                  <label style={labelStyle}>Collection</label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ ...inputStyle, appearance: "none" as const, WebkitAppearance: "none" as const }}>
                    <option value="" style={{ background: "var(--panel-solid)" }}>No collection</option>
                    {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "var(--panel-solid)" }}>{c}</option>))}
                    <option value="__new__" style={{ background: "var(--panel-solid)", color: "#ff6b35" }}>+ Create new collection...</option>
                  </select>
                  {(formCategory === "" || formCategory === "__new__") && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input type="text" id="new-col-input" placeholder="Type new collection name + press Enter"
                        style={{ flex: 1, padding: "9px 12px", background: "var(--input-bg)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return;
                          const name = e.currentTarget.value.trim();
                          if (!name || storeCollections.includes(name) || !seller) return;
                          const updated = [...storeCollections, name];
                          setStoreCollections(updated);
                          await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                          setSeller({ ...seller, collections: updated });
                          setFormCategory(name);
                          e.currentTarget.value = "";
                          revalidateMyStore();
                        }}
                      />
                      <button type="button" onClick={async () => {
                        const input = document.getElementById("new-col-input") as HTMLInputElement;
                        const name = input?.value.trim();
                        if (!name || storeCollections.includes(name) || !seller) return;
                        const updated = [...storeCollections, name];
                        setStoreCollections(updated);
                        await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                        setSeller({ ...seller, collections: updated });
                        setFormCategory(name);
                        if (input) input.value = "";
                        revalidateMyStore();
                      }} style={{ padding: "9px 14px", background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>+ Create</button>
                    </div>
                  )}
                </div>

                {uploadProgress && <div style={{ marginTop: 12, fontSize: 12, color: N }}>{uploadProgress}</div>}
                {/* 7. SAVE */}
                <button type="submit" disabled={formSaving} style={{ width: "100%", padding: "14px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: formSaving ? "not-allowed" : "pointer", opacity: formSaving ? 0.6 : 1, marginTop: 8, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{formSaving ? "Saving..." : editingId ? "Save Changes" : "Save Product"}</button>
              </form>
            </div>)}

            {filteredProducts.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--muted)" }}>
                <p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>{productFilter === "trashed" ? "Trash is empty" : productFilter === "draft" ? "No drafts" : searchQuery ? "No results" : "No products yet"}</p>
                <p style={{ fontSize: 13, color: "var(--muted-2)" }}>{productFilter === "trashed" ? "Products you delete will appear here for recovery." : productFilter === "draft" ? "Draft products won't be visible to customers." : searchQuery ? "Try a different search term." : "Add your first product to get your store going."}</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {filteredProducts.map((product) => (
                  <div key={product.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, flexWrap: "wrap" as const, gap: 12, opacity: product.status === "trashed" ? 0.6 : 1 }} className="product-row-inner">
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      {productFilter !== "trashed" && (
                        <input type="checkbox" checked={selectedProductIds.has(product.id)} onChange={() => toggleProductSelected(product.id)} style={{ width: 16, height: 16, flexShrink: 0, cursor: "pointer", accentColor: N }} />
                      )}
                      {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" as const, border: "1px solid var(--border)", flexShrink: 0 }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--panel)", border: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 16, color: "var(--muted-2)" }}>&#9633;</span></div>}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{product.name}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--muted-2)", textTransform: "uppercase" as const, letterSpacing: "0.04em", fontWeight: 600, flexWrap: "wrap" as const }}>
                          {product.category && <span>{product.category}</span>}
                          {product.status === "draft" && <span style={{ color: "#fbbf24" }}>Draft</span>}
                          {product.status !== "trashed" && <span style={{ color: product.in_stock ? N : "#ff6b35" }}>{product.in_stock ? "In Stock" : "Sold Out"}</span>}
                          {product.images?.length > 0 && <span>{product.images.length} photo{product.images.length !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em", whiteSpace: "nowrap" as const, color: product.old_price ? N : "var(--text)" }}>R{product.price}</div>
                      {product.old_price && <div style={{ fontSize: 11, color: "var(--muted-2)", textDecoration: "line-through", whiteSpace: "nowrap" as const }}>R{product.old_price}</div>}
                    </div>
                    <div className="product-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                      {productFilter === "trashed" ? (
                        <><button onClick={() => restoreProduct(product.id)} style={{ padding: "7px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Restore</button>
                        <button onClick={() => deleteForever(product.id)} style={{ padding: "7px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Delete Forever</button></>
                      ) : (
                        <><div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                          <button onClick={() => reorderProduct(product.id, "up")} style={{ width: 22, height: 18, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--muted-2)", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u25B2"}</button>
                          <button onClick={() => reorderProduct(product.id, "down")} style={{ width: 22, height: 18, background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 4, color: "var(--muted-2)", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u25BC"}</button>
                        </div>
                        <button onClick={() => startEdit(product)} style={{ padding: "7px 12px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Edit</button>
                        <button onClick={() => duplicateProduct(product)} style={{ padding: "7px 12px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Duplicate</button>
                        <button onClick={() => toggleDraft(product.id, product.status || "published")} style={{ padding: "7px 12px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: product.status === "draft" ? "#fbbf24" : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{product.status === "draft" ? "Publish" : "Draft"}</button>
                        <button onClick={() => toggleStock(product.id, product.in_stock)} style={{ padding: "7px 12px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{product.in_stock ? "Sold Out" : "In Stock"}</button>
                        <button onClick={() => trashProduct(product.id)} style={{ padding: "7px 12px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Trash</button></>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {showBulkPrice && (
              <div onClick={() => setShowBulkPrice(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
                <div onClick={(e) => e.stopPropagation()} style={{ background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 20, maxWidth: 420, width: "100%", padding: "28px 24px" }}>
                  <h3 style={{ fontSize: 16, fontWeight: 900, textTransform: "uppercase" as const, letterSpacing: "-0.02em", marginBottom: 4 }}>Bulk Edit Prices</h3>
                  <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>Applies to {selectedProductIds.size} selected product{selectedProductIds.size !== 1 ? "s" : ""}.</p>

                  <label style={{ ...labelStyle, marginBottom: 8 }}>Adjustment type</label>
                  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                    {([{ key: "percent", label: "Percentage" }, { key: "flat", label: "Flat Amount" }, { key: "set", label: "Set Price" }] as const).map((m) => (
                      <button key={m.key} onClick={() => setBulkMode(m.key)} style={{ flex: 1, padding: "10px 8px", background: bulkMode === m.key ? "rgba(255,107,53,0.1)" : "var(--panel)", border: bulkMode === m.key ? "1px solid rgba(255,107,53,0.3)" : "1px solid var(--border)", borderRadius: 10, color: bulkMode === m.key ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{m.label}</button>
                    ))}
                  </div>

                  {bulkMode !== "set" && (
                    <>
                      <label style={{ ...labelStyle, marginBottom: 8 }}>Direction</label>
                      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                        {([{ key: "increase", label: "Increase" }, { key: "decrease", label: "Decrease" }] as const).map((d) => (
                          <button key={d.key} onClick={() => setBulkDirection(d.key)} style={{ flex: 1, padding: "10px 8px", background: bulkDirection === d.key ? "rgba(255,107,53,0.1)" : "var(--panel)", border: bulkDirection === d.key ? "1px solid rgba(255,107,53,0.3)" : "1px solid var(--border)", borderRadius: 10, color: bulkDirection === d.key ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>{d.label}</button>
                        ))}
                      </div>
                    </>
                  )}

                  <label style={labelStyle}>{bulkMode === "percent" ? "Percentage (%)" : bulkMode === "flat" ? "Amount (R)" : "New price (R)"}</label>
                  <input type="number" min="0" step="0.01" value={bulkValue} onChange={(e) => setBulkValue(e.target.value)} placeholder={bulkMode === "percent" ? "e.g. 10" : "e.g. 50"} style={inputStyle} />

                  <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
                    <button onClick={() => setShowBulkPrice(false)} style={{ flex: 1, padding: "12px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>Cancel</button>
                    <button onClick={applyBulkPrice} disabled={bulkApplying || !bulkValue} style={{ flex: 1, padding: "12px", background: G, border: "none", borderRadius: 100, color: "#fff", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: bulkApplying || !bulkValue ? "not-allowed" : "pointer", opacity: bulkApplying || !bulkValue ? 0.6 : 1, textTransform: "uppercase" as const }}>{bulkApplying ? "Applying..." : "Apply"}</button>
                  </div>
                </div>
              </div>
            )}
          </div>)}

          {tab === "collections" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Collections</h1><p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Organize your products into collections for your storefront.</p></div>
              {selectedCollection && <button onClick={() => setSelectedCollection(null)} style={{ padding: "10px 20px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>&larr; All Collections</button>}
            </div>
            {selectedCollection ? (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" as const, marginBottom: 4 }}>{selectedCollection}</h2>
                <p style={{ fontSize: 13, color: "var(--muted-2)", marginBottom: 20 }}>{products.filter((p) => productInCat(selectedCollection!, p) && (p.status || "published") !== "trashed").length} products in this collection</p>
                <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" as const }}>
                  {[{ k: "manual", l: "Manual" }, { k: "az", l: "A-Z" }, { k: "za", l: "Z-A" }, { k: "latest", l: "Latest" }, { k: "oldest", l: "Oldest" }, { k: "price-asc", l: "Price Low" }, { k: "price-desc", l: "Price High" }].map((s) => (
                    <button key={s.k} onClick={() => setProductSort(s.k)} style={{ padding: "6px 14px", borderRadius: 100, background: productSort === s.k ? "rgba(255,107,53,0.08)" : "var(--panel)", border: productSort === s.k ? "1px solid rgba(255,107,53,0.15)" : "1px solid var(--border)", color: productSort === s.k ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>{s.l}</button>
                  ))}
                </div>
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12, color: N }}>Products in Collection</h3>
                {(() => {
                  let inCollection = products.filter((p) => productInCat(selectedCollection!, p) && (p.status || "published") !== "trashed");
                  if (productSort === "az") inCollection.sort((a, b) => a.name.localeCompare(b.name));
                  else if (productSort === "za") inCollection.sort((a, b) => b.name.localeCompare(a.name));
                  else if (productSort === "price-asc") inCollection.sort((a, b) => a.price - b.price);
                  else if (productSort === "price-desc") inCollection.sort((a, b) => b.price - a.price);
                  return inCollection.length === 0 ? <p style={{ fontSize: 13, color: "var(--muted-2)", padding: "20px 0" }}>No products in this collection yet.</p> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 24 }}>
                      {inCollection.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--input-bg)" }} />}
                            <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>{p.name}</div><div style={{ fontSize: 11, color: "var(--muted-2)" }}>R{p.price}</div></div>
                          </div>
                          <button onClick={async () => { const updated = removeCat(p.category, selectedCollection!); await supabase.from("products").update({ category: updated }).eq("id", p.id); setProducts(products.map((x) => x.id === p.id ? { ...x, category: updated } : x)); revalidateMyStore(); }} style={{ padding: "6px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>Add Products</h3>
                {(() => {
                  const available = products.filter((p) => !productInCat(selectedCollection!, p) && (p.status || "published") !== "trashed");
                  return available.length === 0 ? <p style={{ fontSize: 13, color: "var(--muted-2)" }}>All products are already in this collection.</p> : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {available.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "var(--input-bg)" }} />}
                            <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>{p.name}</div><div style={{ fontSize: 11, color: "var(--muted-2)" }}>{p.category ? "In: " + p.category.split(",").map(c => c.trim()).filter(Boolean).join(", ") : "No collection"}</div></div>
                          </div>
                          <button onClick={async () => { const updated = addCat(p.category, selectedCollection!); await supabase.from("products").update({ category: updated }).eq("id", p.id); setProducts(products.map((x) => x.id === p.id ? { ...x, category: updated } : x)); revalidateMyStore(); }} style={{ padding: "6px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Add</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  <input type="text" placeholder="New collection name..." value={newCollection} onChange={(e) => setNewCollection(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter") { if (!canAddCollection) { alert("Plan limit reached."); return; } const name = newCollection.trim(); if (name && !storeCollections.includes(name)) { const updated = [...storeCollections, name]; setStoreCollections(updated); setNewCollection(""); await supabase.from("sellers").update({ collections: updated }).eq("id", seller!.id); setSeller({ ...seller!, collections: updated }); revalidateMyStore(); } } }} style={{ flex: 1, padding: "12px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  <button onClick={async () => { if (!canAddCollection) { alert("Plan limit reached."); return; } const name = newCollection.trim(); if (name && !storeCollections.includes(name)) { const updated = [...storeCollections, name]; setStoreCollections(updated); setNewCollection(""); await supabase.from("sellers").update({ collections: updated }).eq("id", seller!.id); setSeller({ ...seller!, collections: updated }); revalidateMyStore(); } }} style={{ padding: "12px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}>+ Create</button>
                </div>
                {storeCollections.length === 0 ? (
                  <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--muted)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No collections yet</p><p style={{ fontSize: 13, color: "var(--muted-2)" }}>Create your first collection to organize your products.</p></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {storeCollections.map((col, i) => {
                      const count = products.filter((p) => productInCat(col, p) && (p.status || "published") !== "trashed").length;
                      const thumb = products.find((p) => productInCat(col, p) && p.image_url);
                      return (
                        <div key={i} onClick={() => setSelectedCollection(col)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, cursor: "pointer", transition: "border-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.15)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--input-bg)"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {thumb?.image_url ? <img src={thumb.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: "var(--input-bg)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 16, color: "var(--muted-2)" }}>&#9633;</span></div>}
                            <div><div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 2 }}>{col}</div><div style={{ fontSize: 11, color: "var(--muted-2)" }}>{count} product{count !== 1 ? "s" : ""}</div></div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "var(--muted-2)" }}>&rarr;</span>
                            <button onClick={async (e) => { e.stopPropagation(); const updated = storeCollections.filter((_, idx) => idx !== i); setStoreCollections(updated); await supabase.from("sellers").update({ collections: updated }).eq("id", seller!.id); setSeller({ ...seller!, collections: updated }); revalidateMyStore(); }} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,107,53,0.06)", border: "none", color: "#ff6b35", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>)}

          {tab === "orders" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Orders</h1><p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>Track and manage incoming orders.</p></div>
              {selectedOrder && <button onClick={() => setSelectedOrder(null)} style={{ padding: "10px 20px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>&larr; All Orders</button>}
            </div>
            {!selectedOrder && visibleOrders.length > 0 && <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>{visibleOrders.length} order{visibleOrders.length !== 1 ? "s" : ""}</p>}
            {selectedOrder ? (
              <div>
                <div style={{ padding: "24px 20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase" as const }}>Order #{selectedOrder.order_number}</h2>
                    <span style={{ fontSize: 12, color: "var(--muted-2)" }}>{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  </div>
                  {orderSaved && <div style={{ padding: "8px 16px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 12, marginBottom: 16, fontSize: 12, fontWeight: 700, color: "#22c55e", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Changes saved</div>}
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" as const }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, alignSelf: "center", marginRight: 4 }}>Payment:</label>
                    {["awaiting_payment", "paid", "refunded"].map((s) => (
                      <button key={s} onClick={async () => { const { error } = await supabase.from("orders").update({ payment_status: s }).eq("id", selectedOrder.id); if (error) { alert("Failed to save: " + error.message); return; } const updated = { ...selectedOrder, payment_status: s }; setSelectedOrder(updated); setOrders(orders.map((o) => o.id === selectedOrder.id ? updated : o)); setOrderSaved(true); setTimeout(() => setOrderSaved(false), 2000); }} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: selectedOrder.payment_status === s ? (s === "paid" ? "rgba(34,197,94,0.15)" : s === "refunded" ? "rgba(255,107,53,0.1)" : "rgba(251,191,36,0.1)") : "var(--panel-2)", color: selectedOrder.payment_status === s ? (s === "paid" ? "#22c55e" : s === "refunded" ? "#ff6b35" : "#fbbf24") : "var(--muted-2)" }}>{s.replace("_", " ")}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" as const }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, alignSelf: "center", marginRight: 4 }}>Status:</label>
                    {["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                      <button key={s} onClick={async () => { const { error } = await supabase.from("orders").update({ status: s }).eq("id", selectedOrder.id); if (error) { alert("Failed to save: " + error.message); return; } const updated = { ...selectedOrder, status: s }; setSelectedOrder(updated); setOrders(orders.map((o) => o.id === selectedOrder.id ? updated : o)); setOrderSaved(true); setTimeout(() => setOrderSaved(false), 2000); }} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: selectedOrder.status === s ? (s === "delivered" ? "rgba(34,197,94,0.15)" : s === "cancelled" ? "rgba(255,107,53,0.1)" : s === "shipped" ? "rgba(37,99,235,0.1)" : s === "confirmed" || s === "processing" ? "rgba(255,107,53,0.08)" : "rgba(251,191,36,0.1)") : "var(--panel-2)", color: selectedOrder.status === s ? (s === "delivered" ? "#22c55e" : s === "cancelled" ? "#ff6b35" : s === "shipped" ? "#2563eb" : s === "confirmed" || s === "processing" ? N : "#fbbf24") : "var(--muted-2)" }}>{s}</button>
                    ))}
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12, color: N }}>Customer</h3>
                    <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 600 }}>{selectedOrder.customer_name || "N/A"}</div>
                    {selectedOrder.customer_email && <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{selectedOrder.customer_email}</div>}
                    {selectedOrder.customer_phone && <div style={{ fontSize: 13, color: "var(--muted)" }}>{selectedOrder.customer_phone}</div>}
                  </div>
                  <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12, color: N }}>{selectedOrder.fulfillment_method === "pickup" ? "Pickup" : "Delivery"}</h3>
                    {selectedOrder.fulfillment_method === "pickup" ? <div style={{ fontSize: 13, color: "var(--muted)" }}>Customer will pick up</div> : selectedOrder.shipping_address ? (
                      <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.6 }}>{selectedOrder.shipping_address.address}{selectedOrder.shipping_address.apartment ? ", " + selectedOrder.shipping_address.apartment : ""}<br />{selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.province}<br />{selectedOrder.shipping_address.postal_code}</div>
                    ) : <div style={{ fontSize: 13, color: "var(--muted-2)" }}>No address provided</div>}
                    {selectedOrder.shipping_option && <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 8, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{selectedOrder.shipping_option} {selectedOrder.shipping_cost > 0 ? "- R" + selectedOrder.shipping_cost : ""}</div>}
                  </div>
                </div>
                <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, color: N }}>Order Items</h3>
                  {(selectedOrder.items || []).map((item, i) => {
                    const img = item.image || products.find((p) => p.name === item.name)?.image_url;
                    return (<div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < selectedOrder.items.length - 1 ? "1px solid var(--border)" : "none" }}>
                      {img ? <img src={img} alt="" style={{ width: 44, height: 52, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 44, height: 52, borderRadius: 6, background: "var(--input-bg)", flexShrink: 0 }} />}
                      <div style={{ flex: 1 }}><div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>{item.variant && <div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 2 }}>{item.variant}</div>}<div style={{ fontSize: 12, color: "var(--muted-2)", marginTop: 2 }}>Qty: {item.qty}</div></div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>R{(item.price * item.qty).toFixed(0)}</div>
                    </div>);
                  })}
                  <div style={{ borderTop: "1px solid var(--border)", paddingTop: 16, marginTop: 8 }}>
                    {selectedOrder.shipping_cost > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "var(--muted-2)", marginBottom: 6 }}><span>Shipping</span><span>R{selectedOrder.shipping_cost}</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}><span>Total</span><span>R{selectedOrder.total}</span></div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: "var(--muted-2)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Payment: {selectedOrder.payment_method || "N/A"}</div>
                </div>
              </div>
            ) : visibleOrders.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--muted)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No orders yet</p><p style={{ fontSize: 13, color: "var(--muted-2)" }}>Orders will appear here when customers buy from your store.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {visibleOrders.map((order) => (
                  <div key={order.id} onClick={() => setSelectedOrder(order)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, flexWrap: "wrap" as const, gap: 12, cursor: "pointer", transition: "border-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.15)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "var(--input-bg)"}>
                    <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, textTransform: "uppercase" as const }}>Order #{order.order_number}</div><div style={{ display: "flex", gap: 10, fontSize: 10, color: "var(--muted-2)", textTransform: "uppercase" as const, letterSpacing: "0.04em", fontWeight: 600 }}><span>{order.customer_name || "Customer"}</span><span>{new Date(order.created_at).toLocaleDateString()}</span></div></div>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em" }}>R{order.total}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: order.payment_status === "paid" ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.08)", color: order.payment_status === "paid" ? "#22c55e" : "#fbbf24" }}>{order.payment_status?.replace("_", " ")}</span>
                      <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: order.status === "delivered" ? "rgba(34,197,94,0.1)" : order.status === "shipped" ? "rgba(37,99,235,0.1)" : order.status === "confirmed" || order.status === "processing" ? "rgba(255,107,53,0.08)" : "rgba(251,191,36,0.08)", color: order.status === "delivered" ? "#22c55e" : order.status === "shipped" ? "#2563eb" : order.status === "confirmed" || order.status === "processing" ? N : "#fbbf24" }}>{order.status}</span>
                    </div>
                  </div>
                ))}
                {hasMoreOrders && (
                  <button onClick={loadMoreOrders} disabled={loadingMoreOrders} style={{ marginTop: 12, padding: "12px 20px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--text)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: loadingMoreOrders ? "not-allowed" : "pointer", opacity: loadingMoreOrders ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em", alignSelf: "center" }}>{loadingMoreOrders ? "Loading…" : "Load more orders"}</button>
                )}
              </div>
            )}
          </div>)}

          {tab === "abandoned" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Abandoned Checkouts</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Customers who started PayFast checkout but didn't complete payment.</p>
            {abandonedOrders.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--muted)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No abandoned checkouts</p><p style={{ fontSize: 13, color: "var(--muted-2)" }}>When customers leave without paying, they'll show up here.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {abandonedOrders.map((order) => (
                  <div key={order.id} style={{ padding: "16px 18px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12, marginBottom: 10 }}>
                      <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>#{order.order_number} - {order.customer_name || "Unknown"}</div><div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 2 }}>{order.customer_email} {order.customer_phone ? " / " + order.customer_phone : ""}</div></div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}><span style={{ fontSize: 16, fontWeight: 900 }}>R{order.total}</span><span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: "rgba(255,107,53,0.08)", color: "#ff6b35" }}>Abandoned</span></div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, fontSize: 11, color: "var(--muted-2)" }}>
                      {(order.items || []).map((item, i) => (<span key={i} style={{ padding: "4px 10px", background: "var(--panel-2)", borderRadius: 6, border: "1px solid var(--border)" }}>{item.name} x{item.qty}</span>))}
                      <span style={{ marginLeft: "auto" }}>{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>)}

          {tab === "discounts" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 24, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Discount Codes</h1><p style={{ fontSize: 14, color: "var(--muted)" }}>Create promo codes for cart, products, collections, or shipping.</p></div>
              <button onClick={() => { if (showDcForm) { setShowDcForm(false); setDcEditId(null); } else { setDcCode(""); setDcValue(""); setDcMinOrder(""); setDcMaxUses(""); setDcExpires(""); setDcDescription(""); setDcType("percentage"); setDcAppliesTo("cart"); setDcProductIds([]); setDcCollections([]); setDcShowCountdown(false); setDcEditId(null); setShowDcForm(true); } }} style={{ padding: "12px 24px", background: showDcForm ? "var(--panel-2)" : G, color: showDcForm ? "var(--muted)" : "#fff", border: showDcForm ? "1px solid var(--border)" : "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{showDcForm ? "Cancel" : "+ New Code"}</button>
            </div>
            {showDcForm && (
              <div style={{ padding: "28px 24px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16, marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div><label style={labelStyle}>Discount Code</label><input type="text" value={dcCode} onChange={(e) => setDcCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="e.g. WELCOME10" style={{ width: "100%", padding: "12px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 14, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", fontWeight: 700, letterSpacing: "0.04em" }} /></div>
                  <div><label style={labelStyle}>Applies To</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {[{ k: "cart", l: "Cart" }, { k: "product", l: "Product" }, { k: "collection", l: "Collection" }, { k: "shipping", l: "Shipping" }].map((t) => (
                        <button key={t.k} onClick={() => setDcAppliesTo(t.k)} style={{ padding: "10px", borderRadius: 8, background: dcAppliesTo === t.k ? "rgba(255,107,53,0.08)" : "var(--panel-2)", border: dcAppliesTo === t.k ? "1px solid rgba(255,107,53,0.15)" : "1px solid var(--border)", color: dcAppliesTo === t.k ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>{t.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div><label style={labelStyle}>Discount Amount</label>
                    <div style={{ display: "flex", gap: 0, border: "1px solid var(--border)", borderRadius: 12, overflow: "hidden" }}>
                      <div style={{ display: "flex" }}>{[{ k: "percentage", l: "%" }, { k: "fixed", l: "R" }].map((t) => (<button key={t.k} onClick={() => { setDcType(t.k); if (t.k === "percentage" && parseFloat(dcValue) > 100) setDcValue("100"); }} style={{ padding: "12px 16px", background: dcType === t.k ? "rgba(255,107,53,0.12)" : "var(--panel-2)", border: "none", borderRight: "1px solid var(--border)", color: dcType === t.k ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{t.l}</button>))}</div>
                      <input type="text" inputMode="numeric" value={dcValue} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); if (dcType === "percentage" && parseFloat(v) > 100) { setDcValue("100"); return; } setDcValue(v); }} placeholder={dcType === "percentage" ? "e.g. 10" : "e.g. 50"} style={{ flex: 1, padding: "12px 14px", background: "var(--input-bg)", border: "none", color: "var(--text)", fontSize: 14, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", fontWeight: 600 }} />
                    </div>
                  </div>
                  <div><label style={labelStyle}>Preview</label><div style={{ padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 16, fontWeight: 800, color: dcValue ? N : "var(--muted-2)" }}>{dcValue ? (dcType === "percentage" ? dcValue + "% OFF" : "R" + dcValue + " OFF") : "Set amount"}</div></div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div><label style={labelStyle}>Min Order (R)</label><input type="text" inputMode="numeric" value={dcMinOrder} onChange={(e) => setDcMinOrder(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Max Uses</label><input type="text" inputMode="numeric" value={dcMaxUses} onChange={(e) => setDcMaxUses(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Unlimited" style={inputStyle} /></div>
                  <div><label style={labelStyle}>Expires</label><input type="date" value={dcExpires} onChange={(e) => setDcExpires(e.target.value)} style={inputStyle} /></div>
                </div>
                {dcAppliesTo === "product" && (<div style={{ marginBottom: 16 }}><label style={{ ...labelStyle, marginBottom: 8 }}>Select Products</label><div style={{ maxHeight: 200, overflow: "auto", border: "1px solid var(--border)", borderRadius: 12, background: "var(--panel)" }}>{products.filter((p) => (p.status || "published") !== "trashed").map((p) => (<div key={p.id} onClick={() => setDcProductIds(dcProductIds.includes(p.id) ? dcProductIds.filter((x) => x !== p.id) : [...dcProductIds, p.id])} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid var(--border)", background: dcProductIds.includes(p.id) ? "rgba(255,107,53,0.04)" : "transparent" }}><div style={{ width: 18, height: 18, borderRadius: 4, border: dcProductIds.includes(p.id) ? "2px solid " + N : "1px solid var(--border)", background: dcProductIds.includes(p.id) ? "rgba(255,107,53,0.15)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: N }}>{dcProductIds.includes(p.id) ? "\u2713" : ""}</div>{p.image_url ? <img src={p.image_url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <div style={{ width: 28, height: 28, borderRadius: 4, background: "var(--input-bg)" }} />}<span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span><span style={{ fontSize: 11, color: "var(--muted-2)", marginLeft: "auto" }}>R{p.price}</span></div>))}</div>{dcProductIds.length > 0 && <p style={{ fontSize: 11, color: N, marginTop: 6 }}>{dcProductIds.length} product{dcProductIds.length !== 1 ? "s" : ""} selected</p>}</div>)}
                {dcAppliesTo === "collection" && (<div style={{ marginBottom: 16 }}><label style={{ ...labelStyle, marginBottom: 8 }}>Select Collections</label><div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>{storeCollections.map((col) => (<button key={col} onClick={() => setDcCollections(dcCollections.includes(col) ? dcCollections.filter((x) => x !== col) : [...dcCollections, col])} style={{ padding: "8px 16px", borderRadius: 100, background: dcCollections.includes(col) ? "rgba(255,107,53,0.08)" : "var(--panel-2)", border: dcCollections.includes(col) ? "1px solid rgba(255,107,53,0.15)" : "1px solid var(--border)", color: dcCollections.includes(col) ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>{col}</button>))}</div>{dcCollections.length > 0 && <p style={{ fontSize: 11, color: N, marginTop: 6 }}>{dcCollections.length} collection{dcCollections.length !== 1 ? "s" : ""} selected</p>}</div>)}
                {dcAppliesTo === "shipping" && (<div style={{ padding: "12px 16px", background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)", borderRadius: 12, marginBottom: 16, fontSize: 12, color: "#fbbf24" }}>Shipping discounts apply to delivery fees only.</div>)}
                <div style={{ marginBottom: 16 }}>
                  <label style={labelStyle}>Description (optional)</label>
                  <textarea value={dcDescription} onChange={(e) => setDcDescription(e.target.value)} placeholder="e.g. New customers get 10% off their first order" rows={2} style={{ ...inputStyle, resize: "vertical" as const }} />
                  <p style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 4 }}>Shown alongside the code in the storefront promo banner.</p>
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", marginBottom: dcShowCountdown && !dcExpires ? 8 : 16 }}>
                  <div><span style={{ fontSize: 13 }}>Show countdown timer on store</span><br /><span style={{ fontSize: 11, color: "var(--muted-2)" }}>Display a promo banner with a countdown to expiry</span></div>
                  <button onClick={() => setDcShowCountdown(!dcShowCountdown)} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: dcShowCountdown ? N : "var(--toggle-off)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: dcShowCountdown ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
                </div>
                {dcShowCountdown && !dcExpires && (
                  <div style={{ padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 12, marginBottom: 16, fontSize: 12, color: "#ff6b35" }}>Set an expiry date above — a countdown needs something to count down to. Without one, this code won't appear on your store at all.</div>
                )}
                <button onClick={async () => {
                  if (!dcCode || !dcValue || !seller) return;
                  if (dcType === "percentage" && parseFloat(dcValue) > 100) { alert("Percentage cannot exceed 100%"); return; }
                  if (dcAppliesTo === "product" && dcProductIds.length === 0) { alert("Please select at least one product"); return; }
                  if (dcAppliesTo === "collection" && dcCollections.length === 0) { alert("Please select at least one collection"); return; }
                  if (dcShowCountdown && !dcExpires) { alert("Set an expiry date to show a countdown — otherwise this code won't display on your store."); return; }
                  setDcSaving(true);
                  const payload = { seller_id: seller.id, code: dcCode.toUpperCase(), type: dcType, value: parseFloat(dcValue), min_order: parseFloat(dcMinOrder) || 0, max_uses: dcMaxUses ? parseInt(dcMaxUses) : null, expires_at: dcExpires ? new Date(dcExpires).toISOString() : null, applies_to: dcAppliesTo, product_ids: dcProductIds, collection_names: dcCollections, show_countdown: dcShowCountdown, description: dcDescription.trim() || null };
                  if (dcEditId) { const { error } = await supabase.from("discount_codes").update(payload).eq("id", dcEditId); if (!error) { setDiscountCodes(discountCodes.map((d) => d.id === dcEditId ? { ...d, ...payload } as DiscountCode : d)); setShowDcForm(false); setDcEditId(null); revalidateMyStore(); } else alert("Error: " + error.message); }
                  else { const { data, error } = await supabase.from("discount_codes").insert({ ...payload, active: true }).select().single(); if (data) { setDiscountCodes([data, ...discountCodes]); setShowDcForm(false); revalidateMyStore(); } if (error) alert("Error: " + error.message); }
                  setDcSaving(false);
                }} disabled={dcSaving || !dcCode || !dcValue} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: dcSaving ? "not-allowed" : "pointer", opacity: (dcSaving || !dcCode || !dcValue) ? 0.5 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{dcSaving ? "Saving..." : dcEditId ? "Save Changes" : "Create Discount Code"}</button>
              </div>
            )}
            {!showDcForm && discountCodes.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "var(--muted)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No discount codes yet</p><p style={{ fontSize: 13, color: "var(--muted-2)" }}>Create your first code to start offering promotions.</p></div>
            ) : !showDcForm && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ key: "cart", label: "Cart / Order Discounts" }, { key: "product", label: "Product Discounts" }, { key: "collection", label: "Collection Discounts" }, { key: "shipping", label: "Shipping Discounts" }].map((cat) => {
                  const catCodes = discountCodes.filter((dc) => (dc.applies_to || "cart") === cat.key);
                  return (
                    <div key={cat.key}>
                      <button onClick={() => setOpenDiscountCat(openDiscountCat === cat.key ? null : cat.key)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: openDiscountCat === cat.key ? "12px 12px 0 0" : 12, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}><h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", margin: 0, color: "var(--text)" }}>{cat.label}</h3><span style={{ fontSize: 11, color: "var(--muted-2)" }}>({catCodes.length})</span></div>
                        <span style={{ fontSize: 14, color: "var(--muted-2)", transition: "transform 0.2s", transform: openDiscountCat === cat.key ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
                      </button>
                      {openDiscountCat === cat.key && (
                        <div style={{ border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 12px 12px", background: "var(--panel)" }}>
                          {catCodes.length === 0 ? <p style={{ padding: "20px 18px", fontSize: 12, color: "var(--muted-2)" }}>No codes yet.</p> : catCodes.map((dc) => (
                            <div key={dc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" as const, gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ padding: "6px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 6, fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", color: N }}>{dc.code}</div>
                                <div><div style={{ fontSize: 13, fontWeight: 700 }}>{dc.type === "percentage" ? dc.value + "% off" : "R" + dc.value + " off"}</div><div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 2 }}>{dc.min_order > 0 ? "Min R" + dc.min_order + " " : ""}{dc.max_uses ? "Max " + dc.max_uses + " uses " : "Unlimited "}- Used {dc.used_count}x{dc.expires_at ? " - Exp " + new Date(dc.expires_at).toLocaleDateString() : ""}</div></div>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button onClick={() => { setDcEditId(dc.id); setDcCode(dc.code); setDcType(dc.type); setDcValue(String(dc.value)); setDcMinOrder(dc.min_order > 0 ? String(dc.min_order) : ""); setDcMaxUses(dc.max_uses ? String(dc.max_uses) : ""); setDcExpires(dc.expires_at ? dc.expires_at.split("T")[0] : ""); setDcDescription(dc.description || ""); setDcAppliesTo(dc.applies_to || "cart"); setDcProductIds(dc.product_ids || []); setDcCollections(dc.collection_names || []); setDcShowCountdown(dc.show_countdown || false); setShowDcForm(true); }} style={{ padding: "5px 12px", borderRadius: 100, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "1px solid var(--border)", background: "var(--panel-2)", color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif" }}>Edit</button>
                                <button onClick={async () => { await supabase.from("discount_codes").update({ active: !dc.active }).eq("id", dc.id); setDiscountCodes(discountCodes.map((d) => d.id === dc.id ? { ...d, active: !d.active } : d)); revalidateMyStore(); }} style={{ padding: "5px 12px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: dc.active ? "rgba(34,197,94,0.1)" : "var(--panel-2)", color: dc.active ? "#22c55e" : "var(--muted-2)" }}>{dc.active ? "Active" : "Off"}</button>
                                <button onClick={async () => { if (!confirm("Delete this code?")) return; await supabase.from("discount_codes").delete().eq("id", dc.id); setDiscountCodes(discountCodes.filter((d) => d.id !== dc.id)); revalidateMyStore(); }} style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,107,53,0.06)", border: "none", color: "#ff6b35", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>)}

          {tab === "mystore" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Edit My Store</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Customize how your store looks to customers.</p>
            <div style={{ marginBottom: 24, border: "1px solid var(--border)", borderRadius: 16, background: "var(--panel)", overflow: "hidden" }}>
              <button onClick={() => setTemplateOpen(!templateOpen)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "var(--panel)", border: "none", cursor: "pointer", color: "var(--text)" }}>
                <span style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Choose Template</span>
                <span style={{ fontSize: 11, color: "var(--muted-2)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 10, color: N, fontWeight: 700 }}>{TEMPLATES.find(t => t.id === storeTemplate)?.name}</span>
                  <span style={{ transform: templateOpen ? "rotate(180deg)" : "rotate(0)", transition: "transform 0.2s", display: "inline-block" }}>&#9662;</span>
                </span>
              </button>
              {templateOpen && (
                <div style={{ padding: "16px 20px", borderTop: "1px solid var(--border)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
                    {TEMPLATES.map((t, ti) => {
                      const previewUrl = ({ "heirloom": "/templates/heirloom/index.html", "crown": "/templates/crown/index.html", "glass-futuristic": "/templates/volt/index.html", "soft-luxury": "/templates/aurelia/index.html" } as Record<string, string>)[t.id];
                      const locked = isFreePlan && t.id !== "soft-luxury";
                      return (
                        <button key={t.id} onClick={async () => {
                          if (locked) { window.open(previewUrl, "_blank", "noopener,noreferrer"); return; }
                          if (t.id === storeTemplate) return;
                          setStoreTemplate(t.id);
                          if (seller && confirm("Switch to " + t.name + "? This will save immediately.")) { const { error } = await supabase.from("sellers").update({ template: t.id }).eq("id", seller.id); if (!error) { setSeller({ ...seller, template: t.id }); revalidateMyStore(); } }
                        }} style={{ padding: 0, border: storeTemplate === t.id ? "2px solid " + N : "2px solid var(--border)", borderRadius: 16, background: "var(--panel)", cursor: "pointer", overflow: "hidden", textAlign: "left" as const, position: "relative" as const }}>
                          <div style={{ width: "100%", height: 220, background: t.colors.bg, overflow: "hidden", borderRadius: "12px 12px 0 0", position: "relative" as const }}>
                            <div style={{ position: "absolute" as const, top: 8, left: "50%", transform: "translateX(-50%)", width: 60, height: 6, borderRadius: 3, background: "rgba(0,0,0,0.15)", zIndex: 2 }} />
                            <div style={{ width: 400, height: 844, transform: "scale(0.38)", transformOrigin: "top left", position: "absolute" as const, top: 0, left: "50%", marginLeft: -76, pointerEvents: "none" as const }}>
                              <iframe src={previewUrl} style={{ width: 400, height: 844, border: "none" }} tabIndex={-1} />
                            </div>
                            {locked && (
                              <div style={{ position: "absolute" as const, top: 8, right: 8, zIndex: 3 }}>
                                <span style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 12px", background: "rgba(0,0,0,0.75)", borderRadius: 100, fontSize: 9, fontWeight: 800, color: "#fff", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>
                                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="9" rx="1.5"/><path d="M7.5 11V7.5a4.5 4.5 0 0 1 9 0V11"/></svg>
                                  Preview &middot; Pro to unlock
                                </span>
                              </div>
                            )}
                          </div>
                          <div style={{ padding: "8px 12px" }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 11, fontWeight: 800, color: "var(--text)", textTransform: "uppercase" as const }}>{t.name}</span>
                              {storeTemplate === t.id && <span style={{ width: 18, height: 18, borderRadius: "50%", background: N, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: "#fff", fontWeight: 900 }}>&#10003;</span>}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
            {seller?.subdomain && (<div style={sectionCard}><h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Online Visual Editor</h3><p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Open the full store editor to see live changes as you edit.</p><a href="/dashboard/editor" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em", textDecoration: "none" }}>Open Online Visual Editor &rarr;</a></div>)}
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 16 }}>Branding</h3>
              <div className="logo-banner-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 24 }}>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Store Logo</label>
                  <div onClick={() => logoInputRef.current?.click()} style={{ marginTop: 8, width: 100, height: 100, borderRadius: 12, border: "1px dashed var(--border)", background: "var(--panel)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "var(--muted-2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Upload</span>}</div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} style={{ display: "none" }} />
                  {logoPreview && <button onClick={() => { setLogoPreview(""); setLogoFile(null); setLogoRemoved(true); }} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Remove</button>}
                </div>
                <div>
                  <label style={{ ...labelStyle, marginBottom: 0 }}>Store Banner</label>
                  <div onClick={() => bannerInputRef.current?.click()} style={{ marginTop: 8, width: "100%", height: 100, borderRadius: 12, border: "1px dashed var(--border)", background: "var(--panel)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>{bannerPreview ? <img src={bannerPreview} alt="Banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "var(--muted-2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Upload</span>}</div>
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerSelect} style={{ display: "none" }} />
                  {bannerPreview && <button onClick={() => { setBannerPreview(""); setBannerFile(null); setBannerRemoved(true); }} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Remove</button>}
                </div>
              </div>

              {storeTemplate === "soft-luxury" && (
                <div style={{ paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>Banner Position</div>
                  <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10 }}>Fixes portrait banner images getting cropped oddly on wide desktop screens — choose which part of the image stays visible.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6, marginBottom: 20 }}>
                    {([{ v: "top", l: "Top" }, { v: "center", l: "Center" }, { v: "bottom", l: "Bottom" }] as const).map(o => (
                      <button key={o.v} onClick={() => setStoreConfig({ ...storeConfig, hero_image_position: o.v })}
                        style={{ padding: "8px 4px", borderRadius: 6, border: (storeConfig.hero_image_position || "center") === o.v ? `1.5px solid ${N}` : "1px solid var(--border)", background: (storeConfig.hero_image_position || "center") === o.v ? "var(--panel-solid)" : "var(--panel)", color: (storeConfig.hero_image_position || "center") === o.v ? "var(--text)" : "var(--muted)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                        {o.l}
                      </button>
                    ))}
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6 }}>Banner Motion</div>
                  <div style={{ fontSize: 11, color: "var(--muted-2)", marginBottom: 10 }}>Adds subtle life to your hero image.</div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
                    {([{ v: "still", l: "Still" }, { v: "ambient", l: "Ambient" }, { v: "breathing", l: "Breathing" }] as const).map(o => (
                      <button key={o.v} onClick={() => setStoreConfig({ ...storeConfig, hero_image_behavior: o.v })}
                        style={{ padding: "8px 4px", borderRadius: 6, border: (storeConfig.hero_image_behavior || "still") === o.v ? `1.5px solid ${N}` : "1px solid var(--border)", background: (storeConfig.hero_image_behavior || "still") === o.v ? "var(--panel-solid)" : "var(--panel)", color: (storeConfig.hero_image_behavior || "still") === o.v ? "var(--text)" : "var(--muted)", fontSize: 11, cursor: "pointer", transition: "all 0.2s" }}>
                        {o.l}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ paddingTop: 20, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 10 }}>Brand Color</div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center", marginBottom: 10 }}>
                  {COLOR_PRESETS.map((c) => (<button key={c} onClick={() => setStoreColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: storeColor === c ? "3px solid var(--panel-solid)" : "3px solid transparent", cursor: "pointer", boxShadow: storeColor === c ? "0 0 0 2px " + c : "none" }} />))}
                </div>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 8 }}>
                  <span style={{ fontSize: 11, color: "var(--muted)", letterSpacing: "0.05em", textTransform: "uppercase" as const }}>Exact Color</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <label style={{ width: 28, height: 28, borderRadius: 6, background: storeColor, border: "1px solid var(--border)", cursor: "pointer", display: "block", overflow: "hidden", flexShrink: 0 }}>
                      <input type="color" value={storeColor} onChange={(e) => setStoreColor(e.target.value)} style={{ width: "200%", height: "200%", border: "none", cursor: "pointer", padding: 0, transform: "translate(-25%, -25%)" }} />
                    </label>
                    <span style={{ fontSize: 11, color: "var(--muted-2)", fontFamily: "monospace" }}>{storeColor}</span>
                    <button onClick={() => setStoreColor("#ff6b35")} style={{ fontSize: 11, color: "var(--muted-2)", background: "none", border: "none", cursor: "pointer" }}>&#8634;</button>
                  </div>
                </div>
                <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 8 }}>Click the swatch to open the full color picker — pick from the spectrum, use the sliders, or type an exact hex code.</div>
              </div>

              <div style={{ paddingTop: 20, marginTop: 20, borderTop: "1px solid var(--border)" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 10 }}>Typography</div>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                  {Object.entries(FONT_PAIRS).map(([key, fp]) => {
                    const active = (storeConfig.font_pair || DEFAULT_FONT_PAIR_KEY) === key;
                    return (
                      <button key={key} onClick={() => setStoreConfig({ ...storeConfig, font_pair: key })}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", background: active ? "var(--panel-solid)" : "var(--panel)", border: active ? "1px solid " + N : "1px solid var(--border)", borderRadius: 8, cursor: "pointer", width: "100%" }}>
                        <span style={{ fontSize: 13, color: active ? "var(--text)" : "var(--muted)", fontWeight: active ? 700 : 400 }}>{fp.heading.split(",")[0].replace(/'/g, "")}</span>
                        <span style={{ fontSize: 10, color: "var(--muted-2)" }}>{fp.body.split(",")[0].replace(/'/g, "")}</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ fontSize: 10, color: "var(--muted-2)", marginTop: 8 }}>Applies to the Soft Luxury template. Changes take effect across your storefront and checkout.</div>
              </div>
            </div>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Hero Section</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>These match what you see in the hero section of the Online Visual Editor. Leave a field empty and it won&apos;t display on your store.</p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                <div><label style={labelStyle}>Tagline</label><input type="text" placeholder="e.g. Premium streetwear for the culture" value={storeTagline} onChange={(e) => setStoreTagline(e.target.value)} style={inputStyle} /></div>
                {storeTemplate === "soft-luxury" && (
                  <div><label style={labelStyle}>Brand Name</label><input type="text" placeholder="Your store name" value={storeConfig.hero_title ?? ""} onChange={(e) => setStoreConfig({ ...storeConfig, hero_title: e.target.value })} style={inputStyle} /></div>
                )}
                <div><label style={labelStyle}>Description</label><textarea placeholder="Tell your customers what your brand is about..." value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} rows={4} style={{ ...inputStyle, resize: "vertical" as const }} /></div>
                {storeTemplate === "soft-luxury" && (
                  <div>
                    <label style={labelStyle}>Button Text</label>
                    <input type="text" placeholder="Shop Now" value={storeConfig.hero_cta ?? ""} onChange={(e) => setStoreConfig({ ...storeConfig, hero_cta: e.target.value })} style={inputStyle} />
                    <div style={{ height: 10 }} />
                    <CtaTargetPicker
                      target={storeConfig.hero_cta_target || { type: "products" }}
                      onChange={(t) => setStoreConfig({ ...storeConfig, hero_cta_target: t })}
                      collections={storeCollections}
                      dark={false}
                    />
                  </div>
                )}
              </div>
            </div>
            <div style={sectionCard}>
              <div style={sectionHeaderRow}>
                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)" }}>Announcement Bar</h3>
                <SectionToggle configKey="show_announcement" />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Shows at the very top of your store.</p>
              {storeConfig.show_announcement && <input type="text" placeholder="e.g. Free delivery on orders over R500" value={storeConfig.announcement} onChange={(e) => setStoreConfig({ ...storeConfig, announcement: e.target.value })} style={inputStyle} />}
            </div>
            {storeTemplate === "heirloom" ? (
              <div style={sectionCard}><h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Marquee Ticker</h3><p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Scrolling text shown below the header.</p>{storeConfig.marquee_texts.map((txt, i) => (<div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}><input type="text" value={txt} onChange={(e) => { const u = [...storeConfig.marquee_texts]; u[i] = e.target.value; setStoreConfig({ ...storeConfig, marquee_texts: u }); }} style={{ flex: 1, padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />{storeConfig.marquee_texts.length > 1 && <button onClick={() => { const u = storeConfig.marquee_texts.filter((_, idx) => idx !== i); setStoreConfig({ ...storeConfig, marquee_texts: u }); }} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", color: "#ff6b35", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>}</div>))}<button onClick={() => setStoreConfig({ ...storeConfig, marquee_texts: [...storeConfig.marquee_texts, ""] })} style={{ padding: "8px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Message</button></div>
            ) : (
              <div style={sectionCard}>
                <div style={sectionHeaderRow}>
                  <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)" }}>Marquee Ticker</h3>
                  <SectionToggle configKey="show_marquee" />
                </div>
                <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Scrolling text shown below the header.</p>
                {storeConfig.show_marquee && (<>{storeConfig.marquee_texts.map((txt, i) => (<div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}><input type="text" value={txt} onChange={(e) => { const u = [...storeConfig.marquee_texts]; u[i] = e.target.value; setStoreConfig({ ...storeConfig, marquee_texts: u }); }} style={{ flex: 1, padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />{storeConfig.marquee_texts.length > 1 && <button onClick={() => { const u = storeConfig.marquee_texts.filter((_, idx) => idx !== i); setStoreConfig({ ...storeConfig, marquee_texts: u }); }} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", color: "#ff6b35", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>}</div>))}<button onClick={() => setStoreConfig({ ...storeConfig, marquee_texts: [...storeConfig.marquee_texts, ""] })} style={{ padding: "8px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Message</button></>)}
              </div>
            )}
            {storeTemplate !== "heirloom" && (<div style={sectionCard}>
              <div style={sectionHeaderRow}>
                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)" }}>Trust Bar</h3>
                <SectionToggle configKey="show_trust_bar" />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Select an icon and add a title/description for each item.</p>
              {storeConfig.show_trust_bar && (<>{storeConfig.trust_items.map((item, i) => (<div key={i} style={{ padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 8 }}><div style={{ display: "flex", gap: 4, flexWrap: "wrap" as const, marginBottom: 8 }}>{[
              { id: "shield",  svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M12 2L3 7v5c0 5.25 3.75 10.15 9 11.25C17.25 22.15 21 17.25 21 12V7L12 2z"/></svg> },
              { id: "star",    svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> },
              { id: "diamond", svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M6 3h12l4 6-10 13L2 9z"/><path d="M2 9h20"/></svg> },
              { id: "truck",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v4h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg> },
              { id: "package", svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10V7a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 7v10a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 17v-3"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
              { id: "refresh", svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 102.13-9.36L1 10"/></svg> },
              { id: "lock",    svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg> },
              { id: "card",    svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> },
              { id: "check",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg> },
              { id: "award",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="8" r="6"/><path d="M15.477 12.89L17 22l-5-3-5 3 1.523-9.11"/></svg> },
              { id: "tag",     svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 01-2.83 0L2 12V2h10l8.59 8.59a2 2 0 010 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg> },
              { id: "globe",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg> },
              { id: "heart",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> },
              { id: "clock",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
              { id: "phone",   svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 9.5 19.79 19.79 0 01.04 4.72 2 2 0 012 2.5h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 10a16 16 0 006 6l.36-.36a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z"/></svg> },
              { id: "map",     svg: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg> },
            ].map(({ id, svg }) => (<button key={id} title={id} onClick={() => { const u = [...storeConfig.trust_items]; u[i] = { ...u[i], icon: id }; setStoreConfig({ ...storeConfig, trust_items: u }); }} style={{ width: 32, height: 32, borderRadius: 6, border: item.icon === id ? `2px solid ${N}` : "1px solid var(--border)", background: item.icon === id ? `${N}15` : "var(--panel-2)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: item.icon === id ? N : "var(--muted)" }}>{svg}</button>))}</div><div style={{ display: "flex", gap: 8 }}><input type="text" value={item.title} onChange={(e) => { const u = [...storeConfig.trust_items]; u[i] = { ...u[i], title: e.target.value }; setStoreConfig({ ...storeConfig, trust_items: u }); }} placeholder="Title" style={{ flex: 1, padding: "8px 10px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /><input type="text" value={item.desc} onChange={(e) => { const u = [...storeConfig.trust_items]; u[i] = { ...u[i], desc: e.target.value }; setStoreConfig({ ...storeConfig, trust_items: u }); }} placeholder="Description" style={{ flex: 2, padding: "8px 10px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />{storeConfig.trust_items.length > 1 && <button onClick={() => { const u = storeConfig.trust_items.filter((_, idx) => idx !== i); setStoreConfig({ ...storeConfig, trust_items: u }); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,107,53,0.06)", border: "none", color: "#ff6b35", fontSize: 12, cursor: "pointer", flexShrink: 0 }}>&times;</button>}</div></div>))}{storeConfig.trust_items.length < 6 && <button onClick={() => setStoreConfig({ ...storeConfig, trust_items: [...storeConfig.trust_items, { icon: "shield", title: "", desc: "" }] })} style={{ padding: "8px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Item</button>}</>)}
            </div>)}
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Footer About Text</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>A brief description of your business shown in the footer, below the Trust Bar. Leave empty to use your store description.</p>
              <textarea value={storeConfig.footer_about || ""} onChange={(e) => setStoreConfig({ ...storeConfig, footer_about: e.target.value })} placeholder="e.g. We specialise in premium streetwear designed for everyday comfort." rows={3} style={{ ...inputStyle, resize: "vertical" as const }} />
            </div>
            {storeTemplate !== "heirloom" && (<div style={sectionCard}>
              <div style={sectionHeaderRow}>
                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)" }}>Shipping & Policies</h3>
                <SectionToggle configKey="show_policies" />
              </div>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Edit your shipping, returns, and payment policy text.</p>
              {storeConfig.show_policies && (<>
                {storeConfig.policy_items.map((item, i) => (<div key={i} style={{ padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 8 }}><input type="text" value={item.title} onChange={(e) => { const u = [...storeConfig.policy_items]; u[i] = { ...u[i], title: e.target.value }; setStoreConfig({ ...storeConfig, policy_items: u }); }} placeholder="e.g. Shipping" style={{ width: "100%", padding: "8px 10px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontWeight: 700, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.04em" }} /><textarea value={item.desc} onChange={(e) => { const u = [...storeConfig.policy_items]; u[i] = { ...u[i], desc: e.target.value }; setStoreConfig({ ...storeConfig, policy_items: u }); }} placeholder="Policy details..." rows={2} style={{ width: "100%", padding: "8px 10px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" as const }} />{storeConfig.policy_items.length > 1 && <button onClick={() => setStoreConfig({ ...storeConfig, policy_items: storeConfig.policy_items.filter((_, idx) => idx !== i) })} style={{ marginTop: 6, fontSize: 10, color: "#ff6b35", background: "none", border: "none", cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Remove</button>}</div>))}
                <button onClick={() => setStoreConfig({ ...storeConfig, policy_items: [...storeConfig.policy_items, { title: "", desc: "" }] })} style={{ padding: "8px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 100, color: "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Policy</button>
              </>)}
            </div>)}
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Social Links</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Add your social media links. Leave empty to hide.</p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {([{ key: "instagram" as const, label: "Instagram", placeholder: "https://instagram.com/yourbrand" }, { key: "tiktok" as const, label: "TikTok", placeholder: "https://tiktok.com/@yourbrand" }, { key: "facebook" as const, label: "Facebook", placeholder: "https://facebook.com/yourbrand" }, { key: "twitter" as const, label: "X / Twitter", placeholder: "https://x.com/yourbrand" }]).map((item) => (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, width: 80, flexShrink: 0 }}>{item.label}</label><input type="url" placeholder={item.placeholder} value={socialLinks[item.key] || ""} onChange={(e) => setSocialLinks({ ...socialLinks, [item.key]: e.target.value })} style={{ flex: 1, padding: "11px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                ))}
              </div>
            </div>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Contact & Store Info</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Shown in the footer contact popup. Leave empty to hide.</p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, width: 80, flexShrink: 0 }}>Email</label><input type="email" placeholder="orders@yourbrand.co.za" value={storeConfig.contact_email || ""} onChange={(e) => setStoreConfig({ ...storeConfig, contact_email: e.target.value })} style={{ flex: 1, padding: "11px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}><label style={{ fontSize: 11, fontWeight: 700, color: "var(--muted)", letterSpacing: "0.08em", textTransform: "uppercase" as const, width: 80, flexShrink: 0 }}>Phone</label><input type="tel" placeholder="+27 12 345 6789" value={storeConfig.contact_phone || ""} onChange={(e) => setStoreConfig({ ...storeConfig, contact_phone: e.target.value })} style={{ flex: 1, padding: "11px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                <div><label style={labelStyle}>Operating Hours</label><textarea value={storeConfig.operating_hours || ""} onChange={(e) => setStoreConfig({ ...storeConfig, operating_hours: e.target.value })} placeholder="e.g. Mon-Fri 9am-5pm, Sat 10am-2pm" rows={2} style={{ ...inputStyle, fontSize: 12, resize: "vertical" as const }} /></div>
                <div><label style={labelStyle}>Physical Address</label><textarea value={storeConfig.physical_address || ""} onChange={(e) => setStoreConfig({ ...storeConfig, physical_address: e.target.value })} placeholder="e.g. 123 Main Street, Cape Town" rows={2} style={{ ...inputStyle, fontSize: 12, resize: "vertical" as const }} /></div>
              </div>
            </div>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Free Shipping Threshold</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Orders above this amount qualify for free shipping. Leave empty to disable.</p>
              <input type="number" placeholder="e.g. 500" value={storeConfig.free_ship_threshold ?? ""} onChange={(e) => setStoreConfig({ ...storeConfig, free_ship_threshold: e.target.value ? Number(e.target.value) : null })} style={{ width: 160, padding: "12px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
              <button onClick={saveStoreSettings} disabled={storeSaving} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: storeSaving ? "not-allowed" : "pointer", opacity: storeSaving ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{storeSaving ? "Saving..." : "Save Changes"}</button>
              {storeSaved && <span style={{ color: N, fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const }}>Saved!</span>}
              {seller?.subdomain && <a href={canonicalStoreUrl(seller.subdomain)} target="_blank" style={{ color: "var(--muted-2)", fontSize: 11, textDecoration: "underline", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Preview Store</a>}
            </div>
          </div>)}

          {tab === "domains" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Domains</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Manage your store's web address.</p>

            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Free Store Link</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Always active, even with a custom domain connected — this is the automatic fallback if a custom domain is ever disconnected.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, flexWrap: "wrap" as const, gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, wordBreak: "break-all" as const }}>{seller?.subdomain ? `${seller.subdomain}.catalogstore.co.za` : ""}</span>
                <div style={{ display: "flex", gap: 8 }}>
                  {seller?.subdomain && <a href={canonicalStoreUrl(seller.subdomain)} target="_blank" style={{ padding: "8px 16px", background: G, color: "#fff", borderRadius: 100, fontSize: 11, fontWeight: 800, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Visit Store</a>}
                  <button onClick={() => { if (seller?.subdomain) { navigator.clipboard.writeText(canonicalStoreUrl(seller.subdomain)); setDomainUrlCopied(true); setTimeout(() => setDomainUrlCopied(false), 2000); } }} style={{ padding: "8px 16px", background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 100, fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{domainUrlCopied ? "Copied!" : "Copy URL"}</button>
                </div>
              </div>
            </div>

            {isFreePlan ? (
              <div style={sectionCard}>
                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Custom Domain</h3>
                <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Connect your own domain (e.g. yourstore.co.za) instead of the free subdomain.</p>
                <a href="/dashboard/billing" style={{ display: "inline-flex", padding: "12px 28px", background: G, color: "#fff", borderRadius: 100, fontSize: 12, fontWeight: 800, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Upgrade to Pro</a>
              </div>
            ) : (
              <div style={sectionCard}>
                <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Custom Domain</h3>
                {!seller?.custom_domain ? (
                  <>
                    <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Connect your own domain instead of the free subdomain. We'll tell you exactly what to add at your registrar.</p>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      <input type="text" placeholder="e.g. yourstore.co.za" value={domainInput} onChange={(e) => setDomainInput(e.target.value)} style={{ ...inputStyle, flex: 1, minWidth: 200 }} />
                      <button onClick={connectDomain} disabled={domainLoading || !domainInput.trim()} style={{ padding: "12px 28px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: domainLoading ? "not-allowed" : "pointer", opacity: domainLoading ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{domainLoading ? "Connecting..." : "Connect"}</button>
                    </div>
                    {domainError && <div style={{ marginTop: 10, fontSize: 12, color: "#ff6b35" }}>{domainError}</div>}
                  </>
                ) : (
                  <>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 14, flexWrap: "wrap" as const, gap: 12 }}>
                      <div>
                        <span style={{ fontSize: 14, fontWeight: 700, wordBreak: "break-all" as const }}>{seller.custom_domain}</span>
                        <div style={{ marginTop: 6 }}>
                          {domainStatus?.verified && !domainStatus?.misconfigured ? (
                            <span style={{ padding: "4px 12px", background: "rgba(34,197,94,0.1)", color: "#22c55e", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Connected</span>
                          ) : (
                            <span style={{ padding: "4px 12px", background: "rgba(255,107,53,0.1)", color: N, borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{domainStatus?.misconfigured ? "Misconfigured" : "Pending Verification"}</span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={refreshDomainStatus} disabled={domainLoading} style={{ padding: "8px 16px", background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 100, fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{domainLoading ? "Checking..." : "Refresh Status"}</button>
                        <button onClick={removeDomain} disabled={domainLoading} style={{ padding: "8px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.15)", color: N, borderRadius: 100, fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Remove</button>
                      </div>
                    </div>

                    {domainError && <div style={{ marginBottom: 14, fontSize: 12, color: "#ff6b35" }}>{domainError}</div>}

                    {(!domainStatus?.verified || domainStatus?.misconfigured) && domainStatus?.requiredDnsRecords && (
                      <div style={{ padding: "14px 16px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, marginBottom: 14 }}>
                        <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>Add this DNS record at your domain's registrar:</div>
                        {domainStatus.requiredDnsRecords.map((rec, i) => (
                          <div key={i} style={{ display: "flex", gap: 16, fontFamily: "monospace", fontSize: 12, padding: "8px 0", borderTop: i > 0 ? "1px solid var(--border)" : "none", flexWrap: "wrap" as const }}>
                            <span style={{ color: "var(--muted-2)" }}>Type</span><span>{rec.type}</span>
                            <span style={{ color: "var(--muted-2)", marginLeft: 12 }}>Name</span><span>{rec.name}</span>
                            <span style={{ color: "var(--muted-2)", marginLeft: 12 }}>Value</span><span>{rec.value}</span>
                          </div>
                        ))}
                        <div style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 10 }}>DNS changes can take anywhere from a few minutes to a few hours to take effect. Click "Refresh Status" once you've added the record.</div>
                      </div>
                    )}

                    <div style={{ fontSize: 11, color: "var(--muted-2)" }}>To replace this domain, remove it first, then connect the new one.</div>
                  </>
                )}
              </div>
            )}
          </div>)}

          {tab === "analytics" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Analytics</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Visitors, conversion, and revenue trends.</p>
            <div style={{ ...sectionCard, textAlign: "center" as const, padding: "60px 20px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,107,53,0.08)", color: N, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><DashIcon name="analytics" size={22} /></div>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>Analytics is coming soon</h3>
              <p style={{ fontSize: 13, color: "var(--muted-2)", maxWidth: 360, margin: "0 auto" }}>Visitor tracking, conversion rate, and revenue trends are next on the roadmap. Orders and revenue are already tracked live on your Overview page.</p>
            </div>
          </div>)}

          {tab === "qrcode" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>QR Code</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>A scannable code customers can use to open your store.</p>
            <div style={{ ...sectionCard, textAlign: "center" as const, padding: "60px 20px" }}>
              <div style={{ width: 52, height: 52, borderRadius: 14, background: "rgba(255,107,53,0.08)", color: N, display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}><DashIcon name="qrcode" size={22} /></div>
              <h3 style={{ fontSize: 15, fontWeight: 800, marginBottom: 6 }}>QR codes are coming soon</h3>
              <p style={{ fontSize: 13, color: "var(--muted-2)", maxWidth: 360, margin: "0 auto 16px" }}>In the meantime, share your store link directly.</p>
              <button onClick={() => setShareModalOpen(true)} style={{ padding: "10px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Share Store</button>
            </div>
          </div>)}

          {tab === "checkout" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>{checkoutView === "shipping" ? "Shipping" : "Payments"}</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 16 }}>{checkoutView === "shipping" ? "Configure how customers receive their orders." : "Configure how customers pay for their orders."}</p>
            <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
              {([{ key: "payments" as const, label: "Payments" }, { key: "shipping" as const, label: "Shipping" }]).map((v) => (
                <button key={v.key} onClick={() => setCheckoutView(v.key)} style={{ padding: "8px 18px", background: checkoutView === v.key ? "rgba(255,107,53,0.08)" : "var(--panel)", border: checkoutView === v.key ? "1px solid rgba(255,107,53,0.15)" : "1px solid var(--border)", borderRadius: 100, color: checkoutView === v.key ? N : "var(--muted)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{v.label}</button>
              ))}
            </div>
            {checkoutView === "shipping" && (<>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Shipping Options</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 16 }}>Add delivery options customers can choose at checkout.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>Delivery Enabled</span>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, delivery_enabled: !checkoutConfig.delivery_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.delivery_enabled ? N : "var(--toggle-off)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.delivery_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
              {checkoutConfig.delivery_enabled && (<>
                {checkoutConfig.shipping_options.map((opt, i) => (<div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}><span style={{ flex: 1, padding: "10px 14px", background: "var(--panel-2)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 13, color: "var(--text)" }}>{opt.name} - <span style={{ color: N }}>R{opt.price}</span></span><button onClick={() => setCheckoutConfig({ ...checkoutConfig, shipping_options: checkoutConfig.shipping_options.filter((_, idx) => idx !== i) })} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,107,53,0.06)", border: "none", color: "#ff6b35", fontSize: 14, cursor: "pointer" }}>&times;</button></div>))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="text" placeholder="e.g. Standard Delivery" value={newShipName} onChange={(e) => setNewShipName(e.target.value)} style={{ flex: 1, padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  <input type="number" placeholder="Price" value={newShipPrice} onChange={(e) => setNewShipPrice(e.target.value)} style={{ width: 80, padding: "10px 14px", background: "var(--input-bg)", border: "1px solid var(--border)", borderRadius: 12, color: "var(--text)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  <button onClick={() => { if (newShipName.trim()) { setCheckoutConfig({ ...checkoutConfig, shipping_options: [...checkoutConfig.shipping_options, { name: newShipName.trim(), price: parseFloat(newShipPrice) || 0 }] }); setNewShipName(""); setNewShipPrice(""); } }} style={{ padding: "10px 20px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 12, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const }}>+ Add</button>
                </div>
              </>)}
            </div>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>Pickup Option</h3>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)", marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>Allow Pickup</span>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, pickup_enabled: !checkoutConfig.pickup_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.pickup_enabled ? N : "var(--toggle-off)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.pickup_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
              {checkoutConfig.pickup_enabled && (<div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}><div><label style={labelStyle}>Pickup Address</label><input type="text" value={checkoutConfig.pickup_address} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, pickup_address: e.target.value })} placeholder="e.g. 123 Main Street, Durban" style={inputStyle} /></div><div><label style={labelStyle}>Pickup Instructions</label><textarea value={checkoutConfig.pickup_instructions} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, pickup_instructions: e.target.value })} placeholder="e.g. Open Mon-Fri 9am-5pm." rows={3} style={{ ...inputStyle, resize: "vertical" as const }} /></div></div>)}
            </div>
            </>)}
            {checkoutView === "payments" && (<>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>EFT / Direct Deposit</h3>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)", marginBottom: 16 }}><span style={{ fontSize: 13 }}>Enable EFT Payments</span><button onClick={() => setCheckoutConfig({ ...checkoutConfig, eft_enabled: !checkoutConfig.eft_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.eft_enabled ? N : "var(--toggle-off)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.eft_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button></div>
              {checkoutConfig.eft_enabled && (<div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[{ k: "eft_bank_name" as const, l: "Bank Name", p: "e.g. Capitec Business" }, { k: "eft_account_number" as const, l: "Account Number", p: "e.g. 1053526750" }, { k: "eft_account_name" as const, l: "Account Name", p: "e.g. YOUR BRAND PTY LTD" }, { k: "eft_branch_code" as const, l: "Branch Code", p: "e.g. 450105" }, { k: "eft_account_type" as const, l: "Account Type", p: "e.g. Cheque / Savings / Business" }].map((f) => (<div key={f.k}><label style={labelStyle}>{f.l}</label><input type="text" value={checkoutConfig[f.k]} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, [f.k]: e.target.value })} placeholder={f.p} style={inputStyle} /></div>))}
                <div><label style={labelStyle}>Payment Instructions</label><textarea value={checkoutConfig.eft_instructions} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, eft_instructions: e.target.value })} placeholder={"e.g. After placing your order, please make payment within 24 hours using your order number as reference."} rows={6} style={{ ...inputStyle, resize: "vertical" as const }} /></div>
              </div>)}
            </div>
            <div style={sectionCard}>
              <h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)", marginBottom: 8 }}>PayFast</h3>
              <p style={{ fontSize: 12, color: "var(--muted-2)", marginBottom: 12 }}>Accept card payments. Enter your PayFast merchant credentials.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid var(--border)", marginBottom: 16 }}><span style={{ fontSize: 13 }}>Enable PayFast</span><button onClick={() => setCheckoutConfig({ ...checkoutConfig, payfast_enabled: !checkoutConfig.payfast_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.payfast_enabled ? N : "var(--toggle-off)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.payfast_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button></div>
              {checkoutConfig.payfast_enabled && (<div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}><div><label style={labelStyle}>Merchant ID</label><input type="text" value={checkoutConfig.payfast_merchant_id} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, payfast_merchant_id: e.target.value })} placeholder="Your PayFast Merchant ID" style={inputStyle} /></div><div><label style={labelStyle}>Merchant Key</label><input type="password" value={checkoutConfig.payfast_merchant_key} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, payfast_merchant_key: e.target.value })} placeholder="Your PayFast Merchant Key" style={inputStyle} /></div><p style={{ fontSize: 11, color: "var(--muted-2)" }}>Find these in your PayFast dashboard under Settings &gt; Integration.</p></div>)}
            </div>
            <div style={{ marginBottom: 24, padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 16 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><div><h3 style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.1em", color: "var(--muted)" }}>WhatsApp Checkout</h3><p style={{ fontSize: 11, color: "var(--muted-2)", marginTop: 4 }}>Allow customers to place orders via WhatsApp message</p></div><button onClick={() => setCheckoutConfig({ ...checkoutConfig, whatsapp_checkout_enabled: !checkoutConfig.whatsapp_checkout_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.whatsapp_checkout_enabled ? "#25d366" : "var(--toggle-off)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.whatsapp_checkout_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button></div>
            </div>
            </>)}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={async () => { if (!seller) return; setCheckoutSaving(true); setCheckoutSaved(false); await supabase.from("sellers").update({ checkout_config: checkoutConfig }).eq("id", seller.id); setSeller({ ...seller, checkout_config: checkoutConfig }); setCheckoutSaving(false); setCheckoutSaved(true); setTimeout(() => setCheckoutSaved(false), 3000); revalidateMyStore(); }} disabled={checkoutSaving} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: checkoutSaving ? "not-allowed" : "pointer", opacity: checkoutSaving ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{checkoutSaving ? "Saving..." : "Save Checkout Settings"}</button>
              {checkoutSaved && <span style={{ color: N, fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const }}>Saved!</span>}
            </div>
          </div>)}

        </main>
      </div>

      {shareModalOpen && seller?.subdomain && (
        <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
          <div onClick={() => setShareModalOpen(false)} style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.55)" }} />
          <div style={{ position: "relative", width: "min(400px, 100%)", background: "var(--panel-solid)", border: "1px solid var(--border)", borderRadius: 20, padding: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800 }}>Share Your Store</h3>
              <button onClick={() => setShareModalOpen(false)} style={{ background: "none", border: "none", color: "var(--muted-2)", cursor: "pointer", padding: 4 }}><DashIcon name="external" size={16} /></button>
            </div>
            <div style={{ padding: "12px 14px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: 12, fontSize: 12, color: "var(--text)", wordBreak: "break-all" as const, marginBottom: 14 }}>{canonicalStoreUrl(seller.subdomain)}</div>
            <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
              <button onClick={() => { navigator.clipboard.writeText(canonicalStoreUrl(seller.subdomain!)); setLinkCopied(true); setTimeout(() => setLinkCopied(false), 2000); }} style={{ flex: 1, padding: "12px 0", background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text)", borderRadius: 100, fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{linkCopied ? "Copied!" : "Copy Link"}</button>
              <a href={`https://wa.me/?text=${encodeURIComponent("Check out my store: " + canonicalStoreUrl(seller.subdomain))}`} target="_blank" rel="noreferrer" style={{ flex: 1, padding: "12px 0", background: "#25d366", color: "#fff", borderRadius: 100, fontSize: 12, fontWeight: 800, textDecoration: "none", textAlign: "center" as const, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>WhatsApp</a>
            </div>
            <a href={canonicalStoreUrl(seller.subdomain)} target="_blank" style={{ display: "block", textAlign: "center" as const, padding: "10px 0", color: "var(--muted-2)", fontSize: 11, textDecoration: "underline", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Preview Store</a>
          </div>
        </div>
      )}
    </div>
  );
}
