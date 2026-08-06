import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import { fetchAllRows } from "../../../../../lib/fetch-all-rows";
import StoreUnavailable from "../../StoreUnavailable";
import type { Metadata, Viewport } from "next";

export const revalidate = 60;

const SoftLuxury  = dynamic(() => import("../../SoftLuxuryStore"));
const GlassChrome = dynamic(() => import("../../GlassChromeStore"));
const Crown       = dynamic(() => import("../../CrownStore"));
const Heirloom    = dynamic(() => import("../../HeirloomStore"));
const FourRegn    = dynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Full columns minus `status` -- every non-4regn template still renders
// this route as its own grid-plus-slide-over page (StoreComponent below
// gets the whole `initialProducts` list, not just one product), and none
// of them (Crown/GlassChrome/Heirloom/SoftLuxury -- traced each `interface
// Product` + render path) read `status` client-side; it's only ever a
// query filter (.eq("status","published") below, which PostgREST applies
// independent of the SELECT list). `handle` stays selected -- unlike
// `status`, it's also read directly by THIS ROUTE's own code, not just a
// client component: this same constant fetches the single active-product
// row on the 4regn branch below, and that branch checks
// `activeProduct.handle` to decide whether to redirect to the canonical
// /products/{handle} page, so dropping it would break that redirect.
// created_at stays for Heirloom/SoftLuxury's Newest/Oldest sort.
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, handle";
// 4regn-only: a SEPARATE fetch of the whole catalog, used only for
// FourRegnStore's "You Might Also Like" row (relatedProducts: category
// match, excludes the current product, caps at 8, rendered via ProductCard)
// plus the header/mobile-dock search overlay (unconditional on every page,
// reads off this same `products` client state). Same trace/reasoning as
// RELATED_PRODUCT_COLUMNS in ../../products/[handle]/page.tsx: ProductCard's
// current render (no client-side variant picker on the card, just
// goToProduct navigation) needs id/name/price/old_price(sale badge)/
// image_url/handle; the category filter itself only needs `category`; the
// search overlay needs id/name/price/category/image_url/handle. Union of
// both is this set -- images/variants/in_stock/description/sort_order/
// created_at are never read by either.
const RELATED_PRODUCT_COLUMNS = "id, name, price, old_price, category, image_url, handle";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";
// 4regn only -- badges shown on the "You Might Also Like" ProductCard row
// (see FourRegnStore.tsx's getProductPromoBadge). starts_at/ends_at are
// selected only to filter the active window in JS (activePromoBadges below),
// not passed down to the client.
const PROMO_BADGE_COLUMNS = "label, scope, product_id, collection_name, starts_at, ends_at";

function activePromoBadges(rows: { label: string; scope: "product" | "collection"; product_id: string | null; collection_name: string | null; starts_at: string | null; ends_at: string | null }[] | null, nowIso: string) {
  return (rows || [])
    .filter((r) => (!r.starts_at || r.starts_at <= nowIso) && (!r.ends_at || r.ends_at >= nowIso))
    .map(({ label, scope, product_id, collection_name }) => ({ label, scope, product_id, collection_name }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; productId: string }> }): Promise<Metadata> {
  const { slug, productId } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, store_config")
    .eq("subdomain", slug)
    .maybeSingle();

  const { data: product } = await supabaseAdmin
    .from("products")
    .select("name, description, price, image_url")
    .eq("id", productId)
    .maybeSingle();

  if (!seller || !product) return { title: "Product not found" };

  const storeName = seller.store_name || slug;
  const title = `${product.name} | ${storeName}`;
  const description = product.description
    ? product.description.substring(0, 160)
    : `Shop ${product.name} at ${storeName}`;

  return {
    title,
    description,
    alternates: { canonical: canonicalStoreUrl(slug, `/p/${productId}`) },
    openGraph: {
      title,
      description,
      ...(product.image_url ? { images: [{ url: product.image_url }] } : {}),
    },
  };
}

// Unlike ../../products/[handle]/page.tsx (a 4regn-only route where a static
// `viewport` export is always correct), this route is still shared by every
// other template's own full grid+slide-over render -- see the `tpl ===
// "4regn"` branch below vs. the fallback further down. `viewportFit: "cover"`
// is only wanted for 4regn's dedicated PDP render, whose lightbox CSS reads
// `env(safe-area-inset-*)` (see FourRegnStore.tsx's .fr-lb-close comment);
// setting it for every template would extend every OTHER template's fixed
// nav/overlays under the notch/Dynamic Island too, most of which have no
// safe-area padding of their own to compensate -- a real regression risk we
// don't want to take on for templates that were never reported broken. A
// `generateViewport` (rather than a static `viewport` export) lets this
// resolve per-request off the seller's actual template instead. Returning
// `{}` for every other template means "no override" -- it merges onto (and
// doesn't touch) the root layout's viewport untouched, per Next's
// mergeViewport (only keys present in this object are overridden).
export async function generateViewport({ params }: { params: Promise<{ slug: string; productId: string }> }): Promise<Viewport> {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("template, subdomain")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const tpl = resolveSellerTemplate(seller);
  return tpl === "4regn" ? { viewportFit: "cover" } : {};
}

export default async function ProductPage({ params }: { params: Promise<{ slug: string; productId: string }> }) {
  const { slug, productId } = await params;

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

  // Resolve through the same private-template gate the collection page and
  // main store page use, so a raw `template` column value can't be used to
  // reach 4regn's private storefront from a seller who isn't allowed to
  // use it. Resolved up front (rather than after the product fetch, as
  // before) so the fetch strategy itself can branch on it below.
  const tpl = resolveSellerTemplate(seller);

  // 4regn gets a real dedicated product page (mode="product" +
  // initialActiveProduct, no home grid underneath) instead of the slide-over
  // every other template still uses initialProductId for on this same route.
  // Unlike every other template (which needs the full, full-column product
  // list below to render its own grid+slide-over page), 4regn only ever
  // needs ONE full-column row (the product itself) plus a narrow-column
  // catalog-wide list for "You Might Also Like" -- see RELATED_PRODUCT_COLUMNS
  // above -- so it gets its own two-fetch path instead of sharing the
  // single full-catalog-then-find query below.
  if (tpl === "4regn") {
    const nowIso = new Date().toISOString();
    const [productRes, initialProducts, discountsRes, promoBadgesRes] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select(PRODUCT_COLUMNS)
        .eq("seller_id", seller.id)
        .eq("id", productId)
        .eq("in_stock", true)
        .eq("status", "published")
        .maybeSingle(),
      // Full product list, narrow columns, paginated -- same pattern
      // ../../products/[handle]/page.tsx uses for the identical "You Might
      // Also Like" need.
      fetchAllRows<any>(supabaseAdmin, "products", RELATED_PRODUCT_COLUMNS, (q) =>
        q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true })
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

    const activeProduct = productRes.data;
    // A dedicated product page with nothing to show for a bad/expired id no
    // longer makes sense once 4regn renders a real page here instead of a
    // slide-over on top of the homepage (which used to just silently fall
    // back to home with nothing open).
    if (!activeProduct) notFound();

    const initialDiscountCodes = discountsRes.data ?? [];

    // Product schema, sourced from the same row already fetched for the page
    // body -- gives Google a price/availability/image it can surface directly
    // in search results instead of guessing from visible text.
    const productJsonLd = {
      "@context": "https://schema.org",
      "@type": "Product",
      name: activeProduct.name,
      description: activeProduct.description || undefined,
      image: activeProduct.image_url || activeProduct.images?.[0] || undefined,
      url: canonicalStoreUrl(slug, `/p/${productId}`),
      offers: {
        "@type": "Offer",
        priceCurrency: "ZAR",
        price: activeProduct.price,
        availability: activeProduct.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
        url: canonicalStoreUrl(slug, `/p/${productId}`),
      },
    };

    // Once a product has a real handle (via the handle backfill), /p/{uuid}
    // is a legacy URL for it -- send visitors on to the canonical
    // /products/{handle} page instead of rendering the UUID route directly,
    // so there's exactly one indexable URL per product. A product with no
    // handle yet (e.g. one created directly on the platform before the next
    // backfill run) falls through to the direct render below exactly as it
    // works today -- this is a defensive fallback, not a new page.
    if (activeProduct.handle) {
      redirect(isSubdomain ? `/products/${activeProduct.handle}` : `/store/${slug}/products/${activeProduct.handle}`);
    }
    return (
      <>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
        <FourRegn
          initialSeller={seller}
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

  const activeProduct = initialProducts.find((p: { id: string }) => p.id === productId);
  // A dedicated product page with nothing to show for a bad/expired id no
  // longer makes sense once 4regn renders a real page here instead of a
  // slide-over on top of the homepage (which used to just silently fall
  // back to home with nothing open).
  if (!activeProduct) notFound();

  // Product schema, sourced from the same row already fetched for the page
  // body -- gives Google a price/availability/image it can surface directly
  // in search results instead of guessing from visible text.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: activeProduct.name,
    description: activeProduct.description || undefined,
    image: activeProduct.image_url || activeProduct.images?.[0] || undefined,
    url: canonicalStoreUrl(slug, `/p/${productId}`),
    offers: {
      "@type": "Offer",
      priceCurrency: "ZAR",
      price: activeProduct.price,
      availability: activeProduct.in_stock ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      url: canonicalStoreUrl(slug, `/p/${productId}`),
    },
  };

  const props = { initialSeller: seller, initialProducts, initialDiscountCodes, initialProductId: productId, isSubdomain };
  const StoreComponent = tpl === "crown" ? Crown : (tpl === "glass-futuristic" || tpl === "glass-chrome") ? GlassChrome : tpl === "heirloom" ? Heirloom : SoftLuxury;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <StoreComponent {...props} />
    </>
  );
}
