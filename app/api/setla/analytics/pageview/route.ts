import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

// Every public/setla/*.html page beacons here on load (see setla.js). No
// auth required -- most visitors browsing SETLA haven't signed up yet --
// so this is rate-limited by IP rather than by customer identity.
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("setla-pageview:" + ip, 120, 3600).allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const path = String(body.path || "").trim().slice(0, 120);
  const visitorId = String(body.visitorId || "").trim().slice(0, 80);
  const referrer = String(body.referrer || "").trim().slice(0, 300) || null;
  if (!path || !visitorId) return NextResponse.json({ ok: false }, { status: 400 });

  const admin = getAdmin();
  await admin.from("setla_page_views").insert({ path, visitor_id: visitorId, referrer });

  return NextResponse.json({ ok: true });
}
