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

export function isFourRegnSeller(slug?: string | null, template?: string | null) {
  return slug === "4regn" || template === "4regn";
}

export function isPremiumShippingOption(opt: { name?: string; is_premium?: boolean }) {
  return !!opt.is_premium || opt.name?.trim().toUpperCase() === PREMIUM_SHIPPING_NAME;
}

export function buildCheckoutShippingOptions(
  configured: CheckoutShippingOption[] | undefined | null,
  seller: { subdomain?: string | null; template?: string | null }
): CheckoutShippingOption[] {
  const options = Array.isArray(configured) ? configured : [];
  if (!isFourRegnSeller(seller.subdomain, seller.template)) return options;

  const premiumOptions = options.filter(isPremiumShippingOption).map((opt) => ({
    ...opt,
    carrier: opt.carrier || "premium",
    service_level: opt.service_level || "premium",
  }));

  return [
    FOUR_REGN_PAXI_STANDARD,
    FOUR_REGN_AR_MAILER,
    FOUR_REGN_PAXI_EXPRESS,
    ...premiumOptions,
  ];
}

export function shippingOptionSavings(opt: CheckoutShippingOption | undefined | null) {
  const compareAt = Number(opt?.compare_at_price);
  const price = Number(opt?.price || 0);
  if (!Number.isFinite(compareAt) || compareAt <= price) return 0;
  return compareAt - price;
}
