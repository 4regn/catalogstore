import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../lib/unik-partner";

export const dynamic = "force-dynamic";

// Same shape as the platform-wide Affiliate programme's custom referral
// code (app/api/affiliate/signup/route.ts) -- lowercase letters, numbers,
// - and _, 2-32 characters.
function cleanReferralCode(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { partner } = auth;

  let body: { fullName?: string; avatarUrl?: string; referralCode?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const update: Record<string, string | null> = { updated_at: new Date().toISOString() };

  if (body.fullName !== undefined) {
    const fullName = String(body.fullName || "").trim();
    if (!fullName) return NextResponse.json({ error: "Add your name" }, { status: 400 });
    update.full_name = fullName;
  }

  if (body.avatarUrl !== undefined) {
    update.avatar_url = body.avatarUrl ? String(body.avatarUrl).slice(0, 500) : null;
  }

  const admin = getAdmin();

  if (body.referralCode !== undefined) {
    const cleaned = cleanReferralCode(String(body.referralCode || ""));
    if (cleaned.length < 3) {
      return NextResponse.json({ error: "Referral code must be at least 3 characters (letters, numbers, - or _)" }, { status: 400 });
    }
    if (cleaned !== partner.referral_code) {
      const { data: taken } = await admin.from("unik_partners").select("id").eq("referral_code", cleaned).neq("id", partner.id).maybeSingle();
      if (taken) return NextResponse.json({ error: "That referral code is already taken -- try another one" }, { status: 409 });
    }
    update.referral_code = cleaned;
  }

  const { error } = await admin.from("unik_partners").update(update).eq("id", partner.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, referralCode: (update.referral_code as string) ?? partner.referral_code });
}
