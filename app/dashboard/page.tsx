"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

interface Variant { name: string; options: string[]; images?: { [option: string]: string }; }

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
  whatsapp_checkout_enabled: boolean;
}

interface Seller {
  id: string; email: string; store_name: string; whatsapp_number: string; subdomain: string;
  template: string; plan: string; primary_color: string; logo_url: string; banner_url: string;
  tagline: string; description: string; collections: string[];
  social_links: SocialLinks; store_config: StoreConfig; checkout_config: CheckoutConfig;
  subscription_status: string; subscription_plan: string; trial_ends_at: string; subscription_started_at: string;
  payfast_subscription_token: string | null;
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

const TEMPLATES = [
  { id: "soft-luxury", name: "Soft Luxury", desc: "Warm cream tones with elegant serif typography", colors: { bg: "#f6f3ef", card: "#ffffff", text: "#2a2a2e" } },
  { id: "glass-futuristic", name: "Glass Chrome", desc: "Dark futuristic theme with chrome metallic accents", colors: { bg: "#030305", card: "#0b0b0f", text: "#f0f0f0" } },
];

const COLOR_PRESETS = ["#ff6b35", "#ff3d6e", "#111111", "#00d4aa", "#8b5cf6", "#e74c3c", "#2563eb", "#d4a017", "#16a34a", "#ec4899"];

export default function Dashboard() {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "products" | "collections" | "orders" | "mystore" | "checkout" | "discounts" | "abandoned">("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [productFilter, setProductFilter] = useState<"published" | "draft" | "trashed">("published");
  const [searchQuery, setSearchQuery] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [quickAdd, setQuickAdd] = useState(false);
  const [qaName, setQaName] = useState("");
  const [qaPrice, setQaPrice] = useState("");
  const [qaCategory, setQaCategory] = useState("");
  const [qaImage, setQaImage] = useState<File | null>(null);
  const [qaPreview, setQaPreview] = useState("");
  const [qaSaving, setQaSaving] = useState(false);
  const [csvUploading, setCsvUploading] = useState(false);
  const [csvResult, setCsvResult] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formPrice, setFormPrice] = useState("");
  const [formCategory, setFormCategory] = useState("");
  const [formImages, setFormImages] = useState<File[]>([]);
  const [formPreviews, setFormPreviews] = useState<string[]>([]);
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [formVariants, setFormVariants] = useState<Variant[]>([]);
  const [formComparePrice, setFormComparePrice] = useState("");
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
  const [storeConfig, setStoreConfig] = useState<StoreConfig>({ show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "", marquee_texts: ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: [{ icon: "★", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "✈", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "↺", title: "Easy Returns", desc: "14-day policy" }, { icon: "⚡", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy on unworn items." }, { title: "Payment", desc: "All major cards via Yoco + WhatsApp checkout." }] });
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaved, setStoreSaved] = useState(false);
  const [checkoutConfig, setCheckoutConfig] = useState<CheckoutConfig>({ eft_enabled: false, eft_bank_name: "", eft_account_number: "", eft_account_name: "", eft_branch_code: "", eft_account_type: "", eft_instructions: "", payfast_enabled: false, payfast_merchant_id: "", payfast_merchant_key: "", delivery_enabled: true, pickup_enabled: false, pickup_address: "", pickup_instructions: "", shipping_options: [], whatsapp_checkout_enabled: true });
  const [checkoutSaving, setCheckoutSaving] = useState(false);
  const [checkoutSaved, setCheckoutSaved] = useState(false);
  const [newShipName, setNewShipName] = useState("");
  const [newShipPrice, setNewShipPrice] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [orderSaved, setOrderSaved] = useState(false);
  const [orderNotification, setOrderNotification] = useState<{ order_number: string; customer_name: string; total: number; id: string } | null>(null);
  const [selectedCollection, setSelectedCollection] = useState<string | null>(null);
  const [productSort, setProductSort] = useState("manual");

  // Discount codes
  interface DiscountCode { id: string; code: string; type: string; value: number; min_order: number; max_uses: number | null; used_count: number; active: boolean; expires_at: string | null; created_at: string; applies_to: string; product_ids: string[]; collection_names: string[]; show_countdown: boolean; }
  const [discountCodes, setDiscountCodes] = useState<DiscountCode[]>([]);
  const [dcCode, setDcCode] = useState("");
  const [dcType, setDcType] = useState("percentage");
  const [dcValue, setDcValue] = useState("");
  const [dcMinOrder, setDcMinOrder] = useState("");
  const [dcMaxUses, setDcMaxUses] = useState("");
  const [dcExpires, setDcExpires] = useState("");
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

  useEffect(() => { checkAuth(); }, []);

  const switchTab = (t: "overview" | "products" | "collections" | "orders" | "mystore" | "checkout" | "discounts" | "abandoned") => { setTab(t); setSidebarOpen(false); };

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: sd } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (sd) { setSeller(sd); setStoreTemplate(sd.template || "soft-luxury"); setStoreColor(sd.primary_color || "#ff6b35"); setStoreTagline(sd.tagline || ""); setStoreDescription(sd.description || ""); setLogoPreview(sd.logo_url || ""); setBannerPreview(sd.banner_url || ""); setStoreCollections(sd.collections || []); setSocialLinks(sd.social_links || {}); const c = sd.store_config || {} as any; setStoreConfig({ show_banner_text: c.show_banner_text !== false, show_marquee: c.show_marquee !== false, show_collections: c.show_collections !== false, show_about: c.show_about !== false, show_trust_bar: c.show_trust_bar !== false, show_policies: c.show_policies !== false, show_newsletter: !!c.show_newsletter, announcement: c.announcement || "", marquee_texts: c.marquee_texts?.length ? c.marquee_texts : ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: c.trust_items?.length ? c.trust_items : [{ icon: "\u2605", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "\u2708", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "\u21BA", title: "Easy Returns", desc: "14-day policy" }, { icon: "\u26A1", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: c.policy_items?.length ? c.policy_items : [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy." }, { title: "Payment", desc: "Cards via Yoco + WhatsApp checkout." }] }); const cc = sd.checkout_config || {} as any; setCheckoutConfig({ eft_enabled: !!cc.eft_enabled, eft_bank_name: cc.eft_bank_name || "", eft_account_number: cc.eft_account_number || "", eft_account_name: cc.eft_account_name || "", eft_branch_code: cc.eft_branch_code || "", eft_account_type: cc.eft_account_type || "", eft_instructions: cc.eft_instructions || "", payfast_enabled: !!cc.payfast_enabled, payfast_merchant_id: cc.payfast_merchant_id || "", payfast_merchant_key: cc.payfast_merchant_key || "", delivery_enabled: cc.delivery_enabled !== false, pickup_enabled: !!cc.pickup_enabled, pickup_address: cc.pickup_address || "", pickup_instructions: cc.pickup_instructions || "", shipping_options: cc.shipping_options || [], whatsapp_checkout_enabled: cc.whatsapp_checkout_enabled !== false }); }
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (pd) setProducts(pd);
    const { data: od } = await supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (od) setOrders(od);
    const { data: dc } = await supabase.from("discount_codes").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (dc) setDiscountCodes(dc);
    setLoading(false);

    // Subscribe to real-time order notifications
    const channel = supabase.channel("orders-" + user.id).on("postgres_changes", { event: "INSERT", schema: "public", table: "orders", filter: "seller_id=eq." + user.id }, (payload: any) => {
      const newOrder = payload.new;
      setOrders((prev) => [newOrder, ...prev]);
      setOrderNotification({ order_number: newOrder.order_number || newOrder.id?.substring(0, 8), customer_name: newOrder.customer_name || "Customer", total: newOrder.total, id: newOrder.id });
      // Play notification sound
      try { const ctx = new AudioContext(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 880; gain.gain.value = 0.15; osc.start(); osc.stop(ctx.currentTime + 0.15); setTimeout(() => { const osc2 = ctx.createOscillator(); const gain2 = ctx.createGain(); osc2.connect(gain2); gain2.connect(ctx.destination); osc2.frequency.value = 1100; gain2.gain.value = 0.15; osc2.start(); osc2.stop(ctx.currentTime + 0.2); }, 180); } catch {}
      setTimeout(() => setOrderNotification(null), 10000);
    }).subscribe();

    return () => { supabase.removeChannel(channel); };
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

  const resetForm = () => { setFormName(""); setFormPrice(""); setFormComparePrice(""); setFormCategory(""); setFormImages([]); setFormPreviews([]); setExistingImages([]); setFormVariants([]); setUploadProgress(""); setEditingId(null); setShowForm(false); };
  const startEdit = (p: Product) => { setEditingId(p.id); setFormName(p.name); setFormPrice(String(p.price)); setFormComparePrice(p.old_price ? String(p.old_price) : ""); setFormCategory(p.category || ""); setFormImages([]); setFormPreviews([]); setExistingImages(p.images || []); setFormVariants(p.variants || []); setShowForm(true); };

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
    if (formImages.length + existingImages.length + files.length > maxImages) { alert("Maximum " + maxImages + " images on your plan. Upgrade to Pro for more."); return; }
    const valid = files.filter((f) => { if (!f.type.startsWith("image/")) return false; if (f.size > 5*1024*1024) { alert(f.name + " too large"); return false; } return true; });
    setFormImages((p) => [...p, ...valid]);
    valid.forEach((file) => { const r = new FileReader(); r.onload = (ev) => setFormPreviews((p) => [...p, ev.target?.result as string]); r.readAsDataURL(file); });
  };
  const removeNewImage = (i: number) => { setFormImages((p) => p.filter((_, idx) => idx !== i)); setFormPreviews((p) => p.filter((_, idx) => idx !== i)); };
  const removeExistingImage = (i: number) => setExistingImages((p) => p.filter((_, idx) => idx !== i));

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

  const cleanVariants = (v: Variant[]): Variant[] => v.filter((x) => x.name.trim()).map((x) => ({ name: x.name.trim(), options: x.options.filter((o) => o.trim()).map((o) => o.trim()), images: x.images || {} })).filter((x) => x.options.length > 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setFormSaving(true); setUploadProgress("");
    const { data: { user } } = await supabase.auth.getUser(); if (!user) return;
    const cv = cleanVariants(formVariants);
    if (editingId) {
      let allImages = [...existingImages];
      if (formImages.length > 0) { const newUrls = await uploadImages(user.id, editingId); allImages = [...allImages, ...newUrls]; }
      const { error } = await supabase.from("products").update({ name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv }).eq("id", editingId);
      if (!error) setProducts(products.map((p) => p.id === editingId ? { ...p, name: formName, price: parseFloat(formPrice), category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv } : p));
    } else {
      const { data, error } = await supabase.from("products").insert({ seller_id: user.id, name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, in_stock: true, variants: cv, status: "published" }).select().single();
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
  const reorderProduct = async (id: string, direction: "up" | "down") => {
    const list = [...products].filter((p) => (p.status || "published") !== "trashed").sort((a, b) => (a.sort_order ?? 9999) - (b.sort_order ?? 9999));
    const idx = list.findIndex((p) => p.id === id);
    if (idx < 0) return;
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= list.length) return;
    // Assign proper sort orders to all items first if needed
    const updates = list.map((p, i) => ({ ...p, sort_order: i }));
    const a = updates[idx]; const b = updates[swapIdx];
    // Swap
    updates[idx] = { ...b, sort_order: idx };
    updates[swapIdx] = { ...a, sort_order: swapIdx };
    // Save both to DB
    await Promise.all([
      supabase.from("products").update({ sort_order: swapIdx }).eq("id", a.id),
      supabase.from("products").update({ sort_order: idx }).eq("id", b.id),
    ]);
    setProducts(products.map((p) => {
      if (p.id === a.id) return { ...p, sort_order: swapIdx };
      if (p.id === b.id) return { ...p, sort_order: idx };
      return p;
    }));
  };
  // Initialize sort orders for products that don't have them
  const initSortOrders = async () => {
    const unordered = products.filter((p) => p.sort_order === null || p.sort_order === undefined);
    if (unordered.length > 0) {
      const maxOrder = Math.max(0, ...products.filter((p) => p.sort_order !== null && p.sort_order !== undefined).map((p) => p.sort_order));
      for (let i = 0; i < unordered.length; i++) {
        await supabase.from("products").update({ sort_order: maxOrder + i + 1 }).eq("id", unordered[i].id);
      }
      setProducts(products.map((p, idx) => {
        if (p.sort_order === null || p.sort_order === undefined) {
          const uIdx = unordered.findIndex((u) => u.id === p.id);
          return { ...p, sort_order: maxOrder + uIdx + 1 };
        }
        return p;
      }));
    }
  };
  useEffect(() => { if (products.length > 0 && seller) initSortOrders(); }, [products.length > 0 && seller?.id]);
  const emptyTrash = async () => { if (!confirm("Permanently delete all trashed products? This cannot be undone.")) return; const trashed = products.filter((p) => p.status === "trashed"); for (const p of trashed) { await supabase.from("products").delete().eq("id", p.id); } setProducts(products.filter((p) => p.status !== "trashed")); };

  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "#ff6b35", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: "rgba(245,245,245,0.35)", marginTop: 16 }}>Loading dashboard...</p>
    </div>
  );

  // Trial/subscription checks
  const trialActive = seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) > new Date();
  const trialDaysLeft = seller?.trial_ends_at ? Math.max(0, Math.ceil((new Date(seller.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))) : 0;
  const isSubscribed = seller?.subscription_status === "active";
  const isExpiredTrial = seller?.subscription_status === "trial" && seller?.trial_ends_at && new Date(seller.trial_ends_at) <= new Date();
  const isExpired = seller?.subscription_status === "expired" || isExpiredTrial;
  const hasVerifiedCard = !!seller?.payfast_subscription_token || seller?.subscription_status === "active";
  const isAdmin = seller?.email === "info@4regn.com";
  const needsCardVerification = trialActive && !hasVerifiedCard && !isAdmin;

  // Lock dashboard if expired or unverified trial - redirect to billing
  if ((isExpired || needsCardVerification) && typeof window !== "undefined") {
    window.location.href = "/dashboard/billing";
    return (
      <div style={{ minHeight: "100vh", background: "#030303", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
        <p style={{ color: "rgba(245,245,245,0.35)" }}>{needsCardVerification ? "Please verify your card to continue..." : "Redirecting to billing..."}</p>
      </div>
    );
  }

  const publishedCount = products.filter((p) => p.status === "published" || !p.status).length;
  const draftCount = products.filter((p) => p.status === "draft").length;
  const trashedCount = products.filter((p) => p.status === "trashed").length;

  const todayOrders = orders.filter((o) => !(o.payment_method === "payfast" && o.payment_status === "pending") && new Date(o.created_at).toDateString() === new Date().toDateString());
  const totalRevenue = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
  // Hide PayFast orders that weren't paid (abandoned checkouts)
  const visibleOrders = orders.filter((o) => !(o.payment_method === "payfast" && o.payment_status === "pending"));
  const abandonedOrders = orders.filter((o) => o.payment_method === "payfast" && o.payment_status === "pending");
  const totalImageSlots = existingImages.length + formImages.length;

  const filteredProducts = products.filter((p) => {
    const status = p.status || "published";
    if (status !== productFilter) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) || (p.category || "").toLowerCase().includes(q);
    }
    return true;
  }).sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0));

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

  const planLimits = seller?.subscription_plan === "pro" ? { products: 100, images: 20, collections: 20 } : { products: 15, images: 5, collections: 5 };
  const quickAddSave = async () => {
    if (!qaName || !qaPrice || !seller) return;
    setQaSaving(true);
    let imageUrl = "";
    if (qaImage) {
      const ext = qaImage.name.split(".").pop(); const path = seller.id + "/" + Date.now() + "." + ext;
      const { error: ue } = await supabase.storage.from("product-images").upload(path, qaImage);
      if (!ue) imageUrl = supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
    }
    const { data, error } = await supabase.from("products").insert({
      seller_id: seller.id, name: qaName, price: parseFloat(qaPrice), category: qaCategory || null,
      in_stock: true, status: "published", image_url: imageUrl || null, images: imageUrl ? [imageUrl] : [],
      variants: [], sort_order: products.length,
    }).select().single();
    if (data) setProducts([data, ...products]);
    if (error) alert("Error: " + error.message);
    setQaName(""); setQaPrice(""); setQaCategory(""); setQaImage(null); setQaPreview(""); setQaSaving(false);
  };

  const handleCsvUpload = async (file: File) => {
    if (!seller) return;
    setCsvUploading(true); setCsvResult("");
    const text = await file.text();
    const lines = text.split("\n").filter((l) => l.trim());
    if (lines.length < 2) { setCsvResult("CSV must have a header row and at least one product."); setCsvUploading(false); return; }
    const header = lines[0].toLowerCase().split(",").map((h) => h.trim().replace(/"/g, ""));
    const nameIdx = header.findIndex((h) => h === "name" || h === "product" || h === "product name");
    const priceIdx = header.findIndex((h) => h === "price" || h === "amount");
    const catIdx = header.findIndex((h) => h === "category" || h === "collection" || h === "type");
    const descIdx = header.findIndex((h) => h === "description" || h === "desc");
    const oldPriceIdx = header.findIndex((h) => h === "old price" || h === "old_price" || h === "original price" || h === "was");
    if (nameIdx < 0 || priceIdx < 0) { setCsvResult("CSV must have 'name' and 'price' columns. Found: " + header.join(", ")); setCsvUploading(false); return; }
    let added = 0; let errors = 0;
    const remaining = planLimits.products - (publishedCount + draftCount);
    for (let i = 1; i < lines.length && added < remaining; i++) {
      const cols = lines[i].split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
      const name = cols[nameIdx]; const price = parseFloat(cols[priceIdx]);
      if (!name || isNaN(price)) { errors++; continue; }
      const category = catIdx >= 0 ? cols[catIdx] || null : null;
      const description = descIdx >= 0 ? cols[descIdx] || "" : "";
      const oldPrice = oldPriceIdx >= 0 && cols[oldPriceIdx] ? parseFloat(cols[oldPriceIdx]) : null;
      const { data, error } = await supabase.from("products").insert({
        seller_id: seller.id, name, price, old_price: oldPrice, category, description,
        in_stock: true, status: "published", variants: [], sort_order: products.length + added,
      }).select().single();
      if (data) { added++; setProducts((prev) => [data, ...prev]); }
      else errors++;
    }
    const skipped = Math.max(0, lines.length - 1 - remaining);
    setCsvResult(added + " product" + (added !== 1 ? "s" : "") + " imported" + (errors > 0 ? ", " + errors + " failed" : "") + (skipped > 0 ? ", " + skipped + " skipped (plan limit)" : "") + ".");
    setCsvUploading(false);
  };

  const canAddProduct = publishedCount + draftCount < planLimits.products;
  const canAddCollection = storeCollections.length < planLimits.collections;
  const maxImages = planLimits.images;

  return (
    <>
      <style>{`
        @media (min-width: 769px) { .mobile-topbar { display: none !important; } .sidebar-overlay { display: none !important; } .sidebar { transform: translateX(0) !important; } .main-content { margin-left: 260px !important; } }
        @media (max-width: 768px) { .sidebar { transform: translateX(-100%); } .sidebar.open { transform: translateX(0) !important; } .main-content { margin-left: 0 !important; padding: 16px !important; padding-top: 72px !important; } .stats-grid { grid-template-columns: repeat(2, 1fr) !important; } .form-grid-3 { grid-template-columns: 1fr !important; } .actions-grid { grid-template-columns: 1fr !important; } .product-row-inner { flex-direction: column !important; align-items: flex-start !important; gap: 12px !important; } .product-actions { flex-wrap: wrap !important; } .templates-grid { grid-template-columns: 1fr !important; } .logo-banner-grid { grid-template-columns: 1fr !important; } }
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes slideIn{from{transform:translateY(-100%);opacity:0}to{transform:translateY(0);opacity:1}}
      `}</style>

      {/* ORDER NOTIFICATION TOAST */}
      {orderNotification && (
        <div style={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", zIndex: 9999, animation: "slideIn 0.3s ease", width: "90%", maxWidth: 420 }}>
          <div onClick={() => { setTab("orders"); setOrderNotification(null); }} style={{ padding: "16px 20px", background: "linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))", border: "1px solid rgba(34,197,94,0.3)", borderRadius: 16, backdropFilter: "blur(20px)", cursor: "pointer", display: "flex", alignItems: "center", gap: 14 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: "rgba(34,197,94,0.15)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 20 }}>&#128176;</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", color: "#22c55e", marginBottom: 2 }}>New Order!</div>
              <div style={{ fontSize: 12, color: "rgba(245,245,245,0.6)" }}>#{orderNotification.order_number} — {orderNotification.customer_name}</div>
            </div>
            <div style={{ fontSize: 18, fontWeight: 900, color: "#22c55e", whiteSpace: "nowrap" as const }}>R{orderNotification.total}</div>
            <button onClick={(e) => { e.stopPropagation(); setOrderNotification(null); }} style={{ background: "none", border: "none", color: "rgba(245,245,245,0.3)", fontSize: 18, cursor: "pointer", padding: 4 }}>&times;</button>
          </div>
        </div>
      )}

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
              {(["overview", "products", "collections", "orders", "abandoned", "discounts", "mystore", "checkout"] as const).map((t) => (
                <button key={t} onClick={() => { switchTab(t); if (t === "collections") setSelectedCollection(null); }} style={{ width: "100%", padding: "12px 16px", background: tab === t ? "rgba(255,107,53,0.06)" : "transparent", border: tab === t ? "1px solid rgba(255,107,53,0.1)" : "1px solid transparent", borderRadius: 10, color: tab === t ? "#f5f5f5" : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 13, fontWeight: tab === t ? 700 : 500, textAlign: "left" as const, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", transition: "all 0.2s" }}>
                  {t === "overview" ? "Overview" : t === "products" ? "Products (" + publishedCount + ")" : t === "collections" ? "Collections (" + storeCollections.length + ")" : t === "orders" ? "Orders (" + visibleOrders.length + ")" : t === "abandoned" ? "Abandoned (" + abandonedOrders.length + ")" : t === "discounts" ? "Discounts (" + discountCodes.length + ")" : t === "mystore" ? "Edit My Store" : "Checkout"}
                </button>
              ))}
            </nav>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {seller?.subdomain && <a href={"/store/" + seller.subdomain} target="_blank" style={{ display: "block", padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 10, color: N, fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>View My Store</a>}
            <a href="/dashboard/billing" style={{ display: "block", padding: "12px 16px", background: seller?.subscription_status === "active" ? "rgba(34,197,94,0.06)" : seller?.subscription_status === "trial" ? "rgba(251,191,36,0.06)" : "rgba(255,61,110,0.06)", border: seller?.subscription_status === "active" ? "1px solid rgba(34,197,94,0.12)" : seller?.subscription_status === "trial" ? "1px solid rgba(251,191,36,0.12)" : "1px solid rgba(255,61,110,0.12)", borderRadius: 10, textDecoration: "none", textAlign: "center" as const }}>
              <div style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", color: seller?.subscription_status === "active" ? "#22c55e" : seller?.subscription_status === "trial" ? "#fbbf24" : "#ff3d6e" }}>{seller?.subscription_status === "active" ? "Active Plan" : seller?.subscription_status === "trial" ? "Free Trial" : "Inactive"}</div>
              <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>{seller?.subscription_status === "active" ? "Click to view plan or upgrade" : seller?.subscription_status === "trial" ? "Click to choose a plan" : "Click to reactivate or upgrade"}</div>
            </a>
            {seller?.email === "info@4regn.com" && <a href="/admin" style={{ display: "block", padding: "12px 16px", background: "rgba(139,92,246,0.06)", border: "1px solid rgba(139,92,246,0.12)", borderRadius: 10, color: "#8b5cf6", fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Admin Panel</a>}
            <button onClick={handleLogout} style={{ padding: "10px 16px", background: "transparent", border: "none", color: "rgba(245,245,245,0.25)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, cursor: "pointer", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Log Out</button>
          </div>
        </aside>

        <main className="main-content" style={{ flex: 1, marginLeft: 260, padding: "36px 40px" }}>

          {/* TRIAL BANNER */}
          {trialActive && !isSubscribed && (
            <a href="/dashboard/billing" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 20px", background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.15)", borderRadius: 12, marginBottom: 24, textDecoration: "none", flexWrap: "wrap" as const, gap: 8 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 14 }}>&#9203;</span>
                <span style={{ fontSize: 13, color: "#fbbf24", fontWeight: 700 }}>{trialDaysLeft} day{trialDaysLeft !== 1 ? "s" : ""} left on your free trial</span>
                <span style={{ fontSize: 12, color: "rgba(245,245,245,0.35)" }}>- Subscribe now to keep your store live</span>
              </div>
              <span style={{ padding: "6px 16px", background: "rgba(251,191,36,0.1)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 100, fontSize: 11, fontWeight: 800, color: "#fbbf24", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Subscribe</span>
            </a>
          )}

          {/* OVERVIEW */}
          {tab === "overview" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Welcome back, {seller?.store_name}</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Here is a quick look at your store.</p>
            <div className="stats-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 40 }}>
              {[{ n: publishedCount, l: "Published" }, { n: visibleOrders.length, l: "Total Orders" }, { n: todayOrders.length, l: "Orders Today" }, { n: "R" + totalRevenue.toFixed(0), l: "Revenue", c: N }].map((s, i) => (
                <div key={i} style={{ padding: "20px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}>
                  <div style={{ fontSize: "clamp(24px, 3vw, 32px)", fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: s.c || "#f5f5f5" }}>{s.n}</div>
                  <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
                </div>
              ))}
            </div>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 16 }}>Quick Actions</h3>
            <div className="actions-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
              {[{ icon: "+", label: "Add Product", fn: () => { switchTab("products"); resetForm(); setShowForm(true); } }, { icon: "\u2630", label: "View Orders", fn: () => switchTab("orders") }, { icon: "\u2699", label: "Edit My Store", fn: () => switchTab("mystore") }].map((a, i) => (
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
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                <button onClick={() => { if (!canAddProduct) { alert("You've reached your plan limit of " + planLimits.products + " products. Upgrade to Pro for more."); return; } setQuickAdd(false); if (showForm) resetForm(); else { resetForm(); setShowForm(true); setProductFilter("published"); } }} style={{ padding: "12px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em", whiteSpace: "nowrap" as const }}>{showForm ? "Cancel" : "+ Add Product"}</button>

                <label style={{ padding: "12px 18px", background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: 100, color: "#2563eb", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", display: "inline-flex", alignItems: "center", gap: 6 }}>
                  {csvUploading ? "Importing..." : "Import CSV"}
                  <input type="file" accept=".csv" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleCsvUpload(f); e.target.value = ""; }} style={{ display: "none" }} />
                </label>
              </div>
            </div>

            {/* CSV RESULT */}
            {csvResult && (
              <div style={{ padding: "14px 18px", background: "rgba(37,99,235,0.04)", border: "1px solid rgba(37,99,235,0.12)", borderRadius: 12, marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 13, color: "#2563eb", fontWeight: 600 }}>{csvResult}</span>
                <button onClick={() => setCsvResult("")} style={{ background: "none", border: "none", color: "rgba(245,245,245,0.3)", cursor: "pointer", fontSize: 14 }}>&times;</button>
              </div>
            )}



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
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Selling Price (R)</label>
                    <input type="number" placeholder="e.g. 299" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                    <input type="number" placeholder="Original price e.g. 399 (optional — shows crossed out)" value={formComparePrice} onChange={(e) => setFormComparePrice(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 10, color: "rgba(245,245,245,0.5)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", marginTop: 6 }} />
                    {formComparePrice && parseFloat(formComparePrice) > parseFloat(formPrice || "0") && (
                      <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>
                        {Math.round((1 - parseFloat(formPrice) / parseFloat(formComparePrice)) * 100)}% off — shows as <span style={{ textDecoration: "line-through", color: "rgba(245,245,245,0.3)" }}>R{formComparePrice}</span> → R{formPrice}
                      </span>
                    )}
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Collection</label>
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const }}>
                      <option value="" style={{ background: "#080808" }}>No collection</option>
                      {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "#080808" }}>{c}</option>))}
                      <option value="__new__" style={{ background: "#080808", color: "#ff6b35" }}>+ Create new collection...</option>
                    </select>
                    {(formCategory === "" || formCategory === "__new__") && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text"
                          id="new-col-input"
                          placeholder="Type new collection name + press Enter"
                          style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}
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
                        }} style={{ padding: "9px 14px", background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>+ Create</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Images */}
                <div style={{ marginTop: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Images (max {maxImages})</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {existingImages.map((url, i) => (<div key={"e" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeExistingImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && formImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {formPreviews.map((p, i) => (<div key={"n" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeNewImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && existingImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {totalImageSlots < maxImages && (<button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 2 }}><span style={{ fontSize: 20, color: "rgba(245,245,245,0.2)" }}>+</span><span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Photo</span></button>)}
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
                    {/* Image-to-variant linking */}
                    {(existingImages.length > 0 || formPreviews.length > 0) && v.options.some((o) => o.trim()) && (
                      <div style={{ marginTop: 12, padding: "12px", background: "rgba(255,255,255,0.02)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.04)" }}>
                        <div style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8 }}>Assign images to {v.name} options</div>
                        <div style={{ display: "flex", flexDirection: "column" as const, gap: 6 }}>
                          {v.options.filter((o) => o.trim()).map((opt, oi) => {
                            const allImgs = [...existingImages, ...formPreviews];
                            const currentImg = v.images?.[opt] || "";
                            return (
                              <div key={oi} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: "rgba(245,245,245,0.5)", minWidth: 60, fontWeight: 600 }}>{opt}</span>
                                <div style={{ display: "flex", gap: 4, flex: 1, overflowX: "auto" as const }}>
                                  <div onClick={() => { const u = [...formVariants]; if (!u[vi].images) u[vi].images = {}; u[vi].images![opt] = ""; setFormVariants(u); }} style={{ width: 36, height: 36, borderRadius: 6, border: !currentImg ? "2px solid " + N : "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, fontSize: 8, color: "rgba(245,245,245,0.25)" }}>None</div>
                                  {allImgs.map((img, imgIdx) => (
                                    <img key={imgIdx} src={img} alt="" onClick={() => { const u = [...formVariants]; if (!u[vi].images) u[vi].images = {}; u[vi].images![opt] = img; setFormVariants(u); }} style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" as const, cursor: "pointer", border: currentImg === img ? "2px solid " + N : "1px solid rgba(255,255,255,0.08)", flexShrink: 0, opacity: currentImg === img ? 1 : 0.5 }} />
                                  ))}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
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
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em", whiteSpace: "nowrap" as const, color: product.old_price ? "#ff6b35" : "#f5f5f5" }}>R{product.price}</div>
                      {product.old_price && <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", textDecoration: "line-through", whiteSpace: "nowrap" as const }}>R{product.old_price}</div>}
                    </div>
                    <div className="product-actions" style={{ display: "flex", gap: 6, flexWrap: "wrap" as const, alignItems: "center" }}>
                      {productFilter === "trashed" ? (
                        <>
                          <button onClick={() => restoreProduct(product.id)} style={{ padding: "7px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Restore</button>
                          <button onClick={() => deleteForever(product.id)} style={{ padding: "7px 12px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.12)", borderRadius: 8, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Delete Forever</button>
                        </>
                      ) : (
                        <>
                          <div style={{ display: "flex", flexDirection: "column" as const, gap: 2 }}>
                            <button onClick={() => reorderProduct(product.id, "up")} style={{ width: 22, height: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, color: "rgba(245,245,245,0.3)", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u25B2"}</button>
                            <button onClick={() => reorderProduct(product.id, "down")} style={{ width: 22, height: 18, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 4, color: "rgba(245,245,245,0.3)", fontSize: 8, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>{"\u25BC"}</button>
                          </div>
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

          {/* COLLECTIONS */}
          {tab === "collections" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div>
                <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Collections</h1>
                <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 24 }}>Organize your products into collections for your storefront.</p>
              </div>
              {selectedCollection && <button onClick={() => setSelectedCollection(null)} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>&larr; All Collections</button>}
            </div>

            {selectedCollection ? (
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 900, textTransform: "uppercase" as const, marginBottom: 4 }}>{selectedCollection}</h2>
                <p style={{ fontSize: 13, color: "rgba(245,245,245,0.25)", marginBottom: 20 }}>{products.filter((p) => p.category === selectedCollection && (p.status || "published") !== "trashed").length} products in this collection</p>

                {/* SORT */}
                <div style={{ display: "flex", gap: 6, marginBottom: 20, flexWrap: "wrap" as const }}>
                  {[{ k: "manual", l: "Manual" }, { k: "az", l: "A-Z" }, { k: "za", l: "Z-A" }, { k: "latest", l: "Latest" }, { k: "oldest", l: "Oldest" }, { k: "price-asc", l: "Price Low" }, { k: "price-desc", l: "Price High" }].map((s) => (
                    <button key={s.k} onClick={() => setProductSort(s.k)} style={{ padding: "6px 14px", borderRadius: 100, background: productSort === s.k ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.02)", border: productSort === s.k ? "1px solid rgba(255,107,53,0.15)" : "1px solid rgba(255,255,255,0.06)", color: productSort === s.k ? N : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>{s.l}</button>
                  ))}
                </div>

                {/* PRODUCTS IN COLLECTION */}
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12, color: N }}>Products in Collection</h3>
                {(() => {
                  let inCollection = products.filter((p) => p.category === selectedCollection && (p.status || "published") !== "trashed");
                  if (productSort === "az") inCollection.sort((a, b) => a.name.localeCompare(b.name));
                  else if (productSort === "za") inCollection.sort((a, b) => b.name.localeCompare(a.name));
                  else if (productSort === "latest") inCollection.sort((a, b) => -1);
                  else if (productSort === "oldest") inCollection.sort((a, b) => 1);
                  else if (productSort === "price-asc") inCollection.sort((a, b) => a.price - b.price);
                  else if (productSort === "price-desc") inCollection.sort((a, b) => b.price - a.price);
                  return inCollection.length === 0 ? (
                    <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)", padding: "20px 0" }}>No products in this collection yet. Add some below.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 24 }}>
                      {inCollection.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />}
                            <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>{p.name}</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>R{p.price}</div></div>
                          </div>
                          <button onClick={async () => { await supabase.from("products").update({ category: "" }).eq("id", p.id); setProducts(products.map((x) => x.id === p.id ? { ...x, category: "" } : x)); }} style={{ padding: "6px 12px", background: "rgba(255,61,110,0.06)", border: "1px solid rgba(255,61,110,0.12)", borderRadius: 8, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>Remove</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}

                {/* ADD PRODUCTS TO COLLECTION */}
                <h3 style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 12 }}>Add Products</h3>
                {(() => {
                  const available = products.filter((p) => p.category !== selectedCollection && (p.status || "published") !== "trashed");
                  return available.length === 0 ? (
                    <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>All products are already in this collection.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {available.map((p) => (
                        <div key={p.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 14px", background: "rgba(255,255,255,0.01)", border: "1px solid rgba(255,255,255,0.03)", borderRadius: 10 }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            {p.image_url ? <img src={p.image_url} alt="" style={{ width: 36, height: 36, borderRadius: 6, objectFit: "cover" }} /> : <div style={{ width: 36, height: 36, borderRadius: 6, background: "rgba(255,255,255,0.04)" }} />}
                            <div><div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>{p.name}</div><div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{p.category ? "In: " + p.category : "No collection"}</div></div>
                          </div>
                          <button onClick={async () => { await supabase.from("products").update({ category: selectedCollection }).eq("id", p.id); setProducts(products.map((x) => x.id === p.id ? { ...x, category: selectedCollection! } : x)); }} style={{ padding: "6px 12px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 8, color: N, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Add</button>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            ) : (
              <div>
                {/* CREATE COLLECTION */}
                <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                  <input type="text" placeholder="New collection name..." value={newCollection} onChange={(e) => setNewCollection(e.target.value)} onKeyDown={async (e) => { if (e.key === "Enter") { if (!canAddCollection) { alert("You've reached your plan limit of " + planLimits.collections + " collections. Upgrade to Pro for more."); return; } const name = newCollection.trim(); if (name && !storeCollections.includes(name)) { const updated = [...storeCollections, name]; setStoreCollections(updated); setNewCollection(""); await supabase.from("sellers").update({ collections: updated }).eq("id", seller!.id); setSeller({ ...seller!, collections: updated }); } } }} style={{ flex: 1, padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  <button onClick={async () => { if (!canAddCollection) { alert("You've reached your plan limit of " + planLimits.collections + " collections. Upgrade to Pro for more."); return; } const name = newCollection.trim(); if (name && !storeCollections.includes(name)) { const updated = [...storeCollections, name]; setStoreCollections(updated); setNewCollection(""); await supabase.from("sellers").update({ collections: updated }).eq("id", seller!.id); setSeller({ ...seller!, collections: updated }); } }} style={{ padding: "12px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}>+ Create</button>
                </div>

                {/* COLLECTION LIST */}
                {storeCollections.length === 0 ? (
                  <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No collections yet</p><p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>Create your first collection to organize your products.</p></div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    {storeCollections.map((col, i) => {
                      const count = products.filter((p) => p.category === col && (p.status || "published") !== "trashed").length;
                      const thumb = products.find((p) => p.category === col && p.image_url);
                      return (
                        <div key={i} onClick={() => setSelectedCollection(col)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12, cursor: "pointer", transition: "border-color 0.2s" }} onMouseEnter={(e) => e.currentTarget.style.borderColor = "rgba(255,107,53,0.15)"} onMouseLeave={(e) => e.currentTarget.style.borderColor = "rgba(255,255,255,0.04)"}>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {thumb?.image_url ? <img src={thumb.image_url} alt="" style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover" }} /> : <div style={{ width: 44, height: 44, borderRadius: 8, background: "rgba(255,255,255,0.04)", display: "flex", alignItems: "center", justifyContent: "center" }}><span style={{ fontSize: 16, color: "rgba(245,245,245,0.1)" }}>&#9633;</span></div>}
                            <div>
                              <div style={{ fontSize: 14, fontWeight: 700, textTransform: "uppercase" as const, marginBottom: 2 }}>{col}</div>
                              <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>{count} product{count !== 1 ? "s" : ""}</div>
                            </div>
                          </div>
                          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "rgba(245,245,245,0.15)" }}>&rarr;</span>
                            <button onClick={async (e) => { e.stopPropagation(); const updated = storeCollections.filter((_, idx) => idx !== i); setStoreCollections(updated); await supabase.from("sellers").update({ collections: updated }).eq("id", seller!.id); setSeller({ ...seller!, collections: updated }); }} style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 12, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>)}

          {/* ORDERS */}
          {tab === "orders" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8, flexWrap: "wrap" as const, gap: 12 }}>
              <div><h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Orders</h1><p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 16 }}>Track and manage incoming orders.</p></div>
              {selectedOrder && <button onClick={() => setSelectedOrder(null)} style={{ padding: "10px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>&larr; All Orders</button>}
            </div>

            {!selectedOrder && visibleOrders.length > 0 && (
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.2)", marginBottom: 16 }}>{visibleOrders.length} order{visibleOrders.length !== 1 ? "s" : ""}</p>
            )}

            {selectedOrder ? (
              <div>
                <div style={{ padding: "24px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, marginBottom: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20, flexWrap: "wrap" as const, gap: 12 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 900, textTransform: "uppercase" as const }}>Order #{selectedOrder.order_number}</h2>
                    <span style={{ fontSize: 12, color: "rgba(245,245,245,0.25)" }}>{new Date(selectedOrder.created_at).toLocaleString()}</span>
                  </div>

                  {/* STATUS CONTROLS */}
                  {orderSaved && <div style={{ padding: "8px 16px", background: "rgba(34,197,94,0.1)", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 10, marginBottom: 16, fontSize: 12, fontWeight: 700, color: "#22c55e", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Changes saved</div>}
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" as const }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, alignSelf: "center", marginRight: 4 }}>Payment:</label>
                    {["awaiting_payment", "paid", "refunded"].map((s) => (
                      <button key={s} onClick={async () => { const { error } = await supabase.from("orders").update({ payment_status: s }).eq("id", selectedOrder.id); if (error) { console.error("Update failed:", error); alert("Failed to save: " + error.message); return; } const updated = { ...selectedOrder, payment_status: s }; setSelectedOrder(updated); setOrders(orders.map((o) => o.id === selectedOrder.id ? updated : o)); setOrderSaved(true); setTimeout(() => setOrderSaved(false), 2000); }} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: selectedOrder.payment_status === s ? (s === "paid" ? "rgba(34,197,94,0.15)" : s === "refunded" ? "rgba(255,61,110,0.1)" : "rgba(251,191,36,0.1)") : "rgba(255,255,255,0.03)", color: selectedOrder.payment_status === s ? (s === "paid" ? "#22c55e" : s === "refunded" ? "#ff3d6e" : "#fbbf24") : "rgba(245,245,245,0.25)" }}>{s.replace("_", " ")}</button>
                    ))}
                  </div>
                  <div style={{ display: "flex", gap: 8, marginBottom: 24, flexWrap: "wrap" as const }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.08em", textTransform: "uppercase" as const, alignSelf: "center", marginRight: 4 }}>Status:</label>
                    {["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"].map((s) => (
                      <button key={s} onClick={async () => { const { error } = await supabase.from("orders").update({ status: s }).eq("id", selectedOrder.id); if (error) { console.error("Update failed:", error); alert("Failed to save: " + error.message); return; } const updated = { ...selectedOrder, status: s }; setSelectedOrder(updated); setOrders(orders.map((o) => o.id === selectedOrder.id ? updated : o)); setOrderSaved(true); setTimeout(() => setOrderSaved(false), 2000); }} style={{ padding: "7px 14px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: selectedOrder.status === s ? (s === "delivered" ? "rgba(34,197,94,0.15)" : s === "cancelled" ? "rgba(255,61,110,0.1)" : s === "shipped" ? "rgba(37,99,235,0.1)" : s === "confirmed" || s === "processing" ? "rgba(255,107,53,0.08)" : "rgba(251,191,36,0.1)") : "rgba(255,255,255,0.03)", color: selectedOrder.status === s ? (s === "delivered" ? "#22c55e" : s === "cancelled" ? "#ff3d6e" : s === "shipped" ? "#2563eb" : s === "confirmed" || s === "processing" ? N : "#fbbf24") : "rgba(245,245,245,0.25)" }}>{s}</button>
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
                  {(selectedOrder.items || []).map((item, i) => {
                    const img = item.image || products.find((p) => p.name === item.name)?.image_url;
                    return (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 0", borderBottom: i < selectedOrder.items.length - 1 ? "1px solid rgba(255,255,255,0.04)" : "none" }}>
                      {img ? <img src={img} alt="" style={{ width: 44, height: 52, borderRadius: 6, objectFit: "cover", flexShrink: 0 }} /> : <div style={{ width: 44, height: 52, borderRadius: 6, background: "rgba(255,255,255,0.04)", flexShrink: 0 }} />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{item.name}</div>
                        {item.variant && <div style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>{item.variant}</div>}
                        <div style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>Qty: {item.qty}</div>
                      </div>
                      <div style={{ fontSize: 15, fontWeight: 800 }}>R{(item.price * item.qty).toFixed(0)}</div>
                    </div>
                    );
                  })}
                  <div style={{ borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 16, marginTop: 8 }}>
                    {selectedOrder.shipping_cost > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, color: "rgba(245,245,245,0.25)", marginBottom: 6 }}><span>Shipping</span><span>R{selectedOrder.shipping_cost}</span></div>}
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 18, fontWeight: 900 }}><span>Total</span><span>R{selectedOrder.total}</span></div>
                  </div>
                  <div style={{ marginTop: 12, fontSize: 11, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Payment: {selectedOrder.payment_method || "N/A"}</div>
                </div>
              </div>
            ) : visibleOrders.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}><p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No orders yet</p><p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>Orders will appear here when customers buy from your store.</p></div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {visibleOrders.map((order) => (
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

          {/* ABANDONED */}
          {tab === "abandoned" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Abandoned Checkouts</h1>
            <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 24 }}>Customers who started PayFast checkout but didn't complete payment.</p>

            {abandonedOrders.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}>
                <p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No abandoned checkouts</p>
                <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>When customers leave without paying, they'll show up here.</p>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {abandonedOrders.map((order) => (
                  <div key={order.id} style={{ padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" as const, gap: 12, marginBottom: 10 }}>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>#{order.order_number} - {order.customer_name || "Unknown"}</div>
                        <div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", marginTop: 2 }}>{order.customer_email} {order.customer_phone ? " / " + order.customer_phone : ""}</div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <span style={{ fontSize: 16, fontWeight: 900 }}>R{order.total}</span>
                        <span style={{ padding: "5px 10px", borderRadius: 100, fontSize: 9, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: "rgba(255,61,110,0.08)", color: "#ff3d6e" }}>Abandoned</span>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const, fontSize: 11, color: "rgba(245,245,245,0.2)" }}>
                      {(order.items || []).map((item, i) => (
                        <span key={i} style={{ padding: "4px 10px", background: "rgba(255,255,255,0.03)", borderRadius: 6, border: "1px solid rgba(255,255,255,0.04)" }}>{item.name} x{item.qty}</span>
                      ))}
                      <span style={{ marginLeft: "auto" }}>{new Date(order.created_at).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>)}

          {/* DISCOUNTS */}
          {tab === "discounts" && (<div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 32, flexWrap: "wrap" as const, gap: 12 }}>
              <div>
                <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Discount Codes</h1>
                <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)" }}>Create promo codes for cart, products, collections, or shipping.</p>
              </div>
              <button onClick={() => { if (showDcForm) { setShowDcForm(false); setDcEditId(null); } else { setDcCode(""); setDcValue(""); setDcMinOrder(""); setDcMaxUses(""); setDcExpires(""); setDcType("percentage"); setDcAppliesTo("cart"); setDcProductIds([]); setDcCollections([]); setDcShowCountdown(false); setDcEditId(null); setShowDcForm(true); } }} style={{ padding: "12px 24px", background: showDcForm ? "rgba(255,255,255,0.03)" : G, color: showDcForm ? "rgba(245,245,245,0.4)" : "#fff", border: showDcForm ? "1px solid rgba(255,255,255,0.06)" : "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{showDcForm ? "Cancel" : "+ New Code"}</button>
            </div>

            {/* CREATE / EDIT FORM */}
            {showDcForm && (
              <div style={{ padding: "28px 24px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, marginBottom: 24 }}>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Discount Code</label>
                    <input type="text" value={dcCode} onChange={(e) => setDcCode(e.target.value.toUpperCase().replace(/\s/g, ""))} placeholder="e.g. WELCOME10" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 14, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", fontWeight: 700, letterSpacing: "0.04em" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Applies To</label>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                      {[{ k: "cart", l: "Cart" }, { k: "product", l: "Product" }, { k: "collection", l: "Collection" }, { k: "shipping", l: "Shipping" }].map((t) => (
                        <button key={t.k} onClick={() => setDcAppliesTo(t.k)} style={{ padding: "10px", borderRadius: 8, background: dcAppliesTo === t.k ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.03)", border: dcAppliesTo === t.k ? "1px solid rgba(255,107,53,0.15)" : "1px solid rgba(255,255,255,0.06)", color: dcAppliesTo === t.k ? N : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>{t.l}</button>
                      ))}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Discount Amount</label>
                    <div style={{ display: "flex", gap: 0, border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, overflow: "hidden" }}>
                      <div style={{ display: "flex" }}>
                        {[{ k: "percentage", l: "%" }, { k: "fixed", l: "R" }].map((t) => (
                          <button key={t.k} onClick={() => { setDcType(t.k); if (t.k === "percentage" && parseFloat(dcValue) > 100) setDcValue("100"); }} style={{ padding: "12px 16px", background: dcType === t.k ? "rgba(255,107,53,0.12)" : "rgba(255,255,255,0.03)", border: "none", borderRight: "1px solid rgba(255,255,255,0.06)", color: dcType === t.k ? N : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>{t.l}</button>
                        ))}
                      </div>
                      <input type="text" inputMode="numeric" value={dcValue} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ""); if (dcType === "percentage" && parseFloat(v) > 100) { setDcValue("100"); return; } setDcValue(v); }} placeholder={dcType === "percentage" ? "e.g. 10" : "e.g. 50"} style={{ flex: 1, padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "none", color: "#f5f5f5", fontSize: 14, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", fontWeight: 600 }} />
                    </div>
                    {dcType === "percentage" && <p style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", marginTop: 4 }}>Max 100%</p>}
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Preview</label>
                    <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, fontSize: 16, fontWeight: 800, color: dcValue ? N : "rgba(245,245,245,0.15)" }}>
                      {dcValue ? (dcType === "percentage" ? dcValue + "% OFF" : "R" + dcValue + " OFF") : "Set amount"}
                    </div>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 16 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Min Order (R)</label>
                    <input type="text" inputMode="numeric" value={dcMinOrder} onChange={(e) => setDcMinOrder(e.target.value.replace(/[^0-9]/g, ""))} placeholder="0" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Max Uses</label>
                    <input type="text" inputMode="numeric" value={dcMaxUses} onChange={(e) => setDcMaxUses(e.target.value.replace(/[^0-9]/g, ""))} placeholder="Unlimited" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Expires</label>
                    <input type="date" value={dcExpires} onChange={(e) => setDcExpires(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                </div>

                {/* PRODUCT SELECTOR */}
                {dcAppliesTo === "product" && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8, display: "block" }}>Select Products</label>
                    <div style={{ maxHeight: 200, overflow: "auto", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, background: "rgba(255,255,255,0.02)" }}>
                      {products.filter((p) => (p.status || "published") !== "trashed").map((p) => (
                        <div key={p.id} onClick={() => setDcProductIds(dcProductIds.includes(p.id) ? dcProductIds.filter((x) => x !== p.id) : [...dcProductIds, p.id])} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid rgba(255,255,255,0.03)", background: dcProductIds.includes(p.id) ? "rgba(255,107,53,0.04)" : "transparent" }}>
                          <div style={{ width: 18, height: 18, borderRadius: 4, border: dcProductIds.includes(p.id) ? "2px solid " + N : "1px solid rgba(255,255,255,0.12)", background: dcProductIds.includes(p.id) ? "rgba(255,107,53,0.15)" : "transparent", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: N }}>{dcProductIds.includes(p.id) ? "\u2713" : ""}</div>
                          {p.image_url ? <img src={p.image_url} alt="" style={{ width: 28, height: 28, borderRadius: 4, objectFit: "cover" }} /> : <div style={{ width: 28, height: 28, borderRadius: 4, background: "rgba(255,255,255,0.04)" }} />}
                          <span style={{ fontSize: 13, fontWeight: 500 }}>{p.name}</span>
                          <span style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginLeft: "auto" }}>R{p.price}</span>
                        </div>
                      ))}
                    </div>
                    {dcProductIds.length > 0 && <p style={{ fontSize: 11, color: N, marginTop: 6 }}>{dcProductIds.length} product{dcProductIds.length !== 1 ? "s" : ""} selected</p>}
                  </div>
                )}

                {/* COLLECTION SELECTOR */}
                {dcAppliesTo === "collection" && (
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 8, display: "block" }}>Select Collections</label>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" as const }}>
                      {storeCollections.map((col) => (
                        <button key={col} onClick={() => setDcCollections(dcCollections.includes(col) ? dcCollections.filter((x) => x !== col) : [...dcCollections, col])} style={{ padding: "8px 16px", borderRadius: 100, background: dcCollections.includes(col) ? "rgba(255,107,53,0.08)" : "rgba(255,255,255,0.03)", border: dcCollections.includes(col) ? "1px solid rgba(255,107,53,0.15)" : "1px solid rgba(255,255,255,0.06)", color: dcCollections.includes(col) ? N : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>{col}</button>
                      ))}
                    </div>
                    {dcCollections.length > 0 && <p style={{ fontSize: 11, color: N, marginTop: 6 }}>{dcCollections.length} collection{dcCollections.length !== 1 ? "s" : ""} selected</p>}
                  </div>
                )}

                {dcAppliesTo === "shipping" && (
                  <div style={{ padding: "12px 16px", background: "rgba(251,191,36,0.04)", border: "1px solid rgba(251,191,36,0.1)", borderRadius: 10, marginBottom: 16, fontSize: 12, color: "#fbbf24" }}>Shipping discounts apply to delivery fees only. Discount cannot exceed the shipping cost.</div>
                )}

                {/* COUNTDOWN TOGGLE */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "12px 0", marginBottom: 16 }}>
                  <div><span style={{ fontSize: 13 }}>Show countdown timer on store</span><br /><span style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Display a countdown to expiry on product/collection pages</span></div>
                  <button onClick={() => setDcShowCountdown(!dcShowCountdown)} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: dcShowCountdown ? N : "rgba(255,255,255,0.08)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: dcShowCountdown ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
                </div>

                <button onClick={async () => {
                  if (!dcCode || !dcValue || !seller) return;
                  if (dcType === "percentage" && parseFloat(dcValue) > 100) { alert("Percentage cannot exceed 100%"); return; }
                  if (dcType === "percentage" && parseFloat(dcValue) <= 0) { alert("Discount must be greater than 0"); return; }
                  if (dcType === "fixed" && parseFloat(dcValue) <= 0) { alert("Discount amount must be greater than R0"); return; }
                  if (dcAppliesTo === "product" && dcProductIds.length === 0) { alert("Please select at least one product"); return; }
                  if (dcAppliesTo === "collection" && dcCollections.length === 0) { alert("Please select at least one collection"); return; }
                  setDcSaving(true);
                  const payload = {
                    seller_id: seller.id, code: dcCode.toUpperCase(), type: dcType,
                    value: parseFloat(dcValue), min_order: parseFloat(dcMinOrder) || 0,
                    max_uses: dcMaxUses ? parseInt(dcMaxUses) : null,
                    expires_at: dcExpires ? new Date(dcExpires).toISOString() : null,
                    applies_to: dcAppliesTo, product_ids: dcProductIds, collection_names: dcCollections,
                    show_countdown: dcShowCountdown,
                  };
                  if (dcEditId) {
                    const { error } = await supabase.from("discount_codes").update(payload).eq("id", dcEditId);
                    if (!error) { setDiscountCodes(discountCodes.map((d) => d.id === dcEditId ? { ...d, ...payload } as DiscountCode : d)); setShowDcForm(false); setDcEditId(null); }
                    else alert("Error: " + error.message);
                  } else {
                    const { data, error } = await supabase.from("discount_codes").insert(payload).select().single();
                    if (data) { setDiscountCodes([data, ...discountCodes]); setShowDcForm(false); }
                    if (error) alert("Error: " + error.message);
                  }
                  setDcSaving(false);
                }} disabled={dcSaving || !dcCode || !dcValue} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: dcSaving ? "not-allowed" : "pointer", opacity: (dcSaving || !dcCode || !dcValue) ? 0.5 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{dcSaving ? "Saving..." : dcEditId ? "Save Changes" : "Create Discount Code"}</button>
              </div>
            )}

            {/* COLLAPSIBLE CATEGORIES */}
            {!showDcForm && discountCodes.length === 0 ? (
              <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}>
                <p style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No discount codes yet</p>
                <p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>Create your first code to start offering promotions.</p>
              </div>
            ) : !showDcForm && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {[{ key: "cart", label: "Cart / Order Discounts", desc: "Applies to entire cart total" }, { key: "product", label: "Product Discounts", desc: "Applies to specific products" }, { key: "collection", label: "Collection Discounts", desc: "Applies to product collections" }, { key: "shipping", label: "Shipping Discounts", desc: "Applies to delivery fees" }].map((cat) => {
                  const catCodes = discountCodes.filter((dc) => (dc.applies_to || "cart") === cat.key);
                  return (
                    <div key={cat.key}>
                      <button onClick={() => setOpenDiscountCat(openDiscountCat === cat.key ? null : cat.key)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 18px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: openDiscountCat === cat.key ? "12px 12px 0 0" : 12, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                          <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", margin: 0, color: "#f5f5f5" }}>{cat.label}</h3>
                          <span style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>({catCodes.length})</span>
                        </div>
                        <span style={{ fontSize: 14, color: "rgba(245,245,245,0.3)", transition: "transform 0.2s", transform: openDiscountCat === cat.key ? "rotate(180deg)" : "rotate(0)" }}>{"\u25BC"}</span>
                      </button>
                      {openDiscountCat === cat.key && (
                        <div style={{ border: "1px solid rgba(255,255,255,0.05)", borderTop: "none", borderRadius: "0 0 12px 12px", background: "rgba(255,255,255,0.01)" }}>
                          {catCodes.length === 0 ? (
                            <p style={{ padding: "20px 18px", fontSize: 12, color: "rgba(245,245,245,0.2)" }}>No {cat.label.toLowerCase()} created yet.</p>
                          ) : catCodes.map((dc) => (
                            <div key={dc.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.03)", flexWrap: "wrap" as const, gap: 10 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                <div style={{ padding: "6px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, fontWeight: 800, fontSize: 13, letterSpacing: "0.06em", color: N }}>{dc.code}</div>
                                <div>
                                  <div style={{ fontSize: 13, fontWeight: 700 }}>{dc.type === "percentage" ? dc.value + "% off" : "R" + dc.value + " off"}</div>
                                  <div style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", marginTop: 2 }}>
                                    {dc.min_order > 0 ? "Min R" + dc.min_order + " " : ""}
                                    {dc.max_uses ? "Max " + dc.max_uses + " uses " : "Unlimited "}
                                    - Used {dc.used_count}x
                                    {dc.expires_at ? " - Exp " + new Date(dc.expires_at).toLocaleDateString() : ""}
                                    {dc.product_ids?.length > 0 ? " - " + dc.product_ids.length + " products" : ""}
                                    {dc.collection_names?.length > 0 ? " - " + dc.collection_names.join(", ") : ""}
                                    {dc.show_countdown ? " - Countdown ON" : ""}
                                  </div>
                                </div>
                              </div>
                              <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                                <button onClick={() => { setDcEditId(dc.id); setDcCode(dc.code); setDcType(dc.type); setDcValue(String(dc.value)); setDcMinOrder(dc.min_order > 0 ? String(dc.min_order) : ""); setDcMaxUses(dc.max_uses ? String(dc.max_uses) : ""); setDcExpires(dc.expires_at ? dc.expires_at.split("T")[0] : ""); setDcAppliesTo(dc.applies_to || "cart"); setDcProductIds(dc.product_ids || []); setDcCollections(dc.collection_names || []); setDcShowCountdown(dc.show_countdown || false); setShowDcForm(true); }} style={{ padding: "5px 12px", borderRadius: 100, fontSize: 10, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "1px solid rgba(255,255,255,0.08)", background: "rgba(255,255,255,0.03)", color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif" }}>Edit</button>
                                <button onClick={async () => { await supabase.from("discount_codes").update({ active: !dc.active }).eq("id", dc.id); setDiscountCodes(discountCodes.map((d) => d.id === dc.id ? { ...d, active: !d.active } : d)); }} style={{ padding: "5px 12px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", cursor: "pointer", border: "none", fontFamily: "'Schibsted Grotesk', sans-serif", background: dc.active ? "rgba(34,197,94,0.1)" : "rgba(255,255,255,0.03)", color: dc.active ? "#22c55e" : "rgba(245,245,245,0.25)" }}>{dc.active ? "Active" : "Off"}</button>
                                <button onClick={async () => { if (!confirm("Delete this discount code?")) return; await supabase.from("discount_codes").delete().eq("id", dc.id); setDiscountCodes(discountCodes.filter((d) => d.id !== dc.id)); }} style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>
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

          {/* MY STORE */}
          {tab === "mystore" && (<div>
            <h1 style={{ fontSize: "clamp(20px, 4vw, 28px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Edit My Store</h1>
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

            {/* VISUAL EDITOR */}
            {seller?.subdomain && (
            <div style={{ marginBottom: 40 }}>
              <h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 }}>Visual Editor</h3>
              <p style={{ fontSize: 12, color: "rgba(245,245,245,0.25)", marginBottom: 16 }}>Open the full store editor to see live changes as you edit.</p>
              <a href="/dashboard/editor" style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "14px 32px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em", textDecoration: "none" }}>Open Store Editor &rarr;</a>
            </div>
            )}

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
              {storeConfig.trust_items.length < 6 && <button onClick={() => setStoreConfig({ ...storeConfig, trust_items: [...storeConfig.trust_items, { icon: "✦", title: "", desc: "" }] })} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, marginTop: 4 }}>+ Add Item</button>}
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
                    <span style={{ flex: 1, padding: "10px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, fontSize: 13, color: "#f5f5f5" }}>{opt.name} - <span style={{ color: N }}>R{opt.price}</span></span>
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

            {/* WHATSAPP CHECKOUT */}
            <div style={{ marginBottom: 32, padding: "20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div><h3 style={{ fontSize: 13, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>WhatsApp Checkout</h3><p style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 4 }}>Allow customers to place orders via WhatsApp message</p></div>
                <button onClick={() => setCheckoutConfig({ ...checkoutConfig, whatsapp_checkout_enabled: !checkoutConfig.whatsapp_checkout_enabled })} style={{ width: 48, height: 28, borderRadius: 100, border: "none", cursor: "pointer", position: "relative" as const, background: checkoutConfig.whatsapp_checkout_enabled ? "#25d366" : "rgba(255,255,255,0.08)" }}><div style={{ width: 22, height: 22, borderRadius: "50%", background: "#fff", position: "absolute" as const, top: 3, left: checkoutConfig.whatsapp_checkout_enabled ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 4px rgba(0,0,0,0.2)" }} /></button>
              </div>
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