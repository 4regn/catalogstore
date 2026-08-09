import { notFound, redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../lib/store-host";
import { resolveSellerTemplate } from "../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../lib/template-config";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";
import StoreUnavailable from "../StoreUnavailable";

// force-dynamic, not force-static -- reads ?q/?page/?sort off searchParams
// (same reasoning as c/[collection]/page.tsx's own force-dynamic export:
// force-static would make every one of those always resolve empty
// regardless of the real URL, so a search would silently always show the
// same thing no matter what was typed).
export const dynamic = "force-dynamic";

// 4regn only, for now -- this route exists specifically so a seller can
// type a query into the header search box, copy the resulting URL, and
// share it with a customer asking "do you have X" -- a real request from
// the 4regn seller (the popup-only search that existed before this had no
// URL of its own to share). No other template has asked for this yet.
const FourRegn = nextDynamic(() => import("../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Same column set c/[collection]/page.tsx selects for tpl === "4regn" --
// see that file's own PRODUCT_COLUMNS comment for why each field is here,
// including in_stock (ProductCard's Sold Out badge/disabled button).
const PRODUCT_COLUMNS = "id, name, price, old_price, category, image_url, handle, created_at, in_stock";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";
const PROMO_BADGE_COLUMNS = "label, scope, product_id, collection_name, starts_at, ends_at";

const PAGE_SIZE = 24;

function activePromoBadges(rows: { label: string; scope: "product" | "collection"; product_id: string | null; collection_name: string | null; starts_at: string | null; ends_at: string | null }[] | null, nowIso: string) {
  return (rows || [])
    .filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso))
    .map(({ label, scope, product_id, collection_name }) => ({ label, scope, product_id, collection_name }));
}

// Mirrors FourRegnStore.tsx's own sortProducts()/c/[collection]/page.tsx's
// sortCollectionProducts() -- must stay in lockstep (same option values,
// same comparators) since the sort <select> re-navigates here with a new
// ?sort rather than reordering client-side.
function sortSearchProducts(list: any[], sort: string): any[] {
  const out = [...list];
  if (sort === "az") out.sort((a, b) => a.name.localeCompare(b.name));
  else if (sort === "za") out.sort((a, b) => b.name.localeCompare(a.name));
  else if (sort === "latest") out.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());
  else if (sort === "oldest") out.sort((a, b) => new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime());
  else if (sort === "price-low") out.sort((a, b) => a.price - b.price);
  else if (sort === "price-high") out.sort((a, b) => b.price - a.price);
  return out;
}

export async function generateMetadata({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const { q } = await searchParams;
  const query = (q || "").trim();

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const title = query ? `Search: "${query}" | ${seller.store_name}` : `Search | ${seller.store_name}`;

  return {
    title,
    description: query ? `Search results for "${query}" at ${seller.store_name}.` : `Search ${seller.store_name}'s products.`,
    // A search-results page's content is entirely a function of an
    // arbitrary query string -- indexing every possible ?q= would just be
    // thin, near-duplicate content competing with the store's own real
    // collection/product pages for the same terms. follow: true so any
    // product links ON the page still get crawled normally.
    robots: { index: false, follow: true },
  };
}

export default async function SearchPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; page?: string; sort?: string }>;
}) {
  const { slug } = await params;
  const { q, page: pageParam, sort: sortParam } = await searchParams;
  const query = (q || "").trim();

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();

  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const isSubdomain = await isStoreSubdomainRequest();

  const tpl = resolveSellerTemplate(seller);
  if (tpl !== "4regn") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  const nowIso = new Date().toISOString();

  // No query yet (e.g. someone bookmarked /search with nothing typed) --
  // skip the catalog fetch entirely and let the page render its own
  // "type something" state, same as the header popup's own empty state.
  let matched: any[] = [];
  let discounts: any[] = [];
  let promoBadges: any[] = [];
  if (query) {
    const qLower = query.toLowerCase();
    const [allProducts, discountsRes, promoBadgesRes] = await Promise.all([
      // Not gated on in_stock -- see products/[handle]/page.tsx's identical
      // comment; this route is 4regn-only, so the exemption applies
      // unconditionally.
      fetchAllRows<any>(supabaseAdmin, "products", PRODUCT_COLUMNS, (q2) =>
        q2.eq("seller_id", seller.id).eq("status", "published").order("sort_order", { ascending: true })
      ),
      supabaseAdmin
        .from("discount_codes")
        .select(DISCOUNT_COLUMNS)
        .eq("seller_id", seller.id)
        .eq("active", true)
        .eq("show_countdown", true)
        .not("expires_at", "is", null),
      supabaseAdmin
        .from("product_promo_badges")
        .select(PROMO_BADGE_COLUMNS)
        .eq("seller_id", seller.id)
        .eq("active", true),
    ]);
    // Same substring match (name or category, case-insensitive) as the
    // header/mobile search popup's own `searched` filter in
    // FourRegnStore.tsx -- typing "Kelvin" finds "Kelvin Momo Oversized
    // Tee" here exactly the way it already does in the popup, so this page
    // is a strict superset (a real URL for the same results), not a
    // different search behavior to keep in sync separately.
    matched = allProducts.filter(
      (p) => p.name.toLowerCase().includes(qLower) || (p.category || "").toLowerCase().includes(qLower)
    );
    discounts = discountsRes.data ?? [];
    promoBadges = promoBadgesRes.data ?? [];
  }

  const sort = sortParam || "default";
  const sortedProducts = sortSearchProducts(matched, sort);
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
      mode="search"
      initialSearchQuery={query}
      currentPage={currentPage}
      totalPages={totalPages}
      currentSort={sort}
      totalProductCount={sortedProducts.length}
      isSubdomain={isSubdomain}
    />
  );
}
