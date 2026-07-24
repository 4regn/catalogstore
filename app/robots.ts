import type { MetadataRoute } from "next";

// One robots.txt for every host this app serves (catalogstore.co.za, any
// seller subdomain, and any connected custom domain) -- it was previously
// missing entirely (404), which is a routine thing crawlers and Search
// Console checks look for even though it isn't required for indexing.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/dashboard", "/affiliate/dashboard"],
    },
  };
}
