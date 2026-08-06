import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import StoreUnavailable from "../../StoreUnavailable";
import type { Metadata } from "next";

export const revalidate = 60;

const SoftLuxury  = dynamic(() => import("../../SoftLuxuryStore"));
const GlassChrome = dynamic(() => import("../../GlassChromeStore"));
const Crown       = dynamic(() => import("../../CrownStore"));
const Heirloom    = dynamic(() => import("../../HeirloomStore"));
const FourRegn    = dynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status, handle";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";

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

  // Resolve through the same private-template gate the collection page and
  // main store page use, so a raw `template` column value can't be used to
  // reach 4regn's private storefront from a seller who isn't allowed to
  // use it.
  const tpl = resolveSellerTemplate(seller);

  // 4regn gets a real dedicated product page (mode="product" +
  // initialActiveProduct, no home grid underneath) instead of the slide-over
  // every other template still uses initialProductId for on this same route.
  if (tpl === "4regn") {
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
          mode="product"
          initialActiveProduct={activeProduct}
          isSubdomain={isSubdomain}
        />
      </>
    );
  }

  const props = { initialSeller: seller, initialProducts, initialDiscountCodes, initialProductId: productId, isSubdomain };
  const StoreComponent = tpl === "crown" ? Crown : (tpl === "glass-futuristic" || tpl === "glass-chrome") ? GlassChrome : tpl === "heirloom" ? Heirloom : SoftLuxury;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }} />
      <StoreComponent {...props} />
    </>
  );
}
