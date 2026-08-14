import { SupabaseClient } from "@supabase/supabase-js";
import { sastToday, sastDayStartUtc, sastDateOf } from "./sast-time";

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

// ─── Full Analytics tab ─────────────────────────────────────────────────
// Everything above (getSessionAnalytics) powers the Live Visitors tab's
// small "today" snapshot on a fixed 14/30-day window and stays untouched.
// This is the real, seller-selectable-range analytics tab: revenue/orders/
// sessions trends, best sellers, payment method mix, top locations, and a
// new-vs-returning customer split -- built entirely from real orders/
// sessions data already in this schema, no new tables needed.

export type BestSeller = { id: string; name: string; image: string | null; unitsSold: number; revenue: number };
export type PaymentBreakdown = { method: string; count: number; revenue: number };

export type FullAnalytics = {
  rangeDays: number;
  totals: { revenue: number; orders: number; sessions: number; conversionRate: number; averageOrderValue: number };
  revenueSeries: { date: string; revenue: number }[];
  ordersSeries: { date: string; orders: number }[];
  sessionsSeries: DailySessionPoint[];
  bestSellers: BestSeller[];
  paymentMethods: PaymentBreakdown[];
  topLocations: TopLocation[];
  customers: { total: number; returning: number; returningRate: number };
};

type FullAnalyticsOrderRow = {
  total: number; payment_status: string; payment_method: string | null; created_at: string;
  customer_email: string | null; items: { id?: string; name?: string; price?: number; qty?: number; image?: string | null }[] | null;
};

// Same PostgREST 1000-row cap every other full-table scan in this codebase
// has to page around (see lib/fetch-all-rows.ts's own comment) -- a real
// seller's order count over a 90-day window can exceed that.
async function fetchOrdersInRange(admin: SupabaseClient, sellerId: string, sinceIso: string): Promise<FullAnalyticsOrderRow[]> {
  const all: FullAnalyticsOrderRow[] = [];
  const PAGE = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await admin
      .from("orders")
      .select("total, payment_status, payment_method, created_at, customer_email, items")
      .eq("seller_id", sellerId)
      .gte("created_at", sinceIso)
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    all.push(...(data as FullAnalyticsOrderRow[]));
    if (data.length < PAGE) break;
    from += PAGE;
  }
  return all;
}

const BEST_SELLERS_LIMIT = 10;
const FULL_TOP_LOCATIONS_LIMIT = 8;

export async function getFullAnalytics(admin: SupabaseClient, sellerId: string, requestedDays: number): Promise<FullAnalytics> {
  const days = Math.min(90, Math.max(7, Math.round(requestedDays) || 30));
  const today = sastToday();
  const dateStrings = pastNDaysStrings(days, today);
  const rangeStartIso = sastDayStartUtc(dateStrings[0]).toISOString();

  const [orders, sessionsRes] = await Promise.all([
    fetchOrdersInRange(admin, sellerId, rangeStartIso),
    admin
      .from("store_visitor_sessions")
      .select("session_date, country, region, city")
      .eq("seller_id", sellerId)
      .gte("session_date", dateStrings[0]),
  ]);

  const paid = orders.filter((o) => o.payment_status === "paid");

  const revenueByDate = new Map(dateStrings.map((d) => [d, 0]));
  const ordersByDate = new Map(dateStrings.map((d) => [d, 0]));
  const bestSellerMap = new Map<string, BestSeller>();
  const paymentMethodMap = new Map<string, PaymentBreakdown>();
  const emailCounts = new Map<string, number>();

  for (const o of paid) {
    const total = Number(o.total || 0);
    const d = sastDateOf(o.created_at);
    if (revenueByDate.has(d)) revenueByDate.set(d, (revenueByDate.get(d) || 0) + total);
    if (ordersByDate.has(d)) ordersByDate.set(d, (ordersByDate.get(d) || 0) + 1);

    const method = o.payment_method || "other";
    const pm = paymentMethodMap.get(method) || { method, count: 0, revenue: 0 };
    pm.count++; pm.revenue += total;
    paymentMethodMap.set(method, pm);

    const email = (o.customer_email || "").trim().toLowerCase();
    if (email) emailCounts.set(email, (emailCounts.get(email) || 0) + 1);

    for (const item of o.items || []) {
      const key = item.id || item.name;
      if (!key) continue;
      const qty = Number(item.qty || 1);
      const price = Number(item.price || 0);
      const existing = bestSellerMap.get(key) || { id: key, name: item.name || "Unknown item", image: item.image || null, unitsSold: 0, revenue: 0 };
      existing.unitsSold += qty;
      existing.revenue += qty * price;
      if (!existing.image && item.image) existing.image = item.image;
      bestSellerMap.set(key, existing);
    }
  }

  const sessionRows = sessionsRes.data || [];
  const sessionsByDate = new Map(dateStrings.map((d) => [d, 0]));
  const locationCounts = new Map<string, TopLocation>();
  for (const row of sessionRows) {
    if (sessionsByDate.has(row.session_date)) sessionsByDate.set(row.session_date, (sessionsByDate.get(row.session_date) || 0) + 1);
    const country = row.country || "Unknown";
    const region = row.region || "";
    const city = row.city || "";
    const key = country + "|" + region + "|" + city;
    const existing = locationCounts.get(key);
    if (existing) existing.count++;
    else locationCounts.set(key, { country, region, city, count: 1 });
  }

  const totalRevenue = paid.reduce((s, o) => s + Number(o.total || 0), 0);
  const totalOrders = paid.length;
  const totalSessions = sessionRows.length;
  const returning = Array.from(emailCounts.values()).filter((c) => c > 1).length;

  return {
    rangeDays: days,
    totals: {
      revenue: totalRevenue,
      orders: totalOrders,
      sessions: totalSessions,
      conversionRate: totalSessions > 0 ? (totalOrders / totalSessions) * 100 : 0,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    revenueSeries: dateStrings.map((d) => ({ date: d, revenue: Math.round((revenueByDate.get(d) || 0) * 100) / 100 })),
    ordersSeries: dateStrings.map((d) => ({ date: d, orders: ordersByDate.get(d) || 0 })),
    sessionsSeries: dateStrings.map((d) => ({ date: d, sessions: sessionsByDate.get(d) || 0 })),
    bestSellers: Array.from(bestSellerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, BEST_SELLERS_LIMIT),
    paymentMethods: Array.from(paymentMethodMap.values()).sort((a, b) => b.revenue - a.revenue),
    topLocations: Array.from(locationCounts.values()).sort((a, b) => b.count - a.count).slice(0, FULL_TOP_LOCATIONS_LIMIT),
    customers: {
      total: emailCounts.size,
      returning,
      returningRate: emailCounts.size > 0 ? (returning / emailCounts.size) * 100 : 0,
    },
  };
}
