import { notFound, redirect } from "next/navigation";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../../../lib/store-host";
import StoreUnavailable from "../../StoreUnavailable";

export const revalidate = 60;

// Heirloom and Soft Luxury support dedicated collection pages today. If a
// seller on another template ends up here (e.g. someone shared a deep
// link), fall back to the main storefront so they don't see a broken page.
const Heirloom = dynamic(() => import("../../HeirloomStore"));
const SoftLuxury = dynamic(() => import("../../SoftLuxuryStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";

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

  // Frozen store -- same "unavailable" page as the main storefront.
  if (seller.subscription_status === "expired" || seller.subscription_status === "cancelled") {
    return <StoreUnavailable seller={seller} />;
  }

  const isSubdomain = await isStoreSubdomainRequest();

  // Only Heirloom and Soft Luxury render collection pages. Other templates
  // send the visitor home.
  if (seller.template !== "heirloom" && seller.template !== "soft-luxury") {
    redirect(isSubdomain ? "/" : `/store/${slug}`);
  }

  // Special-case "all": render every published in-stock product without a category filter.
  const isAll = collection.toLowerCase() === "all";

  // For named collections, accept the URL slug if it matches EITHER the seller's explicit
  // collections list OR a category that's actually used on a product. The dashboard doesn't
  // always sync product.category back into seller.collections (e.g. CSV import), so checking
  // both prevents 404s on collections the seller can clearly see in their menu.
  let matched: string | null = null;
  if (!isAll) {
    const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
    matched = collections.find((c) => slugify(c) === collection.toLowerCase()) ?? null;

    if (!matched) {
      const { data: distinctCats } = await supabaseAdmin
        .from("products")
        .select("category")
        .eq("seller_id", seller.id)
        .eq("in_stock", true)
        .eq("status", "published")
        .not("category", "is", null);
      const cats = Array.from(new Set((distinctCats ?? []).flatMap((r: { category: string }) => (r.category || "").split(",").map((c) => c.trim())).filter(Boolean)));
      matched = cats.find((c) => slugify(c) === collection.toLowerCase()) ?? null;
    }

    if (!matched) notFound();
  }

  const productsQuery = supabaseAdmin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("seller_id", seller.id)
    .eq("in_stock", true)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  const [productsRes, discountsRes] = await Promise.all([
    isAll
      ? productsQuery
      : productsQuery.like("category", `%${matched!}%`),
    supabaseAdmin
      .from("discount_codes")
      .select(DISCOUNT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("active", true)
      .eq("show_countdown", true)
      .not("expires_at", "is", null),
  ]);

  const collectionProducts = isAll
    ? (productsRes.data ?? [])
    : (productsRes.data ?? []).filter((p: any) =>
        (p.category || "").split(",").map((c: string) => c.trim()).includes(matched!)
      );

  const props = {
    initialSeller: seller,
    initialProducts: collectionProducts,
    initialDiscountCodes: discountsRes.data ?? [],
    mode: "collection" as const,
    collectionName: isAll ? "All Products" : matched!,
    isSubdomain,
  };

  if (seller.template === "soft-luxury") return <SoftLuxury {...props} />;
  return <Heirloom {...props} />;
}
