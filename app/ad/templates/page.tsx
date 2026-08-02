"use client";

import { useEffect, useRef, useState } from "react";

// 30-second pure-templates reel. Each of the four storefronts takes the full
// viewport in turn, auto-scrolling from hero -> footer, then crossfades to the
// next. Designed to be recorded at 1080x1920 for vertical social ads, but the
// layout adapts to any aspect.
//
// The templates were designed for a ~400px mobile viewport. We render each
// iframe at that fixed virtual width then transform:scale it up to fill the
// real viewport -- so the HTML inside thinks it's on mobile (correct
// breakpoint) but the visual covers a 1080-wide recording cleanly.

const TEMPLATES = [
  { src: "/templates/heirloom/index.html", name: "HEIRLOOM",     tag: "Fashion + Lifestyle" },
  { src: "/templates/crown/index.html",    name: "CROWN",        tag: "Beauty + Hair" },
  { src: "/templates/volt/index.html",     name: "GLASS CHROME", tag: "Electronics + Tech" },
  { src: "/templates/aurelia/index.html",  name: "SOFT LUXURY",  tag: "Skincare + Fragrance" },
];

const PER_TEMPLATE_MS = 7500; // 4 × 7.5 = 30s total
const SCROLL_MS = 6300;       // mostly scrolling, leaving ~1.2s of pause / crossfade

export default function ShowcaseAd() {
  const [active, setActive] = useState(0);
  const iframeRefs = useRef<(HTMLIFrameElement | null)[]>([]);
  const VW = 400;

  // Cycle through templates
  useEffect(() => {
    const t = setTimeout(() => {
      setActive((i) => (i + 1) % TEMPLATES.length);
    }, PER_TEMPLATE_MS);
    return () => clearTimeout(t);
  }, [active]);

  // Compute and apply the scale so each iframe fills viewport width while the
  // HTML inside still believes it's on a 400px mobile screen. Recompute on
  // resize (rotation, browser-window resize, recording-viewport change).
  useEffect(() => {
    const update = () => {
      document.documentElement.style.setProperty("--showcase-scale", String(window.innerWidth / VW));
      document.documentElement.style.setProperty("--showcase-vh-iframe", String(window.innerHeight / (window.innerWidth / VW)) + "px");
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, []);

  // Trigger the body-translateY scroll inside the active iframe each time it
  // becomes active. Same trick as the 60s ad: inject CSS into the (same-origin)
  // iframe document so the animation runs natively + GPU-accelerated.
  useEffect(() => {
    const iframe = iframeRefs.current[active];
    if (!iframe) return;

    const drive = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      const contentHeight = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
      const viewportHeight = doc.documentElement.clientHeight || 1;
      const scrollDistance = Math.max(0, contentHeight - viewportHeight - 40);

      const body = doc.body;
      body.style.transition = "none";
      body.style.transform = "translateY(0)";
      void body.offsetHeight; // force reflow so the next transition is fresh
      requestAnimationFrame(() => {
        body.style.transition = `transform ${SCROLL_MS}ms cubic-bezier(0.42, 0, 0.58, 1)`;
        body.style.transform = `translateY(-${scrollDistance}px)`;
      });
    };

    if (iframe.contentDocument?.readyState === "complete") {
      drive();
    } else {
      iframe.addEventListener("load", drive, { once: true });
      return () => iframe.removeEventListener("load", drive);
    }
  }, [active]);

  return (
    <>
      <style>{css}</style>
      <div className="showcase-root">
        {TEMPLATES.map((t, i) => (
          <div key={t.src} className={`showcase-pane${i === active ? " on" : ""}`}>
            <iframe
              ref={(el) => {
                iframeRefs.current[i] = el;
              }}
              src={t.src}
              title={t.name}
              loading="eager"
              scrolling="no"
              className="showcase-iframe"
            />
          </div>
        ))}

        {/* Top-left counter + bottom label overlay -- minimal, doesn't fight
            with the storefront below */}
        <div className="showcase-counter" key={`counter-${active}`}>
          <span className="showcase-num">{String(active + 1).padStart(2, "0")}</span>
          <span className="showcase-slash">/</span>
          <span className="showcase-total">04</span>
        </div>
        <div className="showcase-label" key={`label-${active}`}>
          <div className="showcase-name">{TEMPLATES[active].name}</div>
          <div className="showcase-tag">{TEMPLATES[active].tag}</div>
        </div>

        {/* Per-template progress bar restarts on each transition */}
        <div className="showcase-progress" key={`prog-${active}`}>
          <div className="showcase-progress-fill" />
        </div>
      </div>
    </>
  );
}

const css = `
  .showcase-root {
    position: fixed; inset: 0;
    background: #0a0a0a;
    overflow: hidden;
    font-family: 'Schibsted Grotesk', -apple-system, sans-serif;
    color: #fff;
  }

  .showcase-pane {
    position: absolute; inset: 0;
    opacity: 0;
    transition: opacity 0.55s ease;
    pointer-events: none;
    overflow: hidden;
  }
  .showcase-pane.on { opacity: 1; }

  /* The iframe is 400px wide (mobile design width) and as tall as it needs to
     be after scaling to fill the viewport. We then transform:scale it up so
     400px of mobile design covers the entire screen width. */
  .showcase-iframe {
    position: absolute;
    top: 0; left: 0;
    width: 400px;
    height: var(--showcase-vh-iframe, 100vh);
    border: none;
    display: block;
    transform-origin: top left;
    transform: scale(var(--showcase-scale, 1));
    pointer-events: none;
  }

  /* TOP-LEFT COUNTER */
  .showcase-counter {
    position: absolute;
    top: 32px; left: 32px;
    display: flex; align-items: baseline; gap: 4px;
    z-index: 10;
    color: #fff;
    text-shadow: 0 2px 18px rgba(0,0,0,0.7);
    animation: showcase-fade-in 0.6s ease both;
  }
  .showcase-num {
    font-size: 56px;
    font-weight: 900;
    letter-spacing: -0.04em;
    line-height: 1;
    background: linear-gradient(135deg, #ff6b35, #ff3d6e);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .showcase-slash {
    font-size: 28px;
    font-weight: 300;
    color: rgba(255,255,255,0.5);
    margin: 0 2px;
  }
  .showcase-total {
    font-size: 28px;
    font-weight: 700;
    color: rgba(255,255,255,0.7);
  }

  /* BOTTOM-LEFT LABEL */
  .showcase-label {
    position: absolute;
    left: 32px; bottom: 64px;
    z-index: 10;
    animation: showcase-slide-up 0.7s cubic-bezier(0.16,1,0.3,1) both;
  }
  .showcase-name {
    font-size: 38px;
    font-weight: 900;
    letter-spacing: -0.03em;
    color: #fff;
    text-shadow: 0 2px 24px rgba(0,0,0,0.8);
    margin-bottom: 6px;
  }
  .showcase-tag {
    font-size: 16px;
    font-weight: 500;
    color: rgba(255,255,255,0.75);
    letter-spacing: 0.04em;
    text-transform: uppercase;
    text-shadow: 0 2px 18px rgba(0,0,0,0.8);
  }

  /* PROGRESS BAR */
  .showcase-progress {
    position: absolute;
    left: 0; right: 0; bottom: 0;
    height: 4px;
    background: rgba(255,255,255,0.1);
    z-index: 10;
  }
  .showcase-progress-fill {
    height: 100%;
    background: linear-gradient(90deg, #ff6b35, #ff3d6e);
    width: 0%;
    animation: showcase-fill ${PER_TEMPLATE_MS}ms linear forwards;
  }

  @keyframes showcase-fade-in {
    from { opacity: 0; transform: translateY(-12px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes showcase-slide-up {
    from { opacity: 0; transform: translateY(28px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes showcase-fill {
    from { width: 0%; }
    to   { width: 100%; }
  }
`;
