import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

// The commission % used when a partner's own commission_percent is null.
// Deliberately a single constant for now -- see plan: "one global rate to
// start," with per-partner overrides available later via the same column.
export const DEFAULT_PARTNER_COMMISSION_PERCENT = 10;
// The value of the discount code auto-created for a partner on approval.
const DEFAULT_PARTNER_DISCOUNT_VALUE = 50;

export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const { data, error } = await getAdmin()
    .from("unik_partners")
    .select("id, full_name, email, status, referral_code, commission_percent, available_balance_cents, pending_balance_cents, total_earned_cents, total_paid_out_cents, created_at, discount_code_id")
    .eq("seller_id", seller.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ partners: data || [], defaultCommissionPercent: DEFAULT_PARTNER_COMMISSION_PERCENT });
}

function slugify(input: string) {
  return input.toLowerCase().replace(/[^a-z0-9]+/g, "").slice(0, 12) || "partner";
}

async function uniqueReferralCode(base: string) {
  const admin = getAdmin();
  let candidate = base;
  for (let suffix = 0; suffix < 50; suffix++) {
    const { data } = await admin.from("unik_partners").select("id").eq("referral_code", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = base + Math.floor(Math.random() * 900 + 100);
  }
  return base + Date.now().toString(36);
}

async function uniqueDiscountCode(sellerId: string, base: string) {
  const admin = getAdmin();
  let candidate = base.toUpperCase();
  for (let suffix = 0; suffix < 50; suffix++) {
    const { data } = await admin.from("discount_codes").select("id").eq("seller_id", sellerId).eq("code", candidate).maybeSingle();
    if (!data) return candidate;
    candidate = base.toUpperCase() + Math.floor(Math.random() * 90 + 10);
  }
  return base.toUpperCase() + Date.now().toString(36).toUpperCase();
}

/* Approve or reject a pending partner application.
   Approve: generates a referral code, creates a real discount_codes row
   linked back to this partner (so it works at checkout like any other
   code, see discount_codes.partner_id), and flips status to 'active'.
   Reject: flips status to 'suspended' -- the account still exists (so the
   person can see their application was declined if they sign in) but has
   no working referral code or discount code. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  let body: { partnerId?: string; action?: "approve" | "reject" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { partnerId, action } = body;
  if (!partnerId || (action !== "approve" && action !== "reject")) {
    return NextResponse.json({ error: "Missing partnerId or action" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: partner, error: fetchErr } = await admin
    .from("unik_partners")
    .select("id, full_name, status")
    .eq("id", partnerId)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (fetchErr || !partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  if (partner.status !== "pending") return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });

  if (action === "reject") {
    const { error } = await admin.from("unik_partners").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", partnerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ success: true, status: "suspended" });
  }

  const referralCode = await uniqueReferralCode(slugify(partner.full_name));
  const discountCode = await uniqueDiscountCode(seller.id, slugify(partner.full_name));

  const { data: discountRow, error: discountErr } = await admin
    .from("discount_codes")
    .insert({
      seller_id: seller.id,
      code: discountCode,
      type: "fixed",
      value: DEFAULT_PARTNER_DISCOUNT_VALUE,
      applies_to: "cart",
      active: true,
      partner_id: partnerId,
    })
    .select("id")
    .single();
  if (discountErr || !discountRow) return NextResponse.json({ error: discountErr?.message || "Could not create discount code" }, { status: 500 });

  const { error: updateErr } = await admin
    .from("unik_partners")
    .update({ status: "active", referral_code: referralCode, discount_code_id: discountRow.id, updated_at: new Date().toISOString() })
    .eq("id", partnerId);
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 });

  return NextResponse.json({ success: true, status: "active", referralCode, discountCode });
}
