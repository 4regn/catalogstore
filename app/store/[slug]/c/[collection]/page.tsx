import { notFound, redirect, permanentRedirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../../lib/template-config";
import { fetchAllRows } from "../../../../../lib/fetch-all-rows";
import StoreUnavailable from "../../StoreUnavailable";

// Heirloom and Soft Luxury's collection pages -- 4regn moved to
// ../collections/[collection]/page.tsx (matching Shopify's own
// /collections/{handle} URL shape; see that file's own comment) and
// permanently redirects here instead of rendering, so this file no longer
// needs any of 4regn's own logic (pagination, its own column set, etc.) --
// removed rather than left dead. If a seller on another template ends up
// here (e.g. someone shared a deep link), fall back to the main storefront.
//
// force-dynamic was originally required here for 4regn's ?page/?sort
// searchParams; Heirloom/SoftLuxury never read searchParams (they render
// the full, unpaginated collection every time), so this could in principle
// go back to force-static's ISR caching now -- left as force-dynamic
// anyway since neither template asked for that change and it's already a
// safe, correct default, just not the most-cached one.
export const dynamic = "force-dynamic";

const Heirloom = nextDynamic(() => import("../../HeirloomStore"));
const SoftLuxury = nextDynamic(() => import("../../SoftLuxuryStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Heirloom/SoftLuxury's own ProductCard equivalents + slide-over read
// old_price/images/variants/in_stock/description straight off this same
// fetched array -- there's no separate per-product fetch when a card is
// opened. `status` and `handle` are dropped: neither template reads them
// client-side (both route product links by /p/{id}, never by handle;
// `status` is only ever a query filter, see .eq("status","published")
// below -- PostgREST applies filters independent of the SELECT list), and
// this route's own code only reads `category` off each row (the
// collectionProducts filter below). created_at stays for their
// Newest/Oldest sort option.
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; collection: string }>;
}): Promise<Metadata> {
  const { slug, collection } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, collections")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
  const isAll = collection.toLowerCase() === "all";
  const name = isAll ? "All Products" : (collections.find((c) => slugify(c) === collection.toLowerCase()) ?? collection);

  const title = `${name} | ${seller.store_name}`;
  const description = `Shop ${name} at ${seller.store_name}.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalStoreUrl(slug, `/c/${collection}`) },
    openGraph: { title, description },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string; collection: string }>;
}) {
  const { slug, collection } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();

  // Frozen store -- same "unavailable" page as the main storefront.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const isSubdomain = await isStoreSubdomainRequest();

  // Resolve through the same private-template gate the main store page uses,
  // so a raw `template` column value can't be used to reach 4regn's private
  // storefront from a seller who isn't allowed to use it.
  const tpl = resolveSellerTemplate(seller);

  // Only Heirloom, Soft Luxury and 4regn render collection pages. Other
  // templates send the visitor home.
  if (tpl !== "heirloom" && tpl !== "soft-luxury" && tpl !== "4regn") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  // 4regn's real collection pages moved to ../collections/[collection]/page.tsx
  // (matching Shopify's own /collections/{handle} URL shape -- see that
  // file's own comment). Permanent since this is a genuine URL-scheme
  // change, same reasoning as the /p/{uuid} -> /products/{handle} redirect
  // in ../p/[productId]/page.tsx. Query string (?page/?sort) is dropped
  // rather than forwarded -- nothing outside this app should have an old
  // /c/ deep link with pagination/sort params on it yet (4regn hasn't been
  // live on its real domain), so there's nothing real to preserve there.
  if (tpl === "4regn") {
    permanentRedirect(isSubdomain ? `/collections/${collection}` : `/store/${slug}/collections/${collection}`);
  }

  // Special-case "all": render every published in-stock product without a category filter.
  const isAll = collection.toLowerCase() === "all";

  // For named collections, accept the URL slug if it matches EITHER the seller's explicit
  // collections list OR a category that's actually used on a product. The dashboard doesn't
  // always sync product.category back into seller.collections (e.g. CSV import), so checking
  // both prevents 404s on collections the seller can clearly see in their menu.
  let matched: string | null = null;
  if (!isAll) {
    const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
    matched = collections.find((c) => slugify(c) === collection.toLowerCase()) ?? null;

    if (!matched) {
      const distinctCats = await fetchAllRows<{ category: string }>(supabaseAdmin, "products", "category", (q) =>
        q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published").not("category", "is", null)
      );
      const cats = Array.from(new Set(distinctCats.flatMap((r) => (r.category || "").split(",").map((c) => c.trim())).filter(Boolean)));
      matched = cats.find((c) => slugify(c) === collection.toLowerCase()) ?? null;
    }

    if (!matched) notFound();
  }

  const [initialProductsRaw, discountsRes] = await Promise.all([
    fetchAllRows<any>(supabaseAdmin, "products", PRODUCT_COLUMNS, (q) => {
      const base = q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true });
      return isAll ? base : base.like("category", `%${matched!}%`);
    }),
    supabaseAdmin
      .from("discount_codes")
      .select(DISCOUNT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("active", true)
      .eq("show_countdown", true)
      .not("expires_at", "is", null),
  ]);

  const collectionProducts = isAll
    ? initialProductsRaw
    : initialProductsRaw.filter((p: any) =>
        (p.category || "").split(",").map((c: string) => c.trim()).includes(matched!)
      );
  const discounts = discountsRes.data ?? [];

  const props = {
    initialSeller: trimSellerTemplateConfigs(seller, tpl),
    initialProducts: collectionProducts,
    initialDiscountCodes: discounts,
    mode: "collection" as const,
    collectionName: isAll ? "All Products" : matched!,
    isSubdomain,
  };

  if (tpl === "soft-luxury") return <SoftLuxury {...props} />;
  return <Heirloom {...props} />;
}
