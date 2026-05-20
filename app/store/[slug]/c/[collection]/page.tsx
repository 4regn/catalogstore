import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../../../lib/supabase-admin";
import { getSeller } from "../../../../../lib/get-seller";

export const revalidate = 60;

// Heirloom is the only template that supports dedicated collection pages today.
// If a seller on another template ends up here (e.g. someone shared a deep link),
// fall back to the main storefront so they don't see a broken page.
const Heirloom = dynamic(() => import("../../HeirloomStore"));

const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names";

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");

const titleCase = (s: string) => s.split(/[-\s]+/).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");

// Per-seller per-collection metadata: same favicon/title treatment as the home page,
// but the page title includes the collection so customers see e.g. "Jackets · 4regn"
// in their browser tab and link previews.
export async function generateMetadata({ params }: { params: Promise<{ slug: string; collection: string }> }): Promise<Metadata> {
  const { slug, collection } = await params;
  const seller = await getSeller(slug);
  if (!seller) return {};
  const collLabel = collection.toLowerCase() === "all" ? "All Products" : titleCase(collection);
  const title = `${collLabel} · ${seller.store_name}`;
  const description = seller.tagline || seller.description || undefined;
  return {
    title,
    description,
    icons: seller.logo_url ? { icon: seller.logo_url, apple: seller.logo_url } : undefined,
    openGraph: {
      title,
      description,
      images: seller.logo_url ? [seller.logo_url] : undefined,
      type: "website",
    },
    twitter: {
      card: "summary",
      title,
      description,
      images: seller.logo_url ? [seller.logo_url] : undefined,
    },
  };
}

export default async function CollectionPage({
  params,
}: {
  params: Promise<{ slug: string; collection: string }>;
}) {
  const { slug, collection } = await params;

  const seller = await getSeller(slug);

  if (!seller) notFound();

  // Only Heirloom renders collection pages. Other templates send the visitor home.
  if (seller.template !== "heirloom") redirect(`/store/${slug}`);

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
      const cats = Array.from(new Set((distinctCats ?? []).map((r: { category: string }) => r.category).filter(Boolean)));
      matched = cats.find((c) => slugify(c) === collection.toLowerCase()) ?? null;
    }

    if (!matched) notFound();
  }

  // Pull only the products in this collection — saves bytes vs. loading all and filtering client-side.
  const productsQuery = supabaseAdmin
    .from("products")
    .select(PRODUCT_COLUMNS)
    .eq("seller_id", seller.id)
    .eq("in_stock", true)
    .eq("status", "published")
    .order("sort_order", { ascending: true });

  const [productsRes, discountsRes] = await Promise.all([
    isAll ? productsQuery : productsQuery.eq("category", matched!),
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
      collectionName={isAll ? "All Products" : matched!}
    />
  );
}
