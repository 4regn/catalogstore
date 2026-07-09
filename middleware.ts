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
