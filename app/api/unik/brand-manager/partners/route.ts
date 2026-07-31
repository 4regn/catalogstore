import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";
import { sendEmail } from "../../../../../lib/email";
import { canonicalStoreUrl } from "../../../../../lib/store-url";

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
    .select("id, full_name, email, status")
    .eq("id", partnerId)
    .eq("seller_id", seller.id)
    .maybeSingle();
  if (fetchErr || !partner) return NextResponse.json({ error: "Partner not found" }, { status: 404 });
  if (partner.status !== "pending") return NextResponse.json({ error: "This application has already been reviewed" }, { status: 409 });

  if (action === "reject") {
    const { error } = await admin.from("unik_partners").update({ status: "suspended", updated_at: new Date().toISOString() }).eq("id", partnerId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    // Awaited (sendEmail never throws -- it catches and logs internally)
    // rather than fire-and-forget: a serverless function can freeze before
    // an un-awaited promise resolves once the response is sent, which would
    // silently drop the email. Same reasoning for the approval email below.
    await sendEmail({
      to: partner.email,
      subject: `Update on your ${seller.store_name} Partner application`,
      html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
        ${seller.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
        <p style="margin:0 0 12px">Hi ${partner.full_name.split(" ")[0]}, thanks for your interest in becoming a ${seller.store_name} Partner.</p>
        <p style="margin:0">We won't be moving forward with your application at this time. You're welcome to apply again in future.</p>
      </div>`,
    });
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
  await sendEmail({
    to: partner.email,
    subject: `You're in! Welcome as a ${seller.store_name} Partner`,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
      ${seller.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
      <p style="margin:0 0 12px">Hi ${partner.full_name.split(" ")[0]}, your application to become a ${seller.store_name} Partner has been approved.</p>
      <p style="margin:0 0 20px">Your referral link and discount code (<strong>${discountCode}</strong>) are ready in your dashboard.</p>
      <a href="${canonicalStoreUrl(seller.subdomain, "/partners/login")}" style="display:inline-block;padding:12px 24px;background:#007517;color:#fff;text-decoration:none;border-radius:100px;font-weight:700">Log in to your dashboard</a>
    </div>`,
  });

  return NextResponse.json({ success: true, status: "active", referralCode, discountCode });
}
