import { notFound, redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../lib/template-config";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";
import StoreUnavailable from "../StoreUnavailable";

export const revalidate = 60;
// See app/store/[slug]/page.tsx's own comment on this same line for the
// full reasoning -- summary: without this, Vercel never registers a
// dynamic-segment route (no generateStaticParams possible here, sellers
// are DB-driven) as ISR-eligible at all, so `revalidate = 60` alone
// silently does nothing; confirmed via a live x-vercel-cache MISS on a
// repeat request. force-static chosen over an empty-array
// generateStaticParams to avoid its documented dynamicParams/404 footgun.
export const dynamic = "force-static";

// 4regn-only route -- every other template links its collections straight
// off the homepage/nav and has no dedicated "all collections" index page.
const FourRegn = nextDynamic(() => import("../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Traced every isCollectionsIndexView code path in FourRegnStore.tsx: the
// collection tiles here only read category/image_url via catCount()/
// catImage(). But `products` is shared client state, not a per-mode prop --
// the header/mobile-dock search overlay (fr-search-btn / fr-dock, both
// rendered unconditionally, not gated to any `mode`) is reachable from this
// page too, and its result list reads id, name, price, and goToProduct()
// off it, which falls back to `handle` for routing. `initialProducts` here
// is passed straight through to `products` client state (this route always
// passes `initialSeller`, so FourRegnStore's client-fetch effect short-
// circuits and never backfills missing columns) -- so search would silently
// render blank names/prices and mis-route on click if those columns were
// dropped. old_price/images/variants/in_stock/description/sort_order/
// created_at are never read on this view (no ProductCard, no product sort
// dropdown here), fetchAllRows<any> means TS doesn't require the full
// `Product` shape to type-check, so this is a real narrowing, not a
// same-shape-for-safety fetch. This is the same floor set as the homepage's
// FOUR_REGN_HOME_PRODUCT_COLUMNS (app/store/[slug]/page.tsx) for the same
// reason (search overlay is on that page's nav too).
const PRODUCT_COLUMNS = "id, name, price, category, image_url, handle";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const title = `All Collections | ${seller.store_name}`;
  const description = `Browse every collection at ${seller.store_name}.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalStoreUrl(slug, "/collections") },
    openGraph: { title, description },
  };
}

export default async function CollectionsIndexPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

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

  // Resolve through the same private-template gate the main store page and
  // /c/<collection> use, so a raw `template` column value can't be used to
  // reach 4regn's private storefront from a seller who isn't allowed to
  // use it. This route is 4regn-only -- every other template sends the
  // visitor home.
  const tpl = resolveSellerTemplate(seller);
  if (tpl !== "4regn") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  // Real product rows are needed even though this page renders no product
  // grid itself -- catCount()/catImage() (used by every collection row)
  // scan the `products` array, so an empty list here silently zeroed out
  // every tile's count and image. Paginated via fetchAllRows since a seller
  // can have well over PostgREST's default 1000-row cap.
  const initialProducts = await fetchAllRows<any>(supabaseAdmin, "products", PRODUCT_COLUMNS, (q) =>
    q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published")
  );

  return (
    <FourRegn
      initialSeller={trimSellerTemplateConfigs(seller, tpl)}
      initialProducts={initialProducts}
      initialDiscountCodes={[]}
      mode="collections-index"
      isSubdomain={isSubdomain}
    />
  );
}
