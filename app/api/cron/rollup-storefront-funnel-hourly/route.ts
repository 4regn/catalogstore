import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";

export const dynamic = "force-dynamic";

// Vercel's Hobby plan hard-caps cron jobs at once per day -- a schedule
// that would run more often fails the ENTIRE deployment outright (not
// just this one route), which is exactly what silently blocked every
// deploy on this project for about an hour after this cron was first
// added on an hourly schedule. Runs once/day now (see vercel.json), but
// still produces genuinely hourly-granularity rows in
// storefront_funnel_hourly -- it just processes a whole day's worth of
// hours in one batch instead of one hour at a time. HOURS_TO_PROCESS is
// deliberately > 24 (a full day plus a safety margin) so a run that's
// slightly late, or one that got skipped entirely, still catches full
// coverage on the next run -- upserting makes reprocessing an
// already-covered hour a safe no-op-if-unchanged rather than a duplicate.
const HOURS_TO_PROCESS = 26;

/* Rolls up the last HOURS_TO_PROCESS completed hours of store_visitor_events
   into storefront_funnel_hourly (see that migration's own comment for why
   this table exists -- raw events have no retention, this is what keeps
   hour/day/week/month analysis fast regardless of how large that table
   gets). Never touches the current, still-in-progress hour, so an event
   landing a few seconds after this runs is never missed by rolling up too
   early -- it's simply covered by tomorrow's run instead.

   Aggregated across every seller in one pass (not one cron run per
   seller) -- a single query over the whole lookback window, grouped in
   memory, same "fetch then bucket in JS" approach lib/store-analytics.ts
   already uses for its own daily series. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const currentHourStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
  const windowStart = new Date(currentHourStart.getTime() - HOURS_TO_PROCESS * 60 * 60 * 1000);

  const admin = getAdmin();
  try {
    const events = await fetchAllRows<{ seller_id: string; event_type: string; visitor_id: string | null; created_at: string }>(
      admin, "store_visitor_events", "seller_id, event_type, visitor_id, created_at", (q) =>
        q.gte("created_at", windowStart.toISOString()).lt("created_at", currentHourStart.toISOString())
    );

    const buckets = new Map<string, { seller_id: string; hour_bucket: string; event_type: string; count: number; visitors: Set<string> }>();
    for (const e of events) {
      if (!e.seller_id || !e.event_type) continue;
      const eventHourStart = new Date(e.created_at);
      eventHourStart.setUTCMinutes(0, 0, 0);
      const hourIso = eventHourStart.toISOString();
      const key = `${e.seller_id}:${hourIso}:${e.event_type}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { seller_id: e.seller_id, hour_bucket: hourIso, event_type: e.event_type, count: 0, visitors: new Set() };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (e.visitor_id) bucket.visitors.add(e.visitor_id);
    }

    const rows = [...buckets.values()].map((b) => ({
      seller_id: b.seller_id,
      hour_bucket: b.hour_bucket,
      event_type: b.event_type,
      event_count: b.count,
      distinct_visitor_count: b.visitors.size,
    }));

    if (rows.length) {
      const { error } = await admin
        .from("storefront_funnel_hourly")
        .upsert(rows, { onConflict: "seller_id,hour_bucket,event_type" });
      if (error) throw error;
    }

    return NextResponse.json({ status: "ok", windowStart: windowStart.toISOString(), windowEnd: currentHourStart.toISOString(), buckets: rows.length, eventsProcessed: events.length });
  } catch (error: any) {
    console.error("Storefront funnel hourly rollup failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Rollup failed" }, { status: 500 });
  }
}
