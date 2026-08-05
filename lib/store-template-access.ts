export const UNIK_TEMPLATE_ID = "unik-labs";
// 4regn's brand-matched storefront -- gated the same way UNIK's private
// template is (see PRIVATE_TEMPLATE_SELLERS below), just for this one seller.
export const FOURREGN_TEMPLATE_ID = "4regn";

// Private storefronts are deliberately absent from the public template list.
// The server also checks this allowlist before rendering, so changing the
// `template` column manually cannot unlock another seller's private storefront.
const PRIVATE_TEMPLATE_SELLERS: Record<string, ReadonlySet<string>> = {
  [UNIK_TEMPLATE_ID]: new Set(["unik"]),
  [FOURREGN_TEMPLATE_ID]: new Set(["4regn"]),
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
