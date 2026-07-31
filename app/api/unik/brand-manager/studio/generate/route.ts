import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { getClientIP, rateLimit } from "../../../../../../lib/rate-limit";
import { requireUnikBrandManager } from "../../../../../../lib/unik-brand-manager";
import { callRailwayGeneration, makeMockup, newDesignId, parseGenerationInput } from "../../../../../../lib/unik-generation";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

const PRIVATE_BUCKET = "unik-private-designs";
const PREVIEW_BUCKET = "unik-design-previews";
// Must match reserve_unik_generation()'s v_limit -- see
// supabase/migrations/20260728_unik_generation_limit_reset.sql. A brand
// manager gets their own independent 3/day bucket for free, same reasoning
// as Partner Studio: the function keys on (seller_id, auth_user_id), and a
// brand manager always has their own separate auth.users row (created via
// the seller's "Invite" action), so there's no crosstalk with the partner
// or storefront customer limits.
const UNIK_DAILY_GENERATION_LIMIT = 3;

async function markFailed(attemptId: string, code: string) {
  await getAdmin().from("unik_generation_attempts").update({
    status: "failed",
    completed_at: new Date().toISOString(),
    error_code: code.slice(0, 80),
  }).eq("id", attemptId).in("status", ["started", "processing"]);
}

async function ensurePreviewBucket() {
  const admin = getAdmin();
  const { data } = await admin.storage.getBucket(PREVIEW_BUCKET);
  if (!data) {
    const { error } = await admin.storage.createBucket(PREVIEW_BUCKET, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  }
}

/* Brand Manager variant of the Partner Studio generate route (see
   app/api/unik/partners/studio/generate/route.ts) -- same generation
   pipeline, same no-watermark reasoning: a brand manager generating for
   their own brand's use (gifting, seeding creators, etc.) isn't a public
   download anyone could screenshot, so this skips makeWatermarkedPreview
   entirely, same as the partner route. */
export async function POST(req: NextRequest) {
  const ipLimit = rateLimit(`unik-brand-manager-generation:${getClientIP(req)}`, 8, 60);
  if (!ipLimit.allowed) return NextResponse.json({ error: "Too many requests. Please wait a moment." }, { status: 429 });

  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { user, seller } = auth;

  let input;
  try {
    input = parseGenerationInput(await req.json());
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Invalid generation request" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data, error } = await admin.rpc("reserve_unik_generation", {
    p_seller_id: seller.id,
    p_auth_user_id: user.id,
  });
  const reservation = Array.isArray(data) ? data[0] : null;
  if (error) return NextResponse.json({ error: "Could not reserve a generation" }, { status: 500 });
  if (!reservation?.attempt_id) {
    return NextResponse.json({
      error: "You have no generation slots available right now. Successful generations reset on a rolling 24-hour basis.",
      limit: UNIK_DAILY_GENERATION_LIMIT,
      used: reservation?.used_count || 0,
      remaining: 0,
    }, { status: 429 });
  }

  const attemptId = String(reservation.attempt_id);
  await admin.from("unik_generation_attempts").update({ status: "processing" }).eq("id", attemptId);

  try {
    const cleanArtwork = await callRailwayGeneration(input);
    const mockup = await makeMockup(cleanArtwork, input);

    await ensurePreviewBucket();
    const designId = newDesignId();
    const privatePath = `${user.id}/${designId}/artwork.png`;
    const mockupPath = `${seller.id}/${user.id}/${designId}/mockup.jpg`;

    const [cleanUpload, mockupUpload] = await Promise.all([
      admin.storage.from(PRIVATE_BUCKET).upload(privatePath, cleanArtwork, { contentType: "image/png", upsert: false, cacheControl: "31536000" }),
      admin.storage.from(PREVIEW_BUCKET).upload(mockupPath, mockup, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" }),
    ]);
    const uploadError = cleanUpload.error || mockupUpload.error;
    if (uploadError) throw new Error(`Could not store generated artwork: ${uploadError.message}`);

    const mockupUrl = admin.storage.from(PREVIEW_BUCKET).getPublicUrl(mockupPath).data.publicUrl;
    const { data: design, error: designError } = await admin.from("unik_designs").insert({
      id: designId,
      seller_id: seller.id,
      auth_user_id: user.id,
      generation_attempt_id: attemptId,
      source: "ai-studio",
      status: "generated",
      owner_role: "brand_manager",
      name: input.name,
      garment: input.garment,
      colour: input.colour,
      size: input.size,
      style: input.style,
      options: { tagline: input.tagline, subject: input.subject, photoCount: input.photos.length, mockupPath, provider: "railway-gemini" },
      mockup_url: mockupUrl,
      private_artwork_path: privatePath,
    }).select("id, status, mockup_url, created_at").single();
    if (designError || !design) throw new Error(`Could not save generation history: ${designError?.message || "unknown error"}`);

    await admin.from("unik_generation_attempts").update({
      status: "succeeded",
      completed_at: new Date().toISOString(),
      error_code: null,
    }).eq("id", attemptId).eq("status", "processing");

    return NextResponse.json({
      attempt: { id: attemptId, status: "succeeded" },
      design: { id: design.id, status: design.status, mockupUrl: design.mockup_url, createdAt: design.created_at, name: input.name, garment: input.garment, colour: input.colour, size: input.size, style: input.style, tagline: input.tagline },
      limit: UNIK_DAILY_GENERATION_LIMIT,
      used: Number(reservation.used_count || 0) + 1,
      remaining: Number(reservation.remaining_count || 0),
    }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Generation failed";
    const code = cause instanceof Error && cause.name === "AbortError" ? "provider_timeout" : "generation_failed";
    await markFailed(attemptId, code);
    console.error("UNIK brand manager generation failed", { attemptId, message });
    return NextResponse.json({ error: code === "provider_timeout" ? "Your design took too long to finish. Please try again; this attempt was not counted." : `${message}. This attempt was not counted.` }, { status: 502 });
  }
}
