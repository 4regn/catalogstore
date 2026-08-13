export const FOUR_REGN_NEW_TRACKING_FIRST_ORDER = 3540;
export const FOUR_REGN_LEGACY_TRACKING_URL = "https://track.4regn.com/";
export const FOUR_REGN_TRACKING_URL = "https://4regn.com/track";
export const FOUR_REGN_ACCOUNT_URL = "https://4regn.com/account";

// Accept the customer-facing variants 3540, 3540D and #3540D. Keeping
// this in one helper prevents the account, guest tracker and emails from
// drifting into subtly different order-number rules.
export function parseFourRegnOrderNumber(value: unknown): number | null {
  const normalized = String(value ?? "").trim().toUpperCase().replace(/\s+/g, "");
  const match = normalized.match(/^#?(\d+)D?$/);
  if (!match) return null;
  const number = Number(match[1]);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

export function fourRegnOrderReference(order: { external_id?: unknown; order_number?: unknown }): string {
  const externalNumber = parseFourRegnOrderNumber(order.external_id);
  if (externalNumber !== null) return `#${externalNumber}D`;
  const internalNumber = parseFourRegnOrderNumber(order.order_number);
  return internalNumber === null ? "Order" : `#${internalNumber}D`;
}

export function normalizeSouthAfricanPhone(value: unknown): string {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("0027")) digits = digits.slice(2);
  if (digits.startsWith("27") && digits.length === 11) digits = `0${digits.slice(2)}`;
  return digits;
}

export function isNewFourRegnTrackingOrder(order: { external_id?: unknown; order_number?: unknown }): boolean {
  const number = parseFourRegnOrderNumber(order.external_id) ?? parseFourRegnOrderNumber(order.order_number);
  return number !== null && number >= FOUR_REGN_NEW_TRACKING_FIRST_ORDER;
}
