"use client";

import { useEffect, useRef, useState } from "react";

// 30s phone-mockup template showcase. Six scenes: brand intro, four templates
// in turn (each in a phone frame, auto-scrolling), and a pricing outro.
// Modeled on the existing /ad/templates reel but framed inside a centered
// phone bezel so the "this is a real storefront on a phone" message is clear.
//
// Iframes are pre-mounted from page load (PersistentScene) so they have time
// to fetch their HTML + assets before their scene actually plays -- without
// that the storefront would still be white when the template scene fades in.

const TEMPLATES = [
  { theme: "01", name: "HEIRLOOM",     tag: "Fashion & Lifestyle",     src: "/templates/heirloom/index.html", bg: "#fff" },
  { theme: "02", name: "CROWN",        tag: "Beauty & Hair",            src: "/templates/crown/index.html",    bg: "#0a0908" },
  { theme: "03", name: "GLASS CHROME", tag: "Electronics & Tech",       src: "/templates/volt/index.html",     bg: "#08080c" },
  { theme: "04", name: "SOFT LUXURY",  tag: "Skincare & Fragrance",     src: "/templates/aurelia/index.html",  bg: "#f6f3ef" },
];

type SceneId = "intro" | "tpl-0" | "tpl-1" | "tpl-2" | "tpl-3" | "pricing";

const SCENES: { id: SceneId; duration: number }[] = [
  { id: "intro",   duration: 3500 },
  { id: "tpl-0",   duration: 8500 },
  { id: "tpl-1",   duration: 8500 },
  { id: "tpl-2",   duration: 8500 },
  { id: "tpl-3",   duration: 8500 },
  { id: "pricing", duration: 5500 },
];
const TOTAL_MS = SCENES.reduce((a, s) => a + s.duration, 0);
// Slowed from the original 4.8s -- Crown and Heirloom are taller storefronts
// and the previous pace meant content blurred past before you could read it.
// Leaves a beat at the end of each scene for the crossfade.
const SCROLL_MS = 7200;

export default function ShowcasePage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  // Advance scenes
  useEffect(() => {
    if (done) return;
    if (sceneIdx >= SCENES.length) { setDone(true); return; }
    const t = setTimeout(() => setSceneIdx((i) => i + 1), SCENES[sceneIdx].duration);
    return () => clearTimeout(t);
  }, [sceneIdx, done]);

  // Progress bar tick
  useEffect(() => {
    if (done) return;
    if (!startRef.current) startRef.current = performance.now();
    let raf = 0;
    const tick = () => {
      setElapsed(Math.min(TOTAL_MS, performance.now() - startRef.current));
      if (!done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [done]);

  const restart = () => {
    startRef.current = performance.now();
    setElapsed(0);
    setSceneIdx(0);
    setDone(false);
  };

  const current = SCENES[sceneIdx]?.id;

  return (
    <>
      <style>{css}</style>
      <div className="sw-root">

        {/* SCENE 1 — Intro / brand reveal */}
        <Scene active={current === "intro"}>
          <div className="sw-intro">
            <div className="sw-intro-eyebrow">CatalogStore presents</div>
            <h1 className="sw-intro-title">
              Four templates.<br />
              <em>One platform.</em>
            </h1>
            <div className="sw-intro-tag">Built for South African sellers.</div>
          </div>
        </Scene>

        {/* SCENES 2–5 — Each template in a phone frame */}
        {TEMPLATES.map((t, i) => (
          <PersistentScene key={t.theme} active={current === `tpl-${i}`}>
            <PhoneStage template={t} active={current === `tpl-${i}`} />
          </PersistentScene>
        ))}

        {/* SCENE 6 — Pricing outro */}
        <Scene active={current === "pricing"}>
          <div className="sw-pricing">
            <div className="sw-pricing-eyebrow">Start today</div>
            <h1 className="sw-pricing-title">
              <span className="grad">7 Days Free</span>
            </h1>
            <div className="sw-pricing-row">
              <div className="sw-pricing-item"><span className="sw-pricing-val">R0</span><span className="sw-pricing-lbl">Today</span></div>
              <div className="sw-pricing-divider" />
              <div className="sw-pricing-item"><span className="sw-pricing-val">R49</span><span className="sw-pricing-lbl">First Month</span></div>
              <div className="sw-pricing-divider" />
              <div className="sw-pricing-item"><span className="sw-pricing-val">R149</span><span className="sw-pricing-lbl">/ Month After</span></div>
            </div>
            <div className="sw-pricing-cta">catalogstore.co.za</div>
            <div className="sw-pricing-foot">Cancel anytime · No commission · Built in South Africa</div>
          </div>
        </Scene>

        {/* Progress bar */}
        <div className="sw-progress">
          <div className="sw-progress-fill" style={{ width: `${(elapsed / TOTAL_MS) * 100}%` }} />
        </div>

        {done && (
          <button onClick={restart} className="sw-replay">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
            Replay
          </button>
        )}
      </div>
    </>
  );
}

// ── SCENE WRAPPERS ───────────────────────────────────────
// Default: lazy-mount on first activation so CSS animations fire fresh
// when each scene plays (not at page load).
function Scene({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [render, setRender] = useState(active);
  useEffect(() => {
    if (active) { setRender(true); }
    else if (render) {
      const t = setTimeout(() => setRender(false), 700);
      return () => clearTimeout(t);
    }
  }, [active, render]);
  return <div className={`sw-scene${active ? " on" : ""}`}>{render ? children : null}</div>;
}

// Persistent: children stay mounted so template iframes can fetch HTML +
// assets ahead of their scene actually playing. Only opacity flips.
function PersistentScene({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={`sw-scene${active ? " on" : ""}`}>{children}</div>;
}

// ── PHONE STAGE ──────────────────────────────────────────
// Each template scene: centered phone, theme number + name + tag below.
function PhoneStage({ template, active }: { template: typeof TEMPLATES[0]; active: boolean }) {
  return (
    <div className="sw-phone-stage">
      <div className="sw-phone">
        <div className="sw-phone-notch" />
        <ScaledIframe src={template.src} title={template.name} background={template.bg} active={active} />
      </div>
      <div className="sw-phone-caption">
        <div className="sw-phone-theme">Theme {template.theme}</div>
        <div className="sw-phone-name">{template.name}</div>
        <div className="sw-phone-tag">{template.tag}</div>
      </div>
    </div>
  );
}

// ── SCALED IFRAME WITH AUTO-SCROLL ───────────────────────
// Renders the storefront at a 400px virtual viewport (so mobile breakpoints
// fire correctly inside the iframe), scales it to fill the phone screen,
// and injects a CSS transform into the iframe document to scroll the body
// from top to bottom over SCROLL_MS milliseconds when the scene is active.
function ScaledIframe({ src, title, background, active }: {
  src: string; title: string; background: string; active: boolean;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const VW = 400;
  const VH = 844;

  // Keep the iframe scaled to fit the phone screen width.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const w = wrap.clientWidth;
      if (w > 0) wrap.style.setProperty("--sw-scale", String(w / VW));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Drive the auto-scroll when active. Re-injects each activation so per-iframe
  // scroll distance is recomputed and the animation restarts from top.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const drive = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Force-eager every image so they all download while earlier scenes are
      // playing. We translate the body to scroll (not the iframe scrollTop),
      // which means loading="lazy" doesn't trigger -- without this fix half
      // the products + texture circles stay as broken-image placeholders.
      doc.querySelectorAll("img").forEach((img) => {
        img.loading = "eager";
        img.decoding = "async";
      });

      const contentHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
      const viewportHeight = doc.documentElement.clientHeight || VH;
      const scrollDistance = Math.max(0, contentHeight - viewportHeight - 40);

      const existing = doc.querySelector("#sw-scroll-style");
      if (existing) existing.remove();
      const style = doc.createElement("style");
      style.id = "sw-scroll-style";
      style.textContent = `
        html, body { will-change: transform; backface-visibility: hidden; }
        body {
          transition: transform ${SCROLL_MS}ms cubic-bezier(0.42, 0, 0.58, 1);
          transform: translateY(0);
        }
        body.sw-scrolling { transform: translateY(-${scrollDistance}px); }
      `;
      doc.head.appendChild(style);

      doc.body.classList.remove("sw-scrolling");
      void doc.body.offsetHeight; // reflow so the next transition fires
      if (active) {
        requestAnimationFrame(() => doc.body.classList.add("sw-scrolling"));
      }
    };

    if (iframe.contentDocument?.readyState === "complete") {
      drive();
    } else {
      iframe.addEventListener("load", drive, { once: true });
      return () => iframe.removeEventListener("load", drive);
    }
  }, [active]);

  return (
    <div ref={wrapRef} className="sw-iframe-wrap" style={{ background }}>
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        loading="eager"
        scrolling="no"
        style={{ width: VW, height: VH }}
        className="sw-iframe"
      />
    </div>
  );
}

const css = `
  .sw-root {
    position: fixed; inset: 0;
    background: radial-gradient(ellipse at center, #0a0a10 0%, #030305 70%);
    color: #f5f5f5;
    font-family: 'Schibsted Grotesk', -apple-system, sans-serif;
    overflow: hidden;
    z-index: 9999;
  }
  .grad {
    background: linear-gradient(135deg,#ff6b35,#ff3d6e);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }

  .sw-scene {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 32px 20px;
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
  }
  .sw-scene.on { opacity: 1; pointer-events: auto; }

  /* ── INTRO ─────────────────────────────────────────── */
  .sw-intro {
    text-align: center;
    animation: sw-fade-up 1s ease both;
  }
  .sw-intro-eyebrow {
    font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase;
    color: rgba(245,245,245,0.45); margin-bottom: 28px;
    animation: sw-fade-up 0.9s 0.1s ease both;
  }
  .sw-intro-title {
    font-size: clamp(40px, 9vw, 76px); font-weight: 900;
    line-height: 1.04; letter-spacing: -0.04em;
    margin-bottom: 24px;
    animation: sw-fade-up 0.9s 0.4s ease both;
  }
  .sw-intro-title em {
    font-style: italic;
    background: linear-gradient(135deg,#ff6b35,#ff3d6e);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .sw-intro-tag {
    font-size: 14px; letter-spacing: 0.08em; text-transform: uppercase;
    color: rgba(245,245,245,0.55); font-weight: 500;
    animation: sw-fade-up 0.9s 0.9s ease both;
  }

  /* ── PHONE STAGE ──────────────────────────────────── */
  .sw-phone-stage {
    display: flex; flex-direction: column; align-items: center;
    gap: 28px;
    width: 100%;
    animation: sw-pop-up 0.9s ease both;
  }
  .sw-phone {
    /* Scales to roughly fit a portrait viewport while keeping iPhone-ish
       proportions. 56vh × 9/19 = phone width; capped for tablet/desktop. */
    position: relative;
    height: min(64vh, 700px);
    aspect-ratio: 9/19;
    background: #0a0a0a;
    border-radius: clamp(28px, 5vh, 44px);
    padding: clamp(7px, 1vh, 10px);
    box-shadow:
      0 30px 80px rgba(0,0,0,0.7),
      0 0 0 1px rgba(255,255,255,0.08),
      inset 0 0 0 2px rgba(255,255,255,0.04);
    overflow: hidden;
  }
  .sw-phone-notch {
    position: absolute; top: 18px; left: 50%; transform: translateX(-50%);
    width: 24%; max-width: 96px; height: clamp(18px, 2.4vh, 26px);
    background: #000; border-radius: 14px; z-index: 2;
    pointer-events: none;
  }
  .sw-iframe-wrap {
    position: relative; width: 100%; height: 100%;
    border-radius: clamp(22px, 4vh, 36px);
    overflow: hidden;
  }
  .sw-iframe {
    position: absolute; top: 0; left: 0;
    border: none; display: block;
    transform-origin: top left;
    transform: scale(var(--sw-scale, 0.5));
    pointer-events: none;
  }
  .sw-phone-caption {
    text-align: center;
    animation: sw-fade-up 0.7s 0.3s ease both;
  }
  .sw-phone-theme {
    font-size: 11px; font-weight: 800; letter-spacing: 0.22em;
    text-transform: uppercase; color: #ff6b35;
    margin-bottom: 8px;
  }
  .sw-phone-name {
    font-size: clamp(22px, 4vw, 32px); font-weight: 900;
    letter-spacing: -0.02em; text-transform: uppercase;
    color: #f5f5f5; line-height: 1; margin-bottom: 8px;
  }
  .sw-phone-tag {
    font-size: 12px; letter-spacing: 0.08em;
    color: rgba(245,245,245,0.45);
  }

  /* ── PRICING ──────────────────────────────────────── */
  .sw-pricing {
    text-align: center;
    max-width: 560px;
    animation: sw-fade-up 0.9s ease both;
  }
  .sw-pricing-eyebrow {
    font-size: 11px; letter-spacing: 0.3em; text-transform: uppercase;
    color: rgba(245,245,245,0.45); margin-bottom: 16px;
  }
  .sw-pricing-title {
    font-size: clamp(56px, 12vw, 120px); font-weight: 900;
    line-height: 1; letter-spacing: -0.05em;
    margin-bottom: 36px;
    animation: sw-pop-up 1s 0.15s ease both;
  }
  .sw-pricing-row {
    display: flex; align-items: stretch; justify-content: center;
    gap: 18px; margin-bottom: 36px;
    flex-wrap: wrap;
    animation: sw-fade-up 0.9s 0.5s ease both;
  }
  .sw-pricing-item {
    display: flex; flex-direction: column; align-items: center; gap: 4px;
  }
  .sw-pricing-val {
    font-size: 26px; font-weight: 900; color: #f5f5f5;
    letter-spacing: -0.02em;
  }
  .sw-pricing-lbl {
    font-size: 10px; letter-spacing: 0.16em; text-transform: uppercase;
    color: rgba(245,245,245,0.45); font-weight: 600;
  }
  .sw-pricing-divider {
    width: 1px; align-self: stretch;
    background: rgba(255,255,255,0.08);
  }
  .sw-pricing-cta {
    font-size: clamp(20px, 4vw, 32px); font-weight: 900;
    letter-spacing: -0.02em;
    margin-bottom: 14px;
    background: linear-gradient(135deg,#ff6b35,#ff3d6e);
    -webkit-background-clip: text; -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: sw-fade-up 0.9s 0.8s ease both;
  }
  .sw-pricing-foot {
    font-size: 11px; letter-spacing: 0.1em; text-transform: uppercase;
    color: rgba(245,245,245,0.35); font-weight: 500;
    animation: sw-fade-up 0.9s 1.1s ease both;
  }

  /* ── PROGRESS / REPLAY ────────────────────────────── */
  .sw-progress {
    position: absolute; bottom: 0; left: 0; right: 0;
    height: 3px; background: rgba(255,255,255,0.06);
    z-index: 10000;
  }
  .sw-progress-fill {
    height: 100%;
    background: linear-gradient(90deg,#ff6b35,#ff3d6e);
    transition: width 0.1s linear;
  }
  .sw-replay {
    position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%);
    padding: 12px 26px; border-radius: 100px;
    background: linear-gradient(135deg,#1c1c20 0%,#0d0d11 100%);
    border: 1px solid rgba(255,107,53,0.35);
    color: #fff; font-family: inherit;
    font-size: 11px; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase;
    cursor: pointer; z-index: 10001;
    display: inline-flex; align-items: center; gap: 8px;
    box-shadow: 0 4px 18px rgba(255,107,53,0.15);
  }

  /* ── KEYFRAMES ────────────────────────────────────── */
  @keyframes sw-fade-up {
    from { opacity: 0; transform: translateY(18px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes sw-pop-up {
    from { opacity: 0; transform: translateY(28px) scale(0.96); }
    to   { opacity: 1; transform: translateY(0) scale(1); }
  }
`;
