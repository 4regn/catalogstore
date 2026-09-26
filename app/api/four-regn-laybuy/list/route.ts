import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

// Seller-authenticated read of their own 4REGN Lay-Buy plans + payment
// ledger for the dashboard. four_regn_laybuy_plans/payments have RLS
// enabled with no policies (service-role only, see that table's own
// migration comment -- customer sessions aren't Supabase Auth, so there's
// no auth.uid() to write a customer-facing policy against), so this goes
// through the admin client after verifying the caller's session instead --
// same shape as /api/newsletter/subscribers. Sellers ARE real Supabase
// Auth users whose auth.users.id equals sellers.id, so userData.user.id
// doubles as the seller_id filter directly.
export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const { data: userData, error: userErr } = await getAdmin().auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { data, error } = await getAdmin()
      .from("four_regn_laybuy_plans")
      .select(
        "id, order_id, total_amount, paid_amount, status, created_at, paid_off_at, expires_at, " +
        "orders(order_number, external_id, customer_name, customer_email), " +
        "four_regn_laybuy_payments(id, amount, is_deposit, status, created_at, paid_at)"
      )
      .eq("seller_id", userData.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const plans = (data || []).map((plan: any) => ({
      ...plan,
      order: Array.isArray(plan.orders) ? plan.orders[0] : plan.orders,
      payments: (plan.four_regn_laybuy_payments || []).sort((a: any, b: any) => a.created_at.localeCompare(b.created_at)),
      orders: undefined,
      four_regn_laybuy_payments: undefined,
    }));

    return NextResponse.json({ ok: true, plans });
  } catch (e: any) {
    console.error("4REGN Lay-Buy list fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
