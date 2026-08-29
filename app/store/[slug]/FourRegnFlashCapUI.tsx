"use client";

import type { FlashCapState } from "../../../lib/four-regn-flash-cap";

/* Presentational pieces for the Flash Weekend free trucker cap promotion.
   All state/cart logic lives in FourRegnStore.tsx and
   lib/four-regn-flash-cap.ts -- these components only render whatever
   state/numbers they're handed and call back out on interaction, so the
   same three pieces are reused on the product page, collection page, and
   inside the cart drawer instead of each place growing its own copy.
   Visual language matches FourRegnPromoCountdown.tsx (same light
   chrome/glass card, same green accent) since the two are meant to read
   as one system. */

function fmtR(n: number) {
  return `R${Math.round(n).toLocaleString("en-ZA")}`;
}

export function FlashCapProgress({
  state, amountAway, progressPct, giftName, compact, onCta,
}: {
  state: FlashCapState;
  amountAway: number;
  progressPct: number;
  giftName?: string | null;
  compact?: boolean;
  onCta?: () => void;
}) {
  if (state === "EXPIRED") return null;

  return (
    <div className={"regn-fcap" + (compact ? " regn-fcap--compact" : "")} data-state={state}>
      {state === "LOCKED" && (
        <>
          <div className="regn-fcap__row">
            <span className="regn-fcap__text">{fmtR(amountAway)} away from your <strong>FREE trucker cap</strong></span>
          </div>
          <div className="regn-fcap__track" role="progressbar" aria-valuenow={Math.round(progressPct)} aria-valuemin={0} aria-valuemax={100}>
            <div className="regn-fcap__fill" style={{ width: `${progressPct}%` }} />
          </div>
        </>
      )}

      {state === "ELIGIBLE_UNCLAIMED" && (
        <div className="regn-fcap__row regn-fcap__row--claim">
          <span className="regn-fcap__text regn-fcap__text--won">You have an unclaimed <strong>FREE cap</strong></span>
          {onCta && <button type="button" className="regn-fcap__cta" onClick={onCta}>Choose My Free Cap</button>}
        </div>
      )}

      {state === "ELIGIBLE_CLAIMED" && (
        <div className="regn-fcap__row">
          <span className="regn-fcap__text regn-fcap__text--won">&#10003; Free cap claimed{giftName ? `: ${giftName}` : ""}</span>
          {onCta && <button type="button" className="regn-fcap__link" onClick={onCta}>Choose another cap</button>}
        </div>
      )}

      {state === "QUALIFICATION_LOST" && (
        <div className="regn-fcap__row">
          <span className="regn-fcap__text">Add {fmtR(amountAway)} more to make this cap <strong>FREE</strong> again</span>
        </div>
      )}
    </div>
  );
}

export function FlashCapUnlockSheet({ open, onChoose, onKeepShopping }: { open: boolean; onChoose: () => void; onKeepShopping: () => void }) {
  if (!open) return null;
  return (
    <div className="regn-fcap-sheet-backdrop" onClick={onKeepShopping}>
      <div className="regn-fcap-sheet" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Free cap unlocked">
        <div className="regn-fcap-sheet__icon">&#127873;</div>
        <div className="regn-fcap-sheet__title">Free Cap Unlocked</div>
        <p className="regn-fcap-sheet__body">Your basket qualifies for a complimentary trucker cap.</p>
        <button type="button" className="regn-fcap-sheet__primary" onClick={onChoose}>Choose My Free Cap</button>
        <button type="button" className="regn-fcap-sheet__secondary" onClick={onKeepShopping}>Keep Shopping</button>
      </div>
    </div>
  );
}

export function FlashCapCheckoutWarningSheet({ open, onChoose, onContinue }: { open: boolean; onChoose: () => void; onContinue: () => void }) {
  if (!open) return null;
  return (
    <div className="regn-fcap-sheet-backdrop" onClick={onContinue}>
      <div className="regn-fcap-sheet regn-fcap-sheet--compact" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Don't forget your free cap">
        <div className="regn-fcap-sheet__title">Don&rsquo;t Forget Your Free Cap</div>
        <button type="button" className="regn-fcap-sheet__primary" onClick={onChoose}>Choose My Cap</button>
        <button type="button" className="regn-fcap-sheet__secondary" onClick={onContinue}>Continue Without Free Cap</button>
      </div>
    </div>
  );
}
