import { SupabaseClient } from "@supabase/supabase-js";
import { sastToday, sastDayStartUtc } from "./sast-time";

const CHART_DAYS = 14;
const LOCATION_WINDOW_DAYS = 30;
const TOP_LOCATIONS_LIMIT = 5;

export type DailySessionPoint = { date: string; sessions: number };
export type TopLocation = { country: string; region: string; city: string; count: number };

export type SessionAnalytics = {
  sessionsToday: number;
  ordersToday: number;
  salesToday: number;
  dailySessions: DailySessionPoint[];
  topLocations: TopLocation[];
};

// Pure calendar-date arithmetic on the "YYYY-MM-DD" string -- deliberately
// NOT sastDayStartUtc(today) stepped backward, since that returns a UTC
// *instant* (SAST midnight), and that instant's own UTC calendar date is
// one day earlier than the SAST date it represents (SAST 00:00 == UTC
// 22:00 the day before). Re-deriving date strings from it would silently
// shift every bucket back by a day.
function pastNDaysStrings(n: number, today: string): string[] {
  const out: string[] = [];
  const todayUtcMidnight = new Date(today + "T00:00:00Z").getTime();
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(todayUtcMidnight - i * 86_400_000).toISOString().slice(0, 10));
  }
  return out;
}

/* Shopify-style "sessions today / orders today / sales today" plus a
   sessions-by-day chart and top visitor locations -- all bucketed to the
   seller's actual South African calendar day (see lib/sast-time.ts), not
   the UTC day the serverless function happens to be running in. Sessions
   come from store_visitor_sessions (one row per visitor per day, written
   by the heartbeat route); orders/sales come straight from orders. */
export async function getSessionAnalytics(admin: SupabaseClient, sellerId: string): Promise<SessionAnalytics> {
  const today = sastToday();
  const todayStartIso = sastDayStartUtc(today).toISOString();
  const windowStart = pastNDaysStrings(LOCATION_WINDOW_DAYS, today)[0];

  const [sessionsRes, ordersRes] = await Promise.all([
    admin
      .from("store_visitor_sessions")
      .select("session_date, country, region, city")
      .eq("seller_id", sellerId)
      .gte("session_date", windowStart),
    admin
      .from("orders")
      .select("total, payment_status")
      .eq("seller_id", sellerId)
      .gte("created_at", todayStartIso),
  ]);

  const sessionRows = sessionsRes.data || [];
  const paidToday = (ordersRes.data || []).filter((o) => o.payment_status === "paid");

  const chartDays = pastNDaysStrings(CHART_DAYS, today);
  const dailyCounts = new Map(chartDays.map((d) => [d, 0]));
  const locationCounts = new Map<string, TopLocation>();
  let sessionsToday = 0;

  for (const row of sessionRows) {
    if (dailyCounts.has(row.session_date)) dailyCounts.set(row.session_date, (dailyCounts.get(row.session_date) || 0) + 1);
    if (row.session_date === today) sessionsToday++;

    const country = row.country || "Unknown";
    const region = row.region || "";
    const city = row.city || "";
    const key = country + "|" + region + "|" + city;
    const existing = locationCounts.get(key);
    if (existing) existing.count++;
    else locationCounts.set(key, { country, region, city, count: 1 });
  }

  const topLocations = Array.from(locationCounts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LOCATIONS_LIMIT);

  return {
    sessionsToday,
    ordersToday: paidToday.length,
    salesToday: paidToday.reduce((sum, o) => sum + Number(o.total || 0), 0),
    dailySessions: chartDays.map((d) => ({ date: d, sessions: dailyCounts.get(d) || 0 })),
    topLocations,
  };
}
