import { notFound } from "next/navigation";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { getSeller } from "../../../lib/get-seller";

export const revalidate = 60;

const SoftLuxury  = dynamic(() => import("./SoftLuxuryStore"));
const GlassChrome = dynamic(() => import("./GlassChromeStore"));
const Crown       = dynamic(() => import("./CrownStore"));
const Heirloom    = dynamic(() => import("./HeirloomStore"));

const PRODUCT_COLUMNS =
  "id, name, price, old_price, category, image_url, images, variants, in_stock, description, sort_order, created_at, status";
const DISCOUNT_COLUMNS =
  "code, type, value, applies_to, expires_at, product_ids, collection_names";

// Per-seller browser-tab metadata: the seller's name becomes the page title and their
// logo becomes the favicon, so each store feels like its own brand instead of
// catalogstore's. Falls back to the platform defaults if a seller hasn't uploaded a logo.
export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSeller(slug);
  if (!seller) return {};
  const title = seller.store_name;
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

export default async function StorePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const seller = await getSeller(slug);
  if (!seller) notFound();

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
  const props = { initialSeller: seller, initialProducts, initialDiscountCodes };

  const tpl = seller.template;
  if (tpl === "crown") return <Crown {...props} />;
  if (tpl === "glass-futuristic" || tpl === "glass-chrome") return <GlassChrome {...props} />;
  if (tpl === "heirloom") return <Heirloom {...props} />;
  return <SoftLuxury {...props} />;
}
