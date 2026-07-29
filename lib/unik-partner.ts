import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";
import { getUnikSeller } from "./unik-customer";

const PARTNER_COLUMNS =
  "id, seller_id, auth_user_id, full_name, email, phone, avatar_url, status, referral_code, discount_code_id, commission_percent, payout_account_holder, payout_bank, payout_account_type, payout_branch_code, payout_account_last4, available_balance_cents, pending_balance_cents, total_earned_cents, total_paid_out_cents";

/* Mirrors requireUnikBrandManager's shape exactly, but authorizes against
   unik_partners instead. A Partner has their own auth.users row (created via
   the public /partners/apply flow) but only ever acts within the one seller
   they're scoped to. Unlike Brand Manager, a Partner also needs status to be
   'active' -- a pending applicant or a suspended partner can sign in (so
   they can see their application status) but can't use the dashboard's
   real features yet, so callers should check `partner.status` themselves
   where that distinction matters. */
export async function requireUnikPartner(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = bearer || req.cookies.get("unik-partner-access")?.value || "";
  if (!token) {
    return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  }

  const admin = getAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return { response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) } as const;
  }

  const seller = await getUnikSeller();
  if (!seller) {
    return { response: NextResponse.json({ error: "UNIK Labs is unavailable" }, { status: 404 }) } as const;
  }

  const { data: partner, error: partnerError } = await admin
    .from("unik_partners")
    .select(PARTNER_COLUMNS)
    .eq("seller_id", seller.id)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (partnerError || !partner) {
    return { response: NextResponse.json({ error: "This account doesn't have Partner access" }, { status: 403 }) } as const;
  }

  return { user: userData.user, seller, partner } as const;
}
