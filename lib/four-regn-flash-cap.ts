/* 4REGN Flash Weekend free trucker cap promotion -- centralized state
   machine, shared by the storefront cart (FourRegnStore.tsx), checkout
   (CheckoutPageClient.tsx), and server-side order validation
   (app/api/checkout/place-order/route.ts) so all three agree on the exact
   same threshold, expiry, and eligibility rules instead of each
   reimplementing its own copy.

   Spend R499+ on eligible merchandise (before shipping, after discounts,
   excluding the gift itself) unlocks one free trucker cap. Fixed +02:00
   (SAST) cutoff, not derived from the visitor's own timezone -- comparing
   two absolute instants needs no timezone conversion either way. */

export const FLASH_CAP_THRESHOLD = 499;
export const FLASH_CAP_END_ISO = "2026-09-01T00:00:00+02:00";
export const FLASH_CAP_END = new Date(FLASH_CAP_END_ISO).getTime();

// Same exact collection name used by the countdown banner
// (FourRegnPromoCountdown's caller) and the homepage campaign banner --
// see FourRegnStore.tsx's own collectionSlug("TRUCKER CAPS & BEANIES")
// call for the live precedent.
export const FLASH_CAP_COLLECTION = "TRUCKER CAPS & BEANIES";

// Cart-line marker. Stored on the storefront CartItem and threaded through
// the base64 ?cart= checkout payload and place-order request as a plain
// string field so every layer can recognise "this specific line is the
// promotional gift" without guessing from price alone (a real product
// could legitimately already be R0 for other reasons some day).
export const FLASH_CAP_GIFT_TAG = "flash_weekend_cap" as const;

export type FlashCapState =
  | "LOCKED"
  | "ELIGIBLE_UNCLAIMED"
  | "ELIGIBLE_CLAIMED"
  | "QUALIFICATION_LOST"
  | "EXPIRED";

export function isFlashCapActive(now: number = Date.now()): boolean {
  return now < FLASH_CAP_END;
}

// Exact same "comma-split category, case-sensitive exact match" rule as
// FourRegnStore.tsx's own local pInCat() -- duplicated here (that function
// is private to that file, not exported) rather than depending on it, so
// this module can be imported from server code (place-order route) that
// never touches FourRegnStore.tsx at all.
export function isFlashCapEligibleProduct(product: { category?: string | null } | null | undefined): boolean {
  if (!product?.category) return false;
  return product.category.split(",").some((c) => c.trim() === FLASH_CAP_COLLECTION);
}

export function computeFlashCapState(opts: {
  active: boolean;
  eligibleSubtotal: number;
  hasGiftInCart: boolean;
}): FlashCapState {
  if (!opts.active) return "EXPIRED";
  const qualifies = opts.eligibleSubtotal >= FLASH_CAP_THRESHOLD;
  if (opts.hasGiftInCart) return qualifies ? "ELIGIBLE_CLAIMED" : "QUALIFICATION_LOST";
  return qualifies ? "ELIGIBLE_UNCLAIMED" : "LOCKED";
}

export function flashCapAmountAway(eligibleSubtotal: number): number {
  return Math.max(0, FLASH_CAP_THRESHOLD - eligibleSubtotal);
}

export function flashCapProgressPct(eligibleSubtotal: number): number {
  return Math.min(100, Math.max(0, (eligibleSubtotal / FLASH_CAP_THRESHOLD) * 100));
}
