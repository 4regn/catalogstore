import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";

/* Mirrors requireUnikCustomer's shape, but -- unlike UNIK, where any
   authenticated Supabase user counts as a customer -- SETLA customers have
   their own linking-table row (setla_customers), since a SETLA account
   carries application/limit/payment state that has to exist before any of
   the customer-facing routes make sense. Cross-store: no seller_id
   scoping anywhere in this file, since SETLA isn't tied to a single
   seller the way Brand Manager/Partner are. */
export async function requireSetlaCustomer(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = bearer || req.cookies.get("setla-customer-access")?.value || "";
  if (!token) {
    return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  }

  const admin = getAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return { response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) } as const;
  }

  const { data: customer, error: customerError } = await admin
    .from("setla_customers")
    .select("id, auth_user_id, first_name, last_name, email, phone, id_number, address, application_status, identity_status, approved_limit, available_limit, payment_status, created_at")
    .eq("auth_user_id", userData.user.id)
    .maybeSingle();
  if (customerError || !customer) {
    return { response: NextResponse.json({ error: "SETLA account not found" }, { status: 404 }) } as const;
  }

  return { user: userData.user, customer } as const;
}
