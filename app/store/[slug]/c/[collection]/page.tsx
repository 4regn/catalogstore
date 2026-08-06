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

// Heirloom, Soft Luxury and 4regn support dedicated collection pages today.
// If a seller on another template ends up here (e.g. someone shared a deep
// link), fall back to the main storefront so they don't see a broken page.
const Heirloom = dynamic(() => import("../../HeirloomStore"));
const SoftLuxury = dynamic(() => import("../../SoftLuxuryStore"));
const FourRegn = dynamic(() => import("../../FourRegnStore"));

const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, template_configs, checkout_config, subscription_status, subscription_grace_until, trial_ends_at, payfast_subscription_token";
const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names, description";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string; collection: string }>;
}): Promise<Metadata> {
  const { slug, collection } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, collections")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const collections: string[] = Array.isArray(seller.collections) ? seller.collections : [];
  const isAll = collection.toLowerCase() === "all";
  const name = isAll ? "All Products" : (collections.find((c) => slugify(c) === collection.toLowerCase()) ?? collection);

  const title = `${name} | ${seller.store_name}`;
  const description = `Shop ${name} at ${seller.store_name}.`;

  return {
    title,
    description,
    alternates: { canonical: canonicalStoreUrl(slug, `/c/${collection}`) },
    openGraph: { title, description },
  };
}

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

  // Resolve through the same private-template gate the main store page uses,
  // so a raw `template` column value can't be used to reach 4regn's private
  // storefront from a seller who isn't allowed to use it.
  const tpl = resolveSellerTemplate(seller);

  // Only Heirloom, Soft Luxury and 4regn render collection pages. Other
  // templates send the visitor home.
  if (tpl !== "heirloom" && tpl !== "soft-luxury" && tpl !== "4regn") {
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
      const distinctCats = await fetchAllRows<{ category: string }>(supabaseAdmin, "products", "category", (q) =>
        q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published").not("category", "is", null)
      );
      const cats = Array.from(new Set(distinctCats.flatMap((r) => (r.category || "").split(",").map((c) => c.trim())).filter(Boolean)));
      matched = cats.find((c) => slugify(c) === collection.toLowerCase()) ?? null;
    }

    if (!matched) notFound();
  }

  const [initialProductsRaw, discountsRes] = await Promise.all([
    fetchAllRows<any>(supabaseAdmin, "products", PRODUCT_COLUMNS, (q) => {
      const base = q.eq("seller_id", seller.id).eq("in_stock", true).eq("status", "published").order("sort_order", { ascending: true });
      return isAll ? base : base.like("category", `%${matched!}%`);
    }),
    supabaseAdmin
      .from("discount_codes")
      .select(DISCOUNT_COLUMNS)
      .eq("seller_id", seller.id)
      .eq("active", true)
      .eq("show_countdown", true)
      .not("expires_at", "is", null),
  ]);

  const collectionProducts = isAll
    ? initialProductsRaw
    : initialProductsRaw.filter((p: any) =>
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

  if (tpl === "soft-luxury") return <SoftLuxury {...props} />;
  if (tpl === "4regn") return <FourRegn {...props} />;
  return <Heirloom {...props} />;
}
