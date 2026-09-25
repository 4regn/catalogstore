import { canonicalStoreUrl } from "./store-url";

// Canonicals must follow a seller's connected custom domain. Previously the
// HTML on anclothing.co.za and uniklabs.co.za pointed Google back to their
// catalogstore.co.za subdomains, effectively asking it not to index the
// custom domains. Use the seller's verified domain record so this also works
// inside ISR/static rendering where request headers are intentionally absent.
export function canonicalStoreUrlForRequest(
  slug: string,
  customDomain: string | null | undefined,
  customDomainStatus: string | null | undefined,
  suffix: string = "",
): string {
  const hostname = customDomain?.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/$/, "");
  return hostname && customDomainStatus === "verified"
    ? `https://${hostname}${suffix}`
    : canonicalStoreUrl(slug, suffix);
}

// The root layout's title.template appends " · CatalogStore" to any
// plain-string page title -- right for a seller still on their
// {slug}.catalogstore.co.za subdomain (reinforces the platform they're
// built on), wrong for one on their own verified custom domain (e.g.
// 4regn.com, anclothing.co.za, uniklabs.co.za), who presents as an
// independent business there. Google was literally showing
// "4regn · CatalogStore" in search results because every storefront page's
// generateMetadata returned a plain string title. An absolute title opts
// a page out of every ancestor template.
export function sellerMetadataTitle(title: string, customDomainStatus: string | null | undefined): string | { absolute: string } {
  return customDomainStatus === "verified" ? { absolute: title } : title;
}
