"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "../../../lib/supabase";
import { useRouter } from "next/navigation";

/* ─── TYPES ─── */
interface Seller {
  id: string; store_name: string; subdomain: string; template: string;
  tagline: string; description: string; logo_url: string; banner_url: string;
  whatsapp_number: string; primary_color: string;
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
  };
}

type ActiveSection =
  | "announcement" | "hero" | "circle" | "products" | "collections"
  | "promise" | "about" | "testimonials" | "cta" | "trust" | "footer"
  | null;

const SECTION_LABELS: Record<string, string> = {
  announcement: "📢 Announcement Bar",
  hero:         "🏠 Hero Section",
  circle:       "⭕ Browse by Category",
  products:     "🛍 Products",
  collections:  "📂 Collections",
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
  const [logoFile, setLogoFile]         = useState<File | null>(null);
  const [logoPreview, setLogoPreview]   = useState("");

  /* ─── LOAD ─── */
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: s } = await supabase.from("sellers").select("*").eq("email", user.email).single();
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
      setLogoPreview(s.logo_url || "");
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
  useEffect(() => { if (logoPreview) postUpdate({ logoUrl: logoPreview }); }, [logoPreview]);

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
      },
    }).eq("id", seller.id);
    setSaved(true);
    setSaving(false);
    setTimeout(() => setSaved(false), 3000);
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

            {/* HERO */}
            {activeSection === "hero" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                <div>
                  <label style={labelStyle}>Hero Image</label>
                  <div onClick={() => logoRef.current?.click()}
                    style={{ width: "100%", height: 100, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.03)", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden", position: "relative" }}>
                    {logoPreview
                      ? <img src={logoPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      : <div style={{ textAlign: "center" }}><div style={{ fontSize: 24, opacity: 0.3 }}>🖼</div><div style={{ fontSize: 10, color: "rgba(245,245,245,0.25)", marginTop: 4 }}>Click to upload hero image</div></div>
                    }
                  </div>
                  <input ref={logoRef} type="file" accept="image/*" onChange={handleLogo} style={{ display: "none" }} />
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
              </div>
            )}

            {/* PRODUCTS */}
            {activeSection === "products" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Add or edit products</div>
                  <div style={{ fontSize: 12, color: "rgba(245,245,245,0.3)", lineHeight: 1.6, marginBottom: 12 }}>Products are managed from your main dashboard. Click below to go there.</div>
                  <button onClick={() => router.push("/dashboard")}
                    style={{ padding: "9px 18px", background: G, color: "#fff", border: "none", borderRadius: 8, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                    Go to Products →
                  </button>
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
                      <div key={col} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8 }}>
                        <span style={{ color: "rgba(245,245,245,0.3)", fontSize: 14, cursor: "grab" }}>⠿</span>
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
                      {["◆","★","✦","♦","⚡","✈","↩","🔒","📦","💳","🚚","⭐","✓","♻","🛡","💎","🤝","⏱"].map(ico => (
                        <button key={ico} onClick={() => { const u = [...trustItems]; u[i] = { ...u[i], icon: ico }; setTrustItems(u); }}
                          style={{ width: 32, height: 32, borderRadius: 6, border: item.icon === ico ? "2px solid #c4a265" : "1px solid rgba(255,255,255,0.1)", background: item.icon === ico ? "rgba(196,162,101,0.12)" : "rgba(255,255,255,0.04)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {ico}
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
              </div>
            )}

            {/* PROMISE */}
            {activeSection === "promise" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 4 }}>Our Promise Section</div>
                  <div style={{ fontSize: 12, color: "rgba(245,245,245,0.3)", lineHeight: 1.6 }}>This section shows your brand values — 100% Human Hair, Ethically Sourced, etc. It's fixed for now but will be editable in the next update.</div>
                </div>
              </div>
            )}

            {/* FOOTER */}
            {activeSection === "footer" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                <div>
                  <label style={labelStyle}>Store Tagline (Footer)</label>
                  <input value={tagline} onChange={e => setTagline(e.target.value)}
                    placeholder="e.g. Premium hair delivered across SA"
                    style={inputStyle} />
                </div>
                <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)" }}>Social links are edited in the dashboard My Store settings.</div>
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
