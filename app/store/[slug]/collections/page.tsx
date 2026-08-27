import { notFound, permanentRedirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../lib/store-host";
import { canonicalStoreUrlForRequest } from "../../../../lib/store-canonical-server";
import { resolveSellerTemplate } from "../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../lib/template-config";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";
import StoreUnavailable from "../StoreUnavailable";

// Widened from 60 -- see app/store/[slug]/page.tsx's own comment on this
// same line for the full reasoning.
export const revalidate = 3600;
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
  "id, store_name, whatsapp_number, subdomain, custom_domain, custom_domain_status, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// The index tiles only need these three fields. Search now loads its richer
// catalogue lazily when the overlay is opened, matching the homepage, so
// browsing /collections no longer serializes names/prices/handles for the
// seller's entire catalogue into the initial page payload.
const PRODUCT_COLUMNS = "id, category, image_url";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, custom_domain, custom_domain_status")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const title = `All Collections | ${seller.store_name}`;
  const description = `Browse every collection at ${seller.store_name}.`;
  const canonical = canonicalStoreUrlForRequest(slug, seller.custom_domain, seller.custom_domain_status, "/collections");

  return {
    title,
    description,
    alternates: { canonical },
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
    permanentRedirect(isSubdomain ? "/collections/all" : `/store/${slug}/collections/all`);
  }

  // Real product rows are needed even though this page renders no product
  // grid itself -- catCount()/catImage() (used by every collection row)
  // scan the `products` array, so an empty list here silently zeroed out
  // every tile's count and image. Paginated via fetchAllRows since a seller
  // can have well over PostgREST's default 1000-row cap.
  // Not gated on in_stock -- see products/[handle]/page.tsx's identical
  // comment; this route is 4regn-only, so the exemption applies
  // unconditionally. A sold-out product still counting toward its
  // collection's tile count/cover image here is consistent with it still
  // being browsable on that collection's own page.
  const initialProducts = await fetchAllRows<any>(supabaseAdmin, "products", PRODUCT_COLUMNS, (q) =>
    q.eq("seller_id", seller.id).eq("status", "published")
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
