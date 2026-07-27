import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { getUnikSeller } from "../../../../../lib/unik-customer";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const GARMENTS = new Set(["tee", "hoodie"]);
const COLOURS = new Set(["black", "white", "beige"]);
const ZONES = new Set(["front", "both"]);
const MAX_IMAGE_BASE64_LEN = 6_000_000; // ~4.5MB decoded, generous for a phone photo

function decodeDataUrl(raw: unknown): { base64: string; ext: string } | null {
  if (typeof raw !== "string" || !raw) return null;
  const match = raw.match(/^data:image\/(png|jpe?g|webp);base64,([A-Za-z0-9+/=\r\n]+)$/);
  const base64 = match ? match[2] : (/^[A-Za-z0-9+/=\r\n]+$/.test(raw) ? raw : null);
  if (!base64 || base64.length > MAX_IMAGE_BASE64_LEN) return null;
  const ext = match ? (match[1] === "jpg" ? "jpeg" : match[1]) : "jpeg";
  return { base64, ext };
}

/* Uploads a Custom Upload item's artwork the moment "Add to Cart" is
   clicked, instead of carrying the raw image bytes all the way to
   checkout -- that carry was what made "Pay with Yoco" slow to redirect
   even after checkout's own uploads were deferred/parallelized, since the
   bytes still had to leave the browser as part of that request. Custom
   Upload deliberately doesn't require sign-in until checkout, so this
   design row starts out unclaimed (auth_user_id null) -- checkout attaches
   it to the paying customer's account once they actually sign in. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("unik-custom-upload-save:" + ip, 20, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const seller = await getUnikSeller();
  if (!seller) return NextResponse.json({ error: "UNIK Labs is unavailable" }, { status: 404 });

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const garment = String(body?.garment || "").toLowerCase();
  const colour = String(body?.colour || "").toLowerCase();
  const size = String(body?.size || "").toUpperCase();
  const zone = String(body?.zone || "").toLowerCase();
  if (!GARMENTS.has(garment) || !COLOURS.has(colour) || !ZONES.has(zone)) {
    return NextResponse.json({ error: "Invalid options" }, { status: 400 });
  }
  if (!/^(XS|S|M|L|XL|XXL)$/.test(size)) return NextResponse.json({ error: "Missing size" }, { status: 400 });
  const front = decodeDataUrl(body?.frontImage);
  if (!front) return NextResponse.json({ error: "Invalid or missing front image" }, { status: 400 });
  const back = zone === "both" ? decodeDataUrl(body?.backImage) : null;
  if (zone === "both" && !back) return NextResponse.json({ error: "Missing back image" }, { status: 400 });

  const admin = getAdmin();
  const { data: design, error: designInsertErr } = await admin.from("unik_designs").insert({
    seller_id: seller.id, auth_user_id: null, source: "custom-upload", status: "draft",
    name: "UNIK Labs Custom Print", garment, colour, size, options: { zone },
  }).select("id").single();
  if (designInsertErr || !design) {
    console.error("UNIK custom-upload save: design insert failed:", designInsertErr);
    return NextResponse.json({ error: "Could not save your design" }, { status: 500 });
  }

  const designId = design.id;
  const frontPath = `guest/${designId}/front.${front.ext}`;
  const backPath = back ? `guest/${designId}/back.${back.ext}` : null;

  async function uploadPreview(dataUrl: unknown, suffix: string): Promise<string | null> {
    const data = decodeDataUrl(dataUrl);
    if (!data) return null;
    const path = `${seller!.id}/unik-previews/${designId}-${suffix}.${data.ext}`;
    const { error } = await admin.storage.from("store-assets").upload(path, Buffer.from(data.base64, "base64"), { contentType: `image/${data.ext}`, upsert: true });
    if (error) { console.error(`UNIK custom-upload save: ${suffix} preview upload failed:`, error); return null; }
    return admin.storage.from("store-assets").getPublicUrl(path).data.publicUrl;
  }

  const [frontUploadResult, backUploadResult, mockupFrontUrl, mockupBackUrl] = await Promise.all([
    admin.storage.from("unik-private-designs").upload(frontPath, Buffer.from(front.base64, "base64"), { contentType: `image/${front.ext}`, upsert: true }),
    back ? admin.storage.from("unik-private-designs").upload(backPath!, Buffer.from(back.base64, "base64"), { contentType: `image/${back.ext}`, upsert: true }) : Promise.resolve(null),
    uploadPreview(body?.previewFront, "front"),
    zone === "both" ? uploadPreview(body?.previewBack, "back") : Promise.resolve(null),
  ]);
  if (frontUploadResult?.error) console.error("UNIK custom-upload save: front artwork upload failed:", frontUploadResult.error);
  if (backUploadResult?.error) console.error("UNIK custom-upload save: back artwork upload failed:", backUploadResult.error);

  await admin.from("unik_designs").update({
    private_artwork_path: frontPath,
    options: { zone, back_artwork_path: backPath, mockup_back_url: mockupBackUrl },
    mockup_url: mockupFrontUrl,
  }).eq("id", designId);

  return NextResponse.json({ ok: true, designId, previewUrl: mockupFrontUrl });
}
