import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

const PRIVATE_BUCKET = "unik-private-designs";
type DownloadType = "original" | "original-back" | "mockup" | "mockup-back";

/* Brand-manager twin of /api/unik/partners/studio/download -- same
   proxy-through-our-origin approach (real Content-Disposition, private
   original signed server-side per request rather than exposed directly),
   but scoped to ANY customer's design rather than a partner's own, and
   covering both AI Studio and Custom Upload (which can have a second,
   back-side artwork/mockup -- see options.back_artwork_path/
   mockup_back_url in unik_designs). customerId is required and checked
   against the design's own auth_user_id so a design can't be pulled by
   guessing its id alone. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const url = new URL(req.url);
  const designId = url.searchParams.get("designId") || "";
  const customerId = url.searchParams.get("customerId") || "";
  const type = (url.searchParams.get("type") || "mockup") as DownloadType;
  const disposition = url.searchParams.get("inline") === "1" ? "inline" : "attachment";
  if (!designId || !customerId) return NextResponse.json({ error: "Missing designId or customerId" }, { status: 400 });
  if (!["original", "original-back", "mockup", "mockup-back"].includes(type)) {
    return NextResponse.json({ error: "Invalid type" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: design } = await admin
    .from("unik_designs")
    .select("id, seller_id, auth_user_id, garment, colour, options, mockup_url, private_artwork_path")
    .eq("id", designId)
    .maybeSingle();
  if (!design || design.seller_id !== seller.id || design.auth_user_id !== customerId) {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }

  let bytes: ArrayBuffer;
  let contentType: string;
  let filename: string;
  const options = (design.options as any) || {};

  if (type === "original" || type === "original-back") {
    const path = type === "original" ? design.private_artwork_path : options.back_artwork_path;
    if (!path) return NextResponse.json({ error: "No original available" }, { status: 404 });
    const { data: signed, error } = await admin.storage.from(PRIVATE_BUCKET).createSignedUrl(path, 60);
    if (error || !signed) return NextResponse.json({ error: "Could not access original" }, { status: 500 });
    const res = await fetch(signed.signedUrl);
    if (!res.ok) return NextResponse.json({ error: "Could not fetch original" }, { status: 502 });
    bytes = await res.arrayBuffer();
    contentType = "image/png";
    filename = `unik-${design.garment}-${design.colour}-${designId}${type === "original-back" ? "-back" : ""}.png`;
  } else {
    const mockupUrl = type === "mockup" ? design.mockup_url : options.mockup_back_url;
    if (!mockupUrl) return NextResponse.json({ error: "No mockup available" }, { status: 404 });
    const res = await fetch(mockupUrl);
    if (!res.ok) return NextResponse.json({ error: "Could not fetch mockup" }, { status: 502 });
    bytes = await res.arrayBuffer();
    contentType = "image/jpeg";
    filename = `unik-${design.garment}-${design.colour}-${designId}${type === "mockup-back" ? "-back" : ""}-mockup.jpg`;
  }

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `${disposition}; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
