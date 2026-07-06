import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "./supabase-admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@4regn.com";

/* Shared admin guard for /api/admin/* routes. Validates the Supabase access
   token (cookie or Bearer header) and requires the admin email. */
export async function requireAdmin(
  req: NextRequest
): Promise<{ ok: true; email: string } | { ok: false; res: NextResponse }> {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) {
    return { ok: false, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  }
  const { data: userData, error } = await getAdmin().auth.getUser(accessToken);
  if (error || !userData.user) {
    return { ok: false, res: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  }
  if ((userData.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { ok: false, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true, email: userData.user.email! };
}
