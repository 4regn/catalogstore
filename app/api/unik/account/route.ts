import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../lib/unik-customer";
import { sweepAbandonedOrders } from "../../../../lib/unik-orders";

export const dynamic = "force-dynamic";
// Must match reserve_unik_generation()'s v_limit -- see
// supabase/migrations/20260728_unik_generation_limit_reset.sql, and
// app/api/unik/generations/route.ts's UNIK_DAILY_GENERATION_LIMIT.
const UNIK_DAILY_GENERATION_LIMIT = 3;

export async function GET(req: NextRequest) {
  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;

  const { user, seller } = auth;
  const metadata = user.user_metadata || {};
  const fullName = String(metadata.full_name || metadata.name || "").trim() || null;
  const avatarUrl = String(metadata.avatar_url || metadata.picture || "").trim() || null;
  // phone/whatsapp_consent come from signup metadata (set once, at signup,
  // in UnikAccountClient.tsx) and never change afterward -- but this
  // upsert runs on every account-page load, so whatsapp_consent_at has to
  // be resolved against whatever's already stored rather than reset to
  // "now" every time, or the consent date would silently drift forward on
  // every visit.
  const admin = getAdmin();
  const phone = String(metadata.phone || "").trim() || null;
  const whatsappConsent = Boolean(metadata.whatsapp_consent);
  const { data: existingProfile } = await admin
    .from("unik_customer_profiles")
    .select("whatsapp_consent_at")
    .eq("seller_id", seller.id)
    .eq("auth_user_id", user.id)
    .maybeSingle();
  const whatsappConsentAt = whatsappConsent ? existingProfile?.whatsapp_consent_at || new Date().toISOString() : null;

  const { data: profile, error: profileError } = await admin
    .from("unik_customer_profiles")
    .upsert({
      seller_id: seller.id,
      auth_user_id: user.id,
      email: user.email!.toLowerCase(),
      full_name: fullName,
      avatar_url: avatarUrl,
      phone,
      whatsapp_consent: whatsappConsent,
      whatsapp_consent_at: whatsappConsentAt,
      updated_at: new Date().toISOString(),
    }, { onConflict: "seller_id,auth_user_id" })
    .select("id, email, full_name, avatar_url, created_at")
    .single();

  if (profileError) {
    return NextResponse.json({ error: "Customer account storage is not ready", detail: profileError.message }, { status: 503 });
  }

  // Relabel any order that's sat unpaid past ORDER_ABANDON_MS before
  // reading the order list below, so a cart the customer walked away from
  // shows as "abandoned" instead of an indefinite, misleading "pending".
  await sweepAbandonedOrders(admin, seller.id);

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [designsResult, ordersResult, usageResult] = await Promise.all([
    admin
      .from("unik_designs")
      .select("id, source, status, name, garment, colour, size, style, options, preview_url, mockup_url, private_artwork_path, saved_at, created_at")
      .eq("seller_id", seller.id)
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    admin
      .from("orders")
      .select("id, order_number, items, total, status, payment_status, created_at")
      .eq("seller_id", seller.id)
      .eq("customer_auth_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    admin
      .from("unik_generation_attempts")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", seller.id)
      .eq("auth_user_id", user.id)
      .eq("status", "succeeded")
      .gte("created_at", since),
  ]);

  // Custom-upload designs keep their original artwork in the private
  // unik-private-designs bucket (never made public, unlike the garment
  // mockup composites) -- the account page needs short-lived signed URLs
  // to let the owning customer view their own "watermarked design" slot.
  const rawDesigns = designsResult.data || [];
  const signedUrls = new Map<string, { front: string | null; back: string | null }>();
  await Promise.all(
    rawDesigns
      .filter((d: any) => d.source === "custom-upload" && d.private_artwork_path)
      .map(async (d: any) => {
        const backPath = d.options?.back_artwork_path as string | undefined;
        const [front, back] = await Promise.all([
          admin.storage.from("unik-private-designs").createSignedUrl(d.private_artwork_path, 3600),
          backPath ? admin.storage.from("unik-private-designs").createSignedUrl(backPath, 3600) : Promise.resolve({ data: null }),
        ]);
        signedUrls.set(d.id, { front: front.data?.signedUrl || null, back: back?.data?.signedUrl || null });
      })
  );
  const designs = rawDesigns.map((d: any) => {
    const signed = signedUrls.get(d.id);
    return {
      ...d,
      original_front_url: signed?.front || null,
      original_back_url: signed?.back || null,
      mockup_back_url: d.options?.mockup_back_url || null,
    };
  });

  return NextResponse.json({
    profile,
    designs,
    orders: ordersResult.data || [],
    generationLimit: { used: usageResult.count || 0, limit: UNIK_DAILY_GENERATION_LIMIT, remaining: Math.max(0, UNIK_DAILY_GENERATION_LIMIT - (usageResult.count || 0)) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

