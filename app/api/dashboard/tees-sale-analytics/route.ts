import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";

export const dynamic = "force-dynamic";

// Same auth shape and structure as /api/dashboard/flash-cap-analytics.
const TEES_SALE_EVENT_TYPES = [
  "tees_sale_collection_visited", "tees_sale_product_viewed",
  "tees_sale_added_to_cart", "tees_sale_order_completed",
] as const;

type Row = { event_type: string; visitor_id: string; cart_value: number | null; created_at: string };

export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const rows = await fetchAllRows<Row>(
      admin,
      "store_visitor_events",
      "event_type, visitor_id, cart_value, created_at",
      (q) => q.eq("seller_id", userData.user.id).in("event_type", TEES_SALE_EVENT_TYPES as unknown as string[]).order("created_at", { ascending: false })
    );

    const counts: Record<string, number> = {};
    const uniqueVisitors: Record<string, Set<string>> = {};
    for (const type of TEES_SALE_EVENT_TYPES) { counts[type] = 0; uniqueVisitors[type] = new Set(); }
    let orderValueTotal = 0;
    let firstSeenAt: string | null = null;
    let lastEventAt: string | null = null;

    for (const row of rows) {
      if (!(row.event_type in counts)) continue;
      counts[row.event_type] += 1;
      uniqueVisitors[row.event_type].add(row.visitor_id);
      if (row.event_type === "tees_sale_order_completed") orderValueTotal += Number(row.cart_value) || 0;
      if (!lastEventAt || row.created_at > lastEventAt) lastEventAt = row.created_at;
      if (!firstSeenAt || row.created_at < firstSeenAt) firstSeenAt = row.created_at;
    }

    const funnel = TEES_SALE_EVENT_TYPES.map((type) => ({
      type,
      count: counts[type],
      uniqueVisitors: uniqueVisitors[type].size,
    }));

    return NextResponse.json({ ok: true, funnel, orderValueTotal, firstSeenAt, lastEventAt, totalEvents: rows.length });
  } catch (e: any) {
    console.error("Tees sale analytics fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
