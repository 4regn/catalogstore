"use client";

import { useState, useEffect, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useRouter } from "next/navigation";

interface Variant {
  name: string;
  options: string[];
}

interface Seller {
  id: string;
  email: string;
  store_name: string;
  whatsapp_number: string;
  subdomain: string;
  template: string;
  plan: string;
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
}

interface Order {
  id: string;
  order_number: number;
  customer_name: string;
  customer_phone: string;
  items: { name: string; qty: number; price: number }[];
  total: number;
  status: string;
  payment_status: string;
  created_at: string;
}

export default function Dashboard() {
  const router = useRouter();
  const [seller, setSeller] = useState<Seller | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"overview" | "products" | "orders">("overview");

  // Product form
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

  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      router.push("/login");
      return;
    }

    const { data: sellerData } = await supabase
      .from("sellers")
      .select("*")
      .eq("id", user.id)
      .single();

    if (sellerData) setSeller(sellerData);

    const { data: productData } = await supabase
      .from("products")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (productData) setProducts(productData);

    const { data: orderData } = await supabase
      .from("orders")
      .select("*")
      .eq("seller_id", user.id)
      .order("created_at", { ascending: false });

    if (orderData) setOrders(orderData);

    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
  };

  const resetForm = () => {
    setFormName("");
    setFormPrice("");
    setFormCategory("");
    setFormImages([]);
    setFormPreviews([]);
    setExistingImages([]);
    setFormVariants([]);
    setUploadProgress("");
    setEditingId(null);
    setShowForm(false);
  };

  const startEdit = (product: Product) => {
    setEditingId(product.id);
    setFormName(product.name);
    setFormPrice(String(product.price));
    setFormCategory(product.category || "");
    setFormImages([]);
    setFormPreviews([]);
    setExistingImages(product.images || []);
    setFormVariants(product.variants || []);
    setShowForm(true);
  };

  // --- VARIANT HELPERS ---
  const addVariant = () => {
    setFormVariants([...formVariants, { name: "", options: [""] }]);
  };

  const removeVariant = (index: number) => {
    setFormVariants(formVariants.filter((_, i) => i !== index));
  };

  const updateVariantName = (index: number, name: string) => {
    const updated = [...formVariants];
    updated[index].name = name;
    setFormVariants(updated);
  };

  const addVariantOption = (variantIndex: number) => {
    const updated = [...formVariants];
    updated[variantIndex].options.push("");
    setFormVariants(updated);
  };

  const updateVariantOption = (variantIndex: number, optionIndex: number, value: string) => {
    const updated = [...formVariants];
    updated[variantIndex].options[optionIndex] = value;
    setFormVariants(updated);
  };

  const removeVariantOption = (variantIndex: number, optionIndex: number) => {
    const updated = [...formVariants];
    updated[variantIndex].options = updated[variantIndex].options.filter((_, i) => i !== optionIndex);
    setFormVariants(updated);
  };

  const PRESET_VARIANTS = [
    { name: "Size", options: ["S", "M", "L", "XL"] },
    { name: "Color", options: ["Black", "White"] },
    { name: "Material", options: ["Cotton", "Polyester"] },
  ];

  const addPresetVariant = (preset: Variant) => {
    const exists = formVariants.some(
      (v) => v.name.toLowerCase() === preset.name.toLowerCase()
    );
    if (!exists) {
      setFormVariants([...formVariants, { ...preset, options: [...preset.options] }]);
    }
  };

  // --- IMAGE HELPERS ---
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const totalImages = formImages.length + existingImages.length + files.length;
    if (totalImages > 6) {
      alert("Maximum 6 images per product");
      return;
    }

    const validFiles = files.filter((f) => {
      if (!f.type.startsWith("image/")) return false;
      if (f.size > 5 * 1024 * 1024) {
        alert(f.name + " is too large. Max 5MB per image.");
        return false;
      }
      return true;
    });

    setFormImages((prev) => [...prev, ...validFiles]);

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        setFormPreviews((prev) => [...prev, ev.target?.result as string]);
      };
      reader.readAsDataURL(file);
    });
  };

  const removeNewImage = (index: number) => {
    setFormImages((prev) => prev.filter((_, i) => i !== index));
    setFormPreviews((prev) => prev.filter((_, i) => i !== index));
  };

  const removeExistingImage = (index: number) => {
    setExistingImages((prev) => prev.filter((_, i) => i !== index));
  };

  const uploadImages = async (sellerId: string, productId: string): Promise<string[]> => {
    const urls: string[] = [];

    for (let i = 0; i < formImages.length; i++) {
      const file = formImages[i];
      const ext = file.name.split(".").pop();
      const timestamp = Date.now();
      const path = sellerId + "/" + productId + "/" + timestamp + "-" + i + "." + ext;

      setUploadProgress("Uploading image " + (i + 1) + " of " + formImages.length + "...");

      const { error } = await supabase.storage
        .from("product-images")
        .upload(path, file);

      if (!error) {
        const { data: urlData } = supabase.storage
          .from("product-images")
          .getPublicUrl(path);

        urls.push(urlData.publicUrl);
      }
    }

    return urls;
  };

  // Clean variants: remove empty names and empty options
  const cleanVariants = (variants: Variant[]): Variant[] => {
    return variants
      .filter((v) => v.name.trim() !== "")
      .map((v) => ({
        name: v.name.trim(),
        options: v.options.filter((o) => o.trim() !== "").map((o) => o.trim()),
      }))
      .filter((v) => v.options.length > 0);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormSaving(true);
    setUploadProgress("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return;

    const cleanedVariants = cleanVariants(formVariants);

    if (editingId) {
      let allImages = [...existingImages];

      if (formImages.length > 0) {
        const newUrls = await uploadImages(user.id, editingId);
        allImages = [...allImages, ...newUrls];
      }

      const { error } = await supabase
        .from("products")
        .update({
          name: formName,
          price: parseFloat(formPrice),
          category: formCategory,
          images: allImages,
          image_url: allImages[0] || null,
          variants: cleanedVariants,
        })
        .eq("id", editingId);

      if (!error) {
        setProducts(
          products.map((p) =>
            p.id === editingId
              ? {
                  ...p,
                  name: formName,
                  price: parseFloat(formPrice),
                  category: formCategory,
                  images: allImages,
                  image_url: allImages[0] || null,
                  variants: cleanedVariants,
                }
              : p
          )
        );
      }
    } else {
      const { data, error } = await supabase
        .from("products")
        .insert({
          seller_id: user.id,
          name: formName,
          price: parseFloat(formPrice),
          category: formCategory,
          in_stock: true,
          variants: cleanedVariants,
        })
        .select()
        .single();

      if (error || !data) {
        setFormSaving(false);
        return;
      }

      let imageUrls: string[] = [];
      if (formImages.length > 0) {
        imageUrls = await uploadImages(user.id, data.id);

        await supabase
          .from("products")
          .update({
            images: imageUrls,
            image_url: imageUrls[0] || null,
          })
          .eq("id", data.id);
      }

      const updatedProduct = {
        ...data,
        images: imageUrls,
        image_url: imageUrls[0] || null,
        variants: cleanedVariants,
      };
      setProducts([updatedProduct, ...products]);
    }

    resetForm();
    setFormSaving(false);
  };

  const toggleStock = async (id: string, currentStatus: boolean) => {
    await supabase
      .from("products")
      .update({ in_stock: !currentStatus })
      .eq("id", id);

    setProducts(
      products.map((p) =>
        p.id === id ? { ...p, in_stock: !currentStatus } : p
      )
    );
  };

  const deleteProduct = async (id: string) => {
    await supabase.from("products").delete().eq("id", id);
    setProducts(products.filter((p) => p.id !== id));
  };

  if (loading) {
    return (
      <div style={styles.loadingPage}>
        <div style={styles.spinner} />
        <p style={{ color: "rgba(238,238,242,0.55)", marginTop: 16, fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
          Loading your dashboard...
        </p>
      </div>
    );
  }

  const todayOrders = orders.filter((o) => {
    const today = new Date().toDateString();
    return new Date(o.created_at).toDateString() === today;
  });

  const totalRevenue = orders
    .filter((o) => o.payment_status === "paid")
    .reduce((sum, o) => sum + o.total, 0);

  const totalImageSlots = existingImages.length + formImages.length;

  return (
    <div style={styles.page}>
      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        <div style={styles.sidebarTop}>
          <div style={styles.logoRow}>
            <div style={styles.logoIcon}>C</div>
            <div style={styles.logoText}>
              Catalog<span style={{ color: "#00d4aa" }}>Store</span>
            </div>
          </div>

          <div style={styles.storeInfo}>
            <div style={styles.storeName}>{seller?.store_name || "My Store"}</div>
            <div style={styles.storePlan}>{seller?.plan || "Free"} plan</div>
          </div>

          <nav style={styles.nav}>
            <button
              style={{ ...styles.navBtn, ...(tab === "overview" ? styles.navBtnActive : {}) }}
              onClick={() => setTab("overview")}
            >
              Overview
            </button>
            <button
              style={{ ...styles.navBtn, ...(tab === "products" ? styles.navBtnActive : {}) }}
              onClick={() => setTab("products")}
            >
              Products ({products.length})
            </button>
            <button
              style={{ ...styles.navBtn, ...(tab === "orders" ? styles.navBtnActive : {}) }}
              onClick={() => setTab("orders")}
            >
              Orders ({orders.length})
            </button>
          </nav>
        </div>

        <div style={styles.sidebarBottom}>
          {seller?.subdomain && (
            <a href={"/store/" + seller.subdomain} target="_blank" style={styles.viewStore}>
              View My Store
            </a>
          )}
          <button style={styles.logoutBtn} onClick={handleLogout}>
            Log Out
          </button>
        </div>
      </aside>

      {/* MAIN */}
      <main style={styles.main}>
        {/* OVERVIEW */}
        {tab === "overview" && (
          <div>
            <h1 style={styles.pageTitle}>Welcome back, {seller?.store_name || "Seller"}</h1>
            <p style={styles.pageSubtitle}>Here is a quick look at your store.</p>

            <div style={styles.statsGrid}>
              <div style={styles.statCard}>
                <div style={styles.statNumber}>{products.length}</div>
                <div style={styles.statLabel}>Products</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statNumber}>{orders.length}</div>
                <div style={styles.statLabel}>Total Orders</div>
              </div>
              <div style={styles.statCard}>
                <div style={styles.statNumber}>{todayOrders.length}</div>
                <div style={styles.statLabel}>Orders Today</div>
              </div>
              <div style={styles.statCard}>
                <div style={{ ...styles.statNumber, color: "#00d4aa" }}>R{totalRevenue.toFixed(0)}</div>
                <div style={styles.statLabel}>Total Revenue</div>
              </div>
            </div>

            <div style={styles.quickActions}>
              <h3 style={styles.sectionTitle}>Quick Actions</h3>
              <div style={styles.actionGrid}>
                <button
                  style={styles.actionCard}
                  onClick={() => { setTab("products"); resetForm(); setShowForm(true); }}
                >
                  <span style={{ fontSize: 24 }}>+</span>
                  <span>Add Product</span>
                </button>
                <button style={styles.actionCard} onClick={() => setTab("orders")}>
                  <span style={{ fontSize: 24 }}>&#9776;</span>
                  <span>View Orders</span>
                </button>
                {seller?.subdomain && (
                  <a href={"/store/" + seller.subdomain} target="_blank" style={{ ...styles.actionCard, textDecoration: "none" }}>
                    <span style={{ fontSize: 24 }}>&#8599;</span>
                    <span>View Store</span>
                  </a>
                )}
              </div>
            </div>
          </div>
        )}

        {/* PRODUCTS */}
        {tab === "products" && (
          <div>
            <div style={styles.tabHeader}>
              <div>
                <h1 style={styles.pageTitle}>Products</h1>
                <p style={styles.pageSubtitle}>Manage the products in your store.</p>
              </div>
              <button
                style={styles.addBtn}
                onClick={() => { if (showForm) { resetForm(); } else { resetForm(); setShowForm(true); } }}
              >
                {showForm ? "Cancel" : "+ Add Product"}
              </button>
            </div>

            {showForm && (
              <div style={styles.formCard}>
                <h3 style={styles.sectionTitle}>{editingId ? "Edit Product" : "New Product"}</h3>
                <form onSubmit={handleSubmit}>
                  <div style={styles.formGrid}>
                    <div style={styles.field}>
                      <label style={styles.label}>Product Name</label>
                      <input type="text" placeholder="e.g. Oversized Graphic Tee" value={formName} onChange={(e) => setFormName(e.target.value)} required style={styles.input} />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Price (Rands)</label>
                      <input type="number" placeholder="e.g. 349" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={styles.input} />
                    </div>
                    <div style={styles.field}>
                      <label style={styles.label}>Category</label>
                      <input type="text" placeholder="e.g. Tops, Bottoms, Accessories" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={styles.input} />
                    </div>
                  </div>

                  {/* IMAGES */}
                  <div style={{ marginTop: 20 }}>
                    <label style={styles.label}>Product Images (max 6)</label>
                    <div style={styles.imageUploadArea}>
                      {existingImages.map((url, i) => (
                        <div key={"existing-" + i} style={styles.imagePreview}>
                          <img src={url} alt={"Product " + (i + 1)} style={styles.previewImg} />
                          <button type="button" onClick={() => removeExistingImage(i)} style={styles.removeImgBtn}>&#10005;</button>
                          {i === 0 && formImages.length === 0 && <div style={styles.mainBadge}>Main</div>}
                        </div>
                      ))}
                      {formPreviews.map((preview, i) => (
                        <div key={"new-" + i} style={styles.imagePreview}>
                          <img src={preview} alt={"Preview " + (i + 1)} style={styles.previewImg} />
                          <button type="button" onClick={() => removeNewImage(i)} style={styles.removeImgBtn}>&#10005;</button>
                          {i === 0 && existingImages.length === 0 && <div style={styles.mainBadge}>Main</div>}
                        </div>
                      ))}
                      {totalImageSlots < 6 && (
                        <button type="button" onClick={() => fileInputRef.current?.click()} style={styles.uploadBtn}>
                          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(238,238,242,0.35)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                          <span style={{ fontSize: 12, color: "rgba(238,238,242,0.35)", marginTop: 4 }}>Add Photo</span>
                        </button>
                      )}
                      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(238,238,242,0.25)", marginTop: 8 }}>First image will be the main product photo. Max 5MB each.</p>
                  </div>

                  {/* VARIANTS */}
                  <div style={{ marginTop: 24 }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                      <label style={styles.label}>Variants (optional)</label>
                    </div>

                    {/* Quick add presets */}
                    {formVariants.length === 0 && (
                      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                        {PRESET_VARIANTS.map((preset) => (
                          <button
                            key={preset.name}
                            type="button"
                            onClick={() => addPresetVariant(preset)}
                            style={styles.presetBtn}
                          >
                            + {preset.name}
                          </button>
                        ))}
                        <button type="button" onClick={addVariant} style={styles.presetBtn}>
                          + Custom
                        </button>
                      </div>
                    )}

                    {formVariants.map((variant, vi) => (
                      <div key={vi} style={styles.variantCard}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                          <input
                            type="text"
                            placeholder="Variant name (e.g. Size, Color)"
                            value={variant.name}
                            onChange={(e) => updateVariantName(vi, e.target.value)}
                            style={{ ...styles.input, fontWeight: 600, maxWidth: 250 }}
                          />
                          <button type="button" onClick={() => removeVariant(vi)} style={styles.removeVariantBtn}>
                            Remove
                          </button>
                        </div>

                        <div style={{ display: "flex", flexWrap: "wrap" as const, gap: 8 }}>
                          {variant.options.map((option, oi) => (
                            <div key={oi} style={styles.optionChip}>
                              <input
                                type="text"
                                placeholder="e.g. Large"
                                value={option}
                                onChange={(e) => updateVariantOption(vi, oi, e.target.value)}
                                style={styles.optionInput}
                              />
                              {variant.options.length > 1 && (
                                <button type="button" onClick={() => removeVariantOption(vi, oi)} style={styles.removeOptionBtn}>
                                  &#10005;
                                </button>
                              )}
                            </div>
                          ))}
                          <button type="button" onClick={() => addVariantOption(vi)} style={styles.addOptionBtn}>
                            + Add Option
                          </button>
                        </div>
                      </div>
                    ))}

                    {formVariants.length > 0 && (
                      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                        {PRESET_VARIANTS.filter((p) => !formVariants.some((v) => v.name.toLowerCase() === p.name.toLowerCase())).map((preset) => (
                          <button key={preset.name} type="button" onClick={() => addPresetVariant(preset)} style={styles.presetBtn}>
                            + {preset.name}
                          </button>
                        ))}
                        <button type="button" onClick={addVariant} style={styles.presetBtn}>
                          + Custom
                        </button>
                      </div>
                    )}
                  </div>

                  {uploadProgress && (
                    <div style={{ marginTop: 12, fontSize: 13, color: "#00d4aa" }}>{uploadProgress}</div>
                  )}

                  <button
                    type="submit"
                    disabled={formSaving}
                    style={{ ...styles.addBtn, opacity: formSaving ? 0.6 : 1, width: "100%", marginTop: 20 }}
                  >
                    {formSaving ? "Saving..." : editingId ? "Save Changes" : "Save Product"}
                  </button>
                </form>
              </div>
            )}

            {products.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={{ fontSize: 18, marginBottom: 8 }}>No products yet</p>
                <p style={{ color: "rgba(238,238,242,0.35)" }}>Add your first product to get your store going.</p>
              </div>
            ) : (
              <div style={styles.productList}>
                {products.map((product) => (
                  <div key={product.id} style={styles.productRow}>
                    <div style={{ display: "flex", alignItems: "center", gap: 16, flex: 1 }}>
                      {product.image_url ? (
                        <img src={product.image_url} alt={product.name} style={styles.productThumb} />
                      ) : (
                        <div style={styles.productThumbPlaceholder}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(238,238,242,0.2)" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg>
                        </div>
                      )}
                      <div style={styles.productInfo}>
                        <div style={styles.productName}>{product.name}</div>
                        <div style={styles.productMeta}>
                          {product.category && <span style={styles.productCategory}>{product.category}</span>}
                          <span style={{ color: product.in_stock ? "#00d4aa" : "#f87171" }}>
                            {product.in_stock ? "In Stock" : "Sold Out"}
                          </span>
                          {product.images && product.images.length > 0 && (
                            <span style={{ color: "rgba(238,238,242,0.3)" }}>
                              {product.images.length} photo{product.images.length !== 1 ? "s" : ""}
                            </span>
                          )}
                          {product.variants && product.variants.length > 0 && (
                            <span style={{ color: "rgba(139,92,246,0.7)" }}>
                              {product.variants.map((v) => v.name).join(", ")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div style={styles.productPrice}>R{product.price}</div>
                    <div style={styles.productActions}>
                      <button style={{ ...styles.smallBtn, color: "#00d4aa" }} onClick={() => startEdit(product)}>
                        Edit
                      </button>
                      <button style={styles.smallBtn} onClick={() => toggleStock(product.id, product.in_stock)}>
                        {product.in_stock ? "Mark Sold Out" : "Mark In Stock"}
                      </button>
                      <button style={{ ...styles.smallBtn, color: "#f87171" }} onClick={() => deleteProduct(product.id)}>
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ORDERS */}
        {tab === "orders" && (
          <div>
            <h1 style={styles.pageTitle}>Orders</h1>
            <p style={styles.pageSubtitle}>Track your incoming orders.</p>

            {orders.length === 0 ? (
              <div style={styles.emptyState}>
                <p style={{ fontSize: 18, marginBottom: 8 }}>No orders yet</p>
                <p style={{ color: "rgba(238,238,242,0.35)" }}>Orders will appear here when customers buy from your store.</p>
              </div>
            ) : (
              <div style={styles.productList}>
                {orders.map((order) => (
                  <div key={order.id} style={styles.productRow}>
                    <div style={styles.productInfo}>
                      <div style={styles.productName}>Order #{order.order_number}</div>
                      <div style={styles.productMeta}>
                        <span>{order.customer_name || "Customer"}</span>
                        <span>{order.customer_phone || ""}</span>
                        <span>{new Date(order.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={styles.productPrice}>R{order.total}</div>
                    <div style={styles.productActions}>
                      <span style={{ ...styles.statusBadge, background: order.payment_status === "paid" ? "rgba(0,212,170,0.12)" : "rgba(251,191,36,0.12)", color: order.payment_status === "paid" ? "#00d4aa" : "#fbbf24" }}>
                        {order.payment_status}
                      </span>
                      <span style={{ ...styles.statusBadge, background: "rgba(139,92,246,0.12)", color: "#8b5cf6" }}>
                        {order.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}

const styles: { [key: string]: React.CSSProperties } = {
  page: { minHeight: "100vh", background: "#06060b", display: "flex", fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#eeeef2" },
  loadingPage: { minHeight: "100vh", background: "#06060b", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" },
  spinner: { width: 32, height: 32, border: "3px solid rgba(255,255,255,0.1)", borderTopColor: "#00d4aa", borderRadius: "50%" },
  sidebar: { width: 260, borderRight: "1px solid rgba(255,255,255,0.07)", padding: "24px 20px", display: "flex", flexDirection: "column", justifyContent: "space-between", position: "fixed", top: 0, left: 0, bottom: 0, background: "#0a0a12" },
  sidebarTop: { display: "flex", flexDirection: "column", gap: 28 },
  logoRow: { display: "flex", alignItems: "center", gap: 10 },
  logoIcon: { width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg, #00d4aa 0%, #8b5cf6 100%)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, fontWeight: 800, color: "#06060b", fontFamily: "'Bricolage Grotesque', sans-serif" },
  logoText: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, color: "#eeeef2", letterSpacing: "-0.02em" },
  storeInfo: { padding: "14px 16px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 12 },
  storeName: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 15, fontWeight: 700, marginBottom: 2 },
  storePlan: { fontSize: 12, color: "rgba(238,238,242,0.35)", textTransform: "capitalize" as const },
  nav: { display: "flex", flexDirection: "column", gap: 4 },
  navBtn: { width: "100%", padding: "12px 16px", background: "transparent", border: "none", borderRadius: 10, color: "rgba(238,238,242,0.55)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 500, textAlign: "left" as const, cursor: "pointer", transition: "all 0.2s" },
  navBtnActive: { background: "rgba(255,255,255,0.05)", color: "#eeeef2", fontWeight: 600 },
  sidebarBottom: { display: "flex", flexDirection: "column", gap: 8 },
  viewStore: { display: "block", padding: "12px 16px", background: "rgba(0,212,170,0.1)", border: "1px solid rgba(0,212,170,0.2)", borderRadius: 10, color: "#00d4aa", fontSize: 13, fontWeight: 600, textAlign: "center" as const, textDecoration: "none" },
  logoutBtn: { padding: "10px 16px", background: "transparent", border: "none", color: "rgba(238,238,242,0.35)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 13, cursor: "pointer", textAlign: "left" as const },
  main: { flex: 1, marginLeft: 260, padding: "36px 40px" },
  pageTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", marginBottom: 4 },
  pageSubtitle: { fontSize: 15, color: "rgba(238,238,242,0.45)", fontWeight: 300, marginBottom: 32 },
  statsGrid: { display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16, marginBottom: 40 },
  statCard: { padding: "24px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16 },
  statNumber: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 32, fontWeight: 800, marginBottom: 4 },
  statLabel: { fontSize: 13, color: "rgba(238,238,242,0.35)", fontWeight: 400 },
  quickActions: { marginTop: 8 },
  sectionTitle: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, marginBottom: 16 },
  actionGrid: { display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 },
  actionCard: { padding: "24px 20px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 14, color: "#eeeef2", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 500, cursor: "pointer", display: "flex", flexDirection: "column", gap: 8, alignItems: "center", textAlign: "center" as const, transition: "all 0.2s" },
  tabHeader: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 8 },
  addBtn: { padding: "12px 24px", background: "#00d4aa", color: "#06060b", border: "none", borderRadius: 100, fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 14, fontWeight: 700, cursor: "pointer" },
  formCard: { padding: "28px", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 16, marginBottom: 24 },
  formGrid: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 },
  field: { display: "flex", flexDirection: "column", gap: 6 },
  label: { fontSize: 13, fontWeight: 500, color: "rgba(238,238,242,0.55)", marginBottom: 4 },
  input: { width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 10, color: "#eeeef2", fontSize: 14, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none" },
  imageUploadArea: { display: "flex", gap: 12, flexWrap: "wrap" as const, marginTop: 8 },
  imagePreview: { width: 100, height: 100, borderRadius: 12, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.1)" },
  previewImg: { width: "100%", height: "100%", objectFit: "cover" as const },
  removeImgBtn: { position: "absolute" as const, top: 4, right: 4, width: 22, height: 22, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" },
  mainBadge: { position: "absolute" as const, bottom: 4, left: 4, padding: "2px 8px", background: "#00d4aa", color: "#06060b", borderRadius: 6, fontSize: 9, fontWeight: 700, textTransform: "uppercase" as const },
  uploadBtn: { width: 100, height: 100, borderRadius: 12, border: "1px dashed rgba(255,255,255,0.15)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 4, transition: "all 0.2s" },
  // Variant styles
  variantCard: { padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 14, marginBottom: 10 },
  presetBtn: { padding: "8px 16px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 100, color: "rgba(238,238,242,0.55)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, fontWeight: 600, cursor: "pointer", transition: "all 0.2s" },
  removeVariantBtn: { padding: "6px 14px", background: "transparent", border: "1px solid rgba(248,113,113,0.2)", borderRadius: 8, color: "#f87171", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, cursor: "pointer" },
  optionChip: { display: "flex", alignItems: "center", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, overflow: "hidden" },
  optionInput: { width: 90, padding: "8px 10px", background: "transparent", border: "none", color: "#eeeef2", fontSize: 13, fontFamily: "'Plus Jakarta Sans', sans-serif", outline: "none" },
  removeOptionBtn: { padding: "8px 8px", background: "transparent", border: "none", borderLeft: "1px solid rgba(255,255,255,0.08)", color: "rgba(238,238,242,0.3)", fontSize: 10, cursor: "pointer" },
  addOptionBtn: { padding: "8px 14px", background: "transparent", border: "1px dashed rgba(255,255,255,0.12)", borderRadius: 8, color: "rgba(238,238,242,0.35)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, cursor: "pointer" },
  // Product list styles
  emptyState: { textAlign: "center" as const, padding: "60px 20px", color: "rgba(238,238,242,0.55)" },
  productList: { display: "flex", flexDirection: "column", gap: 4 },
  productRow: { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 20px", background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", borderRadius: 12 },
  productThumb: { width: 48, height: 48, borderRadius: 10, objectFit: "cover" as const, border: "1px solid rgba(255,255,255,0.08)" },
  productThumbPlaceholder: { width: 48, height: 48, borderRadius: 10, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", justifyContent: "center" },
  productInfo: { flex: 1 },
  productName: { fontSize: 15, fontWeight: 600, marginBottom: 4 },
  productMeta: { display: "flex", gap: 12, fontSize: 12, color: "rgba(238,238,242,0.35)" },
  productCategory: { color: "rgba(238,238,242,0.45)" },
  productPrice: { fontFamily: "'Bricolage Grotesque', sans-serif", fontSize: 18, fontWeight: 700, marginRight: 24 },
  productActions: { display: "flex", gap: 8, alignItems: "center" },
  smallBtn: { padding: "8px 14px", background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, color: "rgba(238,238,242,0.55)", fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 12, cursor: "pointer" },
  statusBadge: { padding: "6px 12px", borderRadius: 100, fontSize: 11, fontWeight: 600, textTransform: "capitalize" as const },
};
