import type { Metadata } from "next";
import { supabaseAdmin } from "../../../lib/supabase-admin";
import { isStoreSubdomainRequest } from "../../../lib/store-host";

// Widened from 60 -- see app/store/[slug]/page.tsx's own comment on this
// same line for the full reasoning.
export const revalidate = 3600;
// See app/store/[slug]/page.tsx's own comment on this same line for the
// full reasoning -- summary: without this, Vercel never registers a
// dynamic-segment route (no generateStaticParams possible here, sellers
// are DB-driven) as ISR-eligible at all, so `revalidate = 60` alone
// silently does nothing; confirmed via a live x-vercel-cache MISS on a
// repeat request. force-static chosen over an empty-array
// generateStaticParams to avoid its documented dynamicParams/404 footgun.
export const dynamic = "force-static";

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
