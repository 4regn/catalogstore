import { notFound, permanentRedirect } from "next/navigation";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrlForRequest } from "../../../../../lib/store-canonical-server";
import StoreUnavailable from "../../StoreUnavailable";

export const dynamic = "force-dynamic";

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, custom_domain, custom_domain_status, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";

const slugify = (value: string) =>
  value.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

export async function generateMetadata({ params }: { params: Promise<{ slug: string; collection: string }> }): Promise<Metadata> {
  const { slug, collection } = await params;
  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, collections, custom_domain, custom_domain_status")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};
  const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
  const name = collection.toLowerCase() === "all"
    ? "All Products"
    : collections.find((value) => slugify(value) === collection.toLowerCase()) ?? collection;
  const title = `${name} | ${seller.store_name}`;
  const description = `Shop ${name} at ${seller.store_name}.`;
  const canonical = canonicalStoreUrlForRequest(slug, seller.custom_domain, seller.custom_domain_status, `/collections/${collection}`);

  return {
    title,
    description,
    alternates: { canonical },
    robots: { index: false, follow: true },
  };
}

// Keep every historical /c/... link working, but consolidate it into the
// descriptive canonical URL used by every storefront and its sitemap.
export default async function LegacyCollectionPage({ params }: { params: Promise<{ slug: string; collection: string }> }) {
  const { slug, collection } = await params;
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
  permanentRedirect(isSubdomain ? `/collections/${collection}` : `/store/${slug}/collections/${collection}`);
}
