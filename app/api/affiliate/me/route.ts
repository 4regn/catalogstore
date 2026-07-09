import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "../../../../lib/supabase-admin";

const SA_BANKS = new Set([
  "FNB", "Standard Bank", "Absa", "Capitec", "Nedbank", "TymeBank",
  "Discovery Bank", "African Bank", "Investec", "Bidvest Bank",
]);

async function getAuthedAffiliate(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return { ok: false as const, status: 401, error: "Not authenticated" };

  const { data: userData, error: userErr } = await getAdmin().auth.getUser(accessToken);
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Invalid session" };

  const { data: affiliate, error: affErr } = await getAdmin()
    .from("affiliates")
    .select("id, slug")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (affErr || !affiliate) return { ok: false as const, status: 404, error: "No affiliate account found" };

  return { ok: true as const, affiliateId: affiliate.id, currentSlug: affiliate.slug };
}

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
      await getAdmin().auth.getUser(accessToken);

    if (userErr || !userData.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const userId = userData.user.id;

    // ─── 3. Fetch affiliate record ───────────────────────
    const { data: affiliate, error: affErr } = await getAdmin()
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
    const { data: referrals, error: refErr } = await getAdmin()
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
          email,
          store_name,
          subdomain,
          subscription_status
        )
      `
      )
      .eq("affiliate_id", affiliate.id)
      .order("referred_at", { ascending: false });

    if (refErr) throw refErr;

    // ─── 5. Fetch withdrawals ───────────────────────────
    const { data: withdrawals, error: wErr } = await getAdmin()
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
        accountHolder: affiliate.account_holder,
        accountType: affiliate.account_type,
        branchCode: affiliate.branch_code,
        emailVerified: affiliate.email_verified,
        status: affiliate.status,
        photoUrl: affiliate.photo_url,
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

/* Affiliate self-service updates: referral code (slug) and banking details.
   Both are edited from the affiliate's own settings screen. Slug changes
   are uniqueness-checked the same way as signup; existing referral links
   using the OLD slug stop attributing once changed, so the UI should warn
   about that before submitting. */
export async function PATCH(req: NextRequest) {
  const auth = await getAuthedAffiliate(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};

  if (body.slug !== undefined) {
    const cleaned = String(body.slug).toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 32);
    if (cleaned.length < 2) {
      return NextResponse.json({ error: "Referral code must be at least 2 characters." }, { status: 400 });
    }
    if (cleaned !== auth.currentSlug) {
      const { data: taken } = await getAdmin()
        .from("affiliates")
        .select("id")
        .eq("slug", cleaned)
        .maybeSingle();
      if (taken) {
        return NextResponse.json({ error: "That referral code is already taken." }, { status: 409 });
      }
      updates.slug = cleaned;
    }
  }

  if (body.bankName !== undefined) {
    if (!SA_BANKS.has(body.bankName)) {
      return NextResponse.json({ error: "Invalid bank." }, { status: 400 });
    }
    updates.bank_name = body.bankName;
  }
  if (body.accountNumber !== undefined) {
    const acc = String(body.accountNumber).trim();
    if (acc.length < 6) {
      return NextResponse.json({ error: "Invalid account number." }, { status: 400 });
    }
    updates.account_number = acc;
  }
  if (body.accountHolder !== undefined) {
    const holder = String(body.accountHolder).trim();
    if (!holder) {
      return NextResponse.json({ error: "Account holder name is required." }, { status: 400 });
    }
    updates.account_holder = holder;
  }
  if (body.accountType !== undefined) {
    if (body.accountType !== "cheque" && body.accountType !== "savings") {
      return NextResponse.json({ error: "Invalid account type." }, { status: 400 });
    }
    updates.account_type = body.accountType;
  }
  if (body.branchCode !== undefined) {
    updates.branch_code = String(body.branchCode).trim();
  }
  if (body.photoUrl !== undefined) {
    updates.photo_url = body.photoUrl ? String(body.photoUrl).slice(0, 500) : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No changes supplied." }, { status: 400 });
  }

  const { error: updateErr } = await getAdmin()
    .from("affiliates")
    .update(updates)
    .eq("id", auth.affiliateId);

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, slug: (updates.slug as string) || auth.currentSlug });
}
