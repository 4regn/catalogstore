import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireAdmin } from "../../../../../lib/require-admin";

export const dynamic = "force-dynamic";

/* One-time bootstrap: creates the first setla_admins row (role:
   super_admin) so there's someone able to invite everyone else through
   the normal app/api/setla/admin/invite/route.ts flow afterward. Gated
   by the platform's existing single-email ADMIN_EMAIL guard (the same
   one app/api/admin/* routes use) rather than setla_admins itself, since
   before this runs there ARE no setla_admins rows to check against.
   Safe to call repeatedly -- a no-op once a super_admin already exists. */
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const admin = getAdmin();
  const { count } = await admin.from("setla_admins").select("id", { count: "exact", head: true }).eq("role", "super_admin");
  if (count && count > 0) {
    return NextResponse.json({ error: "A SETLA super admin already exists" }, { status: 409 });
  }

  const body = await req.json().catch(() => ({}));
  const fullName = String(body.fullName || "").trim() || auth.email.split("@")[0];

  // requireAdmin already resolved this exact user via the same access
  // token -- re-resolve here just to get the auth_user_id cleanly instead
  // of threading it back out of requireAdmin's return shape.
  const cookieToken = req.cookies.get("sb-access-token")?.value || req.headers.get("authorization")?.replace("Bearer ", "") || "";
  const { data: resolvedUser, error: resolveErr } = await admin.auth.getUser(cookieToken);
  if (resolveErr || !resolvedUser.user) return NextResponse.json({ error: "Could not resolve your account" }, { status: 401 });

  const { error: insertErr } = await admin.from("setla_admins").insert({
    auth_user_id: resolvedUser.user.id,
    full_name: fullName,
    email: auth.email,
    role: "super_admin",
  });
  if (insertErr) return NextResponse.json({ error: insertErr.message || "Could not create the admin row" }, { status: 500 });

  return NextResponse.json({ success: true });
}
