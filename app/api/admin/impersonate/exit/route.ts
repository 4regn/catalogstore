import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { writeAudit } from "../../../../../lib/admin-audit";
import { getClientIP } from "../../../../../lib/rate-limit";

/* POST /api/admin/impersonate/exit
   Tear down the impersonation state. The client signs out of the seller's
   session separately (via supabase.auth.signOut) — this endpoint just
   clears the cookies and writes the audit-log exit row. */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();
  const adminEmail = cookieStore.get("cs_admin_email")?.value || "";
  const sellerId = cookieStore.get("cs_impersonating")?.value || "";

  if (adminEmail) {
    await writeAudit({
      adminEmail,
      action: "impersonate_end",
      targetSellerId: sellerId || null,
      ip: getClientIP(req),
      userAgent: req.headers.get("user-agent"),
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set("cs_impersonating", "", { path: "/", maxAge: 0 });
  res.cookies.set("cs_admin_email", "", { path: "/", maxAge: 0 });
  return res;
}
