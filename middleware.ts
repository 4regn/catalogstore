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

// SETLA's marketing/signup domain -- a standalone demand-validation
// landing page, not a seller storefront, so it doesn't go through
// resolveCustomDomain()/sellers.custom_domain at all. Every SETLA page
// already exists as a static file at public/setla/*.html, reused as-is --
// these same files are also linked from uniklabs.co.za/setla/*.html and
// possibly elsewhere, and every internal href/src in them is a *relative*
// reference (e.g. href="signup.html", src="setla.js"). That's why this
// stays a pure routing trick rather than editing the HTML: hardcoding
// clean absolute paths (href="/signup") into the shared files would break
// navigation on every other domain that reuses them. Instead, on this
// domain only, a .html request (which is exactly what those relative
// links resolve to once the browser is sitting on a clean path) 308s to
// its clean equivalent, then the clean path is rewritten onto the real
// file -- so the address bar only ever shows the clean form, and the
// shared files never need to know which domain served them. Runs before
// the isStaticFile checks further down since those are specific to the
// seller-domain rewrites and would otherwise skip .html requests here
// entirely, 404ing before this block ever sees them.
const SETLA_MARKETING_HOSTS = new Set(["setla.4regn.com", "www.setla.4regn.com"]);

export async function middleware(req: NextRequest) {
  const hostname = (req.headers.get("host") || "").split(":")[0].toLowerCase();
  const { pathname, search } = req.nextUrl;
  const isStaticFile = /\.[a-zA-Z0-9]+$/.test(pathname);

  if (SETLA_MARKETING_HOSTS.has(hostname) && !pathname.startsWith("/api/") && !pathname.startsWith("/setla/") && !pathname.startsWith("/_next")) {
    if (pathname.endsWith(".html")) {
      const clean = pathname === "/index.html" ? "/" : pathname.slice(0, -".html".length);
      return NextResponse.redirect(new URL(`${clean}${search}`, req.url), 308);
    }
    const url = req.nextUrl.clone();
    if (pathname === "/") {
      url.pathname = "/setla/index.html";
    } else if (isStaticFile) {
      // CSS/JS/images -- referenced relatively (e.g. src="setla.js") from
      // every clean page path, all of which resolve them against the same
      // root context since none of these clean paths end in a slash.
      url.pathname = `/setla${pathname}`;
    } else {
      url.pathname = `/setla${pathname}.html`;
    }
    return NextResponse.rewrite(url);
  }

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
