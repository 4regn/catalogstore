"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";

/* ─── TYPES ─────────────────────────────────────────────── */
interface SocialLinks {
  whatsapp?: string; instagram?: string; tiktok?: string;
  facebook?: string; twitter?: string;
}
interface StoreConfig {
  announcement?: string;
  show_announcement?: boolean;
  show_trust_bar?: boolean;
  show_policies?: boolean;
  show_about?: boolean;
}
interface Seller {
  id: string; store_name: string; whatsapp_number: string;
  subdomain: string; template: string; primary_color: string;
  logo_url: string; tagline: string; description: string;
  collections: string[]; social_links: SocialLinks;
  store_config: StoreConfig; subscription_status?: string;
}
interface Variant { name: string; options: string[]; }
interface Product {
  id: string; name: string; price: number; old_price: number | null;
  category: string; image_url: string; images: string[];
  variants: Variant[]; in_stock: boolean; description: string;
  sort_order: number;
}
interface CartItem {
  product: Product; qty: number;
  selectedVariants: { [key: string]: string };
}

/* ─── HELPERS ────────────────────────────────────────────── */
const fmt = (n: number) => "R" + n.toLocaleString("en-ZA");
const FREE_SHIP = 800;

export default function CrownStore() {
  const params = useParams();
  const slug = params.slug as string;

  const [seller, setSeller]     = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading]   = useState(true);
  const [notFound, setNotFound] = useState(false);

  /* ui state */
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImg, setActiveImg] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<{ [k: string]: string }>({});
  const [localQty, setLocalQty] = useState(1);
  const [variantError, setVariantError] = useState(false);

  /* cart */
  const [cart, setCart]       = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);

  /* checkout */
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [checkoutStep, setCheckoutStep] = useState(1); // 1=details 2=payment 3=success
  const [shippingCost, setShippingCost] = useState(80);
  const [form, setForm] = useState({
    firstName: "", lastName: "", email: "", phone: "",
    address: "", suburb: "", city: "", province: "", postalCode: "",
    notes: "", paymentMethod: "card",
  });
  const [formErrors, setFormErrors] = useState<{ [k: string]: string }>({});
  const [submitting, setSubmitting] = useState(false);

  /* nav scroll */
  const [scrolled, setScrolled] = useState(false);
  const [navVisible, setNavVisible] = useState(true);
  const lastScrollY = useRef(0);

  /* ─── LOAD ─── */
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase
        .from("sellers").select("*").eq("subdomain", slug).single();
      if (!s) { setNotFound(true); setLoading(false); return; }
      setSeller(s);
      const { data: p } = await supabase
        .from("products").select("*")
        .eq("seller_id", s.id).eq("in_stock", true)
        .order("sort_order", { ascending: true });
      setProducts(p || []);
      setLoading(false);
    })();
  }, [slug]);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      setNavVisible(y < lastScrollY.current || y < 100);
      lastScrollY.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  /* lock body scroll when overlays open */
  useEffect(() => {
    document.body.style.overflow = (cartOpen || checkoutOpen || !!selectedProduct) ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [cartOpen, checkoutOpen, selectedProduct]);

  /* ─── DERIVED ─── */
  const categories = ["All", ...Array.from(new Set(products.map(p => p.category).filter(Boolean)))];
  const filtered = activeCategory === "All" ? products : products.filter(p => p.category === activeCategory);
  const cartTotal = cart.reduce((s, i) => s + i.product.price * i.qty, 0);
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  const grandTotal = cartTotal + (cartTotal >= FREE_SHIP ? 0 : shippingCost);
  const freeShipRemaining = Math.max(0, FREE_SHIP - cartTotal);
  const freeShipPct = Math.min(100, (cartTotal / FREE_SHIP) * 100);

  /* ─── CART OPS ─── */
  const addToCart = (product: Product, qty: number, variants: { [k: string]: string }) => {
    setCart(prev => {
      const key = product.id + JSON.stringify(variants);
      const existing = prev.find(i => i.product.id + JSON.stringify(i.selectedVariants) === key);
      if (existing) return prev.map(i => i === existing ? { ...i, qty: i.qty + qty } : i);
      return [...prev, { product, qty, selectedVariants: variants }];
    });
  };
  const removeFromCart = (idx: number) => setCart(prev => prev.filter((_, i) => i !== idx));
  const changeQty = (idx: number, d: number) => setCart(prev =>
    prev.map((i, n) => n === idx ? { ...i, qty: Math.max(1, i.qty + d) } : i)
  );

  /* ─── PRODUCT ACTIONS ─── */
  const openProduct = (p: Product) => {
    setSelectedProduct(p);
    setActiveImg(0);
    setSelectedVariants({});
    setLocalQty(1);
    setVariantError(false);
  };
  const handleAddToCart = () => {
    if (!selectedProduct) return;
    const allSelected = (selectedProduct.variants || []).every(v => selectedVariants[v.name]);
    if (!allSelected && (selectedProduct.variants || []).length > 0) {
      setVariantError(true); return;
    }
    addToCart(selectedProduct, localQty, selectedVariants);
    setSelectedProduct(null);
    setCartOpen(true);
  };

  /* ─── CHECKOUT ─── */
  const validateForm = () => {
    const errs: { [k: string]: string } = {};
    if (!form.firstName.trim()) errs.firstName = "Required";
    if (!form.lastName.trim()) errs.lastName = "Required";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Valid email required";
    if (!/^0[6-8]\d{8}$/.test(form.phone.replace(/\s/g, ""))) errs.phone = "Valid SA number required";
    if (!form.address.trim()) errs.address = "Required";
    if (!form.city.trim()) errs.city = "Required";
    if (!form.province) errs.province = "Required";
    if (!/^\d{4}$/.test(form.postalCode)) errs.postalCode = "4-digit code required";
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleCheckout = async () => {
    if (!validateForm()) return;
    setSubmitting(true);
    try {
      const orderRef = "CROWN-" + Math.floor(10000 + Math.random() * 90000);
      const items = cart.map(i => ({
        name: i.product.name,
        qty: i.qty,
        price: i.product.price,
        variants: i.selectedVariants,
      }));
      /* Save order to Supabase */
      await supabase.from("orders").insert({
        seller_id: seller!.id,
        customer_name: `${form.firstName} ${form.lastName}`,
        customer_email: form.email,
        customer_phone: form.phone,
        delivery_address: `${form.address}, ${form.suburb}, ${form.city}, ${form.province}, ${form.postalCode}`,
        items,
        total: grandTotal,
        shipping_cost: cartTotal >= FREE_SHIP ? 0 : shippingCost,
        payment_method: form.paymentMethod,
        notes: form.notes,
        status: "pending",
        order_ref: orderRef,
      });

      if (form.paymentMethod === "payfast") {
        /* PayFast redirect via API route */
        const res = await fetch("/api/checkout/payfast", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ orderId: orderRef, amount: grandTotal, email: form.email, name: `${form.firstName} ${form.lastName}`, sellerId: seller!.id }),
        });
        const { redirectUrl } = await res.json();
        if (redirectUrl) { window.location.href = redirectUrl; return; }
      }
      /* WhatsApp / EFT fallback */
      setCheckoutStep(3);
    } finally {
      setSubmitting(false);
    }
  };

  /* WhatsApp order */
  const orderViaWhatsApp = () => {
    if (!seller) return;
    const lines = cart.map(i => {
      const vars = Object.entries(i.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ");
      return `• ${i.product.name}${vars ? ` (${vars})` : ""} × ${i.qty} — ${fmt(i.product.price * i.qty)}`;
    });
    const msg = [
      `Hi ${seller.store_name}! I'd like to order:`,
      ...lines,
      ``,
      `Total: ${fmt(grandTotal)}`,
      ``,
      `Delivery to: ${form.city || "[city]"}`,
    ].join("\n");
    const num = (seller.whatsapp_number || "").replace(/\D/g, "");
    window.open(`https://wa.me/${num}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  /* ─── LOADING / NOT FOUND ─── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0a0908", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 32, fontWeight: 300, letterSpacing: "0.2em", textTransform: "uppercase", color: "#f0e6d3", marginBottom: 24 }}>Crown</div>
        <div style={{ width: 32, height: 32, border: "1px solid rgba(196,162,101,0.3)", borderTopColor: "#c4a265", borderRadius: "50%", animation: "spin 1s linear infinite", margin: "0 auto" }} />
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", background: "#0a0908", display: "flex", alignItems: "center", justifyContent: "center", color: "#f0e6d3", fontFamily: "'Cormorant Garant', serif", textAlign: "center" }}>
      <div>
        <div style={{ fontSize: 64, fontWeight: 300, color: "#c4a265", opacity: 0.3, marginBottom: 16 }}>404</div>
        <div style={{ fontSize: 24, fontWeight: 300 }}>Store not found</div>
      </div>
    </div>
  );

  const s = seller!;
  const config = s.store_config || {};
  const gold = "#c4a265";
  const goldLight = "#d4b88a";
  const cream = "#f0e6d3";
  const bgDeep = "#0a0908";
  const bgElevated = "#141210";
  const bgCard = "#1a1816";
  const textSecondary = "rgba(240,230,211,0.6)";
  const textMuted = "rgba(240,230,211,0.35)";
  const border = "rgba(196,162,101,0.1)";

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garant:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Didact+Gothic&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap');
        *{box-sizing:border-box;margin:0;padding:0}
        body{-webkit-font-smoothing:antialiased}
        @keyframes spin{to{transform:rotate(360deg)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
        @keyframes slideIn{from{transform:translateX(100%)}to{transform:translateX(0)}}
        @keyframes slideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}
        @keyframes ticker{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        .crown-fade{animation:fadeUp 0.6s ease forwards}
        .crown-prod-img img{transition:transform 0.7s cubic-bezier(0.16,1,0.3,1)}
        .crown-prod-card:hover .crown-prod-img img{transform:scale(1.05)}
        .crown-prod-card:hover{border-color:rgba(196,162,101,0.25)!important}
        .crown-len-btn:hover{border-color:${gold}!important;color:${cream}!important}
        .crown-len-btn.active{border-color:${gold}!important;background:rgba(196,162,101,0.12)!important;color:${goldLight}!important}
        .crown-add-btn:hover{background:${goldLight}!important;transform:translateY(-1px)}
        .crown-qty-btn:hover{background:rgba(196,162,101,0.15)!important;border-color:${gold}!important}
        .crown-cat-btn:hover{color:${cream}!important}
        .crown-cat-btn.active{color:${gold}!important;border-color:${gold}!important}
        .crown-submit:hover::after{transform:scaleX(1)!important}
        @media(max-width:768px){
          .crown-hero-grid{grid-template-columns:1fr!important;min-height:auto!important}
          .crown-prod-grid{grid-template-columns:1fr 1fr!important}
          .crown-modal-grid{grid-template-columns:1fr!important}
          .crown-nav-links{display:none!important}
          .crown-checkout-grid{grid-template-columns:1fr!important}
        }
        @media(max-width:480px){
          .crown-prod-grid{grid-template-columns:1fr!important}
        }
      `}</style>

      <div style={{ fontFamily: "'Didact Gothic', sans-serif", background: bgDeep, color: cream, minHeight: "100vh", overflowX: "hidden" }}>

        {/* ── ANNOUNCEMENT BAR ── */}
        {config.show_announcement !== false && (
          <div style={{ background: gold, color: bgDeep, textAlign: "center", padding: "10px 20px", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase" }}>
            {config.announcement || `Free shipping on orders over ${fmt(FREE_SHIP)} · 100% Human Hair · SA Nationwide`}
          </div>
        )}

        {/* ── NAV ── */}
        <nav style={{
          position: "sticky", top: 0, zIndex: 200,
          background: scrolled ? "rgba(10,9,8,0.95)" : "transparent",
          backdropFilter: scrolled ? "blur(20px)" : "none",
          borderBottom: scrolled ? `1px solid ${border}` : "none",
          padding: "20px 48px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          transition: "all 0.4s ease",
          transform: navVisible ? "translateY(0)" : "translateY(-100%)",
        }}>
          <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 26, fontWeight: 300, letterSpacing: "0.18em", textTransform: "uppercase", color: cream }}>
            {s.store_name || "Crown"}
          </div>
          <div className="crown-nav-links" style={{ display: "flex", gap: 40 }}>
            {categories.filter(c => c !== "All").slice(0, 5).map(cat => (
              <button key={cat} onClick={() => { setActiveCategory(cat); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: textSecondary, transition: "color 0.3s" }}>
                {cat}
              </button>
            ))}
          </div>
          <button onClick={() => setCartOpen(true)} style={{
            display: "flex", alignItems: "center", gap: 10,
            background: "none", border: `1px solid rgba(196,162,101,0.3)`,
            color: goldLight, fontFamily: "'Didact Gothic', sans-serif",
            fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase",
            padding: "9px 20px", cursor: "pointer", transition: "all 0.3s",
          }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 01-8 0"/>
            </svg>
            Cart
            <span style={{ background: gold, color: bgDeep, width: 18, height: 18, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700 }}>{cartCount}</span>
          </button>
        </nav>

        {/* ── HERO ── */}
        <section style={{ position: "relative", minHeight: "90vh", display: "flex", alignItems: "flex-end", overflow: "hidden" }}>
          {/* Background image */}
          <div style={{ position: "absolute", inset: 0, zIndex: 0 }}>
            {s.logo_url ? (
              <img src={s.logo_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", filter: "brightness(0.6)" }} />
            ) : (
              <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${bgElevated} 0%, #1e1a16 100%)` }} />
            )}
            <div style={{ position: "absolute", inset: 0, background: `linear-gradient(to top, rgba(10,9,8,0.9) 0%, rgba(10,9,8,0.4) 50%, rgba(10,9,8,0.1) 100%)` }} />
          </div>
          {/* Gold vertical rule */}
          <div style={{ position: "absolute", top: "20%", bottom: "20%", left: "50%", width: 1, background: `linear-gradient(to bottom, transparent, rgba(196,162,101,0.2), transparent)`, zIndex: 1 }} />

          <div style={{ position: "relative", zIndex: 2, padding: "0 48px 80px", maxWidth: 700, animation: "fadeUp 1s ease 0.3s both" }}>
            <div style={{ fontSize: 10, letterSpacing: "0.3em", textTransform: "uppercase", color: gold, marginBottom: 24 }}>
              Premium Hair Collection · SA Delivered
            </div>
            <h1 style={{ fontFamily: "'Cormorant Garant', serif", fontSize: "clamp(52px,7vw,96px)", fontWeight: 300, lineHeight: 0.9, letterSpacing: "-0.01em", color: cream, marginBottom: 24 }}>
              {s.tagline ? s.tagline.split(" ").map((word, i, arr) =>
                i === Math.floor(arr.length / 2) ? <><em key={i} style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: goldLight, display: "block" }}>{word}</em></> : <span key={i}>{word} </span>
              ) : <><span>Wear your </span><em style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: goldLight, display: "block" }}>crown</em><span>with confidence.</span></>}
            </h1>
            {s.description && (
              <p style={{ fontSize: 14, lineHeight: 1.9, color: textSecondary, maxWidth: 400, marginBottom: 40 }}>{s.description}</p>
            )}
            <button onClick={() => document.getElementById("products")?.scrollIntoView({ behavior: "smooth" })}
              style={{ display: "inline-flex", alignItems: "center", gap: 14, padding: "16px 42px", background: "transparent", border: `1px solid ${gold}`, color: goldLight, fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.4s" }}>
              Explore Collection <span>→</span>
            </button>
          </div>
        </section>

        {/* ── TEXTURE TICKER ── */}
        {categories.filter(c => c !== "All").length > 0 && (
          <div style={{ background: bgDeep, overflow: "hidden", padding: "14px 0", borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
            <div style={{ display: "inline-flex", animation: "ticker 20s linear infinite", whiteSpace: "nowrap" }}>
              {[...categories.filter(c => c !== "All"), ...categories.filter(c => c !== "All")].map((cat, i) => (
                <span key={i} style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 16, color: "rgba(240,230,211,0.18)", padding: "0 28px", letterSpacing: "0.06em" }}>
                  {cat} <span style={{ color: gold, fontSize: 10 }}>✦</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* ── PRODUCTS ── */}
        <section id="products" style={{ padding: "100px 48px", background: bgDeep }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 56, paddingBottom: 24, borderBottom: `1px solid ${border}`, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 72, fontWeight: 300, color: "rgba(196,162,101,0.06)", lineHeight: 1, marginBottom: -12, letterSpacing: "-0.02em" }}>{filtered.length}</div>
              <div style={{ fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", color: gold, marginBottom: 6 }}>The Edit</div>
              <h2 style={{ fontFamily: "'Cormorant Garant', serif", fontSize: "clamp(28px,4vw,44px)", fontWeight: 300, color: cream, letterSpacing: "-0.01em" }}>
                Latest <em style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: goldLight }}>arrivals</em>
              </h2>
            </div>
            {/* Category filter */}
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {categories.map(cat => (
                <button key={cat} className={`crown-cat-btn${activeCategory === cat ? " active" : ""}`}
                  onClick={() => setActiveCategory(cat)}
                  style={{ background: "none", border: `1px solid ${activeCategory === cat ? gold : border}`, color: activeCategory === cat ? gold : textMuted, fontFamily: "'Didact Gothic', sans-serif", fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", padding: "8px 18px", cursor: "pointer", transition: "all 0.25s" }}>
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Grid */}
          {filtered.length === 0 ? (
            <div style={{ textAlign: "center", padding: "80px 0", color: textMuted }}>
              <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 28, fontWeight: 300, marginBottom: 12 }}>No products yet</div>
              <div style={{ fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase" }}>Check back soon</div>
            </div>
          ) : (
            <div className="crown-prod-grid" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 2 }}>
              {filtered.map((p, i) => {
                const imgs = [p.image_url, ...(p.images || [])].filter(Boolean);
                const discountPct = p.old_price ? Math.round((1 - p.price / p.old_price) * 100) : null;
                return (
                  <div key={p.id} className="crown-prod-card"
                    onClick={() => openProduct(p)}
                    style={{ background: bgCard, cursor: "pointer", border: "1px solid transparent", transition: "border-color 0.4s", animation: `fadeUp 0.5s ease ${i * 0.05}s both` }}>
                    {/* Image */}
                    <div className="crown-prod-img" style={{ position: "relative", overflow: "hidden", aspectRatio: "3/4", background: bgElevated, borderBottom: `1px solid ${border}` }}>
                      {imgs[0] ? (
                        <img src={imgs[0]} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", display: "block", filter: "brightness(0.9)" }} loading="lazy" />
                      ) : (
                        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: textMuted, fontSize: 32 }}>◆</div>
                      )}
                      {discountPct && (
                        <div style={{ position: "absolute", top: 12, right: 12, background: gold, color: bgDeep, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", padding: "4px 10px" }}>−{discountPct}%</div>
                      )}
                      {/* Gold glow overlay on hover */}
                      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at center bottom, rgba(196,162,101,0.08) 0%, transparent 60%)", opacity: 0, transition: "opacity 0.4s" }} />
                    </div>
                    {/* Info */}
                    <div style={{ padding: "18px 18px 22px", borderTop: `1px solid rgba(196,162,101,0.04)` }}>
                      {p.category && (
                        <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: gold, marginBottom: 8, opacity: 0.7 }}>{p.category}</div>
                      )}
                      <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 19, fontWeight: 300, color: cream, lineHeight: 1.15, marginBottom: 10, transition: "color 0.3s" }}>{p.name}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 18, fontWeight: 300, color: p.old_price ? goldLight : textMuted, letterSpacing: "0.02em" }}>{fmt(p.price)}</span>
                        {p.old_price && <span style={{ fontSize: 12, color: textMuted, textDecoration: "line-through" }}>{fmt(p.old_price)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ── TRUST BAR ── */}
        {config.show_trust_bar !== false && (
          <div style={{ background: bgElevated, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
            <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", padding: "0 48px" }}>
              {[
                { icon: "◆", title: "100% Human Hair", desc: "Every bundle tested before it ships" },
                { icon: "◆", title: "Fast Dispatch", desc: "Order before 1PM, ships same day" },
                { icon: "◆", title: "Easy Returns", desc: "14-day returns on unopened items" },
                { icon: "◆", title: "Real Support", desc: "WhatsApp us — we actually reply" },
              ].map((t, i) => (
                <div key={i} style={{ padding: "40px 32px", borderRight: i < 3 ? `1px solid ${border}` : "none" }}>
                  <div style={{ fontSize: 14, color: gold, marginBottom: 10, opacity: 0.7 }}>{t.icon}</div>
                  <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 18, fontWeight: 300, color: cream, marginBottom: 6 }}>{t.title}</div>
                  <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.6 }}>{t.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── ABOUT ── */}
        {config.show_about !== false && s.description && (
          <section style={{ background: "#0e0c0a", padding: "100px 48px" }}>
            <div style={{ maxWidth: 700, margin: "0 auto", textAlign: "center" }}>
              <div style={{ fontSize: 9, letterSpacing: "0.28em", textTransform: "uppercase", color: gold, marginBottom: 20 }}>Our Story</div>
              <h2 style={{ fontFamily: "'Cormorant Garant', serif", fontSize: "clamp(36px,5vw,60px)", fontWeight: 300, color: cream, lineHeight: 1, marginBottom: 24, letterSpacing: "-0.01em" }}>
                Hair that <em style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: goldLight }}>moves</em> with you.
              </h2>
              <p style={{ fontSize: 14, lineHeight: 2, color: textSecondary }}>{s.description}</p>
            </div>
          </section>
        )}

        {/* ── POLICIES ── */}
        {config.show_policies !== false && (
          <div style={{ background: bgElevated, borderTop: `1px solid ${border}`, borderBottom: `1px solid ${border}` }}>
            <div style={{ maxWidth: 1300, margin: "0 auto", padding: "48px 48px", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40 }}>
              {[
                { title: "Shipping", desc: `Free delivery on orders over ${fmt(FREE_SHIP)}. Standard 2–4 business days nationwide. Tracked and insured.` },
                { title: "Returns", desc: "14-day returns on all unopened products in original packaging. Quality issue? We replace — no questions asked." },
                { title: "Payment", desc: "Secure card payments via PayFast. EFT accepted. WhatsApp orders welcome." },
              ].map((pol, i) => (
                <div key={i} style={{ paddingLeft: i > 0 ? 40 : 0, borderLeft: i > 0 ? `1px solid ${border}` : "none" }}>
                  <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 20, fontWeight: 300, color: cream, marginBottom: 10 }}>{pol.title}</div>
                  <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.9 }}>{pol.desc}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── FOOTER ── */}
        <footer style={{ background: bgDeep, borderTop: `1px solid ${border}`, padding: "60px 48px 32px" }}>
          <div style={{ maxWidth: 1300, margin: "0 auto", display: "grid", gridTemplateColumns: "2fr 1fr 1fr", gap: 60, marginBottom: 40 }}>
            <div>
              <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.14em", textTransform: "uppercase", color: cream, marginBottom: 14 }}>{s.store_name}</div>
              <div style={{ fontSize: 13, color: textMuted, lineHeight: 1.8, maxWidth: 240 }}>Premium hair extensions and wigs. Delivered across South Africa.</div>
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: gold, marginBottom: 16 }}>Shop</div>
              {categories.filter(c => c !== "All").map(cat => (
                <button key={cat} onClick={() => { setActiveCategory(cat); document.getElementById("products")?.scrollIntoView({ behavior: "smooth" }); }}
                  style={{ display: "block", background: "none", border: "none", cursor: "pointer", fontFamily: "'Didact Gothic', sans-serif", fontSize: 13, color: textSecondary, padding: "5px 0", transition: "color 0.2s" }}>
                  {cat}
                </button>
              ))}
            </div>
            <div>
              <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: gold, marginBottom: 16 }}>Connect</div>
              {s.social_links?.instagram && <a href={`https://instagram.com/${s.social_links.instagram}`} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 13, color: textSecondary, textDecoration: "none", padding: "5px 0" }}>Instagram</a>}
              {s.social_links?.tiktok && <a href={`https://tiktok.com/@${s.social_links.tiktok}`} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 13, color: textSecondary, textDecoration: "none", padding: "5px 0" }}>TikTok</a>}
              {s.whatsapp_number && <a href={`https://wa.me/${s.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={{ display: "block", fontSize: 13, color: textSecondary, textDecoration: "none", padding: "5px 0" }}>WhatsApp</a>}
            </div>
          </div>
          <div style={{ maxWidth: 1300, margin: "0 auto", paddingTop: 24, borderTop: `1px solid ${border}`, display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
            <span style={{ fontSize: 10, color: textMuted, letterSpacing: "0.06em" }}>© {new Date().getFullYear()} {s.store_name}. All rights reserved.</span>
            <a href="https://catalogstore.co.za" target="_blank" rel="noreferrer" style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: gold, textDecoration: "none" }}>Powered by CatalogStore</a>
          </div>
        </footer>

        {/* ── WHATSAPP FLOAT ── */}
        <a href={`https://wa.me/${(s.whatsapp_number || "").replace(/\D/g, "")}`} target="_blank" rel="noreferrer"
          style={{ position: "fixed", bottom: 32, right: 32, zIndex: 300, width: 52, height: 52, background: "#25d366", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 20px rgba(37,211,102,0.3)", transition: "transform 0.3s", textDecoration: "none" }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        </a>

        {/* ════════════════════════════════════
            PRODUCT MODAL
        ════════════════════════════════════ */}
        {selectedProduct && (() => {
          const p = selectedProduct;
          const imgs = [p.image_url, ...(p.images || [])].filter(Boolean);
          return (
            <>
              <div onClick={() => setSelectedProduct(null)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", backdropFilter: "blur(6px)", zIndex: 400 }} />
              <div className="crown-modal-grid" style={{
                position: "fixed", top: "5vh", left: "5vw", right: "5vw", bottom: "5vh",
                background: bgElevated, zIndex: 401,
                display: "grid", gridTemplateColumns: "1fr 1fr",
                overflow: "hidden", animation: "fadeUp 0.4s ease",
                border: `1px solid ${border}`,
              }}>
                {/* Image side */}
                <div style={{ position: "relative", overflow: "hidden", background: bgCard }}>
                  {imgs[activeImg] ? (
                    <img src={imgs[activeImg]} alt={p.name} style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top", filter: "brightness(0.9)" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: textMuted, fontSize: 48 }}>◆</div>
                  )}
                  {/* Thumbnail strip */}
                  {imgs.length > 1 && (
                    <div style={{ position: "absolute", bottom: 16, left: 16, display: "flex", gap: 8, flexWrap: "wrap" }}>
                      {imgs.map((img, i) => (
                        <div key={i} onClick={e => { e.stopPropagation(); setActiveImg(i); }}
                          style={{ width: 48, height: 56, overflow: "hidden", cursor: "pointer", border: `1px solid ${i === activeImg ? gold : "transparent"}`, transition: "border-color 0.2s" }}>
                          <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "center top" }} />
                        </div>
                      ))}
                    </div>
                  )}
                  {p.category && (
                    <div style={{ position: "absolute", top: 16, left: 16, background: gold, color: bgDeep, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 14px" }}>{p.category}</div>
                  )}
                </div>

                {/* Details side */}
                <div style={{ padding: "40px 40px", overflow: "y-auto", display: "flex", flexDirection: "column", gap: 0, overflowY: "auto" }}>
                  <button onClick={() => setSelectedProduct(null)} style={{ alignSelf: "flex-end", background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 22, lineHeight: 1, marginBottom: 20, transition: "color 0.2s" }}>✕</button>

                  <div style={{ fontSize: 9, letterSpacing: "0.24em", textTransform: "uppercase", color: gold, marginBottom: 10 }}>Crown Hair Collection</div>
                  <h2 style={{ fontFamily: "'Cormorant Garant', serif", fontSize: "clamp(28px,3.5vw,42px)", fontWeight: 300, color: cream, lineHeight: 1.05, marginBottom: 10 }}>{p.name}</h2>
                  <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 26, fontWeight: 300, color: goldLight, marginBottom: 20 }}>
                    {fmt(p.price)}
                    {p.old_price && <span style={{ fontSize: 14, color: textMuted, textDecoration: "line-through", marginLeft: 10, fontFamily: "'Didact Gothic', sans-serif" }}>{fmt(p.old_price)}</span>}
                  </div>
                  {p.description && (
                    <p style={{ fontSize: 13, lineHeight: 1.9, color: textSecondary, marginBottom: 28, paddingBottom: 28, borderBottom: `1px solid ${border}` }}>{p.description}</p>
                  )}

                  {/* Variants */}
                  {(p.variants || []).map(v => (
                    <div key={v.name} style={{ marginBottom: 24 }}>
                      <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: textMuted, marginBottom: 12, display: "flex", justifyContent: "space-between" }}>
                        <span>{v.name}</span>
                        {selectedVariants[v.name] && <span style={{ color: goldLight }}>{selectedVariants[v.name]}</span>}
                      </div>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        {v.options.map(opt => (
                          <button key={opt} className={`crown-len-btn${selectedVariants[v.name] === opt ? " active" : ""}`}
                            onClick={() => { setSelectedVariants(prev => ({ ...prev, [v.name]: opt })); setVariantError(false); }}
                            style={{ minWidth: 52, padding: "9px 14px", background: "none", border: `1px solid ${selectedVariants[v.name] === opt ? gold : border}`, color: selectedVariants[v.name] === opt ? goldLight : textMuted, fontFamily: "'Didact Gothic', sans-serif", fontSize: 12, cursor: "pointer", transition: "all 0.2s", background: selectedVariants[v.name] === opt ? "rgba(196,162,101,0.12)" : "none" }}>
                            {opt}
                          </button>
                        ))}
                      </div>
                      {variantError && !selectedVariants[v.name] && (
                        <div style={{ fontSize: 10, color: "#c46565", marginTop: 8, letterSpacing: "0.06em" }}>Please select a {v.name.toLowerCase()}</div>
                      )}
                    </div>
                  ))}

                  {/* Qty */}
                  <div style={{ marginBottom: 24 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: textMuted, marginBottom: 12 }}>Quantity</div>
                    <div style={{ display: "flex", alignItems: "center", border: `1px solid ${border}`, width: "fit-content" }}>
                      <button className="crown-qty-btn" onClick={() => setLocalQty(q => Math.max(1, q - 1))} style={{ width: 40, height: 40, background: "none", border: "none", color: cream, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>−</button>
                      <span style={{ width: 44, textAlign: "center", fontFamily: "'Cormorant Garant', serif", fontSize: 20, fontWeight: 300, color: cream, borderLeft: `1px solid ${border}`, borderRight: `1px solid ${border}`, lineHeight: "40px" }}>{localQty}</span>
                      <button className="crown-qty-btn" onClick={() => setLocalQty(q => q + 1)} style={{ width: 40, height: 40, background: "none", border: "none", color: cream, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "all 0.2s" }}>+</button>
                    </div>
                  </div>

                  {/* Add to cart */}
                  <button className="crown-add-btn" onClick={handleAddToCart}
                    style={{ width: "100%", padding: 18, background: gold, color: bgDeep, border: "none", fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", cursor: "pointer", marginBottom: 12, transition: "all 0.3s" }}>
                    Add to Cart
                  </button>
                  <button onClick={() => { handleAddToCart(); if (!variantError) { setCartOpen(false); setCheckoutOpen(true); }}}
                    style={{ width: "100%", padding: 15, background: "none", color: textSecondary, border: `1px solid ${border}`, fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.3s" }}>
                    Buy Now
                  </button>

                  {/* Trust */}
                  <div style={{ marginTop: 24, paddingTop: 24, borderTop: `1px solid ${border}`, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[["◆", "100% Human Hair"], ["🚚", "48hr Dispatch"], ["↩", "14-Day Returns"], ["💬", "WhatsApp Support"]].map(([icon, text]) => (
                      <div key={text} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, color: gold, opacity: 0.6 }}>{icon}</span>
                        <span style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: textMuted }}>{text}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          );
        })()}

        {/* ════════════════════════════════════
            CART DRAWER
        ════════════════════════════════════ */}
        {cartOpen && (
          <>
            <div onClick={() => setCartOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", backdropFilter: "blur(4px)", zIndex: 500 }} />
            <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 420, maxWidth: "100vw", background: bgElevated, border: `1px solid ${border}`, zIndex: 501, display: "flex", flexDirection: "column", animation: "slideIn 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
              {/* Header */}
              <div style={{ padding: "24px 32px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.14em", textTransform: "uppercase", color: cream }}>Your Cart</div>
                <button onClick={() => setCartOpen(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 20, transition: "color 0.2s" }}>✕</button>
              </div>

              {/* Body */}
              <div style={{ flex: 1, overflowY: "auto", padding: "16px 32px", scrollbarWidth: "thin" }}>
                {cart.length === 0 ? (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 14, textAlign: "center" }}>
                    <div style={{ fontSize: 40, opacity: 0.15 }}>◆</div>
                    <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 22, fontWeight: 300, color: textMuted }}>Your cart is empty</div>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, opacity: 0.5 }}>Add something beautiful</div>
                    <button onClick={() => setCartOpen(false)} style={{ marginTop: 16, padding: "12px 28px", background: "none", border: `1px solid ${border}`, color: gold, fontFamily: "'Didact Gothic', sans-serif", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>Continue Shopping</button>
                  </div>
                ) : cart.map((item, idx) => {
                  const varText = Object.entries(item.selectedVariants).map(([k, v]) => `${k}: ${v}`).join(", ");
                  const img = [item.product.image_url, ...(item.product.images || [])].filter(Boolean)[0];
                  return (
                    <div key={idx} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 14, alignItems: "center", padding: "16px 0", borderBottom: `1px solid ${border}` }}>
                      <div style={{ width: 64, height: 80, overflow: "hidden", background: bgCard, flexShrink: 0 }}>
                        {img ? <img src={img} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /> : <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: textMuted }}>◆</div>}
                      </div>
                      <div>
                        <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 16, fontWeight: 300, color: cream, marginBottom: 3 }}>{item.product.name}</div>
                        {varText && <div style={{ fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: 10 }}>{varText}</div>}
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          <button onClick={() => changeQty(idx, -1)} style={{ width: 24, height: 24, border: `1px solid ${border}`, background: "none", color: cream, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>−</button>
                          <span style={{ fontSize: 13, color: cream, minWidth: 16, textAlign: "center" }}>{item.qty}</span>
                          <button onClick={() => changeQty(idx, 1)} style={{ width: 24, height: 24, border: `1px solid ${border}`, background: "none", color: cream, cursor: "pointer", fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>+</button>
                        </div>
                      </div>
                      <div style={{ textAlign: "right" }}>
                        <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 17, fontWeight: 300, color: goldLight, marginBottom: 4 }}>{fmt(item.product.price * item.qty)}</div>
                        <button onClick={() => removeFromCart(idx)} style={{ fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: textMuted, background: "none", border: "none", cursor: "pointer" }}>Remove</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              {cart.length > 0 && (
                <div style={{ padding: "20px 32px", borderTop: `1px solid ${border}` }}>
                  {/* Free shipping bar */}
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted, marginBottom: 7 }}>
                      {freeShipRemaining === 0 ? "🎉 Free shipping unlocked!" : <>Add <span style={{ color: goldLight }}>{fmt(freeShipRemaining)}</span> for free shipping</>}
                    </div>
                    <div style={{ height: 2, background: border, borderRadius: 1 }}>
                      <div style={{ height: "100%", width: `${freeShipPct}%`, background: gold, borderRadius: 1, transition: "width 0.5s ease" }} />
                    </div>
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                    <span style={{ fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", color: textMuted }}>Subtotal</span>
                    <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 24, fontWeight: 300, color: cream }}>{fmt(cartTotal)}</span>
                  </div>
                  <button onClick={() => { setCartOpen(false); setCheckoutOpen(true); setCheckoutStep(1); }}
                    style={{ width: "100%", padding: 17, background: gold, color: bgDeep, border: "none", fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer", marginBottom: 10, transition: "background 0.3s" }}>
                    Checkout →
                  </button>
                  <button onClick={orderViaWhatsApp}
                    style={{ width: "100%", padding: 14, background: "none", color: textSecondary, border: `1px solid ${border}`, fontFamily: "'Didact Gothic', sans-serif", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="#25d366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                    Order via WhatsApp
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* ════════════════════════════════════
            CHECKOUT OVERLAY
        ════════════════════════════════════ */}
        {checkoutOpen && (
          <>
            <div onClick={() => { if (checkoutStep < 3) setCheckoutOpen(false); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.75)", backdropFilter: "blur(8px)", zIndex: 600 }} />
            <div style={{
              position: "fixed", top: 0, right: 0, bottom: 0,
              width: "min(680px, 100vw)", background: bgElevated,
              border: `1px solid ${border}`, zIndex: 601,
              display: "flex", flexDirection: "column",
              animation: "slideIn 0.4s cubic-bezier(0.16,1,0.3,1)",
            }}>
              {/* Checkout header */}
              <div style={{ padding: "22px 32px", borderBottom: `1px solid ${border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.1em", textTransform: "uppercase", color: cream }}>
                  {checkoutStep === 3 ? "Order Confirmed" : "Checkout"}
                </div>
                {checkoutStep < 3 && (
                  <button onClick={() => setCheckoutOpen(false)} style={{ background: "none", border: "none", color: textMuted, cursor: "pointer", fontSize: 20 }}>✕</button>
                )}
              </div>

              {/* Step indicators */}
              {checkoutStep < 3 && (
                <div style={{ padding: "16px 32px", display: "flex", alignItems: "center", gap: 0, borderBottom: `1px solid ${border}`, flexShrink: 0 }}>
                  {["Details", "Payment", "Confirm"].map((step, i) => (
                    <>
                      <div key={step} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: "50%", border: `1px solid ${checkoutStep > i + 1 ? gold : checkoutStep === i + 1 ? cream : border}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, color: checkoutStep > i + 1 ? gold : checkoutStep === i + 1 ? cream : textMuted, background: checkoutStep > i + 1 ? "rgba(196,162,101,0.1)" : "none", transition: "all 0.3s" }}>{checkoutStep > i + 1 ? "✓" : i + 1}</div>
                        <span style={{ fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: checkoutStep === i + 1 ? cream : textMuted }}>{step}</span>
                      </div>
                      {i < 2 && <div style={{ flex: 1, height: 1, background: checkoutStep > i + 1 ? "rgba(196,162,101,0.3)" : border, margin: "0 12px", transition: "background 0.3s" }} />}
                    </>
                  ))}
                </div>
              )}

              {/* Scrollable content */}
              <div style={{ flex: 1, overflowY: "auto", padding: "28px 32px" }}>

                {/* ── STEP 1: DETAILS ── */}
                {checkoutStep === 1 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: gold, marginBottom: 8 }}>Contact & Delivery</div>

                    {[
                      { label: "First Name *", key: "firstName", placeholder: "Your first name", half: true },
                      { label: "Last Name *", key: "lastName", placeholder: "Your last name", half: true },
                      { label: "Email Address *", key: "email", placeholder: "your@email.com", type: "email" },
                      { label: "Phone Number *", key: "phone", placeholder: "0XX XXX XXXX", type: "tel" },
                      { label: "Street Address *", key: "address", placeholder: "123 Main Street" },
                      { label: "Suburb", key: "suburb", placeholder: "Suburb", half: true },
                      { label: "City *", key: "city", placeholder: "City", half: true },
                      { label: "Postal Code *", key: "postalCode", placeholder: "0000", half: true },
                    ].map(field => (
                      <div key={field.key}>
                        <label style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: formErrors[field.key] ? "#c46565" : textMuted, display: "block", marginBottom: 7 }}>{field.label}</label>
                        <input type={field.type || "text"} value={(form as any)[field.key]} placeholder={field.placeholder}
                          onChange={e => setForm(f => ({ ...f, [field.key]: e.target.value }))}
                          style={{ width: "100%", background: "rgba(30,28,26,0.8)", border: `1px solid ${formErrors[field.key] ? "#c46565" : border}`, color: cream, fontFamily: "'Didact Gothic', sans-serif", fontSize: 14, padding: "12px 14px", outline: "none", transition: "border-color 0.3s", borderRadius: 0 }} />
                        {formErrors[field.key] && <div style={{ fontSize: 10, color: "#c46565", marginTop: 4, letterSpacing: "0.04em" }}>{formErrors[field.key]}</div>}
                      </div>
                    ))}

                    {/* Province */}
                    <div>
                      <label style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: formErrors.province ? "#c46565" : textMuted, display: "block", marginBottom: 7 }}>Province *</label>
                      <select value={form.province} onChange={e => setForm(f => ({ ...f, province: e.target.value }))}
                        style={{ width: "100%", background: "rgba(30,28,26,0.8)", border: `1px solid ${formErrors.province ? "#c46565" : border}`, color: cream, fontFamily: "'Didact Gothic', sans-serif", fontSize: 14, padding: "12px 14px", outline: "none", borderRadius: 0, WebkitAppearance: "none" }}>
                        <option value="">Select province</option>
                        {["Gauteng", "Western Cape", "KwaZulu-Natal", "Eastern Cape", "Limpopo", "Mpumalanga", "North West", "Free State", "Northern Cape"].map(p => (
                          <option key={p} value={p} style={{ background: bgCard }}>{p}</option>
                        ))}
                      </select>
                    </div>

                    {/* Shipping method */}
                    <div>
                      <div style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: textMuted, marginBottom: 12 }}>Shipping Method</div>
                      {[{ label: "Standard Delivery", eta: "3–5 business days", price: 80 }, { label: "Express Delivery", eta: "1–2 business days", price: 150 }].map(opt => (
                        <div key={opt.label} onClick={() => setShippingCost(cartTotal >= FREE_SHIP ? 0 : opt.price)}
                          style={{ display: "flex", alignItems: "center", justifyContent: "space-between", border: `1px solid ${shippingCost === opt.price || cartTotal >= FREE_SHIP ? gold : border}`, padding: "14px 16px", marginBottom: 8, cursor: "pointer", background: shippingCost === opt.price ? "rgba(196,162,101,0.06)" : "none", transition: "all 0.2s" }}>
                          <div>
                            <div style={{ fontSize: 13, color: cream, marginBottom: 2 }}>{opt.label}</div>
                            <div style={{ fontSize: 10, letterSpacing: "0.06em", color: textMuted, textTransform: "uppercase" }}>{opt.eta}</div>
                          </div>
                          <div style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 18, fontWeight: 300, color: cartTotal >= FREE_SHIP ? "#65a865" : goldLight }}>
                            {cartTotal >= FREE_SHIP ? "Free" : `R${opt.price}`}
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Notes */}
                    <div>
                      <label style={{ fontSize: 9, letterSpacing: "0.2em", textTransform: "uppercase", color: textMuted, display: "block", marginBottom: 7 }}>Order Notes (optional)</label>
                      <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={3} placeholder="Special instructions..."
                        style={{ width: "100%", background: "rgba(30,28,26,0.8)", border: `1px solid ${border}`, color: cream, fontFamily: "'Didact Gothic', sans-serif", fontSize: 13, padding: "12px 14px", outline: "none", resize: "vertical", borderRadius: 0, lineHeight: 1.7 }} />
                    </div>

                    <button onClick={() => { if (validateForm()) setCheckoutStep(2); }}
                      style={{ width: "100%", padding: 17, background: gold, color: bgDeep, border: "none", fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", cursor: "pointer", marginTop: 8, transition: "background 0.3s" }}>
                      Continue to Payment →
                    </button>
                  </div>
                )}

                {/* ── STEP 2: PAYMENT ── */}
                {checkoutStep === 2 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    <div style={{ fontSize: 9, letterSpacing: "0.22em", textTransform: "uppercase", color: gold, marginBottom: 4 }}>Payment Method</div>

                    {/* Payment toggle */}
                    <div style={{ display: "flex", gap: 10 }}>
                      {[{ key: "payfast", label: "Card (PayFast)" }, { key: "whatsapp", label: "WhatsApp Order" }, { key: "eft", label: "EFT / Bank Transfer" }].map(pm => (
                        <button key={pm.key} onClick={() => setForm(f => ({ ...f, paymentMethod: pm.key }))}
                          style={{ flex: 1, padding: "12px 8px", background: "none", border: `1px solid ${form.paymentMethod === pm.key ? gold : border}`, color: form.paymentMethod === pm.key ? cream : textMuted, fontFamily: "'Didact Gothic', sans-serif", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", transition: "all 0.2s", textAlign: "center" }}>
                          {pm.label}
                        </button>
                      ))}
                    </div>

                    {/* PayFast info */}
                    {form.paymentMethod === "payfast" && (
                      <div style={{ background: "rgba(196,162,101,0.05)", border: `1px solid ${border}`, padding: 20 }}>
                        <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.8, marginBottom: 12 }}>You'll be securely redirected to PayFast to complete your card payment. All major SA cards accepted.</div>
                        <div style={{ display: "flex", gap: 8 }}>
                          {["PayFast", "SSL 256-bit", "PCI DSS"].map(b => (
                            <span key={b} style={{ background: bgCard, border: `1px solid ${border}`, padding: "3px 10px", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>{b}</span>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* WhatsApp info */}
                    {form.paymentMethod === "whatsapp" && (
                      <div style={{ background: "rgba(37,211,102,0.04)", border: "1px solid rgba(37,211,102,0.15)", padding: 20 }}>
                        <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.8 }}>Your order details will be sent to {s.store_name} via WhatsApp. Payment arrangements will be made directly with the seller.</div>
                      </div>
                    )}

                    {/* EFT info */}
                    {form.paymentMethod === "eft" && (
                      <div style={{ background: "rgba(196,162,101,0.04)", border: `1px solid ${border}`, padding: 20 }}>
                        <div style={{ fontSize: 12, color: textSecondary, lineHeight: 1.8, marginBottom: 14 }}>Transfer to the account below and use your order number as reference.</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                          {[["Bank", "FNB"], ["Account Name", s.store_name], ["Branch Code", "250655"], ["Account Type", "Cheque"]].map(([k, v]) => (
                            <div key={k} style={{ display: "flex", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", color: textMuted }}>{k}</span>
                              <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 16, fontWeight: 300, color: cream }}>{v}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Order summary */}
                    <div style={{ background: bgCard, border: `1px solid ${border}`, padding: 20 }}>
                      <div style={{ fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: gold, marginBottom: 16 }}>Order Summary</div>
                      {cart.map((item, i) => {
                        const varText = Object.values(item.selectedVariants).join(", ");
                        return (
                          <div key={i} style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                            <span style={{ fontSize: 13, color: textSecondary }}>{item.product.name} {varText && `(${varText})`} × {item.qty}</span>
                            <span style={{ fontSize: 13, color: cream }}>{fmt(item.product.price * item.qty)}</span>
                          </div>
                        );
                      })}
                      <div style={{ borderTop: `1px solid ${border}`, marginTop: 12, paddingTop: 12 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                          <span style={{ fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", color: textMuted }}>Shipping</span>
                          <span style={{ fontSize: 13, color: cartTotal >= FREE_SHIP ? "#65a865" : cream }}>{cartTotal >= FREE_SHIP ? "Free" : fmt(shippingCost)}</span>
                        </div>
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
                          <span style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: cream }}>Total</span>
                          <span style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 24, fontWeight: 300, color: goldLight }}>{fmt(grandTotal)}</span>
                        </div>
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 10 }}>
                      <button onClick={() => setCheckoutStep(1)} style={{ flex: 1, padding: 15, background: "none", color: textSecondary, border: `1px solid ${border}`, fontFamily: "'Didact Gothic', sans-serif", fontSize: 10, letterSpacing: "0.14em", textTransform: "uppercase", cursor: "pointer" }}>← Back</button>
                      <button onClick={handleCheckout} disabled={submitting}
                        style={{ flex: 2, padding: 17, background: gold, color: bgDeep, border: "none", fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", cursor: submitting ? "not-allowed" : "pointer", opacity: submitting ? 0.7 : 1, transition: "all 0.3s" }}>
                        {submitting ? "Processing..." : form.paymentMethod === "whatsapp" ? "Send WhatsApp Order" : form.paymentMethod === "payfast" ? "Pay with PayFast →" : "Place EFT Order →"}
                      </button>
                    </div>
                  </div>
                )}

                {/* ── STEP 3: SUCCESS ── */}
                {checkoutStep === 3 && (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 400, textAlign: "center", gap: 16, animation: "fadeUp 0.6s ease" }}>
                    <div style={{ width: 64, height: 64, borderRadius: "50%", border: "1px solid rgba(101,168,101,0.3)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, background: "rgba(101,168,101,0.08)", color: "#65a865" }}>✓</div>
                    <h2 style={{ fontFamily: "'Cormorant Garant', serif", fontSize: 40, fontWeight: 300, color: cream, lineHeight: 1 }}>
                      Order <em style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic", color: goldLight }}>confirmed</em>
                    </h2>
                    <p style={{ fontSize: 13, lineHeight: 1.9, color: textSecondary, maxWidth: 340 }}>
                      Thank you! A confirmation has been sent to <strong style={{ color: cream }}>{form.email}</strong>. We'll WhatsApp your tracking number once dispatched.
                    </p>
                    <div style={{ fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: textMuted }}>
                      Order ref: <span style={{ color: gold }}>CROWN-{Math.floor(10000 + Math.random() * 90000)}</span>
                    </div>
                    <button onClick={() => { setCheckoutOpen(false); setCart([]); setCheckoutStep(1); }}
                      style={{ marginTop: 16, padding: "14px 36px", background: gold, color: bgDeep, border: "none", fontFamily: "'Didact Gothic', sans-serif", fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", cursor: "pointer" }}>
                      Continue Shopping
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

      </div>
    </>
  );
}
