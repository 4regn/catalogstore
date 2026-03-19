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
}

interface Variant { name: string; options: string[]; }
interface Product {
  id: string; name: string; price: number; old_price: number | null; category: string;
  image_url: string | null; images: string[]; variants: Variant[]; in_stock: boolean; description: string;
}

interface CartItem { product: Product; qty: number; selectedVariants: { [key: string]: string }; }

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
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => { loadStore(); }, [slug]);

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
  const accent = seller?.primary_color || "#9c7c62";
  const collections = seller?.collections || [];
  const marqueeTexts = cfg.marquee_texts?.length ? cfg.marquee_texts : [seller?.tagline || "Premium Collection", "Free Delivery Over R500", "Designed in South Africa"];
  const trustItems = cfg.trust_items?.length ? cfg.trust_items : [{ icon: "\u2605", title: "Premium Quality", desc: "Carefully sourced" }, { icon: "\u2708", title: "Fast Delivery", desc: "Nationwide shipping" }, { icon: "\u21BA", title: "Easy Returns", desc: "14-day policy" }, { icon: "\u26A1", title: "Secure Payment", desc: "Card & WhatsApp" }];
  const policyItems = cfg.policy_items?.length ? cfg.policy_items : [{ title: "Shipping", desc: "Standard delivery 3-5 business days nationwide. Free shipping on qualifying orders." }, { title: "Returns", desc: "Return unworn items within 14 days for a full refund. Items must be in original condition." }, { title: "Payment", desc: "All major cards accepted via Yoco. Also checkout through WhatsApp for a personal experience." }];
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

  if (loading) return <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Jost', sans-serif", background: "#f6f3ef" }}><p style={{ color: "#8a8690", fontSize: 15 }}>Loading store...</p></div>;
  if (notFound) return <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Jost', sans-serif", background: "#f6f3ef" }}><h1 style={{ fontSize: 48, fontWeight: 300, color: "#2a2a2e", marginBottom: 8 }}>404</h1><p style={{ color: "#8a8690" }}>This store does not exist.</p></div>;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;0,700;1,300;1,400&family=Jost:wght@300;400;500;600;700&display=swap');
        @keyframes mscroll{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @media(max-width:768px){.sl-cols-g{grid-template-columns:1fr!important}.sl-pgrid{grid-template-columns:repeat(2,1fr)!important}.sl-story{grid-template-columns:1fr!important}.sl-trust{grid-template-columns:repeat(2,1fr)!important}.sl-polg{grid-template-columns:1fr!important}.sl-fttop{grid-template-columns:1fr!important}.sl-hero{height:70vh!important;min-height:400px!important}.sl-hnav{display:none!important}.sl-modal{flex-direction:column!important}}
      `}</style>
      <div style={{ minHeight: "100vh", background: "#f6f3ef", fontFamily: "'Jost', sans-serif", color: "#2a2a2e" }}>

        {/* ANNOUNCEMENT */}
        {cfg.announcement && <div style={{ background: "#2a2a2e", color: "#f6f3ef", textAlign: "center", padding: "10px 20px", fontSize: 11, fontWeight: 500, letterSpacing: "0.15em", textTransform: "uppercase" }}>{cfg.announcement}</div>}

        {/* HEADER */}
        <header style={{ position: "sticky", top: 0, zIndex: 100, background: "rgba(246,243,239,0.92)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
          <div style={{ maxWidth: 1340, margin: "0 auto", padding: "0 32px", display: "grid", gridTemplateColumns: "1fr auto 1fr", alignItems: "center", height: 72 }}>
            <div className="sl-hnav" style={{ display: "flex", gap: 32 }}>
              <span style={{ color: "#8a8690", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Shop All</span>
              {cats.length > 2 && <span style={{ color: "#8a8690", fontSize: 13, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>Collections</span>}
            </div>
            <div style={{ textAlign: "center" }}>
              {seller?.logo_url ? (
                <img src={seller.logo_url} alt={seller.store_name} style={{ height: 44, maxWidth: 160, objectFit: "contain" }} />
              ) : (
                <div>
                  <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 300, letterSpacing: "0.08em", textTransform: "uppercase" }}>{seller?.store_name}</div>
                  {seller?.tagline && <div style={{ fontSize: 9, letterSpacing: "0.2em", color: "#b5b1ac", textTransform: "uppercase", marginTop: -2 }}>{seller.tagline}</div>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 24 }}>
              <button onClick={() => setShowSearch(true)} style={{ background: "none", border: "none", color: "#8a8690", fontSize: 13, letterSpacing: "0.04em", cursor: "pointer", fontFamily: "'Jost', sans-serif" }}>Search</button>
              <button onClick={() => setShowCart(true)} style={{ background: "none", border: "none", color: "#8a8690", fontSize: 13, cursor: "pointer", fontFamily: "'Jost', sans-serif", display: "flex", alignItems: "center", gap: 6 }}>Bag {cartCount > 0 && <span style={{ width: 18, height: 18, borderRadius: "50%", background: accent, color: "#fff", fontSize: 9, fontWeight: 600, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>{cartCount}</span>}</button>
            </div>
          </div>
        </header>

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
        <section className="sl-hero" style={{ position: "relative", height: seller?.banner_url ? "92vh" : "auto", minHeight: seller?.banner_url ? 500 : "auto", overflow: "hidden" }}>
          {seller?.banner_url ? (
            <>
              <img src={seller.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", filter: "brightness(0.85)" }} />
              {cfg.show_banner_text && (
                <div style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(42,42,46,0) 30%, rgba(42,42,46,0.4) 100%)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "0 40px 80px", textAlign: "center" }}>
                  {seller?.tagline && <div style={{ fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(255,255,255,0.7)", marginBottom: 16 }}>{seller.tagline}</div>}
                  <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 6vw, 72px)", fontWeight: 300, color: "#fff", letterSpacing: "0.04em", lineHeight: 1.1, marginBottom: 20 }}>{seller?.store_name}</h1>
                  <a href="#products" style={{ display: "inline-flex", padding: "16px 48px", background: "rgba(255,255,255,0.15)", backdropFilter: "blur(20px)", border: "1px solid rgba(255,255,255,0.3)", borderRadius: 100, color: "#fff", fontSize: 12, fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", textDecoration: "none" }}>Shop the Collection &rarr;</a>
                </div>
              )}
            </>
          ) : (
            <div style={{ textAlign: "center", padding: "80px 40px 60px" }}>
              <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 6vw, 64px)", fontWeight: 300, letterSpacing: "0.04em", marginBottom: 12 }}>{seller?.store_name}</h1>
              {seller?.tagline && <p style={{ fontSize: 14, color: "#8a8690", letterSpacing: "0.1em", textTransform: "uppercase" }}>{seller.tagline}</p>}
            </div>
          )}
        </section>

        {/* COLLECTIONS */}
        {cfg.show_collections && collections.length > 0 && (
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
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* PRODUCTS */}
        <section id="products" style={{ padding: "80px 32px", maxWidth: 1340, margin: "0 auto" }}>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 12, textAlign: "center" }}>The Collection</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px, 4vw, 44px)", fontWeight: 300, textAlign: "center", letterSpacing: "0.02em", marginBottom: 48 }}>All Products</h2>

          {cats.length > 2 && (
            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 48, flexWrap: "wrap" }}>
              {cats.map((cat) => (
                <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: "10px 28px", borderRadius: 100, background: activeCategory === cat ? "#2a2a2e" : "transparent", border: activeCategory === cat ? "1px solid #2a2a2e" : "1px solid rgba(0,0,0,0.06)", fontFamily: "'Jost', sans-serif", fontSize: 12, color: activeCategory === cat ? "#f6f3ef" : "#8a8690", cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase", transition: "all 0.3s" }}>{cat}</button>
              ))}
            </div>
          )}

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

        {/* ABOUT / BRAND STORY */}
        {cfg.show_about && seller?.description && (
          <section className="sl-story" style={{ padding: "100px 32px", maxWidth: 1340, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div style={{ aspectRatio: "4/5", borderRadius: 16, overflow: "hidden", background: "linear-gradient(145deg, #d4c5b5, #c0b0a0)" }}>
              {seller?.banner_url && <img src={seller.banner_url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} />}
            </div>
            <div>
              <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "#b5b1ac", marginBottom: 12 }}>Our Story</div>
              <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(28px, 3.5vw, 42px)", fontWeight: 300, letterSpacing: "0.02em", marginBottom: 24, lineHeight: 1.2 }}>About {seller?.store_name}</h2>
              <p style={{ fontSize: 15, lineHeight: 1.85, color: "#8a8690", fontWeight: 300, maxWidth: 440 }}>{seller.description}</p>
            </div>
          </section>
        )}

        {/* TRUST BAR */}
        {cfg.show_trust_bar && (
          <div className="sl-trust" style={{ padding: "60px 32px", maxWidth: 1340, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, borderTop: "1px solid rgba(0,0,0,0.06)", borderBottom: "1px solid rgba(0,0,0,0.06)" }}>
            {trustItems.map((item, i) => (
              <div key={i} style={{ textAlign: "center", padding: 20 }}>
                <div style={{ fontSize: 24, marginBottom: 12, color: accent }}>{item.icon}</div>
                <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>{item.title}</div>
                <div style={{ fontSize: 12, color: "#b5b1ac", fontWeight: 300 }}>{item.desc}</div>
              </div>
            ))}
          </div>
        )}

        {/* POLICIES */}
        {cfg.show_policies && (
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
        )}

        {/* FOOTER */}
        <footer style={{ background: "#2a2a2e", color: "#f6f3ef", padding: "60px 32px 40px" }}>
          <div style={{ maxWidth: 1340, margin: "0 auto" }}>
            <div className="sl-fttop" style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr", gap: 40, marginBottom: 48 }}>
              <div>
                <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 300, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 16 }}>{seller?.store_name}</div>
                {seller?.description && <p style={{ fontSize: 13, color: "rgba(246,243,239,0.5)", lineHeight: 1.7, fontWeight: 300, maxWidth: 280 }}>{seller.description.substring(0, 120)}{(seller.description.length > 120) ? "..." : ""}</p>}
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
                  {social.instagram && <a href={social.instagram} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>Instagram</a>}
                  {social.tiktok && <a href={social.tiktok} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>TikTok</a>}
                  {social.facebook && <a href={social.facebook} target="_blank" style={{ display: "block", fontSize: 13, color: "rgba(246,243,239,0.5)", marginBottom: 10, fontWeight: 300, textDecoration: "none" }}>Facebook</a>}
                </div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 32, borderTop: "1px solid rgba(246,243,239,0.1)", flexWrap: "wrap", gap: 12 }}>
              <p style={{ fontSize: 11, color: "rgba(246,243,239,0.3)" }}>&copy; {new Date().getFullYear()} {seller?.store_name}</p>
              <p style={{ fontSize: 10, color: "rgba(246,243,239,0.3)", letterSpacing: "0.08em", textTransform: "uppercase" }}>Powered by <a href="/" style={{ color: accent, textDecoration: "none", fontWeight: 500 }}>CatalogStore</a></p>
            </div>
          </div>
        </footer>

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
                              <button key={opt} onClick={() => setSelectedVariants({ ...selectedVariants, [v.name]: opt })} style={{ padding: "10px 20px", border: selectedVariants[v.name] === opt ? "2px solid #2a2a2e" : "1px solid rgba(0,0,0,0.1)", borderRadius: 10, background: "#fff", fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: selectedVariants[v.name] === opt ? 600 : 400, cursor: "pointer", color: "#2a2a2e" }}>{opt}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <button onClick={() => addToCart(selectedProduct)} style={{ padding: "18px 32px", background: "#2a2a2e", color: "#f6f3ef", border: "none", borderRadius: 100, fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer", width: "100%", marginTop: "auto" }}>Add to Bag &mdash; R{selectedProduct.price}</button>
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
                <h3 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 400 }}>Your Bag ({cartCount})</h3>
                <button onClick={() => setShowCart(false)} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#8a8690" }}>&times;</button>
              </div>
              {cart.length === 0 ? (
                <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}><p style={{ color: "#8a8690" }}>Your bag is empty</p></div>
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
                    <button onClick={checkoutWhatsApp} style={{ width: "100%", padding: 18, background: "#25d366", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Jost', sans-serif", fontSize: 13, fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", cursor: "pointer" }}>Checkout via WhatsApp</button>
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
