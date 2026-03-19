"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

interface Variant { name: string; options: string[]; }

interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string;
}

interface StoreConfig {
  show_banner_text: boolean; show_marquee: boolean; show_collections: boolean;
  show_about: boolean; show_trust_bar: boolean; show_policies: boolean;
  show_newsletter: boolean; announcement: string;
  marquee_texts: string[]; trust_items: { icon: string; title: string; desc: string }[];
  policy_items: { title: string; desc: string }[];
}

interface CheckoutConfig {
  eft_enabled: boolean; eft_bank_name: string; eft_account_number: string; eft_account_name: string;
  eft_branch_code: string; eft_account_type: string; eft_instructions: string;
  payfast_enabled: boolean; payfast_merchant_id: string; payfast_merchant_key: string;
  delivery_enabled: boolean; pickup_enabled: boolean; pickup_address: string; pickup_instructions: string;
  shipping_options: { name: string; price: number }[];
}

interface Seller {
  id: string; email: string; store_name: string; whatsapp_number: string; subdomain: string;
  template: string; plan: string; primary_color: string; logo_url: string; banner_url: string;
  tagline: string; description: string; collections: string[];
  social_links: SocialLinks; store_config: StoreConfig; checkout_config: CheckoutConfig;
}

interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean;
  status: string;
}

interface Order {
  id: string; order_number: number; customer_name: string; customer_phone: string;
  customer_email: string;
  items: { name: string; qty: number; price: number; variant?: string }[]; total: number;
  status: string; payment_status: string; created_at: string;
  shipping_address: { address: string; apartment?: string; city: string; province: string; postal_code: string } | null;
  fulfillment_method: string; shipping_option: string; shipping_cost: number; payment_method: string;
}

const TEMPLATES = [
  { id: "clean-minimal", name: "Clean Minimal", desc: "White editorial design with sharp typography", colors: { bg: "#fafafa", card: "#ffffff", text: "#111111" } },
  { id: "warm-earthy", name: "Warm & Earthy", desc: "Organic tones with terracotta accents", colors: { bg: "#faf6f1", card: "#ffffff", text: "#3d2e22" } },
  { id: "soft-luxury", name: "Soft Luxury", desc: "Muted pastels with rounded, elegant feel", colors: { bg: "#f8f5f2", card: "#ffffff", text: "#2d2d3a" } },
  { id: "glass-futuristic", name: "Glass Futuristic", desc: "Dark theme with neon accents", colors: { bg: "#0a0a12", card: "rgba(255,255,255,0.04)", text: "#eeeef2" } },
];

const COLOR_PRESETS = ["#ff6b35", "#ff3d6e", "#111111", "#00d4aa", "#8b5cf6", "#e74c3c", "#2563eb", "#d4a017", "#16a34a", "#ec4899"];

export default function Dashboard() {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "products" | "orders" | "mystore" | "checkout">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productFilter, setProductFilter] = useState<"published" | "draft" | "trashed">("published");
  const [searchQuery, setSearchQuery] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formImages, setFormImages] = useState<File[]>([]);
  const [formPreviews, setFormPreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [formVariants, setFormVariants] = useState<Variant[]>([]);
  const [formSaving, setFormSaving] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [storeTemplate, setStoreTemplate] = useState("clean-minimal");
  const [storeColor, setStoreColor] = useState("#ff6b35");
  const [storeTagline, setStoreTagline] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [storeCollections, setStoreCollections] = useState<string[]>([]);
  const [newCollection, setNewCollection] = useState("");
  const [socialLinks, setSocialLinks] = useState<SocialLinks>({});
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({ show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "", marquee_texts: ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: [{ icon: "â˜…", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "âœˆ", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "â†º", title: "Easy Returns", desc: "14-day policy" }, { icon: "âš¡", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy on unworn items." }, { title: "Payment", desc: "All major cards via Yoco + WhatsApp checkout." }] });
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaved, setStoreSaved] = useState(false);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig>({ eft_enabled: false, eft_bank_name: "", eft_account_number: "", eft_account_name: "", eft_branch_code: "", eft_account_type: "", eft_instructions: "", payfast_enabled: false, payfast_merchant_id: "", payfast_merchant_key: "", delivery_enabled: true, pickup_enabled: false, pickup_address: "", pickup_instructions: "", shipping_options: [] });
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutSaved, setCheckoutSaved] = useState(false);
  const [newShipName, setNewShipName] = useState("");
  const [newShipPrice, setNewShipPrice] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { checkAuth(); }, []);

  const switchTab = (t: "overview" | "products" | "orders" | "mystore" | "checkout") => { setTab(t); setSidebarOpen(false); };

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: sd } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (sd) { setSeller(sd); setStoreTemplate(sd.template || "clean-minimal"); setStoreColor(sd.primary_color || "#ff6b35"); setStoreTagline(sd.tagline || ""); setStoreDescription(sd.description || ""); setLogoPreview(sd.logo_url || ""); setBannerPreview(sd.banner_url || ""); setStoreCollections(sd.collections || []); setSocialLinks(sd.social_links || {}); const c = sd.store_config || {} as any; setStoreConfig({ show_banner_text: c.show_banner_text !== false, show_marquee: c.show_marquee !== false, show_collections: c.show_collections !== false, show_about: c.show_about !== false, show_trust_bar: c.show_trust_bar !== false, show_policies: c.show_policies !== false, show_newsletter: !!c.show_newsletter, announcement: c.announcement || "", marquee_texts: c.marquee_texts?.length ? c.marquee_texts : ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: c.trust_items?.length ? c.trust_items : [{ icon: "\u2605", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "\u2708", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "\u21BA", title: "Easy Returns", desc: "14-day policy" }, { icon: "\u26A1", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: c.policy_items?.length ? c.policy_items : [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy." }, { title: "Payment", desc: "Cards via Yoco + WhatsApp checkout." }] }); const cc = sd.checkout_config || {} as any; setCheckoutConfig({ eft_enabled: !!cc.eft_enabled, eft_bank_name: cc.eft_bank_name || "", eft_account_number: cc.eft_account_number || "", eft_account_name: cc.eft_account_name || "", eft_branch_code: cc.eft_branch_code || "", eft_account_type: cc.eft_account_type || "", eft_instructions: cc.eft_instructions || "", payfast_enabled: !!cc.payfast_enabled, payfast_merchant_id: cc.payfast_merchant_id || "", payfast_merchant_key: cc.payfast_merchant_key || "", delivery_enabled: cc.delivery_enabled !== false, pickup_enabled: !!cc.pickup_enabled, pickup_address: cc.pickup_address || "", pickup_instructions: cc.pickup_instructions || "", shipping_options: cc.shipping_options || [] }); }
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (pd) setProducts(pd);
    const { data: od } = await supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (od) setOrders(od);
    setLoading(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { alert("Logo must be under 5MB"); return; } setLogoFile(f); const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); };
  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { alert("Banner must be under 5MB"); return; } setBannerFile(f); const r = new FileReader(); r.onload = (ev) => setBannerPreview(ev.target?.result as string); r.readAsDataURL(f); };

  const saveStoreSettings = async () => {
    if (!seller) return; setStoreSaving(true); setStoreSaved(false);
    let logoUrl = seller.logo_url || ""; let bannerUrl = seller.banner_url || "";
    if (logoFile) { const ext = logoFile.name.split(".").pop(); const path = seller.id + "/logo." + ext; await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); logoUrl = data.publicUrl + "?t=" + Date.now(); }
    if (bannerFile) { const ext = bannerFile.name.split(".").pop(); const path = seller.id + "/banner." + ext; await supabase.storage.from("store-assets").upload(path, bannerFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); bannerUrl = data.publicUrl + "?t=" + Date.now(); }
    const { error } = await supabase.from("sellers").update({ template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl, banner_url: bannerUrl, collections: storeCollections, social_links: socialLinks, store_config: storeConfig }).eq("id", seller.id);
    if (!error) { setSeller({ ...seller, template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl, banner_url: bannerUrl, collections: storeCollections, social_links: socialLinks, store_config: storeConfig }); setLogoFile(null); setBannerFile(null); setStoreSaved(true); setTimeout(() => setStoreSaved(false), 3000); }
    setStoreSaving(false);
  };

  const resetForm = () => { setFormName(""); setFormPrice(""); setFormCategory(""); setFormImages([]); setFormPreviews([]); setExistingImages([]); setFormVariants([]); setUploadProgress(""); setEditingId(null); setShowForm(false); };
  const startEdit = (p: Product) => { setEditingId(p.id); setFormName(p.name); setFormPrice(String(p.price)); setFormCategory(p.category || ""); setFormImages([]); setFormPreviews([]); setExistingImages(p.images || []); setFormVariants(p.variants || []); setShowForm(true); };

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
    if (formImages.length + existingImages.length + files.length > 20) { alert("Maximum 20 images"); return; }
    const valid = files.filter((f) => { if (!f.type.startsWith("image/")) return false; if (f.size > 5*1024*1024) { alert(f.name + " too large"); return false; } return true; });
    setFormImages((p) => [...p, ...valid]);
    valid.forEach((file) => { const r = new FileReader(); r.onload = (ev) => setFormPreviews((p) => [...p, ev.target?.result as string]); r.readAsDataURL(file); });
  };
  const removeNewImage = (i: number) => { setFormImages((p) => p.filter((_, idx) => idx !== i)); setFormPreviews((p) => p.filter((_, idx) => idx !== i)); };
  const removeExistingImage = (i: number) => setExistingImages((p) => p.filter((_, idx) => idx !== i));

  const uploadImages = async (sellerId: string, productId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (let i = 0; i < formImages.length; i++) {
      const file = formImages[i]; const ext = file.name.split(".").pop(); const path = sellerId + "/" + productId + "/" + Date.now() + "-" + i + "." + ext;
      setUploadProgress("Uploading " + (i + 1) + " of " + formImages.length + "...");
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (!error) { const { data } = supabase.storage.from("product-images").getPublicUrl(path); urls.push(data.publicUrl); }
    }
    return urls;
  };

  const cleanVariants = (v: Variant[]): Variant[] => v.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), options: x.options.filter((o) => o.trim()).map((o) => o.trim()) })).filter((x) => x.options.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormSaving(true); setUploadProgress("");
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const cv = cleanVariants(formVariants);
    if (editingId) {
      let allImages = [...existingImages];
      if (formImages.length > 0) { const newUrls = await uploadImages(user.id, editingId); allImages = [...allImages, ...newUrls]; }
      const { error } = await supabase.from("products").update({ name: formName, price: parseFloat(formPrice), category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv }).eq("id", editingId);
      if (!error) setProducts(products.map((p) => p.id === editingId ? { ...p, name: formName, price: parseFloat(formPrice), category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv } : p));
    } else {
      const { data, error } = await supabase.from("products").insert({ seller_id: user.id, name: formName, price: parseFloat(formPrice), category: formCategory, in_stock: true, variants: cv, status: "published" }).select().single();
      if (error || !data) { setFormSaving(false); return; }
      let imageUrls: string[] = [];
      if (formImages.length > 0) { imageUrls = await uploadImages(user.id, data.id); await supabase.from("products").update({ images: imageUrls, image_url: imageUrls[0] || null }).eq("id", data.id); }
      setProducts([{ ...data, images: imageUrls, image_url: imageUrls[0] || null, variants: cv }, ...products]);
    }
    resetForm(); setFormSaving(false);
  };

  const toggleStock = async (id: string, cur: boolean) => { await supabase.from("products").update({ in_stock: !cur }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, in_stock: !cur } : p)); };
  const trashProduct = async (id: string) => { await supabase.from("products").update({ status: "trashed" }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, status: "trashed" } : p)); };
  const restoreProduct = async (id: string) => { await supabase.from("products").update({ status: "published" }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, status: "published" } : p)); };
  const deleteForever = async (id: string) => { if (!confirm("Permanently delete this product? This cannot be undone.")) return; await supabase.from("products").delete().eq("id", id); setProducts(products.filter((p) => p.id !== id)); };
  const toggleDraft = async (id: string, currentStatus: string) => { const newStatus = currentStatus === "draft" ? "published" : "draft"; await supabase.from("products").update({ status: newStatus }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, status: newStatus } : p)); };
  const emptyTrash = async () => { if (!confirm("Permanently delete all trashed products? This cannot be undone.")) return; const trashed = products.filter((p) => p.status === "trashed"); for (const p of trashed) { await supabase.from("products").delete().eq("id", p.id); } setProducts(products.filter((p) => p.status !== "trashed")); };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "#ff6b35", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: "rgba(245,245,245,0.35)", marginTop: 16 }}>Loading dashboard...</p>
    </div>
  );

  const publishedCount = products.filter((p) => p.status === "published" || !p.status).length;
  const draftCount = products.filter((p) => p.status === "draft").length;
  const trashedCount = products.filter((p) => p.status === "trashed").length;

  const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString());
  const totalRevenue = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
  const totalImageSlots = existingImages.length + formImages.length;

  const filteredProducts = products.filter((p) => {
    const status = p.status || "published";
    if (status !== productFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
    }
    return true;
  });

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

  return (
    <>
      <style>{`
        @media (min-width: 769px) { .mobile-topbar { display: none !important; } .sidebar-overlay { display: none !important; } .sidebar { transform: translateX(0) !important; } .main-content { margin-left: 260px !important; } }
        @media (max-width: 768px) { .sidebar { transform: translateX(-100%); } .sidebar.open { transform: translateX(0) !important; } .main-content { margin-left: 0 !important; padding: 16px !important; padding-top: 72px !important; } .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } .form-grid-3 { grid-template-columns: 1fr !important; } .actions-grid { grid-template-columns: 1fr !important; } .product-row-inner { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; } .product-actions { flex-wrap: wrap !important; } .templates-grid { grid-template-columns: 1fr !important; } .logo-banner-grid { grid-template-columns: 1fr !important; } }
        @keyframes spin{to{transform:rotate(360deg)}}
      `}</style>

      <div style={{ minHeight: "100vh", background: "#030303", display: "flex", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5" }}>

        {/* MOBILE TOP BAR */}
        <div className="mobile-topbar" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 90, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 20px", background: "rgba(3,3,3,0.9)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <button onClick={() => setSidebarOpen(true)} style={{ width: 40, height: 40, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#9776;</button>
          <div style={{ fontSize: 14, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const }}>
            CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
          </div>
          <div style={{ width: 40 }} />
        </div>

        {/* SIDEBAR OVERLAY */}
        {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", zIndex: 99 }} />}

        {/* SIDEBAR */}
        <aside className={"sidebar" + (sidebarOpen ? " open" : "")} style={{ width: 260, borderRight: "1px solid rgba(255,255,255,0.05)", padding: "24px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "fixed", top: 0, left: 0, bottom: 0, background: "#080808", zIndex: 100, transition: "transform 0.3s ease" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const }}>
                CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
              </div>
              <button onClick={() => setSidebarOpen(false)} style={{ width: 32, height: 32, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(245,245,245,0.4)", fontSize: 16, cursor: "pointer", display: "none" }} className="mobile-close">&#10005;</button>
            </div>

            <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "-0.02em" }}>{seller?.store_name || "My Store"}</div>
              <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 }}>{seller?.plan || "Free"} plan</div>
            </div>

            <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {(["overview", "products", "orders", "mystore", "checkout"] as const).map((t) => (
                <button key={t} onClick={() => switchTab(t)} style={{ width: "100%", padding: "12px 16px", background: tab === t ? "rgba(255,107,53,0.06)" : "transparent", border: tab === t ? "1px solid rgba(255,107,53,0.1)" : "1px solid transparent", borderRadius: 10, color: tab === t ? "#f5f5f5" : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 13, fontWeight: tab === t ? 700 : 500, textAlign: "left" as const, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", transition: "all 0.2s" }}>
                  {t === "overview" ? "Overview" : t === "products" ? "Products (" + publishedCount + ")" : t === "orders" ? "Orders (" + orders.length + ")" : t === "mystore" ? "My Store" : "Checkout"}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {seller?.subdomain && <a href={"/store/" + seller.subdomain} target="_blank" style={{ display: "block", padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 10, color: N, fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>View My Store</a>}
            <button onClick={handleLogout} style={{ padding: "10px 16px", background: "transparent", border: "none", color: "rgba(245,245,245,0.25)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, cursor: "pointer", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Log Out</button>
          </div>
        </aside>

        <main className="main-content" style={{ flex: 1, marginLeft: 260, padding: "36px 40px" }}>

          {/* OVERVIEW */}
          {tab === "overview" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Welcome back, {seller?.store_name}</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Here is a quick look at your store.</p>
            <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 40 }}>
              {[{ n: publishedCount, l: "Published" }, { n: orders.length, l: "Total Orders" }, { n: todayOrders.length, l: "Orders Today" }, { n: "R" + totalRevenue.toFixed(0), l: "Revenue", c: N }].map((s, i) => (
                <div key={i} style={{ padding: "20px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}>
                  <div style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: s.c || "#f5f5f5" }}>{s.n}</div>
                  <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 16 }}>Quick Actions</h3>
            <div className="actions-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[{ icon: "+", label: "Add Product", fn: () => { switchTab("products"); resetForm(); setShowForm(true); } }, { icon: "\u2630", label: "View Orders", fn: () => switchTab("orders") }, { icon: "\u2699", label: "Customize", fn: () => switchTab("mystore") }].map((a, i) => (
                <button key={i} onClick={a.fn} style={{ padding: "20px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, color: "#f5f5f5", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                  <span style={{ fontSize: 24 }}>{a.icon}</span><span>{a.label}</span>
                </button>
              ))}
            </div>
          </div>)}

          {/* PRODUCTS */}
          {tab === "products" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Products</h1><p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 16 }}>Manage the products in your store.</p></div>
              <button onClick={() => { if (showForm) resetForm(); else { resetForm(); setShowForm(true); setProductFilter("published"); } }} style={{ padding: "12px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const }}>{showForm ? "Cancel" : "+ Add Product"}</button>
            </div>

            {/* STATUS TABS */}
            <div style={{ display: "flex", gap: 6, marginBottom: 16, flexWrap: "wrap" as const }}>
              {([
                { key: "published" as const, label: "Published", count: publishedCount },
                { key: "draft" as const, label: "Drafts", count: draftCount },
                { key: "trashed" as const, label: "Trash", count: trashedCount },
              ]).map((f) => (
                <button key={f.key} onClick={() => { setProductFilter(f.key); setSearchQuery(""); }} style={{ padding: "8px 16px", background: productFilter === f.key ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.02)", border: productFilter === f.key ? "1px solid rgba(255,107,53,0.15)" : "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: productFilter === f.key ? N : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "flex", gap: 6, alignItems: "center" }}>
                  {f.label} <span style={{ background: productFilter === f.key ? "rgba(255,107,53,0.15)" : "rgba(255,255,255,0.06)", padding: "2px 8px", borderRadius: 100, fontSize: 10 }}>{f.count}</span>
                </button>
              ))}
            </div>

            {/* SEARCH */}
            <div style={{ marginBottom: 20 }}>
              <input type="text" placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ width: "100%", maxWidth: 400, padding: "11px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
            </div>

            {/* EMPTY TRASH BUTTON */}
            {productFilter === "trashed" && trashedCount > 0 && (
              <div style={{ marginBottom: 16 }}>
                <button onClick={emptyTrash} style={{ padding: "8px 18px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.15)", borderRadius: 100, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Empty Trash</button>
              </div>
            )}

            {showForm && (<div style={{ padding: "24px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, marginBottom: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 16 }}>{editingId ? "Edit Product" : "New Product"}</h3>
              <form onSubmit={handleSubmit}>
                <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Name</label>
                    <input type="text" placeholder="e.g. Oversized Graphic Tee" value={formName} onChange={(e) => setFormName(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Price (Rands)</label>
                    <input type="number" placeholder="e.g. 349" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Collection</label>
                    {storeCollections.length > 0 ? (
                      <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const }}>
                        <option value="" style={{ background: "#080808" }}>No collection</option>
                        {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "#080808" }}>{c}</option>))}
                      </select>
                    ) : (
                      <input type="text" placeholder="Create collections in My Store" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                    )}
                  </div>
                </div>

                {/* Images */}
                <div style={{ marginTop: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Images (max 20)</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {existingImages.map((url, i) => (<div key={"e" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeExistingImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && formImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {formPreviews.map((p, i) => (<div key={"n" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeNewImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && existingImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {totalImageSlots < 20 && (<button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 2 }}><span style={{ fontSize: 20, color: "rgba(245,245,245,0.2)" }}>+</span><span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Photo</span></button>)}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                  </div>
                </div>

                {/* Variants */}
                <div style={{ marginTop: 24 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Variants (optional)</label>
                  {formVariants.length === 0 && (<div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 16, flexWrap: "wrap" as const }}>{PRESET_VARIANTS.map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Custom</button></div>)}
                  {formVariants.map((v, vi) => (<div key={vi} style={{ padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, marginBottom: 10, marginTop: 8 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap" as const, gap: 8 }}>
                      <input type="text" placeholder="Variant name" value={v.name} onChange={(e) => updateVariantName(vi, e.target.value)} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 13, fontWeight: 700, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", maxWidth: 200 }} />
                      <button type="button" onClick={() => removeVariant(vi)} style={{ padding: "6px 12px", background: "transparent", border: "1px solid rgba(255,61,110,0.2)", borderRadius: 8, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const }}>Remove</button>
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                      {v.options.map((o, oi) => (<div key={oi} style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}><input type="text" placeholder="e.g. Large" value={o} onChange={(e) => updateVariantOption(vi, oi, e.target.value)} style={{ width: 80, padding: "8px 10px", background: "transparent", border: "none", color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />{v.options.length > 1 && <button type="button" onClick={() => removeVariantOption(vi, oi)} style={{ padding: 8, background: "transparent", border: "none", borderLeft: "1px solid rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.2)", fontSize: 10, cursor: "pointer" }}>&#10005;</button>}</div>))}
                      <button type="button" onClick={() => addVariantOption(vi)} style={{ padding: "8px 12px", background: "transparent", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(245,245,245,0.25)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>+ Add</button>
                    </div>
                  </div>))}
                  {formVariants.length > 0 && (<div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" as const }}>{PRESET_VARIANTS.filter((p) => !formVariants.some((v) => v.name.toLowerCase() === p.name.toLowerCase())).map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Custom</button></div>)}
                </div>

                {uploadProgress && <div style={{ marginTop: 12, fontSize: 12, color: N }}>{uploadProgress}</div>}
                <button type="submit" disabled={formSaving} style={{ width: "100%", padding: "14px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: formSaving ? "not-allowed" : "pointer", opacity: formSaving ? 0.6 : 1, marginTop: 20, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{formSaving ? "Saving..." : editingId ? "Save Changes" : "Save Product"}</button>
              </form>
            </div>)}

            {filteredProducts.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}>
                <p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>
                  {productFilter === "trashed" ? "Trash is empty" : productFilter === "draft" ? "No drafts" : searchQuery ? "No results" : "No products yet"}
                </p>
                <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>
                  {productFilter === "trashed" ? "Products you delete will appear here for recovery." : productFilter === "draft" ? "Draft products won't be visible to customers." : searchQuery ? "Try a different search term." : "Add your first product to get your store going."}
                </p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {filteredProducts.map((product) => (
                  <div key={product.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, flexWrap: "wrap" as const, gap: 12, opacity: product.status === "trashed" ? 0.6 : 1 }} className="product-row-inner">
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1, minWidth: 0 }}>
                      {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" as const, border: "1px solid rgba(255,255,255,0.06)", flexShrink: 0 }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><span style={{ fontSize: 16, color: "rgba(245,245,245,0.1)" }}>&#9633;</span></div>}
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, textTransform: "uppercase" as const, letterSpacing: "-0.01em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" as const }}>{product.name}</div>
                        <div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.04em", fontWeight: 600, flexWrap: "wrap" as const }}>
                          {product.category && <span>{product.category}</span>}
                          {product.status === "draft" && <span style={{ color: "#fbbf24" }}>Draft</span>}
                          {product.status !== "trashed" && <span style={{ color: product.in_stock ? N : "#ff3d6e" }}>{product.in_stock ? "In Stock" : "Sold Out"}</span>}
                          {product.images?.length > 0 && <span>{product.images.length} photo{product.images.length !== 1 ? "s" : ""}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em", whiteSpace: "nowrap" as const }}>R{product.price}</div>
                    <div className="product-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" as const }}>
                      {productFilter === "trashed" ? (
                        <>
                          <button onClick={() => restoreProduct(product.id)} style={{ padding: "7px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Restore</button>
                          <button onClick={() => deleteForever(product.id)} style={{ padding: "7px 12px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.12)", borderRadius: 8, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Delete Forever</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => startEdit(product)} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Edit</button>
                          <button onClick={() => toggleDraft(product.id, product.status || "published")} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: product.status === "draft" ? "#fbbf24" : "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{product.status === "draft" ? "Publish" : "Draft"}</button>
                          <button onClick={() => toggleStock(product.id, product.in_stock)} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{product.in_stock ? "Sold Out" : "In Stock"}</button>
                          <button onClick={() => trashProduct(product.id)} style={{ padding: "7px 12px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Trash</button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>)}

          {/* ORDERS */}
          {tab === "orders" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Orders</h1><p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Track and manage incoming orders.</p></div>
              {selectedOrder && <button onClick={() => setSelectedOrder(null)} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>&larr; All Orders</button>}
            </div>

            {selectedOrder ? (
              <div>
                <div style={{ padding: "24px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase" as const }}>Order #{selectedOrder.order_number}</h2>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.25)" }}>{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  </div>

                  {/* STATUS CONTROLS */}
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" as const }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, alignSelf: "center", marginRight: 4 }}>Payment:</label>
                    {["awaiting_payment", "paid", "refunded"].map((s) => (
                      <button key={s} onClick={async () => { await supabase.from("orders").update({ payment_status: s }).eq("id", selectedOrder.id); const updated = { ...selectedOrder, payment_status: s }; setSelectedOrder(updated); setOrders(orders.map((o) => o.id === selectedOrder.id ? updated : o)); }} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: selectedOrder.payment_status === s ? (s === "paid" ? "rgba(34,197,94,0.15)" : s === "refunded" ? "rgba(255,61,110,0.1)" : "rgba(251,191,36,0.1)") : "rgba(255,255,255,0.03)", color: selectedOrder.payment_status === s ? (s === "paid" ? "#22c55e" : s === "refunded" ? "#ff3d6e" : "#fbbf24") : "rgba(245,245,245,0.25)" }}>{s.replace("_", " ")}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" as const }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, alignSelf: "center", marginRight: 4 }}>Status:</label>
                    {["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                      <button key={s} onClick={async () => { await supabase.from("orders").update({ status: s }).eq("id", selectedOrder.id); const updated = { ...selectedOrder, status: s }; setSelectedOrder(updated); setOrders(orders.map((o) => o.id === selectedOrder.id ? updated : o)); }} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: selectedOrder.status === s ? (s === "delivered" ? "rgba(34,197,94,0.15)" : s === "cancelled" ? "rgba(255,61,110,0.1)" : s === "shipped" ? "rgba(37,99,235,0.1)" : s === "confirmed" || s === "processing" ? "rgba(255,107,53,0.08)" : "rgba(251,191,36,0.1)") : "rgba(255,255,255,0.03)", color: selectedOrder.status === s ? (s === "delivered" ? "#22c55e" : s === "cancelled" ? "#ff3d6e" : s === "shipped" ? "#2563eb" : s === "confirmed" || s === "processing" ? N : "#fbbf24") : "rgba(245,245,245,0.25)" }}>{s}</button>
                    ))}
                  </div>
                </div>

                {/* CUSTOMER INFO */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 16 }}>
                  <div style={{ padding: "20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12, color: N }}>Customer</h3>
                    <div style={{ fontSize: 14, marginBottom: 6, fontWeight: 600 }}>{selectedOrder.customer_name || "N/A"}</div>
                    {selectedOrder.customer_email && <div style={{ fontSize: 13, color: "rgba(245,245,245,0.35)", marginBottom: 4 }}>{selectedOrder.customer_email}</div>}
                    {selectedOrder.customer_phone && <div style={{ fontSize: 13, color: "rgba(245,245,245,0.35)" }}>{selectedOrder.customer_phone}</div>}
                  </div>
                  <div style={{ padding: "20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16 }}>
                    <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12, color: N }}>{selectedOrder.fulfillment_method === "pickup" ? "Pickup" : "Delivery"}</h3>
                    {selectedOrder.fulfillment_method === "pickup" ? (
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.35)" }}>Customer will pick up</div>
                    ) : selectedOrder.shipping_address ? (
                      <div style={{ fontSize: 13, color: "rgba(245,245,245,0.35)", lineHeight: 1.6 }}>
                        {selectedOrder.shipping_address.address}{selectedOrder.shipping_address.apartment ? ", " + selectedOrder.shipping_address.apartment : ""}<br />
                        {selectedOrder.shipping_address.city}, {selectedOrder.shipping_address.province}<br />
                        {selectedOrder.shipping_address.postal_code}
                      </div>
                    ) : <div style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>No address provided</div>}
                    {selectedOrder.shipping_option && <div style={{ fontSize: 11, color: "rgba(245,245,245,0.2)", marginTop: 8, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{selectedOrder.shipping_option} {selectedOrder.shipping_cost > 0 ? "- R" + selectedOrder.shipping_cost : ""}</div>}
                  </div>
                </div>

                {/* ORDER ITEMS */}
                <div style={{ padding: "20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16 }}>
                  <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16, color: N }}>Order Items</h3>
                  {(selectedOrder.items || []).map((item, i) => (
                    <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: i < selectedOrder.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                        {item.variant && <div style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>{item.variant}</div>}
                        <div style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>Qty: {item.qty}</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>R{(item.price * item.qty).toFixed(0)}</div>
                    </div>
                  ))}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, marginTop: 8 }}>
                    {selectedOrder.shipping_cost > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(245,245,245,0.25)", marginBottom: 6 }}><span>Shipping</span><span>R{selectedOrder.shipping_cost}</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}><span>Total</span><span>R{selectedOrder.total}</span></div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Payment: {selectedOrder.payment_method || "N/A"}</div>
                </div>
              </div>
            ) : orders.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No orders yet</p><p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>Orders will appear here when customers buy from your store.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {orders.map((order) => (
                  <div key={order.id} onClick={() => setSelectedOrder(order)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, flexWrap: "wrap" as const, gap: 12, cursor: "pointer", transition: "border-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.15)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"}>
                    <div><div style={{ fontSize: 13, fontWeight: 700, marginBottom: 3, textTransform: "uppercase" as const }}>Order #{order.order_number}</div><div style={{ display: "flex", gap: 10, fontSize: 10, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.04em", fontWeight: 600 }}><span>{order.customer_name || "Customer"}</span><span>{new Date(order.created_at).toLocaleDateString()}</span></div></div>
                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em" }}>R{order.total}</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: order.payment_status === "paid" ? "rgba(34,197,94,0.1)" : "rgba(251,191,36,0.08)", color: order.payment_status === "paid" ? "#22c55e" : "#fbbf24" }}>{order.payment_status?.replace("_", " ")}</span>
                      <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: order.status === "delivered" ? "rgba(34,197,94,0.1)" : order.status === "shipped" ? "rgba(37,99,235,0.1)" : order.status === "confirmed" || order.status === "processing" ? "rgba(255,107,53,0.08)" : "rgba(251,191,36,0.08)", color: order.status === "delivered" ? "#22c55e" : order.status === "shipped" ? "#2563eb" : order.status === "confirmed" || order.status === "processing" ? N : "#fbbf24" }}>{order.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>)}

          {/* MY STORE */}
          {tab === "mystore" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>My Store</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Customize how your store looks to customers.</p>

            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Choose Template</h3>
              <div className="templates-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
                {TEMPLATES.map((t) => (<button key={t.id} onClick={() => setStoreTemplate(t.id)} style={{ padding: 0, border: storeTemplate === t.id ? "2px solid " + N : "2px solid rgba(255,255,255,0.06)", borderRadius: 14, background: "rgba(255,255,255,0.02)", cursor: "pointer", overflow: "hidden", textAlign: "left" as const }}>
                  <div style={{ height: 80, background: t.colors.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: 12 }}>
                    {[1,2,3].map((n) => <div key={n} style={{ width: 36, height: 48, borderRadius: 4, background: t.colors.card, border: "1px solid " + (t.id === "glass-futuristic" ? "rgba(255,255,255,0.08)" : "#eee") }} />)}
                  </div>
                  <div style={{ padding: "10px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 12, fontWeight: 800, color: "#f5f5f5", textTransform: "uppercase" as const }}>{t.name}</span>{storeTemplate === t.id && <span style={{ fontSize: 9, color: N, fontWeight: 800, textTransform: "uppercase" as const }}>Selected</span>}</div>
                    <p style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", marginTop: 3 }}>{t.desc}</p>
                  </div>
                </button>))}
              </div>
            </div>

            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Brand Color</h3>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, alignItems: "center" }}>
                {COLOR_PRESETS.map((c) => (<button key={c} onClick={() => setStoreColor(c)} style={{ width: 36, height: 36, borderRadius: 10, background: c, border: storeColor === c ? "3px solid #fff" : "3px solid transparent", cursor: "pointer", boxShadow: storeColor === c ? "0 0 0 2px " + c : "none" }} />))}
                <input type="color" value={storeColor} onChange={(e) => setStoreColor(e.target.value)} style={{ width: 36, height: 36, borderRadius: 10, border: "none", cursor: "pointer", background: "transparent" }} />
              </div>
            </div>

            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Logo & Banner</h3>
              <div className="logo-banner-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Store Logo</label>
                  <div onClick={() => logoInputRef.current?.click()} style={{ marginTop: 8, width: 100, height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Upload</span>}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} style={{ display: "none" }} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Store Banner</label>
                  <div onClick={() => bannerInputRef.current?.click()} style={{ marginTop: 8, width: "100%", height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                    {bannerPreview ? <img src={bannerPreview} alt="Banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Upload</span>}
                  </div>
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerSelect} style={{ display: "none" }} />
                </div>
              </div>
            </div>

            {/* COLLECTIONS */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Collections</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Organize your products into collections. Customers can browse by collection on your store.</p>
              
              <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" as const }}>
                <input type="text" placeholder="e.g. Summer Drop, Essentials, New Arrivals" value={newCollection} onChange={(e) => setNewCollection(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); const name = newCollection.trim(); if (name && !storeCollections.includes(name)) { setStoreCollections([...storeCollections, name]); setNewCollection(""); } } }} style={{ flex: 1, minWidth: 200, padding: "11px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                <button type="button" onClick={() => { const name = newCollection.trim(); if (name && !storeCollections.includes(name)) { setStoreCollections([...storeCollections, name]); setNewCollection(""); } }} style={{ padding: "11px 20px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 10, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>+ Add</button>
              </div>

              {storeCollections.length === 0 ? (
                <p style={{ fontSize: 12, color: "rgba(245,245,245,0.15)", fontStyle: "italic" }}>No collections yet. Add one above.</p>
              ) : (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                  {storeCollections.map((c, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#f5f5f5" }}>{c}</span>
                      <span style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", marginLeft: 2 }}>({products.filter((p) => p.category === c && (p.status || "published") !== "trashed").length})</span>
                      <button type="button" onClick={() => setStoreCollections(storeCollections.filter((_, idx) => idx !== i))} style={{ width: 18, height: 18, borderRadius: "50%", background: "rgba(255,61,110,0.1)", border: "none", color: "#ff3d6e", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", marginLeft: 2 }}>&#10005;</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Store Info</h3>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Tagline</label><input type="text" placeholder="e.g. Premium streetwear for the culture" value={storeTagline} onChange={(e) => setStoreTagline(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Description</label><textarea placeholder="Tell your customers what your brand is about..." value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} rows={4} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" as const }} /></div>
              </div>
            </div>

            {/* SECTION VISIBILITY */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Section Visibility</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Toggle which sections appear on your store.</p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                {([
                  { key: "show_banner_text" as const, label: "Banner Text Overlay", desc: "Show title and subtitle on your banner image" },
                  { key: "show_marquee" as const, label: "Announcement Ticker", desc: "Scrolling marquee below header" },
                  { key: "show_collections" as const, label: "Collections Section", desc: "Display collection cards on homepage" },
                  { key: "show_about" as const, label: "About / Brand Story", desc: "Your brand story with image" },
                  { key: "show_trust_bar" as const, label: "Trust Bar", desc: "Shipping, returns, quality, payment icons" },
                  { key: "show_policies" as const, label: "Shipping & Policies", desc: "Detailed shipping, returns, and payment info" },
                ]).map((item) => (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 2 }}>{item.label}</div>
                      <div style={{ fontSize: 11, color: "rgba(245,245,245,0.2)" }}>{item.desc}</div>
                    </div>
                    <button onClick={() => setStoreConfig({ ...storeConfig, [item.key]: !storeConfig[item.key] })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: storeConfig[item.key] ? N : "rgba(255,255,255,0.08)", transition: "background 0.2s" }}>
                      <div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: storeConfig[item.key] ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* ANNOUNCEMENT BAR */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Announcement Bar</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 12 }}>Shows at the very top of your store. Leave empty to hide.</p>
              <input type="text" placeholder="e.g. Free delivery on orders over R500" value={storeConfig.announcement} onChange={(e) => setStoreConfig({ ...storeConfig, announcement: e.target.value })} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
            </div>

            {/* MARQUEE TEXTS */}
            {storeConfig.show_marquee && (
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Ticker Messages</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 12 }}>Scrolling text shown below the header.</p>
              {storeConfig.marquee_texts.map((txt, i) => (
                <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                  <input type="text" value={txt} onChange={(e) => { const u = [...storeConfig.marquee_texts]; u[i] = e.target.value; setStoreConfig({ ...storeConfig, marquee_texts: u }); }} style={{ flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  {storeConfig.marquee_texts.length > 1 && <button onClick={() => { const u = storeConfig.marquee_texts.filter((_, idx) => idx !== i); setStoreConfig({ ...storeConfig, marquee_texts: u }); }} style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.12)", color: "#ff3d6e", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>}
                </div>
              ))}
              <button onClick={() => setStoreConfig({ ...storeConfig, marquee_texts: [...storeConfig.marquee_texts, ""] })} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Message</button>
            </div>
            )}

            {/* TRUST BAR ITEMS */}
            {storeConfig.show_trust_bar && (
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Trust Bar</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 12 }}>Icons shown below products (quality, delivery, etc).</p>
              {storeConfig.trust_items.map((item, i) => (
                <div key={i} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, marginBottom: 8, display: "flex", gap: 10, alignItems: "flex-start" }}>
                  <input type="text" value={item.icon} onChange={(e) => { const u = [...storeConfig.trust_items]; u[i] = { ...u[i], icon: e.target.value }; setStoreConfig({ ...storeConfig, trust_items: u }); }} style={{ width: 40, padding: "8px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 16, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", textAlign: "center" as const }} />
                  <div style={{ flex: 1, display: "flex", flexDirection: "column" as const, gap: 6 }}>
                    <input type="text" value={item.title} onChange={(e) => { const u = [...storeConfig.trust_items]; u[i] = { ...u[i], title: e.target.value }; setStoreConfig({ ...storeConfig, trust_items: u }); }} placeholder="Title" style={{ padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                    <input type="text" value={item.desc} onChange={(e) => { const u = [...storeConfig.trust_items]; u[i] = { ...u[i], desc: e.target.value }; setStoreConfig({ ...storeConfig, trust_items: u }); }} placeholder="Description" style={{ padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  {storeConfig.trust_items.length > 1 && <button onClick={() => { const u = storeConfig.trust_items.filter((_, idx) => idx !== i); setStoreConfig({ ...storeConfig, trust_items: u }); }} style={{ width: 28, height: 28, borderRadius: 8, background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 12, cursor: "pointer" }}>&times;</button>}
                </div>
              ))}
              {storeConfig.trust_items.length < 6 && <button onClick={() => setStoreConfig({ ...storeConfig, trust_items: [...storeConfig.trust_items, { icon: "âœ¦", title: "", desc: "" }] })} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Item</button>}
            </div>
            )}

            {/* POLICY ITEMS */}
            {storeConfig.show_policies && (
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Shipping & Policies</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 12 }}>Edit your shipping, returns, and payment policy text.</p>
              {storeConfig.policy_items.map((item, i) => (
                <div key={i} style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12, marginBottom: 8 }}>
                  <input type="text" value={item.title} onChange={(e) => { const u = [...storeConfig.policy_items]; u[i] = { ...u[i], title: e.target.value }; setStoreConfig({ ...storeConfig, policy_items: u }); }} placeholder="e.g. Shipping" style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontWeight: 700, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", marginBottom: 6, textTransform: "uppercase" as const, letterSpacing: "0.04em" }} />
                  <textarea value={item.desc} onChange={(e) => { const u = [...storeConfig.policy_items]; u[i] = { ...u[i], desc: e.target.value }; setStoreConfig({ ...storeConfig, policy_items: u }); }} placeholder="Policy details..." rows={2} style={{ width: "100%", padding: "8px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" as const }} />
                </div>
              ))}
            </div>
            )}

            {/* OPEN EDITOR */}
            {seller?.subdomain && (
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Visual Editor</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Open the full store editor to see live changes as you edit.</p>
              <a href="/dashboard/editor" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em", textDecoration: "none" }}>Open Store Editor &rarr;</a>
            </div>
            )}

            {/* SOCIAL LINKS */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Social Links</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Add your social media links. Leave empty to hide.</p>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {([
                  { key: "instagram" as const, label: "Instagram", placeholder: "https://instagram.com/yourbrand" },
                  { key: "tiktok" as const, label: "TikTok", placeholder: "https://tiktok.com/@yourbrand" },
                  { key: "facebook" as const, label: "Facebook", placeholder: "https://facebook.com/yourbrand" },
                  { key: "twitter" as const, label: "X / Twitter", placeholder: "https://x.com/yourbrand" },
                ]).map((item) => (
                  <div key={item.key} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, width: 80, flexShrink: 0 }}>{item.label}</label>
                    <input type="url" placeholder={item.placeholder} value={socialLinks[item.key] || ""} onChange={(e) => setSocialLinks({ ...socialLinks, [item.key]: e.target.value })} style={{ flex: 1, padding: "11px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" as const }}>
              <button onClick={saveStoreSettings} disabled={storeSaving} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: storeSaving ? "not-allowed" : "pointer", opacity: storeSaving ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{storeSaving ? "Saving..." : "Save Changes"}</button>
              {storeSaved && <span style={{ color: N, fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const }}>Saved!</span>}
              {seller?.subdomain && <a href={"/store/" + seller.subdomain} target="_blank" style={{ color: "rgba(245,245,245,0.3)", fontSize: 11, textDecoration: "underline", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Preview Store</a>}
            </div>
          </div>)}

          {/* CHECKOUT & PAYMENTS */}
          {tab === "checkout" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Checkout & Payments</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Configure how customers pay and receive their orders.</p>

            {/* SHIPPING OPTIONS */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Shipping Options</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Add delivery options customers can choose at checkout.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>Delivery Enabled</span>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, delivery_enabled: !checkoutConfig.delivery_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.delivery_enabled ? N : "rgba(255,255,255,0.08)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.delivery_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
              {checkoutConfig.delivery_enabled && (<>
                {checkoutConfig.shipping_options.map((opt, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
                    <span style={{ flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, fontSize: 13, color: "#f5f5f5" }}>{opt.name} â€” <span style={{ color: N }}>R{opt.price}</span></span>
                    <button onClick={() => setCheckoutConfig({ ...checkoutConfig, shipping_options: checkoutConfig.shipping_options.filter((_, idx) => idx !== i) })} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 14, cursor: "pointer" }}>&times;</button>
                  </div>
                ))}
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <input type="text" placeholder="e.g. Standard Delivery" value={newShipName} onChange={(e) => setNewShipName(e.target.value)} style={{ flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  <input type="number" placeholder="Price" value={newShipPrice} onChange={(e) => setNewShipPrice(e.target.value)} style={{ width: 80, padding: "10px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  <button onClick={() => { if (newShipName.trim()) { setCheckoutConfig({ ...checkoutConfig, shipping_options: [...checkoutConfig.shipping_options, { name: newShipName.trim(), price: parseFloat(newShipPrice) || 0 }] }); setNewShipName(""); setNewShipPrice(""); } }} style={{ padding: "10px 20px", background: "rgba(255,107,53,0.08)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 10, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const }}>+ Add</button>
                </div>
              </>)}
            </div>

            {/* PICKUP */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Pickup Option</h3>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>Allow Pickup</span>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, pickup_enabled: !checkoutConfig.pickup_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.pickup_enabled ? N : "rgba(255,255,255,0.08)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.pickup_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
              {checkoutConfig.pickup_enabled && (<div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Pickup Address</label><input type="text" value={checkoutConfig.pickup_address} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, pickup_address: e.target.value })} placeholder="e.g. 123 Main Street, Durban" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Pickup Instructions</label><textarea value={checkoutConfig.pickup_instructions} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, pickup_instructions: e.target.value })} placeholder="e.g. Open Mon-Fri 9am-5pm. Ring buzzer at gate." rows={3} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" as const }} /></div>
              </div>)}
            </div>

            {/* EFT / DIRECT DEPOSIT */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>EFT / Direct Deposit</h3>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>Enable EFT Payments</span>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, eft_enabled: !checkoutConfig.eft_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.eft_enabled ? N : "rgba(255,255,255,0.08)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.eft_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
              {checkoutConfig.eft_enabled && (<div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                {[{ k: "eft_bank_name" as const, l: "Bank Name", p: "e.g. Capitec Business" }, { k: "eft_account_number" as const, l: "Account Number", p: "e.g. 1053526750" }, { k: "eft_account_name" as const, l: "Account Name", p: "e.g. YOUR BRAND PTY LTD" }, { k: "eft_branch_code" as const, l: "Branch Code", p: "e.g. 450105" }, { k: "eft_account_type" as const, l: "Account Type", p: "e.g. Cheque / Savings / Business" }].map((f) => (
                  <div key={f.k}><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>{f.l}</label><input type="text" value={checkoutConfig[f.k]} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, [f.k]: e.target.value })} placeholder={f.p} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                ))}
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Payment Instructions</label><textarea value={checkoutConfig.eft_instructions} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, eft_instructions: e.target.value })} placeholder={"e.g. After placing your order, please make payment within 24 hours using your order number as reference.\n\nSend proof of payment to:\nEmail: info@yourbrand.com\nWhatsApp: 067 857 7919"} rows={6} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" as const }} /></div>
              </div>)}
            </div>

            {/* PAYFAST */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>PayFast</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 12 }}>Accept card payments, EFT, and more. Enter your PayFast merchant credentials.</p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", borderBottom: "1px solid rgba(255,255,255,0.05)", marginBottom: 16 }}>
                <span style={{ fontSize: 13 }}>Enable PayFast</span>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, payfast_enabled: !checkoutConfig.payfast_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.payfast_enabled ? N : "rgba(255,255,255,0.08)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.payfast_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
              {checkoutConfig.payfast_enabled && (<div style={{ display: "flex", flexDirection: "column" as const, gap: 12 }}>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Merchant ID</label><input type="text" value={checkoutConfig.payfast_merchant_id} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, payfast_merchant_id: e.target.value })} placeholder="Your PayFast Merchant ID" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Merchant Key</label><input type="password" value={checkoutConfig.payfast_merchant_key} onChange={(e) => setCheckoutConfig({ ...checkoutConfig, payfast_merchant_key: e.target.value })} placeholder="Your PayFast Merchant Key" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
                <p style={{ fontSize: 11, color: "rgba(245,245,245,0.2)" }}>Find these in your PayFast dashboard under Settings &gt; Integration.</p>
              </div>)}
            </div>

            {/* SAVE */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button onClick={async () => { if (!seller) return; setCheckoutSaving(true); setCheckoutSaved(false); await supabase.from("sellers").update({ checkout_config: checkoutConfig }).eq("id", seller.id); setSeller({ ...seller, checkout_config: checkoutConfig }); setCheckoutSaving(false); setCheckoutSaved(true); setTimeout(() => setCheckoutSaved(false), 3000); }} disabled={checkoutSaving} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: checkoutSaving ? "not-allowed" : "pointer", opacity: checkoutSaving ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{checkoutSaving ? "Saving..." : "Save Checkout Settings"}</button>
              {checkoutSaved && <span style={{ color: N, fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const }}>Saved!</span>}
            </div>
          </div>)}

        </main>
      </div>
    </>
  );
}
