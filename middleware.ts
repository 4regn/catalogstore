import { NextRequest, NextResponse } from "next/server";
import { STORE_ROOT_DOMAIN, isSubdomainHost } from "./lib/store-url";

// Sellers only ever get a single-level subdomain (set at signup from their
// store name), so reject anything with an embedded dot to avoid a spoofed
// Host header like "evil.mystore.catalogstore.co.za" being treated as a
// valid slug.
const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function middleware(req: NextRequest) {
  const hostname = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const { pathname, search } = req.nextUrl;

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
  const isStaticFile = /\.[a-zA-Z0-9]+$/.test(pathname);
  if (isSubdomainHost(hostname) && !pathname.startsWith("/api/") && !isStaticFile) {
    const sub = hostname.slice(0, -(`.${STORE_ROOT_DOMAIN}`.length));
    if (SLUG_PATTERN.test(sub)) {
      const url = req.nextUrl.clone();
      url.pathname = `/store/${sub}${pathname === "/" ? "" : pathname}`;
      return NextResponse.rewrite(url);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
