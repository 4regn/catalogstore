import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";
import { getUnikSeller } from "./unik-customer";

export type SetlaAdminIdentity = { id: string; auth_user_id: string; full_name: string; email: string; role: "reviewer" | "super_admin"; active: boolean };

/* Mirrors requireUnikBrandManager's shape, minus the seller scoping --
   SETLA is a cross-store product (4regn x UNIK Labs today, not tied to a
   single seller_id), so there's no getUnikSeller() lookup for the main
   path, just an active setla_admins row for this auth user.

   Falls back to an existing UNIK Brand Manager session: bootstrapping a
   brand-new setla_admins row requires the platform's own single-admin-
   email flow (see app/api/setla/admin/bootstrap/route.ts), which is real
   friction for what is, today, one person operating both roles. A
   Brand Manager is already a trusted, vetted internal role for this
   exact store -- reusing that login here means SETLA review works with
   credentials that already exist and already work, no separate account
   needed. Real setla_admins rows (for reviewers who aren't also a Brand
   Manager) still take priority and are checked first. */
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

  const { data: setlaAdmin } = await admin
    .from("setla_admins")
    .select("id, auth_user_id, full_name, email, role, active")
    .eq("auth_user_id", userData.user.id)
    .eq("active", true)
    .maybeSingle();
  if (setlaAdmin) return { user: userData.user, admin: setlaAdmin as SetlaAdminIdentity } as const;

  const seller = await getUnikSeller();
  if (seller) {
    const { data: manager } = await admin
      .from("brand_managers")
      .select("id, auth_user_id, full_name, email")
      .eq("seller_id", seller.id)
      .eq("auth_user_id", userData.user.id)
      .maybeSingle();
    if (manager) {
      const identity: SetlaAdminIdentity = { id: manager.id, auth_user_id: manager.auth_user_id, full_name: manager.full_name, email: manager.email, role: "super_admin", active: true };
      return { user: userData.user, admin: identity } as const;
    }
  }

  return { response: NextResponse.json({ error: "This account doesn't have SETLA Admin access" }, { status: 403 }) } as const;
}
