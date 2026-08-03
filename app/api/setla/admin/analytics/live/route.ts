import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

// "Online now" is a live read, not a stored fact -- anyone whose heartbeat
// (see analytics/heartbeat/route.ts) landed in the last 90s. 3-4x the
// client's 20s heartbeat interval so one missed beat (a slow network, a
// backgrounded tab briefly) doesn't flicker someone in and out of "live".
const LIVE_WINDOW_MS = 90 * 1000;

export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const admin = getAdmin();

  // Cheap cleanup piggybacked on every read rather than a separate cron --
  // this table only ever holds one row per visitor who has ever visited,
  // so without this it grows forever instead of staying bounded to recent
  // activity.
  await admin.from("setla_live_sessions").delete().lt("last_seen", new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const { data, error } = await admin
    .from("setla_live_sessions")
    .select("visitor_id, path, host, first_seen, last_seen, setla_customers(first_name, last_name, email)")
    .gte("last_seen", new Date(Date.now() - LIVE_WINDOW_MS).toISOString())
    .order("first_seen", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data || []) as unknown as Array<{
    visitor_id: string; path: string | null; host: string | null; first_seen: string; last_seen: string;
    setla_customers: { first_name: string; last_name: string; email: string } | null;
  }>;

  const live = rows.map((r) => ({
    visitorId: r.visitor_id,
    path: r.path,
    host: r.host,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    customer: r.setla_customers ? { name: `${r.setla_customers.first_name} ${r.setla_customers.last_name}`.trim(), email: r.setla_customers.email } : null,
  }));

  return NextResponse.json({ count: live.length, live });
}
