import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { supabaseAdmin } from "../lib/supabase-admin";
import { STORE_ROOT_DOMAIN, isSubdomainHost } from "../lib/store-url";

export const revalidate = 3600;

// Real per-product pages only render correctly for these templates today
// (app/store/[slug]/p/[productId]/page.tsx's own dispatch) -- anything else
// (unik-labs, rosefields, velour) has no product-detail route worth
// listing, so it's deliberately left out rather than pointing crawlers at
// a page that doesn't represent that product.
const PRODUCT_PAGE_TEMPLATES = new Set(["crown", "glass-futuristic", "glass-chrome", "heirloom", "soft-luxury"]);
// Same story for collection pages (app/store/[slug]/c/[collection]/page.tsx
// redirects every other template straight back to the store root).
const COLLECTION_PAGE_TEMPLATES = new Set(["heirloom", "soft-luxury"]);

const slugify = (s: string) => s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

type SellerRow = {
  id: string;
  subdomain: string;
  template: string;
  subscription_status: string | null;
  collections: unknown;
};

// One /sitemap.xml route serves every host this app answers to. It isn't
// rewritten by middleware (sitemap.xml matches the "static file" exclusion
// there), so it has to resolve the requesting host itself -- same lookup
// middleware does for subdomains and verified custom domains -- and return
// ONLY that seller's URLs. A sitemap listing a different host's pages reads
// as invalid/suspicious to Google, so this must self-reference whichever
// host the request actually came in on.
async function resolveSellerForHost(hostname: string): Promise<SellerRow | null> {
  if (isSubdomainHost(hostname)) {
    const slug = hostname.slice(0, -(`.${STORE_ROOT_DOMAIN}`.length));
    const { data } = await supabaseAdmin
      .from("sellers")
      .select("id, subdomain, template, subscription_status, collections")
      .eq("subdomain", slug)
      .maybeSingle();
    return data;
  }
  if (hostname !== STORE_ROOT_DOMAIN && hostname !== `www.${STORE_ROOT_DOMAIN}`) {
    const { data } = await supabaseAdmin
      .from("sellers")
      .select("id, subdomain, template, subscription_status, collections")
      .eq("custom_domain", hostname)
      .eq("custom_domain_status", "verified")
      .maybeSingle();
    return data;
  }
  return null;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const hdrs = await headers();
  const hostname = (hdrs.get("host") || STORE_ROOT_DOMAIN).split(":")[0].toLowerCase();

  const seller = await resolveSellerForHost(hostname);

  // Platform root domain, or a host that doesn't resolve to any seller --
  // just the marketing home page for now.
  if (!seller) {
    return [{ url: `https://${STORE_ROOT_DOMAIN}/`, changeFrequency: "weekly", priority: 1 }];
  }

  // Frozen store -- nothing here is worth crawling until it's active again.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return [];
  }

  const origin = `https://${hostname}`;
  const entries: MetadataRoute.Sitemap = [{ url: origin, changeFrequency: "daily", priority: 1 }];

  if (PRODUCT_PAGE_TEMPLATES.has(seller.template)) {
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id, created_at")
      .eq("seller_id", seller.id)
      .eq("in_stock", true)
      .eq("status", "published")
      .limit(2000);

    for (const p of products ?? []) {
      entries.push({ url: `${origin}/p/${p.id}`, lastModified: p.created_at || undefined, changeFrequency: "weekly", priority: 0.8 });
    }
  }

  if (COLLECTION_PAGE_TEMPLATES.has(seller.template)) {
    const collections = Array.isArray(seller.collections) ? (seller.collections as string[]) : [];
    entries.push({ url: `${origin}/c/all`, changeFrequency: "daily", priority: 0.7 });
    for (const c of collections) {
      const slug = slugify(c);
      if (slug) entries.push({ url: `${origin}/c/${slug}`, changeFrequency: "weekly", priority: 0.6 });
    }
  }

  return entries;
}
