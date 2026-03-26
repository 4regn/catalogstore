// Run this script once from your project root:
// node patch-dashboard.js
// It will patch app/dashboard/page.tsx in place

const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'app', 'dashboard', 'page.tsx');
let content = fs.readFileSync(filePath, 'utf8');
let applied = 0;

function patch(desc, oldStr, newStr) {
  if (content.includes(oldStr)) {
    content = content.replace(oldStr, newStr);
    console.log(`✓ ${desc}`);
    applied++;
  } else {
    console.log(`✗ NOT FOUND: ${desc}`);
  }
}

// ── 1. ADD formComparePrice STATE ─────────────────────────────────────────────
patch(
  'Add formComparePrice state',
  `  const [formVariants, setFormVariants] = useState<Variant[]>([]);`,
  `  const [formVariants, setFormVariants] = useState<Variant[]>([]);
  const [formComparePrice, setFormComparePrice] = useState("");`
);

// ── 2. RESET formComparePrice in resetForm ────────────────────────────────────
patch(
  'Reset formComparePrice in resetForm',
  `const resetForm = () => { setFormName(""); setFormPrice(""); setFormCategory(""); setFormImages([]); setFormPreviews([]); setExistingImages([]); setFormVariants([]); setUploadProgress(""); setEditingId(null); setShowForm(false); };`,
  `const resetForm = () => { setFormName(""); setFormPrice(""); setFormComparePrice(""); setFormCategory(""); setFormImages([]); setFormPreviews([]); setExistingImages([]); setFormVariants([]); setUploadProgress(""); setEditingId(null); setShowForm(false); };`
);

// ── 3. LOAD comparePrice in startEdit ────────────────────────────────────────
patch(
  'Load comparePrice in startEdit',
  `const startEdit = (p: Product) => { setEditingId(p.id); setFormName(p.name); setFormPrice(String(p.price)); setFormCategory(p.category || ""); setFormImages([]); setFormPreviews([]); setExistingImages(p.images || []); setFormVariants(p.variants || []); setShowForm(true); };`,
  `const startEdit = (p: Product) => { setEditingId(p.id); setFormName(p.name); setFormPrice(String(p.price)); setFormComparePrice(p.old_price ? String(p.old_price) : ""); setFormCategory(p.category || ""); setFormImages([]); setFormPreviews([]); setExistingImages(p.images || []); setFormVariants(p.variants || []); setShowForm(true); };`
);

// ── 4. PARALLEL IMAGE UPLOADS (speed fix) ────────────────────────────────────
patch(
  'Parallel image uploads',
  `  const uploadImages = async (sellerId: string, productId: string): Promise<string[]> => {
    const urls: string[] = [];
    for (let i = 0; i < formImages.length; i++) {
      const file = formImages[i]; const ext = file.name.split(".").pop(); const path = sellerId + "/" + productId + "/" + Date.now() + "-" + i + "." + ext;
      setUploadProgress("Uploading " + (i + 1) + " of " + formImages.length + "...");
      const { error } = await supabase.storage.from("product-images").upload(path, file);
      if (!error) { const { data } = supabase.storage.from("product-images").getPublicUrl(path); urls.push(data.publicUrl); }
    }
    return urls;
  };`,
  `  const uploadImages = async (sellerId: string, productId: string): Promise<string[]> => {
    setUploadProgress("Uploading " + formImages.length + " image" + (formImages.length > 1 ? "s" : "") + "...");
    const results = await Promise.all(
      formImages.map(async (file, i) => {
        const ext = file.name.split(".").pop();
        const path = sellerId + "/" + productId + "/" + Date.now() + "-" + i + "." + ext;
        const { error } = await supabase.storage.from("product-images").upload(path, file);
        if (error) return null;
        return supabase.storage.from("product-images").getPublicUrl(path).data.publicUrl;
      })
    );
    setUploadProgress("");
    return results.filter(Boolean) as string[];
  };`
);

// ── 5. SAVE old_price ON INSERT ───────────────────────────────────────────────
patch(
  'Save old_price on insert',
  `seller_id: user.id, name: formName, price: parseFloat(formPrice), category: formCategory, in_stock: true, variants: cv, status: "published"`,
  `seller_id: user.id, name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, in_stock: true, variants: cv, status: "published"`
);

// ── 6. SAVE old_price ON UPDATE ───────────────────────────────────────────────
patch(
  'Save old_price on update',
  `name: formName, price: parseFloat(formPrice), category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv`,
  `name: formName, price: parseFloat(formPrice), old_price: formComparePrice ? parseFloat(formComparePrice) : null, category: formCategory, images: allImages, image_url: allImages[0] || null, variants: cv`
);

// ── 7. ADD COMPARE PRICE INPUT IN FORM ───────────────────────────────────────
patch(
  'Add compare price input in form',
  `                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Price (Rands)</label>
                    <input type="number" placeholder="e.g. 349" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />`,
  `                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Selling Price (R)</label>
                    <input type="number" placeholder="e.g. 299" value={formPrice} onChange={(e) => setFormPrice(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                    <input type="number" placeholder="Original price e.g. 399 (optional — shows crossed out)" value={formComparePrice} onChange={(e) => setFormComparePrice(e.target.value)} style={{ width: "100%", padding: "10px 14px", background: "rgba(255,255,255,0.02)", border: "1px dashed rgba(255,255,255,0.06)", borderRadius: 10, color: "rgba(245,245,245,0.5)", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", marginTop: 6 }} />
                    {formComparePrice && parseFloat(formComparePrice) > parseFloat(formPrice || "0") && (
                      <span style={{ fontSize: 10, color: "#22c55e", fontWeight: 700 }}>
                        {Math.round((1 - parseFloat(formPrice) / parseFloat(formComparePrice)) * 100)}% off — shows as <span style={{ textDecoration: "line-through", color: "rgba(245,245,245,0.3)" }}>R{formComparePrice}</span> → R{formPrice}
                      </span>
                    )}`
);

// ── 8. AUTO-CREATE COLLECTION IN PRODUCT FORM ─────────────────────────────────
patch(
  'Auto-create collection in product form',
  `                    {storeCollections.length > 0 ? (
                      <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const }}>
                        <option value="" style={{ background: "#080808" }}>No collection</option>
                        {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "#080808" }}>{c}</option>))}
                      </select>
                    ) : (
                      <input type="text" placeholder="Create collections in Edit My Store" value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                    )}`,
  `                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const }}>
                      <option value="" style={{ background: "#080808" }}>No collection</option>
                      {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "#080808" }}>{c}</option>))}
                      <option value="__new__" style={{ background: "#080808", color: "#ff6b35" }}>+ Create new collection...</option>
                    </select>
                    {(formCategory === "" || formCategory === "__new__") && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text"
                          id="new-col-input"
                          placeholder="Type new collection name + press Enter"
                          style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}
                          onKeyDown={async (e) => {
                            if (e.key !== "Enter") return;
                            const name = e.currentTarget.value.trim();
                            if (!name || storeCollections.includes(name) || !seller) return;
                            const updated = [...storeCollections, name];
                            setStoreCollections(updated);
                            await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                            setSeller({ ...seller, collections: updated });
                            setFormCategory(name);
                            e.currentTarget.value = "";
                          }}
                        />
                        <button type="button" onClick={async () => {
                          const input = document.getElementById("new-col-input") as HTMLInputElement;
                          const name = input?.value.trim();
                          if (!name || storeCollections.includes(name) || !seller) return;
                          const updated = [...storeCollections, name];
                          setStoreCollections(updated);
                          await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                          setSeller({ ...seller, collections: updated });
                          setFormCategory(name);
                          if (input) input.value = "";
                        }} style={{ padding: "9px 14px", background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>+ Create</button>
                      </div>
                    )}`
);

// ── 9. REMOVE QUICK ADD BUTTON ────────────────────────────────────────────────
patch(
  'Remove Quick Add button',
  `                <button onClick={() => { if (!canAddProduct) { alert("Plan limit reached."); return; } setShowForm(false); setQuickAdd(!quickAdd); }} style={{ padding: "12px 18px", background: quickAdd ? "rgba(255,255,255,0.03)" : "rgba(34,197,94,0.06)", border: quickAdd ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(34,197,94,0.12)", borderRadius: 100, color: quickAdd ? "rgba(245,245,245,0.4)" : "#22c55e", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, letterSpacing: "0.04em" }}>{quickAdd ? "Close" : "Quick Add"}</button>`,
  ``
);

// ── 10. REMOVE QUICK ADD FORM BLOCK ──────────────────────────────────────────
patch(
  'Remove Quick Add form block',
  `            {/* QUICK ADD */}
            {quickAdd && (
              <div style={{ padding: "20px", background: "rgba(34,197,94,0.02)", border: "1px solid rgba(34,197,94,0.08)", borderRadius: 16, marginBottom: 16 }}>
                <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap" as const }}>
                  <div style={{ flex: 1, minWidth: 120 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4, display: "block" }}>Name</label>
                    <input type="text" value={qaName} onChange={(e) => setQaName(e.target.value)} placeholder="Product name" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  <div style={{ width: 100 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4, display: "block" }}>Price (R)</label>
                    <input type="text" inputMode="numeric" value={qaPrice} onChange={(e) => setQaPrice(e.target.value.replace(/[^0-9.]/g, ""))} placeholder="299" style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>
                  <div style={{ width: 120 }}>
                    <label style={{ fontSize: 10, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 4, display: "block" }}>Collection</label>
                    <select value={qaCategory} onChange={(e) => setQaCategory(e.target.value)} style={{ width: "100%", padding: "12px 10px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}>
                      <option value="" style={{ background: "#0a0a0a" }}>None</option>
                      {storeCollections.map((c) => <option key={c} value={c} style={{ background: "#0a0a0a" }}>{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", overflow: "hidden" }}>
                      {qaPreview ? <img src={qaPreview} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontSize: 18, color: "rgba(245,245,245,0.15)" }}>+</span>}
                      <input type="file" accept="image/*" onChange={(e) => { const f = e.target.files?.[0]; if (!f) return; setQaImage(f); const r = new FileReader(); r.onload = (ev) => setQaPreview(ev.target?.result as string); r.readAsDataURL(f); }} style={{ display: "none" }} />
                    </label>
                  </div>
                  <button onClick={quickAddSave} disabled={qaSaving || !qaName || !qaPrice} style={{ padding: "12px 24px", background: "#22c55e", color: "#fff", border: "none", borderRadius: 10, fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 12, fontWeight: 800, cursor: (qaSaving || !qaName || !qaPrice) ? "not-allowed" : "pointer", opacity: (qaSaving || !qaName || !qaPrice) ? 0.5 : 1, textTransform: "uppercase" as const, letterSpacing: "0.04em", whiteSpace: "nowrap" as const }}>{qaSaving ? "..." : "Save"}</button>
                </div>
                <p style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", marginTop: 8 }}>Quick add saves instantly. Edit details later.</p>
              </div>
            )}`,
  ``
);

// ── 11. SHOW compare price crossed out in product list ────────────────────────
patch(
  'Show compare price in product list',
  `                    <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em", whiteSpace: "nowrap" as const }}>R{product.price}</div>`,
  `                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                      <div style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.03em", whiteSpace: "nowrap" as const, color: product.old_price ? "#ff6b35" : "#f5f5f5" }}>R{product.price}</div>
                      {product.old_price && <div style={{ fontSize: 11, color: "rgba(245,245,245,0.25)", textDecoration: "line-through", whiteSpace: "nowrap" as const }}>R{product.old_price}</div>}
                    </div>`
);


// ── 12. MOVE IMAGES TO TOP OF FORM ───────────────────────────────────────────
patch(
  'Move images to top of product form',
  `              <form onSubmit={handleSubmit}>
                <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Name</label>
                    <input type="text" placeholder="e.g. Oversized Graphic Tee" value={formName} onChange={(e) => setFormName(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>`,
  `              <form onSubmit={handleSubmit}>

                {/* IMAGES FIRST */}
                <div style={{ marginBottom: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Photos (max {maxImages})</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {existingImages.map((url, i) => (<div key={"e" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeExistingImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && formImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: "#ff6b35", color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {formPreviews.map((p, i) => (<div key={"n" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeNewImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && existingImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: "#ff6b35", color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {totalImageSlots < maxImages && (<button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 2 }}><span style={{ fontSize: 20, color: "rgba(245,245,245,0.2)" }}>+</span><span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Photo</span></button>)}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                  </div>
                  <p style={{ fontSize: 10, color: "rgba(245,245,245,0.2)", marginTop: 6 }}>First photo is the main product image shown in your store.</p>
                </div>

                <div className="form-grid-3" style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Name</label>
                    <input type="text" placeholder="e.g. Oversized Graphic Tee" value={formName} onChange={(e) => setFormName(e.target.value)} required style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }} />
                  </div>`
);

// ── 13. REMOVE OLD IMAGES SECTION (now moved to top) ─────────────────────────
patch(
  'Remove old images section from middle of form',
  `                {/* Images */}
                <div style={{ marginTop: 20 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Product Images (max {maxImages})</label>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" as const, marginTop: 8 }}>
                    {existingImages.map((url, i) => (<div key={"e" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeExistingImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && formImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {formPreviews.map((p, i) => (<div key={"n" + i} style={{ width: 80, height: 80, borderRadius: 10, overflow: "hidden", position: "relative" as const, border: "1px solid rgba(255,255,255,0.08)" }}><img src={p} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" as const }} /><button type="button" onClick={() => removeNewImage(i)} style={{ position: "absolute" as const, top: 3, right: 3, width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.7)", border: "none", color: "#fff", fontSize: 10, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>&#10005;</button>{i === 0 && existingImages.length === 0 && <div style={{ position: "absolute" as const, bottom: 3, left: 3, padding: "1px 6px", background: N, color: "#fff", borderRadius: 4, fontSize: 8, fontWeight: 700, textTransform: "uppercase" as const }}>Main</div>}</div>))}
                    {totalImageSlots < maxImages && (<button type="button" onClick={() => fileInputRef.current?.click()} style={{ width: 80, height: 80, borderRadius: 10, border: "1px dashed rgba(255,255,255,0.1)", background: "rgba(255,255,255,0.02)", cursor: "pointer", display: "flex", flexDirection: "column" as const, alignItems: "center", justifyContent: "center", gap: 2 }}><span style={{ fontSize: 20, color: "rgba(245,245,245,0.2)" }}>+</span><span style={{ fontSize: 9, color: "rgba(245,245,245,0.2)", textTransform: "uppercase" as const, fontWeight: 700 }}>Photo</span></button>)}
                    <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileSelect} style={{ display: "none" }} />
                  </div>
                </div>`,
  ``
);


// ── 14. REMOVE COLLECTION FROM GRID (moving it after variants) ────────────────
patch(
  'Remove collection from grid row',
  `                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const }}>Collection</label>
                    <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const }}>
                      <option value="" style={{ background: "#080808" }}>No collection</option>
                      {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "#080808" }}>{c}</option>))}
                      <option value="__new__" style={{ background: "#080808", color: "#ff6b35" }}>+ Create new collection...</option>
                    </select>
                    {(formCategory === "" || formCategory === "__new__") && (
                      <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                        <input
                          type="text"
                          id="new-col-input"
                          placeholder="Type new collection name + press Enter"
                          style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}
                          onKeyDown={async (e) => {
                            if (e.key !== "Enter") return;
                            const name = e.currentTarget.value.trim();
                            if (!name || storeCollections.includes(name) || !seller) return;
                            const updated = [...storeCollections, name];
                            setStoreCollections(updated);
                            await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                            setSeller({ ...seller, collections: updated });
                            setFormCategory(name);
                            e.currentTarget.value = "";
                          }}
                        />
                        <button type="button" onClick={async () => {
                          const input = document.getElementById("new-col-input") as HTMLInputElement;
                          const name = input?.value.trim();
                          if (!name || storeCollections.includes(name) || !seller) return;
                          const updated = [...storeCollections, name];
                          setStoreCollections(updated);
                          await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                          setSeller({ ...seller, collections: updated });
                          setFormCategory(name);
                          if (input) input.value = "";
                        }} style={{ padding: "9px 14px", background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>+ Create</button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Variants */}
                <div style={{ marginTop: 24 }}>`,
  `                </div>

                {/* Variants */}
                <div style={{ marginTop: 24 }}>`
);

// ── 15. INSERT COLLECTION AFTER VARIANTS ──────────────────────────────────────
patch(
  'Insert collection after variants',
  `                {uploadProgress && <div style={{ marginTop: 12, fontSize: 12, color: N }}>{uploadProgress}</div>}
                <button type="submit"`,
  `                {/* Collection */}
                <div style={{ marginTop: 24 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: "rgba(245,245,245,0.35)", letterSpacing: "0.1em", textTransform: "uppercase" as const, marginBottom: 6, display: "block" }}>Collection</label>
                  <select value={formCategory} onChange={(e) => setFormCategory(e.target.value)} style={{ width: "100%", padding: "12px 14px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, color: "#f5f5f5", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", appearance: "none" as const, WebkitAppearance: "none" as const }}>
                    <option value="" style={{ background: "#080808" }}>No collection</option>
                    {storeCollections.map((c) => (<option key={c} value={c} style={{ background: "#080808" }}>{c}</option>))}
                    <option value="__new__" style={{ background: "#080808", color: "#ff6b35" }}>+ Create new collection...</option>
                  </select>
                  {(formCategory === "" || formCategory === "__new__") && (
                    <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                      <input
                        type="text"
                        id="new-col-input"
                        placeholder="Type new collection name + press Enter"
                        style={{ flex: 1, padding: "9px 12px", background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#f5f5f5", fontSize: 12, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none" }}
                        onKeyDown={async (e) => {
                          if (e.key !== "Enter") return;
                          const name = e.currentTarget.value.trim();
                          if (!name || storeCollections.includes(name) || !seller) return;
                          const updated = [...storeCollections, name];
                          setStoreCollections(updated);
                          await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                          setSeller({ ...seller, collections: updated });
                          setFormCategory(name);
                          e.currentTarget.value = "";
                        }}
                      />
                      <button type="button" onClick={async () => {
                        const input = document.getElementById("new-col-input") as HTMLInputElement;
                        const name = input?.value.trim();
                        if (!name || storeCollections.includes(name) || !seller) return;
                        const updated = [...storeCollections, name];
                        setStoreCollections(updated);
                        await supabase.from("sellers").update({ collections: updated }).eq("id", seller.id);
                        setSeller({ ...seller, collections: updated });
                        setFormCategory(name);
                        if (input) input.value = "";
                      }} style={{ padding: "9px 14px", background: "rgba(255,107,53,0.1)", border: "1px solid rgba(255,107,53,0.2)", borderRadius: 8, color: "#ff6b35", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 11, fontWeight: 800, cursor: "pointer", textTransform: "uppercase" as const, whiteSpace: "nowrap" as const }}>+ Create</button>
                    </div>
                  )}
                </div>

                {uploadProgress && <div style={{ marginTop: 12, fontSize: 12, color: N }}>{uploadProgress}</div>}
                <button type="submit"`
);

// ── Write output ──────────────────────────────────────────────────────────────
fs.writeFileSync(filePath, content, 'utf8');
console.log(`\n${applied}/15 patches applied to ${filePath}`);
console.log('Done! Push to deploy.');