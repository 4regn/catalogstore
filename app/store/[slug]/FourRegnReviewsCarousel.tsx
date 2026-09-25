"use client";

import { useEffect, useState } from "react";
import { sampleReviews, type StoreReview } from "./fourRegnReviews";

const SLIDE_DURATION_MS = 5000;
// The seller's full reviews gallery (store_reviews table, managed from the
// dashboard) can grow well past what a homepage section should ever render
// at once -- capped here so the carousel only ever downloads/shows this
// many images per visit, however large the gallery gets.
const VISIBLE_COUNT = 5;

// Isolated into its own component for the same reason
// FourRegnHeroSlideshow.tsx is -- FourRegnStore is one huge component tree,
// and a ticking interval living at its top level re-renders everything
// under it (every product card, etc.) on every tick, not just this card.
// Only this small subtree re-renders every 5 seconds.
export default function FourRegnReviewsCarousel({ reviews }: { reviews: StoreReview[] }) {
  // Picked once, when this component first mounts -- not on every render,
  // and not the same subset every time either. `reviews` itself is the
  // seller's whole gallery (fetched once server-side and cached like the
  // rest of the homepage), so this is what actually makes the visible set
  // random per visitor without ever fetching or rendering more than
  // VISIBLE_COUNT images.
  const [slides] = useState(() => sampleReviews(reviews, VISIBLE_COUNT));
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = slides.length;

  useEffect(() => {
    if (count <= 1 || paused) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % count), SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [count, paused]);

  if (!count) return null;
  const current = slides[index];

  return (
    <div
      className="fr-rev-carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {count > 1 && (
        <button
          type="button"
          className="fr-rev-arrow fr-rev-arrow-prev"
          aria-label="Previous review"
          onClick={() => setIndex((i) => (i - 1 + count) % count)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
        </button>
      )}
      <div className="fr-rev-card">
        <div className="fr-rev-photo">
          {/* Plain <img>, not next/image -- these are seller-uploaded
              screenshots from arbitrary sources (Supabase Storage today),
              and a screenshot's whole point here is looking like an
              untouched WhatsApp capture rather than a processed marketing
              asset. */}
          <img
            key={current.id}
            src={current.image_url}
            alt={current.quote || "4REGN customer review shared on WhatsApp"}
            loading="lazy"
          />
        </div>
        <div className="fr-rev-body">
          <span className="fr-rev-quote-mark" aria-hidden="true">&ldquo;</span>
          <p className="fr-rev-quote">{current.quote}</p>
          <div className="fr-rev-byline">
            <span className="fr-rev-byline-name">Verified 4REGN customer</span>
            <span className="fr-rev-byline-src">Shared on WhatsApp</span>
          </div>
        </div>
      </div>
      {count > 1 && (
        <button
          type="button"
          className="fr-rev-arrow fr-rev-arrow-next"
          aria-label="Next review"
          onClick={() => setIndex((i) => (i + 1) % count)}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6" /></svg>
        </button>
      )}
      {count > 1 && (
        <div className="fr-rev-dots">
          {slides.map((_, i) => (
            <button
              key={i}
              type="button"
              className={`fr-rev-dot${i === index ? " active" : ""}`}
              aria-label={`Show review ${i + 1} of ${count}`}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
