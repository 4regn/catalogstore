import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../../lib/unik-partner";

export const dynamic = "force-dynamic";

const PRIVATE_BUCKET = "unik-private-designs";

async function toDataUrl(bytes: ArrayBuffer, mime: string): Promise<string> {
  return `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
}

/* Everything the recap builder (recap.html) needs to prefill itself for one
   of a partner's own generations, as one same-origin JSON response -- no
   manual re-picking of files, no CORS concerns fetching Supabase Storage
   URLs directly from the iframe. The parent Studio tab fetches this once,
   then postMessages it straight into the recap.html iframe. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return NextResponse.json({ error: "Missing design id" }, { status: 400 });

  const admin = getAdmin();
  const { data: design } = await admin
    .from("unik_designs")
    .select("id, seller_id, auth_user_id, owner_role, garment, colour, size, style, name, options, mockup_url, private_artwork_path")
    .eq("id", id)
    .maybeSingle();
  if (!design || design.seller_id !== seller.id || design.auth_user_id !== user.id || design.owner_role !== "partner") {
    return NextResponse.json({ error: "Design not found" }, { status: 404 });
  }

  const options = (design.options as any) || {};
  const [mockupRes, designSigned] = await Promise.all([
    design.mockup_url ? fetch(design.mockup_url) : Promise.resolve(null),
    design.private_artwork_path ? admin.storage.from(PRIVATE_BUCKET).createSignedUrl(design.private_artwork_path, 60) : Promise.resolve({ data: null, error: null }),
  ]);
  const [mockup, designImg] = await Promise.all([
    mockupRes && mockupRes.ok ? toDataUrl(await mockupRes.arrayBuffer(), "image/jpeg") : null,
    designSigned?.data ? fetch(designSigned.data.signedUrl).then((r) => (r.ok ? r.arrayBuffer() : null)).then((b) => (b ? toDataUrl(b, "image/png") : null)) : null,
  ]);

  return NextResponse.json({
    garment: design.garment,
    colour: design.colour,
    size: design.size,
    styleId: design.style,
    name: design.name,
    tagline: options.tagline || "",
    photos: Array.isArray(options.refPhotos) ? options.refPhotos : [],
    mockup,
    design: designImg,
  }, { headers: { "Cache-Control": "private, no-store" } });
}
