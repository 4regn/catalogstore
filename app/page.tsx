"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";

// ── DATA ────────────────────────────────────────────────────────────────────

const TICKER_ITEMS = [
  "Your Catalog Amplified", "Zero Commission", "WhatsApp Import",
  "Instant Setup", "Professional Stores", "Powered by CatalogStore",
  "South African Built", "Payments on Autopilot",
  "Make Money While You Sleep", "Zero Coding Required",
];

const STARTER_FEATURES = [
  "15 Products", "5 Images Per Product", "5 Collections", "2 Templates",
  "Store Editor", "All Payment Methods", "WhatsApp Checkout", "Subdomain Included",
];

const PRO_FEATURES = [
  "100 Products", "20 Images Per Product", "20 Collections",
  "All Templates (Current + Future)", "Custom Domain Support",
  "No 'Powered by CatalogStore'", "Priority Support", "Everything in Starter",
];

const GC_IMAGES = [
  { src: "https://www.catalogstore.co.za/templates/gc-hero.jpeg",        label: "Hero / Store Front" },
  { src: "https://www.catalogstore.co.za/templates/gc-collections.jpeg", label: "Collections" },
  { src: "https://www.catalogstore.co.za/templates/gc-products.jpeg",    label: "Product Grid" },
  { src: "https://www.catalogstore.co.za/templates/gc-product-detail.jpeg", label: "Product Detail" },
];

const SL_IMAGES = [
  { src: "https://www.catalogstore.co.za/templates/sl-hero.jpeg",        label: "Hero / Store Front" },
  { src: "https://www.catalogstore.co.za/templates/sl-collections.jpeg", label: "Collections" },
  { src: "https://www.catalogstore.co.za/templates/sl-products.jpeg",    label: "Product Grid" },
  { src: "https://www.catalogstore.co.za/templates/sl-product-detail.jpeg", label: "Product Detail" },
];

const PAINS = [
  {
    t: "Endless DMs",
    d: "Replying to the same questions over and over. 'Is this still available?' 'What sizes do you have?'",
    r: "20px 4px 4px 4px",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        <line x1="9" y1="10" x2="9" y2="10" strokeWidth="2.5"/><line x1="12" y1="10" x2="12" y2="10" strokeWidth="2.5"/><line x1="15" y1="10" x2="15" y2="10" strokeWidth="2.5"/>
      </svg>
    ),
  },
  {
    t: "Lost customers",
    d: "They screenshot your products, promise to come back, and never do. No way to follow up.",
    r: "4px 20px 4px 4px",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
        <line x1="19" y1="10" x2="22" y2="13" stroke="#ff3d6e"/><line x1="22" y1="10" x2="19" y2="13" stroke="#ff3d6e"/>
      </svg>
    ),
  },
  {
    t: "Sleeping on sales",
    d: "While you're offline, potential customers are browsing — but there's nowhere to buy.",
    r: "4px 4px 4px 20px",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
        <circle cx="12" cy="12" r="3" fill="rgba(255,107,53,0.15)" stroke="#ff6b35"/>
      </svg>
    ),
  },
  {
    t: "Tech overwhelm",
    d: "You tried Shopify, WooCommerce, or building your own site. It felt like learning to code.",
    r: "4px 4px 20px 4px",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ff6b35" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>
        <path d="M9 8l2 2-2 2" stroke="#ff3d6e"/><line x1="13" y1="12" x2="15" y2="12" stroke="#ff3d6e"/>
      </svg>
    ),
  },
];

const STEPS = [
  { n: "01", t: "Sign Up",    d: "Pick a store name, choose your look. Your store URL is ready instantly. Already on WhatsApp Business? Import your catalog in seconds.", r: "20px 4px 4px 20px" },
  { n: "02", t: "Customize",  d: "Upload products, set prices, organize collections. Use the visual editor to make it yours — colors, logo, banners, policies.",          r: "4px" },
  { n: "03", t: "Sell",       d: "Share your link. Customers browse, select variants, add to cart, and checkout. Orders and payments flow to you automatically.",         r: "4px 20px 20px 4px" },
];

const FAQS = [
  { q: "Do I need technical skills?",              a: "Not at all. If you can post on social media, you can build a store on CatalogStore. Everything is click-to-edit with a visual editor." },
  { q: "Can my customers pay online?",             a: "Yes. You connect your own payment provider like PayFast or set up EFT payments. Customers pay you directly through your store — we never touch your money." },
  { q: "What happens after the free trial?",       a: "After 7 days, your chosen plan activates automatically. Your R1 card verification converts to your first subscription payment." },
  { q: "Can I use my own domain?",                 a: "Yes, on the Pro plan. You get a free subdomain (yourstore.catalogstore.co.za) on all plans, with custom domain support on Pro for a once-off R199 setup fee." },
  { q: "Do you take a percentage of my sales?",    a: "Never. We charge a flat monthly subscription. 100% of your sales revenue goes directly to your account." },
  { q: "Can I import my WhatsApp Business catalog?", a: "Yes. If you already sell on WhatsApp Business, you can import your products automatically. You can also add products manually if you prefer." },
];

// ── LOGO SVG ────────────────────────────────────────────────────────────────

function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff5a36" />
          <stop offset="100%" stopColor="#ff3d6e" />
        </linearGradient>
      </defs>
      <path d="M54 12 A26 26 0 1 0 54 60" stroke="url(#lg1)" strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="57" cy="36" r="6" fill="url(#lg1)" />
      <circle cx="57" cy="36" r="2.4" fill="#0a0a0a" />
    </svg>
  );
}

// ── MAIN COMPONENT ───────────────────────────────────────────────────────────

export default function HomePage() {
  const cursorRef = useRef<HTMLDivElement>(null);
  const cursorRingRef = useRef<HTMLDivElement>(null);
  const [scrolled, setScrolled] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewStage, setPreviewStage] = useState<"upload"|"loading"|"preview">("upload");
  const [previewLogo, setPreviewLogo] = useState<string|null>(null);
  const [previewProducts, setPreviewProducts] = useState<{dataUrl:string;base64:string;mediaType:string}[]>([]);
  const [previewTemplate, setPreviewTemplate] = useState<"gc"|"sl">("gc");
  const [previewStore, setPreviewStore] = useState<{storeName:string;tagline:string;storeSlug:string;brandColor:string;products:{name:string;price:string;category:string}[];collections:{name:string;productIndexes:number[]}[];insight1:{label:string;value:string};insight2:{label:string;value:string};insight3:{label:string;value:string}}|null>(null);
  const [previewError, setPreviewError] = useState<string|null>(null);
  const [previewLoadStep, setPreviewLoadStep] = useState(0);
  const [previewBrandColor, setPreviewBrandColor] = useState("#ff6b35");
  const [previewBrandDesc, setPreviewBrandDesc] = useState("");
  const [previewBrandName, setPreviewBrandName] = useState("");
  const [previewCategory, setPreviewCategory] = useState("");
  const [previewBanner, setPreviewBanner] = useState<{dataUrl:string;base64:string;mediaType:string}|null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const previewPanelRef = useRef<HTMLDivElement>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const ringRef = useRef({ x: 0, y: 0 });

  // Cursor
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouseRef.current = { x: e.clientX, y: e.clientY };
      if (cursorRef.current) {
        cursorRef.current.style.left = e.clientX + "px";
        cursorRef.current.style.top = e.clientY + "px";
      }
    };
    document.addEventListener("mousemove", onMove);
    let raf: number;
    const animate = () => {
      ringRef.current.x += (mouseRef.current.x - ringRef.current.x) * 0.12;
      ringRef.current.y += (mouseRef.current.y - ringRef.current.y) * 0.12;
      if (cursorRingRef.current) {
        cursorRingRef.current.style.left = ringRef.current.x + "px";
        cursorRingRef.current.style.top = ringRef.current.y + "px";
      }
      raf = requestAnimationFrame(animate);
    };
    animate();
    return () => { document.removeEventListener("mousemove", onMove); cancelAnimationFrame(raf); };
  }, []);

  // Cursor expand on hover
  useEffect(() => {
    const expand = () => document.body.classList.add("cursor-expand");
    const shrink = () => document.body.classList.remove("cursor-expand");
    const els = document.querySelectorAll("a, button");
    els.forEach(el => { el.addEventListener("mouseenter", expand); el.addEventListener("mouseleave", shrink); });
    return () => els.forEach(el => { el.removeEventListener("mouseenter", expand); el.removeEventListener("mouseleave", shrink); });
  }, []);

  // Scroll listener
  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 60);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Scroll reveal
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add("visible"); obs.unobserve(e.target); } }),
      { threshold: 0.1, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal,.reveal-left,.reveal-right,.reveal-scale,.stagger-children").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);


  // ── PREVIEW HELPERS ──────────────────────────────────────
  const readFile = (file: File): Promise<{dataUrl:string;base64:string;mediaType:string}> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        resolve({ dataUrl, base64: dataUrl.split(",")[1], mediaType: file.type });
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });

  const handleLogoUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const img = await readFile(file);
    setPreviewLogo(img.dataUrl);
  }, []);

  const handleProductUpload = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const remaining = 10 - previewProducts.length;
    const newImgs = await Promise.all(files.slice(0, remaining).map(readFile));
    setPreviewProducts(prev => [...prev, ...newImgs]);
    e.target.value = "";
  }, [previewProducts.length]);

  const runPreview = useCallback(async () => {
    setPreviewError(null);
    setPreviewStage("loading");
    setPreviewLoadStep(0);
    // Scroll the preview panel into view so seller sees the progress
    setTimeout(() => {
      previewPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 100);
    ["Analysing your product photos...","Generating product names & prices...","Crafting your store name & tagline...","Building your storefront...","Almost done..."].forEach((_,i) => {
      setTimeout(() => setPreviewLoadStep(i), i * 1600);
    });
    try {
      const res = await fetch("/api/generate-preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          images: previewProducts.map(p => ({ base64: p.base64, mediaType: p.mediaType })),
          template: previewTemplate,
          brandColor: previewBrandColor,
          brandDescription: previewBrandDesc,
          brandName: previewBrandName,
          storeCategory: previewCategory,
          bannerImage: previewBanner ? { base64: previewBanner.base64, mediaType: previewBanner.mediaType } : null,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error ?? "Something went wrong.");
      await new Promise(r => setTimeout(r, 800));
      setPreviewStore(json.data);
      setPreviewStage("preview");
    } catch (err: unknown) {
      setPreviewError(err instanceof Error ? err.message : "Something went wrong.");
      setPreviewStage("upload");
    }
  }, [previewProducts, previewTemplate]);

  const resetPreview = useCallback(() => {
    setPreviewStage("upload");
    setPreviewLogo(null);
    setPreviewProducts([]);
    setPreviewTemplate("gc");
    setPreviewStore(null);
    setPreviewError(null);
    setPreviewLoadStep(0);
    setPreviewBrandColor("#ff6b35");
    setPreviewBrandDesc("");
    setPreviewBrandName("");
    setPreviewCategory("");
    setPreviewBanner(null);
  }, []);

  const buildGCStore = useCallback(() => {
    if (!previewStore) return "";
    const bc = previewStore.brandColor || previewBrandColor || "#ff6b35";
    const products = previewStore.products.slice(0, 10);
    const collections = previewStore.collections || [];
    const heroImg = previewBanner?.dataUrl ?? previewProducts[0]?.dataUrl ?? "";
    const logoImg = previewLogo ?? "";
    const storeName = previewStore.storeName;

    // 2-col product grid with SALE pills on first 2 products
    const productCards = products.map((p, i) => {
      const img = previewProducts[i];
      const onSale = i < 2;
      const priceNum = parseInt(p.price.replace(/[^0-9]/g, "")) || 300;
      const originalPrice = onSale ? "R" + Math.round(priceNum / 0.8) : "";
      return `
        <div style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.06);overflow:hidden;cursor:pointer;transition:transform 0.3s,border-color 0.3s" onmouseover="this.style.transform='translateY(-3px)';this.style.borderColor='rgba(255,255,255,0.12)'" onmouseout="this.style.transform='translateY(0)';this.style.borderColor='rgba(255,255,255,0.06)'">
          <div style="aspect-ratio:3/4;overflow:hidden;background:#0d0d12;position:relative">
            ${img ? `<img src="${img.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.4s" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">` : `<div style="width:100%;height:100%;background:linear-gradient(135deg,#111118,#1a1a24)"></div>`}
            ${onSale ? `<div style="position:absolute;top:8px;left:8px;background:${bc};color:#fff;font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;padding:3px 8px;border-radius:4px">Sale</div>` : ""}
          </div>
          <div style="padding:12px 14px;border-top:1px solid rgba(255,255,255,0.04)">
            <div style="font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.12em;color:rgba(255,255,255,0.3);margin-bottom:4px">${p.category || "Product"}</div>
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:rgba(255,255,255,0.85);margin-bottom:6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${p.name}</div>
            <div style="display:flex;align-items:center;gap:8px">
              <div style="font-size:14px;font-weight:800;color:${bc}">${p.price}</div>
              ${onSale ? `<div style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.25);text-decoration:line-through">${originalPrice}</div>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");

    // Collection cards
    const collectionCards = collections.map((col, ci) => {
      const firstIdx = col.productIndexes[0] ?? 0;
      const coverImg = previewProducts[firstIdx]?.dataUrl ?? "";
      return `
        <div style="position:relative;border-radius:10px;overflow:hidden;cursor:pointer;border:1px solid rgba(255,255,255,0.06);aspect-ratio:4/3" onmouseover="this.style.borderColor='rgba(255,255,255,0.15)'" onmouseout="this.style.borderColor='rgba(255,255,255,0.06)'">
          <div style="position:absolute;inset:0;background:#0d0d12">
            ${coverImg ? `<img src="${coverImg}" style="width:100%;height:100%;object-fit:cover;opacity:0.6;display:block">` : ""}
          </div>
          <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(0,0,0,0.85) 0%,transparent 55%)"></div>
          <div style="position:absolute;bottom:0;left:0;padding:14px 16px">
            <div style="font-size:8px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.12em;margin-bottom:4px">${col.productIndexes.length} PIECE${col.productIndexes.length > 1 ? "S" : ""}</div>
            <div style="font-size:13px;font-weight:800;text-transform:uppercase;letter-spacing:0.04em;color:#fff">${col.name}</div>
          </div>
        </div>`;
    }).join("");

    const ticker = ["Free Delivery Over R500","New Arrivals","Secure Checkout","South African Brand",
                    "Free Delivery Over R500","New Arrivals","Secure Checkout","South African Brand"]
      .map(t => `<span style="font-size:10px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:0 28px;display:inline-flex;align-items:center;gap:12px"><span style="width:4px;height:4px;border-radius:50%;background:${bc};flex-shrink:0;display:inline-block"></span>${t}</span>`).join("");

    const collectionsHtml = collections.length > 0 ? `
      <div style="padding:20px 16px 0">
        <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.25);margin-bottom:14px">/ 01 &nbsp; COLLECTIONS</div>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(collections.length, 3)},1fr);gap:8px">${collectionCards}</div>
      </div>` : "";

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Schibsted+Grotesk:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#08080c;color:#f0f0f0;font-family:'Schibsted Grotesk',sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#08080c}::-webkit-scrollbar-thumb{background:${bc};border-radius:2px}
  @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
</style>
<script>
  (function() {
    var total = 12 * 3600 - 1;
    function tick() {
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      var el = document.getElementById("gc-timer");
      if (el) el.textContent = (h<10?"0"+h:h) + ":" + (m<10?"0"+m:m) + ":" + (s<10?"0"+s:s);
      if (total > 0) { total--; setTimeout(tick, 1000); }
    }
    document.addEventListener("DOMContentLoaded", tick);
    setTimeout(tick, 100);
  })();
</script>
</head><body>

<!-- DISCOUNT BANNER -->
<div style="background:rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.06);padding:10px 20px;text-align:center">
  <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);letter-spacing:0.04em;margin-bottom:4px">
    LIMITED OFFER &nbsp;·&nbsp; Use code <span style="background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.15);padding:2px 10px;border-radius:5px;font-weight:800;color:#fff;letter-spacing:0.08em">WELCOME20</span> for <span style="color:${bc};font-weight:800">20% off</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:10px;color:rgba(255,255,255,0.4);letter-spacing:0.08em">
    ENDS IN <span id="gc-timer" style="font-family:monospace;font-size:14px;font-weight:700;color:#fff;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.1);padding:3px 12px;border-radius:6px;letter-spacing:0.12em">11:59:59</span>
  </div>
</div>

<!-- NAV -->
<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 20px;border-bottom:1px solid rgba(255,255,255,0.06);background:rgba(8,8,12,0.96);position:sticky;top:0;z-index:50;backdrop-filter:blur(20px)">
  <div style="display:flex;align-items:center;gap:10px">
    ${logoImg ? `<img src="${logoImg}" style="width:32px;height:32px;object-fit:contain;border-radius:7px">` : ""}
    <span style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:-0.02em;color:#f0f0f0">${storeName}</span>
  </div>
  <div style="display:flex;gap:14px;align-items:center">
    <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35)">Shop</span>
    <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.35)">Collections</span>
    <span style="padding:8px 18px;border-radius:100px;background:${bc};color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.06em">Cart (0)</span>
  </div>
</div>

<!-- HERO -->
<div style="position:relative;height:300px;overflow:hidden;display:flex;align-items:flex-end">
  ${heroImg ? `<img src="${heroImg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover;opacity:0.65">` : `<div style="position:absolute;inset:0;background:linear-gradient(135deg,#0d0d12,#1a1a24)"></div>`}
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(8,8,12,1) 0%,rgba(8,8,12,0.4) 40%,transparent 100%)"></div>
  <div style="position:relative;padding:24px 20px;z-index:1">
    <div style="font-size:9px;color:${bc};text-transform:uppercase;letter-spacing:0.2em;font-weight:700;margin-bottom:8px">— ${previewStore.tagline}</div>
    <div style="font-size:clamp(26px,6vw,38px);font-weight:900;text-transform:uppercase;letter-spacing:-0.04em;line-height:1;color:#fff">${storeName}</div>
    <div style="display:inline-block;margin-top:16px;padding:11px 24px;border-radius:100px;background:${bc};color:#fff;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;cursor:pointer">Shop the Collection</div>
  </div>
</div>

<!-- TICKER -->
<div style="overflow:hidden;border-top:1px solid rgba(255,255,255,0.04);border-bottom:1px solid rgba(255,255,255,0.04);padding:10px 0;background:rgba(255,255,255,0.01)">
  <div style="display:flex;white-space:nowrap;animation:marquee 16s linear infinite">${ticker}</div>
</div>

<!-- COLLECTIONS -->
${collectionsHtml}

<!-- ALL PRODUCTS -->
<div style="padding:20px 16px">
  <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.25);margin-bottom:14px">/ ${collections.length > 0 ? "02" : "01"} &nbsp; ALL PRODUCTS</div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px">${productCards}</div>
</div>

<!-- ABOUT SECTION -->
<div style="margin:8px 16px;padding:24px;background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px">
  <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.18em;color:rgba(255,255,255,0.25);margin-bottom:12px">About ${storeName}</div>
  <p style="font-size:12px;color:rgba(255,255,255,0.45);line-height:1.8;font-weight:400">${previewBrandDesc || previewStore.tagline + ". Shop our latest collection and experience quality South African streetwear delivered to your door."}</p>
</div>

<!-- FOOTER -->
<div style="padding:24px 16px 16px;border-top:1px solid rgba(255,255,255,0.05);margin-top:12px">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
    <div>
      <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.25);margin-bottom:10px">Shop</div>
      ${collections.map(c => `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;cursor:pointer;transition:color 0.2s" onmouseover="this.style.color='rgba(255,255,255,0.7)'" onmouseout="this.style.color='rgba(255,255,255,0.35)'">${c.name}</div>`).join("")}
      <div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;cursor:pointer;transition:color 0.2s" onmouseover="this.style.color='rgba(255,255,255,0.7)'" onmouseout="this.style.color='rgba(255,255,255,0.35)'">All Products</div>
    </div>
    <div>
      <div style="font-size:8px;font-weight:800;text-transform:uppercase;letter-spacing:0.14em;color:rgba(255,255,255,0.25);margin-bottom:10px">Info</div>
      ${["Shipping Policy","Returns & Exchanges","Privacy Policy","Contact Us"].map(p => `<div style="font-size:10px;color:rgba(255,255,255,0.35);margin-bottom:6px;cursor:pointer;transition:color 0.2s" onmouseover="this.style.color='rgba(255,255,255,0.7)'" onmouseout="this.style.color='rgba(255,255,255,0.35)'">${p}</div>`).join("")}
    </div>
  </div>
  <div style="display:flex;gap:12px;margin-bottom:16px">
    ${["IG","TT","FB","WA"].map(s => `<div style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;font-weight:700;color:rgba(255,255,255,0.3);transition:all 0.2s" onmouseover="this.style.borderColor='${bc}';this.style.color='${bc}'" onmouseout="this.style.borderColor='rgba(255,255,255,0.08)';this.style.color='rgba(255,255,255,0.3)'">${s}</div>`).join("")}
  </div>
  <div style="padding-top:14px;border-top:1px solid rgba(255,255,255,0.04);text-align:center;font-size:9px;color:rgba(255,255,255,0.15);text-transform:uppercase;letter-spacing:0.12em">
    © 2026 ${storeName} &nbsp;·&nbsp; Powered by CatalogStore
  </div>
</div>

</body></html>`;
  }, [previewStore, previewProducts, previewLogo, previewBanner, previewBrandColor, previewBrandDesc]);

  const buildSLStore = useCallback(() => {
    if (!previewStore) return "";
    const bc = previewStore.brandColor || previewBrandColor || "#9c7c62";
    const products = previewStore.products.slice(0, 10);
    const collections = previewStore.collections || [];
    const heroImg = previewBanner?.dataUrl ?? previewProducts[0]?.dataUrl ?? "";
    const logoImg = previewLogo ?? "";
    const storeName = previewStore.storeName;

    // 2-col product grid with SALE pills on first 2 products
    const productCards = products.map((p, i) => {
      const img = previewProducts[i];
      const onSale = i < 2;
      const priceNum = parseInt(p.price.replace(/[^0-9]/g, "")) || 300;
      const originalPrice = onSale ? "R" + Math.round(priceNum / 0.8) : "";
      return `
        <div style="background:#fff;overflow:hidden;cursor:pointer;transition:box-shadow 0.3s" onmouseover="this.style.boxShadow='0 8px 32px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='none'">
          <div style="aspect-ratio:3/4;overflow:hidden;background:#f0ebe4;position:relative">
            ${img ? `<img src="${img.dataUrl}" style="width:100%;height:100%;object-fit:cover;display:block;transition:transform 0.5s" onmouseover="this.style.transform='scale(1.04)'" onmouseout="this.style.transform='scale(1)'">` : `<div style="width:100%;height:100%;background:#ede8e2"></div>`}
            ${onSale ? `<div style="position:absolute;top:8px;left:8px;background:${bc};color:#fff;font-size:8px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;padding:3px 8px;border-radius:3px;font-family:sans-serif">Sale</div>` : ""}
          </div>
          <div style="padding:12px 14px;border-top:1px solid rgba(0,0,0,0.05)">
            <div style="font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.1em;color:rgba(42,42,46,0.35);margin-bottom:4px;font-family:sans-serif">${p.category || "Product"}</div>
            <div style="font-size:12px;font-weight:300;letter-spacing:0.03em;color:rgba(42,42,46,0.7);margin-bottom:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Georgia',serif;font-style:italic">${p.name}</div>
            <div style="display:flex;align-items:center;gap:8px;font-family:sans-serif">
              <div style="font-size:13px;font-weight:600;color:${bc}">${p.price}</div>
              ${onSale ? `<div style="font-size:11px;font-weight:400;color:rgba(42,42,46,0.3);text-decoration:line-through">${originalPrice}</div>` : ""}
            </div>
          </div>
        </div>`;
    }).join("");

    // Collection cards
    const collectionCards = collections.map((col) => {
      const firstIdx = col.productIndexes[0] ?? 0;
      const coverImg = previewProducts[firstIdx]?.dataUrl ?? "";
      return `
        <div style="background:#fff;border-radius:10px;overflow:hidden;cursor:pointer;transition:box-shadow 0.3s;box-shadow:0 2px 12px rgba(0,0,0,0.05)" onmouseover="this.style.boxShadow='0 8px 32px rgba(0,0,0,0.1)'" onmouseout="this.style.boxShadow='0 2px 12px rgba(0,0,0,0.05)'">
          <div style="aspect-ratio:4/3;overflow:hidden;background:#f0ebe4">
            ${coverImg ? `<img src="${coverImg}" style="width:100%;height:100%;object-fit:cover;display:block">` : `<div style="width:100%;height:100%;background:#ede8e2"></div>`}
          </div>
          <div style="padding:14px 16px">
            <div style="font-size:9px;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;color:rgba(42,42,46,0.35);margin-bottom:5px;font-family:sans-serif">${col.productIndexes.length} piece${col.productIndexes.length > 1 ? "s" : ""}</div>
            <div style="font-family:'Georgia',serif;font-size:15px;font-weight:300;letter-spacing:0.04em;font-style:italic;color:#2a2a2e">${col.name}</div>
          </div>
        </div>`;
    }).join("");

    const ticker = ["Free Delivery Over R500","Curated Collections","Secure Checkout","Proudly South African",
                    "Free Delivery Over R500","Curated Collections","Secure Checkout","Proudly South African"]
      .map(t => `<span style="font-size:9px;font-weight:400;letter-spacing:0.18em;text-transform:uppercase;color:rgba(42,42,46,0.3);padding:0 28px;display:inline-flex;align-items:center;gap:12px"><span style="width:3px;height:3px;border-radius:50%;background:${bc};flex-shrink:0;display:inline-block"></span>${t}</span>`).join("");

    const collectionsHtml = collections.length > 0 ? `
      <div style="padding:20px 20px 0">
        <div style="font-size:9px;font-weight:400;letter-spacing:0.16em;text-transform:uppercase;color:rgba(42,42,46,0.35);margin-bottom:16px;font-family:sans-serif">Curated for You</div>
        <div style="display:grid;grid-template-columns:repeat(${Math.min(collections.length, 3)},1fr);gap:10px">${collectionCards}</div>
      </div>` : "";

    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Jost:wght@300;400;500;600&display=swap" rel="stylesheet">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f6f3ef;color:#2a2a2e;font-family:'Jost',sans-serif;overflow-x:hidden;-webkit-font-smoothing:antialiased}
  ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-track{background:#f6f3ef}::-webkit-scrollbar-thumb{background:${bc};border-radius:2px}
  @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
</style>
<script>
  (function() {
    var total = 12 * 3600 - 1;
    function tick() {
      var h = Math.floor(total / 3600);
      var m = Math.floor((total % 3600) / 60);
      var s = total % 60;
      var el = document.getElementById("sl-timer");
      if (el) el.textContent = (h<10?"0"+h:h) + ":" + (m<10?"0"+m:m) + ":" + (s<10?"0"+s:s);
      if (total > 0) { total--; setTimeout(tick, 1000); }
    }
    document.addEventListener("DOMContentLoaded", tick);
    setTimeout(tick, 100);
  })();
</script>
</head><body>

<!-- DISCOUNT BANNER -->
<div style="background:rgba(42,42,46,0.04);border-bottom:1px solid rgba(0,0,0,0.06);padding:10px 20px;text-align:center;font-family:sans-serif">
  <div style="font-size:11px;font-weight:400;color:rgba(42,42,46,0.6);letter-spacing:0.06em;margin-bottom:4px">
    Limited Offer &nbsp;·&nbsp; Use code <span style="background:rgba(42,42,46,0.06);border:1px solid rgba(42,42,46,0.12);padding:2px 10px;border-radius:4px;font-weight:700;color:#2a2a2e;letter-spacing:0.08em">WELCOME20</span> for <span style="color:${bc};font-weight:700">20% off</span>
  </div>
  <div style="display:flex;align-items:center;justify-content:center;gap:8px;font-size:9px;color:rgba(42,42,46,0.35);letter-spacing:0.1em;text-transform:uppercase">
    Ends in <span id="sl-timer" style="font-family:monospace;font-size:13px;font-weight:600;color:#2a2a2e;background:rgba(42,42,46,0.06);border:1px solid rgba(42,42,46,0.1);padding:3px 12px;border-radius:5px;letter-spacing:0.1em">11:59:59</span>
  </div>
</div>

<!-- NAV -->
<div style="display:flex;align-items:center;justify-content:space-between;padding:14px 24px;border-bottom:1px solid rgba(0,0,0,0.06);background:rgba(246,243,239,0.96);position:sticky;top:0;z-index:50;backdrop-filter:blur(20px)">
  <div style="display:flex;align-items:center;gap:10px">
    ${logoImg ? `<img src="${logoImg}" style="width:30px;height:30px;object-fit:contain;border-radius:4px">` : ""}
    <span style="font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:400;letter-spacing:0.1em;text-transform:uppercase;color:#2a2a2e">${storeName}</span>
  </div>
  <div style="display:flex;gap:18px;align-items:center">
    <span style="font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:0.12em;color:rgba(42,42,46,0.4)">Shop</span>
    <span style="font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:0.12em;color:rgba(42,42,46,0.4)">Collections</span>
    <span style="font-size:10px;font-weight:400;text-transform:uppercase;letter-spacing:0.12em;color:rgba(42,42,46,0.4)">Search</span>
    <span style="font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.12em;color:${bc}">Bag (0)</span>
  </div>
</div>

<!-- HERO -->
<div style="position:relative;height:300px;overflow:hidden;display:flex;align-items:flex-end">
  ${heroImg ? `<img src="${heroImg}" style="position:absolute;inset:0;width:100%;height:100%;object-fit:cover">` : `<div style="position:absolute;inset:0;background:#e8e2da"></div>`}
  <div style="position:absolute;inset:0;background:linear-gradient(to top,rgba(246,243,239,0.97) 0%,rgba(246,243,239,0.2) 50%,transparent 100%)"></div>
  <div style="position:relative;padding:24px 24px;z-index:1">
    <div style="font-size:9px;color:rgba(42,42,46,0.4);text-transform:uppercase;letter-spacing:0.2em;font-weight:400;margin-bottom:8px;font-family:sans-serif">${previewStore.tagline}</div>
    <div style="font-family:'Cormorant Garamond',serif;font-size:clamp(28px,6vw,40px);font-weight:300;letter-spacing:0.04em;line-height:1;font-style:italic;color:#2a2a2e">${storeName}</div>
    <div style="display:inline-block;margin-top:16px;padding:11px 26px;border:1px solid ${bc};color:${bc};font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;cursor:pointer;font-family:sans-serif;transition:background 0.2s" onmouseover="this.style.background='${bc}';this.style.color='#fff'" onmouseout="this.style.background='transparent';this.style.color='${bc}'">Shop the Collection →</div>
  </div>
</div>

<!-- TICKER -->
<div style="overflow:hidden;border-top:1px solid rgba(0,0,0,0.05);border-bottom:1px solid rgba(0,0,0,0.05);padding:9px 0;background:rgba(0,0,0,0.01)">
  <div style="display:flex;white-space:nowrap;animation:marquee 16s linear infinite">${ticker}</div>
</div>

<!-- COLLECTIONS -->
${collectionsHtml}

<!-- ALL PRODUCTS -->
<div style="padding:20px 20px">
  <div style="font-family:'Cormorant Garamond',serif;font-size:17px;font-weight:300;letter-spacing:0.06em;color:rgba(42,42,46,0.45);margin-bottom:16px;font-style:italic">All Products</div>
  <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:3px">${productCards}</div>
</div>

<!-- ABOUT SECTION -->
<div style="margin:8px 20px;padding:28px 24px;background:#fff;border-radius:12px;box-shadow:0 2px 12px rgba(0,0,0,0.04)">
  <div style="font-family:'Cormorant Garamond',serif;font-size:18px;font-weight:300;font-style:italic;letter-spacing:0.04em;color:rgba(42,42,46,0.6);margin-bottom:12px">About ${storeName}</div>
  <p style="font-size:12px;color:rgba(42,42,46,0.5);line-height:1.9;font-weight:300">${previewBrandDesc || previewStore.tagline + ". We create thoughtfully designed pieces for the modern wardrobe. Free delivery over R500 across South Africa."}</p>
</div>

<!-- FOOTER -->
<div style="padding:28px 24px 16px;border-top:1px solid rgba(0,0,0,0.05);margin-top:16px;font-family:sans-serif">
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px">
    <div>
      <div style="font-size:8px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:rgba(42,42,46,0.3);margin-bottom:10px">Shop</div>
      ${collections.map(c => `<div style="font-size:10px;color:rgba(42,42,46,0.4);margin-bottom:7px;cursor:pointer;font-weight:300;transition:color 0.2s" onmouseover="this.style.color='rgba(42,42,46,0.8)'" onmouseout="this.style.color='rgba(42,42,46,0.4)'">${c.name}</div>`).join("")}
      <div style="font-size:10px;color:rgba(42,42,46,0.4);margin-bottom:7px;cursor:pointer;font-weight:300;transition:color 0.2s" onmouseover="this.style.color='rgba(42,42,46,0.8)'" onmouseout="this.style.color='rgba(42,42,46,0.4)'">All Products</div>
    </div>
    <div>
      <div style="font-size:8px;font-weight:500;text-transform:uppercase;letter-spacing:0.14em;color:rgba(42,42,46,0.3);margin-bottom:10px">Info</div>
      ${["Shipping Policy","Returns & Exchanges","Privacy Policy","Contact Us"].map(p => `<div style="font-size:10px;color:rgba(42,42,46,0.4);margin-bottom:7px;cursor:pointer;font-weight:300;transition:color 0.2s" onmouseover="this.style.color='rgba(42,42,46,0.8)'" onmouseout="this.style.color='rgba(42,42,46,0.4)'">${p}</div>`).join("")}
    </div>
  </div>
  <div style="display:flex;gap:10px;margin-bottom:20px">
    ${["IG","TT","FB","WA"].map(s => `<div style="width:32px;height:32px;border-radius:8px;border:1px solid rgba(42,42,46,0.1);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:9px;font-weight:600;color:rgba(42,42,46,0.3);transition:all 0.2s" onmouseover="this.style.borderColor='${bc}';this.style.color='${bc}'" onmouseout="this.style.borderColor='rgba(42,42,46,0.1)';this.style.color='rgba(42,42,46,0.3)'">${s}</div>`).join("")}
  </div>
  <div style="padding-top:14px;border-top:1px solid rgba(0,0,0,0.05);text-align:center;font-size:9px;color:rgba(42,42,46,0.2);text-transform:uppercase;letter-spacing:0.12em">
    © 2026 ${storeName} &nbsp;·&nbsp; Powered by CatalogStore
  </div>
</div>

</body></html>`;
  }, [previewStore, previewProducts, previewLogo, previewBanner, previewBrandColor, previewBrandDesc]);

  return (
    <>
      <style>{`
        *{margin:0;padding:0;box-sizing:border-box}
        :root{
          --bg:#030303;--glass:rgba(255,255,255,0.03);--glass-b:rgba(255,255,255,0.06);
          --text:#f5f5f5;--text-dim:rgba(245,245,245,0.35);--text-muted:rgba(245,245,245,0.18);
          --neon:#ff6b35;--neon2:#ff3d6e;--neon-soft:rgba(255,107,53,0.08);
          --grad:linear-gradient(135deg,#ff6b35 0%,#ff3d6e 100%);
        }
        html{scroll-behavior:smooth}
        body{font-family:'Schibsted Grotesk',sans-serif;background:var(--bg);color:var(--text);overflow-x:hidden;cursor:none}
        a{text-decoration:none;cursor:none}
        button{cursor:none}

        #cs-cursor{position:fixed;width:12px;height:12px;background:var(--neon);border-radius:50%;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);transition:width 0.3s,height 0.3s,background 0.2s}
        #cs-cursor-ring{position:fixed;width:36px;height:36px;border:1px solid rgba(255,107,53,0.4);border-radius:50%;pointer-events:none;z-index:9998;transform:translate(-50%,-50%);transition:width 0.3s,height 0.3s,opacity 0.3s}
        body.cursor-expand #cs-cursor{width:48px;height:48px;background:rgba(255,107,53,0.15)}
        body.cursor-expand #cs-cursor-ring{opacity:0}

        @keyframes pulse{0%,100%{opacity:0.6;transform:scale(1)}50%{opacity:1;transform:scale(1.15)}}
        @keyframes pulse-ring{0%{box-shadow:0 0 0 0 rgba(255,107,53,0.6)}70%{box-shadow:0 0 0 8px rgba(255,107,53,0)}100%{box-shadow:0 0 0 0 rgba(255,107,53,0)}}
        @keyframes float{0%,100%{transform:translateY(0)}50%{transform:translateY(-12px)}}
        @keyframes shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
        @keyframes marquee{0%{transform:translateX(0)}100%{transform:translateX(-50%)}}
        @keyframes orb-drift{0%{transform:translate(0,0) scale(1)}33%{transform:translate(40px,-30px) scale(1.05)}66%{transform:translate(-20px,20px) scale(0.95)}100%{transform:translate(0,0) scale(1)}}
        @keyframes orb-drift2{0%{transform:translate(0,0) scale(1)}33%{transform:translate(-30px,40px) scale(1.08)}66%{transform:translate(50px,-20px) scale(0.92)}100%{transform:translate(0,0) scale(1)}}
        @keyframes orb-drift3{0%{transform:translate(0,0)}50%{transform:translate(20px,30px)}100%{transform:translate(0,0)}}
        @keyframes badge-shine{0%{transform:translateX(-100%)}100%{transform:translateX(100%)}}
        @keyframes fu{from{opacity:0;transform:translateY(32px)}to{opacity:1;transform:translateY(0)}}

        .fu1{animation:fu 0.8s cubic-bezier(0.16,1,0.3,1) both}
        .fu2{animation:fu 0.8s 0.12s cubic-bezier(0.16,1,0.3,1) both}
        .fu3{animation:fu 0.8s 0.24s cubic-bezier(0.16,1,0.3,1) both}
        .fu4{animation:fu 0.8s 0.36s cubic-bezier(0.16,1,0.3,1) both}
        .fu5{animation:fu 0.8s 0.48s cubic-bezier(0.16,1,0.3,1) both}

        .shimmer-text{background:linear-gradient(120deg,#ff6b35 0%,#ff3d6e 30%,#ffb347 50%,#ff3d6e 70%,#ff6b35 100%);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:shimmer 4s linear infinite}
        .grad-text{background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text}

        .reveal{opacity:0;transform:translateY(36px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}
        .reveal.visible{opacity:1;transform:translateY(0)}
        .reveal-left{opacity:0;transform:translateX(-36px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}
        .reveal-left.visible{opacity:1;transform:translateX(0)}
        .reveal-right{opacity:0;transform:translateX(36px);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}
        .reveal-right.visible{opacity:1;transform:translateX(0)}
        .reveal-scale{opacity:0;transform:scale(0.92);transition:opacity 0.7s cubic-bezier(0.16,1,0.3,1),transform 0.7s cubic-bezier(0.16,1,0.3,1)}
        .reveal-scale.visible{opacity:1;transform:scale(1)}

        .stagger-children > *{opacity:0;transform:translateY(24px);transition:opacity 0.5s cubic-bezier(0.16,1,0.3,1),transform 0.5s cubic-bezier(0.16,1,0.3,1)}
        .stagger-children.visible > *:nth-child(1){opacity:1;transform:translateY(0);transition-delay:0s}
        .stagger-children.visible > *:nth-child(2){opacity:1;transform:translateY(0);transition-delay:0.08s}
        .stagger-children.visible > *:nth-child(3){opacity:1;transform:translateY(0);transition-delay:0.16s}
        .stagger-children.visible > *:nth-child(4){opacity:1;transform:translateY(0);transition-delay:0.24s}
        .stagger-children.visible > *:nth-child(5){opacity:1;transform:translateY(0);transition-delay:0.32s}
        .stagger-children.visible > *:nth-child(6){opacity:1;transform:translateY(0);transition-delay:0.40s}

        .glass-card{background:var(--glass);border:1px solid var(--glass-b);transition:border-color 0.3s,transform 0.4s cubic-bezier(0.16,1,0.3,1),box-shadow 0.3s}
        .glass-card:hover{border-color:rgba(255,107,53,0.2);transform:translateY(-4px);box-shadow:0 20px 60px rgba(0,0,0,0.4)}

        .glow-btn{padding:18px 48px;background:var(--grad);color:#fff;border-radius:100px;font-size:14px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;box-shadow:0 0 40px rgba(255,107,53,0.2);transition:transform 0.2s,box-shadow 0.2s,filter 0.2s;display:inline-block}
        .glow-btn:hover{transform:translateY(-2px) scale(1.02);box-shadow:0 0 60px rgba(255,107,53,0.45);filter:brightness(1.1)}
        .glow-btn:active{transform:scale(0.98)}

        .outline-btn{padding:18px 48px;background:transparent;color:var(--text);border:2px solid rgba(255,255,255,0.1);border-radius:100px;font-size:14px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;transition:border-color 0.3s,color 0.3s,background 0.3s;display:inline-block}
        .outline-btn:hover{border-color:rgba(255,255,255,0.3);background:rgba(255,255,255,0.04)}

        .section-label{font-size:11px;text-transform:uppercase;letter-spacing:0.15em;color:var(--neon);font-weight:800;margin-bottom:16px;text-align:center;display:flex;align-items:center;justify-content:center;gap:12px}
        .section-label::before,.section-label::after{content:'';flex:0 0 24px;height:1px;background:rgba(255,107,53,0.3)}

        .live-badge{display:inline-flex;gap:10px;align-items:center;padding:8px 20px 8px 12px;border-radius:100px;background:var(--neon-soft);border:1px solid rgba(255,107,53,0.15);font-size:11px;color:var(--neon);font-weight:800;letter-spacing:0.1em;text-transform:uppercase;position:relative;overflow:hidden}
        .live-badge::before{content:'';position:absolute;inset:0;background:linear-gradient(90deg,transparent 0%,rgba(255,107,53,0.05) 50%,transparent 100%);transform:translateX(-100%);animation:badge-shine 3s infinite 2s}

        .ticker-wrap{overflow:hidden;border-top:1px solid var(--glass-b);border-bottom:1px solid var(--glass-b);padding:12px 0}
        .ticker-inner{display:flex;white-space:nowrap;animation:marquee 22s linear infinite}
        .ticker-item{font-size:11px;font-weight:800;letter-spacing:0.12em;text-transform:uppercase;color:var(--text-dim);padding:0 40px;display:inline-flex;align-items:center;gap:16px}
        .ticker-dot{width:5px;height:5px;border-radius:1px;background:var(--grad);flex-shrink:0;transform:rotate(45deg)}

        .grad-border{position:relative}
        .grad-border::before{content:'';position:absolute;inset:0;border-radius:inherit;padding:1px;background:linear-gradient(135deg,rgba(255,107,53,0.3),rgba(255,61,110,0.3),transparent);-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;pointer-events:none}

        .step-num{font-size:80px;font-weight:900;letter-spacing:-0.07em;line-height:1;-webkit-text-stroke:1px rgba(255,107,53,0.15);color:transparent;transition:color 0.3s,-webkit-text-stroke 0.3s}
        .glass-card:hover .step-num{-webkit-text-stroke:1px rgba(255,107,53,0.5);color:rgba(255,107,53,0.05)}

        .pain-icon{width:44px;height:44px;border-radius:14px;background:linear-gradient(135deg,rgba(255,107,53,0.1),rgba(255,61,110,0.06));border:1px solid rgba(255,107,53,0.18);display:flex;align-items:center;justify-content:center;transition:transform 0.35s cubic-bezier(0.16,1,0.3,1),box-shadow 0.3s,border-color 0.3s;position:relative;overflow:hidden;margin-bottom:20px}
        .glass-card:hover .pain-icon{transform:scale(1.12) rotate(-6deg);box-shadow:0 8px 24px rgba(255,107,53,0.2);border-color:rgba(255,107,53,0.35)}

        .check-item{padding:10px 0;font-size:13px;color:var(--text-dim);border-bottom:1px solid rgba(255,255,255,0.03);font-weight:400;display:flex;align-items:center;gap:10px;transition:color 0.2s}
        .check-item:hover{color:var(--text)}
        .check-mark{width:20px;height:20px;border-radius:50%;background:rgba(34,197,94,0.1);border:1px solid rgba(34,197,94,0.2);display:flex;align-items:center;justify-content:center;font-size:10px;color:#22c55e;flex-shrink:0;transition:transform 0.2s,background 0.2s}
        .check-item:hover .check-mark{transform:scale(1.15);background:rgba(34,197,94,0.2)}

        .fee-pill{display:flex;align-items:center;gap:8px;padding:10px 20px;border-radius:100px;border:1px solid rgba(34,197,94,0.15);background:rgba(34,197,94,0.04);transition:border-color 0.2s,background 0.2s,transform 0.2s}
        .fee-pill:hover{border-color:rgba(34,197,94,0.3);background:rgba(34,197,94,0.08);transform:translateY(-2px)}

        .tpl-card{border-radius:16px;overflow:hidden;border:1px solid var(--glass-b);transition:transform 0.4s cubic-bezier(0.16,1,0.3,1),border-color 0.3s,box-shadow 0.3s}
        .tpl-card:hover{transform:translateY(-6px) scale(1.01);border-color:rgba(255,107,53,0.25);box-shadow:0 24px 60px rgba(0,0,0,0.5)}

        .sleep-number{font-size:120px;font-weight:900;letter-spacing:-0.08em;line-height:0.9;background:var(--grad);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:float 4s ease-in-out infinite}

        .popular-badge{position:absolute;top:-14px;left:50%;transform:translateX(-50%);padding:5px 20px;background:var(--grad);border-radius:100px;font-size:9px;font-weight:800;color:#fff;letter-spacing:0.1em;text-transform:uppercase;box-shadow:0 4px 16px rgba(255,107,53,0.4);white-space:nowrap}

        .faq-answer{max-height:0;overflow:hidden;transition:max-height 0.4s cubic-bezier(0.16,1,0.3,1)}
        .faq-icon{width:28px;height:28px;border-radius:50%;border:1px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:center;font-size:16px;color:var(--text-dim);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1),background 0.3s,border-color 0.3s;flex-shrink:0}
        .faq-open .faq-icon{transform:rotate(45deg);background:var(--neon-soft);border-color:rgba(255,107,53,0.3);color:var(--neon)}
        .faq-open{border-color:rgba(255,107,53,0.2)!important}


        .social-link{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.04em;transition:color 0.2s}
        .social-link:hover{color:var(--neon)}
        .nav-link{color:var(--text-dim);font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;transition:color 0.2s;position:relative}
        .nav-link::after{content:'';position:absolute;bottom:-3px;left:0;width:0;height:1px;background:var(--neon);transition:width 0.3s}
        .nav-link:hover{color:var(--text)}
        .nav-link:hover::after{width:100%}


        @keyframes spin{to{transform:rotate(360deg)}}
        .preview-toggle{width:100%;display:flex;align-items:center;justify-content:center;gap:12px;padding:20px;background:rgba(255,107,53,0.04);border:1px solid rgba(255,107,53,0.12);border-radius:16px;cursor:pointer;font-family:'Schibsted Grotesk',sans-serif;color:var(--neon);font-size:12px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;transition:background 0.3s,border-color 0.3s;margin-top:48px}
        .preview-toggle:hover{background:rgba(255,107,53,0.08);border-color:rgba(255,107,53,0.25)}
        .preview-panel{overflow:hidden;transition:max-height 0.6s cubic-bezier(0.16,1,0.3,1)}
        .preview-upload-title{font-size:10px;text-transform:uppercase;letter-spacing:0.14em;color:var(--neon);font-weight:800;margin-bottom:16px;display:flex;align-items:center;gap:10px}
        .preview-upload-title::after{content:'';flex:1;height:1px;background:rgba(255,107,53,0.15)}
        .preview-tpl-option{border-radius:12px;border:2px solid var(--glass-b);cursor:pointer;overflow:hidden;transition:border-color 0.3s,box-shadow 0.3s}
        .preview-tpl-option:hover{border-color:rgba(255,107,53,0.3)}
        .preview-tpl-option.selected{border-color:var(--neon);box-shadow:0 0 0 1px var(--neon),0 4px 24px rgba(255,107,53,0.15)}
        .preview-slot{aspect-ratio:3/4;border-radius:10px;border:2px dashed rgba(255,255,255,0.07);background:rgba(255,255,255,0.01);display:flex;align-items:center;justify-content:center;cursor:pointer;transition:border-color 0.3s,background 0.3s;position:relative;overflow:hidden}
        .preview-slot:hover{border-color:rgba(255,107,53,0.3);background:rgba(255,107,53,0.04)}
        .preview-slot.filled{border-style:solid;border-color:rgba(255,107,53,0.2)}
        .preview-gen-btn{width:100%;padding:18px;border-radius:100px;background:var(--grad);color:#fff;border:none;font-family:'Schibsted Grotesk',sans-serif;font-size:13px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;cursor:pointer;transition:transform 0.2s,box-shadow 0.2s,filter 0.2s,opacity 0.2s;box-shadow:0 0 40px rgba(255,107,53,0.2);margin-top:28px}
        .preview-gen-btn:hover:not(:disabled){transform:translateY(-2px);box-shadow:0 0 60px rgba(255,107,53,0.4);filter:brightness(1.08)}
        .preview-gen-btn:disabled{opacity:0.35;cursor:not-allowed}
        .preview-loading-step{font-size:11px;display:flex;align-items:center;gap:10px;padding:10px 18px;background:var(--glass);border-radius:100px;border:1px solid var(--glass-b);transition:color 0.4s,opacity 0.4s}
        .preview-browser-bar{background:rgba(6,6,10,0.98);padding:12px 20px;display:flex;align-items:center;gap:12px;border-bottom:1px solid rgba(255,255,255,0.04)}
        .preview-insight{background:var(--glass);border:1px solid var(--glass-b);border-radius:12px;padding:16px 18px;transition:border-color 0.3s}
        .preview-insight:hover{border-color:rgba(255,107,53,0.2)}
        @media(max-width:768px){.preview-two-col{grid-template-columns:1fr!important}.preview-product-grid{grid-template-columns:repeat(3,1fr)!important}.preview-insights{grid-template-columns:1fr!important}}
        @media (max-width:768px){
          .nav-link{display:none}.nav-link.show-mobile{display:block}
          .hero-buttons{flex-direction:column!important}
          .hero-buttons a{width:100%!important;text-align:center!important}
          .features-grid-3{grid-template-columns:1fr!important}
          .pricing-grid-2{grid-template-columns:1fr!important;gap:8px!important}
          .pricing-grid-2 > div{border-radius:20px!important}
          .price-num{font-size:36px!important}
          .tpl-grid{grid-template-columns:1fr!important}
          .pain-grid-2{grid-template-columns:1fr!important}
          .sleep-flex > div{border-radius:20px!important}
          .sleep-flex{flex-direction:column!important}
          #cs-cursor,#cs-cursor-ring{display:none}
        }
      `}</style>

      {/* CURSOR */}
      <div id="cs-cursor" ref={cursorRef} />
      <div id="cs-cursor-ring" ref={cursorRingRef} />


      {/* AMBIENT ORBS */}
      <div style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", overflow: "hidden" }}>
        <div style={{ position: "absolute", width: 700, height: 700, top: -250, right: -200, background: "radial-gradient(circle,rgba(255,107,53,0.07) 0%,transparent 65%)", filter: "blur(80px)", animation: "orb-drift 18s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 600, height: 600, bottom: -200, left: -150, background: "radial-gradient(circle,rgba(255,61,110,0.06) 0%,transparent 65%)", filter: "blur(80px)", animation: "orb-drift2 22s ease-in-out infinite" }} />
        <div style={{ position: "absolute", width: 400, height: 400, top: "50%", left: "50%", transform: "translate(-50%,-50%)", background: "radial-gradient(circle,rgba(255,107,53,0.03) 0%,transparent 65%)", filter: "blur(60px)", animation: "orb-drift3 14s ease-in-out infinite" }} />
      </div>

      {/* SCANLINES */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.015, background: "repeating-linear-gradient(0deg,transparent,transparent 1px,rgba(255,255,255,0.04) 1px,rgba(255,255,255,0.04) 2px)" }} />

      {/* GRAIN */}
      <div style={{ position: "fixed", inset: 0, zIndex: 1, pointerEvents: "none", opacity: 0.03, backgroundImage: "url('data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%22200%22 height=%22200%22><filter id=%22n%22><feTurbulence type=%22fractalNoise%22 baseFrequency=%220.9%22 numOctaves=%224%22 stitchTiles=%22stitch%22/></filter><rect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23n)%22 opacity=%221%22/></svg>')" }} />

      {/* NAV */}
      <nav style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, padding: scrolled ? "8px 24px" : "12px 24px", transition: "padding 0.3s", pointerEvents: "none" }}>
        <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: scrolled ? "8px 4px 8px 18px" : "10px 6px 10px 20px", background: "rgba(3,3,3,0.82)", backdropFilter: "blur(40px)", border: scrolled ? "1px solid rgba(255,107,53,0.12)" : "1px solid rgba(255,255,255,0.05)", borderRadius: 100, transition: "all 0.3s", pointerEvents: "all" }}>
          <Link href="/" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Logo size={28} />
            <span style={{ fontSize: 16, fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", color: "var(--text)" }}>
              CATALOG<span className="grad-text">STORE</span>
            </span>
          </Link>
          <div style={{ display: "flex", gap: 24, alignItems: "center" }}>
            <a href="#features" className="nav-link">Features</a>
            <a href="#pricing" className="nav-link">Pricing</a>
            <a href="#faq" className="nav-link">FAQ</a>
            <Link href="/login" className="nav-link show-mobile">Login</Link>
            <Link href="/signup" style={{ padding: "11px 24px", borderRadius: 100, background: "var(--grad)", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", transition: "transform 0.2s,box-shadow 0.2s" }}>Sign Up</Link>
          </div>
        </div>
      </nav>

      {/* CONTENT */}
      <div style={{ position: "relative", zIndex: 2, maxWidth: 1200, margin: "0 auto", padding: "0 24px" }}>

        {/* HERO */}
        <section style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", paddingTop: 80 }}>
          <div style={{ maxWidth: 820, width: "100%" }}>
            <div className="fu1 live-badge" style={{ marginBottom: 40 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--neon)", animation: "pulse-ring 2s infinite", flexShrink: 0 }} />
              Launch Promo — R49 First Month
            </div>
            <h1 className="fu2" style={{ fontSize: "clamp(46px,9vw,104px)", fontWeight: 900, lineHeight: 0.92, letterSpacing: "-0.06em", textTransform: "uppercase", marginBottom: 32 }}>
              Your catalog.<br /><span className="shimmer-text">Amplified.</span>
            </h1>
            <p className="fu3" style={{ fontSize: 17, lineHeight: 1.85, color: "var(--text-dim)", maxWidth: 500, margin: "0 auto 52px", fontWeight: 400 }}>
              Build a professional online store in minutes. Accept payments automatically. Make money while you sleep. No coding required.
            </p>
            <div className="fu4 hero-buttons" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <Link href="/signup" className="glow-btn">Start Your Free Trial</Link>
              <a href="#features" className="outline-btn">Learn More</a>
            </div>
            <p className="fu5" style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 24, letterSpacing: "0.04em" }}>7-day free trial · Cancel anytime · No credit card risk</p>
            <div className="fu5" style={{ display: "flex", justifyContent: "center", gap: 48, marginTop: 64, flexWrap: "wrap" }}>
              {[{ val: "R49", label: "First Month" }, { val: "7", label: "Day Free Trial" }, { val: "0%", label: "Commission" }].map((stat, i) => (
                <div key={i} style={{ display: "flex", gap: 48, alignItems: "center" }}>
                  {i > 0 && <div style={{ width: 1, height: 40, background: "var(--glass-b)" }} />}
                  <div style={{ textAlign: "center" }}>
                    <div className="grad-text" style={{ fontSize: 32, fontWeight: 900, letterSpacing: "-0.05em" }}>{stat.val}</div>
                    <div style={{ fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.08em", textTransform: "uppercase", marginTop: 4 }}>{stat.label}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TICKER */}
        <div className="ticker-wrap reveal" style={{ margin: "0 -24px" }}>
          <div className="ticker-inner">
            {[...TICKER_ITEMS, ...TICKER_ITEMS].map((t, i) => (
              <span key={i} className="ticker-item"><span className="ticker-dot" />{t}</span>
            ))}
          </div>
        </div>

        {/* PRICING */}
        <section id="pricing" style={{ padding: "120px 0 100px" }}>
          <div className="section-label reveal">Pricing</div>
          <h2 className="reveal" style={{ textAlign: "center", fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase", marginBottom: 16 }}>Pick your fuel</h2>
          <p className="reveal" style={{ textAlign: "center", fontSize: 14, color: "var(--text-dim)", marginBottom: 20 }}>7-day free trial on Starter. Cancel anytime.</p>
          <div className="reveal" style={{ textAlign: "center", marginBottom: 56 }}>
            <span style={{ display: "inline-block", padding: "8px 24px", background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: 100, fontSize: 11, fontWeight: 800, color: "var(--neon)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Launch Promo — R49 First Month on Starter
            </span>
          </div>
          <div className="pricing-grid-2 stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 4, maxWidth: 820, margin: "0 auto" }}>
            {/* STARTER */}
            <div className="glass-card grad-border" style={{ padding: "44px 32px", borderRadius: "20px 4px 4px 20px", display: "flex", flexDirection: "column", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad)" }} />
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--neon)", fontWeight: 800, marginBottom: 20 }}>Starter</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span className="price-num" style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.05em" }}>R49</span>
                <span style={{ fontSize: 22, fontWeight: 900, textDecoration: "line-through", color: "var(--text-muted)" }}>R99</span>
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>/mo</span>
              </div>
              <div style={{ fontSize: 12, color: "var(--neon)", marginBottom: 28, fontWeight: 600 }}>First month only, then R99/mo</div>
              <ul style={{ listStyle: "none", marginBottom: 36, flex: 1 }}>
                {STARTER_FEATURES.map(f => (
                  <li key={f} className="check-item"><span className="check-mark">✓</span>{f}</li>
                ))}
              </ul>
              <Link href="/signup" style={{ display: "block", width: "100%", padding: 16, borderRadius: 100, textAlign: "center", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: "#f5f5f5", color: "#030303" }}>
                Start with Starter
              </Link>
            </div>
            {/* PRO */}
            <div style={{ padding: "44px 32px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: "4px 20px 20px 4px", display: "flex", flexDirection: "column", opacity: 0.4, position: "relative" }}>
              <div className="popular-badge">Coming Soon</div>
              <div style={{ fontSize: 10, textTransform: "uppercase", letterSpacing: "0.14em", color: "var(--text-dim)", fontWeight: 800, marginBottom: 20 }}>Pro</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 4 }}>
                <span className="price-num" style={{ fontSize: 56, fontWeight: 900, letterSpacing: "-0.05em" }}>R249</span>
                <span style={{ fontSize: 13, color: "var(--text-dim)" }}>/mo</span>
              </div>
              <div style={{ height: 20, marginBottom: 28 }} />
              <ul style={{ listStyle: "none", marginBottom: 36, flex: 1 }}>
                {PRO_FEATURES.map(f => (
                  <li key={f} className="check-item"><span className="check-mark">✓</span>{f}</li>
                ))}
              </ul>
              <div style={{ display: "block", width: "100%", padding: 16, borderRadius: 100, textAlign: "center", fontSize: 12, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", background: "rgba(255,255,255,0.03)", color: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.06)" }}>Coming Soon</div>
            </div>
          </div>
        </section>

        {/* TEMPLATES */}
        <section id="templates" style={{ padding: "60px 0 100px" }}>
          <div className="section-label reveal">Templates</div>
          <h2 className="reveal" style={{ textAlign: "center", fontSize: "clamp(28px,4vw,44px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 72 }}>Choose your look</h2>

        {/* AI STORE PREVIEW — collapsible under Choose Your Look */}
        <div style={{ marginTop: 0, marginBottom: 80 }}>
          <button
            className="preview-toggle"
            onClick={() => setPreviewOpen(o => !o)}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
            {previewOpen ? "Close AI Store Preview" : "✦ See Your Store Come to Life — AI Preview"}
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transform: previewOpen ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.3s", flexShrink: 0 }}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>

          <div ref={previewPanelRef} className="preview-panel" style={{ maxHeight: previewOpen ? 2400 : 0 }}>
            <div style={{ paddingTop: 32 }}>

              {/* UPLOAD STAGE */}
              {previewStage === "upload" && (
                <div style={{ background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: 20, padding: "40px 36px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad)" }} />

                  <div className="preview-two-col" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 36 }}>

                    {/* LEFT */}
                    <div>
                      {/* LOGO */}
                      <div style={{ marginBottom: 32 }}>
                        <div className="preview-upload-title">Your Logo</div>
                        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                          <div
                            onClick={() => logoInputRef.current?.click()}
                            style={{ width: 100, height: 100, borderRadius: 14, flexShrink: 0, border: previewLogo ? "2px solid rgba(255,107,53,0.4)" : "2px dashed rgba(255,255,255,0.1)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 6, cursor: "pointer", overflow: "hidden", position: "relative", background: previewLogo ? "transparent" : "rgba(255,107,53,0.02)", transition: "border-color 0.3s" }}
                          >
                            {previewLogo
                              ? <img src={previewLogo} alt="Logo" style={{ width: "100%", height: "100%", objectFit: "contain", padding: 8 }} />
                              : <>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                                <span style={{ fontSize: 9, color: "var(--text-muted)", textAlign: "center", lineHeight: 1.5, fontWeight: 600 }}>Click to<br/>upload</span>
                              </>
                            }
                          </div>
                          <div style={{ fontSize: 11, color: "var(--text-muted)", lineHeight: 1.8 }}>
                            PNG or SVG with transparent background works best.<br/>
                            <span style={{ color: previewLogo ? "#22c55e" : "var(--text-muted)" }}>{previewLogo ? "✓ Logo uploaded" : "Required"}</span>
                          </div>
                        </div>
                        <input ref={logoInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleLogoUpload} />
                      </div>

                      {/* BRAND NAME */}
                      <div style={{ marginBottom: 28 }}>
                        <div className="preview-upload-title">Brand Name</div>
                        <input
                          type="text"
                          value={previewBrandName}
                          onChange={e => setPreviewBrandName(e.target.value)}
                          placeholder="e.g. 4REGN, MAISON NALA, KASI DRIP..."
                          maxLength={40}
                          style={{ width: "100%", background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "10px 14px", color: "var(--text)", fontSize: 13, fontFamily: "'Schibsted Grotesk', sans-serif", outline: "none", letterSpacing: "0.02em", transition: "border-color 0.2s" }}
                          onFocus={e => e.target.style.borderColor = "rgba(255,107,53,0.4)"}
                          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
                        />
                      </div>

                      {/* STORE CATEGORY */}
                      <div style={{ marginBottom: 28 }}>
                        <div className="preview-upload-title">Store Category</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                          {["Fashion & Clothing","Sneakers & Footwear","Accessories","Beauty & Skincare","Food & Drinks","Home & Living","Art & Prints","Other"].map(cat => (
                            <div
                              key={cat}
                              onClick={() => setPreviewCategory(cat)}
                              style={{ padding: "8px 12px", borderRadius: 8, border: previewCategory === cat ? `1px solid ${previewBrandColor}` : "1px solid rgba(255,255,255,0.07)", background: previewCategory === cat ? `${previewBrandColor}18` : "rgba(255,255,255,0.02)", cursor: "pointer", fontSize: 10, fontWeight: 600, color: previewCategory === cat ? "var(--text)" : "var(--text-muted)", transition: "all 0.2s", textAlign: "center" as const }}
                            >
                              {cat}
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* BRAND COLOUR */}
                      <div style={{ marginBottom: 28 }}>
                        <div className="preview-upload-title">Brand Colour</div>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                          {["#ff6b35","#ff3d6e","#6c63ff","#22c55e","#0ea5e9","#f59e0b","#ec4899","#e11d48","#000000","#ffffff"].map(c => (
                            <div
                              key={c}
                              onClick={() => setPreviewBrandColor(c)}
                              style={{
                                width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", flexShrink: 0,
                                border: previewBrandColor === c ? "3px solid rgba(255,255,255,0.9)" : "2px solid rgba(255,255,255,0.1)",
                                boxShadow: previewBrandColor === c ? `0 0 0 2px ${c}` : "none",
                                transition: "all 0.2s",
                              }}
                            />
                          ))}
                          <div style={{ position: "relative", width: 26, height: 26, flexShrink: 0 }}>
                            <input
                              type="color"
                              value={previewBrandColor}
                              onChange={e => setPreviewBrandColor(e.target.value)}
                              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.1)", cursor: "pointer", opacity: 0 }}
                              title="Custom colour"
                            />
                            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "conic-gradient(red,yellow,lime,cyan,blue,magenta,red)", border: "2px solid rgba(255,255,255,0.15)", cursor: "pointer" }} />
                          </div>
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <div style={{ width: 14, height: 14, borderRadius: "50%", background: previewBrandColor, border: "1px solid rgba(255,255,255,0.15)", flexShrink: 0 }} />
                          <span style={{ fontSize: 10, color: "var(--text-muted)", fontWeight: 600, fontFamily: "monospace" }}>{previewBrandColor}</span>
                        </div>
                      </div>

                      {/* TEMPLATE */}
                      <div>
                        <div className="preview-upload-title">Choose Template</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {(["gc","sl"] as const).map(id => {
                            const isGc = id === "gc";
                            const sel = previewTemplate === id;
                            return (
                              <div key={id} className={`preview-tpl-option${sel ? " selected" : ""}`} onClick={() => setPreviewTemplate(id)} style={{ position: "relative" }}>
                                {sel && <div style={{ position: "absolute", top: 7, right: 7, width: 18, height: 18, borderRadius: "50%", background: "var(--neon)", color: "#fff", fontSize: 10, fontWeight: 900, display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2 }}>✓</div>}
                                <div style={{ height: 64, display: "flex", alignItems: "center", justifyContent: "center", background: isGc ? "linear-gradient(135deg,#0a0a0e,#1a1a24)" : "linear-gradient(135deg,#f0ebe4,#e8e2da)", fontSize: isGc ? 8 : 11, color: isGc ? "rgba(255,255,255,0.25)" : "rgba(42,42,46,0.3)", fontFamily: isGc ? "'Schibsted Grotesk',sans-serif" : "Georgia,serif", letterSpacing: isGc ? "0.12em" : "0.04em", fontStyle: isGc ? "normal" : "italic", textTransform: isGc ? "uppercase" : "none", borderBottom: isGc ? "1px solid rgba(255,255,255,0.06)" : "1px solid rgba(0,0,0,0.06)" }}>
                                  {isGc ? "GLASS CHROME" : "Soft Luxury"}
                                </div>
                                <div style={{ padding: "10px 12px", background: "rgba(255,255,255,0.02)" }}>
                                  <div style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: 2 }}>{isGc ? "Glass Chrome" : "Soft Luxury"}</div>
                                  <div style={{ fontSize: 9, color: "var(--text-muted)" }}>{isGc ? "Dark, futuristic, chrome" : "Warm cream, elegant"}</div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT — PRODUCTS */}
                    <div>
                      {/* BANNER */}
                      <div style={{ marginBottom: 28 }}>
                        <div className="preview-upload-title">Banner / Main Cover Image</div>
                        <div
                          onClick={() => bannerInputRef.current?.click()}
                          style={{ width: "100%", aspectRatio: "16/7", borderRadius: 12, border: previewBanner ? "2px solid rgba(255,107,53,0.4)" : "2px dashed rgba(255,255,255,0.08)", background: previewBanner ? "transparent" : "rgba(255,255,255,0.01)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8, cursor: "pointer", overflow: "hidden", position: "relative", transition: "border-color 0.3s, background 0.3s" }}
                        >
                          {previewBanner
                            ? <img src={previewBanner.dataUrl} alt="Banner" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                            : <>
                              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                              <span style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 600 }}>Click to upload your cover image</span>
                              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.12)" }}>This appears as your store's main banner</span>
                            </>
                          }
                          {previewBanner && (
                            <button onClick={e => { e.stopPropagation(); setPreviewBanner(null); }} style={{ position: "absolute", top: 8, right: 8, width: 24, height: 24, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 13, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, lineHeight: 1, fontFamily: "sans-serif" }}>×</button>
                          )}
                        </div>
                        <input ref={bannerInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={async e => { const f = e.target.files?.[0]; if (!f) return; const img = await readFile(f); setPreviewBanner(img); e.target.value=""; }} />
                        <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>{previewBanner ? "✓ Cover image uploaded" : "Recommended: landscape photo of your best products"}</p>
                      </div>

                      <div className="preview-upload-title">
                        Product Photos
                        <span style={{ fontSize: 9, fontWeight: 500, textTransform: "none", letterSpacing: 0, color: "var(--text-muted)" }}>({previewProducts.length}/10)</span>
                      </div>
                      <div className="preview-product-grid" style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", gap: 7 }}>
                        {Array.from({ length: 10 }).map((_, i) => {
                          const img = previewProducts[i];
                          const isAdd = i === previewProducts.length && i < 10;
                          return (
                            <div key={i} className={`preview-slot${img ? " filled" : ""}`} onClick={!img ? () => productInputRef.current?.click() : undefined}>
                              {img ? (
                                <>
                                  <img src={img.dataUrl} alt="" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" }} />
                                  <button onClick={e => { e.stopPropagation(); setPreviewProducts(prev => prev.filter((_,j) => j !== i)); }} style={{ position: "absolute", top: 3, right: 3, width: 18, height: 18, borderRadius: "50%", background: "rgba(0,0,0,0.75)", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", fontSize: 11, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 2, lineHeight: 1, fontFamily: "sans-serif" }}>×</button>
                                </>
                              ) : isAdd ? (
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                              ) : (
                                <span style={{ fontSize: 8, color: "rgba(255,255,255,0.1)", fontWeight: 700 }}>{i+1}</span>
                              )}
                            </div>
                          );
                        })}
                      </div>
                      <input ref={productInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleProductUpload} />
                      <p style={{ fontSize: 10, color: "var(--text-muted)", marginTop: 10, lineHeight: 1.7 }}>Upload 4–10 product photos. AI will name them, suggest prices, and build your store automatically.</p>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: previewProducts.length >= 4 ? "#22c55e" : "rgba(255,255,255,0.15)", flexShrink: 0 }} />
                        <span style={{ fontSize: 10, color: previewProducts.length >= 4 ? "#22c55e" : "var(--text-muted)" }}>
                          {previewProducts.length < 4 ? `${4 - previewProducts.length} more photo${4 - previewProducts.length > 1 ? "s" : ""} needed` : `${previewProducts.length} photos ready`}
                        </span>
                      </div>
                      {/* BRAND DESCRIPTION */}
                      <div style={{ marginTop: 24 }}>
                        <div className="preview-upload-title">
                          Tell Us About Your Brand
                          <span style={{ fontSize: 9, fontWeight: 500, textTransform: "none" as const, letterSpacing: 0, color: "var(--text-muted)" }}>(optional)</span>
                        </div>
                        <textarea
                          value={previewBrandDesc}
                          onChange={e => setPreviewBrandDesc(e.target.value)}
                          placeholder={`e.g. "South African streetwear brand making premium quality tees and jackets for the bold."`}
                          maxLength={150}
                          rows={3}
                          style={{
                            width: "100%",
                            background: "rgba(255,255,255,0.03)",
                            border: "1px solid rgba(255,255,255,0.08)",
                            borderRadius: 10,
                            padding: "10px 14px",
                            color: "var(--text)",
                            fontSize: 12,
                            fontFamily: "'Schibsted Grotesk', sans-serif",
                            resize: "none",
                            outline: "none",
                            lineHeight: 1.7,
                            transition: "border-color 0.2s",
                          }}
                          onFocus={e => e.target.style.borderColor = "rgba(255,107,53,0.4)"}
                          onBlur={e => e.target.style.borderColor = "rgba(255,255,255,0.08)"}
                        />
                        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                          <span style={{ fontSize: 9, color: "var(--text-muted)" }}>Helps AI name products and write your tagline accurately</span>
                          <span style={{ fontSize: 9, color: previewBrandDesc.length >= 130 ? "var(--neon)" : "var(--text-muted)", fontFamily: "monospace" }}>{previewBrandDesc.length}/150</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {previewError && (
                    <div style={{ marginTop: 20, padding: "12px 18px", borderRadius: 10, background: "rgba(255,61,110,0.08)", border: "1px solid rgba(255,61,110,0.2)", fontSize: 12, color: "#ff3d6e" }}>{previewError}</div>
                  )}

                  <button className="preview-gen-btn" onClick={runPreview} disabled={!previewLogo || previewProducts.length < 4}>
                    ✦ Generate My Store Preview
                  </button>
                  <p style={{ textAlign: "center", fontSize: 10, color: "var(--text-muted)", marginTop: 12 }}>Takes ~10 seconds · Free · No account needed</p>
                </div>
              )}

              {/* LOADING STAGE */}
              {previewStage === "loading" && (
                <div style={{ textAlign: "center", padding: "60px 40px", background: "var(--glass)", border: "1px solid var(--glass-b)", borderRadius: 20 }}>
                  <div style={{ width: 52, height: 52, borderRadius: "50%", border: "2px solid var(--glass-b)", borderTopColor: "var(--neon)", animation: "spin 1s linear infinite", margin: "0 auto 20px" }} />
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>Building your store...</div>
                  <div style={{ fontSize: 12, color: "var(--text-dim)", marginBottom: 32 }}>AI is analysing your photos and crafting your storefront</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, maxWidth: 300, margin: "0 auto" }}>
                    {["Analysing your product photos...","Generating product names & prices...","Crafting your store name & tagline...","Building your storefront...","Almost done..."].map((step, i) => (
                      <div key={i} className="preview-loading-step" style={{ opacity: i <= previewLoadStep ? 1 : 0.2, color: i < previewLoadStep ? "#22c55e" : i === previewLoadStep ? "var(--text)" : "var(--text-muted)" }}>
                        <span style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor", flexShrink: 0 }} />
                        {step}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* PREVIEW STAGE */}
              {previewStage === "preview" && previewStore && (
                <div>
                  {/* HEADER */}
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 12 }}>
                    <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 16px", borderRadius: 100, background: "rgba(34,197,94,0.08)", border: "1px solid rgba(34,197,94,0.2)", fontSize: 10, color: "#22c55e", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      Your Store Preview is Ready
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={resetPreview} style={{ padding: "9px 18px", borderRadius: 100, background: "var(--glass)", border: "1px solid var(--glass-b)", color: "var(--text-dim)", fontSize: 11, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", cursor: "pointer", fontFamily: "'Schibsted Grotesk',sans-serif" }}>Try Again</button>
                      <Link href="/signup" style={{ padding: "9px 18px", borderRadius: 100, background: "var(--grad)", color: "#fff", fontSize: 11, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none" }}>Claim This Store →</Link>
                    </div>
                  </div>

                  {/* BROWSER FRAME */}
                  <div style={{ borderRadius: 16, overflow: "hidden", border: "1px solid var(--glass-b)", boxShadow: "0 32px 80px rgba(0,0,0,0.5)", position: "relative" }}>
                    <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad)", zIndex: 1 }} />
                    <div className="preview-browser-bar">
                      <div style={{ display: "flex", gap: 5 }}>
                        {["#ff5f57","#ffbd2e","#28c840"].map(c => <div key={c} style={{ width: 9, height: 9, borderRadius: "50%", background: c }} />)}
                      </div>
                      <div style={{ flex: 1, background: "rgba(255,255,255,0.04)", borderRadius: 5, padding: "4px 12px", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                        {previewStore.storeSlug}.catalogstore.co.za
                      </div>
                    </div>
                    <iframe srcDoc={previewTemplate === "gc" ? buildGCStore() : buildSLStore()} style={{ width: "100%", height: 620, border: "none", display: "block" }} title="Store Preview" />
                  </div>

                  {/* INSIGHTS */}
                  <div className="preview-insights" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 8, marginTop: 12 }}>
                    {[previewStore.insight1, previewStore.insight2, previewStore.insight3].map((ins, i) => (
                      <div key={i} className="preview-insight">
                        <div style={{ fontSize: 9, textTransform: "uppercase", letterSpacing: "0.12em", color: "var(--neon)", fontWeight: 800, marginBottom: 6 }}>{ins.label}</div>
                        <div style={{ fontSize: 12, color: "var(--text-dim)", lineHeight: 1.6 }}>{ins.value}</div>
                      </div>
                    ))}
                  </div>

                  {/* CTA */}
                  <div style={{ marginTop: 16, padding: "36px 32px", background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.15)", borderRadius: 16, textAlign: "center", position: "relative", overflow: "hidden" }}>
                    <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(255,107,53,0.1) 0%,transparent 60%)", pointerEvents: "none" }} />
                    <h3 style={{ fontSize: "clamp(18px,2.5vw,26px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.03em", marginBottom: 10, position: "relative" }}>Ready to go live?</h3>
                    <p style={{ fontSize: 13, color: "var(--text-dim)", marginBottom: 24, position: "relative" }}>Start your 7-day free trial — no credit card needed.</p>
                    <Link href="/signup" style={{ display: "inline-block", padding: "16px 40px", borderRadius: 100, background: "var(--grad)", color: "#fff", fontFamily: "'Schibsted Grotesk',sans-serif", fontSize: 13, fontWeight: 800, letterSpacing: "0.04em", textTransform: "uppercase", textDecoration: "none", boxShadow: "0 0 32px rgba(255,107,53,0.25)", position: "relative" }}>
                      Start Free Trial — R49 First Month
                    </Link>
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>


          {[
            { num: "01", title: "Glass Chrome", desc: "Dark futuristic theme with chrome metallic accents. How your store would look.", images: GC_IMAGES },
            { num: "02", title: "Soft Luxury",  desc: "Warm cream tones with elegant serif typography. How your store would look.",    images: SL_IMAGES },
          ].map((tpl, ti) => (
            <div key={tpl.title} className="reveal" style={{ marginBottom: ti === 0 ? 88 : 0 }}>
              <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 32, paddingBottom: 24, borderBottom: "1px solid var(--glass-b)", flexWrap: "wrap", gap: 12 }}>
                <div>
                  <div style={{ fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "var(--neon)", fontWeight: 800, marginBottom: 8 }}>Theme {tpl.num}</div>
                  <h3 style={{ fontSize: "clamp(24px,4vw,38px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.04em" }}>{tpl.title}</h3>
                </div>
                <p style={{ fontSize: 13, color: "var(--text-dim)", maxWidth: 280, lineHeight: 1.7 }}>{tpl.desc}</p>
              </div>
              <div className="tpl-grid stagger-children" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                {tpl.images.map(img => (
                  <div key={img.src} className="tpl-card">
                    <Image src={img.src} alt={img.label} width={600} height={375} style={{ width: "100%", height: "auto", display: "block" }} unoptimized />
                  </div>
                ))}
              </div>
            </div>
          ))}
        </section>


        {/* PAIN */}
        <section style={{ padding: "80px 0" }}>
          <div className="section-label reveal">Sound Familiar?</div>
          <h2 className="reveal" style={{ textAlign: "center", fontSize: "clamp(28px,4vw,44px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 52 }}>The struggle is real</h2>
          <div className="pain-grid-2 stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(2,1fr)", gap: 4 }}>
            {PAINS.map(p => (
              <div key={p.t} className="glass-card" style={{ padding: "36px 32px", borderRadius: p.r }}>
                <div className="pain-icon">{p.icon}</div>
                <h3 style={{ fontSize: 14, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.02em", marginBottom: 10 }}>{p.t}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-dim)", fontWeight: 400 }}>{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* HOW IT WORKS */}
        <section id="features" style={{ padding: "100px 0" }}>
          <div className="section-label reveal">How It Works</div>
          <h2 className="reveal" style={{ textAlign: "center", fontSize: "clamp(32px,5vw,56px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase", marginBottom: 72 }}>Simple setup</h2>
          <div className="features-grid-3 stagger-children" style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 4 }}>
            {STEPS.map(s => (
              <div key={s.n} className="glass-card" style={{ padding: "44px 32px", borderRadius: s.r }}>
                <div className="step-num">{s.n}</div>
                <h3 style={{ fontSize: 17, fontWeight: 800, margin: "16px 0 12px", letterSpacing: "-0.02em", textTransform: "uppercase" }}>{s.t}</h3>
                <p style={{ fontSize: 14, lineHeight: 1.8, color: "var(--text-dim)", fontWeight: 400 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </section>

        {/* MONEY WHILE YOU SLEEP */}
        <section style={{ padding: "80px 0" }}>
          <div className="sleep-flex" style={{ display: "flex", gap: 4, alignItems: "stretch" }}>
            <div className="glass-card reveal-left" style={{ flex: 1, padding: "52px 40px", borderRadius: "20px 4px 4px 20px" }}>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--neon)", fontWeight: 800, marginBottom: 20 }}>The Philosophy</div>
              <h2 style={{ fontSize: "clamp(24px,3.5vw,38px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 24 }}>Money while<br />you sleep</h2>
              <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.9, marginBottom: 16 }}>Imagine waking up to 3 new orders. You didn&apos;t DM anyone. You didn&apos;t negotiate prices. You didn&apos;t screenshot bank details.</p>
              <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.9 }}>Your store did the work while you slept. Set it up once, and let your products sell around the clock.</p>
            </div>
            <div className="reveal-right" style={{ flex: 1, padding: "52px 40px", background: "var(--neon-soft)", border: "1px solid rgba(255,107,53,0.12)", borderRadius: "4px 20px 20px 4px", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center", position: "relative", overflow: "hidden" }}>
              <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% 0%,rgba(255,107,53,0.12) 0%,transparent 70%)", pointerEvents: "none" }} />
              <div className="sleep-number">24/7</div>
              <p style={{ fontSize: 14, color: "var(--text-dim)", maxWidth: 260, lineHeight: 1.8, marginTop: 24, position: "relative" }}>Your store never closes. Orders come in while you sleep, eat, and live your life.</p>
              <div style={{ display: "flex", gap: 24, marginTop: 36, position: "relative" }}>
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em" }}>R0</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Commission</div>
                </div>
                <div style={{ width: 1, background: "rgba(255,255,255,0.08)" }} />
                <div style={{ textAlign: "center" }}>
                  <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: "-0.04em" }}>∞</div>
                  <div style={{ fontSize: 9, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.08em", marginTop: 2 }}>Uptime</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 100% YOURS */}
        <section style={{ padding: "60px 0" }}>
          <div className="glass-card grad-border reveal" style={{ padding: "56px 44px", borderRadius: 24, textAlign: "center", position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 1, background: "var(--grad)", opacity: 0.4 }} />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% -20%,rgba(255,107,53,0.06) 0%,transparent 60%)", pointerEvents: "none" }} />
            <h3 style={{ fontSize: "clamp(22px,3.5vw,32px)", fontWeight: 900, textTransform: "uppercase", letterSpacing: "-0.03em", marginBottom: 16, position: "relative" }}>100% of your sales are yours</h3>
            <p style={{ fontSize: 15, color: "var(--text-dim)", lineHeight: 1.8, maxWidth: 520, margin: "0 auto 36px", position: "relative" }}>We charge a simple monthly subscription. We never take a cut of your sales. No transaction fees. No commission. Your customers pay you directly.</p>
            <div className="stagger-children" style={{ display: "flex", justifyContent: "center", gap: 12, flexWrap: "wrap", position: "relative" }}>
              {["No transaction fees", "No commission", "No hidden charges"].map(t => (
                <div key={t} className="fee-pill">
                  <span style={{ color: "#22c55e", fontSize: 14, fontWeight: 900 }}>✓</span>
                  <span style={{ fontSize: 13, color: "var(--text-dim)", fontWeight: 600 }}>{t}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section id="faq" style={{ padding: "100px 0" }}>
          <div className="section-label reveal">FAQ</div>
          <h2 className="reveal" style={{ textAlign: "center", fontSize: "clamp(28px,4vw,44px)", fontWeight: 900, letterSpacing: "-0.04em", textTransform: "uppercase", marginBottom: 52 }}>Common questions</h2>
          <div style={{ maxWidth: 720, margin: "0 auto", display: "flex", flexDirection: "column", gap: 4 }}>
            {FAQS.map((faq, i) => {
              const isOpen = openFaq === i;
              const radius = i === 0 ? "20px 20px 4px 4px" : i === FAQS.length - 1 ? "4px 4px 20px 20px" : "4px";
              return (
                <div key={i} className={isOpen ? "faq-open" : ""} style={{ background: "var(--glass)", border: "1px solid var(--glass-b)", overflow: "hidden", borderRadius: radius, transition: "border-color 0.3s" }}>
                  <button onClick={() => setOpenFaq(isOpen ? null : i)} style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 28px", background: "none", border: "none", fontFamily: "'Schibsted Grotesk',sans-serif", color: "var(--text)", textAlign: "left", cursor: "none" }}>
                    <span style={{ fontSize: 14, fontWeight: 700, letterSpacing: "-0.01em" }}>{faq.q}</span>
                    <div className="faq-icon">+</div>
                  </button>
                  <div style={{ maxHeight: isOpen ? 200 : 0, overflow: "hidden", transition: "max-height 0.4s cubic-bezier(0.16,1,0.3,1)" }}>
                    <p style={{ fontSize: 14, color: "var(--text-dim)", lineHeight: 1.8, padding: "0 28px 24px" }}>{faq.a}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* CTA */}
        <section style={{ padding: "100px 0" }}>
          <div className="glass-card reveal-scale" style={{ textAlign: "center", padding: "100px 40px", borderRadius: 24, position: "relative", overflow: "hidden" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: "var(--grad)" }} />
            <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse at 50% -10%,rgba(255,107,53,0.1) 0%,transparent 55%)", pointerEvents: "none" }} />
            <div style={{ position: "absolute", width: 200, height: 200, top: -50, left: -50, background: "radial-gradient(circle,rgba(255,107,53,0.08) 0%,transparent 70%)", filter: "blur(40px)", animation: "pulse 6s infinite ease-in-out" }} />
            <div style={{ position: "absolute", width: 200, height: 200, bottom: -50, right: -50, background: "radial-gradient(circle,rgba(255,61,110,0.08) 0%,transparent 70%)", filter: "blur(40px)", animation: "pulse 8s infinite ease-in-out 1s" }} />
            <h2 style={{ fontSize: "clamp(28px,5vw,60px)", fontWeight: 900, letterSpacing: "-0.05em", textTransform: "uppercase", marginBottom: 20, position: "relative" }}>Stop sleeping<br />on your catalog</h2>
            <p style={{ fontSize: 16, color: "var(--text-dim)", maxWidth: 420, margin: "0 auto 48px", lineHeight: 1.8, fontWeight: 400, position: "relative" }}>Every hour without a store is money left on the table. Your customers are waiting.</p>
            <Link href="/signup" className="glow-btn" style={{ position: "relative" }}>Start Your Free Trial</Link>
            <p style={{ fontSize: 11, color: "var(--text-muted)", marginTop: 20, position: "relative", letterSpacing: "0.04em" }}>7 days free · Cancel anytime</p>
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: "48px 0", borderTop: "1px solid var(--glass-b)" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Logo size={22} />
              <span style={{ fontSize: 12, fontWeight: 800, textTransform: "uppercase" }}>
                CATALOG<span className="grad-text">STORE</span>
              </span>
            </div>
            <p style={{ fontSize: 11, color: "var(--text-muted)", fontWeight: 500, letterSpacing: "0.04em", textTransform: "uppercase" }}>© 2026 CatalogStore. Built in South Africa.</p>
            <div style={{ display: "flex", gap: 20 }}>
              <a href="#" className="social-link">Instagram</a>
              <a href="#" className="social-link">Facebook</a>
              <a href="#" className="social-link">WhatsApp</a>
            </div>
          </div>
        </footer>

      </div>
    </>
  );
}