"use client";

import { useEffect, useState } from "react";

/* Oversized Premium Tees Flash Sale (round 2) -- R229 (was R350), buy 2
   for R449, valid through 12 September 2026 23:59 SAST. End instant is
   2026-09-13T00:00:00+02:00, not 23:59:59, so the sale stays active for
   the full final minute. Written as a fixed +02:00 (SAST) instant rather
   than anything derived from the visitor's own timezone -- comparing it
   against Date.now() (also an absolute instant) needs no timezone
   conversion either way.

   One-off seasonal promo scoped to the OVERSIZED PREMIUM TEES collection
   (unlike FourRegnPromoCountdown, which is cart-wide and shows on every
   collection/product page) -- reused across repeat runs of this same
   campaign rather than cloned into a dated copy each time; just the price/
   date literals below change between runs. */
const TEES_SALE_END = new Date("2026-09-13T00:00:00+02:00").getTime();

/* null = not yet evaluated on the client -- same reasoning as
   FourRegnPromoCountdown's own useFlashSaleRemaining: prevents any flash
   of expired-sale UI on load. */
function useTeesSaleRemaining(endTime: number): number | null {
  const [remaining, setRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (!Number.isFinite(endTime)) { setRemaining(-1); return; }
    const tick = () => setRemaining(endTime - Date.now());
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endTime]);

  return remaining;
}

const pad = (n: number) => String(n).padStart(2, "0");

export default function FourRegnTeesSaleCountdown({ variant }: { variant: "product" | "collection" }) {
  const remaining = useTeesSaleRemaining(TEES_SALE_END);

  if (remaining === null || remaining <= 0) return null;

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="regn-flash-countdown regn-tees-countdown" data-variant={variant} aria-live="polite" aria-label="Oversized Premium Tees Flash Sale countdown">
      <div className="regn-flash-countdown__inner">
        <div className="regn-flash-countdown__header">
          <div className="regn-flash-countdown__offer">
            <span className="regn-flash-countdown__bolt" aria-hidden="true">&#8623;</span>
            <div>
              <div className="regn-flash-countdown__eyebrow">Flash Sale</div>
              <div className="regn-flash-countdown__copy">
                <strong>OVERSIZED PREMIUM TEES &mdash; R229</strong>
                <span className="regn-product-copy"> or buy 2 for R449</span>
                <span className="regn-collection-copy"> or buy 2 for R449</span>
              </div>
            </div>
          </div>
          <div className="regn-flash-countdown__end">ENDS<strong>12 SEP &middot; 23:59</strong></div>
        </div>
        <div className="regn-flash-countdown__timer">
          <div className="regn-flash-countdown__unit"><span className="regn-flash-countdown__number">{pad(days)}</span><span className="regn-flash-countdown__label">Days</span></div>
          <div className="regn-flash-countdown__unit"><span className="regn-flash-countdown__number">{pad(hours)}</span><span className="regn-flash-countdown__label">Hours</span></div>
          <div className="regn-flash-countdown__unit"><span className="regn-flash-countdown__number">{pad(minutes)}</span><span className="regn-flash-countdown__label">Min</span></div>
          <div className="regn-flash-countdown__unit"><span className="regn-flash-countdown__number">{pad(seconds)}</span><span className="regn-flash-countdown__label">Sec</span></div>
        </div>
      </div>
    </div>
  );
}
