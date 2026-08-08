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
    // template: null resets the root layout's title.template ("%s ·
    // CatalogStore") for this WHOLE subtree, not just this one layout's
    // own title -- every deeper seller page (home, products, collections,
    // policies, ...) provides its own plain-string title via its own
    // generateMetadata, and without this reset, Next still appends the
    // parent template to every one of them individually. Confirmed this
    // was live: every seller's storefront page, across the whole
    // platform, showed up in search results as "4regn · CatalogStore"
    // instead of just "4regn" -- platform branding diluting each seller's
    // own brand in their own search traffic. The platform's own marketing
    // pages (app/layout.tsx's routes, outside /store/[slug]) still want
    // that suffix; this only opts seller storefronts out of it.
    title: { absolute: seller.store_name, template: null },
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
