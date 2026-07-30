import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { cache } from "react";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../lib/store-host";
import { resolveSellerTemplate, UNIK_TEMPLATE_ID } from "../../../lib/store-template-access";
import { canonicalStoreUrl } from "../../../lib/store-url";
import StoreUnavailable from "./StoreUnavailable";

export const revalidate = 60;

const SoftLuxury  = dynamic(() => import("./SoftLuxuryStore"));
const GlassChrome = dynamic(() => import("./GlassChromeStore"));
const Crown       = dynamic(() => import("./CrownStore"));
const Heirloom    = dynamic(() => import("./HeirloomStore"));
const Rosefields  = dynamic(() => import("./RosefieldsStore"));
const Velour      = dynamic(() => import("./VelourStore"));
const UnikLabs    = dynamic(() => import("./UnikLabsStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";

// cache() dedupes this per-request so generateMetadata and the page body
// share one DB round trip instead of two.
const getSeller = cache(async (slug: string) => {
  const { data } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();
  return data;
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSeller(slug);
  if (!seller) return {};

  const description =
    seller.tagline || seller.description || `Shop ${seller.store_name}'s online store.`;
  const image = seller.logo_url || seller.banner_url;

  return {
    title: seller.store_name,
    description,
    alternates: { canonical: canonicalStoreUrl(slug) },
    openGraph: {
      type: "website",
      siteName: seller.store_name,
      title: seller.store_name,
      description,
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: "summary_large_image",
      title: seller.store_name,
      description,
      images: image ? [image] : undefined,
    },
  };
}

// Store-wide identity schema (not product-specific -- that lives on the
// product page itself). One of these per storefront, regardless of which
// template renders the body, so it's built once here rather than per branch.
function OrgJsonLd({ seller, slug }: { seller: { store_name: string; tagline: string | null; logo_url: string | null }; slug: string }) {
  const json = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    name: seller.store_name,
    description: seller.tagline || undefined,
    url: canonicalStoreUrl(slug),
    logo: seller.logo_url || undefined,
  };
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json) }} />;
}

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;

  const seller = await getSeller(slug);

  if (!seller) notFound();

  // Frozen store -- subscription expired or seller cancelled. Render a clean
  // "unavailable" page with the seller's contact info so customers can reach out.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const tpl = resolveSellerTemplate(seller);

  if (tpl === UNIK_TEMPLATE_ID) {
    return (
      <>
        <OrgJsonLd seller={seller} slug={slug} />
        <UnikLabs initialSeller={seller} />
      </>
    );
  }

  if (tpl === "velour") {
    const todayIso = new Date().toISOString().slice(0, 10);
    const [servicesRes, bookingsRes] = await Promise.all([
      supabaseAdmin
        .from("services")
        .select("id, category, name, price, media_url, media_type, sort_order")
        .eq("seller_id", seller.id)
        .order("sort_order", { ascending: true }),
      supabaseAdmin
        .from("bookings")
        .select("date, time_slot, status")
        .eq("seller_id", seller.id)
        .eq("status", "confirmed") // only confirmed bookings block a slot -- see /api/bookings/create
        .gte("date", todayIso),
    ]);
    const isSubdomain = await isStoreSubdomainRequest();
    return (
      <>
        <OrgJsonLd seller={seller} slug={slug} />
        <Velour
          initialSeller={seller}
          initialServices={servicesRes.data ?? []}
          initialBookings={bookingsRes.data ?? []}
          isSubdomain={isSubdomain}
        />
      </>
    );
  }

  const [productsRes, discountsRes] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("in_stock", true)
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    supabaseAdmin
      .from("discount_codes")
      .select(DISCOUNT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("active", true)
      .eq("show_countdown", true)
      .not("expires_at", "is", null),
  ]);

  const initialProducts = productsRes.data ?? [];
  const initialDiscountCodes = discountsRes.data ?? [];
  const isSubdomain = await isStoreSubdomainRequest();
  const props = { initialSeller: seller, initialProducts, initialDiscountCodes, isSubdomain };

  const StoreComponent =
    tpl === "crown" ? Crown :
    (tpl === "glass-futuristic" || tpl === "glass-chrome") ? GlassChrome :
    tpl === "heirloom" ? Heirloom :
    tpl === "rosefields" ? Rosefields :
    SoftLuxury;

  return (
    <>
      <OrgJsonLd seller={seller} slug={slug} />
      <StoreComponent {...props} />
    </>
  );
}
