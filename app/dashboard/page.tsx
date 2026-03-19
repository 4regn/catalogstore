"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

interface Variant {
  name: string;
  options: string[];
}

interface Seller {
  id: string;
  email: string;
  store_name: string;
  whatsapp_number: string;
  subdomain: string;
  template: string;
  plan: string;
  primary_color: string;
  logo_url: string;
  banner_url: string;
  tagline: string;
  description: string;
}

interface Product {
  id: string;
  name: string;
  price: number;
  old_price: number | null;
  category: string;
  image_url: string;
  images: string[];
  variants: Variant[];
  in_stock: boolean;
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

const TEMPLATES = [
  {
    id: "clean-minimal",
    name: "Clean Minimal",
    desc: "White editorial design with sharp typography",
    colors: { bg: "#fafafa", card: "#ffffff", text: "#111111", accent: "#111111" },
  },
  {
    id: "warm-earthy",
    name: "Warm & Earthy",
    desc: "Organic tones with terracotta accents",
    colors: { bg: "#faf6f1", card: "#ffffff", text: "#3d2e22", accent: "#c4704b" },
  },
  {
    id: "soft-luxury",
    name: "Soft Luxury",
    desc: "Muted pastels with rounded, elegant feel",
    colors: { bg: "#f8f5f2", card: "#ffffff", text: "#2d2d3a", accent: "#9c8e7c" },
  },
  {
    id: "glass-futuristic",
    name: "Glass Futuristic",
    desc: "Dark theme with neon accents",
    colors: { bg: "#0a0a12", card: "rgba(255,255,255,0.04)", text: "#eeeef2", accent: "#00d4aa" },
  },
];

const COLOR_PRESETS = ["#111111", "#c4704b", "#9c8e7c", "#00d4aa", "#8b5cf6", "#e74c3c", "#2563eb", "#d4a017", "#16a34a", "#ec4899"];

export default function Dashboard() {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "products" | "orders" | "mystore">("overview");

  // Product form
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

  // Store settings
  const [storeTemplate, setStoreTemplate] = useState("clean-minimal");
  const [storeColor, setStoreColor] = useState("#111111");
  const [storeTagline, setStoreTagline] = useState("");
  const [storeDescription, setStoreDescription] = useState("");
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaved, setStoreSaved] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }

    const { data: sellerData } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (sellerData) {
      setSeller(sellerData);
      setStoreTemplate(sellerData.template || "clean-minimal");
      setStoreColor(sellerData.primary_color || "#111111");
      setStoreTagline(sellerData.tagline || "");
      setStoreDescription(sellerData.description || "");
      setLogoPreview(sellerData.logo_url || "");
      setBannerPreview(sellerData.banner_url || "");
    }

    const { data: productData } = await supabase.from("products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (productData) setProducts(productData);

    const { data: orderData } = await supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (orderData) setOrders(orderData);

    setLoading(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  // --- STORE SETTINGS ---
  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) { alert("Logo must be under 2MB"); return; }
    setLogoFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) { alert("Banner must be under 5MB"); return; }
    setBannerFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setBannerPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const saveStoreSettings = async () => {
    if (!seller) return;
    setStoreSaving(true);
    setStoreSaved(false);

    let logoUrl = seller.logo_url || "";
    let bannerUrl = seller.banner_url || "";

    if (logoFile) {
      const ext = logoFile.name.split(".").pop();
      const path = seller.id + "/logo." + ext;
      await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true });
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      logoUrl = data.publicUrl + "?t=" + Date.now();
    }

    if (bannerFile) {
      const ext = bannerFile.name.split(".").pop();
      const path = seller.id + "/banner." + ext;
      await supabase.storage.from("store-assets").upload(path, bannerFile, { upsert: true });
      const { data } = supabase.storage.from("store-assets").getPublicUrl(path);
      bannerUrl = data.publicUrl + "?t=" + Date.now();
    }

    const { error } = await supabase.from("sellers").update({
      template: storeTemplate,
      primary_color: storeColor,
      tagline: storeTagline,
      description: storeDescription,
      logo_url: logoUrl,
      banner_url: bannerUrl,
    }).eq("id", seller.id);

    if (!error) {
      setSeller({ ...seller, template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl, banner_url: bannerUrl });
      setLogoFile(null);
      setBannerFile(null);
      setStoreSaved(true);
      setTimeout(() => setStoreSaved(false), 3000);
    }

    setStoreSaving(false);
  };

  // --- PRODUCT FORM ---
  const resetForm = () => { setFormName(""); setFormPrice(""); setFormCategory(""); setFormImages([]); setFormPreviews([]); setExistingImages([]); setFormVariants([]); setUploadProgress(""); setEditingId(null); setShowForm(false); };

  const startEdit = (product: Product) => { setEditingId(product.id); setFormName(product.name); setFormPrice(String(product.price)); setFormCategory(product.category || ""); setFormImages([]); setFormPreviews([]); setExistingImages(product.images || []); setFormVariants(product.variants || []); setShowForm(true); };

  const addVariant = () => { setFormVariants([...formVariants, { name: "", options: [""] }]); };
  const removeVariant = (i: number) => { setFormVariants(formVariants.filter((_, idx) => idx !== i)); };
  const updateVariantName = (i: number, name: string) => { const u = [...formVariants]; u[i].name = name; setFormVariants(u); };
  const addVariantOption = (vi: number) => { const u = [...formVariants]; u[vi].options.push(""); setFormVariants(u); };
  const updateVariantOption = (vi: number, oi: number, val: string) => { const u = [...formVariants]; u[vi].options[oi] = val; setFormVariants(u); };
  const removeVariantOption = (vi: number, oi: number) => { const u = [...formVariants]; u[vi].options = u[vi].options.filter((_, i) => i !== oi); setFormVariants(u); };

  const PRESET_VARIANTS = [
    { name: "Size", options: ["S", "M", "L", "XL"] },
    { name: "Color", options: ["Black", "White"] },
    { name: "Material", options: ["Cotton", "Polyester"] },
  ];
  const addPresetVariant = (preset: Variant) => { if (!formVariants.some((v) => v.name.toLowerCase() === preset.name.toLowerCase())) setFormVariants([...formVariants, { ...preset, options: [...preset.options] }]); };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    if (formImages.length + existingImages.length + files.length > 6) { alert("Maximum 6 images per product"); return; }
    const valid = files.filter((f) => { if (!f.type.startsWith("image/")) return false; if (f.size > 5 * 1024 * 1024) { alert(f.name + " too large. Max 5MB."); return false; } return true; });
    setFormImages((prev) => [...prev, ...valid]);
    valid.forEach((file) => { const r = new FileReader(); r.onload = (ev) => { setFormPreviews((prev) => [...prev, ev.target?.result as string]); }; r.readAsDataURL(file); });
  };
  const removeNewImage = (i: number) => { setFormImages((p) => p.filter((_, idx) => idx !== i)); setFormPreviews((p) => p.filter((_, idx) => idx !== i)); };
  const removeExistingImage = (i: number) => { setExistingImages((p) => p.filter((_, idx) => idx !== i)); };

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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const cv = cleanVariants(formVariants);

    if (editingId) {
      let allImages = [...existingImages];
      if (formImages.length > 0) { const newUrls = await uploadImages(user.id, editingId); allImages = [...allImages, ...newUrls]; }
      const { error } = await supabase.from("products").update({ name: formName, price: parseFloat(formPrice), category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv }).eq("id", editingId);
      if (!error) setProducts(products.map((p) => p.id === editingId ? { ...p, name: formName, price: parseFloat(formPrice), category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv } : p));
    } else {
      const { data, error } = await supabase.from("products").insert({ seller_id: user.id, name: formName, price: parseFloat(formPrice), category: formCategory, in_stock: true, variants: cv }).select().single();
      if (error || !data) { setFormSaving(false); return; }
      let imageUrls: string[] = [];
      if (formImages.length > 0) { imageUrls = await uploadImages(user.id, data.id); await supabase.from("products").update({ images: imageUrls, image_url: imageUrls[0] || null }).eq("id", data.id); }
      setProducts([{ ...data, images: imageUrls, image_url: imageUrls[0] || null, variants: cv }, ...products]);
    }
    resetForm(); setFormSaving(false);
  };

  const toggleStock = async (id: string, cur: boolean) => { await supabase.from("products").update({ in_stock: !cur }).eq("id", id); setProducts(products.map((p) => p.id === id ? { ...p, in_stock: !cur } : p)); };
  const deleteProduct = async (id: string) => { await supabase.from("products").delete().eq("id", id); setProducts(products.filter((p) => p.id !== id)); };

  if (loading) return (
    <div style={st.loadingPage}>
      <div style={st.spinner} />
      <p style={{ color: "rgba(238,238,242,0.55)", marginTop: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>Loading your dashboard...</p>
    </div>
  );

  const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString());
  const totalRevenue = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
  const totalImageSlots = existingImages.length + formImages.length;

  return (
    <div style={st.page}>
      {/* SIDEBAR */}
      <aside style={st.sidebar}>
        <div style={st.sidebarTop}>
          <div style={st.logoRow}><div style={st.logoIcon}>C</div><div style={st.logoText}>Catalog<span style={{ color: "#00d4aa" }}>Store</span></div></div>
          <div style={st.storeInfo}><div style={st.storeName}>{seller?.store_name || "My Store"}</div><div style={st.storePlan}>{seller?.plan || "Free"} plan</div></div>
          <nav style={st.nav}>
            {(["overview", "products", "orders", "mystore"] as const).map((t) => (
              <button key={t} style={{ ...st.navBtn, ...(tab === t ? st.navBtnActive : {}) }} onClick={() => setTab(t)}>
                {t === "overview" ? "Overview" : t === "products" ? "Products (" + products.length + ")" : t === "orders" ? "Orders (" + orders.length + ")" : "My Store"}
              </button>
            ))}
          </nav>
        </div>
        <div style={st.sidebarBottom}>
          {seller?.subdomain && <a href={"/store/" + seller.subdomain} target="_blank" style={st.viewStore}>View My Store</a>}
          <button style={st.logoutBtn} onClick={handleLogout}>Log Out</button>
        </div>
      </aside>

      <main style={st.main}>

        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <h1 style={st.pageTitle}>Welcome back, {seller?.store_name || "Seller"}</h1>
            <p style={st.pageSubtitle}>Here is a quick look at your store.</p>
            <div style={st.statsGrid}>
              <div style={st.statCard}><div style={st.statNumber}>{products.length}</div><div style={st.statLabel}>Products</div></div>
              <div style={st.statCard}><div style={st.statNumber}>{orders.length}</div><div style={st.statLabel}>Total Orders</div></div>
              <div style={st.statCard}><div style={st.statNumber}>{todayOrders.length}</div><div style={st.statLabel}>Orders Today</div></div>
              <div style={st.statCard}><div style={{ ...st.statNumber, color: "#00d4aa" }}>R{totalRevenue.toFixed(0)}</div><div style={st.statLabel}>Total Revenue</div></div>
            </div>
            <h3 style={st.sectionTitle}>Quick Actions</h3>
            <div style={st.actionGrid}>
              <button style={st.actionCard} onClick={() => { setTab("products"); resetForm(); setShowForm(true); }}><span style={{ fontSize: 24 }}>+</span><span>Add Product</span></button>
              <button style={st.actionCard} onClick={() => setTab("orders")}><span style={{ fontSize: 24 }}>&#9776;</span><span>View Orders</span></button>
              <button style={st.actionCard} onClick={() => setTab("mystore")}><span style={{ fontSize: 24 }}>&#9998;</span><span>Customize Store</span></button>
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        {tab === "products" && (
          <div>
            <div style={st.tabHeader}>
              <div><h1 style={st.pageTitle}>Products</h1><p style={st.pageSubtitle}>Manage the products in your store.</p></div>
              <button style={st.addBtn} onClick={() => { if (showForm) resetForm(); else { resetForm(); setShowForm(true); } }}>{showForm ? "Cancel" : "+ Add Product"}</button>
            </div>

            {showForm && (
              <div style={st.formCard}>
                <h3 style={st.sectionTitle}>{editingId ? "Edit Product" : "New Product"}</h3>
                <form onSubmit={handleSubmit}>
                  <div style={st.formGrid}>
                    <div style={st.field}><label style={st.label}>Product Name</label><input type="text" placeholder="e.g. Oversized Graphic Tee" value={formName} onChange={(e) => setFormName(e.target.value)} required style={st.input} /></div>
                    <div style={st.field}><label style={st.label}>Price (Rands)</label><input type="number" placeholder="e.g. 349" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={st.input} /></div>
                    <div style={st.field}><label style={st.label}>Category</label><input type="text" placeholder="e.g. Tops" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={st.input} /></div>
                  </div>

                  <div style={{ marginTop: 20 }}>
                    <label style={st.label}>Product Images (max 6)</label>
                    <div style={st.imageUploadArea}>
                      {existingImages.map((url, i) => (<div key={"e" + i} style={st.imagePreview}><img src={url} alt="" style={st.previewImg} /><button type="button" onClick={() => removeExistingImage(i)} style={st.removeImgBtn}>&#10005;</button>{i === 0 && formImages.length === 0 && <div style={st.mainBadge}>Main</div>}</div>))}
                      {formPreviews.map((p, i) => (<div key={"n" + i} style={st.imagePreview}><img src={p} alt="" style={st.previewImg} /><button type="button" onClick={() => removeNewImage(i)} style={st.removeImgBtn}>&#10005;</button>{i === 0 && existingImages.length === 0 && <div style={st.mainBadge}>Main</div>}</div>))}
                      {totalImageSlots < 6 && (<button type="button" onClick={() => fileInputRef.current?.click()} style={st.uploadBtn}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(238,238,242,0.35)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span style={{ fontSize: 12, color: "rgba(238,238,242,0.35)", marginTop: 4 }}>Add Photo</span></button>)}
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                    </div>
                  </div>

                  <div style={{ marginTop: 24 }}>
                    <label style={st.label}>Variants (optional)</label>
                    {formVariants.length === 0 && (<div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 16 }}>{PRESET_VARIANTS.map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={st.presetBtn}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={st.presetBtn}>+ Custom</button></div>)}
                    {formVariants.map((v, vi) => (
                      <div key={vi} style={st.variantCard}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <input type="text" placeholder="Variant name" value={v.name} onChange={(e) => updateVariantName(vi, e.target.value)} style={{ ...st.input, fontWeight: 600, maxWidth: 250 }} />
                          <button type="button" onClick={() => removeVariant(vi)} style={st.removeVariantBtn}>Remove</button>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                          {v.options.map((o, oi) => (<div key={oi} style={st.optionChip}><input type="text" placeholder="e.g. Large" value={o} onChange={(e) => updateVariantOption(vi, oi, e.target.value)} style={st.optionInput} />{v.options.length > 1 && <button type="button" onClick={() => removeVariantOption(vi, oi)} style={st.removeOptionBtn}>&#10005;</button>}</div>))}
                          <button type="button" onClick={() => addVariantOption(vi)} style={st.addOptionBtn}>+ Add</button>
                        </div>
                      </div>
                    ))}
                    {formVariants.length > 0 && (<div style={{ display: "flex", gap: 8, marginTop: 12 }}>{PRESET_VARIANTS.filter((p) => !formVariants.some((v) => v.name.toLowerCase() === p.name.toLowerCase())).map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={st.presetBtn}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={st.presetBtn}>+ Custom</button></div>)}
                  </div>

                  {uploadProgress && <div style={{ marginTop: 12, fontSize: 13, color: "#00d4aa" }}>{uploadProgress}</div>}
                  <button type="submit" disabled={formSaving} style={{ ...st.addBtn, opacity: formSaving ? 0.6 : 1, width: "100%", marginTop: 20 }}>{formSaving ? "Saving..." : editingId ? "Save Changes" : "Save Product"}</button>
                </form>
              </div>
            )}

            {products.length === 0 ? (
              <div style={st.emptyState}><p style={{ fontSize: 18, marginBottom: 8 }}>No products yet</p><p style={{ color: "rgba(238,238,242,0.35)" }}>Add your first product to get your store going.</p></div>
            ) : (
              <div style={st.productList}>
                {products.map((product) => (
                  <div key={product.id} style={st.productRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                      {product.image_url ? <img src={product.image_url} alt={product.name} style={st.productThumb} /> : <div style={st.productThumbPlaceholder}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(238,238,242,0.2)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>}
                      <div style={st.productInfo}>
                        <div style={st.productName}>{product.name}</div>
                        <div style={st.productMeta}>
                          {product.category && <span style={st.productCategory}>{product.category}</span>}
                          <span style={{ color: product.in_stock ? "#00d4aa" : "#f87171" }}>{product.in_stock ? "In Stock" : "Sold Out"}</span>
                          {product.images?.length > 0 && <span style={{ color: "rgba(238,238,242,0.3)" }}>{product.images.length} photo{product.images.length !== 1 ? "s" : ""}</span>}
                          {product.variants?.length > 0 && <span style={{ color: "rgba(139,92,246,0.7)" }}>{product.variants.map((v) => v.name).join(", ")}</span>}
                        </div>
                      </div>
                    </div>
                    <div style={st.productPrice}>R{product.price}</div>
                    <div style={st.productActions}>
                      <button style={{ ...st.smallBtn, color: "#00d4aa" }} onClick={() => startEdit(product)}>Edit</button>
                      <button style={st.smallBtn} onClick={() => toggleStock(product.id, product.in_stock)}>{product.in_stock ? "Mark Sold Out" : "Mark In Stock"}</button>
                      <button style={{ ...st.smallBtn, color: "#f87171" }} onClick={() => deleteProduct(product.id)}>Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div>
            <h1 style={st.pageTitle}>Orders</h1><p style={st.pageSubtitle}>Track your incoming orders.</p>
            {orders.length === 0 ? (
              <div style={st.emptyState}><p style={{ fontSize: 18, marginBottom: 8 }}>No orders yet</p><p style={{ color: "rgba(238,238,242,0.35)" }}>Orders will appear here when customers buy from your store.</p></div>
            ) : (
              <div style={st.productList}>
                {orders.map((order) => (
                  <div key={order.id} style={st.productRow}>
                    <div style={st.productInfo}><div style={st.productName}>Order #{order.order_number}</div><div style={st.productMeta}><span>{order.customer_name || "Customer"}</span><span>{order.customer_phone || ""}</span><span>{new Date(order.created_at).toLocaleDateString()}</span></div></div>
                    <div style={st.productPrice}>R{order.total}</div>
                    <div style={st.productActions}>
                      <span style={{ ...st.statusBadge, background: order.payment_status === "paid" ? "rgba(0,212,170,0.12)" : "rgba(251,191,36,0.12)", color: order.payment_status === "paid" ? "#00d4aa" : "#fbbf24" }}>{order.payment_status}</span>
                      <span style={{ ...st.statusBadge, background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>{order.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* MY STORE */}
        {tab === "mystore" && (
          <div>
            <h1 style={st.pageTitle}>My Store</h1>
            <p style={st.pageSubtitle}>Customize how your store looks to customers.</p>

            {/* TEMPLATE PICKER */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={st.sectionTitle}>Choose Your Template</h3>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
                {TEMPLATES.map((tmpl) => (
                  <button
                    key={tmpl.id}
                    onClick={() => setStoreTemplate(tmpl.id)}
                    style={{
                      padding: 0,
                      border: storeTemplate === tmpl.id ? "2px solid #00d4aa" : "2px solid rgba(255,255,255,0.08)",
                      borderRadius: 16,
                      background: "rgba(255,255,255,0.02)",
                      cursor: "pointer",
                      overflow: "hidden",
                      textAlign: "left" as const,
                      transition: "all 0.2s",
                    }}
                  >
                    {/* Template preview */}
                    <div style={{ height: 120, background: tmpl.colors.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 12, padding: 16 }}>
                      <div style={{ width: 50, height: 65, borderRadius: 6, background: tmpl.colors.card, border: "1px solid " + (tmpl.id === "glass-futuristic" ? "rgba(255,255,255,0.1)" : "#eee") }} />
                      <div style={{ width: 50, height: 65, borderRadius: 6, background: tmpl.colors.card, border: "1px solid " + (tmpl.id === "glass-futuristic" ? "rgba(255,255,255,0.1)" : "#eee") }} />
                      <div style={{ width: 50, height: 65, borderRadius: 6, background: tmpl.colors.card, border: "1px solid " + (tmpl.id === "glass-futuristic" ? "rgba(255,255,255,0.1)" : "#eee") }} />
                    </div>
                    <div style={{ padding: "14px 18px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: "#eeeef2" }}>{tmpl.name}</span>
                        {storeTemplate === tmpl.id && <span style={{ fontSize: 11, color: "#00d4aa", fontWeight: 700 }}>SELECTED</span>}
                      </div>
                      <p style={{ fontSize: 12, color: "rgba(238,238,242,0.4)", marginTop: 4 }}>{tmpl.desc}</p>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* BRAND COLOR */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={st.sectionTitle}>Brand Color</h3>
              <p style={{ fontSize: 13, color: "rgba(238,238,242,0.4)", marginBottom: 16 }}>This color is used for buttons and accents on your store.</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
                {COLOR_PRESETS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setStoreColor(color)}
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 12,
                      background: color,
                      border: storeColor === color ? "3px solid #fff" : "3px solid transparent",
                      cursor: "pointer",
                      transition: "all 0.2s",
                      boxShadow: storeColor === color ? "0 0 0 2px " + color : "none",
                    }}
                  />
                ))}
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 8 }}>
                  <input
                    type="color"
                    value={storeColor}
                    onChange={(e) => setStoreColor(e.target.value)}
                    style={{ width: 40, height: 40, borderRadius: 12, border: "none", cursor: "pointer", background: "transparent" }}
                  />
                  <span style={{ fontSize: 12, color: "rgba(238,238,242,0.35)" }}>Custom</span>
                </div>
              </div>
            </div>

            {/* LOGO & BANNER */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={st.sectionTitle}>Logo & Banner</h3>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
                <div>
                  <label style={st.label}>Store Logo</label>
                  <div
                    onClick={() => logoInputRef.current?.click()}
                    style={{ marginTop: 8, width: 120, height: 120, borderRadius: 16, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                  >
                    {logoPreview ? (
                      <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(238,238,242,0.3)" }}>Upload Logo</span>
                    )}
                  </div>
                  <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} style={{ display: "none" }} />
                  <p style={{ fontSize: 11, color: "rgba(238,238,242,0.25)", marginTop: 6 }}>Square image. Max 2MB.</p>
                </div>
                <div>
                  <label style={st.label}>Store Banner</label>
                  <div
                    onClick={() => bannerInputRef.current?.click()}
                    style={{ marginTop: 8, width: "100%", height: 120, borderRadius: 16, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}
                  >
                    {bannerPreview ? (
                      <img src={bannerPreview} alt="Banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                    ) : (
                      <span style={{ fontSize: 12, color: "rgba(238,238,242,0.3)" }}>Upload Banner</span>
                    )}
                  </div>
                  <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerSelect} style={{ display: "none" }} />
                  <p style={{ fontSize: 11, color: "rgba(238,238,242,0.25)", marginTop: 6 }}>Wide image (1200x400 ideal). Max 5MB.</p>
                </div>
              </div>
            </div>

            {/* TAGLINE & DESCRIPTION */}
            <div style={{ marginBottom: 40 }}>
              <h3 style={st.sectionTitle}>Store Info</h3>
              <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
                <div style={st.field}>
                  <label style={st.label}>Tagline</label>
                  <input type="text" placeholder="e.g. Premium streetwear for the culture" value={storeTagline} onChange={(e) => setStoreTagline(e.target.value)} style={st.input} />
                </div>
                <div style={st.field}>
                  <label style={st.label}>Store Description</label>
                  <textarea
                    placeholder="Tell your customers what your brand is about..."
                    value={storeDescription}
                    onChange={(e) => setStoreDescription(e.target.value)}
                    rows={4}
                    style={{ ...st.input, resize: "vertical" as const }}
                  />
                </div>
              </div>
            </div>

            {/* SAVE */}
            <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
              <button
                onClick={saveStoreSettings}
                disabled={storeSaving}
                style={{ ...st.addBtn, opacity: storeSaving ? 0.6 : 1, padding: "14px 40px" }}
              >
                {storeSaving ? "Saving..." : "Save Changes"}
              </button>
              {storeSaved && <span style={{ color: "#00d4aa", fontSize: 14, fontWeight: 600 }}>Saved!</span>}
              {seller?.subdomain && (
                <a href={"/store/" + seller.subdomain} target="_blank" style={{ color: "rgba(238,238,242,0.4)", fontSize: 13, textDecoration: "underline" }}>
                  Preview store
                </a>
              )}
            </div>
          </div>
        )}

      </main>
    </div>
  );
}

const st: { [key: string]: React.CSSProperties } = {
  page: { minHeight: "100vh", background: "#06060b", display: "flex", fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#eeeef2" },
  loadingPage: { minHeight: "100vh", background: "#06060b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  spinner: { width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#00d4aa", borderRadius: "50%" },
  sidebar: { width: 260, borderRight: "1px solid rgba(255,255,255,0.07)", padding: "24px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "fixed", top: 0, left: 0, bottom: 0, background: "#0a0a12" },
  sidebarTop: { display: "flex", flexDirection: "column", gap: 28 },
  logoRow: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00d4aa 0%, #8b5cf6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#06060b", fontFamily: "'Bricolage Grotesque', sans-serif" },
  logoText: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em" },
  storeInfo: { padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 },
  storeName: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 2 },
  storePlan: { fontSize: 12, color: "rgba(238,238,242,0.35)", textTransform: "capitalize" as const },
  nav: { display: "flex", flexDirection: "column", gap: 4 },
  navBtn: { width: "100%", padding: "12px 16px", background: "transparent", border: "none", borderRadius: 10, color: "rgba(238,238,242,0.55)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 500, textAlign: "left" as const, cursor: "pointer", transition: "all 0.2s" },
  navBtnActive: { background: "rgba(255,255,255,0.05)", color: "#eeeef2", fontWeight: 600 },
  sidebarBottom: { display: "flex", flexDirection: "column", gap: 8 },
  viewStore: { display: "block", padding: "12px 16px", background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.2)", borderRadius: 10, color: "#00d4aa", fontSize: 13, fontWeight: 600, textAlign: "center" as const, textDecoration: "none" },
  logoutBtn: { padding: "10px 16px", background: "transparent", border: "none", color: "rgba(238,238,242,0.35)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, cursor: "pointer", textAlign: "left" as const },
  main: { flex: 1, marginLeft: 260, padding: "36px 40px" },
  pageTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 },
  pageSubtitle: { fontSize: 15, color: "rgba(238,238,242,0.45)", fontWeight: 300, marginBottom: 32 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 },
  statCard: { padding: "24px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 },
  statNumber: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 32, fontWeight: 800, marginBottom: 4 },
  statLabel: { fontSize: 13, color: "rgba(238,238,242,0.35)", fontWeight: 400 },
  sectionTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 16 },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  actionCard: { padding: "24px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, color: "#eeeef2", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" as const },
  tabHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  addBtn: { padding: "12px 24px", background: "#00d4aa", color: "#06060b", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  formCard: { padding: "28px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, marginBottom: 24 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: "rgba(238,238,242,0.55)", marginBottom: 4 },
  input: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#eeeef2", fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none" },
  imageUploadArea: { display: "flex", gap: 12, flexWrap: "wrap" as const, marginTop: 8 },
  imagePreview: { width: 100, height: 100, borderRadius: 12, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.1)" },
  previewImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  removeImgBtn: { position: "absolute" as const, top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  mainBadge: { position: "absolute" as const, bottom: 4, left: 4, padding: "2px 8px", background: "#00d4aa", color: "#06060b", borderRadius: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const },
  uploadBtn: { width: 100, height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4 },
  variantCard: { padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, marginBottom: 10, marginTop: 8 },
  presetBtn: { padding: "8px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 100, color: "rgba(238,238,242,0.55)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer" },
  removeVariantBtn: { padding: "6px 14px", background: "transparent", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, color: "#f87171", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, cursor: "pointer" },
  optionChip: { display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" },
  optionInput: { width: 90, padding: "8px 10px", background: "transparent", border: "none", color: "#eeeef2", fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none" },
  removeOptionBtn: { padding: "8px", background: "transparent", border: "none", borderLeft: "1px solid rgba(255,255,255,0.08)", color: "rgba(238,238,242,0.3)", fontSize: 10, cursor: "pointer" },
  addOptionBtn: { padding: "8px 14px", background: "transparent", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(238,238,242,0.35)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, cursor: "pointer" },
  emptyState: { textAlign: "center" as const, padding: "60px 20px", color: "rgba(238,238,242,0.55)" },
  productList: { display: "flex", flexDirection: "column", gap: 4 },
  productRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 },
  productThumb: { width: 48, height: 48, borderRadius: 10, objectFit: "cover" as const, border: "1px solid rgba(255,255,255,0.08)" },
  productThumbPlaceholder: { width: 48, height: 48, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  productMeta: { display: "flex", gap: 12, fontSize: 12, color: "rgba(238,238,242,0.35)" },
  productCategory: { color: "rgba(238,238,242,0.45)" },
  productPrice: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, marginRight: 24 },
  productActions: { display: "flex", gap: 8, alignItems: "center" },
  smallBtn: { padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(238,238,242,0.55)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, cursor: "pointer" },
  statusBadge: { padding: "6px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600, textTransform: "capitalize" as const },
};
