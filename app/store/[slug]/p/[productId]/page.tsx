import { notFound } from "next/navigation";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import StoreUnavailable from "../../StoreUnavailable";
import type { Metadata } from "next";

export const revalidate = 60;

const SoftLuxury  = dynamic(() => import("../../SoftLuxuryStore"));
const GlassChrome = dynamic(() => import("../../GlassChromeStore"));
const Crown       = dynamic(() => import("../../CrownStore"));
const Heirloom    = dynamic(() => import("../../HeirloomStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
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
  const props = { initialSeller: seller, initialProducts, initialDiscountCodes, initialProductId: productId, isSubdomain };

  const tpl = seller.template;
  if (tpl === "crown") return <Crown {...props} />;
  if (tpl === "glass-futuristic" || tpl === "glass-chrome") return <GlassChrome {...props} />;
  if (tpl === "heirloom") return <Heirloom {...props} />;
  return <SoftLuxury {...props} />;
}
