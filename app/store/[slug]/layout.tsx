import type { Metadata } from "next";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../lib/store-host";

export const revalidate = 60;

// Per-seller browser tab branding. Title + description come from the seller
// row; the favicon is declared as a same-origin URL pointing at
// /store/[slug]/favicon (route handler at ./favicon/route.ts), which proxies
// the seller's logo bytes through our origin.
//
// Same-origin matters: cross-origin <link rel="icon" href="https://...supabase.co/...">
// is unreliable on iOS Safari -- it just falls back to the empty-favicon globe.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, tagline, logo_url")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  const meta: Metadata = {
    title: seller.store_name,
    description: seller.tagline || `Shop ${seller.store_name} online`,
  };

  if (seller.logo_url) {
    const isSubdomain = await isStoreSubdomainRequest();
    const url = isSubdomain ? "/favicon" : `/store/${slug}/favicon`;
    meta.icons = {
      icon: [{ url }],
      shortcut: [{ url }],
      apple: [{ url }],
    };
  }

  return meta;
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
