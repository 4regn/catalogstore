"use client";

import { useEffect, useState } from "react";
import { FOUR_REGN_TESTIMONIALS } from "./fourRegnTestimonials";

const SLIDE_DURATION_MS = 5000;

// Isolated into its own component for the same reason
// FourRegnHeroSlideshow.tsx is -- FourRegnStore is one huge component tree,
// and a ticking interval living at its top level re-renders everything
// under it (every product card, etc.) on every tick, not just this card.
// Only this small subtree re-renders every 5 seconds.
export default function FourRegnTestimonialsCarousel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = FOUR_REGN_TESTIMONIALS.length;

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [count, paused]);

  if (!count) return null;
  const current = FOUR_REGN_TESTIMONIALS[index];

  return (
    <div
      className="fr-testi-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {count > 1 && (
        <button
          type="button"
          className="fr-testi-arrow fr-testi-arrow-prev"
          aria-label="Previous testimonial"
          onClick={() => setIndex((i) => (i - 1 + count) % count)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <div className="fr-testi-card">
        <div className="fr-testi-photo">
          {/* Plain <img>, not next/image -- these are static local files
              served straight from /public, and a screenshot's whole point
              here is looking like an untouched WhatsApp capture rather
              than a processed marketing asset. */}
          <img
            key={current.src}
            src={current.src}
            alt="4REGN customer's WhatsApp message and photo after receiving their order"
            width={current.width}
            height={current.height}
            loading="lazy"
          />
        </div>
        <div className="fr-testi-body">
          <span className="fr-testi-quote-mark" aria-hidden="true">&ldquo;</span>
          <p className="fr-testi-quote">{current.quote}</p>
          <div className="fr-testi-byline">
            <span className="fr-testi-byline-name">Verified 4REGN customer</span>
            <span className="fr-testi-byline-src">Shared on WhatsApp</span>
          </div>
        </div>
      </div>
      {count > 1 && (
        <button
          type="button"
          className="fr-testi-arrow fr-testi-arrow-next"
          aria-label="Next testimonial"
          onClick={() => setIndex((i) => (i + 1) % count)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      )}
      {count > 1 && (
        <div className="fr-testi-dots">
          {FOUR_REGN_TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`fr-testi-dot${i === index ? " active" : ""}`}
              aria-label={`Show testimonial ${i + 1} of ${count}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
