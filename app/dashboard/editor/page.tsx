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

const DEFAULTS: StoreConfig = { show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "", marquee_texts: ["Premium Collection", "Free Delivery Over R500", "Designed in South Africa"], trust_items: [{ icon: "â˜…", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "âœˆ", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "â†º", title: "Easy Returns", desc: "14-day policy" }, { icon: "âš¡", title: "Secure Payment", desc: "Card & WhatsApp" }], policy_items: [{ title: "Shipping", desc: "Standard delivery 3-5 business days." }, { title: "Returns", desc: "14-day return policy on unworn items." }, { title: "Payment", desc: "Cards via Yoco + WhatsApp checkout." }] };

export default function StoreEditor() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeSection, setActiveSection] = useState("visibility");

  const [cfg, setCfg] = useState<StoreConfig>(DEFAULTS);
  const [social, setSocial] = useState<SocialLinks>({});
  const [tagline, setTagline] = useState("");
  const [description, setDescription] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#9c7c62");
  const [previewKey, setPreviewKey] = useState(0);

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
    setCfg({
      show_banner_text: c.show_banner_text !== false, show_marquee: c.show_marquee !== false,
      show_collections: c.show_collections !== false, show_about: c.show_about !== false,
      show_trust_bar: c.show_trust_bar !== false, show_policies: c.show_policies !== false,
      show_newsletter: !!c.show_newsletter, announcement: c.announcement || "",
      marquee_texts: c.marquee_texts?.length ? c.marquee_texts : DEFAULTS.marquee_texts,
      trust_items: c.trust_items?.length ? c.trust_items : DEFAULTS.trust_items,
      policy_items: c.policy_items?.length ? c.policy_items : DEFAULTS.policy_items,
    });
    setSocial(sd.social_links || {});
    setTagline(sd.tagline || "");
    setDescription(sd.description || "");
    setAnnouncement(c.announcement || "");
    setPrimaryColor(sd.primary_color || "#9c7c62");
    setLogoPreview(sd.logo_url || "");
    setBannerPreview(sd.banner_url || "");
    setLoading(false);
  };

  const handleSave = async () => {
    if (!seller) return;
    setSaving(true); setSaved(false);
    let logoUrl = seller.logo_url || ""; let bannerUrl = seller.banner_url || "";
    if (logoFile) { const ext = logoFile.name.split(".").pop(); const path = seller.id + "/logo." + ext; await supabase.storage.from("store-assets").upload(path, logoFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); logoUrl = data.publicUrl + "?t=" + Date.now(); }
    if (bannerFile) { const ext = bannerFile.name.split(".").pop(); const path = seller.id + "/banner." + ext; await supabase.storage.from("store-assets").upload(path, bannerFile, { upsert: true }); const { data } = supabase.storage.from("store-assets").getPublicUrl(path); bannerUrl = data.publicUrl + "?t=" + Date.now(); }
    const fullCfg = { ...cfg, announcement };
    await supabase.from("sellers").update({ tagline, description, primary_color: primaryColor, logo_url: logoUrl, banner_url: bannerUrl, social_links: social, store_config: fullCfg }).eq("id", seller.id);
    setSeller({ ...seller, tagline, description, primary_color: primaryColor, logo_url: logoUrl, banner_url: bannerUrl, social_links: social, store_config: fullCfg });
    setLogoFile(null); setBannerFile(null);
    setSaving(false); setSaved(true);
    setPreviewKey((k) => k + 1);
    setTimeout(() => setSaved(false), 3000);
  };

  const N = "#ff6b35";
  const G = "linear-gradient(135deg, #ff6b35, #ff3d6e)";

  const Toggle = ({ value, onChange }: { value: boolean; onChange: () => void }) => (
    <button onClick={onChange} style={{ width: 44, height: 24, borderRadius: 100, border: "none", cursor: "pointer", position: "relative", background: value ? N : "rgba(255,255,255,0.08)", transition: "background 0.2s", flexShrink: 0 }}>
      <div style={{ width: 18, height: 18, borderRadius: "50%", background: "#fff", position: "absolute", top: 3, left: value ? 23 : 3, transition: "left 0.2s", boxShadow: "0 1px 3px rgba(0,0,0,0.2)" }} />
    </button>
  );

  const SectionBtn = ({ id, label }: { id: string; label: string }) => (
    <button onClick={() => setActiveSection(id)} style={{ width: "100%", padding: "10px 14px", background: activeSection === id ? "rgba(255,107,53,0.06)" : "transparent", border: activeSection === id ? "1px solid rgba(255,107,53,0.1)" : "1px solid transparent", borderRadius: 8, color: activeSection === id ? "#f5f5f5" : "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: activeSection === id ? 700 : 500, textAlign: "left", cursor: "pointer", letterSpacing: "0.02em" }}>{label}</button>
  );

  const Label = ({ children }: { children: string }) => <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,245,245,0.3)", letterSpacing: "0.1em", textTransform: "uppercase", display: "block", marginBottom: 6 }}>{children}</label>;
  const Input = ({ value, onChange, placeholder, type }: { value: string; onChange: (v: string) => void; placeholder?: string; type?: string }) => <input type={type || "text"} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />;

  if (loading) return <div style={{ minHeight: "100vh", background: "#030303", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Schibsted Grotesk', sans-serif" }}><p style={{ color: "rgba(245,245,245,0.35)" }}>Loading editor...</p></div>;

  return (
    <div style={{ height: "100vh", background: "#030303", fontFamily: "'Schibsted Grotesk', sans-serif", color: "#f5f5f5", display: "flex" }}>

      {/* SIDEBAR */}
      <div style={{ width: 360, minWidth: 360, height: "100vh", display: "flex", flexDirection: "column", borderRight: "1px solid rgba(255,255,255,0.05)", background: "#080808" }}>

        {/* TOP BAR */}
        <div style={{ padding: "14px 16px", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <button onClick={() => router.push("/dashboard")} style={{ background: "none", border: "none", color: "rgba(245,245,245,0.4)", fontSize: 12, cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>&larr; Dashboard</button>
          <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: "-0.02em" }}>Store Editor</div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {saved && <span style={{ fontSize: 10, color: "#00d4aa", fontWeight: 700 }}>SAVED</span>}
            <button onClick={handleSave} disabled={saving} style={{ padding: "8px 20px", background: G, color: "#fff", border: "none", borderRadius: 100, fontSize: 10, fontWeight: 800, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.6 : 1, letterSpacing: "0.06em", textTransform: "uppercase" }}>{saving ? "..." : "Save"}</button>
          </div>
        </div>

        {/* SECTION NAV */}
        <div style={{ padding: "12px 12px 8px", display: "flex", flexDirection: "column", gap: 2, borderBottom: "1px solid rgba(255,255,255,0.05)" }}>
          <SectionBtn id="visibility" label="Section Visibility" />
          <SectionBtn id="branding" label="Branding & Images" />
          <SectionBtn id="announcement" label="Announcement Bar" />
          <SectionBtn id="marquee" label="Ticker Messages" />
          <SectionBtn id="trust" label="Trust Bar" />
          <SectionBtn id="policies" label="Shipping & Policies" />
          <SectionBtn id="social" label="Social Links" />
          <SectionBtn id="info" label="Store Info" />
        </div>

        {/* CONTROLS PANEL */}
        <div style={{ flex: 1, overflow: "auto", padding: "16px 16px" }}>

          {activeSection === "visibility" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>Toggle Sections</h3>
              {([
                { key: "show_banner_text" as const, label: "Banner Text Overlay" },
                { key: "show_marquee" as const, label: "Ticker / Marquee" },
                { key: "show_collections" as const, label: "Collections" },
                { key: "show_about" as const, label: "Brand Story" },
                { key: "show_trust_bar" as const, label: "Trust Bar" },
                { key: "show_policies" as const, label: "Shipping & Policies" },
              ]).map((item) => (
                <div key={item.key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.03)" }}>
                  <span style={{ fontSize: 13 }}>{item.label}</span>
                  <Toggle value={cfg[item.key]} onChange={() => setCfg({ ...cfg, [item.key]: !cfg[item.key] })} />
                </div>
              ))}
            </div>
          )}

          {activeSection === "branding" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 16, textTransform: "uppercase", letterSpacing: "0.06em" }}>Branding</h3>
              <div style={{ marginBottom: 20 }}>
                <Label>Logo</Label>
                <div onClick={() => logoRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {logoPreview ? <img src={logoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "contain" }} /> : <span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase", fontWeight: 700 }}>Upload</span>}
                </div>
                <input ref={logoRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; } setLogoFile(f); const r = new FileReader(); r.onload = (ev) => setLogoPreview(ev.target?.result as string); r.readAsDataURL(f); }} style={{ display: "none" }} />
              </div>
              <div style={{ marginBottom: 20 }}>
                <Label>Banner Image</Label>
                <div onClick={() => bannerRef.current?.click()} style={{ width: "100%", height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
                  {bannerPreview ? <img src={bannerPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase", fontWeight: 700 }}>Upload</span>}
                </div>
                <input ref={bannerRef} type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; if (f.size > 5 * 1024 * 1024) { alert("Max 5MB"); return; } setBannerFile(f); const r = new FileReader(); r.onload = (ev) => setBannerPreview(ev.target?.result as string); r.readAsDataURL(f); }} style={{ display: "none" }} />
              </div>
              <Label>Brand Color</Label>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
                {["#9c7c62", "#111111", "#00d4aa", "#8b5cf6", "#e74c3c", "#2563eb", "#d4a017", "#ec4899"].map((c) => (
                  <button key={c} onClick={() => setPrimaryColor(c)} style={{ width: 32, height: 32, borderRadius: 8, background: c, border: primaryColor === c ? "3px solid #fff" : "3px solid transparent", cursor: "pointer" }} />
                ))}
                <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} style={{ width: 32, height: 32, borderRadius: 8, border: "none", cursor: "pointer" }} />
              </div>
            </div>
          )}

          {activeSection === "announcement" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Announcement Bar</h3>
              <p style={{ fontSize: 11, color: "rgba(245,245,245,0.2)", marginBottom: 12 }}>Shows at the top of your store. Leave empty to hide.</p>
              <Input value={announcement} onChange={setAnnouncement} placeholder="e.g. Free delivery on orders over R500" />
            </div>
          )}

          {activeSection === "marquee" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Ticker Messages</h3>
              <p style={{ fontSize: 11, color: "rgba(245,245,245,0.2)", marginBottom: 12 }}>Scrolling text below the header.</p>
              {cfg.marquee_texts.map((txt, i) => (
                <div key={i} style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <Input value={txt} onChange={(v) => { const u = [...cfg.marquee_texts]; u[i] = v; setCfg({ ...cfg, marquee_texts: u }); }} />
                  {cfg.marquee_texts.length > 1 && <button onClick={() => setCfg({ ...cfg, marquee_texts: cfg.marquee_texts.filter((_, idx) => idx !== i) })} style={{ width: 32, height: 32, borderRadius: 8, background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 14, cursor: "pointer", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>&times;</button>}
                </div>
              ))}
              <button onClick={() => setCfg({ ...cfg, marquee_texts: [...cfg.marquee_texts, ""] })} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>+ Add</button>
            </div>
          )}

          {activeSection === "trust" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Trust Bar Items</h3>
              <p style={{ fontSize: 11, color: "rgba(245,245,245,0.2)", marginBottom: 12 }}>Quality, shipping, returns icons.</p>
              {cfg.trust_items.map((item, i) => (
                <div key={i} style={{ padding: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ display: "flex", gap: 8, marginBottom: 6 }}>
                    <input value={item.icon} onChange={(e) => { const u = [...cfg.trust_items]; u[i] = { ...u[i], icon: e.target.value }; setCfg({ ...cfg, trust_items: u }); }} style={{ width: 36, padding: "6px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 6, color: "#f5f5f5", fontSize: 16, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", textAlign: "center" }} />
                    <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4 }}>
                      <Input value={item.title} onChange={(v) => { const u = [...cfg.trust_items]; u[i] = { ...u[i], title: v }; setCfg({ ...cfg, trust_items: u }); }} placeholder="Title" />
                      <Input value={item.desc} onChange={(v) => { const u = [...cfg.trust_items]; u[i] = { ...u[i], desc: v }; setCfg({ ...cfg, trust_items: u }); }} placeholder="Description" />
                    </div>
                    {cfg.trust_items.length > 1 && <button onClick={() => setCfg({ ...cfg, trust_items: cfg.trust_items.filter((_, idx) => idx !== i) })} style={{ width: 24, height: 24, borderRadius: 6, background: "rgba(255,61,110,0.06)", border: "none", color: "#ff3d6e", fontSize: 11, cursor: "pointer", alignSelf: "flex-start" }}>&times;</button>}
                  </div>
                </div>
              ))}
              {cfg.trust_items.length < 6 && <button onClick={() => setCfg({ ...cfg, trust_items: [...cfg.trust_items, { icon: "âœ¦", title: "", desc: "" }] })} style={{ padding: "6px 14px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 100, color: "rgba(245,245,245,0.35)", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 10, fontWeight: 700, cursor: "pointer", textTransform: "uppercase" }}>+ Add Item</button>}
            </div>
          )}

          {activeSection === "policies" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Shipping & Policies</h3>
              {cfg.policy_items.map((item, i) => (
                <div key={i} style={{ padding: "10px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 10, marginBottom: 8 }}>
                  <Input value={item.title} onChange={(v) => { const u = [...cfg.policy_items]; u[i] = { ...u[i], title: v }; setCfg({ ...cfg, policy_items: u }); }} placeholder="e.g. Shipping" />
                  <textarea value={item.desc} onChange={(e) => { const u = [...cfg.policy_items]; u[i] = { ...u[i], desc: e.target.value }; setCfg({ ...cfg, policy_items: u }); }} rows={3} placeholder="Policy details..." style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical", marginTop: 6 }} />
                </div>
              ))}
            </div>
          )}

          {activeSection === "social" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Social Links</h3>
              <p style={{ fontSize: 11, color: "rgba(245,245,245,0.2)", marginBottom: 12 }}>Leave empty to hide from footer.</p>
              {([
                { key: "instagram" as const, label: "Instagram" },
                { key: "tiktok" as const, label: "TikTok" },
                { key: "facebook" as const, label: "Facebook" },
                { key: "twitter" as const, label: "X / Twitter" },
              ]).map((item) => (
                <div key={item.key} style={{ marginBottom: 12 }}>
                  <Label>{item.label}</Label>
                  <Input value={social[item.key] || ""} onChange={(v) => setSocial({ ...social, [item.key]: v })} placeholder={"https://" + item.key + ".com/..."} />
                </div>
              ))}
            </div>
          )}

          {activeSection === "info" && (
            <div>
              <h3 style={{ fontSize: 12, fontWeight: 800, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.06em" }}>Store Info</h3>
              <div style={{ marginBottom: 16 }}>
                <Label>Tagline</Label>
                <Input value={tagline} onChange={setTagline} placeholder="e.g. Premium streetwear for the culture" />
              </div>
              <div>
                <Label>Description</Label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} placeholder="Tell your customers about your brand..." style={{ width: "100%", padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", resize: "vertical" }} />
              </div>
            </div>
          )}

        </div>
      </div>

      {/* PREVIEW */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", background: "#111" }}>
        <div style={{ padding: "8px 16px", background: "rgba(255,255,255,0.02)", borderBottom: "1px solid rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", letterSpacing: "0.04em" }}>
            {seller?.subdomain}.catalogstore.co.za
          </span>
          <a href={"/store/" + seller?.subdomain} target="_blank" style={{ fontSize: 10, color: N, textDecoration: "none", fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase" }}>Open in new tab &rarr;</a>
        </div>
        <div style={{ flex: 1, position: "relative" }}>
          {seller?.subdomain && (
            <iframe
              ref={iframeRef}
              key={previewKey}
              src={"/store/" + seller.subdomain}
              style={{ width: "100%", height: "100%", border: "none", background: "#f6f3ef" }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
