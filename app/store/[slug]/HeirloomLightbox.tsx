"use client";

import { type TouchEvent as ReactTouchEvent, useState } from "react";

// Full-screen image gallery overlay used by the PDP. No tap-to-zoom badge — the affordance
// is just that the image is tappable. Once open, customers swipe left/right (mobile) or
// click the side arrows / press arrow keys (desktop) to browse all the product's images.
// Pinch-to-zoom is left to the browser since the image is a plain <img> with object-fit:
// contain — works natively on iOS/Android.
//
// Split into its own file (and loaded via next/dynamic in HeirloomStore.tsx) so this
// never ships in the initial storefront bundle: `lightbox` state starts null on every
// render (only ever set from a click/keyboard handler, never from an initial/SSR prop),
// so this component is unreachable until a visitor actually taps a product image.
export default function LightboxGallery({ imgs, index, onClose, onIndex }: {
  imgs: string[];
  index: number;
  onClose: () => void;
  onIndex: (i: number) => void;
}) {
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  const onTouchStart = (e: ReactTouchEvent) => setTouchStartX(e.touches[0].clientX);
  const onTouchEnd = (e: ReactTouchEvent) => {
    if (touchStartX === null) return;
    const dx = e.changedTouches[0].clientX - touchStartX;
    setTouchStartX(null);
    if (Math.abs(dx) < 40) return; // ignore taps and tiny moves
    if (dx < 0 && index < imgs.length - 1) onIndex(index + 1);
    else if (dx > 0 && index > 0) onIndex(index - 1);
  };

  return (
    <div className="hl-lb" onClick={onClose} role="dialog" aria-modal="true" aria-label="Product images">
      <button
        className="hl-lb-close"
        type="button"
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close"
      >
        ✕
      </button>

      <div
        className="hl-lb-stage"
        onClick={(e) => e.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        <img src={imgs[index]} alt="" className="hl-lb-img" draggable={false} />
      </div>

      {imgs.length > 1 && (
        <>
          {index > 0 && (
            <button
              className="hl-lb-nav hl-lb-prev"
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }}
              aria-label="Previous image"
            >
              ‹
            </button>
          )}
          {index < imgs.length - 1 && (
            <button
              className="hl-lb-nav hl-lb-next"
              type="button"
              onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }}
              aria-label="Next image"
            >
              ›
            </button>
          )}
          <div className="hl-lb-dots" onClick={(e) => e.stopPropagation()}>
            {imgs.map((_, i) => (
              <button
                key={i}
                type="button"
                className={"hl-lb-dot" + (i === index ? " active" : "")}
                onClick={() => onIndex(i)}
                aria-label={`Image ${i + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
