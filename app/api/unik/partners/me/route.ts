import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikPartner } from "../../../../../lib/unik-partner";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUnikPartner(req);
  if ("response" in auth) return auth.response;
  const { partner } = auth;

  let discountCode: { code: string; type: string; value: number } | null = null;
  if (partner.discount_code_id) {
    const { data } = await getAdmin()
      .from("discount_codes")
      .select("code, type, value")
      .eq("id", partner.discount_code_id)
      .maybeSingle();
    if (data) discountCode = data;
  }

  return NextResponse.json({
    sellerId: auth.seller.id,
    partner: {
      fullName: partner.full_name,
      email: partner.email,
      phone: partner.phone,
      avatarUrl: partner.avatar_url,
      status: partner.status,
      referralCode: partner.referral_code,
      commissionPercent: partner.commission_percent,
      payoutAccountHolder: partner.payout_account_holder,
      payoutBank: partner.payout_bank,
      payoutAccountType: partner.payout_account_type,
      payoutBranchCode: partner.payout_branch_code,
      payoutAccountLast4: partner.payout_account_last4,
      availableBalanceCents: partner.available_balance_cents,
      pendingBalanceCents: partner.pending_balance_cents,
      totalEarnedCents: partner.total_earned_cents,
      totalPaidOutCents: partner.total_paid_out_cents,
    },
    discountCode,
  });
}
