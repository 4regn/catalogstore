"use client";

import { useState, useRef, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

// ── TYPES ────────────────────────────────────────────────
interface ProductData {
  name: string;
  price: string;
}

interface InsightData {
  label: string;
  value: string;
}

interface StoreData {
  storeName: string;
  tagline: string;
  storeSlug: string;
  products: ProductData[];
  insight1: InsightData;
  insight2: InsightData;
  insight3: InsightData;
}

interface UploadedImage {
  dataUrl: string;
  base64: string;
  mediaType: string;
  fileName: string;
}

type Template = "gc" | "sl";
type Stage = "upload" | "loading" | "preview";

const MAX_PRODUCTS = 10;
const MIN_PRODUCTS = 4;

const LOADING_STEPS = [
  "Analysing your product photos...",
  "Generating product names & prices...",
  "Crafting your store name & tagline...",
  "Designing your storefront layout...",
  "Putting it all together...",
];

// ── STORE HTML BUILDERS ──────────────────────────────────

function buildGlassChromeHTML(storeData: StoreData, images: UploadedImage[], logoDataUrl: string | null): string {
  const products = storeData.products.slice(0, 6);
  const heroImg = images[0]?.dataUrl ?? "";
  const logoImg = logoDataUrl ?? "";

  const productCards = products.map((p, i) => `
    <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);overflow:hidden;cursor:pointer;transition:transform 0.3s" onmouseover="this.style.transform='translateY(-4px)'" onmouseout="this.style.transform='translateY(0)'">
      <div style="aspect-ratio:3/4;overflow:hidden;background:#111118">
        ${images[i] ? `<img src="${images[i].dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#111118,#1a1a24)"></div>`}
      </div>
      <div style="padding:10px 12px;border-top:1px solid rgba(255,255,255,0.04)">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:rgba(255,255,255,0.75);margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:12px;font-weight:800;color:#ff6b35">${p.price}</div>
      </div>
    </div>
  `).join("");

  const tickerItems = ["Free Delivery Over R500", "New Arrivals Weekly", "Secure Checkout", "South African Brand"];
  const tickerHtml = [...tickerItems, ...tickerItems].map(t =>
    `<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:0 32px;display:inline-flex;align-items:center;gap:14px"><span style="width:4px;height:4px;border-radius:50%;background:#ff6b35;flex-shrink:0"></span>${t}</span>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;600;700;800;900&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#08080c;color:#f0f0f0;font-family:'Schibsted Grotesk',sans-serif;overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#08080c}::-webkit-scrollbar-thumb{background:#ff6b35;border-radius:2px}@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}</style>
</head><body>
<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(8,8,12,0.95);position:sticky;top:0;z-index:10;backdrop-filter:blur(20px)">
  <div style="display:flex;align-items:center;gap:10px">
    ${logoImg ? `<img src="${logoImg}" style="width:30px;height:30px;object-fit:contain;border-radius:6px">` : ""}
    <span style="font-size:14px;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em">${storeData.storeName}</span>
  </div>
  <div style="display:flex;gap:14px;align-items:center;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35)">
    <span>Shop</span><span>Collections</span>
    <span style="padding:8px 16px;border-radius:100px;background:linear-gradient(135deg,#ff6b35,#ff3d6e);color:#fff;font-size:10px">Cart (0)</span>
  </div>
</div>
<div style="position:relative;height:280px;overflow:hidden;display:flex;align-items:flex-end">
  ${heroImg ? `<img src="${heroImg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.55">` : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#111118,#1a1a24)"></div>`}
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(8,8,12,0.97) 0%,rgba(8,8,12,0.3) 55%,transparent 100%)"></div>
  <div style="position:relative;padding:20px 20px 24px;z-index:1">
    <div style="font-size:9px;color:rgba(255,107,53,0.7);text-transform:uppercase;letter-spacing:0.2em;font-weight:700;margin-bottom:6px">— ${storeData.tagline}</div>
    <div style="font-size:32px;font-weight:900;text-transform:uppercase;letter-spacing:-0.04em;line-height:1">${storeData.storeName}</div>
    <div style="display:inline-block;margin-top:14px;padding:10px 22px;border-radius:100px;background:linear-gradient(135deg,#ff6b35,#ff3d6e);color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em">Shop the Collection</div>
  </div>
</div>
<div style="overflow:hidden;border-top:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);padding:10px 0;background:rgba(255,107,53,0.03)">
  <div style="display:flex;white-space:nowrap;animation:marquee 14s linear infinite">${tickerHtml}</div>
</div>
<div style="padding:20px 16px">
  <div style="font-size:9px;font-weight:800;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.25);margin-bottom:14px">All Products</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px">${productCards}</div>
</div>
<div style="padding:20px;border-top:1px solid rgba(255,255,255,0.04);text-align:center;font-size:9px;color:rgba(255,255,255,0.2);text-transform:uppercase;letter-spacing:0.1em">
  © 2026 ${storeData.storeName} · Powered by CatalogStore
</div>
</body></html>`;
}

function buildSoftLuxuryHTML(storeData: StoreData, images: UploadedImage[], logoDataUrl: string | null): string {
  const products = storeData.products.slice(0, 6);
  const heroImg = images[0]?.dataUrl ?? "";
  const logoImg = logoDataUrl ?? "";

  const productCards = products.map((p, i) => `
    <div style="background:#fff;overflow:hidden;cursor:pointer;transition:box-shadow 0.3s" onmouseover="this.style.boxShadow='0 8px 30px rgba(0,0,0,0.08)'" onmouseout="this.style.boxShadow='none'">
      <div style="aspect-ratio:3/4;overflow:hidden;background:#f0ebe4">
        ${images[i] ? `<img src="${images[i].dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="width:100%;height:100%;background:#ede8e2"></div>`}
      </div>
      <div style="padding:10px 12px;border-top:1px solid rgba(0,0,0,0.04)">
        <div style="font-size:11px;font-weight:300;letter-spacing:0.04em;color:rgba(42,42,46,0.65);margin-bottom:3px;font-family:'Georgia',serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
        <div style="font-size:12px;font-weight:600;color:#9c7c62;font-family:sans-serif">${p.price}</div>
      </div>
    </div>
  `).join("");

  const tickerItems = ["Free Delivery Over R500", "Curated Collections", "Secure Checkout", "Proudly South African"];
  const tickerHtml = [...tickerItems, ...tickerItems].map(t =>
    `<span style="font-size:9px;font-weight:400;letter-spacing:0.2em;text-transform:uppercase;color:rgba(42,42,46,0.3);padding:0 32px;display:inline-flex;align-items:center;gap:14px"><span style="width:3px;height:3px;border-radius:50%;background:#9c7c62;flex-shrink:0"></span>${t}</span>`
  ).join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;1,300;1,400&family=Jost:wght@300;400;500&display=swap" rel="stylesheet">
<style>*{margin:0;padding:0;box-sizing:border-box}body{background:#f6f3ef;color:#2a2a2e;font-family:'Jost',sans-serif;overflow-x:hidden}::-webkit-scrollbar{width:4px}::-webkit-scrollbar-track{background:#f6f3ef}::-webkit-scrollbar-thumb{background:#c4a882;border-radius:2px}@keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}</style>
</head><body>
<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(0,0,0,0.06);background:rgba(246,243,239,0.95);position:sticky;top:0;z-index:10;backdrop-filter:blur(20px)">
  <div style="display:flex;align-items:center;gap:10px">
    ${logoImg ? `<img src="${logoImg}" style="width:28px;height:28px;object-fit:contain;border-radius:4px">` : ""}
    <span style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;letter-spacing:0.1em;text-transform:uppercase">${storeData.storeName}</span>
  </div>
  <div style="display:flex;gap:16px;align-items:center;font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:0.12em;color:rgba(42,42,46,0.4)">
    <span>Shop</span><span>Collections</span><span>Search</span><span>Bag (0)</span>
  </div>
</div>
<div style="position:relative;height:280px;overflow:hidden;display:flex;align-items:flex-end">
  ${heroImg ? `<img src="${heroImg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : `<div style="position:absolute;inset:0;background:#e8e2da"></div>`}
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(246,243,239,0.97) 0%,rgba(246,243,239,0.15) 55%,transparent 100%)"></div>
  <div style="position:relative;padding:20px 20px 24px;z-index:1">
    <div style="font-size:9px;color:rgba(42,42,46,0.4);text-transform:uppercase;letter-spacing:0.2em;font-weight:400;margin-bottom:6px">${storeData.tagline}</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:34px;font-weight:300;letter-spacing:0.04em;line-height:1;font-style:italic;color:#2a2a2e">${storeData.storeName}</div>
    <div style="display:inline-block;margin-top:14px;padding:10px 24px;border:1px solid rgba(42,42,46,0.25);color:#2a2a2e;font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:0.14em">Shop the Collection →</div>
  </div>
</div>
<div style="overflow:hidden;border-top:1px solid rgba(0,0,0,0.05);border-bottom:1px solid rgba(0,0,0,0.05);padding:9px 0;background:rgba(0,0,0,0.015)">
  <div style="display:flex;white-space:nowrap;animation:marquee 14s linear infinite">${tickerHtml}</div>
</div>
<div style="padding:20px 16px">
  <div style="font-family:'Cormorant Garamond',serif;font-size:16px;font-weight:300;letter-spacing:0.06em;color:rgba(42,42,46,0.45);margin-bottom:14px;font-style:italic">All Products</div>
  <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:2px">${productCards}</div>
</div>
<div style="padding:20px;border-top:1px solid rgba(0,0,0,0.05);text-align:center;font-size:9px;color:rgba(42,42,46,0.25);text-transform:uppercase;letter-spacing:0.12em">
  © 2026 ${storeData.storeName} · Powered by CatalogStore
</div>
</body></html>`;
}

// ── MAIN COMPONENT ────────────────────────────────────────
export default function StorePreview() {
  const [stage, setStage] = useState<Stage>("upload");
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [productImages, setProductImages] = useState<UploadedImage[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template>("gc");
  const [storeData, setStoreData] = useState<StoreData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingStep, setLoadingStep] = useState(0);

  const logoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);

  const isReady = !!logoDataUrl && productImages.length >= MIN_PRODUCTS;

  // ── FILE READING HELPER ──────────────────────────────────
  const readFile = (file: File): Promise<UploadedImage> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(",")[1];
        resolve({ dataUrl, base64, mediaType: file.type, fileName: file.name });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  // ── LOGO UPLOAD ──────────────────────────────────────────
  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = await readFile(file);
    setLogoDataUrl(img.dataUrl);
  }, []);

  // ── PRODUCT UPLOAD ───────────────────────────────────────
  const handleProductUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = MAX_PRODUCTS - productImages.length;
    const toRead = files.slice(0, remaining);
    const newImages = await Promise.all(toRead.map(readFile));
    setProductImages(prev => [...prev, ...newImages]);
    e.target.value = "";
  }, [productImages.length]);

  const removeProduct = useCallback((index: number) => {
    setProductImages(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── GENERATE ─────────────────────────────────────────────
  const generatePreview = useCallback(async () => {
    if (!isReady) return;
    setError(null);
    setStage("loading");
    setLoadingStep(0);

    // Animate loading steps
    LOADING_STEPS.forEach((_, i) => {
      setTimeout(() => setLoadingStep(i), i * 1600);
    });

    try {
      // Only send base64 + mediaType — no API keys, no secrets
      const payload = {
        images: productImages.map(img => ({
          base64: img.base64,
          mediaType: img.mediaType,
        })),
        template: selectedTemplate,
      };

      // Calls YOUR API route — key lives only on the server
      const res = await fetch("/api/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json();

      if (!res.ok || !json.success) {
        throw new Error(json.error ?? "Something went wrong. Please try again.");
      }

      setStoreData(json.data);
      await new Promise(r => setTimeout(r, 800)); // let final step animate
      setStage("preview");

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      setStage("upload");
    }
  }, [isReady, productImages, selectedTemplate]);

  const reset = useCallback(() => {
    setStage("upload");
    setLogoDataUrl(null);
    setProductImages([]);
    setSelectedTemplate("gc");
    setStoreData(null);
    setError(null);
    setLoadingStep(0);
  }, []);

  // ── STYLES ───────────────────────────────────────────────
  const s = {
    section: { padding: "100px 0" } as React.CSSProperties,
    sectionLabel: {
      fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.15em",
      color: "var(--neon)", fontWeight: 800, marginBottom: 16, textAlign: "center" as const,
      display: "flex", alignItems: "center", justifyContent: "center", gap: 12,
    },
    card: {
      background: "var(--glass)", border: "1px solid var(--glass-b)",
      borderRadius: 24, padding: "48px", position: "relative" as const, overflow: "hidden" as const,
    },
    uploadTitle: {
      fontSize: 11, textTransform: "uppercase" as const, letterSpacing: "0.12em",
      color: "var(--neon)", fontWeight: 800, marginBottom: 20,
      display: "flex", alignItems: "center", gap: 10,
    },
  };

  // ── RENDER: UPLOAD ───────────────────────────────────────
  const renderUpload = () => (
    <div style={s.card}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad)" }} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40 }}>

        {/* LEFT */}
        <div>
          {/* LOGO */}
          <div style={{ marginBottom: 36 }}>
            <div style={s.uploadTitle}>
              Your Logo
              <span style={{ flex: 1, height: 1, background: "rgba(255,107,53,0.15)" }} />
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
              <div
                onClick={() => logoInputRef.current?.click()}
                style={{
                  width: 120, height: 120, borderRadius: 16, flexShrink: 0,
                  border: logoDataUrl ? "2px solid rgba(255,107,53,0.4)" : "2px dashed rgba(255,255,255,0.1)",
                  display: "flex", flexDirection: "column", alignItems: "center",
                  justifyContent: "center", gap: 8, cursor: "pointer",
                  transition: "border-color 0.3s, background 0.3s",
                  background: logoDataUrl ? "transparent" : "rgba(255,107,53,0.03)",
                  overflow: "hidden", position: "relative",
                }}
              >
                {logoDataUrl
                  ? <img src={logoDataUrl} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 10 }} />
                  : <>
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline points="21 15 16 10 5 21" /></svg>
                    <span style={{ fontSize: 10, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.6, fontWeight: 500 }}>Click to<br />upload logo</span>
                  </>
                }
              </div>
              <div style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.8 }}>
                PNG or SVG with transparent<br />background works best.<br />
                <span style={{ color: logoDataUrl ? "var(--green)" : "var(--text-muted)" }}>
                  {logoDataUrl ? "✓ Logo uploaded" : "Required"}
                </span>
              </div>
            </div>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
          </div>

          {/* TEMPLATE */}
          <div>
            <div style={s.uploadTitle}>
              Choose Template
              <span style={{ flex: 1, height: 1, background: "rgba(255,107,53,0.15)" }} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {(["gc", "sl"] as Template[]).map(id => {
                const isGc = id === "gc";
                const selected = selectedTemplate === id;
                return (
                  <div
                    key={id}
                    onClick={() => setSelectedTemplate(id)}
                    style={{
                      borderRadius: 14, border: selected ? "2px solid var(--neon)" : "2px solid var(--glass-b)",
                      cursor: "pointer", overflow: "hidden",
                      boxShadow: selected ? "0 0 0 1px var(--neon), 0 8px 32px rgba(255,107,53,0.15)" : "none",
                      transition: "border-color 0.3s, box-shadow 0.3s",
                      position: "relative",
                    }}
                  >
                    {selected && (
                      <div style={{
                        position: "absolute", top: 8, right: 8, width: 20, height: 20,
                        borderRadius: "50%", background: "var(--neon)", color: "#fff",
                        fontSize: 11, fontWeight: 900, display: "flex", alignItems: "center",
                        justifyContent: "center", zIndex: 2,
                      }}>✓</div>
                    )}
                    <div style={{
                      height: 80, display: "flex", alignItems: "center", justifyContent: "center",
                      background: isGc ? "linear-gradient(135deg,#0a0a0e,#1a1a24)" : "linear-gradient(135deg,#f0ebe4,#e8e2da)",
                      borderBottom: isGc ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)",
                      fontSize: isGc ? 9 : 12,
                      color: isGc ? "rgba(255,255,255,0.3)" : "rgba(42,42,46,0.35)",
                      fontFamily: isGc ? "'Schibsted Grotesk', sans-serif" : "'Georgia', serif",
                      letterSpacing: isGc ? "0.12em" : "0.04em",
                      fontStyle: isGc ? "normal" : "italic",
                      textTransform: isGc ? "uppercase" : "none",
                    }}>
                      {isGc ? "GLASS CHROME" : "Soft Luxury"}
                    </div>
                    <div style={{ padding: "12px 14px", background: "rgba(255,255,255,0.02)" }}>
                      <div style={{ fontSize: 11, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 3 }}>
                        {isGc ? "Glass Chrome" : "Soft Luxury"}
                      </div>
                      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>
                        {isGc ? "Dark, futuristic, chrome" : "Warm cream, elegant"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* RIGHT — PRODUCT PHOTOS */}
        <div>
          <div style={s.uploadTitle}>
            Product Photos
            <span style={{ fontSize: 10, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)" }}>
              ({productImages.length}/{MAX_PRODUCTS})
            </span>
            <span style={{ flex: 1, height: 1, background: "rgba(255,107,53,0.15)" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 8 }}>
            {Array.from({ length: MAX_PRODUCTS }).map((_, i) => {
              const img = productImages[i];
              const isAddSlot = i === productImages.length && i < MAX_PRODUCTS;
              return (
                <div
                  key={i}
                  onClick={isAddSlot || !img ? () => productInputRef.current?.click() : undefined}
                  style={{
                    aspectRatio: "3/4", borderRadius: 10, overflow: "hidden", position: "relative",
                    border: img ? "2px solid rgba(255,107,53,0.2)" : "2px dashed rgba(255,255,255,0.07)",
                    background: img ? "transparent" : "rgba(255,255,255,0.01)",
                    cursor: img ? "default" : "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    transition: "border-color 0.3s",
                  }}
                >
                  {img ? (
                    <>
                      <Image src={img.dataUrl} alt={`Product ${i + 1}`} fill style={{ objectFit: "cover" }} unoptimized />
                      <button
                        onClick={(e) => { e.stopPropagation(); removeProduct(i); }}
                        style={{
                          position: "absolute", top: 4, right: 4, width: 20, height: 20,
                          borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)",
                          color: "#fff", fontSize: 12, cursor: "pointer", display: "flex",
                          alignItems: "center", justifyContent: "center", zIndex: 2, lineHeight: 1,
                        }}
                      >×</button>
                    </>
                  ) : isAddSlot ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  ) : (
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.12)", fontWeight: 700 }}>{i + 1}</span>
                  )}
                </div>
              );
            })}
          </div>
          <input ref={productInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleProductUpload} />
          <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 12, lineHeight: 1.7 }}>
            Upload 4–10 product photos. AI will name them, suggest prices, and build your store layout automatically.
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 6, alignItems: "center" }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: productImages.length >= MIN_PRODUCTS ? "var(--green)" : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
            <span style={{ fontSize: 11, color: productImages.length >= MIN_PRODUCTS ? "var(--green)" : "var(--text-muted)" }}>
              {productImages.length < MIN_PRODUCTS
                ? `${MIN_PRODUCTS - productImages.length} more photo${MIN_PRODUCTS - productImages.length > 1 ? "s" : ""} needed`
                : `${productImages.length} photo${productImages.length > 1 ? "s" : ""} ready`}
            </span>
          </div>
        </div>
      </div>

      {/* ERROR */}
      {error && (
        <div style={{ marginTop: 24, padding: "14px 20px", borderRadius: 12, background: "rgba(255,61,110,0.08)", border: "1px solid rgba(255,61,110,0.2)", fontSize: 13, color: "#ff3d6e" }}>
          {error}
        </div>
      )}

      {/* GENERATE BUTTON */}
      <button
        onClick={generatePreview}
        disabled={!isReady}
        style={{
          width: "100%", padding: 20, borderRadius: 100, marginTop: 36,
          background: isReady ? "var(--grad)" : "rgba(255,255,255,0.05)",
          color: isReady ? "#fff" : "rgba(255,255,255,0.25)",
          border: "none", fontFamily: "'Schibsted Grotesk', sans-serif",
          fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase",
          cursor: isReady ? "pointer" : "not-allowed",
          boxShadow: isReady ? "0 0 40px rgba(255,107,53,0.2)" : "none",
          transition: "all 0.3s",
        }}
      >
        ✦ Generate My Store Preview
      </button>
      <p style={{ textAlign: "center", fontSize: 11, color: "var(--text-muted)", marginTop: 14 }}>
        Takes about 10 seconds · No account needed · 100% free
      </p>
    </div>
  );

  // ── RENDER: LOADING ──────────────────────────────────────
  const renderLoading = () => (
    <div style={{ textAlign: "center", padding: "80px 40px" }}>
      <div style={{
        width: 64, height: 64, borderRadius: "50%", border: "2px solid var(--glass-b)",
        borderTopColor: "var(--neon)", animation: "spin 1s linear infinite", margin: "0 auto 24px",
      }} />
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Building your store...</div>
      <div style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 40 }}>AI is analysing your photos and crafting your storefront</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, maxWidth: 320, margin: "0 auto" }}>
        {LOADING_STEPS.map((step, i) => (
          <div
            key={i}
            style={{
              fontSize: 12, display: "flex", alignItems: "center", gap: 10,
              padding: "10px 18px", background: "var(--glass)", borderRadius: 100,
              border: "1px solid var(--glass-b)",
              opacity: i <= loadingStep ? 1 : 0.2,
              color: i < loadingStep ? "var(--green)" : i === loadingStep ? "var(--text)" : "var(--text-muted)",
              transition: "all 0.4s",
            }}
          >
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
            {step}
          </div>
        ))}
      </div>
    </div>
  );

  // ── RENDER: PREVIEW ──────────────────────────────────────
  const renderPreview = () => {
    if (!storeData) return null;
    const storeHtml = selectedTemplate === "gc"
      ? buildGlassChromeHTML(storeData, productImages, logoDataUrl)
      : buildSoftLuxuryHTML(storeData, productImages, logoDataUrl);

    return (
      <div>
        {/* HEADER */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "8px 18px", borderRadius: 100, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 11, color: "var(--green)", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12" /></svg>
            Your Store Preview is Ready
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={reset} style={{ padding: "11px 22px", borderRadius: 100, background: "var(--glass)", border: "1px solid var(--glass-b)", color: "var(--text-dim)", fontSize: 12, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Schibsted Grotesk', sans-serif", transition: "color 0.2s, border-color 0.2s" }}>
              Try Again
            </button>
            <Link href="/signup" style={{ padding: "11px 22px", borderRadius: 100, background: "var(--grad)", color: "#fff", fontSize: 12, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none", transition: "transform 0.2s, box-shadow 0.2s" }}>
              Claim This Store →
            </Link>
          </div>
        </div>

        {/* BROWSER FRAME */}
        <div style={{ borderRadius: 20, overflow: "hidden", border: "1px solid var(--glass-b)", boxShadow: "0 40px 100px rgba(0,0,0,0.5)", position: "relative" }}>
          <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad)", zIndex: 1 }} />
          <div style={{ background: "rgba(10,10,14,0.95)", padding: "12px 20px", display: "flex", alignItems: "center", gap: 12, borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["#ff5f57", "#ffbd2e", "#28c840"].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 6, padding: "5px 14px", fontSize: 11, color: "var(--text-muted)", textAlign: "center" }}>
              {storeData.storeSlug}.catalogstore.co.za
            </div>
          </div>
          <iframe srcDoc={storeHtml} style={{ width: "100%", height: 680, border: "none", display: "block" }} title="Store Preview" />
        </div>

        {/* INSIGHTS */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, marginTop: 16 }}>
          {[storeData.insight1, storeData.insight2, storeData.insight3].map((ins, i) => (
            <div key={i} style={{ background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--neon)", fontWeight: 800, marginBottom: 8 }}>{ins.label}</div>
              <div style={{ fontSize: 13, color: "var(--text-dim)", lineHeight: 1.6 }}>{ins.value}</div>
            </div>
          ))}
        </div>

        {/* CTA */}
        <div style={{ marginTop: 24, padding: "48px 40px", background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 20, textAlign: "center", position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(255,107,53,0.1) 0%,transparent 60%)", pointerEvents: "none" }} />
          <h3 style={{ fontSize: "clamp(20px,3vw,30px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.03em", marginBottom: 12, position: "relative" }}>
            Ready to go live?
          </h3>
          <p style={{ fontSize: 14, color: "var(--text-dim)", marginBottom: 28, position: "relative" }}>
            Your store is one click away. Start your 7-day free trial — no credit card needed.
          </p>
          <Link href="/signup" style={{ display: "inline-block", padding: "18px 48px", borderRadius: 100, background: "var(--grad)", color: "#fff", fontFamily: "'Schibsted Grotesk', sans-serif", fontSize: 14, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none", boxShadow: "0 0 40px rgba(255,107,53,0.25)" }}>
            Start Free Trial — R49 First Month
          </Link>
        </div>
      </div>
    );
  };

  // ── MAIN RENDER ──────────────────────────────────────────
  return (
    <>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:0.6;transform:scale(1)} 50%{opacity:1;transform:scale(1.2)} }
      `}</style>
      <section id="preview" style={s.section}>
        <div style={s.sectionLabel}>
          <span style={{ flex: "0 0 24px", height: 1, background: "rgba(255,107,53,0.3)" }} />
          AI Store Builder
          <span style={{ flex: "0 0 24px", height: 1, background: "rgba(255,107,53,0.3)" }} />
        </div>
        <h2 style={{ textAlign: "center", fontSize: "clamp(28px,5vw,56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase", marginBottom: 16 }}>
          See your store<br />
          <span style={{ background: "var(--grad)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
            before you build it.
          </span>
        </h2>
        <p style={{ textAlign: "center", fontSize: 15, color: "var(--text-dim)", maxWidth: 480, margin: "0 auto 52px", lineHeight: 1.8 }}>
          Upload your logo and product photos. Pick a template. Watch AI turn them into a live store preview in seconds.
        </p>

        {stage === "upload" && renderUpload()}
        {stage === "loading" && renderLoading()}
        {stage === "preview" && renderPreview()}
      </section>
    </>
  );
}