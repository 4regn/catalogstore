import { NextRequest } from "next/server";
import { supabaseAdmin } from "../../../../lib/supabase-admin";

// Per-seller favicon proxy. Returns the seller's logo bytes from our own
// origin so iOS Safari (which is picky about cross-origin favicons) treats
// it as a same-origin <link rel="icon">.
//
// Referenced from app/store/[slug]/layout.tsx via metadata.icons.icon.
// On a fresh visit Next renders <link rel="icon" href="/store/<slug>/favicon">
// in <head>, the browser hits this route, we look up the seller, fetch the
// stored logo URL, and stream the bytes back with a long cache header.

export const revalidate = 3600;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> },
) {
  const { slug } = await params;

  const { data: seller } = await supabaseAdmin
    .from("sellers")
    .select("logo_url")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller?.logo_url) {
    // No logo set -- 404 lets the browser fall back to whatever else is
    // declared in <head> (in our case, the root /app/favicon.ico).
    return new Response(null, { status: 404 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(seller.logo_url, { cache: "force-cache" });
  } catch (err) {
    console.error("favicon proxy fetch failed:", err);
    return new Response(null, { status: 502 });
  }

  if (!upstream.ok) {
    return new Response(null, { status: upstream.status });
  }

  const body = await upstream.arrayBuffer();
  const contentType = upstream.headers.get("content-type") ?? "image/png";

  return new Response(body, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
}
