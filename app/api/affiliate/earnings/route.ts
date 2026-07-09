import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "../../../../lib/supabase-admin";

async function getAuthedAffiliateId(req: NextRequest): Promise<string | null> {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return null;

  const { data: userData, error: userErr } = await getAdmin().auth.getUser(accessToken);
  if (userErr || !userData.user) return null;

  const { data: affiliate } = await getAdmin()
    .from("affiliates")
    .select("id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  return affiliate?.id || null;
}

/* Daily commission totals for the earnings graph. `range` picks a preset
   window; `from`/`to` (YYYY-MM-DD) override it for a custom range. Real
   data only — built from affiliate_commission_events, the same ledger the
   PayFast ITN webhook writes to, never synthesized. */
export async function GET(req: NextRequest) {
  const affiliateId = await getAuthedAffiliateId(req);
  if (!affiliateId) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const range = req.nextUrl.searchParams.get("range") || "30";
  const fromParam = req.nextUrl.searchParams.get("from");
  const toParam = req.nextUrl.searchParams.get("to");

  const now = new Date();
  let from: Date;
  let to: Date = now;
  if (fromParam && toParam) {
    from = new Date(fromParam + "T00:00:00Z");
    to = new Date(toParam + "T23:59:59Z");
  } else {
    const days = range === "7" ? 7 : 30;
    from = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }
  if (isNaN(from.getTime()) || isNaN(to.getTime()) || from > to) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }
  // Cap custom ranges at 366 days so this can't be abused into a full-table scan.
  if (to.getTime() - from.getTime() > 366 * 24 * 60 * 60 * 1000) {
    return NextResponse.json({ error: "Range too large (max 366 days)" }, { status: 400 });
  }

  const { data: events, error } = await getAdmin()
    .from("affiliate_commission_events")
    .select("commission_cents, created_at")
    .eq("affiliate_id", affiliateId)
    .gte("created_at", from.toISOString())
    .lte("created_at", to.toISOString());

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Bucket into one point per day so the graph has a steady x-axis even on
  // days with no commission events.
  const byDay = new Map<string, number>();
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()));
  while (cursor <= end) {
    byDay.set(cursor.toISOString().slice(0, 10), 0);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  for (const e of events || []) {
    const day = new Date(e.created_at).toISOString().slice(0, 10);
    byDay.set(day, (byDay.get(day) || 0) + (e.commission_cents || 0));
  }

  const points = Array.from(byDay.entries())
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, cents]) => ({ date, cents }));
  const totalCents = points.reduce((s, p) => s + p.cents, 0);

  return NextResponse.json({ points, totalCents });
}
