import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

// Seller-authenticated read of their own newsletter subscribers. The table
// has no RLS policies (service-role only, matching newsletter_subscribers'
// migration comment), so this goes through the admin client after verifying
// the caller's session — same shape as /api/domains/status.
export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const { data: userData, error: userErr } = await getAdmin().auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const { data, error } = await getAdmin()
      .from("newsletter_subscribers")
      .select("first_name, email, created_at, consented_at")
      .eq("seller_id", userData.user.id)
      .order("created_at", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ ok: true, subscribers: data || [] });
  } catch (e: any) {
    console.error("Newsletter subscribers fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
