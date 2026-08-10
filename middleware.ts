import { NextRequest, NextResponse } from "next/server";
import { STORE_ROOT_DOMAIN, isSubdomainHost } from "./lib/store-url";

// Sellers only ever get a single-level subdomain (set at signup from their
// store name), so reject anything with an embedded dot to avoid a spoofed
// Host header like "evil.mystore.catalogstore.co.za" being treated as a
// valid slug.
const SLUG_PATTERN = /^[a-z0-9-]+$/;

// Looks up which seller (by subdomain slug) owns a verified custom domain.
// Cached for 5 minutes via Next's fetch cache so most requests for the same
// domain don't hit Supabase at all -- only genuine custom-domain traffic
// (not catalogstore.co.za/*.catalogstore.co.za) ever reaches this.
async function resolveCustomDomain(hostname: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  try {
    const res = await fetch(
      `${url}/rest/v1/sellers?select=subdomain&custom_domain=eq.${encodeURIComponent(hostname)}&custom_domain_status=eq.verified&limit=1`,
      {
        headers: { apikey: key, Authorization: `Bearer ${key}` },
        next: { revalidate: 300 },
      }
    );
    if (!res.ok) return null;
    const rows = await res.json();
    return rows?.[0]?.subdomain || null;
  } catch {
    return null;
  }
}

// Recognizes old Shopify-style paths (/products/{handle}, /collections/{handle})
// so a seller who migrated off Shopify (e.g. their domain used to be served by
// Shopify and now points at CatalogStore) doesn't send existing search results,
// bookmarks, or shared links to a 404.
const LEGACY_PRODUCT_PATH = /^\/products\/([a-z0-9-]+)\/?$/i;
const LEGACY_COLLECTION_PATH = /^\/collections\/([a-z0-9-]+)\/?$/i;

// Looks up a seller's product by the Shopify "Handle" captured at CSV import
// time (see legacy_handle in app/api/csv-import/route.ts). Two round trips
// instead of a PostgREST embedded join, to match resolveCustomDomain's style
// and avoid depending on relationship auto-detection. Cached for 5 minutes.
async function resolveLegacyProductId(slug: string, handle: string): Promise<string | null> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const headers = { apikey: key, Authorization: `Bearer ${key}` };
  try {
    const sellerRes = await fetch(
      `${url}/rest/v1/sellers?select=id&subdomain=eq.${encodeURIComponent(slug)}&limit=1`,
      { headers, next: { revalidate: 300 } }
    );
    if (!sellerRes.ok) return null;
    const sellerRows = await sellerRes.json();
    const sellerId = sellerRows?.[0]?.id;
    if (!sellerId) return null;

    const productRes = await fetch(
      `${url}/rest/v1/products?select=id&seller_id=eq.${sellerId}&legacy_handle=eq.${encodeURIComponent(handle)}&limit=1`,
      { headers, next: { revalidate: 300 } }
    );
    if (!productRes.ok) return null;
    const productRows = await productRes.json();
    return productRows?.[0]?.id || null;
  } catch {
    return null;
  }
}

// Redirects a legacy Shopify path to its CatalogStore equivalent on the same
// host, or returns null if the path isn't a legacy pattern (or has no match,
// for products -- an unmapped handle falls through to a normal 404 rather
// than a broken redirect).
async function legacyShopifyRedirect(req: NextRequest, slug: string): Promise<NextResponse | null> {
  const { pathname } = req.nextUrl;

  const collectionMatch = pathname.match(LEGACY_COLLECTION_PATH);
  if (collectionMatch) {
    // /c/{collection} already resolves a URL slug against the seller's
    // category names, and Shopify collection handles are themselves slugs --
    // so no lookup is needed, just point at the equivalent clean path.
    const dest = req.nextUrl.clone();
    dest.pathname = `/c/${collectionMatch[1]}`;
    return NextResponse.redirect(dest, 308);
  }

  const productMatch = pathname.match(LEGACY_PRODUCT_PATH);
  if (productMatch) {
    const productId = await resolveLegacyProductId(slug, productMatch[1]);
    if (productId) {
      const dest = req.nextUrl.clone();
      dest.pathname = `/p/${productId}`;
      return NextResponse.redirect(dest, 308);
    }
  }

  return null;
}

export async function middleware(req: NextRequest) {
  const hostname = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const { pathname, search } = req.nextUrl;
  const isStaticFile = /\.[a-zA-Z0-9]+$/.test(pathname);

  // Legacy path-based links (catalogstore.co.za/store/mystore/...) redirect
  // to the clean subdomain form so old shared links keep working.
  if (hostname === STORE_ROOT_DOMAIN || hostname === `www.${STORE_ROOT_DOMAIN}`) {
    if (pathname.startsWith("/store/")) {
      const rest = pathname.slice("/store/".length);
      const slashIdx = rest.indexOf("/");
      const slug = slashIdx === -1 ? rest : rest.slice(0, slashIdx);
      const subPath = slashIdx === -1 ? "" : rest.slice(slashIdx);
      if (slug && SLUG_PATTERN.test(slug)) {
        const dest = new URL(`https://${slug}.${STORE_ROOT_DOMAIN}${subPath}${search}`);
        return NextResponse.redirect(dest, 308);
      }
    }
    return NextResponse.next();
  }

  // Subdomain routing: mystore.catalogstore.co.za/p/123 internally becomes
  // /store/mystore/p/123, which is what the existing route files match.
  // API routes and static files (anything with a file extension -- images,
  // fonts, etc. served from /public) are host-agnostic and must never get
  // the /store prefix. Our own app routes never have a dot in the last
  // path segment, so this is a safe general-purpose exclusion.
  if (isSubdomainHost(hostname) && !pathname.startsWith("/api/") && !isStaticFile) {
    const sub = hostname.slice(0, -(`.${STORE_ROOT_DOMAIN}`.length));
    if (SLUG_PATTERN.test(sub)) {
      const legacyRedirect = await legacyShopifyRedirect(req, sub);
      if (legacyRedirect) return legacyRedirect;
      const url = req.nextUrl.clone();
      url.pathname = `/store/${sub}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  // Custom domain routing (Pro plan): a seller's own domain (e.g.
  // mystore.co.za) pointed at Vercel resolves to the exact same /store/{slug}
  // route as their subdomain. Only verified domains route -- a domain still
  // pending DNS verification, or one that's been disconnected, simply falls
  // through and 404s rather than silently serving the wrong store.
  if (!pathname.startsWith("/api/") && !isStaticFile) {
    const slug = await resolveCustomDomain(hostname);
    if (slug) {
      const legacyRedirect = await legacyShopifyRedirect(req, slug);
      if (legacyRedirect) return legacyRedirect;
      const url = req.nextUrl.clone();
      url.pathname = `/store/${slug}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
