import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

// Same auth shape as /api/dashboard/analytics and every other
// /api/dashboard/* route: access_token -> admin.auth.getUser() -> the
// resulting user id IS the sellers.id (sellers rows are keyed by their own
// auth uid, not a separate foreign key), so there's no extra lookup needed
// to scope a subscription to its owning seller.
export async function POST(req: NextRequest) {
  try {
    const { access_token, subscription, user_agent } = await req.json();
    if (!access_token || !subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: "Missing data" }, { status: 400 });
    }

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    // upsert on endpoint (unique) rather than insert -- a browser can hand
    // back the same subscription across page loads, and re-registering it
    // under a different seller_id (e.g. after switching accounts on a
    // shared device) must move it, not duplicate it.
    const { error } = await admin.from("push_subscriptions").upsert(
      {
        seller_id: userData.user.id,
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: typeof user_agent === "string" ? user_agent.slice(0, 300) : null,
      },
      { onConflict: "endpoint" }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("push-subscribe error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { access_token, endpoint } = await req.json();
    if (!access_token || !endpoint) return NextResponse.json({ error: "Missing data" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    await admin.from("push_subscriptions").delete().eq("seller_id", userData.user.id).eq("endpoint", endpoint);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("push-unsubscribe error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
