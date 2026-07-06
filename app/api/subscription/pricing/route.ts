import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

/* Returns the authenticated seller's monthly price. Referred sellers
   (attributed to an affiliate at signup) pay the discounted rate
   permanently; everyone else pays the standard rate. Must match the
   PLANS constants in /api/billing-redirect. */
const STANDARD_PRICE = 199;
const REFERRED_PRICE = 149;

export async function GET(req: NextRequest) {
  const accessToken = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { data: userData, error } = await getAdmin().auth.getUser(accessToken);
  if (error || !userData.user) {
    return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  }

  const { data: referral } = await getAdmin()
    .from("affiliate_referrals")
    .select("id")
    .eq("seller_id", userData.user.id)
    .maybeSingle();

  return NextResponse.json({
    referred: !!referral,
    price: referral ? REFERRED_PRICE : STANDARD_PRICE,
    standardPrice: STANDARD_PRICE,
    referredPrice: REFERRED_PRICE,
  });
}
