import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getTrafficSourceAnalytics } from "../../../../lib/store-analytics";
import { sastToday } from "../../../../lib/sast-time";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Same auth shape and date-range handling as /api/dashboard/checkout-funnel-analytics.
export async function POST(req: NextRequest) {
  try {
    const { access_token, startDate, endDate, days } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    let range: { startDate: string; endDate: string };
    if (typeof startDate === "string" && DATE_RE.test(startDate) && typeof endDate === "string" && DATE_RE.test(endDate) && startDate <= endDate) {
      range = { startDate, endDate };
    } else {
      const today = sastToday();
      const n = Math.max(1, Math.round(Number(days)) || 30);
      const start = new Date(new Date(today + "T00:00:00Z").getTime() - (n - 1) * 86_400_000).toISOString().slice(0, 10);
      range = { startDate: start, endDate: today };
    }

    const analytics = await getTrafficSourceAnalytics(admin, userData.user.id, range);
    return NextResponse.json({ ok: true, ...analytics });
  } catch (e: any) {
    console.error("Traffic source analytics fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
