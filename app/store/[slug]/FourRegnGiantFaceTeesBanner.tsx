"use client";

import { useEffect, useRef, useState } from "react";

/* "New Oversized Premium Tees" homepage banner -- ported from a standalone
   HTML/CSS/JS snippet the seller supplied (scoped under .gfb there, kept
   identical here) into a proper client component, following the same
   "dynamic(..., { ssr: false })" pattern every other client-only,
   real-time promo widget in this file uses (FourRegnTeesSaleCountdown,
   FourRegnPromoCountdown, etc.) -- there's a live countdown and a
   requestAnimationFrame marquee, neither of which have anything meaningful
   to render on the server. CSS lives in FourRegnStore.tsx's own shared
   <style> block (the .gfb-* rules), matching how every other one-off
   promo widget's CSS is kept there rather than in a per-component <style>
   tag -- see that block's own comments.

   shopUrl is passed in (not hardcoded) since only the parent knows how to
   build a seller-scoped path (sp()/collectionSlug()) for both the
   subdomain and custom-domain routing cases. */
const SALE_ENDS = new Date("2026-10-02T23:59:59+02:00").getTime();
const SPEED = 40; // px per second, matches the original snippet
const IMG_BASE = "/4regn/banner-tees/";
const CUSTOM_TEE_WHATSAPP_URL = "https://wa.me/27678577919?text=Hi%204REGN%2C%20I%27d%20like%20a%20custom%20Giant%20Face%20tee";

const TEES: { n: string; f: string }[] = [
  { n: "Travis Scott", f: "travis-scott.webp" },
  { n: "Shebe Shxt", f: "shebe-shxt.webp" },
  { n: "MaWhoo", f: "mawhoo.webp" },
  { n: "Kendrick Lamar", f: "kendrick-lamar.webp" },
  { n: "Kabza De Small", f: "kabza-de-small.webp" },
  { n: "Jhene Aiko", f: "jhene-aiko.webp" },
  { n: "AKA", f: "aka.webp" },
  { n: "Tyler the Creator", f: "tyler-the-creator.webp" },
  { n: "Young Stunna", f: "young-stunna.webp" },
  { n: "Future", f: "future.webp" },
  { n: "DJ Maphorisa", f: "dj-maphorisa.webp" },
  { n: "Riky Rick", f: "riky-rick.webp" },
  { n: "Drake", f: "drake.webp" },
  { n: "Sjava", f: "sjava.webp" },
  { n: "Babalwa M", f: "babalwa-m.webp" },
  { n: "A-Reece", f: "a-reece.webp" },
  { n: "J. Cole", f: "j-cole.webp" },
  { n: "Mthandeni SK", f: "mthandeni-sk.webp" },
  { n: "Gunna", f: "gunna.webp" },
  { n: "Loatinover Pounds", f: "loatinover-pounds.webp" },
  { n: "MaWhoo", f: "mawhoo-2.webp" },
  { n: "Don Toliver", f: "don-toliver.webp" },
  { n: "Kelvin Momo", f: "kelvin-momo.webp" },
  { n: "Flvme", f: "flvme.webp" },
  { n: "Emtee", f: "emtee.webp" },
  { n: "Riky Rick", f: "riky-rick-2.webp" },
  { n: "Emtee", f: "emtee-2.webp" },
  { n: "DJ Black Coffee", f: "dj-black-coffee.webp" },
];

const pad = (n: number) => (n < 10 ? "0" + n : String(n));

export default function FourRegnGiantFaceTeesBanner({ shopUrl }: { shopUrl: string }) {
  const rowRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [built, setBuilt] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(null);

  // Lazy-build the doubled (seamless-loop) image row only once the banner
  // scrolls near view -- same reasoning as the original snippet: 28 tee
  // photos (56 <img> tags once doubled) shouldn't download for a visitor
  // who scrolls straight past this section.
  useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setBuilt(true); return; }
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting) { setBuilt(true); io.disconnect(); }
    }, { rootMargin: "400px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Smooth scroll via requestAnimationFrame, pausing on hover/touch --
  // ported verbatim from the original snippet's frame() loop. Reads/writes
  // the transform directly on the ref rather than through React state so
  // the 60fps loop never triggers a re-render.
  useEffect(() => {
    if (!built) return;
    const row = rowRef.current;
    const track = trackRef.current;
    if (!row || !track) return;
    let pos = 0;
    let last = performance.now();
    let paused = false;
    let raf = 0;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onEnter = () => { paused = true; };
    const onLeave = () => { paused = false; };
    row.addEventListener("mouseenter", onEnter);
    row.addEventListener("mouseleave", onLeave);
    row.addEventListener("touchstart", onEnter, { passive: true });
    row.addEventListener("touchend", onLeave);
    function frame(now: number) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      const loop = track!.scrollWidth / 2;
      if (!paused && !reduce && loop) {
        pos = (pos + SPEED * dt) % loop;
        track!.style.transform = `translate3d(${(-pos).toFixed(2)}px,0,0)`;
      }
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      row.removeEventListener("mouseenter", onEnter);
      row.removeEventListener("mouseleave", onLeave);
      row.removeEventListener("touchstart", onEnter);
      row.removeEventListener("touchend", onLeave);
    };
  }, [built]);

  // Countdown, then fall back to the normal R350 price once the sale ends
  // -- same instant comparison as FourRegnTeesSaleCountdown/FourRegnPromoCountdown.
  useEffect(() => {
    const tick = () => setRemaining(SALE_ENDS - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const expired = remaining !== null && remaining <= 0;
  let clockText = "";
  if (remaining !== null && remaining > 0) {
    const s = Math.floor(remaining / 1000);
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    clockText = (d ? d + "d " : "") + pad(h) + "h " + pad(m) + "m " + pad(sec) + "s left";
  }

  return (
    <>
      {/* Anton/Barlow Condensed/Archivo aren't loaded anywhere else on this
          site -- rendered here (not in the shared layout) so they only ever
          fetch on a page where this banner actually renders. Next.js hoists
          <link> tags into <head> regardless of where in the tree they're
          rendered. */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      <link href="https://fonts.googleapis.com/css2?family=Anton&family=Barlow+Condensed:wght@500;600;700&family=Archivo:wght@400;600&display=swap" rel="stylesheet" />
      <section className="gfb" aria-label="New oversized premium tees sale">
        <div className="gfb-top">
          <div>
            <h2>New oversized<br />premium tees</h2>
          </div>
          <div className="gfb-deal">
            <div className="gfb-price">
              {!expired && <span className="gfb-was">R350</span>}
              <span className="gfb-now">{expired ? "R350" : "R229"}</span>
              <span className="gfb-each">each</span>
            </div>
            {!expired && <div className="gfb-bundle">Buy 2 for <b>R399</b></div>}
            {!expired && (
              <div className="gfb-clock"><span>Sale ends 2 October</span><span className="t">{clockText}</span></div>
            )}
            <div className="gfb-btns"><a className="gfb-btn" href={shopUrl}>Shop the tees</a></div>
          </div>
        </div>

        <div className="gfb-row" ref={rowRef}>
          <div className="gfb-track" ref={trackRef}>
            {built && TEES.concat(TEES).map((t, i) => {
              const first = i < TEES.length;
              return (
                <img
                  key={i}
                  src={IMG_BASE + t.f}
                  width={480}
                  height={377}
                  decoding="async"
                  alt={first ? `${t.n} tee` : ""}
                  aria-hidden={first ? undefined : true}
                />
              );
            })}
          </div>
        </div>

        <div className="gfb-custom">
          <div>
            <p>Want your own photo on one?</p>
            <div className="cp"><span className="cw">R400</span><span className="cn">R249</span><span className="gfb-each">custom Giant Face tee</span></div>
          </div>
          <a className="gfb-btn ghost" href={CUSTOM_TEE_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">Send us your photo</a>
        </div>
      </section>
    </>
  );
}
