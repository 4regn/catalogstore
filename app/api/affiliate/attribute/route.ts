import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

function clearRefCookie(res: NextResponse, host: string | null) {
  const isProd = host?.includes("catalogstore.co.za") ?? false;
  res.cookies.set("affiliate_ref", "", {
    maxAge: 0,
    path: "/",
    ...(isProd ? { domain: ".catalogstore.co.za" } : {}),
  });
}

export async function POST(req: NextRequest) {
  const host = req.headers.get("host");
  try {
    const { sellerId } = await req.json();

    if (!sellerId || typeof sellerId !== "string") {
      return NextResponse.json({ ok: false, reason: "no_seller_id" }, { status: 400 });
    }

    const cookieStore = await cookies();
    const refSlug = cookieStore.get("affiliate_ref")?.value;
    if (!refSlug) {
      return NextResponse.json({ ok: true, attributed: false, reason: "no_cookie" });
    }

    // Same sanitization rules as AffiliateRefTracker
    const cleanSlug = refSlug.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    if (!cleanSlug) {
      const res = NextResponse.json({ ok: true, attributed: false, reason: "invalid_slug" });
      clearRefCookie(res, host);
      return res;
    }

    const { data: affiliate } = await supabaseAdmin
      .from("affiliates")
      .select("id, user_id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (!affiliate) {
      const res = NextResponse.json({ ok: true, attributed: false, reason: "affiliate_not_found" });
      clearRefCookie(res, host);
      return res;
    }

    const { data: seller } = await supabaseAdmin
      .from("sellers")
      .select("id")
      .eq("id", sellerId)
      .maybeSingle();

    if (!seller) {
      return NextResponse.json({ ok: true, attributed: false, reason: "seller_not_found" });
    }

    // sellers.id and affiliates.user_id both reference auth.users.id —
    // matching means an affiliate clicked their own link. Refuse.
    if (seller.id === affiliate.user_id) {
      const res = NextResponse.json({ ok: true, attributed: false, reason: "self_referral" });
      clearRefCookie(res, host);
      return res;
    }

    const { data: existing } = await supabaseAdmin
      .from("affiliate_referrals")
      .select("id")
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (existing) {
      const res = NextResponse.json({ ok: true, attributed: true, alreadyAttributed: true });
      clearRefCookie(res, host);
      return res;
    }

    const { error: insertErr } = await supabaseAdmin
      .from("affiliate_referrals")
      .insert({
        affiliate_id: affiliate.id,
        seller_id: sellerId,
        status: "trial",
        referred_at: new Date().toISOString(),
      });

    if (insertErr) {
      console.error("Referral insert error:", insertErr);
      return NextResponse.json({ ok: false, error: insertErr.message }, { status: 500 });
    }

    const res = NextResponse.json({ ok: true, attributed: true });
    clearRefCookie(res, host);
    return res;
  } catch (e: any) {
    console.error("Attribute error:", e);
    return NextResponse.json({ ok: false, error: e.message || "Internal error" }, { status: 500 });
  }
}
