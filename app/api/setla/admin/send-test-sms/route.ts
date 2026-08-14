import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";
import { sendApprovedSetlaLimitSms } from "../../../../../lib/setla-sms";
import { SETLA_SAMPLE_LIMIT, SETLA_STARTER_SAMPLE_LIMIT } from "../../../../../lib/setla-email";
import { toSmsPortalDestination } from "../../../../../lib/sms";

export const dynamic = "force-dynamic";

// No-customer test send for the approved-limit SMS, same shape as
// send-test-email -- typed phone/name, no eligibility check, so an admin
// can preview the exact SMS copy without needing a real approved customer
// or access to their phone.
export async function POST(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const to = String(body.to || "").trim();
  if (!toSmsPortalDestination(to)) {
    return NextResponse.json({ error: "Enter a valid South African phone number (e.g. 082 123 4567 or +27821234567)" }, { status: 400 });
  }
  const firstName = String(body.firstName || "").trim().slice(0, 80);
  if (!firstName) return NextResponse.json({ error: "Enter a name for the SMS to be addressed to" }, { status: 400 });

  const limitVariant = body.limitVariant === "starter" ? "starter" : "standard";
  const requestedAmount = Number(body.amount);
  const defaultAmount = limitVariant === "starter" ? SETLA_STARTER_SAMPLE_LIMIT : SETLA_SAMPLE_LIMIT;
  const amount = Number.isFinite(requestedAmount) && requestedAmount > 0 ? requestedAmount : defaultAmount;

  await sendApprovedSetlaLimitSms({ to, firstName, approvedLimit: amount, variant: limitVariant });

  await getAdmin().from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_test_sms",
    target_seller_id: null,
    details: { to, firstName, limitVariant, amount },
  });

  return NextResponse.json({ success: true });
}
