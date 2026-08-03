import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";
import { sendSetlaEmail, SETLA_EMAIL_TYPES } from "../../../../../lib/setla-email";

export const dynamic = "force-dynamic";

// No-customer-required version of the send-email tool
// (customers/[id]/send-email) -- that one always needs a real customer
// matching the email type's eligible status, which makes it useless for
// just checking what an email looks like (e.g. no approved customer to
// pick, or you just want to see it in your own inbox). This one takes a
// typed name and address instead, skips the eligibility check entirely,
// and uses a sample limit for "approved" since there's no real customer
// record to pull one from.
export async function POST(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const body = await req.json().catch(() => ({}));
  const emailType = String(body.emailType || "");
  const type = SETLA_EMAIL_TYPES[emailType];
  if (!type) return NextResponse.json({ error: "Invalid email type" }, { status: 400 });

  const to = String(body.to || "").trim();
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }
  const firstName = String(body.firstName || "").trim().slice(0, 80);
  if (!firstName) return NextResponse.json({ error: "Enter a name for the email to be addressed to" }, { status: 400 });

  const content = type.content(firstName);
  await sendSetlaEmail({ ...content, to });

  await getAdmin().from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_test_email",
    target_seller_id: null,
    details: { emailType, to, firstName },
  });

  return NextResponse.json({ success: true });
}
