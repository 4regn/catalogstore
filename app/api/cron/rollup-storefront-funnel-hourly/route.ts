import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";

export const dynamic = "force-dynamic";

/* Rolls up the most recently COMPLETED hour of store_visitor_events into
   storefront_funnel_hourly (see that migration's own comment for why this
   exists -- raw events have no retention, this is what keeps hour/day/
   week/month analysis fast regardless of how large that table gets).

   Scheduled hourly at :05 (see vercel.json), rolling up the hour that
   just ended -- never the current, still-in-progress one, so an event
   that lands a few seconds late near the top of the hour is never missed
   by rolling up too early. Upserts rather than insert-only, so re-running
   this for an hour it's already processed (a retry, a manual re-run) is
   self-correcting rather than creating duplicate/conflicting rows.

   Aggregated across every seller in one pass (not one cron run per
   seller) -- a single query over one hour's worth of events, grouped in
   memory, same "fetch then bucket in JS" approach lib/store-analytics.ts
   already uses for its own daily series. */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const hourEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), now.getUTCHours(), 0, 0, 0));
  const hourStart = new Date(hourEnd.getTime() - 60 * 60 * 1000);

  const admin = getAdmin();
  try {
    const events = await fetchAllRows<{ seller_id: string; event_type: string; visitor_id: string | null }>(
      admin, "store_visitor_events", "seller_id, event_type, visitor_id", (q) =>
        q.gte("created_at", hourStart.toISOString()).lt("created_at", hourEnd.toISOString())
    );

    const buckets = new Map<string, { seller_id: string; event_type: string; count: number; visitors: Set<string> }>();
    for (const e of events) {
      if (!e.seller_id || !e.event_type) continue;
      const key = `${e.seller_id}:${e.event_type}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = { seller_id: e.seller_id, event_type: e.event_type, count: 0, visitors: new Set() };
        buckets.set(key, bucket);
      }
      bucket.count += 1;
      if (e.visitor_id) bucket.visitors.add(e.visitor_id);
    }

    const rows = [...buckets.values()].map((b) => ({
      seller_id: b.seller_id,
      hour_bucket: hourStart.toISOString(),
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

    return NextResponse.json({ status: "ok", hour: hourStart.toISOString(), buckets: rows.length, eventsProcessed: events.length });
  } catch (error: any) {
    console.error("Storefront funnel hourly rollup failed", error);
    return NextResponse.json({ status: "error", error: error?.message || "Rollup failed" }, { status: 500 });
  }
}
