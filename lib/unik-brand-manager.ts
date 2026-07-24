import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";
import { getUnikSeller } from "./unik-customer";

/* Mirrors requireUnikCustomer's shape exactly, but authorizes against
   brand_managers instead of assuming any authenticated user is a customer.
   A Brand Manager has their own auth.users row (created via the seller's
   "Invite" action in the dashboard) but is only ever allowed to act within
   the one seller they're scoped to -- never their own storefront, never
   another seller's data. */
export async function requireUnikBrandManager(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = bearer || req.cookies.get("unik-brand-manager-access")?.value || "";
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

  const { data: manager, error: managerError } = await admin
    .from("brand_managers")
    .select("id, seller_id, auth_user_id, full_name, email, avatar_url, campaign_code, campaign_discount_percent, payout_account_holder, payout_bank, payout_account_type, payout_branch_code, payout_account_last4")
    .eq("seller_id", seller.id)
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (managerError || !manager) {
    return { response: NextResponse.json({ error: "This account doesn't have Brand Manager access" }, { status: 403 }) } as const;
  }

  return { user: userData.user, seller, manager } as const;
}
