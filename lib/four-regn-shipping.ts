export type CheckoutShippingOption = {
  name: string;
  price: number;
  estimate?: string;
  is_premium?: boolean;
  compare_at_price?: number;
  carrier?: "aramex" | "paxi" | "premium" | "other";
  service_level?: "standard" | "express" | "premium";
};

export const FOUR_REGN_AR_MAILER: CheckoutShippingOption = {
  name: "Door-to-door courier",
  price: 50,
  compare_at_price: 90,
  estimate: "2-5 working days",
  carrier: "aramex",
  service_level: "standard",
};

export const FOUR_REGN_PAXI_STANDARD: CheckoutShippingOption = {
  name: "PAXI Standard Delivery",
  price: 0,
  compare_at_price: 60,
  estimate: "7-9 working days",
  carrier: "paxi",
  service_level: "standard",
};

export const FOUR_REGN_PAXI_EXPRESS: CheckoutShippingOption = {
  name: "PAXI Express Delivery",
  price: 110,
  estimate: "3-5 working days",
  carrier: "paxi",
  service_level: "express",
};

export const FOUR_REGN_DELIVERY_METHOD_ORDER = ["paxi_standard", "aramex", "paxi_express"] as const;
export type FourRegnDeliveryMethodKey = typeof FOUR_REGN_DELIVERY_METHOD_ORDER[number];

export function normaliseFourRegnDeliveryMethodOrder(value: unknown): FourRegnDeliveryMethodKey[] {
  const saved = Array.isArray(value)
    ? value.filter((key): key is FourRegnDeliveryMethodKey => FOUR_REGN_DELIVERY_METHOD_ORDER.includes(key as FourRegnDeliveryMethodKey))
    : [];
  return [...saved, ...FOUR_REGN_DELIVERY_METHOD_ORDER.filter((key) => !saved.includes(key))];
}

const PREMIUM_SHIPPING_NAME = "PREMIUM PRODUCT SHIPMENT";
export const FOUR_REGN_FREE_PAXI_STANDARD_MINIMUM = 449;

export function isFourRegnSeller(slug?: string | null, template?: string | null) {
  return slug === "4regn" || template === "4regn";
}

export function isPremiumShippingOption(opt: { name?: string; is_premium?: boolean }) {
  return !!opt.is_premium || opt.name?.trim().toUpperCase() === PREMIUM_SHIPPING_NAME;
}

export function buildCheckoutShippingOptions(
  configured: CheckoutShippingOption[] | undefined | null,
  seller: { subdomain?: string | null; template?: string | null; subtotal?: number | null; hasImportProduct?: boolean | null; delivery_method_order?: unknown }
): CheckoutShippingOption[] {
  const options = Array.isArray(configured) ? configured : [];
  if (!isFourRegnSeller(seller.subdomain, seller.template)) return options;

  const subtotal = Number(seller.subtotal) || 0;
  const qualifiesForFreeStandardPaxi = subtotal >= FOUR_REGN_FREE_PAXI_STANDARD_MINIMUM;
  const standardPaxi: CheckoutShippingOption = qualifiesForFreeStandardPaxi
    ? { ...FOUR_REGN_PAXI_STANDARD, price: 0, compare_at_price: 60 }
    : { ...FOUR_REGN_PAXI_STANDARD, price: 60, compare_at_price: undefined };
  const aramex: CheckoutShippingOption = qualifiesForFreeStandardPaxi
    ? { ...FOUR_REGN_AR_MAILER, price: 50, compare_at_price: 90 }
    : { ...FOUR_REGN_AR_MAILER, price: 90, compare_at_price: undefined };

  const premiumOptions = options.filter(isPremiumShippingOption).map((opt) => ({
    ...opt,
    price: 90,
    compare_at_price: undefined,
    carrier: opt.carrier || "premium",
    service_level: opt.service_level || "premium",
  }));
  const resolvedPremiumOptions = premiumOptions.length ? premiumOptions : [{
    name: PREMIUM_SHIPPING_NAME,
    price: 90,
    estimate: "7-14 working days",
    is_premium: true,
    carrier: "premium" as const,
    service_level: "premium" as const,
  }];

  const localDeliveryMethods: Record<FourRegnDeliveryMethodKey, CheckoutShippingOption> = {
    paxi_standard: standardPaxi,
    aramex,
    paxi_express: FOUR_REGN_PAXI_EXPRESS,
  };
  const orderedLocalDeliveryOptions = normaliseFourRegnDeliveryMethodOrder(seller.delivery_method_order)
    .map((key) => localDeliveryMethods[key]);

  return [...orderedLocalDeliveryOptions, ...resolvedPremiumOptions];
}

export function shippingOptionSavings(opt: CheckoutShippingOption | undefined | null) {
  const compareAt = Number(opt?.compare_at_price);
  const price = Number(opt?.price || 0);
  if (!Number.isFinite(compareAt) || compareAt <= price) return 0;
  return compareAt - price;
}

type DeliveryWindow = { fromAt: string; toAt: string; businessDays: { min: number; max: number } };

const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const utcDate = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));
const plusDays = (date: Date, days: number) => new Date(date.getTime() + days * 86_400_000);

function easterSunday(year: number) {
  // Meeus/Jones/Butcher Gregorian calculation. South African Good Friday and
  // Family Day are always the Friday and Monday around this date.
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3); const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4); const k = c % 4; const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451); const month = Math.floor((h + l - 7 * m + 114) / 31);
  return utcDate(year, month, ((h + l - 7 * m + 114) % 31) + 1);
}

/** Official statutory South African public holidays for a calendar year.
 * A public holiday that lands on Sunday is observed on Monday under section
 * 2(1) of the Public Holidays Act. One-off gazetted days can be added here
 * when announced without changing delivery calculations elsewhere. */
export function southAfricanPublicHolidays(year: number) {
  const fixed = [[1, 1], [3, 21], [4, 27], [5, 1], [6, 16], [8, 9], [9, 24], [12, 16], [12, 25], [12, 26]]
    .map(([month, day]) => utcDate(year, month, day));
  const easter = easterSunday(year);
  const holidays = [...fixed, plusDays(easter, -2), plusDays(easter, 1)];
  for (const holiday of [...holidays]) if (holiday.getUTCDay() === 0) holidays.push(plusDays(holiday, 1));
  return new Set(holidays.map(dateKey));
}

function southAfricanCalendarDate(value: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const part = (type: string) => Number(parts.find((item) => item.type === type)?.value || 0);
  return utcDate(part("year"), part("month"), part("day"));
}

export function addSouthAfricanWorkingDays(from: Date, workingDays: number) {
  let cursor = southAfricanCalendarDate(from);
  let remaining = workingDays;
  // Counting starts on the next calendar day, never on the day an order was placed.
  while (remaining > 0) {
    cursor = plusDays(cursor, 1);
    const weekend = cursor.getUTCDay() === 0 || cursor.getUTCDay() === 6;
    if (!weekend && !southAfricanPublicHolidays(cursor.getUTCFullYear()).has(dateKey(cursor))) remaining -= 1;
  }
  return cursor;
}

function deliveryTimestamp(day: Date) {
  // Midday Johannesburg time avoids an accidental previous-day display in UTC.
  return `${dateKey(day)}T12:00:00+02:00`;
}

export function calculateFourRegnDeliveryEstimate(shippingOption?: string | null, orderedAt = new Date()): DeliveryWindow | null {
  const option = String(shippingOption || "").toLowerCase();
  let min: number; let max: number;
  if (option.includes("paxi standard")) [min, max] = [7, 9];
  else if (option.includes("door-to-door") || option.includes("door to door")) [min, max] = [2, 5];
  else if (option.includes("paxi express")) [min, max] = [3, 5];
  else return null;
  return { fromAt: deliveryTimestamp(addSouthAfricanWorkingDays(orderedAt, min)), toAt: deliveryTimestamp(addSouthAfricanWorkingDays(orderedAt, max)), businessDays: { min, max } };
}
