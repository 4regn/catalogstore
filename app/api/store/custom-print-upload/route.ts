import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Public, unauthenticated -- Custom Upload Studio products on 4regn are
// plain products, not UNIK's own multi-step Studio: no account, nothing
// saved for later reuse. A customer picks a file, it uploads immediately,
// and the resulting public URL travels with the cart item like any other
// detail (see customArtwork on CartItem in FourRegnStore.tsx). No DB row,
// no "draft"/"claimed" status -- if they never complete checkout, the
// uploaded file just sits unreferenced in storage, same as an abandoned
// cart's line items already do.
const ALLOWED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);
const MAX_BYTES = 20 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("custom-print-upload:" + ip, 20, 60).allowed) {
    return NextResponse.json({ error: "Too many uploads -- please wait a moment and try again." }, { status: 429 });
  }

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const file = formData.get("file");
  const sellerId = String(formData.get("sellerId") || "").trim();
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  if (!sellerId) return NextResponse.json({ error: "Missing sellerId" }, { status: 400 });
  if (!ALLOWED_TYPES.has(file.type)) return NextResponse.json({ error: "Please upload a PNG, JPEG, or WEBP image." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "That file is too large (max 20MB)." }, { status: 400 });

  const admin = getAdmin();
  const { data: seller } = await admin.from("sellers").select("id").eq("id", sellerId).maybeSingle();
  if (!seller) return NextResponse.json({ error: "Unknown store" }, { status: 404 });

  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const uploadId = crypto.randomUUID();
  const path = `${sellerId}/custom-print-uploads/${uploadId}.${ext}`;

  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await admin.storage.from("store-assets").upload(path, buffer, { contentType: file.type, upsert: false });
  if (uploadError) {
    console.error("custom-print-upload: storage upload failed", uploadError);
    return NextResponse.json({ error: "Could not upload your design. Please try again." }, { status: 500 });
  }

  const { data } = admin.storage.from("store-assets").getPublicUrl(path);
  return NextResponse.json({ ok: true, url: data.publicUrl });
}
