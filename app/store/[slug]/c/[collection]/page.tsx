import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";

export const revalidate = 60;

// Heirloom is the only template that supports dedicated collection pages today.
// If a seller on another template ends up here (e.g. someone shared a deep link),
// fall back to the main storefront so they don't see a broken page.
const Heirloom = dynamic(() => import("../../HeirloomStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, checkout_config, subscription_status, trial_ends_at, payfast_subscription_token";
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string; collection: string }>;
}) {
  const { slug, collection } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();

  // Only Heirloom renders collection pages. Other templates send the visitor home.
  if (seller.template !== "heirloom") redirect(`/store/${slug}`);

  // Resolve the URL slug back to the seller's actual collection name (e.g. "rare-finds" -> "Rare Finds").
  const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
  const matched = collections.find((c) => slugify(c) === collection.toLowerCase());
  if (!matched) notFound();

  // Pull only the products in this collection — saves bytes vs. loading all and filtering client-side.
  const [productsRes, discountsRes] = await Promise.all([
    supabaseAdmin
      .from("products")
      .select(PRODUCT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("category", matched)
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

  return (
    <Heirloom
      initialSeller={seller}
      initialProducts={productsRes.data ?? []}
      initialDiscountCodes={discountsRes.data ?? []}
      mode="collection"
      collectionName={matched}
    />
  );
}
