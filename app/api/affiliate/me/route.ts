import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

export async function GET(req: NextRequest) {
  try {
    // ─── 1. Get auth token from cookies ──────────────────
    const cookieStore = await cookies();
    const accessToken =
      cookieStore.get("sb-access-token")?.value ||
      req.headers.get("authorization")?.replace("Bearer ", "");

    if (!accessToken) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // ─── 2. Verify the user ──────────────────────────────
    const { data: userData, error: userErr } =
      await supabaseAdmin.auth.getUser(accessToken);

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = userData.user.id;

    // ─── 3. Fetch affiliate record ───────────────────────
    const { data: affiliate, error: affErr } = await supabaseAdmin
      .from("affiliates")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (affErr) throw affErr;
    if (!affiliate) {
      return NextResponse.json(
        { error: "No affiliate account found for this user" },
        { status: 404 }
      );
    }

    // ─── 4. Fetch referrals (joined with sellers) ────────
    const { data: referrals, error: refErr } = await supabaseAdmin
      .from("affiliate_referrals")
      .select(
        `
        id,
        seller_id,
        referred_at,
        first_payment_at,
        last_payment_at,
        last_payment_status,
        payments_counted,
        total_earned_from_seller,
        status,
        sellers (
          id,
          email
        )
      `
      )
      .eq("affiliate_id", affiliate.id)
      .order("referred_at", { ascending: false });

    if (refErr) throw refErr;

    // ─── 5. Fetch withdrawals ───────────────────────────
    const { data: withdrawals, error: wErr } = await supabaseAdmin
      .from("affiliate_withdrawals")
      .select("*")
      .eq("affiliate_id", affiliate.id)
      .order("requested_at", { ascending: false })
      .limit(10);

    if (wErr) throw wErr;

    // ─── 6. Compute summary stats ────────────────────────
    const totalReferred = referrals?.length || 0;
    const activePaying =
      referrals?.filter((r) => r.status === "active").length || 0;
    const inTrial =
      referrals?.filter((r) => r.status === "trial").length || 0;
    const conversionRate =
      totalReferred > 0
        ? Math.round((activePaying / totalReferred) * 100)
        : 0;

    return NextResponse.json({
      ok: true,
      affiliate: {
        id: affiliate.id,
        slug: affiliate.slug,
        fullName: affiliate.full_name,
        email: affiliate.email,
        availableBalance: affiliate.available_balance, // in cents
        pendingBalance: affiliate.pending_balance,
        totalEarned: affiliate.total_earned,
        totalPaidOut: affiliate.total_paid_out,
        bankName: affiliate.bank_name,
        accountNumber: affiliate.account_number,
        emailVerified: affiliate.email_verified,
        status: affiliate.status,
      },
      referrals: referrals || [],
      withdrawals: withdrawals || [],
      stats: {
        totalReferred,
        activePaying,
        inTrial,
        conversionRate,
      },
    });
  } catch (e: any) {
    console.error("Dashboard fetch error:", e);
    return NextResponse.json(
      { error: e.message || "Internal error" },
      { status: 500 }
    );
  }
}
