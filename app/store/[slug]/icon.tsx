import { supabaseAdmin } from "../../../lib/supabase-admin";

// File-based dynamic icon for /store/[slug]. Sits at the storefront segment so
// Next.js emits a per-seller <link rel="icon">, which overrides the root
// /app/favicon.ico + /app/icon.png. Proxies the seller's logo bytes through
// our origin so the browser treats it as a same-origin favicon (avoids
// some iOS cross-origin caching weirdness).

export const size = { width: 64, height: 64 };
export const contentType = "image/png";

// Re-fetch the seller hourly. The page itself revalidates every 60s, but the
// icon doesn't need to be that fresh -- it's just the logo, which barely changes.
export const revalidate = 3600;

export default async function Icon({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("logo_url")
    .eq("subdomain", slug)
    .maybeSingle();

  // No seller or no logo -- 404 so Next falls back to the parent's icon.
  if (!seller?.logo_url) {
    return new Response(null, { status: 404 });
  }

  const upstream = await fetch(seller.logo_url, { cache: "force-cache" });
  if (!upstream.ok) {
    return new Response(null, { status: 404 });
  }

  const body = await upstream.arrayBuffer();
  const ct = upstream.headers.get("content-type") ?? "image/png";

  return new Response(body, {
    headers: {
      "Content-Type": ct,
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
