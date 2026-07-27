import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getSessionAnalytics } from "../../../../lib/store-analytics";

// Same auth shape as /api/dashboard/live-visitors and /api/newsletter/subscribers.
export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const analytics = await getSessionAnalytics(admin, userData.user.id);
    return NextResponse.json({ ok: true, ...analytics });
  } catch (e: any) {
    console.error("Session analytics fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
