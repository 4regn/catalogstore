import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

/* Dashboard-landing counts -- the queue sizes an admin actually needs to
   see at a glance. Orders/instalments/appeals counts stay at 0 until
   those phases exist; querying tables that are legitimately empty right
   now is cheap and keeps this endpoint's shape stable across phases. */
export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();
  const [{ count: pendingApplications }, { count: pendingBankReviews }, { count: pendingAppeals }] = await Promise.all([
    admin.from("setla_applications").select("id", { count: "exact", head: true }).in("status", ["pending", "manual_review"]),
    admin.from("setla_bank_accounts").select("id", { count: "exact", head: true }).eq("review_status", "pending"),
    admin.from("setla_appeals").select("id", { count: "exact", head: true }).eq("status", "pending"),
  ]);

  return NextResponse.json({
    admin: { fullName: auth.admin.full_name, email: auth.admin.email, role: auth.admin.role },
    pendingApplications: pendingApplications || 0,
    pendingBankReviews: pendingBankReviews || 0,
    pendingAppeals: pendingAppeals || 0,
    overdueInstalments: 0,
    openSupportConversations: 0,
  });
}
