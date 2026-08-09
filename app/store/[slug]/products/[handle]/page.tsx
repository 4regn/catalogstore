import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import nextDynamic from "next/dynamic";
import type { Metadata, Viewport } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import { trimSellerTemplateConfigs } from "../../../../../lib/template-config";
import { descriptionToPlainText } from "../../../../../lib/description-plain-text";
import StoreUnavailable from "../../StoreUnavailable";

// Widened from 60 -- see app/store/[slug]/page.tsx's own comment on this
// same line for the full reasoning. This is the route real product-page
// traffic actually hits (SEO slug URLs), so it's the one where the
// cold-render latency was most visible.
export const revalidate = 3600;
// See app/store/[slug]/page.tsx's own comment on this same line for the
// full reasoning -- summary: without this, Vercel never registers a
// dynamic-segment route (no generateStaticParams possible here, sellers/
// products are DB-driven) as ISR-eligible at all, so `revalidate = 60`
// alone silently does nothing; confirmed via a live x-vercel-cache MISS on
// a repeat request. force-static chosen over an empty-array
// generateStaticParams to avoid its documented dynamicParams/404 footgun.
export const dynamic = "force-static";

// 4regn-only route -- every other template's product pages still live at
// /p/{uuid}; this handle-based route exists purely to match 4regn's real
// (Shopify-era, already Google-indexed) /products/{handle} URL format.
const FourRegn = nextDynamic(() => import("../../FourRegnStore"));

// Any seller who lands on this route but isn't actually on the 4regn
// template gets redirect()'d out below before anything renders, so this
// static viewport export is effectively 4regn-only in practice -- safe to
// set unconditionally here without touching the shared app/layout.tsx (used
// by every template + the whole marketing site) or app/store/[slug]/layout.tsx
// (still shared by every OTHER template's own routes). `viewportFit: "cover"`
// is required for the `env(safe-area-inset-*)` values FourRegnStore's
// lightbox CSS reads to report anything other than 0 on notch/Dynamic
// Island iPhones -- see the .fr-lb-close/.fr-lb-nav/.fr-lb-dots comment in
// FourRegnStore.tsx. Next.js merges this with the root layout's viewport
// (width/initialScale/themeColor/colorScheme survive; see mergeViewport in
// next/dist/lib/metadata/resolve-metadata.js), so nothing else changes.
export const viewport: Viewport = {
  viewportFit: "cover",
};

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Full columns for the single active product being viewed -- FourRegnStore's
// PDP render (initialActiveProduct) needs everything: description, the full
// images array, variants (size/option picker), old_price (sale price row).
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status, handle";
// "You Might Also Like" (relatedProducts in FourRegnStore.tsx) no longer
// has a server-side fetch here at all -- it now reads off the same lazy
// client-side catalog fetch the header/mobile-dock search overlay already
// does (see searchProducts in FourRegnStore.tsx), instead of a per-request
// query on this route. See initialProducts below for why.
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";
// Badges shown on the "You Might Also Like" ProductCard row (see
// FourRegnStore.tsx's getProductPromoBadge). starts_at/ends_at are selected
// only to filter the active window in JS (activePromoBadges below), not
// passed down to the client.
const PROMO_BADGE_COLUMNS = "label, scope, product_id, collection_name, starts_at, ends_at";

// Wrapped in React's cache() -- generateMetadata and the page component
// both need the seller row, and on this store's Nano-tier Supabase project
// (15 pooled DB connections total, confirmed against the dashboard) two
// separate sellers queries per single product-page view is real, avoidable
// pressure on an already tiny pool. cache() memoizes per request: whichever
// of the two calls this first, the other gets the same result with no
// second round trip. Selects the full SELLER_COLUMNS unconditionally (a
// couple more columns than generateMetadata alone needs) since sharing one
// query beats a byte-optimal one that can't be reused.
const getSeller = cache(async (slug: string) => {
  const { data } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();
  return data;
});

function activePromoBadges(rows: { label: string; scope: "product" | "collection"; product_id: string | null; collection_name: string | null; starts_at: string | null; ends_at: string | null }[] | null, nowIso: string) {
  return (rows || [])
    .filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso))
    .map(({ label, scope, product_id, collection_name }) => ({ label, scope, product_id, collection_name }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>;
}): Promise<Metadata> {
  const { slug, handle } = await params;

  const seller = await getSeller(slug);

  if (!seller) return { title: "Product not found" };

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("name, description, price, image_url")
    .eq("seller_id", seller.id)
    .eq("handle", handle)
    .maybeSingle();

  if (!product) return { title: "Product not found" };

  const storeName = seller.store_name || slug;
  const title = `${product.name} | ${storeName}`;
  const description = product.description
    ? descriptionToPlainText(product.description).substring(0, 160)
    : `Shop ${product.name} at ${storeName}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalStoreUrl(slug, `/products/${handle}`) },
    openGraph: {
      title,
      description,
      ...(product.image_url ? { images: [{ url: product.image_url }] } : {}),
    },
  };
}

export default async function ProductHandlePage({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>;
}) {
  const { slug, handle } = await params;

  const seller = await getSeller(slug);

  if (!seller) notFound();

  // Frozen store -- same "unavailable" page as the main storefront.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const isSubdomain = await isStoreSubdomainRequest();

  // Resolve through the same private-template gate every other 4regn-only
  // route uses, so a raw `template` column value can't be used to reach
  // 4regn's private storefront from a seller who isn't allowed to use it.
  const tpl = resolveSellerTemplate(seller);
  if (tpl !== "4regn") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  const nowIso = new Date().toISOString();
  const [productRes, discountsRes, promoBadgesRes] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("handle", handle)
      .eq("in_stock", true)
      .eq("status", "published")
      .maybeSingle(),
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

  const activeProduct = productRes.data;
  if (!activeProduct) notFound();

  // "You Might Also Like" no longer runs a server-side query at all --
  // two attempts at bounding it here (Promise.race, then a real
  // AbortController) both still left an unindexed ilike-OR scan across the
  // whole products table as the single most expensive thing this route
  // did on every view, and on a product tagged into several of this
  // store's broader collections that was still enough to blow the
  // serverless function's execution budget and 500 the entire page (still
  // reproducing after the AbortController fix deployed). FourRegnStore now
  // sources this row from the same lazy client-side catalog fetch search
  // already needed (see searchProducts' comment there) -- worst case is
  // the row popping in a beat late, not the page failing to load.
  const initialProducts: never[] = [];

  const initialDiscountCodes = discountsRes.data ?? [];

  // Same Product schema shape as /p/[productId]'s productJsonLd, just
  // pointed at the canonical /products/{handle} URL instead of /p/{uuid}.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: activeProduct.name,
    description: activeProduct.description ? descriptionToPlainText(activeProduct.description) : undefined,
    image: activeProduct.image_url || activeProduct.images?.[0] || undefined,
    brand: { "@type": "Brand", name: seller.store_name },
    url: canonicalStoreUrl(slug, `/products/${handle}`),
    offers: {
      "@type": "Offer",
      priceCurrency: "ZAR",
      price: activeProduct.price,
      availability: activeProduct.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: canonicalStoreUrl(slug, `/products/${handle}`),
    },
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <FourRegn
        initialSeller={trimSellerTemplateConfigs(seller, tpl)}
        initialProducts={initialProducts}
        initialDiscountCodes={initialDiscountCodes}
        initialPromoBadges={activePromoBadges(promoBadgesRes.data, nowIso)}
        mode="product"
        initialActiveProduct={activeProduct}
        isSubdomain={isSubdomain}
      />
    </>
  );
}
