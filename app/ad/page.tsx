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
          <ChaosScene />
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

        {/* SCENE 7 — Templates + AI preview */}
        <Scene active={currentScene === "templates"}>
          <TemplatesScene />
        </Scene>

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

// ── SCENE WRAPPER ────────────────────────────────────────
function Scene({ active, children }: { active: boolean; children: React.ReactNode }) {
  return <div className={`ad-scene${active ? " on" : ""}`}>{children}</div>;
}

// ── SCENE 2: WhatsApp chaos ──────────────────────────────
const CHAOS_MESSAGES = [
  { who: "Sis Lerato", msg: "Hi sis, do u still have the cream one?", t: 0 },
  { who: "Unknown +27 82", msg: "What size 32?", t: 600 },
  { who: "Cousin Sipho", msg: "Can I EFT tonight?", t: 1100 },
  { who: "Mama T", msg: "Pls send pic", t: 1600 },
  { who: "Thando", msg: "Did you get my payment??", t: 2100 },
  { who: "Sis Lerato", msg: "Hello???", t: 2700 },
  { who: "Unknown +27 78", msg: "Are you still selling?", t: 3200 },
  { who: "Mama T", msg: "Pic pls 🙏", t: 3800 },
  { who: "Banking app", msg: "+R250 deposit — but from who?", t: 4500 },
  { who: "Unknown +27 71", msg: "Do u deliver?", t: 5100 },
  { who: "Lerato", msg: "Sis pls reply", t: 5700 },
  { who: "Mama T", msg: "Are you ignoring me??", t: 6300 },
];

function ChaosScene() {
  return (
    <div className="chaos-stage">
      <div className="chaos-vignette" />
      {CHAOS_MESSAGES.map((m, i) => (
        <div
          key={i}
          className="chaos-bubble"
          style={{
            animationDelay: `${m.t}ms`,
            top: `${10 + (i * 7) % 70}%`,
            left: `${(i * 19) % 60 + 5}%`,
          }}
        >
          <div className="chaos-bubble-name">{m.who}</div>
          <div className="chaos-bubble-msg">{m.msg}</div>
        </div>
      ))}
      <div className="chaos-overlay-text">
        Hundreds of DMs. Manual payments.<br />
        <span className="grad">No way to scale.</span>
      </div>
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
            <div className="sale-product-image" />
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

function TemplatesScene() {
  return (
    <div className="templates-stage">
      <h2 className="templates-headline">
        Four templates.<br />
        <span className="grad">Built for SA brands.</span>
      </h2>
      <div className="templates-row">
        {TEMPLATES.map((t, i) => (
          <div key={t.name} className="templates-phone" style={{ animationDelay: `${300 + i * 600}ms` }}>
            <div className="phone-frame">
              <div className="phone-notch" />
              <iframe
                src={t.src}
                title={t.name}
                loading="lazy"
                className="templates-iframe"
              />
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
    padding: 32px 24px;
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
  .chaos-stage { position: relative; width: 100%; height: 100%; }
  .chaos-vignette {
    position: absolute; inset: 0;
    background: radial-gradient(circle at center, transparent 30%, rgba(0,0,0,0.7) 100%);
    z-index: 5;
  }
  .chaos-bubble {
    position: absolute;
    max-width: 240px;
    background: #1a1a1a;
    border: 1px solid rgba(255,255,255,0.08);
    border-radius: 14px;
    padding: 10px 14px;
    opacity: 0;
    animation: bubble-in 0.4s ease forwards;
    box-shadow: 0 4px 20px rgba(0,0,0,0.4);
  }
  @keyframes bubble-in {
    from { opacity: 0; transform: scale(0.7) translateY(20px); }
    to { opacity: 1; transform: scale(1) translateY(0); }
  }
  .chaos-bubble-name {
    font-size: 9px;
    font-weight: 700;
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: 0.08em;
    margin-bottom: 4px;
  }
  .chaos-bubble-msg {
    font-size: 13px;
    color: #f5f5f5;
    line-height: 1.35;
  }
  .chaos-overlay-text {
    position: absolute;
    bottom: 14%;
    left: 50%;
    transform: translateX(-50%);
    font-size: clamp(22px, 4vw, 38px);
    font-weight: 900;
    line-height: 1.2;
    letter-spacing: -0.03em;
    text-align: center;
    z-index: 10;
    animation: fade-up 1s 6.5s ease both;
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
    width: 60px; height: 60px; border-radius: 8px;
    background: linear-gradient(135deg,#ff6b35,#ff3d6e);
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
    display: flex; flex-direction: column; gap: 32px; padding: 0; width: 100%;
  }
  .templates-headline {
    font-size: clamp(22px, 4vw, 36px);
    font-weight: 900;
    line-height: 1.15;
    letter-spacing: -0.03em;
    text-align: center;
    animation: fade-up 0.8s ease both;
  }
  .templates-row {
    display: flex; gap: 18px; justify-content: center; align-items: flex-end;
    flex-wrap: wrap;
  }
  .templates-phone {
    display: flex; flex-direction: column; align-items: center; gap: 10px;
    opacity: 0;
    animation: fade-up 0.7s ease forwards;
  }
  .templates-phone .phone-frame {
    width: clamp(120px, 14vw, 180px);
    box-shadow: 0 20px 50px rgba(0,0,0,0.5);
  }
  .templates-phone .phone-notch {
    width: 50px; height: 14px;
  }
  .templates-iframe {
    width: 100%; height: 100%;
    border: none;
    border-radius: 24px;
    transform-origin: top left;
    transform: scale(0.4);
    width: 250%;
    height: 250%;
  }
  .templates-phone-label {
    display: flex; flex-direction: column; gap: 2px; align-items: center;
  }
  .templates-phone-name {
    font-size: 10px; font-weight: 800; letter-spacing: 0.1em;
    text-transform: uppercase; color: #ff6b35;
  }
  .templates-phone-tag {
    font-size: 9px; color: rgba(245,245,245,0.35);
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
