import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import type { Metadata } from "next";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import { canonicalStoreUrl } from "../../../../../lib/store-url";
import { resolveSellerTemplate } from "../../../../../lib/store-template-access";
import { fetchAllRows } from "../../../../../lib/fetch-all-rows";
import StoreUnavailable from "../../StoreUnavailable";

export const revalidate = 60;

// 4regn-only route -- every other template's product pages still live at
// /p/{uuid}; this handle-based route exists purely to match 4regn's real
// (Shopify-era, already Google-indexed) /products/{handle} URL format.
const FourRegn = dynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
// Same columns app/store/[slug]/p/[productId]/page.tsx selects, plus
// `handle` -- needed for FourRegnStore's breadcrumb/related-products/
// goToProduct logic, which links off a product's handle when one is set.
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status, handle";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; handle: string }>;
}): Promise<Metadata> {
  const { slug, handle } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("id, store_name")
    .eq("subdomain", slug)
    .maybeSingle();

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
    ? product.description.substring(0, 160)
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

  // Resolve through the same private-template gate every other 4regn-only
  // route uses, so a raw `template` column value can't be used to reach
  // 4regn's private storefront from a seller who isn't allowed to use it.
  const tpl = resolveSellerTemplate(seller);
  if (tpl !== "4regn") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  const [productRes, initialProducts, discountsRes] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("handle", handle)
      .eq("in_stock", true)
      .eq("status", "published")
      .maybeSingle(),
    // Full product list -- same paginated pattern c/[collection]/page.tsx
    // uses -- so "You Might Also Like" has real data to draw from.
    fetchAllRows<any>(supabaseAdmin, "products", PRODUCT_COLUMNS, (q) =>
      q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true })
    ),
    supabaseAdmin
      .from("discount_codes")
      .select(DISCOUNT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("active", true)
      .eq("show_countdown", true)
      .not("expires_at", "is", null),
  ]);

  const activeProduct = productRes.data;
  if (!activeProduct) notFound();

  const initialDiscountCodes = discountsRes.data ?? [];

  // Same Product schema shape as /p/[productId]'s productJsonLd, just
  // pointed at the canonical /products/{handle} URL instead of /p/{uuid}.
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: activeProduct.name,
    description: activeProduct.description || undefined,
    image: activeProduct.image_url || activeProduct.images?.[0] || undefined,
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
