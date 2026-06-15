import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "../../../../lib/supabase-admin";

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
    /* Authenticate the caller. Attribution writes to a row keyed on the
       seller_id, so the caller must be that seller — otherwise an affiliate
       could forge attribution for any not-yet-attributed seller. */
    const cookieStore = await cookies();
    const accessToken =
      cookieStore.get("sb-access-token")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");
    if (!accessToken) {
      return NextResponse.json({ ok: false, reason: "not_authenticated" }, { status: 401 });
    }
    const { data: userData, error: userErr } = await getAdmin().auth.getUser(accessToken);
    if (userErr || !userData.user) {
      return NextResponse.json({ ok: false, reason: "invalid_session" }, { status: 401 });
    }

    const { sellerId } = await req.json();

    if (!sellerId || typeof sellerId !== "string") {
      return NextResponse.json({ ok: false, reason: "no_seller_id" }, { status: 400 });
    }
    if (sellerId !== userData.user.id) {
      /* sellers.id is the auth.users.id — they must match */
      return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });
    }

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

    const { data: affiliate } = await getAdmin()
      .from("affiliates")
      .select("id, user_id")
      .eq("slug", cleanSlug)
      .maybeSingle();

    if (!affiliate) {
      const res = NextResponse.json({ ok: true, attributed: false, reason: "affiliate_not_found" });
      clearRefCookie(res, host);
      return res;
    }

    const { data: seller } = await getAdmin()
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

    const { data: existing } = await getAdmin()
      .from("affiliate_referrals")
      .select("id")
      .eq("seller_id", sellerId)
      .maybeSingle();

    if (existing) {
      const res = NextResponse.json({ ok: true, attributed: true, alreadyAttributed: true });
      clearRefCookie(res, host);
      return res;
    }

    const { error: insertErr } = await getAdmin()
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
