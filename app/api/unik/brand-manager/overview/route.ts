import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";
import { sweepAbandonedOrders } from "../../../../../lib/unik-orders";
import { sastToday, sastDayStartUtc, sastMonthStartUtc } from "../../../../../lib/sast-time";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller, manager } = auth;

  const admin = getAdmin();

  // A UNIK order sits at payment_status "pending" until either a real
  // payment confirmation arrives or this sweep relabels it "abandoned"
  // past ORDER_ABANDON_MS -- previously only the customer-facing account
  // page ever triggered this, so an order the seller looks at here could
  // still read "pending" (a stale, no-longer-accurate label) well past
  // the point a customer would actually see it as abandoned.
  await sweepAbandonedOrders(admin, seller.id);

  // "Today"/"this month" mean the seller's actual South African calendar
  // day/month (see lib/sast-time.ts) -- this ran on Date.now()'s server-
  // local boundaries before, which on Vercel is UTC, silently shifting the
  // day cutoff by 2 hours from real SAST midnight.
  const today = sastToday();
  const todayStart = sastDayStartUtc(today).toISOString();
  const monthStart = sastMonthStartUtc(today).toISOString();

  const [todayOrders, monthOrders, recentOrders] = await Promise.all([
    admin.from("orders").select("total, payment_status").eq("seller_id", seller.id).gte("created_at", todayStart),
    admin.from("orders").select("total, payment_status").eq("seller_id", seller.id).gte("created_at", monthStart),
    admin
      .from("orders")
      .select("id, order_number, customer_name, items, total, status, payment_status, created_at")
      .eq("seller_id", seller.id)
      .order("created_at", { ascending: false })
      .limit(6),
  ]);

  const paidOnly = (rows: { total: number; payment_status: string }[] | null) =>
    (rows || []).filter((o) => o.payment_status === "paid");

  const todayPaid = paidOnly(todayOrders.data);
  const monthPaid = paidOnly(monthOrders.data);

  return NextResponse.json({
    manager: {
      fullName: manager.full_name,
      email: manager.email,
      avatarUrl: manager.avatar_url,
      campaignCode: manager.campaign_code,
      campaignDiscountPercent: manager.campaign_discount_percent,
      payoutAccountHolder: manager.payout_account_holder,
      payoutBank: manager.payout_bank,
      payoutAccountType: manager.payout_account_type,
      payoutBranchCode: manager.payout_branch_code,
      payoutAccountLast4: manager.payout_account_last4,
    },
    metrics: {
      ordersToday: todayPaid.length,
      salesToday: todayPaid.reduce((sum, o) => sum + Number(o.total || 0), 0),
      ordersThisMonth: monthPaid.length,
      salesThisMonth: monthPaid.reduce((sum, o) => sum + Number(o.total || 0), 0),
    },
    recentOrders: recentOrders.data || [],
  });
}
