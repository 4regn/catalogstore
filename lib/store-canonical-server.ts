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
