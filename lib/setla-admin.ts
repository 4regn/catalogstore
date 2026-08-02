import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";

/* Mirrors requireUnikBrandManager's shape exactly, minus the seller
   scoping -- SETLA is a cross-store product (4regn x UNIK Labs today,
   not tied to a single seller_id), so there's no getUnikSeller() lookup
   here, just an active setla_admins row for this auth user. */
export async function requireSetlaAdmin(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = bearer || req.cookies.get("setla-admin-access")?.value || "";
  if (!token) {
    return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  }

  const admin = getAdmin();
  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user) {
    return { response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) } as const;
  }

  const { data: setlaAdmin, error: adminError } = await admin
    .from("setla_admins")
    .select("id, auth_user_id, full_name, email, role, active")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (adminError || !setlaAdmin) {
    return { response: NextResponse.json({ error: "This account doesn't have SETLA Admin access" }, { status: 403 }) } as const;
  }

  return { user: userData.user, admin: setlaAdmin } as const;
}
