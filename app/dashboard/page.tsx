"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

interface Variant { name: string; options: string[]; }

interface Seller {
  id: string; email: string; store_name: string; whatsapp_number: string; subdomain: string;
  template: string; plan: string; primary_color: string; logo_url: string; banner_url: string;
  tagline: string; description: string;
}

interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean;
}

interface Order {
  id: string; order_number: number; customer_name: string; customer_phone: string;
  items: { name: string; qty: number; price: number }[]; total: number;
  status: string; payment_status: string; created_at: string;
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
  const [tab, setTab] = useState<"overview" | "products" | "orders" | "mystore">("overview");

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
  const [storeSaving, setStoreSaving] = useState(false);
  const [storeSaved, setStoreSaved] = useState(false);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const logoInputRef = useRef<HTMLInputElement>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { checkAuth(); }, []);

  const checkAuth = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: sd } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (sd) { setSeller(sd); setStoreTemplate(sd.template || "clean-minimal"); setStoreColor(sd.primary_color || "#ff6b35"); setStoreTagline(sd.tagline || ""); setStoreDescription(sd.description || ""); setLogoPreview(sd.logo_url || ""); setBannerPreview(sd.banner_url || ""); }
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (pd) setProducts(pd);
    const { data: od } = await supabase.from("orders").select("*").eq("seller_id", user.id).order("created_at", { ascending: false });
    if (od) setOrders(od);
    setLoading(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); router.push("/login"); };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 2*1024*1024) { alert("Logo must be under 2MB"); return; } setLogoFile(f); const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); };
  const handleBannerSelect = (e: React.ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5*1024*1024) { alert("Banner must be under 5MB"); return; } setBannerFile(f); const r = new FileReader(); r.onload = (ev) => setBannerPreview(ev.target?.result as string); r.readAsDataURL(f); };

  const saveStoreSettings = async () => {
    if (!seller) return; setStoreSaving(true); setStoreSaved(false);
    let logoUrl = seller.logo_url || ""; let bannerUrl = seller.banner_url || "";
    if (logoFile) { const ext = logoFile.name.split(".").pop(); const path = seller.id + "/logo." + ext; await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); logoUrl = data.publicUrl + "?t=" + Date.now(); }
    if (bannerFile) { const ext = bannerFile.name.split(".").pop(); const path = seller.id + "/banner." + ext; await supabase.storage.from("store-assets").upload(path, bannerFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); bannerUrl = data.publicUrl + "?t=" + Date.now(); }
    const { error } = await supabase.from("sellers").update({ template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl, banner_url: bannerUrl }).eq("id", seller.id);
    if (!error) { setSeller({ ...seller, template: storeTemplate, primary_color: storeColor, tagline: storeTagline, description: storeDescription, logo_url: logoUrl, banner_url: bannerUrl }); setLogoFile(null); setBannerFile(null); setStoreSaved(true); setTimeout(() => setStoreSaved(false), 3000); }
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
    if (formImages.length + existingImages.length + files.length > 6) { alert("Maximum 6 images"); return; }
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
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}>
      <div style={{ width: 32, height: 32, border: "3px solid rgba(255,255,255,0.06)", borderTopColor: "#ff6b35", borderRadius: "50%", animation: "spin 0.8s linear infinite" }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ color: "rgba(245,245,245,0.35)", marginTop: 16 }}>Loading dashboard...</p>
    </div>
  );

  const todayOrders = orders.filter((o) => new Date(o.created_at).toDateString() === new Date().toDateString());
  const totalRevenue = orders.filter((o) => o.payment_status === "paid").reduce((s, o) => s + o.total, 0);
  const totalImageSlots = existingImages.length + formImages.length;

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

  return (
    <div style={{ minHeight: "100vh", background: "#030303", display: "flex", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5" }}>
      {/* SIDEBAR */}
      <aside style={{ width: 260, borderRight: "1px solid rgba(255,255,255,0.05)", padding: "24px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "fixed", top: 0, left: 0, bottom: 0, background: "#080808" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const }}>
            CATALOG<span style={{ background: G, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>STORE</span>
          </div>

          <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 2, textTransform: "uppercase" as const, letterSpacing: "-0.02em" }}>{seller?.store_name || "My Store"}</div>
            <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 }}>{seller?.plan || "Free"} plan</div>
          </div>

          <nav style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {(["overview", "products", "orders", "mystore"] as const).map((t) => (
              <button key={t} onClick={() => setTab(t)} style={{ width: "100%", padding: "12px 16px", background: tab === t ? "rgba(255,107,53,0.06)" : "transparent", border: tab === t ? "1px solid rgba(255,107,53,0.1)" : "1px solid transparent", borderRadius: 10, color: tab === t ? "#f5f5f5" : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 13, fontWeight: tab === t ? 700 : 500, textAlign: "left" as const, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em", transition: "all 0.2s" }}>
                {t === "overview" ? "Overview" : t === "products" ? "Products (" + products.length + ")" : t === "orders" ? "Orders (" + orders.length + ")" : "My Store"}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {seller?.subdomain && <a href={"/store/" + seller.subdomain} target="_blank" style={{ display: "block", padding: "12px 16px", background: "rgba(255,107,53,0.06)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 10, color: N, fontSize: 12, fontWeight: 700, textAlign: "center" as const, textDecoration: "none", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>View My Store</a>}
          <button onClick={handleLogout} style={{ padding: "10px 16px", background: "transparent", border: "none", color: "rgba(245,245,245,0.25)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, cursor: "pointer", textAlign: "left" as const, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>Log Out</button>
        </div>
      </aside>

      <main style={{ flex: 1, marginLeft: 260, padding: "36px 40px" }}>

        {/* OVERVIEW */}
        {tab === "overview" && (<div>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Welcome back, {seller?.store_name}</h1>
          <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Here is a quick look at your store.</p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 40 }}>
            {[{ n: products.length, l: "Products" }, { n: orders.length, l: "Total Orders" }, { n: todayOrders.length, l: "Orders Today" }, { n: "R" + totalRevenue.toFixed(0), l: "Revenue", c: N }].map((s, i) => (
              <div key={i} style={{ padding: "24px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14 }}>
                <div style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.04em", marginBottom: 4, color: s.c || "#f5f5f5" }}>{s.n}</div>
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.08em", fontWeight: 600 }}>{s.l}</div>
              </div>
            ))}
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 16 }}>Quick Actions</h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {[{ icon: "+", label: "Add Product", fn: () => { setTab("products"); resetForm(); setShowForm(true); } }, { icon: "\u2630", label: "View Orders", fn: () => setTab("orders") }, { icon: "\u2699", label: "Customize Store", fn: () => setTab("mystore") }].map((a, i) => (
              <button key={i} onClick={a.fn} style={{ padding: "24px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 14, color: "#f5f5f5", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>
                <span style={{ fontSize: 24 }}>{a.icon}</span><span>{a.label}</span>
              </button>
            ))}
          </div>
        </div>)}

        {/* PRODUCTS */}
        {tab === "products" && (<div>
          <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 }}>
            <div><h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Products</h1><p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Manage the products in your store.</p></div>
            <button onClick={() => { if (showForm) resetForm(); else { resetForm(); setShowForm(true); } }} style={{ padding: "12px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{showForm ? "Cancel" : "+ Add Product"}</button>
          </div>

          {showForm && (<div style={{ padding: 28, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 16, marginBottom: 24 }}>
            <h3 style={{ fontSize: 16, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.04em", marginBottom: 16 }}>{editingId ? "Edit Product" : "New Product"}</h3>
            <form onSubmit={handleSubmit}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                {[{ l: "Product Name", p: "e.g. Oversized Graphic Tee", v: formName, fn: setFormName, req: true }, { l: "Price (Rands)", p: "e.g. 349", v: formPrice, fn: setFormPrice, req: true, t: "number" }, { l: "Category", p: "e.g. Tops", v: formCategory, fn: setFormCategory }].map((f, i) => (
                  <div key={i} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{f.l}</label>
                    <input type={f.t || "text"} placeholder={f.p} value={f.v} onChange={(e) => f.fn(e.target.value)} required={f.req} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                ))}
              </div>

              {/* Images */}
              <div style={{ marginTop: 20 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Images (max 6)</label>
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" as const, marginTop: 8 }}>
                  {existingImages.map((url, i) => (<div key={"e" + i} style={{ width: 100, height: 100, borderRadius: 12, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeExistingImage(i)} style={{ position: "absolute" as const, top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && formImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 4, left: 4, padding: "2px 8px", background: N, color: "#fff", borderRadius: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                  {formPreviews.map((p, i) => (<div key={"n" + i} style={{ width: 100, height: 100, borderRadius: 12, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeNewImage(i)} style={{ position: "absolute" as const, top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && existingImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 4, left: 4, padding: "2px 8px", background: N, color: "#fff", borderRadius: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                  {totalImageSlots < 6 && (<button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 100, height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4 }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(245,245,245,0.2)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg><span style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700, letterSpacing: "0.04em" }}>Add Photo</span></button>)}
                  <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                </div>
              </div>

              {/* Variants */}
              <div style={{ marginTop: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Variants (optional)</label>
                {formVariants.length === 0 && (<div style={{ display: "flex", gap: 8, marginTop: 8, marginBottom: 16 }}>{PRESET_VARIANTS.map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>+ Custom</button></div>)}
                {formVariants.map((v, vi) => (<div key={vi} style={{ padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 14, marginBottom: 10, marginTop: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                    <input type="text" placeholder="Variant name" value={v.name} onChange={(e) => updateVariantName(vi, e.target.value)} style={{ padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 13, fontWeight: 700, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", maxWidth: 250 }} />
                    <button type="button" onClick={() => removeVariant(vi)} style={{ padding: "6px 14px", background: "transparent", border: "1px solid rgba(255,61,110,0.2)", borderRadius: 8, color: "#ff3d6e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const }}>Remove</button>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                    {v.options.map((o, oi) => (<div key={oi} style={{ display: "flex", alignItems: "center", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, overflow: "hidden" }}><input type="text" placeholder="e.g. Large" value={o} onChange={(e) => updateVariantOption(vi, oi, e.target.value)} style={{ width: 90, padding: "8px 10px", background: "transparent", border: "none", color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />{v.options.length > 1 && <button type="button" onClick={() => removeVariantOption(vi, oi)} style={{ padding: 8, background: "transparent", border: "none", borderLeft: "1px solid rgba(255,255,255,0.06)", color: "rgba(245,245,245,0.2)", fontSize: 10, cursor: "pointer" }}>&#10005;</button>}</div>))}
                    <button type="button" onClick={() => addVariantOption(vi)} style={{ padding: "8px 14px", background: "transparent", border: "1px dashed rgba(255,255,255,0.1)", borderRadius: 8, color: "rgba(245,245,245,0.25)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 600 }}>+ Add</button>
                  </div>
                </div>))}
                {formVariants.length > 0 && (<div style={{ display: "flex", gap: 8, marginTop: 12 }}>{PRESET_VARIANTS.filter((p) => !formVariants.some((v) => v.name.toLowerCase() === p.name.toLowerCase())).map((p) => (<button key={p.name} type="button" onClick={() => addPresetVariant(p)} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ {p.name}</button>))}<button type="button" onClick={addVariant} style={{ padding: "8px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 100, color: "rgba(245,245,245,0.4)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" as const }}>+ Custom</button></div>)}
              </div>

              {uploadProgress && <div style={{ marginTop: 12, fontSize: 12, color: N }}>{uploadProgress}</div>}
              <button type="submit" disabled={formSaving} style={{ width: "100%", padding: "14px 24px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: formSaving ? "not-allowed" : "pointer", opacity: formSaving ? 0.6 : 1, marginTop: 20, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{formSaving ? "Saving..." : editingId ? "Save Changes" : "Save Product"}</button>
            </form>
          </div>)}

          {products.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}><p style={{ fontSize: 18, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No products yet</p><p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>Add your first product to get your store going.</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {products.map((product) => (
                <div key={product.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                    {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" as const, border: "1px solid rgba(255,255,255,0.06)" }} /> : <div style={{ width: 48, height: 48, borderRadius: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.06)", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(245,245,245,0.15)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>}
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" as const, letterSpacing: "-0.01em" }}>{product.name}</div>
                      <div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.04em", fontWeight: 600 }}>
                        {product.category && <span>{product.category}</span>}
                        <span style={{ color: product.in_stock ? N : "#ff3d6e" }}>{product.in_stock ? "In Stock" : "Sold Out"}</span>
                        {product.images?.length > 0 && <span>{product.images.length} photo{product.images.length !== 1 ? "s" : ""}</span>}
                        {product.variants?.length > 0 && <span style={{ color: "rgba(255,107,53,0.5)" }}>{product.variants.map((v) => v.name).join(", ")}</span>}
                      </div>
                    </div>
                  </div>
                  <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em", marginRight: 24 }}>R{product.price}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    {[{ label: "Edit", color: N, fn: () => startEdit(product) }, { label: product.in_stock ? "Sold Out" : "In Stock", color: "rgba(245,245,245,0.4)", fn: () => toggleStock(product.id, product.in_stock) }, { label: "Delete", color: "#ff3d6e", fn: () => deleteProduct(product.id) }].map((a, i) => (
                      <button key={i} onClick={a.fn} style={{ padding: "8px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 8, color: a.color, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, cursor: "pointer", fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{a.label}</button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>)}

        {/* ORDERS */}
        {tab === "orders" && (<div>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>Orders</h1>
          <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Track your incoming orders.</p>
          {orders.length === 0 ? (
            <div style={{ textAlign: "center" as const, padding: "60px 20px", color: "rgba(245,245,245,0.35)" }}><p style={{ fontSize: 18, fontWeight: 800, textTransform: "uppercase" as const, marginBottom: 8 }}>No orders yet</p><p style={{ fontSize: 13, color: "rgba(245,245,245,0.2)" }}>Orders will appear here when customers buy from your store.</p></div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {orders.map((order) => (
                <div key={order.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.04)", borderRadius: 12 }}>
                  <div><div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, textTransform: "uppercase" as const }}>Order #{order.order_number}</div><div style={{ display: "flex", gap: 12, fontSize: 11, color: "rgba(245,245,245,0.25)", textTransform: "uppercase" as const, letterSpacing: "0.04em", fontWeight: 600 }}><span>{order.customer_name || "Customer"}</span><span>{new Date(order.created_at).toLocaleDateString()}</span></div></div>
                  <div style={{ fontSize: 18, fontWeight: 900, letterSpacing: "-0.03em", marginRight: 24 }}>R{order.total}</div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <span style={{ padding: "6px 12px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: order.payment_status === "paid" ? "rgba(255,107,53,0.08)" : "rgba(251,191,36,0.08)", color: order.payment_status === "paid" ? N : "#fbbf24" }}>{order.payment_status}</span>
                    <span style={{ padding: "6px 12px", borderRadius: 100, fontSize: 10, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", background: "rgba(255,61,110,0.08)", color: "#ff3d6e" }}>{order.status}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>)}

        {/* MY STORE */}
        {tab === "mystore" && (<div>
          <h1 style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase" as const, marginBottom: 4 }}>My Store</h1>
          <p style={{ fontSize: 14, color: "rgba(245,245,245,0.35)", marginBottom: 32 }}>Customize how your store looks to customers.</p>

          {/* Templates */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Choose Template</h3>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {TEMPLATES.map((t) => (<button key={t.id} onClick={() => setStoreTemplate(t.id)} style={{ padding: 0, border: storeTemplate === t.id ? "2px solid " + N : "2px solid rgba(255,255,255,0.06)", borderRadius: 14, background: "rgba(255,255,255,0.02)", cursor: "pointer", overflow: "hidden", textAlign: "left" as const }}>
                <div style={{ height: 100, background: t.colors.bg, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, padding: 14 }}>
                  {[1,2,3].map((n) => <div key={n} style={{ width: 44, height: 56, borderRadius: 6, background: t.colors.card, border: "1px solid " + (t.id === "glass-futuristic" ? "rgba(255,255,255,0.08)" : "#eee") }} />)}
                </div>
                <div style={{ padding: "12px 16px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}><span style={{ fontSize: 13, fontWeight: 800, color: "#f5f5f5", textTransform: "uppercase" as const, letterSpacing: "0.02em" }}>{t.name}</span>{storeTemplate === t.id && <span style={{ fontSize: 10, color: N, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>Selected</span>}</div>
                  <p style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", marginTop: 4 }}>{t.desc}</p>
                </div>
              </button>))}
            </div>
          </div>

          {/* Color */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Brand Color</h3>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, alignItems: "center" }}>
              {COLOR_PRESETS.map((c) => (<button key={c} onClick={() => setStoreColor(c)} style={{ width: 40, height: 40, borderRadius: 12, background: c, border: storeColor === c ? "3px solid #fff" : "3px solid transparent", cursor: "pointer", boxShadow: storeColor === c ? "0 0 0 2px " + c : "none" }} />))}
              <input type="color" value={storeColor} onChange={(e) => setStoreColor(e.target.value)} style={{ width: 40, height: 40, borderRadius: 12, border: "none", cursor: "pointer", background: "transparent" }} />
            </div>
          </div>

          {/* Logo & Banner */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Logo & Banner</h3>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Store Logo</label>
                <div onClick={() => logoInputRef.current?.click()} style={{ marginTop: 8, width: 120, height: 120, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {logoPreview ? <img src={logoPreview} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Upload</span>}
                </div>
                <input ref={logoInputRef} type="file" accept="image/*" onChange={handleLogoSelect} style={{ display: "none" }} />
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Store Banner</label>
                <div onClick={() => bannerInputRef.current?.click()} style={{ marginTop: 8, width: "100%", height: 120, borderRadius: 14, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {bannerPreview ? <img src={bannerPreview} alt="Banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Upload</span>}
                </div>
                <input ref={bannerInputRef} type="file" accept="image/*" onChange={handleBannerSelect} style={{ display: "none" }} />
              </div>
            </div>
          </div>

          {/* Tagline & Desc */}
          <div style={{ marginBottom: 40 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 16 }}>Store Info</h3>
            <div style={{ display: "flex", flexDirection: "column" as const, gap: 16 }}>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Tagline</label><input type="text" placeholder="e.g. Premium streetwear for the culture" value={storeTagline} onChange={(e) => setStoreTagline(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} /></div>
              <div><label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Description</label><textarea placeholder="Tell your customers what your brand is about..." value={storeDescription} onChange={(e) => setStoreDescription(e.target.value)} rows={4} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" as const }} /></div>
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <button onClick={saveStoreSettings} disabled={storeSaving} style={{ padding: "14px 40px", background: G, color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: storeSaving ? "not-allowed" : "pointer", opacity: storeSaving ? 0.6 : 1, textTransform: "uppercase" as const, letterSpacing: "0.06em" }}>{storeSaving ? "Saving..." : "Save Changes"}</button>
            {storeSaved && <span style={{ color: N, fontSize: 13, fontWeight: 700, textTransform: "uppercase" as const }}>Saved!</span>}
          </div>
        </div>)}

      </main>
    </div>
  );
}
