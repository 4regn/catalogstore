// Tells the storefront route handlers whether THIS DEPLOYMENT'S requests
// can use clean, relative in-app links (no /store/{slug} prefix) or need
// the legacy prefixed form -- see usesCleanStorePaths()/isSubdomainHost()
// in ./store-url.ts for the full breakdown of which real hostnames map to
// which form. (Name kept for the existing call sites, even though this no
// longer reads anything about the specific incoming request -- see below.)
//
// Previously read the real Host header via next/headers's headers() on
// every call. That worked, but headers() is one of Next.js's "dynamic
// APIs": calling it ANYWHERE in a route segment's render path (a layout's
// generateMetadata counts) forces that entire segment -- and everything
// nested under it -- to render fully dynamically on every request, which
// silently defeats `export const revalidate = 60` (declared on every
// storefront route) platform-wide. Confirmed as the dominant cause of slow
// storefront page loads: every single navigation was doing a live,
// uncached database round-trip instead of serving a cached response.
//
// Fixed by resolving this from VERCEL_ENV instead -- set automatically by
// Vercel per-deployment (not per-request), so reading it doesn't trigger
// Next's dynamic-rendering opt-out at all. This is exactly correct for
// every real-customer case: a seller's storefront is only ever reached
// through their *.catalogstore.co.za subdomain or their own connected
// custom domain, and both of those only resolve to the PRODUCTION
// deployment (Vercel routes custom domains and the platform's own
// subdomains to production, never to a preview deployment) -- so
// `VERCEL_ENV === "production"` is true exactly when a request is (for all
// practical purposes) coming in on a clean-path host. Local dev (`next
// dev`, VERCEL_ENV unset) and Vercel preview deployments
// (VERCEL_ENV === "preview") both correctly fall through to the prefixed
// form, matching what usesCleanStorePaths() already says about localhost
// and *.vercel.app hosts.
//
// The one case this can no longer distinguish: someone deliberately
// visiting the PRODUCTION deployment's own raw *.vercel.app alias instead
// of a real domain (VERCEL_ENV would say "production" there too, so this
// would incorrectly assume clean paths and 404 in-app links). That's
// internal/developer-only traffic -- real customers only ever arrive via a
// real domain -- and is judged an acceptable, low-stakes trade-off against
// finally letting every storefront page cache again.
export function isStoreSubdomainRequest(): boolean {
  return process.env.VERCEL_ENV === "production";
}
