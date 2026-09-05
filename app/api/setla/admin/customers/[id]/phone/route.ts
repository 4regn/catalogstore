import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { requireSetlaAdmin } from "@/lib/setla-admin";

export const dynamic = "force-dynamic";

// Same SA-only shape enforced at signup (app/api/setla/auth/signup/route.ts)
// -- also exactly what toSmsPortalDestination (lib/sms.ts) requires before
// it will send anything at all, so a number that fails this check could
// never receive an SMS regardless of what's tried downstream. Lets an
// admin correct a customer's number (typo'd digit, an old non-SA number
// like a UK mobile) directly from the send tools instead of it silently
// failing every campaign forever.
const SA_PHONE_REGEX = /^(\+27|0)[6-8][0-9]{8}$/;

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const phone = String(body?.phone || "").trim();
  if (!SA_PHONE_REGEX.test(phone)) {
    return NextResponse.json({ error: "Enter a valid South African mobile number (e.g. 082 123 4567 or +27821234567)." }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: existing } = await admin.from("setla_customers").select("id, phone").eq("id", id).maybeSingle();
  if (!existing) return NextResponse.json({ error: "Customer not found" }, { status: 404 });

  const { error } = await admin.from("setla_customers").update({ phone }).eq("id", id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  await admin.from("admin_audit_log").insert({
    admin_email: auth.admin.email,
    action: "setla_customer_phone_updated",
    target_seller_id: null,
    details: { customerId: id, previousPhone: existing.phone, newPhone: phone },
  });

  return NextResponse.json({ success: true, phone });
}
