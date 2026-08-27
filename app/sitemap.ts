import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { supabaseAdmin } from "../lib/supabase-admin";
import { STORE_ROOT_DOMAIN, isSubdomainHost } from "../lib/store-url";
import { fetchAllRows } from "../lib/fetch-all-rows";

export const revalidate = 3600;

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
  if (seller.subdomain === "4regn") {
    entries.push({ url: `${origin}/stitch-pay-later`, changeFrequency: "monthly", priority: 0.7 });
  }

  {
    // A single .limit() can't exceed the project's own server-side row cap
    // (confirmed elsewhere in this codebase: requesting more than the cap
    // just gets silently truncated to it), so a seller with more published
    // products than that cap would have had the rest quietly missing from
    // their sitemap. Pages through instead.
    // `handle` only ever gets set for 4regn today (see the products.handle
    // backfill), but selecting it for every template here is harmless --
    // it's simply null/undefined for everyone else, and the per-product
    // fallback below already handles that.
    // 4regn is exempt from the in_stock filter here -- its PDP no longer
    // 404s a sold-out product (see products/[handle]/page.tsx's own
    // comment), so keeping the sitemap in sync means not dropping the URL
    // out of it either. Hiding a page from Google every time it sells out,
    // then re-adding it on restock, throws away its accumulated ranking on
    // every cycle -- a real, avoidable cost for a resale catalog where
    // restocks are routine. Every other template still 404s on sold-out
    // (no Sold Out UI of its own yet), so it keeps the filter.
    const products = await fetchAllRows<{ id: string; created_at: string | null; handle: string | null }>(
      supabaseAdmin, "products", "id, created_at, handle", (q) => {
        let base = q.eq("seller_id", seller.id).eq("status", "published");
        if (seller.template !== "4regn") base = base.eq("in_stock", true);
        return base;
      }
    );

    for (const p of products) {
      // Every seller uses the same readable canonical URL. The UUID path is
      // retained only as a legacy entry point and permanently redirects.
      const path = p.handle ? `/products/${p.handle}` : `/p/${p.id}`;
      entries.push({ url: `${origin}${path}`, lastModified: p.created_at || undefined, changeFrequency: "weekly", priority: 0.8 });
    }
  }

  {
    const collectionPrefix = "/collections";
    const collections = Array.isArray(seller.collections) ? (seller.collections as string[]) : [];
    entries.push({ url: `${origin}${collectionPrefix}/all`, changeFrequency: "daily", priority: 0.7 });
    for (const c of collections) {
      const slug = slugify(c);
      if (slug) entries.push({ url: `${origin}${collectionPrefix}/${slug}`, changeFrequency: "weekly", priority: 0.6 });
    }
  }

  return entries;
}
