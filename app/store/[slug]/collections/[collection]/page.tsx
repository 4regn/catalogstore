import { notFound, redirect } from "next/navigation";
import { unstable_cache } from "next/cache";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../../lib/template-config";
import { fetchAllRows } from "../../../../../lib/fetch-all-rows";
import { getCachedFourRegnCatalog } from "../../../../../lib/four-regn-catalog-cache";
import StoreUnavailable from "../../StoreUnavailable";

// 4regn-only route -- every other template's collection pages still live at
// /c/{collection} (see ../../c/[collection]/page.tsx). This one exists
// purely to match 4regn's real (Shopify-era, already-indexed) collection
// URL shape: Shopify always serves collections at /collections/{handle},
// confirmed against 4regn's own Custom/Smart Collections CSV exports (real
// rows like Handle="4regn-cargo-pants", Title="PANTS"). On DNS cutover to
// 4regn.com, matching that shape exactly means zero indexed collection URLs
// break -- no redirect, no ranking reset, identical to how
// products/[handle]/page.tsx already mirrors Shopify's /products/{handle}.
//
// Same force-dynamic/pagination/sort/cache logic as ../../c/[collection]/page.tsx's
// own 4regn branch -- kept in sync deliberately (this is that branch,
// extracted) rather than sharing a helper, since Heirloom/SoftLuxury's half
// of that file has nothing in common with this one anymore once 4regn no
// longer flows through it.
export const dynamic = "force-dynamic";

const FourRegn = nextDynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Same column set/reasoning as ../../c/[collection]/page.tsx's own
// FOUR_REGN_PRODUCT_COLUMNS -- see that file's comment for why each field
// is here, including in_stock (ProductCard's Sold Out badge/disabled
// button; this route doesn't filter sold-out products out either).

function getCachedSeller(slug: string) {
  return unstable_cache(
    async () => {
      const { data } = await supabaseAdmin
        .from("sellers")
        .select(SELLER_COLUMNS)
        .eq("subdomain", slug)
        .maybeSingle();
      return data;
    },
    ["four-regn-collection-seller-v1", slug],
    { revalidate: 60, tags: [`storefront:${slug}`] }
  )();
}

function activePromoBadges(rows: { label: string; scope: "product" | "collection"; product_id: string | null; collection_name: string | null; starts_at: string | null; ends_at: string | null }[] | null, nowIso: string) {
  return (rows || [])
    .filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso))
    .map(({ label, scope, product_id, collection_name }) => ({ label, scope, product_id, collection_name }));
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// Shopify showed 24 products per collection page on the real site this
// platform imports from -- matches ../../c/[collection]/page.tsx's own
// PAGE_SIZE.
const PAGE_SIZE = 24;

// Must stay in lockstep with FourRegnStore.tsx's own client-side
// sortProducts() -- see ../../c/[collection]/page.tsx's identical comment.
function sortCollectionProducts(list: any[], sort: string): any[] {
  const out = [...list];
  if (sort === "az") out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "za") out.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "latest") out.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  else if (sort === "oldest") out.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  else if (sort === "price-low") out.sort((a, b) => a.price - b.price);
  else if (sort === "price-high") out.sort((a, b) => b.price - a.price);
  return out;
}

// Same short-lived module-scope pagination/sort cache as
// ../../c/[collection]/page.tsx -- see that file's own comment for why
// (force-dynamic + no cache meant every page/sort click re-ran the full
// fetchAllRows + category filter over the whole collection).

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; collection: string }>;
}): Promise<Metadata> {
  const { slug, collection } = await params;

  const seller = await getCachedSeller(slug);

  if (!seller) return {};

  const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
  const isAll = collection.toLowerCase() === "all";
  const name = isAll ? "All Products" : (collections.find((c) => slugify(c) === collection.toLowerCase()) ?? collection);

  const title = `${name} | ${seller.store_name}`;
  const description = `Shop ${name} at ${seller.store_name}.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalStoreUrl(slug, `/collections/${collection}`) },
    openGraph: { title, description },
  };
}

export default async function CollectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; collection: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { slug, collection } = await params;
  const { page: pageParam, sort: sortParam } = await searchParams;

  const seller = await getCachedSeller(slug);

  if (!seller) notFound();

  // Frozen store -- same "unavailable" page as the main storefront.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const isSubdomain = await isStoreSubdomainRequest();

  // Resolve through the same private-template gate every other 4regn-only
  // route uses, so a raw `template` column value can't be used to reach
  // 4regn's private storefront from a seller who isn't allowed to use it.
  // Anyone NOT on 4regn who somehow lands here (shared deep link, etc.)
  // gets sent to the shared /c/{collection} route instead of a 404 --
  // Heirloom/SoftLuxury's real collection pages still live there.
  const tpl = resolveSellerTemplate(seller);
  if (tpl !== "4regn") {
    redirect(isSubdomain ? `/c/${collection}` : `/store/${slug}/c/${collection}`);
  }

  // Special-case "all": render every published product without a category filter.
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
        q.eq("seller_id", seller.id).eq("status", "published").not("category", "is", null)
      );
      const cats = Array.from(new Set(distinctCats.flatMap((r) => (r.category || "").split(",").map((c) => c.trim())).filter(Boolean)));
      matched = cats.find((c) => slugify(c) === collection.toLowerCase()) ?? null;
    }

    if (!matched) notFound();
  }

  const nowIso = new Date().toISOString();

  const { products: catalogProducts, discounts, promoBadges } = await getCachedFourRegnCatalog(slug, seller.id);
  const collectionProducts = isAll
    ? catalogProducts
    : catalogProducts.filter((p: any) =>
        (p.category || "").split(",").map((c: string) => c.trim()).includes(matched!)
      );

  // Sort the WHOLE collection server-side, then slice to just the requested
  // page, instead of shipping every matching product (a collection can run
  // into the hundreds or thousands) on one page.
  const sort = sortParam || "default";
  const sortedProducts = sortCollectionProducts(collectionProducts, sort);
  const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
  const requestedPage = parseInt(pageParam || "1", 10);
  const currentPage = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), totalPages);
  const pageProducts = sortedProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

  return (
    <FourRegn
      initialSeller={trimSellerTemplateConfigs(seller, tpl)}
      initialProducts={pageProducts}
      initialDiscountCodes={discounts}
      initialPromoBadges={activePromoBadges(promoBadges, nowIso)}
      mode="collection"
      collectionName={isAll ? "All Products" : matched!}
      isSubdomain={isSubdomain}
      currentPage={currentPage}
      totalPages={totalPages}
      currentSort={sort}
      totalProductCount={sortedProducts.length}
    />
  );
}
