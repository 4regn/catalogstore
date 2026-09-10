"use client";

import { useEffect, useState } from "react";

export type FourRegnHeroSlide = { src: string; objectPosition?: string };

// 3 seconds per slide, looping -- matches exactly what was asked for.
const SLIDE_DURATION_MS = 3000;
// Crossfade duration between slides; also drives the CSS transition below.
const FADE_MS = 1100;

// Isolated into its own tiny component (same reasoning as
// FourRegnTeesSaleTimerText.tsx) rather than a bit of ticking state inside
// FourRegnStore.tsx directly -- that file is a massive component tree, and
// a shared "tick every N seconds" state living at its top level was
// confirmed once already this project as a severe perf bug: every state
// update there re-renders the ENTIRE page (every product card on a
// collection page), not just the hero. Isolating the interval here means
// only this small subtree re-renders every 3 seconds.
//
// Ambient "Ken Burns" movement uses one continuously-running CSS animation
// per slide with a NEGATIVE animation-delay of -(index * SLIDE_DURATION_MS)
// rather than JS-driven restarts -- every slide's <img> shares the exact
// same timeline (animation-duration = the full loop length), just offset
// so whichever slide happens to be visible is always showing the correctly
// -phased portion of the zoom. That's what keeps the movement smooth and
// perfectly in sync with the crossfade with no remount/key hacks, and it
// keeps working correctly even if the slide count or timing ever changes.
export default function FourRegnHeroSlideshow({ slides }: { slides: FourRegnHeroSlide[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (slides.length <= 1) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % slides.length), SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (!slides.length) return null;

  const cycleMs = slides.length * SLIDE_DURATION_MS;

  return (
    <div className="fr-hero-bgimg">
      {slides.map((slide, i) => (
        <img
          key={i}
          src={slide.src}
          alt=""
          fetchPriority={i === 0 ? "high" : "low"}
          decoding="async"
          className="fr-hero-slide"
          style={{
            objectPosition: slide.objectPosition || "center center",
            opacity: i === index ? 1 : 0,
            transitionDuration: `${FADE_MS}ms`,
            animationDuration: `${cycleMs}ms`,
            animationDelay: `${-i * SLIDE_DURATION_MS}ms`,
          }}
        />
      ))}
    </div>
  );
}
