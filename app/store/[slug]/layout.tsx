import type { Metadata } from "next";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const revalidate = 60;

// Per-seller browser tab branding. Looks up the seller by subdomain and uses
// their logo as the favicon (with store name as the title fallback). Cascades
// to every child route under /store/[slug] -- storefront, collection pages,
// product pages, checkout -- so the seller's brand stays in the tab end-to-end.
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("store_name, logo_url, tagline")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) return {};

  return {
    title: seller.store_name,
    description: seller.tagline || `Shop ${seller.store_name} online`,
    icons: seller.logo_url
      ? { icon: [{ url: seller.logo_url }], shortcut: [{ url: seller.logo_url }], apple: [{ url: seller.logo_url }] }
      : undefined,
  };
}

export default function StoreLayout({ children }: { children: React.ReactNode }) {
  return children;
}
