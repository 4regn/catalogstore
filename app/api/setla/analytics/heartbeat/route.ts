import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Every public/setla/*.html page pings this every ~20s while visible (see
// setla.js) to keep one row per visitor_id "warm" in setla_live_sessions.
// The admin "Live now" panel just reads rows with a recent last_seen --
// nothing here decides who's online, it only records a timestamp.
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("setla-heartbeat:" + ip, 300, 3600).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const visitorId = String(body.visitorId || "").trim().slice(0, 80);
  const path = String(body.path || "").trim().slice(0, 120) || null;
  const customerId = String(body.customerId || "").trim().slice(0, 80) || null;
  if (!visitorId) return NextResponse.json({ ok: false }, { status: 400 });

  const host = (req.headers.get("host") || "").split(":")[0].toLowerCase() || null;

  const admin = getAdmin();
  // first_seen is intentionally omitted from this payload -- its column
  // default only applies on the initial insert, so an update never resets
  // it back to "now", which is what makes "on site for" meaningful later.
  await admin.from("setla_live_sessions").upsert(
    { visitor_id: visitorId, customer_id: customerId, path, host, last_seen: new Date().toISOString() },
    { onConflict: "visitor_id" }
  );

  return NextResponse.json({ ok: true });
}
