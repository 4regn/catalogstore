"use client";

import { useEffect, useState } from "react";

/* 4REGN Flash Weekend Sale -- free trucker cap on orders above R499,
   valid through 31 August 2026 23:59 SAST. The cutoff below is
   2026-09-01T00:00:00+02:00 (not 23:59:59) so the sale stays active for
   the full final minute, matching the ENDS label. Written as a fixed
   +02:00 (SAST) instant rather than anything derived from the visitor's
   own timezone -- comparing it against Date.now() (also an absolute
   instant) needs no timezone conversion either way, so a visitor in a
   different timezone still sees the correct remaining time.

   One-off seasonal promo, deliberately not wired to checkout_config or
   any seller-configurable field -- same treatment as the Winter Sale
   marquee/SETLA promo strip elsewhere in this file, hardcoded here and
   meant to be deleted once the sale ends rather than generalized. */
const FLASH_SALE_END = new Date("2026-09-01T00:00:00+02:00").getTime();

/* null = not yet evaluated on the client. Rendering nothing (not a
   "loading" placeholder, not an "ended" state) until that first client
   tick confirms the sale is still active is what prevents any flash of
   expired-sale UI on load -- there is never a paint of the wrong state,
   only "nothing yet" then "the real countdown" or "nothing at all". */
function useFlashSaleRemaining(endTime: number): number | null {
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

export default function FourRegnPromoCountdown({ variant }: { variant: "product" | "collection" }) {
  const remaining = useFlashSaleRemaining(FLASH_SALE_END);

  // Covers both "hasn't ticked yet" and "sale is over" -- render nothing
  // in either case. No "sale ended" banner, no empty gap left behind.
  if (remaining === null || remaining <= 0) return null;

  const days = Math.floor(remaining / 86400000);
  const hours = Math.floor((remaining % 86400000) / 3600000);
  const minutes = Math.floor((remaining % 3600000) / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);

  return (
    <div className="regn-flash-countdown" data-variant={variant} aria-live="polite" aria-label="Flash Weekend Sale countdown">
      <div className="regn-flash-countdown__inner">
        <div className="regn-flash-countdown__header">
          <div className="regn-flash-countdown__offer">
            <span className="regn-flash-countdown__bolt" aria-hidden="true">&#8623;</span>
            <div>
              <div className="regn-flash-countdown__eyebrow">Flash Weekend Sale</div>
              <div className="regn-flash-countdown__copy">
                <strong>FREE TRUCKER CAP</strong>
                <span className="regn-product-copy"> of your choice on orders above R499</span>
                <span className="regn-collection-copy"> on orders above R499</span>
              </div>
            </div>
          </div>
          <div className="regn-flash-countdown__end">ENDS<strong>31 AUG &middot; 23:59</strong></div>
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
