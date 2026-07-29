import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../../lib/unik-partner";

export const dynamic = "force-dynamic";

const PRIVATE_BUCKET = "unik-private-designs";

/* Proxies a partner's own design image through our own origin so "Download"
   actually triggers a save dialog (a plain <a href> to a Supabase Storage
   URL is cross-origin, so the `download` attribute is unreliable across
   browsers) -- and, for the clean original, so it never has to be public:
   this route signs it server-side on each request instead of exposing
   private_artwork_path directly. `inline=1` is used by the Studio gallery
   to display the original at full quality without forcing a download. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  const url = new URL(req.url);
  const id = url.searchParams.get("id") || "";
  const type = url.searchParams.get("type") === "original" ? "original" : "mockup";
  const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
  if (!id) return NextResponse.json({ error: "Missing design id" }, { status: 400 });

  const admin = getAdmin();
  const { data: design } = await admin
    .from("unik_designs")
    .select("id, seller_id, auth_user_id, garment, colour, mockup_url, private_artwork_path")
    .eq("id", id)
    .maybeSingle();
  if (!design || design.seller_id !== seller.id || design.auth_user_id !== user.id) {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }

  let bytes: ArrayBuffer;
  let contentType: string;
  let filename: string;

  if (type === "original") {
    if (!design.private_artwork_path) return NextResponse.json({ error: "No original available" }, { status: 404 });
    const { data: signed, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(design.private_artwork_path, 60);
    if (error || !signed) return NextResponse.json({ error: "Could not access original" }, { status: 500 });
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return NextResponse.json({ error: "Could not fetch original" }, { status: 502 });
    bytes = await res.arrayBuffer();
    contentType = "image/png";
    filename = `unik-${design.garment}-${design.colour}-${id}.png`;
  } else {
    if (!design.mockup_url) return NextResponse.json({ error: "No mockup available" }, { status: 404 });
    const res = await fetch(design.mockup_url);
    if (!res.ok) return NextResponse.json({ error: "Could not fetch mockup" }, { status: 502 });
    bytes = await res.arrayBuffer();
    contentType = "image/jpeg";
    filename = `unik-${design.garment}-${design.colour}-${id}-mockup.jpg`;
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
