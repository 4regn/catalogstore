"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams, useSearchParams } from "next/navigation";

interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string; template: string;
  primary_color: string; logo_url: string; banner_url: string; tagline: string; description: string;
  collections: string[];
  social_links: { whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string };
  store_config: { show_banner_text: boolean; show_marquee: boolean; show_collections: boolean; show_about: boolean; show_trust_bar: boolean; show_policies: boolean; show_newsletter: boolean; announcement: string; marquee_texts?: string[]; trust_items?: { icon: string; title: string; desc: string }[]; policy_items?: { title: string; desc: string }[] };
  checkout_config?: { whatsapp_checkout_enabled?: boolean };
  subscription_status?: string; trial_ends_at?: string;
}

interface Variant { name: string; options: string[]; images?: { [option: string]: string }; }
interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean; description: string;
  sort_order: number; created_at: string;
}

interface CartItem { product: Product; qty: number; selectedVariants: { [key: string]: string }; }

export default function StorePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const slug = params.slug as string;
  const isEditMode = searchParams.get("editMode") === "true";

  /* Live edit overrides from postMessage */
  const [liveTagline, setLiveTagline]           = useState<string | null>(null);
  const [liveDescription, setLiveDescription]   = useState<string | null>(null);
  const [liveAnnouncement, setLiveAnnouncement] = useState<string | null>(null);
  const [liveTrustItems, setLiveTrustItems]     = useState<{ icon: string; title: string; desc: string }[] | null>(null);
  const [liveLogoUrl, setLiveLogoUrl]           = useState<string | null>(null);
  const [hoveredSection, setHoveredSection]     = useState<string | null>(null);

  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [productSort, setProductSort] = useState("default");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [countdown, setCountdown] = useState(5);
  const [promoCountdown, setPromoCountdown] = useState<{ code: string; type: string; value: number; applies_to: string; expires_at: string; timeLeft: string } | null>(null);
  const [promoDiscounts, setPromoDiscounts] = useState<{ code: string; type: string; value: number; applies_to: string; expires_at: string; product_ids: string[]; collection_names: string[]; timeLeft: string }[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const p = new URLSearchParams(window.location.search);
      setOrderStatus(p.get("order"));
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
      if (e.data.logoUrl      !== undefined) setLiveLogoUrl(e.data.logoUrl);
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [isEditMode]);

  const loadStore = async () => {
    const { data: sd } = await supabase.from("sellers").select("id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, subscription_status, trial_ends_at").eq("subdomain", slug).single();
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

  const cfg = seller?.store_config || { show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "" };
  const social = seller?.social_links || {};
  const accent = seller?.primary_color || "#9c7c62";
  const collections = seller?.collections || [];
  const marqueeTexts = cfg.marquee_texts?.length ? cfg.marquee_texts : [seller?.tagline || "Premium Collection", "Free Delivery Over R500", "Designed in South Africa"];
  const trustItems = cfg.trust_items?.length ? cfg.trust_items : [{ icon: "\u2605", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "\u2708", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "\u21BA", title: "Easy Returns", desc: "14-day policy" }, { icon: "\u26A1", title: "Secure Payment", desc: "Card & WhatsApp" }];
  const policyItems = cfg.policy_items?.length ? cfg.policy_items : [{ title: "Shipping", desc: "Standard delivery 3-5 business days nationwide. Free shipping on qualifying orders." }, { title: "Returns", desc: "Return unworn items within 14 days for a full refund. Items must be in original condition." }, { title: "Payment", desc: "All major cards accepted via Yoco. Also checkout through WhatsApp for a personal experience." }];
  const cats = ["All", ...collections.filter((c) => products.some((p) => p.category === c))];
  const filtered = (() => {
    let list = activeCategory === "All" ? [...products] : products.filter((p) => p.category === activeCategory);
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

  const openProduct = (p: Product) => { setSelectedProduct(p); setActiveImageIndex(0); const d: { [k: string]: string } = {}; (p.variants || []).forEach((v) => { if (v.options.length > 0) d[v.name] = v.options[0]; }); setSelectedVariants(d); };
  const closeProduct = () => { setSelectedProduct(null); setSelectedVariants({}); };

  const addToCart = (p: Product) => {
    const key = JSON.stringify(selectedVariants);
    const idx = cart.findIndex((i) => i.product.id === p.id && JSON.stringify(i.selectedVariants) === key);
    if (idx >= 0) { const u = [...cart]; u[idx].qty += 1; setCart(u); }
    else setCart([...cart, { product: p, qty: 1, selectedVariants: { ...selectedVariants } }]);
    closeProduct(); setShowCart(true);
  };

  const removeFromCart = (i: number) => setCart(cart.filter((_, idx) => idx !== i));
  const updateQty = (i: number, d: number) => { const u = [...cart]; u[i].qty += d; if (u[i].qty < 1) u[i].qty = 1; setCart(u); };
  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);

  const checkoutWhatsApp = () => {
    if (!seller?.whatsapp_number) return;
    let msg = "Hi! I'd like to order:\n\n";
    cart.forEach((i) => { msg += "- " + i.product.name; const v = Object.entries(i.selectedVariants); if (v.length > 0) msg += " (" + v.map(([k, val]) => k + ": " + val).join(", ") + ")"; msg += " x" + i.qty + " - R" + (i.product.price * i.qty) + "\n"; });
    msg += "\nTotal: R" + cartTotal;
    let phone = seller.whatsapp_number.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "27" + phone.substring(1);
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
  };

  const waLink = seller?.whatsapp_number ? "https://wa.me/" + (seller.whatsapp_number.startsWith("0") ? "27" + seller.whatsapp_number.substring(1) : seller.whatsapp_number).replace(/\D/g, "") : "#";

  /* Live overrides */
  const displayTagline      = liveTagline      ?? seller?.tagline      ?? "";
  const displayDescription  = liveDescription  ?? seller?.description  ?? "";
  const displayAnnouncement = liveAnnouncement ?? cfg.announcement     ?? "";
  const displayTrustItems   = liveTrustItems   ?? trustItems;
  const displayLogoUrl      = liveLogoUrl      ?? seller?.logo_url     ?? "";
  const accentColor         = "#9c7c62";

  /* Edit mode section wrapper */
  const EditSection = ({ id, children, style }: { id: string; children: React.ReactNode; style?: React.CSSProperties }) => {
    if (!isEditMode) return <div style={style}>{children}</div>;
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

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Jost', sans-serif", background: "#f6f3ef" }}><p style={{ color: "#8a8690", fontSize: 15 }}>Loading store...</p></div>;
  if (notFound) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Jost', sans-serif", background: "#f6f3ef" }}><h1 style={{ fontSize: 48, fontWeight: 300, color: "#2a2a2e", marginBottom: 8 }}>404</h1><p style={{ color: "#8a8690" }}>This store does not exist.</p></div>;

  const storeInactive = seller && seller.subscription_status !== "active" && !(seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (storeInactive && !orderStatus) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Jost', sans-serif", background: "#f6f3ef", padding: "40px 24px", textAlign: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@300;400;500&family=Jost:wght@300;400;500;600;700&display=swap');`}</style>
      {displayLogoUrl ? <img src={displayLogoUrl} alt="" style={{ height: 48, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 32 }}>{seller?.store_name}</h2>}
      <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 400, color: "#2a2a2e", marginBottom: 12 }}>Store Temporarily Unavailable</h1>
      <p style={{ fontSize: 15, color: "#8a8690", maxWidth: 400, lineHeight: 1.6 }}>This store is currently inactive. Please check back soon or contact the seller directly.</p>
    </div>
  );

  if (orderStatus === "success" || orderStatus === "cancelled") return (
    <div style={{ minHeight: "100vh", background: "#f6f3ef", fontFamily: "'Jost', sans-serif", color: "#2a2a2e", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
        {displayLogoUrl ? <img src={displayLogoUrl} alt="" style={{ height: 44, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 32 }}>{seller?.store_name}</h2>}
        {orderStatus === "success" ? (<>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 400, marginBottom: 12 }}>Payment Successful!</h1>
          <p style={{ fontSize: 16, color: "#8a8690", lineHeight: 1.6, marginBottom: 8 }}>Thank you for your order. Your payment has been processed successfully.</p>
          <p style={{ fontSize: 14, color: "#b5b1ac", marginBottom: 40 }}>You will receive a confirmation shortly.</p>
        </>) : (<>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#ff3d6e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 36, fontWeight: 400, marginBottom: 12 }}>Payment Cancelled</h1>
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
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700&display=swap');
        @keyframes mscroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @media(max-width:768px){.sl-cols-g{grid-template-columns:1fr!important}.sl-pgrid{grid-template-columns:repeat(2,1fr)!important}.sl-story{grid-template-columns:1fr!important}.sl-trust{grid-template-columns:repeat(2,1fr)!important}.sl-polg{grid-template-columns:1fr!important}.sl-fttop{grid-template-columns:1fr!important}.sl-hero{height:70vh!important;min-height:400px!important}.sl-hnav{display:none!important}.sl-modal{flex-direction:column!important}.sl-header-grid{display:flex!important;justify-content:space-between!important}.sl-logo-img{height:36px!important;max-width:120px!important}}
      `}</style>
      <div style={{ minHeight: "100vh", background: "#f6f3ef", fontFamily: "'Jost', sans-serif", color: "#2a2a2e" }}>

        {/* ANNOUNCEMENT */}
        {displayAnnouncement && (
          <EditSection id="announcement">
            <div style={{ background: "#2a2a2e", color: "#f6f3ef", textAlign: "center", padding: "10px 20px", fontSize: 11, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase" }}>{displayAnnouncement}</div>
          </EditSection>
        )}

        {/* HEADER */}
        <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(246,243,239,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div className="sl-header-grid" style={{ maxWidth: 1340, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 72 }}>
            <div className="sl-hnav" style={{ display: "flex", gap: 32 }}>
              <span style={{ color: "#8a8690", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Shop All</span>
              {cats.length > 2 && <span style={{ color: "#8a8690", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Collections</span>}
            </div>
            <div style={{ textAlign: "center" }}>
              {displayLogoUrl ? (
                <img className="sl-logo-img" src={displayLogoUrl} alt={seller?.store_name} style={{ height: 44, maxWidth: 160, objectFit: "contain" }} />
              ) : (
                <div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" }}>{seller?.store_name}</div>
                  {displayTagline && <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#b5b1ac", textTransform: "uppercase", marginTop: -2 }}>{displayTagline}</div>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 24 }}>
              <button onClick={() => setShowSearch(true)} style={{ background: "none", border: "none", color: "#8a8690", fontSize: 13, letterSpacing: "0.04em", cursor: "pointer", fontFamily: "'Jost', sans-serif" }}>Search</button>
              <button onClick={() => setShowCart(true)} style={{ background: "none", border: "none", color: "#8a8690", fontSize: 13, cursor: "pointer", fontFamily: "'Jost', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>Cart {cartCount > 0 && <span style={{ width: 18, height: 18, borderRadius: "50%", background: accent, color: "#fff", fontSize: 9, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}</button>
            </div>
          </div>
        </header>

        {/* PROMO COUNTDOWN */}
        {promoCountdown && promoCountdown.timeLeft && (
          <div style={{ background: "linear-gradient(90deg, " + accent + "08 0%, rgba(0,0,0,0.01) 50%, " + accent + "08 100%)", borderBottom: "1px solid " + accent + "18", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "center", gap: 16, flexWrap: "wrap" as const }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.15em", color: "#8a8690", textTransform: "uppercase" as const }}>Limited offer</span>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 14, fontWeight: 500, color: "#2a2a2e" }}>Use code <span style={{ padding: "3px 10px", background: accent + "10", border: "1px solid " + accent + "20", borderRadius: 4, fontWeight: 700, letterSpacing: "0.06em", fontSize: 13, color: accent }}>{promoCountdown.code}</span> for {promoCountdown.type === "percentage" ? promoCountdown.value + "% off" : "R" + promoCountdown.value + " off"}{promoCountdown.applies_to !== "cart" ? " " + promoCountdown.applies_to : ""}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontSize: 10, letterSpacing: "0.12em", color: "#8a8690", textTransform: "uppercase" as const }}>Ends in</span>
              <span style={{ fontFamily: "'Jost', sans-serif", fontSize: 16, fontWeight: 600, color: "#2a2a2e", letterSpacing: "0.08em", background: accent + "0a", padding: "4px 12px", borderRadius: 6, border: "1px solid " + accent + "15" }}>{promoCountdown.timeLeft}</span>
            </div>
          </div>
        )}

        {/* MARQUEE */}
        {cfg.show_marquee && (
          <div style={{ overflow: "hidden", whiteSpace: "nowrap", padding: "14px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            <div style={{ display: "inline-flex", animation: "mscroll 30s linear infinite" }}>
              {[...Array(2)].map((_, r) => marqueeTexts.map((txt, i) => (
                <span key={r + "-" + i} style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 13, fontStyle: "italic", color: "#8a8690", letterSpacing: "0.08em", padding: "0 40px" }}>
                  {txt}<em style={{ fontStyle: "normal", color: accent }}> &bull; </em>
                </span>
              )))}
            </div>
          </div>
        )}

        {/* HERO */}
        <EditSection id="hero">
          <section className="sl-hero" style={{ position: "relative", height: seller?.banner_url ? "92vh" : "auto", minHeight: seller?.banner_url ? 500 : "auto", overflow: "hidden" }}>
            {seller?.banner_url ? (
              <>
                <img src={seller.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.85)" }} />
                {cfg.show_banner_text && (
                  <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(42,42,46,0) 30%, rgba(42,42,46,0.4) 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 40px 80px", textAlign: "center" }}>
                    {displayTagline && <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>{displayTagline}</div>}
                    <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 300, color: "#fff", letterSpacing: "0.04em", lineHeight: 1.1, marginBottom: 20 }}>{seller?.store_name}</h1>
                    <a href="#products" style={{ display: "inline-flex", padding: "16px 48px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100, color: "#fff", fontSize: 12, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>Shop the Collection &rarr;</a>
                  </div>
                )}
              </>
            ) : (
              <div style={{ textAlign: "center", padding: "80px 40px 60px" }}>
                <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 300, letterSpacing: "0.04em", marginBottom: 12 }}>{seller?.store_name}</h1>
                {displayTagline && <p style={{ fontSize: 14, color: "#8a8690", letterSpacing: "0.1em", textTransform: "uppercase" }}>{displayTagline}</p>}
              </div>
            )}
          </section>
        </EditSection>

        {/* COLLECTIONS */}
        {cfg.show_collections && collections.length > 0 && (
          <EditSection id="collections">
          <section style={{ padding: "80px 32px", maxWidth: 1340, margin: "0 auto" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 12, textAlign: "center" }}>Curated For You</div>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, textAlign: "center", letterSpacing: "0.02em", marginBottom: 48 }}>Shop by Collection</h2>
            <div className="sl-cols-g" style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(collections.length, 3) + ", 1fr)", gap: 16 }}>
              {collections.slice(0, 3).map((col, i) => {
                const count = products.filter((p) => p.category === col).length;
                const colProduct = products.find((p) => p.category === col && p.image_url);
                return (
                  <div key={col} onClick={() => { setActiveCategory(col); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }} style={{ position: "relative", aspectRatio: "3/4", borderRadius: 16, overflow: "hidden", cursor: "pointer" }}>
                    {colProduct?.image_url ? (
                      <img src={colProduct.image_url} alt={col} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.8s" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: `linear-gradient(145deg, ${["#d4c5b5,#bfae9c", "#c5bdb5,#a89e94", "#d9cfc5,#c4b8aa"][i % 3]})` }} />
                    )}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "32px 28px", background: "linear-gradient(180deg, transparent, rgba(42,42,46,0.5))" }}>
                      <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, color: "#fff", letterSpacing: "0.03em", marginBottom: 4 }}>{col}</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", letterSpacing: "0.1em", textTransform: "uppercase" }}>{count} Piece{count !== 1 ? "s" : ""}</div>
                      {(() => { const cp = getCollectionPromo(col); return cp ? (
                        <div style={{ marginTop: 10, display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px", background: "rgba(42,42,46,0.7)", backdropFilter: "blur(10px)", borderRadius: 8, border: "1px solid rgba(255,255,255,0.15)" }}>
                          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", letterSpacing: "0.06em", textTransform: "uppercase", fontWeight: 600 }}>{cp.code} {cp.type === "percentage" ? cp.value + "%" : "R" + cp.value} OFF</span>
                          <span style={{ fontSize: 12, color: "#fff", fontWeight: 700 }}>{cp.timeLeft}</span>
                        </div>
                      ) : null; })()}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          </EditSection>
        )}

        {/* PRODUCTS */}
        <section id="products" style={{ padding: "80px 32px", maxWidth: 1340, margin: "0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 12, textAlign: "center" }}>The Collection</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, textAlign: "center", letterSpacing: "0.02em", marginBottom: 48 }}>All Products</h2>

          {cats.length > 2 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
              {cats.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: "10px 28px", borderRadius: 100, background: activeCategory === cat ? "#2a2a2e" : "transparent", border: activeCategory === cat ? "1px solid #2a2a2e" : "1px solid rgba(0,0,0,0.06)", fontFamily: "'Jost', sans-serif", fontSize: 12, color: activeCategory === cat ? "#f6f3ef" : "#8a8690", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.3s" }}>{cat}</button>
              ))}
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 32 }}>
            <select value={productSort} onChange={(e) => setProductSort(e.target.value)} style={{ padding: "8px 16px", background: "#fff", border: "1px solid rgba(0,0,0,0.08)", borderRadius: 8, color: "#8a8690", fontFamily: "'Jost', sans-serif", fontSize: 12, letterSpacing: "0.04em", cursor: "pointer", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const, backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(0,0,0,0.2)'/%3E%3C/svg%3E\")", backgroundRepeat: "no-repeat", backgroundPosition: "right 12px center", paddingRight: 32 }}>
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
            <div style={{ textAlign: "center", padding: "80px 20px", color: "#8a8690" }}>
              <p style={{ fontSize: 18 }}>No products yet</p>
              <p style={{ fontSize: 14, marginTop: 8 }}>Check back soon!</p>
            </div>
          ) : (
            <div className="sl-pgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {filtered.map((product) => (
                <div key={product.id} onClick={() => openProduct(product)} style={{ cursor: "pointer" }}>
                  <div style={{ aspectRatio: "3/4", borderRadius: 16, overflow: "hidden", marginBottom: 16, position: "relative", background: "#fff" }}>
                    {product.image_url ? (
                      <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.6s" }} />
                    ) : (
                      <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #e0d5ca, #cdc0b2)" }} />
                    )}
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
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 17, marginBottom: 4, letterSpacing: "0.01em" }}>{product.name}</div>
                  {product.category && <div style={{ fontSize: 11, color: "#b5b1ac", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 6 }}>{product.category}</div>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 500, color: accent }}>R{product.price}</span>
                    {product.old_price && <span style={{ fontSize: 14, color: "#b5b1ac", textDecoration: "line-through" }}>R{product.old_price}</span>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ABOUT */}
        {cfg.show_about && (displayDescription || seller?.description) && (
          <EditSection id="about">
            <section className="sl-story" style={{ padding: "100px 32px", maxWidth: 1340, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
              <div style={{ aspectRatio: "4/5", borderRadius: 16, overflow: "hidden", background: "linear-gradient(145deg, #d4c5b5, #c0b0a0)" }}>
                {seller?.banner_url && <img src={seller.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
              </div>
              <div>
                <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 12 }}>Our Story</div>
                <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 300, letterSpacing: "0.02em", marginBottom: 24, lineHeight: 1.2 }}>About {seller?.store_name}</h2>
                <p style={{ fontSize: 15, lineHeight: 1.85, color: "#8a8690", fontWeight: 300, maxWidth: 440 }}>{displayDescription || seller?.description}</p>
              </div>
            </section>
          </EditSection>
        )}

        {/* TRUST BAR */}
        {cfg.show_trust_bar && (
          <EditSection id="trust">
            <div className="sl-trust" style={{ padding: "60px 32px", maxWidth: 1340, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
              {displayTrustItems.map((item, i) => (
                <div key={i} style={{ textAlign: "center", padding: 20 }}>
                  <div style={{ fontSize: 24, marginBottom: 12, color: accent }}>{item.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "#b5b1ac", fontWeight: 300 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </EditSection>
        )}

        {/* POLICIES */}
        {cfg.show_policies && (
          <EditSection id="policies">
          <section className="sl-polg" style={{ padding: "80px 32px", maxWidth: 900, margin: "0 auto", textAlign: "center" }}>
            <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 300, marginBottom: 40, letterSpacing: "0.02em" }}>Shipping & Policies</h2>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32, textAlign: "left" }}>
              {policyItems.map((p, i) => (
                <div key={i}>
                  <h4 style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 10, color: accent }}>{p.title}</h4>
                  <p style={{ fontSize: 13, lineHeight: 1.7, color: "#8a8690", fontWeight: 300 }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </section>
          </EditSection>
        )}

        {/* FOOTER */}
        <EditSection id="footer">
        <footer style={{ background: "#2a2a2e", color: "#f6f3ef", padding: "60px 32px 40px" }}>
          <div style={{ maxWidth: 1340, margin: "0 auto" }}>
            <div className="sl-fttop" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 48 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{seller?.store_name}</div>
                {(displayDescription || seller?.description) && <p style={{ fontSize: 13, color: "rgba(246,243,239,0.5)", lineHeight: 1.7, fontWeight: 300, maxWidth: 280 }}>{(displayDescription || seller?.description || "").substring(0, 120)}...</p>}
              </div>
              <div>
                <h5 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>Shop</h5>
                {collections.slice(0, 4).map((c) => <div key={c} style={{ fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, cursor: "pointer" }}>{c}</div>)}
              </div>
              <div>
                <h5 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>Info</h5>
                {["About", "Shipping", "Returns", "Contact"].map((l) => <div key={l} style={{ fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, cursor: "pointer" }}>{l}</div>)}
              </div>
              {(social.instagram || social.tiktok || social.facebook || social.twitter || social.whatsapp) && (
                <div>
                  <h5 style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 16 }}>Connect</h5>
                  {seller?.whatsapp_number && <a href={waLink} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>WhatsApp</a>}
                  {social.instagram && <a href={social.instagram} target="_blank" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>Instagram</a>}
                  {social.tiktok && <a href={social.tiktok} target="_blank" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}><svg width="12" height="14" viewBox="0 0 448 512" fill="currentColor"><path d="M448 209.9a210.1 210.1 0 01-122.8-39.3v178.8A162.6 162.6 0 11185 188.3v89.9a74.6 74.6 0 1052.2 71.2V0h88a121 121 0 00122.8 121z"/></svg>TikTok</a>}
                  {social.facebook && <a href={social.facebook} target="_blank" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}><svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>Facebook</a>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 32, borderTop: "1px solid rgba(246,243,239,0.1)", flexWrap: "wrap", gap: 12 }}>
              <p style={{ fontSize: 11, color: "rgba(246,243,239,0.3)" }}>&copy; {new Date().getFullYear()} {seller?.store_name}</p>
              <p style={{ fontSize: 10, color: "rgba(246,243,239,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Powered by <a href="/" style={{ color: accent, textDecoration: "none", fontWeight: 500 }}>CatalogStore</a></p>
            </div>
          </div>
        </footer>
        </EditSection>

        {/* PRODUCT MODAL */}
        {selectedProduct && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closeProduct}>
            <div style={{ background: "#fff", borderRadius: 20, maxWidth: 900, width: "92%", maxHeight: "90vh", overflow: "auto", position: "relative", padding: "32px" }} onClick={(e) => e.stopPropagation()}>
              <button onClick={closeProduct} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#f5f5f5", border: "none", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", zIndex: 10 }}>&times;</button>
              <div className="sl-modal" style={{ display: "flex", gap: 36 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ borderRadius: 14, overflow: "hidden", background: "#f5f5f5", aspectRatio: "3/4" }}>
                    {selectedProduct.images?.length > 0 ? <img src={selectedProduct.images[activeImageIndex]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #e0d5ca, #cdc0b2)" }} />}
                  </div>
                  {selectedProduct.images?.length > 1 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                      {selectedProduct.images.map((img, i) => <img key={i} src={img} alt="" onClick={() => setActiveImageIndex(i)} style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", cursor: "pointer", border: activeImageIndex === i ? "2px solid " + accent : "2px solid transparent", flexShrink: 0 }} />)}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  {selectedProduct.category && <p style={{ fontSize: 11, color: "#b5b1ac", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{selectedProduct.category}</p>}
                  <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 400, letterSpacing: "0.01em", marginBottom: 12 }}>{selectedProduct.name}</h2>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 24, fontWeight: 500, color: accent }}>R{selectedProduct.price}</span>
                    {selectedProduct.old_price && <span style={{ fontSize: 18, color: "#b5b1ac", textDecoration: "line-through" }}>R{selectedProduct.old_price}</span>}
                  </div>
                  {selectedProduct.description && <p style={{ fontSize: 14, lineHeight: 1.7, color: "#8a8690", marginBottom: 24 }}>{selectedProduct.description}</p>}
                  {selectedProduct.variants?.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      {selectedProduct.variants.map((v) => (
                        <div key={v.name} style={{ marginBottom: 16 }}>
                          <p style={{ fontSize: 13, color: "#8a8690", marginBottom: 8 }}>{v.name}: <strong style={{ color: "#2a2a2e" }}>{selectedVariants[v.name]}</strong></p>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {v.options.map((opt) => (
                              <button key={opt} onClick={() => { setSelectedVariants({ ...selectedVariants, [v.name]: opt }); const varImg = v.images?.[opt]; if (varImg && selectedProduct.images?.length > 0) { const imgIdx = selectedProduct.images.indexOf(varImg); if (imgIdx >= 0) setActiveImageIndex(imgIdx); } }} style={{ padding: "10px 20px", border: selectedVariants[v.name] === opt ? "2px solid #2a2a2e" : "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "#fff", fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: selectedVariants[v.name] === opt ? 600 : 400, cursor: "pointer", color: "#2a2a2e" }}>{opt}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => addToCart(selectedProduct)} style={{ padding: "18px 32px", background: "#2a2a2e", color: "#f6f3ef", border: "none", borderRadius: 100, fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", width: "100%", marginTop: "auto" }}>Add to Cart &mdash; R{selectedProduct.price}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CART DRAWER */}
        {showCart && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.3)", zIndex: 300 }} onClick={() => setShowCart(false)}>
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "90vw", background: "#f6f3ef", display: "flex", flexDirection: "column", boxShadow: "-8px 0 40px rgba(0,0,0,0.08)" }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400 }}>Your Cart ({cartCount})</h3>
                <button onClick={() => setShowCart(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a8690" }}>&times;</button>
              </div>
              {cart.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "#8a8690" }}>Your cart is empty</p></div>
              ) : (
                <>
                  <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
                    {cart.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
                        {item.product.image_url && <img src={item.product.image_url} alt="" style={{ width: 80, height: 100, borderRadius: 10, objectFit: "cover" }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 16, marginBottom: 4 }}>{item.product.name}</div>
                          {Object.keys(item.selectedVariants).length > 0 && <div style={{ fontSize: 12, color: "#b5b1ac", marginBottom: 8 }}>{Object.entries(item.selectedVariants).map(([k, v]) => k + ": " + v).join(" \u2022 ")}</div>}
                          <div style={{ fontSize: 14, fontWeight: 500, color: accent, marginBottom: 8 }}>R{item.product.price}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={() => updateQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.1)", background: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>-</button>
                            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                            <button onClick={() => updateQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid rgba(0,0,0,0.1)", background: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                            <button onClick={() => removeFromCart(idx)} style={{ marginLeft: "auto", background: "none", border: "none", color: "#b5b1ac", fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "24px 28px", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <span style={{ fontSize: 14, color: "#8a8690", letterSpacing: "0.04em", textTransform: "uppercase" }}>Total</span>
                      <span style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 500 }}>R{cartTotal}</span>
                    </div>
                    <button onClick={() => { const encoded = btoa(JSON.stringify(cart.map(i => ({ name: i.product.name, price: i.product.price, qty: i.qty, variant: Object.entries(i.selectedVariants).map(([k,v]) => k+": "+v).join(", "), image: i.product.image_url || "" })))); window.location.href = "/store/" + slug + "/checkout?cart=" + encoded; }} style={{ width: "100%", padding: 18, background: "#2a2a2e", color: "#f6f3ef", border: "none", borderRadius: 100, fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", marginBottom: 8 }}>Proceed to Checkout</button>
                    {seller?.checkout_config?.whatsapp_checkout_enabled !== false && <button onClick={checkoutWhatsApp} style={{ width: "100%", padding: 18, background: "#25d366", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>Checkout via WhatsApp</button>}
                    <p style={{ textAlign: "center", fontSize: 11, color: "#b5b1ac", marginTop: 12 }}>You'll be taken to WhatsApp to confirm</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* SEARCH OVERLAY */}
        {showSearch && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, background: "rgba(246,243,239,0.97)", backdropFilter: "blur(40px)", padding: "0 32px", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center", height: 80 }}>
              <input type="text" autoFocus placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "16px 0", background: "none", border: "none", borderBottom: "1px solid rgba(0,0,0,0.06)", fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 300, color: "#2a2a2e", outline: "none" }} />
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ background: "none", border: "none", fontSize: 24, color: "#8a8690", cursor: "pointer", marginLeft: 16 }}>&times;</button>
            </div>
            {searched && searched.length > 0 && (
              <div style={{ width: "100%", maxWidth: 600, paddingBottom: 24 }}>
                {searched.slice(0, 6).map((p) => (
                  <div key={p.id} onClick={() => { openProduct(p); setShowSearch(false); setSearchQuery(""); }} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid rgba(0,0,0,0.04)", cursor: "pointer" }}>
                    {p.image_url && <img src={p.image_url} alt="" style={{ width: 48, height: 60, borderRadius: 8, objectFit: "cover" }} />}
                    <div><div style={{ fontSize: 15 }}>{p.name}</div><div style={{ fontSize: 13, color: accent }}>R{p.price}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* WHATSAPP FLOAT */}
        {seller?.whatsapp_number && (
          <a href={waLink} target="_blank" style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(37,211,102,0.3)", zIndex: 50, textDecoration: "none" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </a>
        )}

      </div>
    </>
  );
}
