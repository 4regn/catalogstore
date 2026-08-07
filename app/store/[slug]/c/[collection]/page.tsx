import { notFound, redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../../lib/template-config";
import { fetchAllRows } from "../../../../../lib/fetch-all-rows";
import StoreUnavailable from "../../StoreUnavailable";

// force-dynamic, not force-static -- this route now reads ?page/?sort off
// searchParams (see the 4regn branch below) to paginate collections
// server-side instead of shipping every matching product on one page.
// force-static forces searchParams to always resolve empty regardless of
// the real URL (per Next's own docs), which would make ?page=2 silently
// render page 1 forever -- there's no static/ISR-cached way to do
// per-request pagination, so this route trades that caching away
// specifically (product pages and everything else keep it; see their own
// revalidate comments).
export const dynamic = "force-dynamic";

// Heirloom, Soft Luxury and 4regn support dedicated collection pages today.
// If a seller on another template ends up here (e.g. someone shared a deep
// link), fall back to the main storefront so they don't see a broken page.
const Heirloom = nextDynamic(() => import("../../HeirloomStore"));
const SoftLuxury = nextDynamic(() => import("../../SoftLuxuryStore"));
const FourRegn = nextDynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Heirloom/SoftLuxury still need most columns below (their own ProductCard
// equivalents + slide-over read old_price/images/variants/in_stock/
// description straight off this same fetched array -- there's no separate
// per-product fetch when a card is opened). `status` and `handle` are
// dropped: neither template reads them client-side (both route product
// links by /p/{id}, never by handle; `status` is only ever a query filter,
// see .eq("status","published") below -- PostgREST applies filters
// independent of the SELECT list), and this route's own code only reads
// `category` off each row (the collectionProducts filter below).
// created_at stays for their Newest/Oldest sort option. Traced
// FourRegnStore.tsx separately for tpl === "4regn" -- see
// FOUR_REGN_PRODUCT_COLUMNS below, which is what actually gets used on this
// route once the seller is 4regn.
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at";
// 4regn's collection page renders a real flat ProductCard grid (unlike the
// product-detail/collections-index routes, which only ever show 0 or 8 cards
// off the full catalog). Traced ProductCard's current render in
// FourRegnStore.tsx (its "Add to Bag" button now just calls goToProduct() --
// no client-side variant picker on the card itself) plus every other reader
// of `products` reachable from mode="collection": pInCat's category filter
// that builds `filtered`/`collectionProducts`, the productSort comparator
// (az/za/price-low/price-high plus latest/oldest, which read `created_at` --
// the "Newest"/"Oldest" options in the sort <select> are live here, so
// created_at survives), and the header/mobile-dock search overlay (rendered
// unconditionally, reads id/name/price/category/image_url and goToProduct's
// `handle` fallback). Card rendering itself reads id, name, price, old_price
// (sale badge), image_url, and handle (goToProduct). sort_order is used only
// in the server query's .order() clause below -- PostgREST orders on that
// independent of the SELECT list, so it doesn't need to be a selected column
// for the client. images (full array)/variants/in_stock/description are
// never read for a related/grid card -- those only apply to the actual PDP's
// own selectedProduct/initialActiveProduct render path, not this one.
const FOUR_REGN_PRODUCT_COLUMNS = "id, name, price, old_price, category, image_url, handle, created_at";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";
// 4regn only -- ProductCard's .fr-ptag badge (ahead of the discount_codes-
// based promo tag, see FourRegnStore.tsx's getProductPromoBadge). Tiny table,
// cheap alongside the products/discounts fetch above. starts_at/ends_at are
// selected only to filter the active window in JS below (not passed down to
// the client -- FourRegnStore's PromoBadge type doesn't carry them).
const PROMO_BADGE_COLUMNS = "label, scope, product_id, collection_name, starts_at, ends_at";

function activePromoBadges(rows: { label: string; scope: "product" | "collection"; product_id: string | null; collection_name: string | null; starts_at: string | null; ends_at: string | null }[] | null, nowIso: string) {
  return (rows || [])
    .filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso))
    .map(({ label, scope, product_id, collection_name }) => ({ label, scope, product_id, collection_name }));
}

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

// 4regn only, for now -- Heirloom/Soft Luxury still render this route's
// full, unpaginated collectionProducts list exactly as before (their own
// client components were never built to expect a partial page + page
// controls, so leaving them alone rather than silently truncating what
// they show). PAGE_SIZE matches what Shopify showed per page on the real
// site this platform imports from.
const PAGE_SIZE = 24;

// Must stay in lockstep with FourRegnStore.tsx's own client-side
// sortProducts() (same option values, same comparators) -- that one still
// exists to sort the FIRST page's worth of already-server-sorted products
// consistently, but changing sort now re-navigates to re-sort the whole
// collection server-side, not just what's currently on screen.
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

// This route is force-dynamic (see above), so with no caching at all,
// every single pagination/sort click re-ran the full fetchAllRows +
// category-token filter over the WHOLE collection (can be hundreds or
// thousands of rows) just to slice out the 24 actually needed -- real,
// noticeable added latency on every page-to-page click during a single
// browsing session, reported directly against the live site. Same
// well-precedented pattern already used in middleware.ts for exactly
// this reason: Vercel reuses warm serverless instances across requests,
// so a short-lived module-scope cache gives most real same-session
// pagination clicks a same-instance cache hit instead of repeating the
// full fetch+filter, without needing any external cache infrastructure.
// Keyed on seller+collection only (not page/sort -- the matched product
// SET is identical across every page/sort of the same collection; only
// the order/slice differs, and that's cheap to redo in memory each time).
type CachedCollection = { products: any[]; discounts: any[]; promoBadges: any[] };
const collectionDataCache = new Map<string, { value: CachedCollection; expires: number }>();
const COLLECTION_CACHE_TTL_MS = 60_000;

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
  searchParams,
}: {
  params: Promise<{ slug: string; collection: string }>;
  searchParams: Promise<{ page?: string; sort?: string }>;
}) {
  const { slug, collection } = await params;
  const { page: pageParam, sort: sortParam } = await searchParams;

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

  const productColumns = tpl === "4regn" ? FOUR_REGN_PRODUCT_COLUMNS : PRODUCT_COLUMNS;
  const nowIso = new Date().toISOString();

  const cacheKey = `${seller.id}:${collection.toLowerCase()}`;
  const cached = collectionDataCache.get(cacheKey);
  let collectionProducts: any[];
  let discounts: any[];
  let promoBadges: any[];
  if (cached && cached.expires > Date.now()) {
    ({ products: collectionProducts, discounts, promoBadges } = cached.value);
  } else {
    const [initialProductsRaw, discountsRes, promoBadgesRes] = await Promise.all([
      fetchAllRows<any>(supabaseAdmin, "products", productColumns, (q) => {
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
      tpl === "4regn"
        ? supabaseAdmin
            .from("product_promo_badges")
            .select(PROMO_BADGE_COLUMNS)
            .eq("seller_id", seller.id)
            .eq("active", true)
        : Promise.resolve({ data: null }),
    ]);

    collectionProducts = isAll
      ? initialProductsRaw
      : initialProductsRaw.filter((p: any) =>
          (p.category || "").split(",").map((c: string) => c.trim()).includes(matched!)
        );
    discounts = discountsRes.data ?? [];
    promoBadges = promoBadgesRes.data ?? [];
    collectionDataCache.set(cacheKey, { value: { products: collectionProducts, discounts, promoBadges }, expires: Date.now() + COLLECTION_CACHE_TTL_MS });
  }

  const props = {
    initialSeller: trimSellerTemplateConfigs(seller, tpl),
    initialProducts: collectionProducts,
    initialDiscountCodes: discounts,
    initialPromoBadges: activePromoBadges(promoBadges, nowIso),
    mode: "collection" as const,
    collectionName: isAll ? "All Products" : matched!,
    isSubdomain,
  };

  if (tpl === "soft-luxury") return <SoftLuxury {...props} />;
  if (tpl === "4regn") {
    // Sort the WHOLE collection server-side, then slice to just the
    // requested page, instead of shipping every matching product (a
    // collection can run into the hundreds or thousands) on one page --
    // see PAGE_SIZE's own comment above.
    const sort = sortParam || "default";
    const sortedProducts = sortCollectionProducts(collectionProducts, sort);
    const totalPages = Math.max(1, Math.ceil(sortedProducts.length / PAGE_SIZE));
    const requestedPage = parseInt(pageParam || "1", 10);
    const currentPage = Math.min(Math.max(1, Number.isFinite(requestedPage) ? requestedPage : 1), totalPages);
    const pageProducts = sortedProducts.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    return <FourRegn {...props} initialProducts={pageProducts} currentPage={currentPage} totalPages={totalPages} currentSort={sort} totalProductCount={sortedProducts.length} />;
  }
  return <Heirloom {...props} />;
}
