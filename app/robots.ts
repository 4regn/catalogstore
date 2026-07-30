import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { STORE_ROOT_DOMAIN } from "../lib/store-url";

// One robots.txt for every host this app serves (catalogstore.co.za, any
// seller subdomain, and any connected custom domain) -- it was previously
// missing entirely (404), which is a routine thing crawlers and Search
// Console checks look for even though it isn't required for indexing.
export default async function robots(): Promise<MetadataRoute.Robots> {
  const hdrs = await headers();
  const hostname = (hdrs.get("host") || STORE_ROOT_DOMAIN).split(":")[0].toLowerCase();

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/affiliate/dashboard"],
    },
    // Same self-referencing-host reasoning as app/sitemap.ts -- pointing a
    // seller's robots.txt at a different host's sitemap would be invalid.
    sitemap: `https://${hostname}/sitemap.xml`,
  };
}
