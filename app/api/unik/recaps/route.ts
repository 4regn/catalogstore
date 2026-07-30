import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireUnikRecapCreator } from "../../../../lib/unik-recap-auth";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const BUCKET = "store-assets";
const MAX_IMAGE_BASE64_LEN = 6_000_000; // ~4.5MB decoded, generous for a compressed photo

function decodeDataUrl(raw: unknown): { base64: string; ext: string; contentType: string } | null {
  if (typeof raw !== "string" || !raw) return null;
  const match = raw.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match) return null;
  const base64 = match[2];
  if (base64.length > MAX_IMAGE_BASE64_LEN) return null;
  const ext = match[1] === "jpg" ? "jpeg" : match[1];
  return { base64, ext, contentType: `image/${ext}` };
}

async function uploadImage(admin: ReturnType<typeof getAdmin>, path: string, dataUrl: unknown): Promise<string | null> {
  const decoded = decodeDataUrl(dataUrl);
  if (!decoded) return null;
  const fullPath = `${path}.${decoded.ext}`;
  const { error } = await admin.storage.from(BUCKET).upload(fullPath, Buffer.from(decoded.base64, "base64"), { contentType: decoded.contentType, upsert: true });
  if (error) { console.error("unik recap image upload failed:", error); return null; }
  return admin.storage.from(BUCKET).getPublicUrl(fullPath).data.publicUrl;
}

function recapShape(row: any) {
  return {
    id: row.id,
    flavor: row.flavor,
    garment: row.garment,
    colour: row.colour,
    size: row.size,
    name: row.name,
    tagline: row.tagline,
    styleId: row.style_id,
    photoUrls: row.photo_urls || [],
    designUrl: row.design_url,
    designBackUrl: row.design_back_url,
    mockupUrl: row.mockup_url,
    createdByRole: row.created_by_role,
    createdAt: row.created_at,
  };
}

/* Saved recaps -- lets a Brand Manager or Partner reload a finished recap
   later (garment/colour/size/name/tagline/style + every image it used)
   instead of redoing the whole setup if they forgot to export/screen-
   record it the first time. Shared per-seller library, not per-creator:
   either role can browse and reload anything saved here. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikRecapCreator(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const flavor = req.nextUrl.searchParams.get("flavor");
  let query = getAdmin().from("unik_recaps").select("*").eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(60);
  if (flavor === "ai-studio" || flavor === "custom-upload") query = query.eq("flavor", flavor);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ recaps: (data || []).map(recapShape) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("unik-recaps-save:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await requireUnikRecapCreator(req);
  if ("response" in auth) return auth.response;
  const { seller, role, creatorId } = auth;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const flavor = body.flavor === "custom-upload" ? "custom-upload" : "ai-studio";
  const garment = String(body.garment || "").trim().slice(0, 20).toLowerCase();
  const colour = String(body.colour || "").trim().slice(0, 20).toLowerCase();
  const size = String(body.size || "").trim().slice(0, 8).toUpperCase();
  if (!garment || !colour || !size) return NextResponse.json({ error: "Missing garment, colour or size" }, { status: 400 });

  const name = flavor === "ai-studio" ? String(body.name || "").trim().slice(0, 80) : null;
  const tagline = flavor === "ai-studio" ? String(body.tagline || "").trim().slice(0, 100) : null;
  const styleId = flavor === "ai-studio" ? String(body.styleId || "").trim().slice(0, 40).toUpperCase() : null;
  if (flavor === "ai-studio" && !name) return NextResponse.json({ error: "Missing name" }, { status: 400 });

  const photos: string[] = flavor === "ai-studio" && Array.isArray(body.photos) ? body.photos.slice(0, 5) : [];
  if (flavor === "ai-studio" && !photos.length) return NextResponse.json({ error: "Missing photos" }, { status: 400 });
  if (!body.design) return NextResponse.json({ error: "Missing design image" }, { status: 400 });
  if (flavor === "ai-studio" && !body.mockup) return NextResponse.json({ error: "Missing mockup image" }, { status: 400 });

  const admin = getAdmin();
  const recapId = crypto.randomUUID();
  const base = `unik-recaps/${seller.id}/${recapId}`;

  const [photoUrls, designUrl, designBackUrl, mockupUrl] = await Promise.all([
    Promise.all(photos.map((p, i) => uploadImage(admin, `${base}/photo-${i}`, p))),
    uploadImage(admin, `${base}/design`, body.design),
    body.designBack ? uploadImage(admin, `${base}/design-back`, body.designBack) : Promise.resolve(null),
    body.mockup ? uploadImage(admin, `${base}/mockup`, body.mockup) : Promise.resolve(null),
  ]);

  if (!designUrl) return NextResponse.json({ error: "Could not save the design image" }, { status: 500 });
  if (flavor === "ai-studio" && !mockupUrl) return NextResponse.json({ error: "Could not save the mockup image" }, { status: 500 });

  const { data: row, error } = await admin.from("unik_recaps").insert({
    id: recapId,
    seller_id: seller.id,
    flavor,
    garment,
    colour,
    size,
    name,
    tagline: tagline || null,
    style_id: styleId || null,
    photo_urls: photoUrls.filter((u): u is string => !!u),
    design_url: designUrl,
    design_back_url: designBackUrl,
    mockup_url: mockupUrl,
    created_by_role: role,
    created_by_id: creatorId,
  }).select("*").single();
  if (error || !row) return NextResponse.json({ error: error?.message || "Could not save recap" }, { status: 500 });

  return NextResponse.json({ recap: recapShape(row) }, { status: 201 });
}
