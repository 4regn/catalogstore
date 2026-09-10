"use client";

import { useEffect, useRef, useState } from "react";

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
  // Plain ref, not state -- read inside the interval callback below, never
  // needs its own re-render (the visible slide is driven by `index`
  // instead). Tracks which slides have actually finished downloading, so
  // the rotation can wait for one rather than flipping to it blind.
  const loadedRef = useRef<boolean[]>(slides.map(() => false));

  // Keyed on the actual URLs, NOT the `slides` array itself -- FourRegnStore
  // is a huge component that re-renders often for reasons that have nothing
  // to do with the hero, and each of those renders builds a brand new
  // `heroSlides` array literal with the exact same contents. Depending on
  // that array's identity here meant this effect kept firing and wiping
  // loadedRef back to all-false mid-rotation -- already-loaded slides
  // would never re-fire onLoad (their <img src> hadn't actually changed,
  // so the browser has no reason to re-fetch or re-emit the event), so the
  // rotation would get stuck refusing to advance past whichever slide it
  // was on when the wipe happened. This only resets when a slide's actual
  // src changes (e.g. the seller swaps banner_url in the live editor).
  const slideKey = slides.map((s) => s.src).join("|");
  useEffect(() => {
    loadedRef.current = slides.map(() => false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideKey]);

  useEffect(() => {
    if (slides.length <= 1) return;
    // On a fresh page load, slides 2/3 start downloading at the same time
    // as the whole page's fonts/JS/other images -- on a slow connection
    // that can genuinely take longer than 3s. Advancing on a fixed timer
    // regardless of that (the original bug here) meant the hero looked
    // "stuck" on slide 1 with nothing visible underneath until whichever
    // slide happened to finish loading several ticks late. This checks
    // the next slide is actually loaded before switching to it, and just
    // holds the current slide an extra tick (re-checking each time) if
    // it isn't yet -- so it never flips to a blank image, and still runs
    // on the normal 3s cadence once images are warm (every slide after
    // the first full loop, and always for anyone with a warm cache).
    const id = window.setInterval(() => {
      setIndex((i) => {
        const next = (i + 1) % slides.length;
        return loadedRef.current[next] ? next : i;
      });
    }, SLIDE_DURATION_MS);
    return () => window.clearInterval(id);
  }, [slides.length]);

  if (!slides.length) return null;

  const cycleMs = slides.length * SLIDE_DURATION_MS;
  const markLoaded = (i: number) => { loadedRef.current[i] = true; };

  return (
    <div className="fr-hero-bgimg">
      {slides.map((slide, i) => (
        <img
          key={i}
          src={slide.src}
          alt=""
          // Every slide is genuinely above-the-fold hero content the
          // visitor will see within the first 6 seconds of the page's
          // life regardless -- deprioritizing slides 2/3 (the original
          // "low" here) starved them of bandwidth against the page's own
          // fonts/JS/other images and was the actual cause of the stall.
          fetchPriority={i === 0 ? "high" : "auto"}
          decoding="async"
          onLoad={() => markLoaded(i)}
          // A broken image (404, network failure) should never permanently
          // stall the rotation on the slide before it -- treat "failed" the
          // same as "loaded" so the rotation still moves on past it.
          onError={() => markLoaded(i)}
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
