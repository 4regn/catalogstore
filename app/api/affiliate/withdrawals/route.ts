import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

// Same value as MIN_WITHDRAW_CENTS in app/affiliate/dashboard/page.tsx --
// duplicated (not imported) since that file is a client component and
// this constant needs to be enforced server-side regardless of what the
// client sent, same reasoning as every other client-mirrors-server-rule
// pair in this codebase (e.g. discount percentage caps).
const MIN_WITHDRAW_CENTS = 15000;

async function getAuthedAffiliate(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return { ok: false as const, status: 401, error: "Not authenticated" };

  const admin = getAdmin();
  const { data: userData, error: userErr } = await admin.auth.getUser(accessToken);
  if (userErr || !userData.user) return { ok: false as const, status: 401, error: "Invalid session" };

  const { data: affiliate, error: affErr } = await admin
    .from("affiliates")
    .select("id, available_balance, email_verified, bank_name, account_number, account_holder, account_type, branch_code")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (affErr || !affiliate) return { ok: false as const, status: 404, error: "No affiliate account found" };

  return { ok: true as const, admin, affiliate };
}

/* Creates a withdrawal request for the affiliate's full available balance
   -- no partial-amount picker in the UI, matches handleWithdraw()'s own
   confirm() prompt. Moves the balance out of available_balance immediately
   (so a second request can't double-spend it while the first is still
   pending) and snapshots the current banking details onto the request
   itself (bank_snapshot), since account_number etc. could be edited later
   and a payout should always reflect what was on file when it was
   requested, not whatever the affiliate has since changed it to.
   Does NOT itself move money -- an admin still pays this out manually via
   bank transfer and marks it paid, same manual-payout model every other
   payout surface on this platform uses (SETLA, partner commissions). */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("affiliate-withdraw:" + ip, 5, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const auth = await getAuthedAffiliate(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
  const { admin, affiliate } = auth;

  if (!affiliate.email_verified) {
    return NextResponse.json({ error: "Verify your email before requesting a withdrawal -- check your inbox for the link we sent when you signed up." }, { status: 403 });
  }
  if (!affiliate.bank_name || !affiliate.account_number || !affiliate.account_holder) {
    return NextResponse.json({ error: "Add your banking details in Settings before requesting a withdrawal." }, { status: 400 });
  }
  const amount = Number(affiliate.available_balance) || 0;
  if (amount < MIN_WITHDRAW_CENTS) {
    return NextResponse.json({ error: `Need at least R${MIN_WITHDRAW_CENTS / 100} available to withdraw.` }, { status: 400 });
  }

  const bankSnapshot = {
    bank_name: affiliate.bank_name,
    account_number: affiliate.account_number,
    account_holder: affiliate.account_holder,
    account_type: affiliate.account_type,
    branch_code: affiliate.branch_code,
  };

  const { data: withdrawal, error: insertErr } = await admin
    .from("affiliate_withdrawals")
    .insert({ affiliate_id: affiliate.id, amount, status: "pending", requested_at: new Date().toISOString(), bank_snapshot: bankSnapshot })
    .select("id, amount, status, requested_at, paid_at, bank_snapshot")
    .single();
  if (insertErr || !withdrawal) {
    console.error("Affiliate withdrawal insert failed:", insertErr);
    return NextResponse.json({ error: insertErr?.message || "Could not create withdrawal request" }, { status: 500 });
  }

  // Zero out available_balance now that it's committed to this pending
  // request -- pending_balance already exists on the row (see /me's own
  // response shape) as the running total of everything awaiting payout.
  const { data: current } = await admin.from("affiliates").select("pending_balance").eq("id", affiliate.id).maybeSingle();
  const { error: updateErr } = await admin
    .from("affiliates")
    .update({ available_balance: 0, pending_balance: (Number(current?.pending_balance) || 0) + amount })
    .eq("id", affiliate.id);
  if (updateErr) {
    // The withdrawal row is already the source of truth for what's owed --
    // log for manual reconciliation rather than trying to roll back a
    // request that's already correctly recorded.
    console.error("Affiliate balance update after withdrawal failed:", updateErr);
  }

  return NextResponse.json({ ok: true, withdrawal });
}
