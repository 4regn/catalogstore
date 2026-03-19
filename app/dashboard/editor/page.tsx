"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

interface SocialLinks { whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string; }
interface TrustItem { icon: string; title: string; desc: string; }
interface PolicyItem { title: string; desc: string; }
interface StoreConfig {
  show_banner_text: boolean; show_marquee: boolean; show_collections: boolean; show_about: boolean;
  show_trust_bar: boolean; show_policies: boolean; show_newsletter: boolean; announcement: string;
  marquee_texts: string[]; trust_items: TrustItem[]; policy_items: PolicyItem[];
}
interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string; template: string;
  primary_color: string; logo_url: string; banner_url: string; tagline: string; description: string;
  collections: string[]; social_links: SocialLinks; store_config: StoreConfig;
}
interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; in_stock: boolean;
}

const DEFAULTS: StoreConfig = { show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "", marquee_texts: ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: [{ icon: "â˜…", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "âœˆ", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "â†º", title: "Easy Returns", desc: "14-day policy" }, { icon: "âš¡", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy on unworn items." }, { title: "Payment", desc: "Cards via Yoco + WhatsApp checkout." }] };

type Section = "visibility" | "branding" | "announcement" | "marquee" | "trust" | "policies" | "social" | "info";

export default function StoreEditor() {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<Section>("visibility");
  const [mobileMode, setMobileMode] = useState<"edit" | "preview">("preview");

  const [cfg, setCfg] = useState<StoreConfig>(DEFAULTS);
  const [social, setSocial] = useState<SocialLinks>({});
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#9c7c62");

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState("");
  const [bannerFile, setBannerFile] = useState<File | null>(null);
  const [bannerPreview, setBannerPreview] = useState("");
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  useEffect(() => { load(); }, []);

  const load = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { router.push("/login"); return; }
    const { data: sd } = await supabase.from("sellers").select("*").eq("id", user.id).single();
    if (!sd) { router.push("/dashboard"); return; }
    setSeller(sd);
    const c = sd.store_config || {} as any;
    setCfg({ show_banner_text: c.show_banner_text !== false, show_marquee: c.show_marquee !== false, show_collections: c.show_collections !== false, show_about: c.show_about !== false, show_trust_bar: c.show_trust_bar !== false, show_policies: c.show_policies !== false, show_newsletter: !!c.show_newsletter, announcement: c.announcement || "", marquee_texts: c.marquee_texts?.length ? c.marquee_texts : DEFAULTS.marquee_texts, trust_items: c.trust_items?.length ? c.trust_items : DEFAULTS.trust_items, policy_items: c.policy_items?.length ? c.policy_items : DEFAULTS.policy_items });
    setSocial(sd.social_links || {}); setTagline(sd.tagline || ""); setDescription(sd.description || "");
    setAnnouncement(c.announcement || ""); setPrimaryColor(sd.primary_color || "#9c7c62");
    setLogoPreview(sd.logo_url || ""); setBannerPreview(sd.banner_url || "");
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", sd.id).eq("status", "published").eq("in_stock", true).order("sort_order", { ascending: true });
    if (pd) setProducts(pd);
    setLoading(false);
  };

  const handleSave = async () => {
    if (!seller) return; setSaving(true); setSaved(false);
    let logoUrl = seller.logo_url || ""; let bannerUrl = seller.banner_url || "";
    if (logoFile) { const ext = logoFile.name.split(".").pop(); const path = seller.id + "/logo." + ext; await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); logoUrl = data.publicUrl + "?t=" + Date.now(); }
    if (bannerFile) { const ext = bannerFile.name.split(".").pop(); const path = seller.id + "/banner." + ext; await supabase.storage.from("store-assets").upload(path, bannerFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); bannerUrl = data.publicUrl + "?t=" + Date.now(); }
    const fullCfg = { ...cfg, announcement };
    await supabase.from("sellers").update({ tagline, description, primary_color: primaryColor, logo_url: logoUrl, banner_url: bannerUrl, social_links: social, store_config: fullCfg }).eq("id", seller.id);
    setSeller({ ...seller, tagline, description, primary_color: primaryColor, logo_url: logoUrl, banner_url: bannerUrl, social_links: social, store_config: fullCfg });
    setLogoFile(null); setBannerFile(null); setLogoPreview(logoUrl); setBannerPreview(bannerUrl);
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 3000);
  };

  const editSection = (s: Section) => { setActiveSection(s); setMobileMode("edit"); };

  const N = "#ff6b35"; const G = "linear-gradient(135deg,#ff6b35,#ff3d6e)";
  const accent = primaryColor;
  const collections = seller?.collections || [];
  const bannerSrc = bannerPreview || seller?.banner_url || "";
  const logoSrc = logoPreview || seller?.logo_url || "";

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button onClick={onChange} style={{ width: 44, height: 24, borderRadius: 100, border: "none", cursor: "pointer", position: "relative", background: value ? N : "rgba(255,255,255,0.08)", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: value ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );
  const Label = ({ children }: { children: string }) => <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,245,245,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{children}</label>;
  const Inp = ({ value, onChange, placeholder }: { value: string; onChange: (v: string) => void; placeholder?: string }) => <input type="text" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />;

  // Clickable preview section wrapper
  const Editable = ({ section, children, visible = true }: { section: Section; children: React.ReactNode; visible?: boolean }) => {
    if (!visible) return null;
    return (
      <div onClick={() => editSection(section)} style={{ position: "relative", cursor: "pointer", transition: "outline 0.2s" }} onMouseEnter={(e) => (e.currentTarget.style.outline = "2px solid " + N)} onMouseLeave={(e) => (e.currentTarget.style.outline = "none")}>
        <div style={{ position: "absolute", top: 8, right: 8, padding: "4px 12px", background: N, color: "#fff", borderRadius: 100, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", opacity: 0, transition: "opacity 0.2s", zIndex: 10, pointerEvents: "none" }} className="edit-badge">Edit</div>
        {children}
      </div>
    );
  };

  if (loading) return <div style={{ minHeight: "100vh", background: "#030303", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}><p style={{ color: "rgba(245,245,245,0.35)" }}>Loading editor...</p></div>;

  const controlsPanel = (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      {/* SECTION NAV */}
      <div style={{ padding: "10px 12px", display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.05)", overflowY: "auto", maxHeight: 280 }}>
        {([
          { id: "visibility" as Section, label: "Section Visibility" }, { id: "branding" as Section, label: "Branding & Images" },
          { id: "announcement" as Section, label: "Announcement Bar" }, { id: "marquee" as Section, label: "Ticker Messages" },
          { id: "trust" as Section, label: "Trust Bar" }, { id: "policies" as Section, label: "Shipping & Policies" },
          { id: "social" as Section, label: "Social Links" }, { id: "info" as Section, label: "Store Info" },
        ]).map((s) => (
          <button key={s.id} onClick={() => setActiveSection(s.id)} style={{ width: "100%", padding: "9px 14px", background: activeSection === s.id ? "rgba(255,107,53,0.06)" : "transparent", border: activeSection === s.id ? "1px solid rgba(255,107,53,0.1)" : "1px solid transparent", borderRadius: 8, color: activeSection === s.id ? "#f5f5f5" : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: activeSection === s.id ? 700 : 500, textAlign: "left", cursor: "pointer" }}>{s.label}</button>
        ))}
      </div>

      {/* CONTROLS */}
      <div style={{ flex: 1, overflow: "auto", padding: "16px" }}>
        {activeSection === "visibility" && (<div>
          {([ { key: "show_banner_text" as const, label: "Banner Text" }, { key: "show_marquee" as const, label: "Ticker" }, { key: "show_collections" as const, label: "Collections" }, { key: "show_about" as const, label: "Brand Story" }, { key: "show_trust_bar" as const, label: "Trust Bar" }, { key: "show_policies" as const, label: "Policies" } ]).map((item) => (
            <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
              <span style={{ fontSize: 13 }}>{item.label}</span>
              <Toggle value={cfg[item.key]} onChange={() => setCfg({ ...cfg, [item.key]: !cfg[item.key] })} />
            </div>
          ))}
        </div>)}

        {activeSection === "branding" && (<div>
          <div style={{ marginBottom: 20 }}><Label>Logo</Label>
            <div onClick={() => logoRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {logoSrc ? <img src={logoSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", fontWeight: 700 }}>Upload</span>}
            </div>
            <input ref={logoRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f || f.size > 5*1024*1024) return; setLogoFile(f); const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); }} style={{ display: "none" }} />
          </div>
          <div style={{ marginBottom: 20 }}><Label>Banner</Label>
            <div onClick={() => bannerRef.current?.click()} style={{ width: "100%", height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
              {bannerSrc ? <img src={bannerSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", fontWeight: 700 }}>Upload</span>}
            </div>
            <input ref={bannerRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f || f.size > 5*1024*1024) return; setBannerFile(f); const r = new FileReader(); r.onload = (ev) => setBannerPreview(ev.target?.result as string); r.readAsDataURL(f); }} style={{ display: "none" }} />
          </div>
          <Label>Brand Color</Label>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {["#9c7c62","#111","#00d4aa","#8b5cf6","#e74c3c","#2563eb","#d4a017","#ec4899"].map((c) => <button key={c} onClick={() => setPrimaryColor(c)} style={{ width: 30, height: 30, borderRadius: 8, background: c, border: primaryColor === c ? "3px solid #fff" : "3px solid transparent", cursor: "pointer" }} />)}
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: 30, height: 30, borderRadius: 8, border: "none", cursor: "pointer" }} />
          </div>
        </div>)}

        {activeSection === "announcement" && (<div><Label>Announcement Text</Label><Inp value={announcement} onChange={setAnnouncement} placeholder="e.g. Free delivery over R500" /></div>)}

        {activeSection === "marquee" && (<div>
          {cfg.marquee_texts.map((txt, i) => (<div key={i} style={{ display: "flex", gap: 6, marginBottom: 8 }}><Inp value={txt} onChange={(v) => { const u = [...cfg.marquee_texts]; u[i] = v; setCfg({ ...cfg, marquee_texts: u }); }} />{cfg.marquee_texts.length > 1 && <button onClick={() => setCfg({ ...cfg, marquee_texts: cfg.marquee_texts.filter((_,idx) => idx !== i) })} style={{ width: 32, borderRadius: 8, background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 14, cursor: "pointer", flexShrink: 0 }}>&times;</button>}</div>))}
          <button onClick={() => setCfg({ ...cfg, marquee_texts: [...cfg.marquee_texts, ""] })} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif" }}>+ Add</button>
        </div>)}

        {activeSection === "trust" && (<div>
          {cfg.trust_items.map((item, i) => (<div key={i} style={{ padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 8 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <input value={item.icon} onChange={(e) => { const u = [...cfg.trust_items]; u[i] = { ...u[i], icon: e.target.value }; setCfg({ ...cfg, trust_items: u }); }} style={{ width: 36, padding: 6, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#f5f5f5", fontSize: 16, outline: "none", textAlign: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }} />
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                <Inp value={item.title} onChange={(v) => { const u = [...cfg.trust_items]; u[i] = { ...u[i], title: v }; setCfg({ ...cfg, trust_items: u }); }} placeholder="Title" />
                <Inp value={item.desc} onChange={(v) => { const u = [...cfg.trust_items]; u[i] = { ...u[i], desc: v }; setCfg({ ...cfg, trust_items: u }); }} placeholder="Description" />
              </div>
              {cfg.trust_items.length > 1 && <button onClick={() => setCfg({ ...cfg, trust_items: cfg.trust_items.filter((_,idx) => idx !== i) })} style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 11, cursor: "pointer", alignSelf: "flex-start" }}>&times;</button>}
            </div>
          </div>))}
          {cfg.trust_items.length < 6 && <button onClick={() => setCfg({ ...cfg, trust_items: [...cfg.trust_items, { icon: "âœ¦", title: "", desc: "" }] })} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontSize: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif" }}>+ Add Item</button>}
        </div>)}

        {activeSection === "policies" && (<div>
          {cfg.policy_items.map((item, i) => (<div key={i} style={{ padding: 10, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 8 }}>
            <Inp value={item.title} onChange={(v) => { const u = [...cfg.policy_items]; u[i] = { ...u[i], title: v }; setCfg({ ...cfg, policy_items: u }); }} placeholder="e.g. Shipping" />
            <textarea value={item.desc} onChange={(e) => { const u = [...cfg.policy_items]; u[i] = { ...u[i], desc: e.target.value }; setCfg({ ...cfg, policy_items: u }); }} rows={2} placeholder="Details..." style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical", marginTop: 6 }} />
          </div>))}
        </div>)}

        {activeSection === "social" && (<div>
          {([ { key: "instagram" as const, label: "Instagram" }, { key: "tiktok" as const, label: "TikTok" }, { key: "facebook" as const, label: "Facebook" }, { key: "twitter" as const, label: "X / Twitter" } ]).map((item) => (
            <div key={item.key} style={{ marginBottom: 12 }}><Label>{item.label}</Label><Inp value={social[item.key] || ""} onChange={(v) => setSocial({ ...social, [item.key]: v })} placeholder={"https://" + item.key + ".com/..."} /></div>
          ))}
        </div>)}

        {activeSection === "info" && (<div>
          <div style={{ marginBottom: 16 }}><Label>Tagline</Label><Inp value={tagline} onChange={setTagline} placeholder="e.g. Premium streetwear" /></div>
          <Label>Description</Label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="About your brand..." style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" }} />
        </div>)}
      </div>
    </div>
  );

  const previewPanel = (
    <div style={{ background: "#f6f3ef", fontFamily: "'Jost', sans-serif", color: "#2a2a2e", minHeight: "100%" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700&display=swap');@keyframes mscroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}.edit-badge{opacity:0;transition:opacity 0.2s}div:hover>.edit-badge{opacity:1}`}</style>

      {/* ANNOUNCEMENT */}
      <Editable section="announcement" visible={!!announcement}>
        <div style={{ background: "#2a2a2e", color: "#f6f3ef", textAlign: "center", padding: "10px 20px", fontSize: 11, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase" }}>{announcement || "Your announcement here"}</div>
      </Editable>

      {/* HEADER */}
      <Editable section="branding">
        <div style={{ background: "rgba(246,243,239,0.92)", borderBottom: "1px solid rgba(0,0,0,0.06)", padding: "0 24px" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
            <div />
            {logoSrc ? <img src={logoSrc} alt="" style={{ height: 40, maxWidth: 140, objectFit: "contain" }} /> : <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" }}>{seller?.store_name}</span>}
            <span style={{ fontSize: 13, color: "#8a8690" }}>Bag</span>
          </div>
        </div>
      </Editable>

      {/* MARQUEE */}
      <Editable section="marquee" visible={cfg.show_marquee}>
        <div style={{ overflow: "hidden", whiteSpace: "nowrap", padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ display: "inline-flex", animation: "mscroll 30s linear infinite" }}>
            {[...Array(2)].map((_, r) => cfg.marquee_texts.map((txt, i) => (
              <span key={r + "-" + i} style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: "italic", color: "#8a8690", letterSpacing: "0.08em", padding: "0 40px" }}>{txt || "..."} <em style={{ fontStyle: "normal", color: accent }}>&bull;</em></span>
            )))}
          </div>
        </div>
      </Editable>

      {/* HERO */}
      <Editable section="branding">
        <div style={{ position: "relative", height: bannerSrc ? 400 : "auto", overflow: "hidden" }}>
          {bannerSrc ? (
            <>
              <img src={bannerSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.85)" }} />
              {cfg.show_banner_text && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, transparent 30%, rgba(42,42,46,0.4))", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 24px 48px", textAlign: "center" }}>
                  {tagline && <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: 12 }}>{tagline}</div>}
                  <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 48, fontWeight: 300, color: "#fff", letterSpacing: "0.04em", lineHeight: 1.1, marginBottom: 16 }}>{seller?.store_name}</h1>
                  <div style={{ padding: "14px 40px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100, color: "#fff", fontSize: 11, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase" }}>Shop the Collection</div>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "60px 24px 40px" }}>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 48, fontWeight: 300, letterSpacing: "0.04em", marginBottom: 8 }}>{seller?.store_name}</h1>
              {tagline && <p style={{ fontSize: 14, color: "#8a8690", letterSpacing: "0.1em", textTransform: "uppercase" }}>{tagline}</p>}
            </div>
          )}
        </div>
      </Editable>

      {/* COLLECTIONS */}
      <Editable section="visibility" visible={cfg.show_collections && collections.length > 0}>
        <div style={{ padding: "60px 24px", maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 8, textAlign: "center" }}>Curated For You</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, textAlign: "center", marginBottom: 32 }}>Shop by Collection</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(collections.length, 3) + ", 1fr)", gap: 12 }}>
            {collections.slice(0, 3).map((col, i) => {
              const img = products.find((p) => p.category === col && p.image_url);
              return <div key={col} style={{ position: "relative", aspectRatio: "3/4", borderRadius: 14, overflow: "hidden", background: "#d4c5b5" }}>
                {img?.image_url && <img src={img.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
                <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "24px 20px", background: "linear-gradient(transparent, rgba(42,42,46,0.5))" }}>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 20, color: "#fff" }}>{col}</div>
                  <div style={{ fontSize: 10, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{products.filter((p) => p.category === col).length} pieces</div>
                </div>
              </div>;
            })}
          </div>
        </div>
      </Editable>

      {/* PRODUCTS */}
      <div style={{ padding: "60px 24px", maxWidth: 1200, margin: "0 auto" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 8, textAlign: "center" }}>The Collection</div>
        <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, textAlign: "center", marginBottom: 32 }}>All Products</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {products.slice(0, 6).map((p) => (
            <div key={p.id}>
              <div style={{ aspectRatio: "3/4", borderRadius: 14, overflow: "hidden", background: "#e0d5ca", marginBottom: 10 }}>
                {p.image_url && <img src={p.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 15, marginBottom: 2 }}>{p.name}</div>
              <div style={{ fontSize: 13, color: accent, fontWeight: 500 }}>R{p.price}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ABOUT */}
      <Editable section="info" visible={cfg.show_about && !!description}>
        <div style={{ padding: "60px 24px", maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
          <div style={{ aspectRatio: "4/5", borderRadius: 14, overflow: "hidden", background: "#d4c5b5" }}>
            {bannerSrc && <img src={bannerSrc} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
          </div>
          <div>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 8 }}>Our Story</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, marginBottom: 16, lineHeight: 1.2 }}>About {seller?.store_name}</h2>
            <p style={{ fontSize: 14, lineHeight: 1.8, color: "#8a8690", fontWeight: 300 }}>{description}</p>
          </div>
        </div>
      </Editable>

      {/* TRUST BAR */}
      <Editable section="trust" visible={cfg.show_trust_bar}>
        <div style={{ padding: "48px 24px", maxWidth: 1200, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(" + cfg.trust_items.length + ", 1fr)", gap: 16, borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          {cfg.trust_items.map((item, i) => (
            <div key={i} style={{ textAlign: "center", padding: 16 }}>
              <div style={{ fontSize: 22, marginBottom: 8, color: accent }}>{item.icon}</div>
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{item.title}</div>
              <div style={{ fontSize: 11, color: "#b5b1ac" }}>{item.desc}</div>
            </div>
          ))}
        </div>
      </Editable>

      {/* POLICIES */}
      <Editable section="policies" visible={cfg.show_policies}>
        <div style={{ padding: "60px 24px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, marginBottom: 32 }}>Shipping & Policies</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(" + cfg.policy_items.length + ", 1fr)", gap: 24, textAlign: "left" }}>
            {cfg.policy_items.map((p, i) => (
              <div key={i}><h4 style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8, color: accent }}>{p.title}</h4><p style={{ fontSize: 12, lineHeight: 1.7, color: "#8a8690" }}>{p.desc}</p></div>
            ))}
          </div>
        </div>
      </Editable>

      {/* FOOTER */}
      <Editable section="social">
        <div style={{ background: "#2a2a2e", color: "#f6f3ef", padding: "40px 24px 24px", textAlign: "center" }}>
          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 8 }}>{seller?.store_name}</div>
          <p style={{ fontSize: 11, color: "rgba(246,243,239,0.3)" }}>Powered by CatalogStore</p>
        </div>
      </Editable>
    </div>
  );

  return (
    <>
      <style>{`@media(max-width:900px){.editor-sidebar{display:none!important}.editor-preview{display:block!important}.mobile-bar{display:flex!important}}.editor-sidebar{display:flex}.editor-preview{display:block}.mobile-bar{display:none}`}</style>
      <div style={{ height: "100vh", background: "#030303", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5", display: "flex", flexDirection: "column" }}>

        {/* TOP BAR */}
        <div style={{ padding: "10px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "#080808", flexShrink: 0 }}>
          <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "rgba(245,245,245,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif" }}>&larr; Back</button>
          <div style={{ fontSize: 13, fontWeight: 800 }}>Store Editor</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {saved && <span style={{ fontSize: 10, color: "#00d4aa", fontWeight: 700 }}>SAVED</span>}
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 10, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, letterSpacing: "0.06em", textTransform: "uppercase" }}>{saving ? "..." : "Save"}</button>
          </div>
        </div>

        {/* MOBILE TAB BAR */}
        <div className="mobile-bar" style={{ display: "none", borderBottom: "1px solid rgba(255,255,255,0.05)", background: "#080808" }}>
          {(["preview", "edit"] as const).map((m) => (
            <button key={m} onClick={() => setMobileMode(m)} style={{ flex: 1, padding: "10px", background: mobileMode === m ? "rgba(255,107,53,0.06)" : "transparent", border: "none", borderBottom: mobileMode === m ? "2px solid " + N : "2px solid transparent", color: mobileMode === m ? "#f5f5f5" : "rgba(245,245,245,0.3)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 700, cursor: "pointer", textTransform: "uppercase", letterSpacing: "0.06em" }}>{m}</button>
          ))}
        </div>

        {/* MAIN */}
        <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
          {/* SIDEBAR - desktop */}
          <div className="editor-sidebar" style={{ width: 340, minWidth: 340, flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.05)", background: "#080808", overflow: "hidden" }}>
            {controlsPanel}
          </div>

          {/* MOBILE - conditionally show edit or preview */}
          {mobileMode === "edit" && (
            <div className="mobile-bar" style={{ display: "none", flex: 1, flexDirection: "column", background: "#080808", overflow: "auto" }}>
              <style>{`.mobile-bar + .mobile-bar{display:flex!important}@media(max-width:900px){.mobile-edit-panel{display:flex!important}}`}</style>
              <div className="mobile-edit-panel" style={{ display: "none", flex: 1, flexDirection: "column", overflow: "auto" }}>
                {controlsPanel}
              </div>
            </div>
          )}

          {/* PREVIEW */}
          <div className="editor-preview" style={{ flex: 1, overflow: "auto", background: "#f6f3ef" }}>
            {/* Mobile: hide preview when in edit mode */}
            <style>{`@media(max-width:900px){.editor-preview{display:${mobileMode === "preview" ? "block" : "none"}!important}.mobile-edit-show{display:${mobileMode === "edit" ? "flex" : "none"}!important}}`}</style>
            {previewPanel}
          </div>

          {/* Mobile edit panel */}
          <div className="mobile-edit-show" style={{ display: "none", position: "fixed", top: 90, left: 0, right: 0, bottom: 0, background: "#080808", overflow: "auto", zIndex: 50 }}>
            {controlsPanel}
          </div>
        </div>
      </div>
    </>
  );
}
