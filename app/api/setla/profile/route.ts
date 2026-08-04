import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireSetlaCustomer } from "../../../../lib/setla-customer";
import { rateLimit } from "../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Backs apply.html's "saved account details" editor -- lets a customer fix
// a typo in the name/mobile number they gave at signup without re-entering
// their whole application. Email is intentionally not editable here: it's
// also the Supabase Auth login identity, and changing it needs Supabase's
// own verify-new-address flow, not a plain field update.
export async function PATCH(req: NextRequest) {
  const auth = await requireSetlaCustomer(req);
  if ("response" in auth) return auth.response;
  const { customer } = auth;

  if (!rateLimit("setla-profile-update:" + customer.id, 20, 3600).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const firstName = String(body.firstName || "").trim().slice(0, 80);
  const lastName = String(body.lastName || "").trim().slice(0, 80);
  const phone = String(body.phone || "").trim().slice(0, 30);
  if (!firstName || !lastName || !phone) {
    return NextResponse.json({ error: "First name, last name and mobile number are required" }, { status: 400 });
  }

  const admin = getAdmin();
  const { error } = await admin
    .from("setla_customers")
    .update({ first_name: firstName, last_name: lastName, phone })
    .eq("id", customer.id);
  if (error) return NextResponse.json({ error: "Could not save your details" }, { status: 500 });

  return NextResponse.json({ ok: true, firstName, lastName, phone });
}
