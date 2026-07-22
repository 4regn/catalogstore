export const UNIK_TEMPLATE_ID = "unik-labs";

// Private storefronts are deliberately absent from the public template list.
// The server also checks this allowlist before rendering, so changing the
// `template` column manually cannot unlock another seller's private storefront.
const PRIVATE_TEMPLATE_SELLERS: Record<string, ReadonlySet<string>> = {
  [UNIK_TEMPLATE_ID]: new Set(["unik"]),
};

export function isPrivateTemplate(template: string | null | undefined): boolean {
  return !!template && Object.prototype.hasOwnProperty.call(PRIVATE_TEMPLATE_SELLERS, template);
}

export function canSellerUseTemplate(
  template: string | null | undefined,
  sellerSubdomain: string | null | undefined,
): boolean {
  if (!template || !isPrivateTemplate(template)) return true;
  return !!sellerSubdomain && PRIVATE_TEMPLATE_SELLERS[template].has(sellerSubdomain);
}

export function resolveSellerTemplate(seller: {
  template?: string | null;
  subdomain?: string | null;
}): string {
  const requested = seller.template || "soft-luxury";
  return canSellerUseTemplate(requested, seller.subdomain) ? requested : "soft-luxury";
}
