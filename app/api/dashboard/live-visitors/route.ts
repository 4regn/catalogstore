import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { getLiveVisitors } from "../../../../lib/live-visitors";

// Matches the existing /api/newsletter/subscribers shape: the seller's own
// dashboard sends its Supabase access_token in the POST body (not an
// Authorization header), and sellers authenticate 1:1 against auth.users.id.
export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const visitors = await getLiveVisitors(admin, userData.user.id);
    return NextResponse.json({ ok: true, visitors });
  } catch (e: any) {
    console.error("Live visitors fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
