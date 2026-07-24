// Shared, runtime-agnostic helpers for building storefront URLs. Safe to
// import from middleware (Edge runtime), API routes (Node runtime), server
// components, and client components alike -- no next/headers, no next/server.

export const STORE_ROOT_DOMAIN = "catalogstore.co.za";

// True for "mystore.catalogstore.co.za", false for the apex domain, "www",
// and anything unrelated (localhost, *.vercel.app preview URLs, etc). This
// is middleware's own narrow question -- "should I extract a slug from this
// subdomain" -- and nothing else should use it to decide link formatting;
// see usesCleanStorePaths() below for that.
export function isSubdomainHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return (
    h !== STORE_ROOT_DOMAIN &&
    h !== `www.${STORE_ROOT_DOMAIN}` &&
    h.endsWith(`.${STORE_ROOT_DOMAIN}`)
  );
}

// True when a host can use clean, relative in-app links (no /store/{slug}
// prefix): a *.catalogstore.co.za subdomain, or any seller's connected
// custom domain (e.g. uniklabs.co.za) -- middleware rewrites both to the
// right /store/{slug} route internally, so a literal prefix in the link
// itself would get applied twice and 404. False only for hosts middleware
// does NOT rewrite: the bare platform root domain (before its own redirect
// fires), localhost, and Vercel preview URLs -- those genuinely need the
// /store/{slug} prefix to reach a specific seller's page.
export function usesCleanStorePaths(hostname: string): boolean {
  const h = hostname.toLowerCase();
  const needsPrefix = h === STORE_ROOT_DOMAIN || h === `www.${STORE_ROOT_DOMAIN}` || h === "localhost" || h.endsWith(".vercel.app");
  return !needsPrefix;
}

// Builds an in-app navigation path for a seller's storefront, matching
// whichever URL form the current page is actually being served under: a
// clean host (mystore.catalogstore.co.za/p/123, or a connected custom
// domain) or the legacy path-based form (catalogstore.co.za/store/mystore/p/123).
// `origin` is a full "https://host" string -- typically window.location.origin,
// or a validated return-origin passed from the client to an API route.
export function storePath(origin: string, slug: string, suffix: string = ""): string {
  let hostname = STORE_ROOT_DOMAIN;
  try {
    hostname = new URL(origin).hostname;
  } catch {}
  return usesCleanStorePaths(hostname) ? suffix || "/" : `/store/${slug}${suffix}`;
}

// Absolute canonical store URL for freshly generated, outbound links --
// dashboard "view store" buttons, admin, emails, share actions. Always the
// clean subdomain form.
export function canonicalStoreUrl(slug: string, suffix: string = ""): string {
  return `https://${slug}.${STORE_ROOT_DOMAIN}${suffix}`;
}
