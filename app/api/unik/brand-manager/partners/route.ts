import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";
import { sendPartnerApprovalEmail, sendPartnerRejectionEmail } from "../../../../../lib/unik-partner-email";

export const dynamic = "force-dynamic";

// The commission % used when a partner's own commission_percent is null.
// Deliberately a single constant for now -- see plan: "one global rate to
// start," with per-partner overrides available later via the same column.
export const DEFAULT_PARTNER_COMMISSION_PERCENT = 10;
// The discount code auto-created for a partner on approval is percentage-
// based (10% off), not a flat Rand amount -- simpler to reason about
// (~R70 total cost on a tee at 10% off + 10% commission), scales sensibly
// with basket size instead of being a fixed hit regardless of order value,
// and is symmetric with the commission rate. Tune both together later.
const DEFAULT_PARTNER_DISCOUNT_TYPE = "percentage";
const DEFAULT_PARTNER_DISCOUNT_VALUE = 10;

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

/* Approve, reject, or re-notify a partner application.
   Approve: generates a referral code, creates a real discount_codes row
   linked back to this partner (so it works at checkout like any other
   code, see discount_codes.partner_id), flips status to 'active', and
   emails them.
   Reject: flips status to 'suspended' -- the account still exists (so the
   person can see their application was declined if they sign in) but has
   no working referral code or discount code.
   Resend: re-sends the exact same approval email to an already-active
   partner, using their existing referral/discount code -- for anyone
   approved before this notification existed (see the pending->active
   migration this shipped alongside) and never found out. */
export async function PATCH(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  let body: { partnerId?: string; action?: "approve" | "reject" | "resend" };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const { partnerId, action } = body;
  if (!partnerId || (action !== "approve" && action !== "reject" && action !== "resend")) {
    return NextResponse.json({ error: "Missing partnerId or action" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: partner, error: fetchErr } = await admin
    .from("unik_partners")
    .select("id, full_name, email, status, referral_code, commission_percent, discount_code_id")
    .eq("id", partnerId)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (fetchErr || !partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });

  if (action === "resend") {
    if (partner.status !== "active") return NextResponse.json({ error: "This partner isn't active yet" }, { status: 409 });
    if (!partner.discount_code_id) return NextResponse.json({ error: "No discount code on file for this partner" }, { status: 409 });
    const { data: discountRow } = await admin.from("discount_codes").select("code").eq("id", partner.discount_code_id).maybeSingle();
    if (!discountRow) return NextResponse.json({ error: "Could not find this partner's discount code" }, { status: 500 });
    await sendPartnerApprovalEmail({
      seller,
      partner: { full_name: partner.full_name, email: partner.email },
      discountCode: discountRow.code,
      commissionPercent: partner.commission_percent ?? DEFAULT_PARTNER_COMMISSION_PERCENT,
    });
    return NextResponse.json({ success: true, status: "active" });
  }

  if (partner.status !== "pending") return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });

  if (action === "reject") {
    const { error } = await admin.from("unik_partners").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", partnerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Awaited (sendEmail never throws -- it catches and logs internally)
    // rather than fire-and-forget: a serverless function can freeze before
    // an un-awaited promise resolves once the response is sent, which would
    // silently drop the email. Same reasoning for the approval email below.
    await sendPartnerRejectionEmail({ seller, partner: { full_name: partner.full_name, email: partner.email } });
    return NextResponse.json({ success: true, status: "suspended" });
  }

  const referralCode = await uniqueReferralCode(slugify(partner.full_name));
  const discountCode = await uniqueDiscountCode(seller.id, slugify(partner.full_name));

  const { data: discountRow, error: discountErr } = await admin
    .from("discount_codes")
    .insert({
      seller_id: seller.id,
      code: discountCode,
      type: DEFAULT_PARTNER_DISCOUNT_TYPE,
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

  // The partner already has full login credentials from application time
  // (they set a password on /partners/apply, see that route), so this just
  // needs to tell them they're in and where to go -- no password-recovery
  // link needed, unlike the Brand Manager invite email this is otherwise
  // modelled on. Awaited for the same reason as the rejection email above.
  await sendPartnerApprovalEmail({
    seller,
    partner: { full_name: partner.full_name, email: partner.email },
    discountCode,
    commissionPercent: partner.commission_percent ?? DEFAULT_PARTNER_COMMISSION_PERCENT,
  });

  return NextResponse.json({ success: true, status: "active", referralCode, discountCode });
}
