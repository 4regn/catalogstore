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
  logo_url: string;
}

interface Variant {
  name: string;
  options: string[];
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
  description: string;
}

interface CartItem {
  product: Product;
  qty: number;
  selectedVariants: { [key: string]: string };
}

export default function StorePage() {
  const params = useParams();
  const slug = params.slug as string;

  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Filters
  const [activeCategory, setActiveCategory] = useState("All");

  // Product detail
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [selectedVariants, setSelectedVariants] = useState<{ [key: string]: string }>({});

  // Cart
  const [cart, setCart] = useState<CartItem[]>([]);
  const [showCart, setShowCart] = useState(false);

  useEffect(() => {
    loadStore();
  }, [slug]);

  const loadStore = async () => {
    const { data: sellerData } = await supabase
      .from("sellers")
      .select("*")
      .eq("subdomain", slug)
      .single();

    if (!sellerData) {
      setNotFound(true);
      setLoading(false);
      return;
    }

    setSeller(sellerData);

    const { data: productData } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", sellerData.id)
      .eq("in_stock", true)
      .order("sort_order", { ascending: true });

    if (productData) setProducts(productData);
    setLoading(false);
  };

  const categories = ["All", ...Array.from(new Set(products.map((p) => p.category).filter(Boolean)))];

  const filteredProducts = activeCategory === "All"
    ? products
    : products.filter((p) => p.category === activeCategory);

  const openProduct = (product: Product) => {
    setSelectedProduct(product);
    setActiveImageIndex(0);
    const defaults: { [key: string]: string } = {};
    (product.variants || []).forEach((v) => {
      if (v.options.length > 0) defaults[v.name] = v.options[0];
    });
    setSelectedVariants(defaults);
  };

  const closeProduct = () => {
    setSelectedProduct(null);
    setSelectedVariants({});
  };

  const addToCart = (product: Product) => {
    const variantKey = JSON.stringify(selectedVariants);
    const existing = cart.findIndex(
      (item) => item.product.id === product.id && JSON.stringify(item.selectedVariants) === variantKey
    );

    if (existing >= 0) {
      const updated = [...cart];
      updated[existing].qty += 1;
      setCart(updated);
    } else {
      setCart([...cart, { product, qty: 1, selectedVariants: { ...selectedVariants } }]);
    }

    closeProduct();
    setShowCart(true);
  };

  const removeFromCart = (index: number) => {
    setCart(cart.filter((_, i) => i !== index));
  };

  const updateQty = (index: number, delta: number) => {
    const updated = [...cart];
    updated[index].qty += delta;
    if (updated[index].qty < 1) updated[index].qty = 1;
    setCart(updated);
  };

  const cartTotal = cart.reduce((sum, item) => sum + item.product.price * item.qty, 0);
  const cartCount = cart.reduce((sum, item) => sum + item.qty, 0);

  const checkoutWhatsApp = () => {
    if (!seller?.whatsapp_number) return;

    let message = "Hi! I'd like to order:\n\n";
    cart.forEach((item) => {
      message += "- " + item.product.name;
      const variants = Object.entries(item.selectedVariants);
      if (variants.length > 0) {
        message += " (" + variants.map(([k, v]) => k + ": " + v).join(", ") + ")";
      }
      message += " x" + item.qty + " - R" + (item.product.price * item.qty) + "\n";
    });
    message += "\nTotal: R" + cartTotal;

    let phone = seller.whatsapp_number.replace(/\D/g, "");
    if (phone.startsWith("0")) phone = "27" + phone.substring(1);

    window.open("https://wa.me/" + phone + "?text=" + encodeURIComponent(message), "_blank");
  };

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <p style={{ color: "#999", fontSize: 15 }}>Loading store...</p>
      </div>
    );
  }

  if (notFound) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        <h1 style={{ fontSize: 48, fontWeight: 300, color: "#222", marginBottom: 8 }}>404</h1>
        <p style={{ color: "#999", fontSize: 15 }}>This store doesn't exist.</p>
      </div>
    );
  }

  return (
    <div style={s.page}>
      {/* HEADER */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <div style={s.storeBrand}>
            <h1 style={s.brandName}>{seller?.store_name || "Store"}</h1>
          </div>
          <button style={s.cartBtn} onClick={() => setShowCart(true)}>
            Bag {cartCount > 0 && <span style={s.cartBadge}>{cartCount}</span>}
          </button>
        </div>
      </header>

      {/* HERO */}
      <section style={s.hero}>
        <h2 style={s.heroTitle}>{seller?.store_name}</h2>
        <p style={s.heroSub}>Curated collection - Shop what you love</p>
      </section>

      {/* CATEGORIES */}
      {categories.length > 2 && (
        <div style={s.catBar}>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              style={{
                ...s.catBtn,
                ...(activeCategory === cat ? s.catBtnActive : {}),
              }}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* PRODUCT GRID */}
      <section style={s.gridSection}>
        {filteredProducts.length === 0 ? (
          <div style={{ textAlign: "center", padding: "80px 20px", color: "#999" }}>
            <p style={{ fontSize: 18 }}>No products yet</p>
            <p style={{ fontSize: 14, marginTop: 8 }}>Check back soon!</p>
          </div>
        ) : (
          <div style={s.grid}>
            {filteredProducts.map((product) => (
              <div key={product.id} style={s.productCard} onClick={() => openProduct(product)}>
                <div style={s.productImageWrap}>
                  {product.image_url ? (
                    <img src={product.image_url} alt={product.name} style={s.productImage} />
                  ) : (
                    <div style={s.productImagePlaceholder}>
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                  )}
                  {product.old_price && (
                    <div style={s.saleBadge}>Sale</div>
                  )}
                </div>
                <div style={s.productDetails}>
                  <p style={s.productName}>{product.name}</p>
                  {product.category && <p style={s.productCat}>{product.category}</p>}
                  <div style={s.priceRow}>
                    <span style={s.productPrice}>R{product.price}</span>
                    {product.old_price && (
                      <span style={s.oldPrice}>R{product.old_price}</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* FOOTER */}
      <footer style={s.footer}>
        <p style={s.footerText}>
          {seller?.store_name} - Powered by{" "}
          <a href="/" style={s.footerLink}>CatalogStore</a>
        </p>
      </footer>

      {/* PRODUCT DETAIL MODAL */}
      {selectedProduct && (
        <div style={s.overlay} onClick={closeProduct}>
          <div style={s.modal} onClick={(e) => e.stopPropagation()}>
            <button style={s.closeBtn} onClick={closeProduct}>&#10005;</button>

            <div style={s.modalLayout}>
              {/* Images */}
              <div style={s.modalImages}>
                <div style={s.mainImage}>
                  {selectedProduct.images && selectedProduct.images.length > 0 ? (
                    <img src={selectedProduct.images[activeImageIndex]} alt={selectedProduct.name} style={s.mainImg} />
                  ) : selectedProduct.image_url ? (
                    <img src={selectedProduct.image_url} alt={selectedProduct.name} style={s.mainImg} />
                  ) : (
                    <div style={{ ...s.productImagePlaceholder, height: 400 }}>
                      <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                    </div>
                  )}
                </div>
                {selectedProduct.images && selectedProduct.images.length > 1 && (
                  <div style={s.thumbRow}>
                    {selectedProduct.images.map((img, i) => (
                      <img
                        key={i}
                        src={img}
                        alt={"Angle " + (i + 1)}
                        onClick={() => setActiveImageIndex(i)}
                        style={{
                          ...s.thumb,
                          border: activeImageIndex === i ? "2px solid #222" : "2px solid transparent",
                        }}
                      />
                    ))}
                  </div>
                )}
              </div>

              {/* Info */}
              <div style={s.modalInfo}>
                {selectedProduct.category && (
                  <p style={s.modalCat}>{selectedProduct.category}</p>
                )}
                <h2 style={s.modalTitle}>{selectedProduct.name}</h2>
                <div style={s.modalPriceRow}>
                  <span style={s.modalPrice}>R{selectedProduct.price}</span>
                  {selectedProduct.old_price && (
                    <span style={s.modalOldPrice}>R{selectedProduct.old_price}</span>
                  )}
                </div>

                {selectedProduct.description && (
                  <p style={s.modalDesc}>{selectedProduct.description}</p>
                )}

                {/* Variants */}
                {selectedProduct.variants && selectedProduct.variants.length > 0 && (
                  <div style={s.variantsSection}>
                    {selectedProduct.variants.map((variant) => (
                      <div key={variant.name} style={s.variantGroup}>
                        <p style={s.variantLabel}>
                          {variant.name}: <strong>{selectedVariants[variant.name] || ""}</strong>
                        </p>
                        <div style={s.variantOptions}>
                          {variant.options.map((option) => (
                            <button
                              key={option}
                              onClick={() =>
                                setSelectedVariants({ ...selectedVariants, [variant.name]: option })
                              }
                              style={{
                                ...s.variantBtn,
                                ...(selectedVariants[variant.name] === option ? s.variantBtnActive : {}),
                              }}
                            >
                              {option}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <button style={s.addToCartBtn} onClick={() => addToCart(selectedProduct)}>
                  Add to Bag - R{selectedProduct.price}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CART DRAWER */}
      {showCart && (
        <div style={s.overlay} onClick={() => setShowCart(false)}>
          <div style={s.cartDrawer} onClick={(e) => e.stopPropagation()}>
            <div style={s.cartHeader}>
              <h3 style={s.cartTitle}>Your Bag ({cartCount})</h3>
              <button style={s.closeBtn} onClick={() => setShowCart(false)}>&#10005;</button>
            </div>

            {cart.length === 0 ? (
              <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
                <p style={{ color: "#999", fontSize: 15 }}>Your bag is empty</p>
              </div>
            ) : (
              <>
                <div style={s.cartItems}>
                  {cart.map((item, index) => (
                    <div key={index} style={s.cartItem}>
                      {item.product.image_url && (
                        <img src={item.product.image_url} alt={item.product.name} style={s.cartItemImg} />
                      )}
                      <div style={s.cartItemInfo}>
                        <p style={s.cartItemName}>{item.product.name}</p>
                        {Object.entries(item.selectedVariants).length > 0 && (
                          <p style={s.cartItemVariants}>
                            {Object.entries(item.selectedVariants).map(([k, v]) => k + ": " + v).join(", ")}
                          </p>
                        )}
                        <p style={s.cartItemPrice}>R{item.product.price}</p>
                        <div style={s.qtyRow}>
                          <button style={s.qtyBtn} onClick={() => updateQty(index, -1)}>-</button>
                          <span style={s.qtyNum}>{item.qty}</span>
                          <button style={s.qtyBtn} onClick={() => updateQty(index, 1)}>+</button>
                          <button style={s.removeBtn} onClick={() => removeFromCart(index)}>Remove</button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={s.cartFooter}>
                  <div style={s.cartTotalRow}>
                    <span style={{ fontSize: 16, fontWeight: 600 }}>Total</span>
                    <span style={{ fontSize: 20, fontWeight: 700 }}>R{cartTotal}</span>
                  </div>
                  <button style={s.checkoutBtn} onClick={checkoutWhatsApp}>
                    Checkout via WhatsApp
                  </button>
                  <p style={s.checkoutNote}>You'll be taken to WhatsApp to confirm your order</p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* FLOATING WHATSAPP */}
      {seller?.whatsapp_number && (
        <a
          href={"https://wa.me/" + (seller.whatsapp_number.startsWith("0") ? "27" + seller.whatsapp_number.substring(1) : seller.whatsapp_number).replace(/\D/g, "")}
          target="_blank"
          style={s.whatsappFloat}
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

const s: { [key: string]: React.CSSProperties } = {
  page: { minHeight: "100vh", background: "#fafafa", fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#222" },

  // Header
  header: { position: "sticky", top: 0, background: "rgba(250,250,250,0.9)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", borderBottom: "1px solid #eee", zIndex: 100, padding: "0 24px" },
  headerInner: { maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 },
  storeBrand: { display: "flex", alignItems: "center", gap: 12 },
  brandName: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 22, fontWeight: 700, letterSpacing: "-0.03em", color: "#111" },
  cartBtn: { padding: "10px 20px", background: "#111", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 600, cursor: "pointer", position: "relative" as const, display: "flex", alignItems: "center", gap: 8 },
  cartBadge: { background: "#fff", color: "#111", width: 20, height: 20, borderRadius: "50%", fontSize: 11, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" },

  // Hero
  hero: { textAlign: "center" as const, padding: "60px 24px 40px", maxWidth: 600, margin: "0 auto" },
  heroTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 42, fontWeight: 700, letterSpacing: "-0.04em", color: "#111", marginBottom: 12 },
  heroSub: { fontSize: 15, color: "#888", fontWeight: 400, letterSpacing: "0.05em", textTransform: "uppercase" as const },

  // Categories
  catBar: { display: "flex", justifyContent: "center", gap: 8, padding: "0 24px 32px", flexWrap: "wrap" as const },
  catBtn: { padding: "8px 20px", background: "transparent", border: "1px solid #ddd", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 500, color: "#666", cursor: "pointer", transition: "all 0.2s" },
  catBtnActive: { background: "#111", color: "#fff", borderColor: "#111" },

  // Grid
  gridSection: { maxWidth: 1200, margin: "0 auto", padding: "0 24px 60px" },
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(260, 1fr))", gap: 24 },
  productCard: { cursor: "pointer", background: "#fff", borderRadius: 16, overflow: "hidden", transition: "all 0.3s", border: "1px solid #f0f0f0" },
  productImageWrap: { position: "relative" as const, aspectRatio: "3/4", overflow: "hidden", background: "#f5f5f5" },
  productImage: { width: "100%", height: "100%", objectFit: "cover" as const, transition: "transform 0.5s" },
  productImagePlaceholder: { width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "#f5f5f5" },
  saleBadge: { position: "absolute" as const, top: 12, left: 12, padding: "4px 12px", background: "#111", color: "#fff", borderRadius: 100, fontSize: 11, fontWeight: 600, textTransform: "uppercase" as const, letterSpacing: "0.05em" },
  productDetails: { padding: "16px 18px 20px" },
  productName: { fontSize: 15, fontWeight: 600, color: "#111", marginBottom: 4, letterSpacing: "-0.01em" },
  productCat: { fontSize: 12, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 },
  priceRow: { display: "flex", alignItems: "center", gap: 8 },
  productPrice: { fontSize: 16, fontWeight: 700, color: "#111" },
  oldPrice: { fontSize: 14, color: "#bbb", textDecoration: "line-through" },

  // Footer
  footer: { textAlign: "center" as const, padding: "40px 24px", borderTop: "1px solid #eee" },
  footerText: { fontSize: 13, color: "#bbb" },
  footerLink: { color: "#888", textDecoration: "none", fontWeight: 600 },

  // Modal overlay
  overlay: { position: "fixed" as const, inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" },

  // Product modal
  modal: { background: "#fff", borderRadius: 20, maxWidth: 900, width: "90%", maxHeight: "90vh", overflow: "auto", position: "relative" as const, padding: 32 },
  closeBtn: { position: "absolute" as const, top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "#f5f5f5", border: "none", fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", color: "#333", zIndex: 10 },
  modalLayout: { display: "flex", gap: 36 },
  modalImages: { flex: 1 },
  mainImage: { borderRadius: 14, overflow: "hidden", background: "#f5f5f5", aspectRatio: "3/4" },
  mainImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  thumbRow: { display: "flex", gap: 8, marginTop: 12 },
  thumb: { width: 64, height: 64, borderRadius: 10, objectFit: "cover" as const, cursor: "pointer", transition: "all 0.2s" },
  modalInfo: { flex: 1, display: "flex", flexDirection: "column" as const },
  modalCat: { fontSize: 12, color: "#999", textTransform: "uppercase" as const, letterSpacing: "0.06em", marginBottom: 8 },
  modalTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, color: "#111", letterSpacing: "-0.02em", marginBottom: 12 },
  modalPriceRow: { display: "flex", alignItems: "center", gap: 10, marginBottom: 20 },
  modalPrice: { fontSize: 24, fontWeight: 700, color: "#111" },
  modalOldPrice: { fontSize: 18, color: "#bbb", textDecoration: "line-through" },
  modalDesc: { fontSize: 14, lineHeight: 1.7, color: "#666", marginBottom: 24 },
  variantsSection: { marginBottom: 24 },
  variantGroup: { marginBottom: 16 },
  variantLabel: { fontSize: 13, color: "#666", marginBottom: 8, fontWeight: 400 },
  variantOptions: { display: "flex", gap: 8, flexWrap: "wrap" as const },
  variantBtn: { padding: "10px 20px", border: "1px solid #ddd", borderRadius: 10, background: "#fff", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, fontWeight: 500, cursor: "pointer", transition: "all 0.2s", color: "#333" },
  variantBtnActive: { border: "2px solid #111", fontWeight: 600, color: "#111" },
  addToCartBtn: { padding: "16px 32px", background: "#111", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginTop: "auto" },

  // Cart drawer
  cartDrawer: { position: "fixed" as const, top: 0, right: 0, bottom: 0, width: 400, maxWidth: "90vw", background: "#fff", zIndex: 210, display: "flex", flexDirection: "column" as const, boxShadow: "-4px 0 24px rgba(0,0,0,0.1)" },
  cartHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px", borderBottom: "1px solid #eee" },
  cartTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 20, fontWeight: 700, color: "#111" },
  cartItems: { flex: 1, overflow: "auto", padding: "16px 24px" },
  cartItem: { display: "flex", gap: 14, padding: "16px 0", borderBottom: "1px solid #f5f5f5" },
  cartItemImg: { width: 72, height: 72, borderRadius: 10, objectFit: "cover" as const },
  cartItemInfo: { flex: 1 },
  cartItemName: { fontSize: 14, fontWeight: 600, color: "#111", marginBottom: 2 },
  cartItemVariants: { fontSize: 12, color: "#999", marginBottom: 4 },
  cartItemPrice: { fontSize: 15, fontWeight: 700, color: "#111", marginBottom: 8 },
  qtyRow: { display: "flex", alignItems: "center", gap: 8 },
  qtyBtn: { width: 28, height: 28, borderRadius: "50%", border: "1px solid #ddd", background: "#fff", fontSize: 14, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  qtyNum: { fontSize: 14, fontWeight: 600, minWidth: 20, textAlign: "center" as const },
  removeBtn: { marginLeft: "auto", padding: "4px 0", background: "transparent", border: "none", color: "#bbb", fontSize: 12, cursor: "pointer", textDecoration: "underline" },
  cartFooter: { padding: "20px 24px", borderTop: "1px solid #eee" },
  cartTotalRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 },
  checkoutBtn: { width: "100%", padding: "16px", background: "#25d366", color: "#fff", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 15, fontWeight: 700, cursor: "pointer" },
  checkoutNote: { textAlign: "center" as const, fontSize: 12, color: "#999", marginTop: 10 },

  // WhatsApp float
  whatsappFloat: { position: "fixed" as const, bottom: 24, right: 24, width: 56, height: 56, borderRadius: "50%", background: "#25d366", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 16px rgba(37,211,102,0.3)", zIndex: 50, transition: "transform 0.2s" },
};
