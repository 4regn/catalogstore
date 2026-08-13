"use client";

import { type TouchEvent as ReactTouchEvent, useState } from "react";

// Full-screen lightbox gallery for the PDP -- same swipe/arrow-key/pinch-zoom
// behaviour as Heirloom's version, restyled for this template's local class
// names since it isn't exported from HeirloomStore.tsx.
//
// Split into its own file (and loaded via next/dynamic in FourRegnStore.tsx)
// so this never ships in the initial storefront bundle: `lightbox` state
// starts null on every render (only ever set from a click/keyboard handler,
// never from an initial/SSR prop), so this component is unreachable until a
// visitor actually taps a product image -- no reason to pay its parse/eval
// cost on every page load.
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
    if (Math.abs(dx) < 40) return;
    if (dx < 0 && index < imgs.length - 1) onIndex(index + 1);
    else if (dx > 0 && index > 0) onIndex(index - 1);
  };

  return (
    <div className="fr-lb" onClick={onClose} role="dialog" aria-modal="true" aria-label="Product images">
      <div className="fr-lb-stage" onClick={(e) => e.stopPropagation()} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <div className="fr-lb-media">
          <img src={imgs[index]} alt="" className="fr-lb-img" draggable={false} />
          <button className="fr-lb-close" type="button" onClick={(e) => { e.stopPropagation(); onClose(); }} aria-label="Close">✕</button>
        </div>
      </div>
      {imgs.length > 1 && (
        <>
          {index > 0 && (
            <button className="fr-lb-nav fr-lb-prev" type="button" onClick={(e) => { e.stopPropagation(); onIndex(index - 1); }} aria-label="Previous image">‹</button>
          )}
          {index < imgs.length - 1 && (
            <button className="fr-lb-nav fr-lb-next" type="button" onClick={(e) => { e.stopPropagation(); onIndex(index + 1); }} aria-label="Next image">›</button>
          )}
          <div className="fr-lb-dots" onClick={(e) => e.stopPropagation()}>
            {imgs.map((_, i) => (
              <button key={i} type="button" className={"fr-lb-dot" + (i === index ? " active" : "")} onClick={() => onIndex(i)} aria-label={`Image ${i + 1}`} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
