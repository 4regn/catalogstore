import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireAdmin } from "../../../../lib/require-admin";

/* Admin: affiliate programme insights. Returns every affiliate with their
   referred sellers and earnings. Balances are stored in cents. Bank details
   are intentionally excluded — the admin doesn't need them here. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = getAdmin();

  const [{ data: affiliates }, { data: referrals }] = await Promise.all([
    admin
      .from("affiliates")
      .select("id, slug, full_name, email, phone, status, email_verified, available_balance, pending_balance, total_earned, total_paid_out, created_at")
      .order("created_at", { ascending: false }),
    admin
      .from("affiliate_referrals")
      .select("id, affiliate_id, seller_id, status, referred_at, first_payment_at, last_payment_at, payments_counted, total_earned_from_seller, sellers ( store_name, subdomain, email, subscription_status, created_at )")
      .order("referred_at", { ascending: false }),
  ]);

  const referralsByAffiliate = new Map<string, any[]>();
  for (const r of referrals ?? []) {
    const list = referralsByAffiliate.get(r.affiliate_id) ?? [];
    list.push(r);
    referralsByAffiliate.set(r.affiliate_id, list);
  }

  const result = (affiliates ?? []).map((a) => {
    const refs = referralsByAffiliate.get(a.id) ?? [];
    return {
      ...a,
      referrals: refs,
      stats: {
        totalReferred: refs.length,
        activePaying: refs.filter((r) => r.status === "active").length,
        inTrial: refs.filter((r) => r.status === "trial").length,
      },
    };
  });

  const totals = {
    affiliates: result.length,
    totalReferred: (referrals ?? []).length,
    activePaying: (referrals ?? []).filter((r) => r.status === "active").length,
    totalEarnedCents: result.reduce((s, a) => s + (a.total_earned || 0), 0),
    pendingBalanceCents: result.reduce((s, a) => s + (a.pending_balance || 0), 0),
    totalPaidOutCents: result.reduce((s, a) => s + (a.total_paid_out || 0), 0),
  };

  return NextResponse.json({ affiliates: result, totals });
}
