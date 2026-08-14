import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getFullAnalytics } from "../../../../lib/store-analytics";

export const dynamic = "force-dynamic";

// Same auth shape as /api/dashboard/session-analytics and /api/dashboard/live-visitors.
export async function POST(req: NextRequest) {
  try {
    const { access_token, days } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const analytics = await getFullAnalytics(admin, userData.user.id, Number(days) || 30);
    return NextResponse.json({ ok: true, ...analytics });
  } catch (e: any) {
    console.error("Full analytics fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
