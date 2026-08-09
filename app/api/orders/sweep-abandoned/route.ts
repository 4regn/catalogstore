import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { sweepAbandonedOrders } from "../../../../lib/unik-orders";

// Same auth shape as /api/dashboard/live-visitors -- the seller's own
// dashboard sends its Supabase access_token in the POST body, and a
// seller's row id === auth.users.id 1:1.
//
// sweepAbandonedOrders was already seller-agnostic under the hood (see its
// own comment), it just had no call site outside app/api/unik/** -- every
// OTHER seller's own dashboard read orders straight off Supabase with no
// sweep ever applied, so an order that never got paid sat labelled
// "pending" forever instead of "abandoned" (reported directly: a 4regn
// checkout that was started but never paid stayed "pending" indefinitely).
// This gives every seller's dashboard the same sweep UNIK's own pages
// already had.
export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    await sweepAbandonedOrders(admin, userData.user.id);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Sweep abandoned orders error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
