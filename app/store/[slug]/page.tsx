"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabase";
import { useParams } from "next/navigation";

interface Seller {
  id: string;
  store_name: string;
  whatsapp_number: string;
  subdomain: string;
  template: string;
  primary_color: string;
  logo_url: string;
  banner_url: string;
  tagline: string;
  description: string;
  collections: string[];
  social_links: { whatsapp?: string; instagram?: string; tiktok?: string; facebook?: string; twitter?: string };
  store_config: { show_banner_text: boolean; show_marquee: boolean; show_collections: boolean; show_about: boolean; show_trust_bar: boolean; show_policies: boolean; show_newsletter: boolean; announcement: string };
}

interface Variant { name: string; options: string[]; }

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
  description: string;
}

interface CartItem {
  product: Product;
  qty: number;
  selectedVariants: { [key: string]: string };
}

interface Theme {
  bg: string;
  card: string;
  text: string;
  textSoft: string;
  border: string;
  accent: string;
  headerBg: string;
  modalBg: string;
  inputBg: string;
  badgeBg: string;
  footerBg: string;
  isDark: boolean;
  radius: number;
}

function getTheme(template: string, color: string): Theme {
  switch (template) {
    case "warm-earthy":
      return { bg: "#faf6f1", card: "#ffffff", text: "#3d2e22", textSoft: "#8a7565", border: "#e8ddd0", accent: color || "#c4704b", headerBg: "rgba(250,246,241,0.92)", modalBg: "#ffffff", inputBg: "#f5ede4", badgeBg: "#f5ede4", footerBg: "#f5ede4", isDark: false, radius: 14 };
    case "soft-luxury":
      return { bg: "#f8f5f2", card: "#ffffff", text: "#2d2d3a", textSoft: "#8a8a9a", border: "#e6e2de", accent: color || "#9c8e7c", headerBg: "rgba(248,245,242,0.92)", modalBg: "#ffffff", inputBg: "#f0ece8", badgeBg: "#f0ece8", footerBg: "#f0ece8", isDark: false, radius: 20 };
    case "glass-futuristic":
      return { bg: "#0a0a12", card: "rgba(255,255,255,0.04)", text: "#eeeef2", textSoft: "rgba(238,238,242,0.5)", border: "rgba(255,255,255,0.08)", accent: color || "#00d4aa", headerBg: "rgba(10,10,18,0.85)", modalBg: "#13131d", inputBg: "rgba(255,255,255,0.06)", badgeBg: "rgba(255,255,255,0.06)", footerBg: "rgba(255,255,255,0.02)", isDark: true, radius: 16 };
    default: // clean-minimal
      return { bg: "#fafafa", card: "#ffffff", text: "#111111", textSoft: "#888888", border: "#eeeeee", accent: color || "#111111", headerBg: "rgba(250,250,250,0.92)", modalBg: "#ffffff", inputBg: "#f5f5f5", badgeBg: "#f5f5f5", footerBg: "#f5f5f5", isDark: false, radius: 16 };
  }
}

export default function StorePage() {
  const params = useParams();
  const slug = params.slug as string;

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

  useEffect(() => { loadStore(); }, [slug]);

  const loadStore = async () => {
    const { data: sellerData } = await supabase.from("sellers").select("*").eq("subdomain", slug).single();
    if (!sellerData) { setNotFound(true); setLoading(false); return; }
    setSeller(sellerData);
    const { data: productData } = await supabase.from("products").select("*").eq("seller_id", sellerData.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true });
    if (productData) setProducts(productData);
    setLoading(false);
  };

  const t = getTheme(seller?.template || "clean-minimal", seller?.primary_color || "");
  const cfg = seller?.store_config || { show_banner_text: true, show_marquee: true, show_collections: true, show_about: true, show_trust_bar: true, show_policies: true, show_newsletter: false, announcement: "" };
  const social = seller?.social_links || {};
  const categories = ["All", ...(seller?.collections || []).filter((c) => products.some((p) => p.category === c))];
  const filteredProducts = activeCategory === "All" ? products : products.filter((p) => p.category === activeCategory);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setActiveImageIndex(0);
    const defaults: { [key: string]: string } = {};
    (product.variants || []).forEach((v) => { if (v.options.length > 0) defaults[v.name] = v.options[0]; });
    setSelectedVariants(defaults);
  };

  const closeProduct = () => { setSelectedProduct(null); setSelectedVariants({}); };

  const addToCart = (product: Product) => {
    const key = JSON.stringify(selectedVariants);
    const idx = cart.findIndex((item) => item.product.id === product.id && JSON.stringify(item.selectedVariants) === key);
    if (idx >= 0) { const u = [...cart]; u[idx].qty += 1; setCart(u); }
    else setCart([...cart, { product, qty: 1, selectedVariants: { ...selectedVariants } }]);
    closeProduct();
    setShowCart(true);
  };

  const removeFromCart = (i: number) => setCart(cart.filter((_, idx) => idx !== i));
  const updateQty = (i: number, d: number) => { const u = [...cart]; u[i].qty += d; if (u[i].qty < 1) u[i].qty = 1; setCart(u); };
  const cartTotal = cart.reduce((s, item) => s + item.product.price * item.qty, 0);
  const cartCount = cart.reduce((s, item) => s + item.qty, 0);

  const checkoutWhatsApp = () => {
    if (!seller?.whatsapp_number) return;
    let msg = "Hi! I'd like to order:\n\n";
    cart.forEach((item) => {
      msg += "- " + item.product.name;
      const v = Object.entries(item.selectedVariants);
      if (v.length > 0) msg += " (" + v.map(([k, val]) => k + ": " + val).join(", ") + ")";
      msg += " x" + item.qty + " - R" + (item.product.price * item.qty) + "\n";
    });
    msg += "\nTotal: R" + cartTotal;
    let phone = seller.whatsapp_number.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "27" + phone.substring(1);
    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(msg), "_blank");
  };

  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif", background: "#fafafa" }}>
      <p style={{ color: "#999", fontSize: 15 }}>Loading store...</p>
    </div>
  );

  if (notFound) return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      <h1 style={{ fontSize: 48, fontWeight: 300, color: "#222", marginBottom: 8 }}>404</h1>
      <p style={{ color: "#999", fontSize: 15 }}>This store does not exist.</p>
    </div>
  );

  return (
    <div style={{ minHeight: "100vh", background: t.bg, fontFamily: "'Plus Jakarta Sans', sans-serif", color: t.text }}>

      {/* ANNOUNCEMENT BAR */}
      {cfg.announcement && (
        <div style={{ background: t.accent, color: t.isDark ? "#050505" : "#fff", textAlign: "center" as const, padding: "10px 20px", fontSize: 11, fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase" as const }}>{cfg.announcement}</div>
      )}

      {/* HEADER */}
      <header style={{ position: "sticky", top: 0, background: t.headerBg, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", borderBottom: "1px solid " + t.border, zIndex: 100, padding: "0 24px" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 68 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            {seller?.logo_url && (
              <img src={seller.logo_url} alt="Logo" style={{ width: 38, height: 38, borderRadius: 10, objectFit: "cover" }} />
            )}
            <h1 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: t.text }}>{seller?.store_name}</h1>
          </div>
          <button onClick={() => setShowCart(true)} style={{ padding: "10px 22px", background: t.accent, color: t.isDark ? "#06060b" : "#fff", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
            Bag {cartCount > 0 && <span style={{ background: t.isDark ? "rgba(0,0,0,0.3)" : "rgba(255,255,255,0.3)", width: 22, height: 22, borderRadius: "50%", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}
          </button>
        </div>
      </header>

      {/* HERO / BANNER */}
      <section style={{ position: "relative", overflow: "hidden" }}>
        {seller?.banner_url ? (
          <div style={{ position: "relative", height: 320, overflow: "hidden" }}>
            <img src={seller.banner_url} alt="Banner" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            {cfg.show_banner_text && (
              <div style={{ position: "absolute", inset: 0, background: t.isDark ? "rgba(0,0,0,0.55)" : "rgba(0,0,0,0.3)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", padding: "0 24px" }}>
                <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 44, fontWeight: 700, letterSpacing: "-0.04em", color: "#fff", marginBottom: 12 }}>{seller?.store_name}</h2>
                {seller?.tagline && <p style={{ fontSize: 16, color: "rgba(255,255,255,0.85)", fontWeight: 400, letterSpacing: "0.03em" }}>{seller.tagline}</p>}
              </div>
            )}
          </div>
        ) : (
          <div style={{ textAlign: "center", padding: "60px 24px 40px", maxWidth: 600, margin: "0 auto" }}>
            <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 42, fontWeight: 700, letterSpacing: "-0.04em", color: t.text, marginBottom: 12 }}>{seller?.store_name}</h2>
            {seller?.tagline ? (
              <p style={{ fontSize: 15, color: t.textSoft, fontWeight: 400, letterSpacing: "0.05em", textTransform: "uppercase" }}>{seller.tagline}</p>
            ) : (
              <p style={{ fontSize: 15, color: t.textSoft, fontWeight: 400, letterSpacing: "0.05em", textTransform: "uppercase" }}>Curated collection</p>
            )}
          </div>
        )}
      </section>

      {/* ABOUT (if enabled and description exists) */}
      {cfg.show_about && seller?.description && (
        <div style={{ maxWidth: 700, margin: "0 auto", padding: "32px 24px 0", textAlign: "center" }}>
          <p style={{ fontSize: 15, lineHeight: 1.8, color: t.textSoft }}>{seller.description}</p>
        </div>
      )}

      {/* CATEGORIES */}
      {categories.length > 2 && (
        <div style={{ display: "flex", justifyContent: "center", gap: 8, padding: "32px 24px 24px", flexWrap: "wrap" }}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                padding: "8px 22px",
                background: activeCategory === cat ? t.accent : "transparent",
                color: activeCategory === cat ? (t.isDark ? "#06060b" : "#fff") : t.textSoft,
                border: activeCategory === cat ? "1px solid " + t.accent : "1px solid " + t.border,
                borderRadius: 100,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                fontSize: 13,
                fontWeight: 500,
                cursor: "pointer",
                transition: "all 0.2s",
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* PRODUCT GRID */}
      <section style={{ maxWidth: 1200, margin: "0 auto", padding: "16px 24px 60px" }}>
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: t.textSoft }}>
            <p style={{ fontSize: 18 }}>No products yet</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Check back soon!</p>
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))", gap: 24 }}>
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                onClick={() => openProduct(product)}
                style={{
                  cursor: "pointer",
                  background: t.card,
                  borderRadius: t.radius,
                  overflow: "hidden",
                  border: "1px solid " + t.border,
                  transition: "all 0.3s",
                }}
              >
                <div style={{ position: "relative", aspectRatio: "3/4", overflow: "hidden", background: t.inputBg }}>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} style={{ width: "100%", height: "100%", objectFit: "cover", transition: "transform 0.5s" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={t.textSoft} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                  )}
                  {product.old_price && (
                    <div style={{ position: "absolute", top: 12, left: 12, padding: "4px 12px", background: t.accent, color: t.isDark ? "#06060b" : "#fff", borderRadius: 100, fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em" }}>Sale</div>
                  )}
                </div>
                <div style={{ padding: "16px 18px 20px" }}>
                  <p style={{ fontSize: 15, fontWeight: 600, color: t.text, marginBottom: 4 }}>{product.name}</p>
                  {product.category && <p style={{ fontSize: 12, color: t.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{product.category}</p>}
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontSize: 16, fontWeight: 700, color: t.text }}>R{product.price}</span>
                    {product.old_price && <span style={{ fontSize: 14, color: t.textSoft, textDecoration: "line-through" }}>R{product.old_price}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* TRUST BAR */}
      {cfg.show_trust_bar && (
        <div style={{ maxWidth: 1200, margin: "0 auto", padding: "48px 24px", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, borderTop: "1px solid " + t.border, borderBottom: "1px solid " + t.border }}>
          {[{ i: "\u2605", t: "Premium Quality", d: "Carefully sourced" }, { i: "\u2708", t: "Fast Delivery", d: "Nationwide shipping" }, { i: "\u21BA", t: "Easy Returns", d: "14-day policy" }, { i: "\u26A1", t: "Secure Payment", d: "Card & WhatsApp" }].map((item, i) => (
            <div key={i} style={{ textAlign: "center" as const, padding: 16 }}>
              <div style={{ fontSize: 20, marginBottom: 8, color: t.accent }}>{item.i}</div>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 4 }}>{item.t}</div>
              <div style={{ fontSize: 11, color: t.textSoft }}>{item.d}</div>
            </div>
          ))}
        </div>
      )}

      {/* POLICIES */}
      {cfg.show_policies && (
        <section style={{ maxWidth: 900, margin: "0 auto", padding: "60px 24px", textAlign: "center" as const }}>
          <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 32 }}>Shipping & Policies</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20, textAlign: "left" as const }}>
            {[{ t: "Shipping", d: "Standard delivery 3-5 business days nationwide. Free shipping on qualifying orders." }, { t: "Returns", d: "Return unworn items within 14 days for a full refund. Items must be in original condition." }, { t: "Payment", d: "All major cards accepted. You can also checkout via WhatsApp for a personal experience." }].map((p, i) => (
              <div key={i} style={{ padding: 20, background: t.card, border: "1px solid " + t.border, borderRadius: t.radius }}>
                <h4 style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8, color: t.accent }}>{p.t}</h4>
                <p style={{ fontSize: 13, lineHeight: 1.7, color: t.textSoft }}>{p.d}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* FOOTER */}
      <footer style={{ padding: "48px 24px 32px", borderTop: "1px solid " + t.border, background: t.footerBg }}>
        <div style={{ maxWidth: 1200, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap" as const, gap: 32, marginBottom: 32 }}>
            <div style={{ maxWidth: 280 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 12 }}>
                {seller?.logo_url && <img src={seller.logo_url} alt="" style={{ width: 28, height: 28, borderRadius: 8, objectFit: "cover" }} />}
                <span style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, letterSpacing: "-0.02em" }}>{seller?.store_name}</span>
              </div>
              {seller?.description && <p style={{ fontSize: 13, color: t.textSoft, lineHeight: 1.6 }}>{seller.description.substring(0, 120)}{seller.description.length > 120 ? "..." : ""}</p>}
            </div>
            <div style={{ display: "flex", gap: 40, flexWrap: "wrap" as const }}>
              <div>
                <h5 style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 12, color: t.text }}>Shop</h5>
                <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                  <span style={{ fontSize: 13, color: t.textSoft, cursor: "pointer" }}>All Products</span>
                  {(seller?.collections || []).slice(0, 4).map((c) => <span key={c} style={{ fontSize: 13, color: t.textSoft, cursor: "pointer" }}>{c}</span>)}
                </div>
              </div>
              {(social.instagram || social.tiktok || social.facebook || social.twitter) && (
                <div>
                  <h5 style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 12, color: t.text }}>Connect</h5>
                  <div style={{ display: "flex", flexDirection: "column" as const, gap: 8 }}>
                    {social.instagram && <a href={social.instagram} target="_blank" style={{ fontSize: 13, color: t.textSoft, textDecoration: "none" }}>Instagram</a>}
                    {social.tiktok && <a href={social.tiktok} target="_blank" style={{ fontSize: 13, color: t.textSoft, textDecoration: "none" }}>TikTok</a>}
                    {social.facebook && <a href={social.facebook} target="_blank" style={{ fontSize: 13, color: t.textSoft, textDecoration: "none" }}>Facebook</a>}
                    {social.twitter && <a href={social.twitter} target="_blank" style={{ fontSize: 13, color: t.textSoft, textDecoration: "none" }}>X / Twitter</a>}
                  </div>
                </div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 24, borderTop: "1px solid " + t.border, flexWrap: "wrap" as const, gap: 12 }}>
            <p style={{ fontSize: 11, color: t.textSoft }}>&copy; {new Date().getFullYear()} {seller?.store_name}</p>
            <p style={{ fontSize: 10, color: t.textSoft, letterSpacing: "0.06em", textTransform: "uppercase" as const }}>Powered by <a href="/" style={{ color: t.accent, textDecoration: "none", fontWeight: 700 }}>CatalogStore</a></p>
          </div>
        </div>
      </footer>

      {/* PRODUCT MODAL */}
      {selectedProduct && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }} onClick={closeProduct}>
          <div style={{ background: t.modalBg, borderRadius: t.radius + 4, maxWidth: 900, width: "90%", maxHeight: "90vh", overflow: "auto", position: "relative", padding: 32 }} onClick={(e) => e.stopPropagation()}>
            <button onClick={closeProduct} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: t.inputBg, border: "none", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.text, zIndex: 10 }}>&#10005;</button>

            <div style={{ display: "flex", gap: 36 }}>
              <div style={{ flex: 1 }}>
                <div style={{ borderRadius: t.radius, overflow: "hidden", background: t.inputBg, aspectRatio: "3/4" }}>
                  {selectedProduct.images?.length > 0 ? (
                    <img src={selectedProduct.images[activeImageIndex]} alt={selectedProduct.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : selectedProduct.image_url ? (
                    <img src={selectedProduct.image_url} alt={selectedProduct.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  ) : (
                    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", minHeight: 300 }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke={t.textSoft} strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                  )}
                </div>
                {selectedProduct.images?.length > 1 && (
                  <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                    {selectedProduct.images.map((img, i) => (
                      <img key={i} src={img} alt={"View " + (i + 1)} onClick={() => setActiveImageIndex(i)} style={{ width: 64, height: 64, borderRadius: 10, objectFit: "cover", cursor: "pointer", border: activeImageIndex === i ? "2px solid " + t.accent : "2px solid transparent" }} />
                    ))}
                  </div>
                )}
              </div>

              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                {selectedProduct.category && <p style={{ fontSize: 12, color: t.textSoft, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 8 }}>{selectedProduct.category}</p>}
                <h2 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, color: t.text, letterSpacing: "-0.02em", marginBottom: 12 }}>{selectedProduct.name}</h2>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 20 }}>
                  <span style={{ fontSize: 24, fontWeight: 700, color: t.text }}>R{selectedProduct.price}</span>
                  {selectedProduct.old_price && <span style={{ fontSize: 18, color: t.textSoft, textDecoration: "line-through" }}>R{selectedProduct.old_price}</span>}
                </div>
                {selectedProduct.description && <p style={{ fontSize: 14, lineHeight: 1.7, color: t.textSoft, marginBottom: 24 }}>{selectedProduct.description}</p>}

                {selectedProduct.variants?.length > 0 && (
                  <div style={{ marginBottom: 24 }}>
                    {selectedProduct.variants.map((v) => (
                      <div key={v.name} style={{ marginBottom: 16 }}>
                        <p style={{ fontSize: 13, color: t.textSoft, marginBottom: 8 }}>{v.name}: <strong style={{ color: t.text }}>{selectedVariants[v.name] || ""}</strong></p>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          {v.options.map((opt) => (
                            <button key={opt} onClick={() => setSelectedVariants({ ...selectedVariants, [v.name]: opt })} style={{ padding: "10px 20px", border: selectedVariants[v.name] === opt ? "2px solid " + t.accent : "1px solid " + t.border, borderRadius: 10, background: t.card, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: selectedVariants[v.name] === opt ? 600 : 500, cursor: "pointer", color: t.text }}>
                              {opt}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button onClick={() => addToCart(selectedProduct)} style={{ padding: "16px 32px", background: t.accent, color: t.isDark ? "#06060b" : "#fff", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: "auto" }}>
                  Add to Bag &mdash; R{selectedProduct.price}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {showCart && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200 }} onClick={() => setShowCart(false)}>
          <div style={{ position: "fixed", top: 0, right: 0, bottom: 0, width: 400, maxWidth: "90vw", background: t.modalBg, zIndex: 210, display: "flex", flexDirection: "column", boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid " + t.border }}>
              <h3 style={{ fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 700, color: t.text }}>Your Bag ({cartCount})</h3>
              <button onClick={() => setShowCart(false)} style={{ width: 36, height: 36, borderRadius: "50%", background: t.inputBg, border: "none", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.text }}>&#10005;</button>
            </div>

            {cart.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: t.textSoft, fontSize: 15 }}>Your bag is empty</p>
              </div>
            ) : (
              <>
                <div style={{ flex: 1, overflow: "auto", padding: "16px 24px" }}>
                  {cart.map((item, index) => (
                    <div key={index} style={{ display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid " + t.border }}>
                      {item.product.image_url && <img src={item.product.image_url} alt={item.product.name} style={{ width: 72, height: 72, borderRadius: 10, objectFit: "cover" }} />}
                      <div style={{ flex: 1 }}>
                        <p style={{ fontSize: 14, fontWeight: 600, color: t.text, marginBottom: 2 }}>{item.product.name}</p>
                        {Object.keys(item.selectedVariants).length > 0 && <p style={{ fontSize: 12, color: t.textSoft, marginBottom: 4 }}>{Object.entries(item.selectedVariants).map(([k, v]) => k + ": " + v).join(", ")}</p>}
                        <p style={{ fontSize: 15, fontWeight: 700, color: t.text, marginBottom: 8 }}>R{item.product.price}</p>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <button onClick={() => updateQty(index, -1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid " + t.border, background: t.card, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.text }}>-</button>
                          <span style={{ fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: "center", color: t.text }}>{item.qty}</span>
                          <button onClick={() => updateQty(index, 1)} style={{ width: 28, height: 28, borderRadius: "50%", border: "1px solid " + t.border, background: t.card, fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: t.text }}>+</button>
                          <button onClick={() => removeFromCart(index)} style={{ marginLeft: "auto", padding: "4px 0", background: "transparent", border: "none", color: t.textSoft, fontSize: 12, cursor: "pointer", textDecoration: "underline" }}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: "20px 24px", borderTop: "1px solid " + t.border }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <span style={{ fontSize: 16, fontWeight: 600, color: t.text }}>Total</span>
                    <span style={{ fontSize: 20, fontWeight: 700, color: t.text }}>R{cartTotal}</span>
                  </div>
                  <button onClick={checkoutWhatsApp} style={{ width: "100%", padding: 16, background: "#25d366", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
                    Checkout via WhatsApp
                  </button>
                  <p style={{ textAlign: "center", fontSize: 12, color: t.textSoft, marginTop: 10 }}>You will be taken to WhatsApp to confirm your order</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* WHATSAPP FLOAT */}
      {seller?.whatsapp_number && (
        <a
          href={"https://wa.me/" + (seller.whatsapp_number.startsWith("0") ? "27" + seller.whatsapp_number.substring(1) : seller.whatsapp_number).replace(/\D/g, "")}
          target="_blank"
          style={{ position: "fixed", bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(37,211,102,0.3)", zIndex: 50 }}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#fff">
            <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/>
            <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2z"/>
          </svg>
        </a>
      )}
    </div>
  );
}
