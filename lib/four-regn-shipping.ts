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
  seller: { subdomain?: string | null; template?: string | null; subtotal?: number | null; hasImportProduct?: boolean | null }
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

  return [
    standardPaxi,
    aramex,
    ...resolvedPremiumOptions,
    FOUR_REGN_PAXI_EXPRESS,
  ];
}

export function shippingOptionSavings(opt: CheckoutShippingOption | undefined | null) {
  const compareAt = Number(opt?.compare_at_price);
  const price = Number(opt?.price || 0);
  if (!Number.isFinite(compareAt) || compareAt <= price) return 0;
  return compareAt - price;
}
