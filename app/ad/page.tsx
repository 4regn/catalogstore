"use client";

import { useEffect, useState, useRef } from "react";

// 60-second motion-graphic ad. Plays as an in-browser experience -- can be
// shared via direct URL or screen-recorded for social. Each scene fades in
// when active and out when the next takes over; total runtime ~60s.
//
// Scene durations follow the script: Act 1 problem (0-15), Act 2 solution
// (15-30), Act 3 templates + AI preview (30-44), Act 4 CTA (44-60).

type Scene =
  | "intro"
  | "chaos"
  | "transition"
  | "logoReveal"
  | "buildStore"
  | "firstSale"
  | "templates"
  | "stats"
  | "trial"
  | "endCard";

const SCENES: { id: Scene; duration: number }[] = [
  { id: "intro",       duration: 3500 },
  { id: "chaos",       duration: 8500 },
  { id: "transition",  duration: 3000 },
  { id: "logoReveal",  duration: 4000 },
  { id: "buildStore",  duration: 6000 },
  { id: "firstSale",   duration: 5000 },
  { id: "templates",   duration: 14000 },
  { id: "stats",       duration: 6000 },
  { id: "trial",       duration: 5000 },
  { id: "endCard",     duration: 5000 },
];
const TOTAL_MS = SCENES.reduce((a, s) => a + s.duration, 0);

export default function AdPage() {
  const [sceneIdx, setSceneIdx] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [done, setDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const startRef = useRef<number>(0);

  // Pre-cache assets that appear in mid-ad scenes so they're ready in time.
  // (Without this the butterfly tee thumbnail in scene 6 was still loading
  // when scene 7 took over.)
  useEffect(() => {
    ["/ad-assets/butterfly-tee.jpg"].forEach((src) => { new Image().src = src; });
  }, []);

  // Advance scenes
  useEffect(() => {
    if (!playing || done) return;
    if (sceneIdx >= SCENES.length) {
      setDone(true);
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setSceneIdx((i) => i + 1), SCENES[sceneIdx].duration);
    return () => clearTimeout(t);
  }, [sceneIdx, playing, done]);

  // Progress bar tick
  useEffect(() => {
    if (!playing) return;
    if (!startRef.current) startRef.current = performance.now() - elapsed;
    let raf: number;
    const tick = () => {
      setElapsed(Math.min(TOTAL_MS, performance.now() - startRef.current));
      if (playing && !done) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, done]);

  const restart = () => {
    startRef.current = performance.now();
    setElapsed(0);
    setSceneIdx(0);
    setDone(false);
    setPlaying(true);
  };

  const currentScene = SCENES[sceneIdx]?.id;

  return (
    <>
      <style>{css}</style>
      <div className="ad-root">

        {/* SCENE 1 — intro text */}
        <Scene active={currentScene === "intro"}>
          <p className="ad-eyebrow">2026 · A SOUTH AFRICAN STORY</p>
          <h1 className="ad-headline">
            This is how <em>most</em> South African<br />sellers run their business.
          </h1>
        </Scene>

        {/* SCENE 2 — WhatsApp chaos */}
        <Scene active={currentScene === "chaos"}>
          <ChaosScene active={currentScene === "chaos"} />
        </Scene>

        {/* SCENE 3 — transition */}
        <Scene active={currentScene === "transition"}>
          <h1 className="ad-headline ad-center-grow">
            There&apos;s a <span className="grad">better</span> way.
          </h1>
        </Scene>

        {/* SCENE 4 — CatalogStore logo */}
        <Scene active={currentScene === "logoReveal"}>
          <div className="ad-logo-row">
            <Logo size={88} />
            <span className="ad-logo-text">
              CATALOG<span className="grad">STORE</span>
            </span>
          </div>
          <p className="ad-tagline">Built for South African sellers.</p>
        </Scene>

        {/* SCENE 5 — Pick your name, pick your look */}
        <Scene active={currentScene === "buildStore"}>
          <BuildStoreScene />
        </Scene>

        {/* SCENE 6 — First card sale */}
        <Scene active={currentScene === "firstSale"}>
          <FirstSaleScene />
        </Scene>

        {/* SCENE 7 — Templates + AI preview. PersistentScene so iframes preload. */}
        <PersistentScene active={currentScene === "templates"}>
          <TemplatesScene active={currentScene === "templates"} />
        </PersistentScene>

        {/* SCENE 8 — Stats lockup */}
        <Scene active={currentScene === "stats"}>
          <StatsScene />
        </Scene>

        {/* SCENE 9 — Trial */}
        <Scene active={currentScene === "trial"}>
          <TrialScene />
        </Scene>

        {/* SCENE 10 — End card */}
        <Scene active={currentScene === "endCard"}>
          <div className="ad-logo-row">
            <Logo size={48} />
            <span className="ad-logo-text" style={{ fontSize: 28 }}>
              CATALOG<span className="grad">STORE</span>
            </span>
          </div>
          <h2 className="ad-end-url">catalogstore.co.za</h2>
          <p className="ad-tagline">Built for South African sellers. 🇿🇦</p>
        </Scene>

        {/* PROGRESS BAR */}
        <div className="ad-progress">
          <div className="ad-progress-fill" style={{ width: `${(elapsed / TOTAL_MS) * 100}%` }} />
        </div>

        {/* REPLAY / SKIP CONTROLS */}
        {done && (
          <button onClick={restart} className="ad-replay">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
// Default Scene: lazy-mount children on first activation, unmount 700ms after
// deactivation (long enough for the fade-out transition). CSS animations with
// animation-delay therefore fire FRESH each time the scene activates, instead
// of having already played at page load when their delay timer was running.
function Scene({ active, children }: { active: boolean; children: React.ReactNode }) {
  const [render, setRender] = useState(active);
  useEffect(() => {
    if (active) {
      setRender(true);
    } else if (render) {
      const t = setTimeout(() => setRender(false), 700);
      return () => clearTimeout(t);
    }
  }, [active, render]);
  return <div className={`ad-scene${active ? " on" : ""}`}>{render ? children : null}</div>;
}

// PersistentScene: children are always mounted, only opacity toggles. Used for
// the templates scene so the four template iframes pre-load while the user is
// watching the earlier scenes -- they'd never be ready in time otherwise.
function PersistentScene({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={`ad-scene${active ? " on" : ""}`}>{children}</div>;
}

// ── SCENE 2: WhatsApp chaos ──────────────────────────────
// Cinematic accelerating reveal: messages start arriving every ~1.2s and ramp
// up exponentially until they're firing every 80ms by the end. They stack
// upward from the bottom of the screen (chat-style) so the visual effect is a
// growing pile of unread DMs the seller can't keep up with. Background dims +
// a subtle shake kicks in once the cadence peaks. Final overlay caption sits
// on top of the pile in the last beat.
const CHAOS_MESSAGES = [
  { who: "Lerato",        msg: "Hi sis, do u still have the cream one?" },
  { who: "+27 82 ***",    msg: "What size 32?" },
  { who: "Cousin Sipho",  msg: "Can I EFT tonight?" },
  { who: "Mama T",        msg: "Pls send pic 🙏" },
  { who: "Thando",        msg: "Did u get my payment??" },
  { who: "Lerato",        msg: "Hellooo???" },
  { who: "+27 78 ***",    msg: "Are u still selling?" },
  { who: "Bank App",      msg: "+R250 deposit — but from who?" },
  { who: "+27 71 ***",    msg: "Do u deliver to Joburg?" },
  { who: "Mama T",        msg: "Pic pls 😩" },
  { who: "Lerato",        msg: "Sis pls reply" },
  { who: "Zinhle",        msg: "Hi, available?" },
  { who: "+27 84 ***",    msg: "How much for 2?" },
  { who: "Cousin Sipho",  msg: "??" },
  { who: "Mama T",        msg: "Are u ignoring me??" },
  { who: "Lerato",        msg: "🤔" },
  { who: "Voice note",    msg: "🎙 0:34" },
  { who: "+27 76 ***",    msg: "Pls reply 🙏🙏" },
];

const AVATAR_COLORS = ["#ff6b35", "#ff3d6e", "#25d366", "#fbbf24", "#8b5cf6", "#06b6d4"];
const avatarColor = (name: string) => AVATAR_COLORS[name.charCodeAt(0) % AVATAR_COLORS.length];

function ChaosScene({ active }: { active: boolean }) {
  const [count, setCount] = useState(0);
  const total = CHAOS_MESSAGES.length;

  useEffect(() => {
    if (!active) { setCount(0); return; }
    const timeouts: ReturnType<typeof setTimeout>[] = [];
    let elapsed = 0;
    for (let i = 0; i < total; i++) {
      // exponential acceleration: 1200ms -> ~80ms over the scene's 8.5s budget
      const gap = Math.max(80, 1250 * Math.pow(0.78, i));
      elapsed += gap;
      timeouts.push(setTimeout(() => setCount(i + 1), elapsed));
    }
    return () => timeouts.forEach(clearTimeout);
  }, [active, total]);

  const peakReached = count >= total - 4;
  const showCaption  = count >= total - 2;

  return (
    <div className={`chaos-stage${peakReached ? " peak" : ""}`}>
      <div className="chaos-vignette" />
      <div className="chaos-stack">
        {CHAOS_MESSAGES.slice(0, count).map((m, i) => (
          <div key={i} className="chaos-msg">
            <div className="chaos-avatar" style={{ background: avatarColor(m.who) }}>
              {m.who.replace(/[+0-9 *]/g, "").trim().charAt(0) || "?"}
            </div>
            <div className="chaos-msg-body">
              <div className="chaos-msg-name">{m.who}</div>
              <div className="chaos-msg-text">{m.msg}</div>
            </div>
            <div className="chaos-time">now</div>
          </div>
        ))}
      </div>
      {showCaption && (
        <div className="chaos-caption">
          Hundreds of DMs.<br />
          <span className="grad">No way to scale.</span>
        </div>
      )}
    </div>
  );
}

// ── SCENE 5: Build store ─────────────────────────────────
function BuildStoreScene() {
  return (
    <div className="build-stage">
      <h2 className="build-headline">
        Pick a name.<br />Pick a look.<br /><span className="grad">Go live in minutes.</span>
      </h2>
      <div className="build-mock">
        <div className="build-mock-label">STORE NAME</div>
        <div className="build-mock-input">
          <span className="build-typing">MAISON KALA</span>
          <span className="build-cursor">|</span>
        </div>
        <div className="build-mock-url">
          catalogstore.co.za/store/<span className="grad-text">maison-kala</span>
        </div>
      </div>
    </div>
  );
}

// ── SCENE 6: First sale ──────────────────────────────────
function FirstSaleScene() {
  return (
    <div className="sale-stage">
      <div className="phone-frame">
        <div className="phone-notch" />
        <div className="phone-screen">
          <div className="sale-cart-row">
            <span className="sale-cart-label">BAG</span>
            <span className="sale-cart-count">(1)</span>
          </div>
          <div className="sale-product">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/ad-assets/butterfly-tee.jpg" alt="Butterfly Tee" className="sale-product-image" />
            <div>
              <div className="sale-product-name">Butterfly Tee</div>
              <div className="sale-product-price">R599</div>
            </div>
          </div>
          <div className="sale-pay-btn">PAY R599</div>
          <div className="sale-success">
            <div className="sale-check">✓</div>
            <div className="sale-success-text">Payment received</div>
            <div className="sale-success-sub">via card · settled instantly</div>
          </div>
        </div>
      </div>
      <h2 className="sale-headline">
        Real <span className="grad">card payments.</span><br />
        No more chasing.
      </h2>
    </div>
  );
}

// ── SCENE 7: Templates + AI ──────────────────────────────
const TEMPLATES = [
  { name: "HEIRLOOM",     tag: "fashion + lifestyle", src: "/templates/heirloom/index.html" },
  { name: "CROWN",        tag: "beauty + hair",        src: "/templates/crown/index.html" },
  { name: "GLASS CHROME", tag: "electronics + tech",   src: "/templates/volt/index.html" },
  { name: "SOFT LUXURY",  tag: "skincare + fragrance", src: "/templates/aurelia/index.html" },
];

// Same approach as the landing-page ScaledIframe: render at a fixed 400x844
// virtual viewport, scale to fit the container via a CSS variable set by a
// ResizeObserver. Without this the iframe content overflows or stays white.
//
// Also drives an auto-scroll inside the iframe when the templates scene is
// active -- since the iframes are same-origin, we can poke their scroll
// position directly via JS. This walks the viewer through each store's hero
// → products → footer over the scene's 14-second budget.
function ScaledTemplateIframe({ src, title, active }: { src: string; title: string; active: boolean }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const VW = 400;
  const VH = 844;

  // Scale to fit container
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const update = () => {
      const w = wrap.clientWidth;
      if (w > 0) wrap.style.setProperty("--ad-tpl-scale", String(w / VW));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, []);

  // Auto-scroll when scene is active. Instead of driving scrollTop from JS
  // (which forces 60 reflows per second across 4 iframes -> jank + visible
  // shake), we inject a CSS transition INTO each iframe's document. Since the
  // iframes are same-origin we can write to contentDocument.head directly, and
  // a single CSS transform animation is GPU-composited -- zero JS work after
  // the trigger, smooth even with 4 simultaneously.
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const inject = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;

      // Measure the actual content height of this template so we don't scroll
      // past the footer into blank space (VOLT + Aurelia are shorter than
      // Crown + Heirloom, so a fixed scroll distance overshoots them).
      const contentHeight = Math.max(
        doc.body.scrollHeight,
        doc.documentElement.scrollHeight,
      );
      const viewportHeight = doc.documentElement.clientHeight || VH;
      // Stop ~40px before the absolute end so the footer is still in view.
      const scrollDistance = Math.max(0, contentHeight - viewportHeight - 40);

      // Re-inject the style each time so the per-iframe distance is fresh.
      const existing = doc.querySelector("#ad-scroll-style");
      if (existing) existing.remove();
      const style = doc.createElement("style");
      style.id = "ad-scroll-style";
      style.textContent = `
        html, body { will-change: transform; backface-visibility: hidden; }
        body {
          transition: transform 12s cubic-bezier(0.42, 0, 0.58, 1);
          transform: translateY(0);
        }
        body.ad-scrolling {
          transform: translateY(-${scrollDistance}px);
        }
      `;
      doc.head.appendChild(style);

      // Reset and trigger
      doc.body.classList.remove("ad-scrolling");
      void doc.body.offsetHeight;
      if (active) {
        requestAnimationFrame(() => doc.body.classList.add("ad-scrolling"));
      }
    };

    if (iframe.contentDocument?.readyState === "complete") {
      inject();
    } else {
      iframe.addEventListener("load", inject, { once: true });
      return () => iframe.removeEventListener("load", inject);
    }
  }, [active]);

  return (
    <div ref={wrapRef} className="ad-tpl-iframe-wrap">
      <iframe
        ref={iframeRef}
        src={src}
        title={title}
        loading="eager"
        style={{ width: VW, height: VH }}
        className="ad-tpl-iframe"
        scrolling="no"
      />
    </div>
  );
}

function TemplatesScene({ active }: { active: boolean }) {
  return (
    <div className="templates-stage">
      <h2 className="templates-headline">
        Four templates.<br />
        <span className="grad">Give your business a professional storefront.</span>
      </h2>
      <div className="templates-row">
        {TEMPLATES.map((t, i) => (
          <div key={t.name} className="templates-phone" style={{ animationDelay: `${300 + i * 600}ms` }}>
            <div className="phone-frame">
              <div className="phone-notch" />
              <ScaledTemplateIframe src={t.src} title={t.name} active={active} />
            </div>
            <div className="templates-phone-label">
              <span className="templates-phone-name">{t.name}</span>
              <span className="templates-phone-tag">{t.tag}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── SCENE 8: Stats ───────────────────────────────────────
function StatsScene() {
  const items = [
    { val: "Card · EFT · Apple Pay · WhatsApp", label: "Every payment method" },
    { val: "0%", label: "Commission on every sale" },
    { val: "1-on-1", label: "Personal onboarding from day one" },
  ];
  return (
    <div className="stats-stage">
      {items.map((it, i) => (
        <div key={i} className="stats-item" style={{ animationDelay: `${i * 600}ms` }}>
          <div className="stats-val">{it.val}</div>
          <div className="stats-label">{it.label}</div>
        </div>
      ))}
    </div>
  );
}

// ── SCENE 9: Trial ───────────────────────────────────────
function TrialScene() {
  return (
    <div className="trial-stage">
      <p className="trial-eyebrow">START TODAY</p>
      <h1 className="trial-big">
        <span className="grad">7 Days Free</span>
      </h1>
      <p className="trial-sub">R0 today · R49 first month · R149/mo after</p>
    </div>
  );
}

// ── LOGO COMPONENT ───────────────────────────────────────
function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <defs>
        <linearGradient id="lg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ff6b35" />
          <stop offset="100%" stopColor="#ff3d6e" />
        </linearGradient>
      </defs>
      <path d="M54 12 A26 26 0 1 0 54 60" stroke="url(#lg1)" strokeWidth="9" strokeLinecap="round" fill="none" />
      <circle cx="57" cy="36" r="6" fill="url(#lg1)" />
    </svg>
  );
}

// ── STYLES ───────────────────────────────────────────────
const css = `
  .ad-root {
    position: fixed; inset: 0;
    background: #030303;
    color: #f5f5f5;
    font-family: 'Schibsted Grotesk', -apple-system, sans-serif;
    overflow: hidden;
    z-index: 9999;
  }
  .grad { background: linear-gradient(135deg,#ff6b35,#ff3d6e); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

  .ad-scene {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 20px 16px;
    text-align: center;
    opacity: 0;
    transition: opacity 0.6s ease;
    pointer-events: none;
  }
  .ad-scene.on { opacity: 1; pointer-events: auto; }

  .ad-eyebrow {
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.22em;
    text-transform: uppercase;
    color: rgba(245,245,245,0.35);
    margin-bottom: 28px;
    animation: fade-up 1s ease both;
  }
  .ad-headline {
    font-size: clamp(28px, 6vw, 56px);
    font-weight: 900;
    line-height: 1.1;
    letter-spacing: -0.04em;
    max-width: 900px;
    animation: fade-up 1s 0.2s ease both;
  }
  .ad-headline em { font-style: italic; color: #ff6b35; }
  .ad-center-grow { animation: pop-in 0.8s ease both !important; }
  @keyframes fade-up {
    from { opacity: 0; transform: translateY(20px); }
    to { opacity: 1; transform: translateY(0); }
  }
  @keyframes pop-in {
    from { opacity: 0; transform: scale(0.85); }
    to { opacity: 1; transform: scale(1); }
  }

  /* CHAOS SCENE */
  .chaos-stage {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    align-items: center;
    overflow: hidden;
    padding: 0 0 40px;
    transition: filter 0.6s ease;
  }
  .chaos-stage.peak {
    animation: chaos-shake 0.12s linear infinite;
  }
  @keyframes chaos-shake {
    0%, 100% { transform: translate(0, 0); }
    25% { transform: translate(-2px, 1px); }
    75% { transform: translate(2px, -1px); }
  }
  .chaos-vignette {
    position: absolute; inset: 0;
    background: radial-gradient(circle at 50% 60%, transparent 0%, rgba(0,0,0,0.5) 80%);
    z-index: 0;
    pointer-events: none;
  }
  .chaos-stack {
    display: flex;
    flex-direction: column;
    gap: 8px;
    width: min(440px, 92vw);
    max-height: 78vh;
    overflow: hidden;
    align-items: stretch;
    justify-content: flex-end;
    z-index: 1;
    mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 100%);
    -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 18%, #000 100%);
  }
  .chaos-msg {
    display: grid;
    grid-template-columns: 36px 1fr auto;
    gap: 10px;
    align-items: flex-start;
    animation: chaos-pop 0.32s cubic-bezier(0.16,1,0.3,1) both;
  }
  @keyframes chaos-pop {
    from { opacity: 0; transform: translateY(28px) scale(0.92); }
    to   { opacity: 1; transform: translateY(0)    scale(1); }
  }
  .chaos-avatar {
    width: 36px; height: 36px;
    border-radius: 50%;
    display: flex; align-items: center; justify-content: center;
    font-size: 14px; font-weight: 800; color: #fff;
    text-transform: uppercase;
    box-shadow: 0 2px 8px rgba(0,0,0,0.4);
  }
  .chaos-msg-body {
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.06);
    border-radius: 4px 14px 14px 14px;
    padding: 8px 14px;
    box-shadow: 0 4px 18px rgba(0,0,0,0.4);
    min-width: 0;
  }
  .chaos-msg-name {
    font-size: 11px;
    font-weight: 700;
    color: #25d366;
    margin-bottom: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .chaos-msg-text {
    font-size: 13px;
    color: #f5f5f5;
    line-height: 1.4;
  }
  .chaos-time {
    font-size: 10px;
    color: rgba(255,255,255,0.3);
    align-self: center;
    padding-top: 16px;
  }
  .chaos-caption {
    position: absolute;
    top: 50%; left: 50%;
    transform: translate(-50%, -50%);
    font-size: clamp(28px, 5vw, 52px);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: -0.03em;
    text-align: center;
    z-index: 10;
    padding: 28px 40px;
    background: rgba(3,3,3,0.78);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 20px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.6);
    animation: pop-in 0.6s ease both;
  }

  /* LOGO REVEAL */
  .ad-logo-row {
    display: flex; align-items: center; gap: 18px;
    margin-bottom: 18px;
    animation: pop-in 0.8s ease both;
  }
  .ad-logo-text {
    font-size: clamp(40px, 7vw, 64px);
    font-weight: 900;
    letter-spacing: -0.04em;
    text-transform: uppercase;
  }
  .ad-tagline {
    font-size: 14px;
    color: rgba(245,245,245,0.5);
    letter-spacing: 0.08em;
    text-transform: uppercase;
    animation: fade-up 0.8s 0.5s ease both;
  }

  /* BUILD STORE */
  .build-stage { display: flex; flex-direction: column; align-items: center; gap: 40px; }
  .build-headline {
    font-size: clamp(28px, 5vw, 48px);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: -0.03em;
    animation: fade-up 0.8s ease both;
  }
  .build-mock {
    background: rgba(255,255,255,0.03);
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 16px;
    padding: 28px 36px;
    min-width: min(420px, 90vw);
    animation: fade-up 0.8s 0.4s ease both;
  }
  .build-mock-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(245,245,245,0.4);
    margin-bottom: 10px;
    text-align: left;
  }
  .build-mock-input {
    font-size: 22px;
    font-weight: 700;
    color: #f5f5f5;
    padding: 12px 0;
    border-bottom: 1px solid rgba(255,255,255,0.15);
    margin-bottom: 14px;
    text-align: left;
  }
  .build-typing {
    display: inline-block;
    overflow: hidden;
    white-space: nowrap;
    border-right: 0;
    animation: typing 1.6s 0.6s steps(11) both;
  }
  @keyframes typing { from { max-width: 0; } to { max-width: 200px; } }
  .build-cursor { animation: blink 0.8s infinite; }
  @keyframes blink { 50% { opacity: 0; } }
  .build-mock-url {
    font-size: 13px;
    color: rgba(245,245,245,0.55);
    text-align: left;
    animation: fade-up 0.6s 2.3s ease both;
  }
  .grad-text { background: linear-gradient(135deg,#ff6b35,#ff3d6e); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

  /* FIRST SALE */
  .sale-stage { display: flex; flex-direction: column; align-items: center; gap: 36px; }
  .sale-headline {
    font-size: clamp(24px, 5vw, 44px);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: -0.03em;
    animation: fade-up 0.8s 0.4s ease both;
  }
  .phone-frame {
    width: 260px;
    aspect-ratio: 9/19;
    background: #0a0a0a;
    border-radius: 36px;
    padding: 8px;
    box-shadow: 0 30px 80px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.08);
    position: relative;
    overflow: hidden;
    animation: pop-in 0.6s ease both;
  }
  .phone-notch {
    position: absolute; top: 14px; left: 50%; transform: translateX(-50%);
    width: 80px; height: 20px; background: #000; border-radius: 12px; z-index: 2;
  }
  .phone-screen {
    width: 100%; height: 100%;
    background: #fff;
    border-radius: 28px;
    overflow: hidden;
    position: relative;
    color: #1a1a1a;
    padding: 40px 18px 24px;
    display: flex; flex-direction: column; gap: 12px;
  }
  .sale-cart-row {
    display: flex; align-items: center; justify-content: flex-end; gap: 4px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.08em;
    padding-bottom: 8px; border-bottom: 1px solid rgba(0,0,0,0.06);
    animation: fade-up 0.4s 0.2s ease both;
  }
  .sale-cart-count { color: #ff6b35; }
  .sale-product {
    display: grid; grid-template-columns: 60px 1fr; gap: 10px;
    align-items: center;
    animation: fade-up 0.4s 0.6s ease both;
  }
  .sale-product-image {
    width: 60px; height: 60px;
    border-radius: 8px;
    object-fit: cover;
    /* Image is a tall portrait of a model in the tee -- crop to the chest
       area so the butterflies + 4REGN text are the focal point of the
       thumbnail, not the face. */
    object-position: center 70%;
    display: block;
  }
  .sale-product-name { font-size: 12px; font-weight: 700; }
  .sale-product-price { font-size: 11px; color: #1a1a1a; opacity: 0.6; }
  .sale-pay-btn {
    padding: 11px 0;
    background: #1a1a1a;
    color: #fff;
    border-radius: 100px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-align: center;
    margin-top: 8px;
    animation: fade-up 0.4s 1s ease both;
  }
  .sale-success {
    margin-top: 12px;
    padding: 14px;
    background: rgba(34,197,94,0.1);
    border: 1px solid rgba(34,197,94,0.3);
    border-radius: 10px;
    text-align: center;
    animation: pop-in 0.6s 2s ease both;
  }
  .sale-check {
    width: 32px; height: 32px;
    border-radius: 50%;
    background: #22c55e;
    color: #fff;
    font-size: 18px;
    font-weight: 900;
    display: flex; align-items: center; justify-content: center;
    margin: 0 auto 6px;
  }
  .sale-success-text {
    font-size: 12px; font-weight: 800; color: #16a34a;
  }
  .sale-success-sub {
    font-size: 9px; color: rgba(0,0,0,0.5); margin-top: 2px;
  }

  /* TEMPLATES */
  .templates-stage {
    display: flex; flex-direction: column;
    gap: 14px; padding: 0; width: 100%;
    align-items: center;
    height: 100%;
    justify-content: center;
  }
  .templates-headline {
    font-size: clamp(18px, 3vw, 28px);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: -0.03em;
    text-align: center;
    animation: fade-up 0.8s ease both;
  }
  .templates-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px 14px;
    width: auto;
    margin: 0 auto;
    box-sizing: border-box;
  }
  .templates-phone {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    opacity: 0;
    animation: fade-up 0.7s ease forwards;
  }
  .templates-phone .phone-frame {
    /* Size relative to viewport HEIGHT so 2 rows of phones + labels + headline
       always fit within the available vertical space. 13.5vh per phone width
       means height (at 9:19 aspect) is ~28.5vh, so 2 rows = ~57vh, plus
       ~10vh of labels + gaps + headline -> ~67vh used. Caps at 150px on tall
       desktop viewports so phones don't get absurdly big. */
    width: clamp(90px, 13.5vh, 150px);
    box-shadow: 0 14px 36px rgba(0,0,0,0.55);
  }
  .templates-phone .phone-notch {
    width: 42px; height: 13px;
  }
  .ad-tpl-iframe-wrap {
    position: relative;
    width: 100%;
    height: 100%;
    border-radius: 28px;
    overflow: hidden;
    background: #fff;
  }
  .ad-tpl-iframe {
    position: absolute;
    top: 0; left: 0;
    border: none;
    display: block;
    transform-origin: top left;
    transform: scale(var(--ad-tpl-scale, 0.4));
    pointer-events: none;
  }
  .templates-phone-label {
    display: flex; flex-direction: column; gap: 1px; align-items: center;
  }
  .templates-phone-name {
    font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: #ff6b35;
    text-align: center;
    line-height: 1.2;
  }
  .templates-phone-tag {
    font-size: 9px; color: rgba(245,245,245,0.4);
    text-align: center;
    line-height: 1.2;
  }

  /* STATS */
  .stats-stage {
    display: flex; flex-direction: column; gap: 28px;
    max-width: 600px;
  }
  .stats-item {
    opacity: 0;
    animation: fade-up 0.8s ease forwards;
    text-align: center;
  }
  .stats-val {
    font-size: clamp(22px, 4vw, 36px);
    font-weight: 900;
    letter-spacing: -0.03em;
    background: linear-gradient(135deg,#ff6b35,#ff3d6e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    margin-bottom: 6px;
  }
  .stats-label {
    font-size: 13px;
    color: rgba(245,245,245,0.6);
    letter-spacing: 0.04em;
  }

  /* TRIAL */
  .trial-stage { display: flex; flex-direction: column; align-items: center; gap: 14px; }
  .trial-eyebrow {
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: rgba(245,245,245,0.4);
    animation: fade-up 0.6s ease both;
  }
  .trial-big {
    font-size: clamp(64px, 12vw, 140px);
    font-weight: 900;
    line-height: 1;
    letter-spacing: -0.05em;
    animation: pop-in 0.8s 0.2s ease both;
  }
  .trial-sub {
    font-size: 14px;
    color: rgba(245,245,245,0.5);
    letter-spacing: 0.04em;
    margin-top: 12px;
    animation: fade-up 0.6s 0.8s ease both;
  }

  /* END URL */
  .ad-end-url {
    font-size: clamp(28px, 5vw, 48px);
    font-weight: 800;
    letter-spacing: -0.02em;
    margin: 14px 0 8px;
    background: linear-gradient(135deg,#ff6b35,#ff3d6e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
    animation: fade-up 0.6s 0.4s ease both;
  }

  /* PROGRESS BAR */
  .ad-progress {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    height: 3px;
    background: rgba(255,255,255,0.05);
    z-index: 10000;
  }
  .ad-progress-fill {
    height: 100%;
    background: linear-gradient(90deg,#ff6b35,#ff3d6e);
    transition: width 0.1s linear;
  }

  /* REPLAY */
  .ad-replay {
    position: absolute;
    bottom: 32px; left: 50%; transform: translateX(-50%);
    padding: 14px 28px;
    background: rgba(255,255,255,0.06);
    border: 1px solid rgba(255,255,255,0.12);
    color: #f5f5f5;
    border-radius: 100px;
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    display: inline-flex; align-items: center; gap: 10px;
    z-index: 10001;
    backdrop-filter: blur(20px);
  }
  .ad-replay:hover { background: rgba(255,255,255,0.1); }
`;
