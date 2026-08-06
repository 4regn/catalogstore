import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../lib/store-template-access";
import StoreUnavailable from "../StoreUnavailable";

export const revalidate = 60;

// 4regn-only route -- every other template links its collections straight
// off the homepage/nav and has no dedicated "all collections" index page.
const FourRegn = dynamic(() => import("../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";

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

  // Collection tiles only -- no product list needed for this page.
  return (
    <FourRegn
      initialSeller={seller}
      initialProducts={[]}
      initialDiscountCodes={[]}
      mode="collections-index"
      isSubdomain={isSubdomain}
    />
  );
}
