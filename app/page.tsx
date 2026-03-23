"use client";

import { useEffect, useRef, useState } from "react";
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

      {/* SCROLL INDICATOR */}
      </div>

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
                <div key={i} className={`reveal${isOpen ? " faq-open" : ""}`} style={{ background: "var(--glass)", border: "1px solid var(--glass-b)", overflow: "hidden", borderRadius: radius, transition: "border-color 0.3s" }}>
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