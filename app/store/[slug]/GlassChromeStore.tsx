"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";

interface Seller {
  id: string; store_name: string; whatsapp_number: string; subdomain: string; template: string;
  primary_color: string; logo_url: string; banner_url: string; tagline: string; description: string;
  collections: string[];
  social_links: { whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string };
  store_config: { show_banner_text: boolean; show_marquee: boolean; show_collections: boolean; show_about: boolean; show_trust_bar: boolean; show_policies: boolean; show_newsletter: boolean; announcement: string; marquee_texts?: string[]; trust_items?: { icon: string; title: string; desc: string }[]; policy_items?: { title: string; desc: string }[] };
  subscription_status?: string; trial_ends_at?: string;
}

interface Variant { name: string; options: string[]; }
interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean; description: string;
}

interface CartItem { product: Product; qty: number; selectedVariants: { [key: string]: string }; }

export default function GlassChromeStore() {
  const params = useParams();
  const slug = params.slug as string;
  const [orderStatus, setOrderStatus] = useState<string | null>(null);
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [countdown, setCountdown] = useState(5);

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

  const loadStore = async () => {
    const { data: sd } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
    if (!sd) { setNotFound(true); setLoading(false); return; }
    setSeller(sd);
    const { data: pd } = await supabase.from("products").select("*").eq("seller_id", sd.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true });
    if (pd) setProducts(pd);
    setLoading(false);
  };

  const cfg = seller?.store_config || { show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "" };
  const social = seller?.social_links || {};
  const collections = seller?.collections || [];
  const marqueeTexts = cfg.marquee_texts?.length ? cfg.marquee_texts : [seller?.tagline || "Premium Collection", "Free Delivery Over R500", "Designed in South Africa"];
  const trustItems = cfg.trust_items?.length ? cfg.trust_items : [{ icon: "\u2605", title: "Premium Quality", desc: "Every piece quality-checked" }, { icon: "\u2708", title: "Fast Shipping", desc: "Nationwide 2-5 days" }, { icon: "\u21BA", title: "Easy Returns", desc: "30-day return policy" }, { icon: "\u26A1", title: "Secure Payments", desc: "Card, EFT & WhatsApp" }];
  const policyItems = cfg.policy_items?.length ? cfg.policy_items : [{ title: "Shipping", desc: "Standard R65 nationwide. Free over R599. Express available." }, { title: "Returns", desc: "30-day returns on unworn items in original packaging." }, { title: "Payment", desc: "Visa, Mastercard, EFT. All transactions SSL secured." }];
  const cats = ["All", ...collections.filter((c) => products.some((p) => p.category === c))];
  const filtered = activeCategory === "All" ? products : products.filter((p) => p.category === activeCategory);
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

  // Styles
  const P = "rgba(255,255,255,0.035)";
  const PB = "rgba(255,255,255,0.08)";
  const chromeGrad = "linear-gradient(120deg, #b0b0b0 0%, #ffffff 40%, #787878 60%, #e0e0e0 100%)";
  const mono = "'Share Tech Mono', monospace";
  const display = "'Bebas Neue', sans-serif";
  const body = "'DM Sans', sans-serif";

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: body, background: "#030305" }}><p style={{ color: "rgba(255,255,255,0.4)", fontFamily: mono, fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase" }}>Loading store...</p></div>;
  if (notFound) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: body, background: "#030305" }}><h1 style={{ fontFamily: display, fontSize: 96, background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 8 }}>404</h1><p style={{ color: "rgba(255,255,255,0.4)" }}>This store does not exist.</p></div>;

  const storeInactive = seller && seller.subscription_status !== "active" && !(seller.subscription_status === "trial" && seller.trial_ends_at && new Date(seller.trial_ends_at) > new Date());
  if (storeInactive && !orderStatus) return (
    <div style={{ minHeight: "100vh", background: "#030305", fontFamily: body, color: "#f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px", textAlign: "center" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');`}</style>
      <h1 style={{ fontFamily: display, fontSize: 48, background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 12 }}>OFFLINE</h1>
      <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", maxWidth: 400, lineHeight: 1.6 }}>This store is currently inactive. Please check back soon.</p>
    </div>
  );

  if (orderStatus === "success" || orderStatus === "cancelled") return (
    <div style={{ minHeight: "100vh", background: "#030305", fontFamily: body, color: "#f0f0f0", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 24px" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');`}</style>
      <div style={{ maxWidth: 500, width: "100%", textAlign: "center" }}>
        {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 44, objectFit: "contain", marginBottom: 32 }} /> : <h2 style={{ fontFamily: display, fontSize: 36, background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 32 }}>{seller?.store_name}</h2>}
        {orderStatus === "success" ? (<>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg></div>
          <h1 style={{ fontFamily: display, fontSize: 48, marginBottom: 12 }}>PAYMENT SUCCESSFUL</h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 40 }}>Your payment has been processed. You will receive confirmation shortly.</p>
        </>) : (<>
          <div style={{ width: 72, height: 72, borderRadius: "50%", background: "#ff3d6e", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 24px" }}><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></div>
          <h1 style={{ fontFamily: display, fontSize: 48, marginBottom: 12 }}>PAYMENT CANCELLED</h1>
          <p style={{ fontSize: 15, color: "rgba(255,255,255,0.4)", lineHeight: 1.6, marginBottom: 40 }}>No charges were made. You can try again.</p>
        </>)}
        <a href={"/store/" + slug} style={{ display: "inline-block", padding: "14px 36px", background: "#fff", color: "#000", borderRadius: 6, fontFamily: mono, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>Return to Store</a>
        <p style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", marginTop: 16, fontFamily: mono, letterSpacing: "0.1em" }}>Redirecting in {countdown > 0 ? countdown : 0}s...</p>
      </div>
    </div>
  );

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&display=swap');
        @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
        @keyframes drift1{from{transform:translate(0,0) scale(1)}to{transform:translate(8%,12%) scale(1.1)}}
        @keyframes drift2{from{transform:translate(0,0) scale(1)}to{transform:translate(-6%,-8%) scale(1.15)}}
        @keyframes slideBar{from{transform:translateX(30vw)}to{transform:translateX(-100%)}}
        @media(max-width:768px){.gc-cols{grid-template-columns:1fr 1fr!important}.gc-pgrid{grid-template-columns:repeat(2,1fr)!important}.gc-about{grid-template-columns:1fr!important}.gc-trust{grid-template-columns:repeat(2,1fr)!important}.gc-polg{grid-template-columns:1fr!important}.gc-fgrid{grid-template-columns:1fr!important}.gc-hero{height:70vh!important;min-height:400px!important}.gc-hnav{display:none!important}.gc-modal{flex-direction:column!important}.gc-hcorner{display:none!important}}
      `}</style>
      <div style={{ minHeight: "100vh", background: "#030305", fontFamily: body, color: "#f0f0f0" }}>

        {/* AMBIENT BG */}
        <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: "-20%", left: "-10%", width: 600, height: 600, background: "radial-gradient(circle, rgba(0,229,255,0.04) 0%, transparent 70%)", animation: "drift1 25s ease-in-out infinite alternate" }} />
          <div style={{ position: "absolute", bottom: "-20%", right: "-10%", width: 800, height: 800, background: "radial-gradient(circle, rgba(255,255,255,0.02) 0%, transparent 70%)", animation: "drift2 30s ease-in-out infinite alternate" }} />
        </div>
        <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.015, backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)", backgroundSize: "60px 60px", maskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)", WebkitMaskImage: "radial-gradient(ellipse 80% 80% at 50% 50%, black 40%, transparent 100%)" }} />

        <div style={{ position: "relative", zIndex: 2 }}>

        {/* ANNOUNCEMENT */}
        {cfg.announcement && (
          <div style={{ background: "#030305", borderBottom: "1px solid " + PB, padding: "10px 20px", textAlign: "center", fontFamily: mono, fontSize: 11, letterSpacing: "0.15em", color: "rgba(255,255,255,0.5)", overflow: "hidden", position: "relative" }}>
            <span style={{ display: "inline-block", whiteSpace: "nowrap", animation: "slideBar 18s linear infinite" }}>{cfg.announcement}</span>
          </div>
        )}

        {/* HEADER */}
        <header style={{ position: "sticky", top: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", height: 64, background: "rgba(3,3,5,0.85)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid " + PB }}>
          <div>
            {seller?.logo_url ? (
              <img src={seller.logo_url} alt={seller.store_name} style={{ height: 36, maxWidth: 140, objectFit: "contain" }} />
            ) : (
              <span style={{ fontFamily: display, fontSize: 26, letterSpacing: "0.08em", background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{seller?.store_name}</span>
            )}
          </div>
          <nav className="gc-hnav" style={{ display: "flex", gap: 32, alignItems: "center" }}>
            <span style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>Shop</span>
            {cats.length > 2 && <span style={{ fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(255,255,255,0.5)", cursor: "pointer" }}>Collections</span>}
          </nav>
          <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
            <button onClick={() => setShowSearch(true)} style={{ background: "none", border: "none", color: "rgba(255,255,255,0.5)", cursor: "pointer", display: "flex", alignItems: "center" }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></button>
            <button onClick={() => setShowCart(true)} style={{ background: P, border: "1px solid " + PB, color: "#f0f0f0", padding: "8px 18px", borderRadius: 6, fontFamily: body, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500, cursor: "pointer" }}>Cart ({cartCount})</button>
          </div>
        </header>

        {/* MARQUEE */}
        {cfg.show_marquee && (
          <div style={{ borderBottom: "1px solid " + PB, overflow: "hidden", padding: "12px 0", background: "#0b0b0f" }}>
            <div style={{ display: "flex", whiteSpace: "nowrap", animation: "ticker 28s linear infinite" }}>
              {[...Array(2)].map((_, r) => marqueeTexts.map((txt, i) => (
                <span key={r + "-" + i} style={{ fontFamily: display, fontSize: 15, letterSpacing: "0.08em", color: "rgba(255,255,255,0.28)", paddingRight: 60, display: "inline-flex", alignItems: "center", gap: 24 }}>
                  <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#fff", flexShrink: 0 }} />{txt}
                </span>
              )))}
            </div>
          </div>
        )}

        {/* HERO */}
        <section className="gc-hero" style={{ position: "relative", height: seller?.banner_url ? "100vh" : "auto", minHeight: seller?.banner_url ? 600 : "auto", display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
          {seller?.banner_url ? (
            <>
              <img src={seller.banner_url} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.35) saturate(0.7)" }} />
              <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(3,3,5,0.92) 0%, rgba(3,3,5,0.4) 50%, rgba(3,3,5,0.15) 100%)" }} />
              <div style={{ position: "absolute", inset: 0, pointerEvents: "none", backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0,0,0,0.08) 2px, rgba(0,0,0,0.08) 4px)" }} />
              {cfg.show_banner_text && (
                <div style={{ position: "relative", zIndex: 2, padding: "0 40px 70px", maxWidth: 900 }}>
                  {seller?.tagline && <p style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.25em", color: "#fff", marginBottom: 18, textTransform: "uppercase" }}>- {seller.tagline}</p>}
                  <h1 style={{ fontFamily: display, fontSize: "clamp(56px, 10vw, 144px)", lineHeight: 0.92, letterSpacing: "0.02em", background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 24, textTransform: "uppercase" }}>{seller?.store_name}</h1>
                  <a href="#products" style={{ display: "inline-flex", padding: "14px 32px", borderRadius: 6, background: "#fff", color: "#000", fontFamily: body, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>Shop the Collection</a>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "100px 40px 80px", width: "100%" }}>
              <h1 style={{ fontFamily: display, fontSize: "clamp(48px, 10vw, 120px)", lineHeight: 0.92, background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", textTransform: "uppercase" }}>{seller?.store_name}</h1>
              {seller?.tagline && <p style={{ fontFamily: mono, fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.15em", textTransform: "uppercase", marginTop: 16 }}>{seller.tagline}</p>}
            </div>
          )}
        </section>

        {/* COLLECTIONS */}
        {cfg.show_collections && collections.length > 0 && (
          <section style={{ padding: "90px 30px", maxWidth: 1280, margin: "0 auto" }}>
            <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.25em", color: "#fff", textTransform: "uppercase", marginBottom: 10 }}>/ 01</p>
            <h2 style={{ fontFamily: display, fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 50 }}>Collections</h2>
            <div className="gc-cols" style={{ display: "grid", gridTemplateColumns: "repeat(" + Math.min(collections.length, 3) + ", 1fr)", gap: 16 }}>
              {collections.slice(0, 3).map((col) => {
                const count = products.filter((p) => p.category === col).length;
                const colProduct = products.find((p) => p.category === col && p.image_url);
                return (
                  <div key={col} onClick={() => { setActiveCategory(col); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }} style={{ position: "relative", aspectRatio: "3/4", borderRadius: 12, overflow: "hidden", cursor: "pointer", background: "#0b0b0f", border: "1px solid " + PB }}>
                    {colProduct?.image_url ? <img src={colProduct.image_url} alt={col} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.4) saturate(0.7)", transition: "transform 0.6s" }} /> : <div style={{ position: "absolute", inset: 0, background: "linear-gradient(160deg, #14141a, #0a0a0e)" }} />}
                    <div style={{ position: "absolute", inset: 0, background: "linear-gradient(to top, rgba(3,3,5,0.85) 0%, transparent 55%)" }} />
                    <div style={{ position: "absolute", bottom: 20, left: 20, right: 20 }}>
                      <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", color: "#fff", marginBottom: 4, textTransform: "uppercase" }}>{count} Piece{count !== 1 ? "s" : ""}</div>
                      <div style={{ fontFamily: display, fontSize: 24, letterSpacing: "0.05em" }}>{col}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <div style={{ height: 1, background: PB }} />

        {/* PRODUCTS */}
        <section id="products" style={{ padding: "90px 30px", maxWidth: 1280, margin: "0 auto" }}>
          <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.25em", color: "#fff", textTransform: "uppercase", marginBottom: 10 }}>/ 02</p>
          <h2 style={{ fontFamily: display, fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 50 }}>All Products</h2>

          {cats.length > 2 && (
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 36 }}>
              {cats.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{ background: activeCategory === cat ? "rgba(255,255,255,0.08)" : P, border: activeCategory === cat ? "1px solid #fff" : "1px solid " + PB, color: activeCategory === cat ? "#fff" : "rgba(255,255,255,0.5)", padding: "8px 18px", borderRadius: 100, fontFamily: body, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 500, cursor: "pointer" }}>{cat}</button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 20px", color: "rgba(255,255,255,0.4)" }}><p style={{ fontFamily: display, fontSize: 28 }}>NO PRODUCTS YET</p><p style={{ fontSize: 14, marginTop: 8 }}>Check back soon.</p></div>
          ) : (
            <div className="gc-pgrid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20 }}>
              {filtered.map((product) => (
                <div key={product.id} onClick={() => openProduct(product)} style={{ background: P, border: "1px solid " + PB, borderRadius: 12, overflow: "hidden", cursor: "pointer", transition: "transform 0.35s, border-color 0.35s, box-shadow 0.35s", position: "relative" }} onMouseEnter={(e) => { e.currentTarget.style.transform = "translateY(-6px)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.14)"; e.currentTarget.style.boxShadow = "0 20px 50px rgba(0,0,0,0.6)"; }} onMouseLeave={(e) => { e.currentTarget.style.transform = ""; e.currentTarget.style.borderColor = PB; e.currentTarget.style.boxShadow = ""; }}>
                  <div style={{ aspectRatio: "3/4", overflow: "hidden", background: "#0f0f14", position: "relative" }}>
                    {product.image_url ? <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.55s", filter: "brightness(0.85)" }} /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #141418, #0c0c10)" }} />}
                    {product.old_price && <div style={{ position: "absolute", top: 12, left: 12, fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", padding: "4px 10px", borderRadius: 4, background: "#fff", color: "#000", fontWeight: 600 }}>Sale</div>}
                  </div>
                  <div style={{ padding: 16 }}>
                    {product.category && <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.18em", color: "rgba(255,255,255,0.28)", textTransform: "uppercase", marginBottom: 5 }}>{product.category}</div>}
                    <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 10, letterSpacing: "0.01em", lineHeight: 1.3 }}>{product.name}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>R{product.price}</span>
                      {product.old_price && <span style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", textDecoration: "line-through" }}>R{product.old_price}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <div style={{ height: 1, background: PB }} />

        {/* ABOUT */}
        {cfg.show_about && seller?.description && (
          <section style={{ padding: "90px 30px", maxWidth: 1280, margin: "0 auto" }}>
            <div className="gc-about" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
              <div style={{ position: "relative", aspectRatio: "4/5", borderRadius: 20, overflow: "hidden", background: "#0b0b0f", border: "1px solid " + PB }}>
                {seller?.banner_url && <img src={seller.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.5) saturate(0.7)" }} />}
              </div>
              <div>
                <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.25em", color: "#fff", textTransform: "uppercase", marginBottom: 14 }}>/ 03 - About</p>
                <h2 style={{ fontFamily: display, fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 20, lineHeight: 1 }}>About {seller?.store_name}</h2>
                <p style={{ fontSize: 14, color: "rgba(255,255,255,0.5)", lineHeight: 1.85, fontWeight: 300, maxWidth: 440 }}>{seller.description}</p>
              </div>
            </div>
          </section>
        )}

        {/* TRUST BAR */}
        {cfg.show_trust_bar && (
          <div style={{ background: "#0b0b0f", borderTop: "1px solid " + PB, borderBottom: "1px solid " + PB, padding: "40px 30px" }}>
            <div className="gc-trust" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, maxWidth: 1280, margin: "0 auto" }}>
              {trustItems.map((item, i) => (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 12, padding: "24px 16px", borderRadius: 12, border: "1px solid transparent", transition: "border-color 0.35s, background 0.35s" }}>
                  <div style={{ fontSize: 24, color: "#fff" }}>{item.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" }}>{item.title}</div>
                  <div style={{ fontSize: 12, color: "rgba(255,255,255,0.28)", fontWeight: 300 }}>{item.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* POLICIES */}
        {cfg.show_policies && (
          <section style={{ padding: "90px 30px", maxWidth: 1280, margin: "0 auto" }}>
            <p style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.25em", color: "#fff", textTransform: "uppercase", marginBottom: 10 }}>/ 04</p>
            <h2 style={{ fontFamily: display, fontSize: "clamp(32px, 5vw, 60px)", letterSpacing: "0.04em", textTransform: "uppercase", marginBottom: 50 }}>Shipping & Policies</h2>
            <div className="gc-polg" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
              {policyItems.map((p, i) => (
                <div key={i} style={{ background: P, border: "1px solid " + PB, borderRadius: 12, padding: "32px 28px" }}>
                  <div style={{ fontFamily: mono, fontSize: 10, color: "#fff", letterSpacing: "0.2em", marginBottom: 16, textTransform: "uppercase" }}>0{i + 1} - {p.title}</div>
                  <h4 style={{ fontFamily: display, fontSize: 20, letterSpacing: "0.05em", marginBottom: 12, textTransform: "uppercase" }}>{p.title}</h4>
                  <p style={{ fontSize: 13, color: "rgba(255,255,255,0.5)", lineHeight: 1.7, fontWeight: 300 }}>{p.desc}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div style={{ height: 1, background: PB }} />

        {/* FOOTER */}
        <footer style={{ background: "#0b0b0f", borderTop: "1px solid " + PB, padding: "70px 30px 30px" }}>
          <div style={{ maxWidth: 1280, margin: "0 auto" }}>
            <div className="gc-fgrid" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 60, marginBottom: 60 }}>
              <div>
                {seller?.logo_url ? <img src={seller.logo_url} alt="" style={{ height: 36, objectFit: "contain", marginBottom: 16 }} /> : <div style={{ fontFamily: display, fontSize: 36, letterSpacing: "0.08em", background: chromeGrad, WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", marginBottom: 16, textTransform: "uppercase" }}>{seller?.store_name}</div>}
                {seller?.description && <p style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", fontWeight: 300, maxWidth: 220, lineHeight: 1.7, marginBottom: 28 }}>{seller.description.substring(0, 120)}{seller.description.length > 120 ? "..." : ""}</p>}
                <div style={{ display: "flex", gap: 12 }}>
                  {seller?.whatsapp_number && <a href={waLink} target="_blank" style={{ width: 36, height: 36, border: "1px solid " + PB, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontFamily: mono, fontSize: 11, letterSpacing: "0.05em", textDecoration: "none" }}>WA</a>}
                  {social.instagram && <a href={social.instagram} target="_blank" style={{ width: 36, height: 36, border: "1px solid " + PB, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontFamily: mono, fontSize: 11, textDecoration: "none" }}>IG</a>}
                  {social.tiktok && <a href={social.tiktok} target="_blank" style={{ width: 36, height: 36, border: "1px solid " + PB, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontFamily: mono, fontSize: 11, textDecoration: "none" }}>TK</a>}
                  {social.facebook && <a href={social.facebook} target="_blank" style={{ width: 36, height: 36, border: "1px solid " + PB, borderRadius: 6, display: "flex", alignItems: "center", justifyContent: "center", color: "rgba(255,255,255,0.5)", fontFamily: mono, fontSize: 11, textDecoration: "none" }}>FB</a>}
                </div>
              </div>
              <div>
                <h5 style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600, marginBottom: 20 }}>Shop</h5>
                {collections.slice(0, 5).map((c) => <a key={c} href="#products" onClick={() => setActiveCategory(c)} style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12, fontWeight: 300 }}>{c}</a>)}
              </div>
              <div>
                <h5 style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600, marginBottom: 20 }}>Info</h5>
                {["About", "Shipping", "Returns", "Contact"].map((l) => <div key={l} style={{ fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12, fontWeight: 300, cursor: "pointer" }}>{l}</div>)}
              </div>
              {(social.instagram || social.tiktok || social.facebook || seller?.whatsapp_number) && (
                <div>
                  <h5 style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", fontWeight: 600, marginBottom: 20 }}>Connect</h5>
                  {seller?.whatsapp_number && <a href={waLink} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12, fontWeight: 300, textDecoration: "none" }}>WhatsApp</a>}
                  {social.instagram && <a href={social.instagram} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12, fontWeight: 300, textDecoration: "none" }}>Instagram</a>}
                  {social.tiktok && <a href={social.tiktok} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12, fontWeight: 300, textDecoration: "none" }}>TikTok</a>}
                  {social.facebook && <a href={social.facebook} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(255,255,255,0.28)", marginBottom: 12, fontWeight: 300, textDecoration: "none" }}>Facebook</a>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 28, borderTop: "1px solid " + PB, flexWrap: "wrap", gap: 12 }}>
              <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", letterSpacing: "0.08em" }}>&copy; {new Date().getFullYear()} {seller?.store_name}</span>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.28)" }}>BUILT ON <a href="/" style={{ color: "#fff", textDecoration: "none" }}>CATALOGSTORE</a></div>
            </div>
          </div>
        </footer>

        {/* PRODUCT MODAL */}
        {selectedProduct && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center", backdropFilter: "blur(8px)" }} onClick={closeProduct}>
            <div style={{ background: "#0b0b0f", border: "1px solid " + PB, borderRadius: 16, maxWidth: 900, width: "92%", maxHeight: "90vh", overflow: "auto", position: "relative", padding: 32 }} onClick={(e) => e.stopPropagation()}>
              <button onClick={closeProduct} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: 6, background: P, border: "1px solid " + PB, color: "rgba(255,255,255,0.5)", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10 }}>&times;</button>
              <div className="gc-modal" style={{ display: "flex", gap: 36 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ borderRadius: 12, overflow: "hidden", background: "#0f0f14", aspectRatio: "3/4", border: "1px solid " + PB }}>
                    {selectedProduct.images?.length > 0 ? <img src={selectedProduct.images[activeImageIndex]} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : selectedProduct.image_url ? <img src={selectedProduct.image_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <div style={{ width: "100%", height: "100%", background: "linear-gradient(145deg, #141418, #0c0c10)" }} />}
                  </div>
                  {selectedProduct.images?.length > 1 && (
                    <div style={{ display: "flex", gap: 8, marginTop: 12, overflowX: "auto" }}>
                      {selectedProduct.images.map((img, i) => <img key={i} src={img} alt="" onClick={() => setActiveImageIndex(i)} style={{ width: 56, height: 56, borderRadius: 6, objectFit: "cover", cursor: "pointer", border: activeImageIndex === i ? "2px solid #fff" : "2px solid transparent", flexShrink: 0, opacity: activeImageIndex === i ? 1 : 0.5 }} />)}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                  {selectedProduct.category && <p style={{ fontFamily: mono, fontSize: 10, color: "rgba(255,255,255,0.28)", textTransform: "uppercase", letterSpacing: "0.18em", marginBottom: 8 }}>{selectedProduct.category}</p>}
                  <h2 style={{ fontFamily: display, fontSize: 32, letterSpacing: "0.02em", marginBottom: 12, textTransform: "uppercase" }}>{selectedProduct.name}</h2>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 20 }}>
                    <span style={{ fontSize: 24, fontWeight: 600 }}>R{selectedProduct.price}</span>
                    {selectedProduct.old_price && <span style={{ fontSize: 16, color: "rgba(255,255,255,0.28)", textDecoration: "line-through" }}>R{selectedProduct.old_price}</span>}
                  </div>
                  {selectedProduct.description && <p style={{ fontSize: 14, lineHeight: 1.7, color: "rgba(255,255,255,0.5)", marginBottom: 24, fontWeight: 300 }}>{selectedProduct.description}</p>}
                  {selectedProduct.variants?.length > 0 && (
                    <div style={{ marginBottom: 24 }}>
                      {selectedProduct.variants.map((v) => (
                        <div key={v.name} style={{ marginBottom: 16 }}>
                          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginBottom: 8, fontFamily: mono, letterSpacing: "0.1em", textTransform: "uppercase" }}>{v.name}: <strong style={{ color: "#f0f0f0" }}>{selectedVariants[v.name]}</strong></p>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            {v.options.map((opt) => (
                              <button key={opt} onClick={() => setSelectedVariants({ ...selectedVariants, [v.name]: opt })} style={{ padding: "10px 20px", border: selectedVariants[v.name] === opt ? "1px solid #fff" : "1px solid " + PB, borderRadius: 6, background: selectedVariants[v.name] === opt ? "rgba(255,255,255,0.08)" : "transparent", fontFamily: body, fontSize: 13, fontWeight: selectedVariants[v.name] === opt ? 600 : 400, cursor: "pointer", color: "#f0f0f0" }}>{opt}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => addToCart(selectedProduct)} style={{ padding: "16px 32px", background: "#fff", color: "#000", border: "none", borderRadius: 6, fontFamily: body, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", width: "100%", marginTop: "auto" }}>Add to Cart - R{selectedProduct.price}</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CART DRAWER */}
        {showCart && (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 300 }} onClick={() => setShowCart(false)}>
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "90vw", background: "#0b0b0f", display: "flex", flexDirection: "column", borderLeft: "1px solid " + PB }} onClick={(e) => e.stopPropagation()}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "24px 28px", borderBottom: "1px solid " + PB }}>
                <h3 style={{ fontFamily: display, fontSize: 24, letterSpacing: "0.04em" }}>CART ({cartCount})</h3>
                <button onClick={() => setShowCart(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "rgba(255,255,255,0.5)" }}>&times;</button>
              </div>
              {cart.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "rgba(255,255,255,0.4)", fontFamily: mono, fontSize: 12, letterSpacing: "0.1em", textTransform: "uppercase" }}>Your cart is empty</p></div>
              ) : (
                <>
                  <div style={{ flex: 1, overflow: "auto", padding: "24px 28px" }}>
                    {cart.map((item, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 16, padding: "20px 0", borderBottom: "1px solid " + PB }}>
                        {item.product.image_url && <img src={item.product.image_url} alt="" style={{ width: 80, height: 100, borderRadius: 8, objectFit: "cover" }} />}
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{item.product.name}</div>
                          {Object.keys(item.selectedVariants).length > 0 && <div style={{ fontSize: 11, color: "rgba(255,255,255,0.28)", marginBottom: 8, fontFamily: mono, letterSpacing: "0.05em" }}>{Object.entries(item.selectedVariants).map(([k, v]) => k + ": " + v).join(" / ")}</div>}
                          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>R{item.product.price}</div>
                          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <button onClick={() => updateQty(idx, -1)} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid " + PB, background: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#f0f0f0" }}>-</button>
                            <span style={{ fontSize: 14, fontWeight: 500, minWidth: 20, textAlign: "center" }}>{item.qty}</span>
                            <button onClick={() => updateQty(idx, 1)} style={{ width: 28, height: 28, borderRadius: 4, border: "1px solid " + PB, background: "none", cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center", color: "#f0f0f0" }}>+</button>
                            <button onClick={() => removeFromCart(idx)} style={{ marginLeft: "auto", background: "none", border: "none", color: "rgba(255,255,255,0.28)", fontSize: 11, cursor: "pointer", textDecoration: "underline", fontFamily: body }}>Remove</button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ padding: "24px 28px", borderTop: "1px solid " + PB }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
                      <span style={{ fontFamily: mono, fontSize: 12, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em", textTransform: "uppercase" }}>Total</span>
                      <span style={{ fontFamily: display, fontSize: 28 }}>R{cartTotal}</span>
                    </div>
                    <button onClick={() => { const encoded = btoa(JSON.stringify(cart.map(i => ({ name: i.product.name, price: i.product.price, qty: i.qty, variant: Object.entries(i.selectedVariants).map(([k,v]) => k+": "+v).join(", "), image: i.product.image_url || "" })))); window.location.href = "/store/" + slug + "/checkout?cart=" + encoded; }} style={{ width: "100%", padding: 16, background: "#fff", color: "#000", border: "none", borderRadius: 6, fontFamily: body, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer", marginBottom: 8 }}>Proceed to Checkout</button>
                    <button onClick={checkoutWhatsApp} style={{ width: "100%", padding: 16, background: "#25d366", color: "#fff", border: "none", borderRadius: 6, fontFamily: body, fontSize: 12, fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", cursor: "pointer" }}>Checkout via WhatsApp</button>
                    <p style={{ textAlign: "center", fontSize: 10, color: "rgba(255,255,255,0.28)", marginTop: 12, fontFamily: mono, letterSpacing: "0.08em", textTransform: "uppercase" }}>Secure checkout</p>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* SEARCH OVERLAY */}
        {showSearch && (
          <div style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 200, background: "rgba(3,3,5,0.97)", backdropFilter: "blur(40px)", padding: "0 32px", minHeight: 80, display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ width: "100%", maxWidth: 600, display: "flex", alignItems: "center", height: 80 }}>
              <input type="text" autoFocus placeholder="Search products..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} style={{ flex: 1, padding: "16px 0", background: "none", border: "none", borderBottom: "1px solid " + PB, fontFamily: display, fontSize: 28, color: "#f0f0f0", outline: "none", letterSpacing: "0.02em" }} />
              <button onClick={() => { setShowSearch(false); setSearchQuery(""); }} style={{ background: "none", border: "none", fontSize: 24, color: "rgba(255,255,255,0.5)", cursor: "pointer", marginLeft: 16 }}>&times;</button>
            </div>
            {searched && searched.length > 0 && (
              <div style={{ width: "100%", maxWidth: 600, paddingBottom: 24 }}>
                {searched.slice(0, 6).map((p) => (
                  <div key={p.id} onClick={() => { openProduct(p); setShowSearch(false); setSearchQuery(""); }} style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid " + PB, cursor: "pointer" }}>
                    {p.image_url && <img src={p.image_url} alt="" style={{ width: 48, height: 60, borderRadius: 6, objectFit: "cover" }} />}
                    <div><div style={{ fontSize: 14 }}>{p.name}</div><div style={{ fontSize: 13, color: "rgba(255,255,255,0.5)" }}>R{p.price}</div></div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* WHATSAPP FLOAT */}
        {seller?.whatsapp_number && (
          <a href={waLink} target="_blank" style={{ position: "fixed", bottom: 28, right: 28, width: 52, height: 52, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(37,211,102,0.3)", zIndex: 50, textDecoration: "none" }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/></svg>
          </a>
        )}

        </div>
      </div>
    </>
  );
}