// Shared, runtime-agnostic helpers for building storefront URLs. Safe to
// import from middleware (Edge runtime), API routes (Node runtime), server
// components, and client components alike -- no next/headers, no next/server.

export const STORE_ROOT_DOMAIN = "catalogstore.co.za";

// True for "mystore.catalogstore.co.za", false for the apex domain, "www",
// and anything unrelated (localhost, *.vercel.app preview URLs, etc).
export function isSubdomainHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h !== STORE_ROOT_DOMAIN &&
    h !== `www.${STORE_ROOT_DOMAIN}` &&
    h.endsWith(`.${STORE_ROOT_DOMAIN}`)
  );
}

// Builds an in-app navigation path for a seller's storefront, matching
// whichever URL form the current page is actually being served under: the
// clean subdomain (mystore.catalogstore.co.za/p/123) or the legacy
// path-based form (catalogstore.co.za/store/mystore/p/123). `origin` is a
// full "https://host" string -- typically window.location.origin, or a
// validated return-origin passed from the client to an API route.
export function storePath(origin: string, slug: string, suffix: string = ""): string {
  let hostname = STORE_ROOT_DOMAIN;
  try {
    hostname = new URL(origin).hostname;
  } catch {}
  return isSubdomainHost(hostname) ? suffix || "/" : `/store/${slug}${suffix}`;
}

// Absolute canonical store URL for freshly generated, outbound links --
// dashboard "view store" buttons, admin, emails, share actions. Always the
// clean subdomain form.
export function canonicalStoreUrl(slug: string, suffix: string = ""): string {
  return `https://${slug}.${STORE_ROOT_DOMAIN}${suffix}`;
}
