import { SupabaseClient } from "@supabase/supabase-js";
import { sastToday, sastDayStartUtc, sastDateOf } from "./sast-time";
import { fetchAllRows } from "./fetch-all-rows";

const CHART_DAYS = 14;
const LOCATION_WINDOW_DAYS = 30;
const TOP_LOCATIONS_LIMIT = 5;

export type DailySessionPoint = { date: string; sessions: number };
export type TopLocation = { country: string; region: string; city: string; count: number };
export type FunnelVisitorActivity = { visitorId: string; timestamp: string; path: string | null; status: string | null; customerName: string | null; customerEmail: string | null; cartItemCount: number; cartValue: number; cartItems: Array<{ id?: string; name: string; price: number; qty: number; variant?: string; image?: string }> };
export type FunnelPurchaseActivity = { orderId: string; orderNumber: number | null; externalId: string | null; customerName: string | null; customerEmail: string | null; total: number; timestamp: string; paymentMethod: string | null };
export type VisitorTimelineEvent = { visitorId: string; eventType: string; timestamp: string; path: string | null; customerName: string | null; customerEmail: string | null; cartItemCount: number; cartValue: number; cartItems: FunnelVisitorActivity["cartItems"] };

export type SessionAnalytics = {
  sessionsToday: number;
  addedToCartToday: number;
  reachedCheckoutToday: number;
  completedCheckoutToday: number;
  ordersToday: number;
  salesToday: number;
  dailySessions: DailySessionPoint[];
  topLocations: TopLocation[];
  activity: {
    addedToCart: FunnelVisitorActivity[];
    reachedCheckout: FunnelVisitorActivity[];
    purchases: FunnelPurchaseActivity[];
    timeline: VisitorTimelineEvent[];
  };
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

  const [sessionsRes, liveSessionsRes, eventRows, ordersRes] = await Promise.all([
    admin
      .from("store_visitor_sessions")
      .select("visitor_id, session_date, country, region, city, had_cart, reached_checkout, cart_started_at, checkout_started_at, last_seen_at, last_path, last_status, customer_name, customer_email")
      .eq("seller_id", sellerId)
      .gte("session_date", windowStart),
    admin
      .from("store_live_sessions")
      .select("visitor_id, status, cart_item_count, last_seen_at")
      .eq("seller_id", sellerId)
      .gte("last_seen_at", todayStartIso),
    // A seller needs the complete day when investigating a journey. PostgREST
    // caps ordinary selects, so page through every event instead of silently
    // showing just the newest 150.
    fetchAllRows<any>(admin, "store_visitor_events", "visitor_id, event_type, path, customer_name, customer_email, cart_item_count, cart_value, cart_items, created_at", (query) =>
      query.eq("seller_id", sellerId).gte("created_at", todayStartIso).order("created_at", { ascending: false })
    ),
    admin
      .from("orders")
      .select("id, order_number, external_id, customer_name, customer_email, total, payment_status, payment_method, created_at")
      .eq("seller_id", sellerId)
      .gte("created_at", todayStartIso),
  ]);

  const sessionRows = sessionsRes.data || [];
  const paidToday = (ordersRes.data || []).filter((o) => o.payment_status === "paid");

  const chartDays = pastNDaysStrings(CHART_DAYS, today);
  const dailyCounts = new Map(chartDays.map((d) => [d, 0]));
  const locationCounts = new Map<string, TopLocation>();
  let sessionsToday = 0;
  let addedToCartToday = 0;
  let reachedCheckoutToday = 0;
  const addedToCartActivity: FunnelVisitorActivity[] = [];
  const reachedCheckoutActivity: FunnelVisitorActivity[] = [];
  // Identity-by-visitor, sourced from store_visitor_sessions -- unlike a
  // one-time store_visitor_events row (captured the instant an event
  // fires, almost always before a checkout visitor has typed their name/
  // email), this session row is updated live as they type (see the
  // heartbeat route's own comment on sessionUpdate). Used below to
  // backfill identity onto activity built from either source, instead of
  // a visitor who filled in their details and then left showing up as a
  // nameless "random visitor" once they're no longer live.
  const identityByVisitor = new Map<string, { customerName: string | null; customerEmail: string | null }>();

  for (const row of sessionRows) {
    if (dailyCounts.has(row.session_date)) dailyCounts.set(row.session_date, (dailyCounts.get(row.session_date) || 0) + 1);
    if (row.customer_name || row.customer_email) {
      // A visitor_id can have one row per day; today's identity (if any)
      // always wins over an older day's for that same visitor.
      const existingIdentity = identityByVisitor.get(row.visitor_id);
      if (!existingIdentity || row.session_date === today) {
        identityByVisitor.set(row.visitor_id, { customerName: row.customer_name, customerEmail: row.customer_email });
      }
    }
    if (row.session_date === today) {
      sessionsToday++;
      if (row.had_cart) {
        addedToCartToday++;
        addedToCartActivity.push({ visitorId: row.visitor_id, timestamp: row.cart_started_at || row.last_seen_at, path: row.last_path, status: row.last_status, customerName: row.customer_name, customerEmail: row.customer_email, cartItemCount: 0, cartValue: 0, cartItems: [] });
      }
      if (row.reached_checkout) {
        reachedCheckoutToday++;
        reachedCheckoutActivity.push({ visitorId: row.visitor_id, timestamp: row.checkout_started_at || row.last_seen_at, path: row.last_path, status: row.last_status, customerName: row.customer_name, customerEmail: row.customer_email, cartItemCount: 0, cartValue: 0, cartItems: [] });
      }
    }

    const country = row.country || "Unknown";
    const region = row.region || "";
    const city = row.city || "";
    const key = country + "|" + region + "|" + city;
    const existing = locationCounts.get(key);
    if (existing) existing.count++;
    else locationCounts.set(key, { country, region, city, count: 1 });
  }

  // If today's historical session row didn't get written yet but live
  // presence is working, don't show the seller the impossible state of
  // "1 live visitor / 0 sessions today". This also covers a just-deployed
  // migration while older live rows are still warm.
  const liveToday = liveSessionsRes.data || [];
  if (sessionsToday < liveToday.length) sessionsToday = liveToday.length;
  const liveWithCart = liveToday.filter((v) => Number(v.cart_item_count || 0) > 0 || v.status === "active_cart" || v.status === "checkout").length;
  const liveAtCheckout = liveToday.filter((v) => v.status === "checkout").length;
  if (addedToCartToday < liveWithCart) addedToCartToday = liveWithCart;
  if (reachedCheckoutToday < liveAtCheckout) reachedCheckoutToday = liveAtCheckout;

  const eventToActivity = (row: any): FunnelVisitorActivity => {
    const identity = identityByVisitor.get(row.visitor_id);
    return {
      visitorId: row.visitor_id,
      timestamp: row.created_at,
      path: row.path,
      status: row.event_type,
      customerName: row.customer_name || identity?.customerName || null,
      customerEmail: row.customer_email || identity?.customerEmail || null,
      cartItemCount: Number(row.cart_item_count || 0),
      cartValue: Number(row.cart_value || 0),
      cartItems: Array.isArray(row.cart_items) ? row.cart_items : [],
    };
  };
  const eventAddedToCart = eventRows.filter((e: any) => e.event_type === "add_to_cart").map(eventToActivity);
  const eventReachedCheckout = eventRows.filter((e: any) => e.event_type === "reached_checkout").map(eventToActivity);
  if (eventAddedToCart.length > 0) addedToCartToday = Math.max(addedToCartToday, new Set(eventAddedToCart.map((e) => e.visitorId)).size);
  if (eventReachedCheckout.length > 0) reachedCheckoutToday = Math.max(reachedCheckoutToday, new Set(eventReachedCheckout.map((e) => e.visitorId)).size);

  const rawTopLocations = Array.from(locationCounts.values()).sort((a, b) => b.count - a.count);
  const cleanTopLocations = rawTopLocations.filter((loc) => !isLikelyNoisyLocation(loc));
  const topLocations = (cleanTopLocations.length ? cleanTopLocations : rawTopLocations)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_LOCATIONS_LIMIT);

  return {
    sessionsToday,
    addedToCartToday,
    reachedCheckoutToday,
    completedCheckoutToday: paidToday.length,
    ordersToday: paidToday.length,
    salesToday: paidToday.reduce((sum, o) => sum + Number(o.total || 0), 0),
    dailySessions: chartDays.map((d) => ({ date: d, sessions: dailyCounts.get(d) || 0 })),
    topLocations,
    activity: {
      addedToCart: (eventAddedToCart.length ? eventAddedToCart : addedToCartActivity).sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
      reachedCheckout: (eventReachedCheckout.length ? eventReachedCheckout : reachedCheckoutActivity).sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
      purchases: paidToday
        .map((o) => ({
          orderId: o.id,
          orderNumber: o.order_number ?? null,
          externalId: o.external_id ?? null,
          customerName: o.customer_name ?? null,
          customerEmail: o.customer_email ?? null,
          total: Number(o.total || 0),
          timestamp: o.created_at,
          paymentMethod: o.payment_method ?? null,
        }))
        .sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
      timeline: [
        ...eventRows.map((e: any) => ({
        visitorId: e.visitor_id,
        eventType: e.event_type,
        timestamp: e.created_at,
        path: e.path,
        customerName: e.customer_name,
        customerEmail: e.customer_email,
        cartItemCount: Number(e.cart_item_count || 0),
        cartValue: Number(e.cart_value || 0),
        cartItems: Array.isArray(e.cart_items) ? e.cart_items : [],
        })),
        ...paidToday.map((o: any) => ({
          visitorId: o.customer_email || o.id,
          eventType: "purchase",
          timestamp: o.created_at,
          path: null,
          customerName: o.customer_name ?? null,
          customerEmail: o.customer_email ?? null,
          cartItemCount: 0,
          cartValue: Number(o.total || 0),
          cartItems: [],
        })),
      ].sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp)),
    },
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

// currentTotal/previousTotal compare the selected range against the
// immediately preceding period of the same length (e.g. the last 7 days
// vs the 7 days before that) -- changePct is null when previousTotal is
// zero, since a percentage change off a zero base is meaningless (the UI
// shows "New" instead of a number in that case).
export type PeriodComparison = { currentTotal: number; previousTotal: number; changePct: number | null };

export type FullAnalytics = {
  rangeDays: number;
  totals: { revenue: number; orders: number; sessions: number; addedToCart: number; reachedCheckout: number; conversionRate: number; cartRate: number; checkoutRate: number; averageOrderValue: number };
  comparison: { revenue: PeriodComparison; orders: PeriodComparison; sessions: PeriodComparison };
  revenueSeries: { date: string; revenue: number }[];
  ordersSeries: { date: string; orders: number }[];
  sessionsSeries: DailySessionPoint[];
  bestSellers: BestSeller[];
  paymentMethods: PaymentBreakdown[];
  topLocations: TopLocation[];
  customers: { total: number; returning: number; returningRate: number };
};

function periodComparison(currentTotal: number, previousTotal: number): PeriodComparison {
  const changePct = previousTotal > 0 ? Math.round(((currentTotal - previousTotal) / previousTotal) * 1000) / 10 : null;
  return { currentTotal, previousTotal, changePct };
}

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

  // The immediately preceding, equal-length period (e.g. the 7 days
  // before the selected last-7-days range) -- fetched in the SAME query
  // as the current period (one wider `gte`, split by date afterward)
  // rather than a second round trip, purely to power the "vs previous
  // period" comparison badges below. Doesn't touch any of the existing
  // current-period bucketing/series/bestSellers/etc, which still only
  // ever look at rows on or after dateStrings[0].
  const dayBeforeRangeStr = new Date(new Date(dateStrings[0] + "T00:00:00Z").getTime() - 86_400_000).toISOString().slice(0, 10);
  const previousDateStrings = pastNDaysStrings(days, dayBeforeRangeStr);
  const previousRangeStartIso = sastDayStartUtc(previousDateStrings[0]).toISOString();

  const [combinedOrders, sessionsRes] = await Promise.all([
    fetchOrdersInRange(admin, sellerId, previousRangeStartIso),
    admin
      .from("store_visitor_sessions")
      .select("session_date, country, region, city, had_cart, reached_checkout")
      .eq("seller_id", sellerId)
      .gte("session_date", previousDateStrings[0]),
  ]);

  const orders = combinedOrders.filter((o) => sastDateOf(o.created_at) >= dateStrings[0]);
  const previousOrders = combinedOrders.filter((o) => sastDateOf(o.created_at) < dateStrings[0]);
  const paid = orders.filter((o) => o.payment_status === "paid");
  const previousPaid = previousOrders.filter((o) => o.payment_status === "paid");

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

  const allSessionRows = sessionsRes.data || [];
  const sessionRows = allSessionRows.filter((r) => r.session_date >= dateStrings[0]);
  const previousSessionRows = allSessionRows.filter((r) => r.session_date < dateStrings[0]);
  const sessionsByDate = new Map(dateStrings.map((d) => [d, 0]));
  const locationCounts = new Map<string, TopLocation>();
  let addedToCart = 0;
  let reachedCheckout = 0;
  for (const row of sessionRows) {
    if (sessionsByDate.has(row.session_date)) sessionsByDate.set(row.session_date, (sessionsByDate.get(row.session_date) || 0) + 1);
    if (row.had_cart) addedToCart++;
    if (row.reached_checkout) reachedCheckout++;
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
  const previousRevenue = previousPaid.reduce((s, o) => s + Number(o.total || 0), 0);
  const previousOrdersCount = previousPaid.length;
  const previousSessionsCount = previousSessionRows.length;
  const returning = Array.from(emailCounts.values()).filter((c) => c > 1).length;
  const rawFullTopLocations = Array.from(locationCounts.values()).sort((a, b) => b.count - a.count);
  const cleanFullTopLocations = rawFullTopLocations.filter((loc) => !isLikelyNoisyLocation(loc));

  return {
    rangeDays: days,
    totals: {
      revenue: totalRevenue,
      orders: totalOrders,
      sessions: totalSessions,
      addedToCart,
      reachedCheckout,
      conversionRate: totalSessions > 0 ? (totalOrders / totalSessions) * 100 : 0,
      cartRate: totalSessions > 0 ? (addedToCart / totalSessions) * 100 : 0,
      checkoutRate: totalSessions > 0 ? (reachedCheckout / totalSessions) * 100 : 0,
      averageOrderValue: totalOrders > 0 ? totalRevenue / totalOrders : 0,
    },
    comparison: {
      revenue: periodComparison(totalRevenue, previousRevenue),
      orders: periodComparison(totalOrders, previousOrdersCount),
      sessions: periodComparison(totalSessions, previousSessionsCount),
    },
    revenueSeries: dateStrings.map((d) => ({ date: d, revenue: Math.round((revenueByDate.get(d) || 0) * 100) / 100 })),
    ordersSeries: dateStrings.map((d) => ({ date: d, orders: ordersByDate.get(d) || 0 })),
    sessionsSeries: dateStrings.map((d) => ({ date: d, sessions: sessionsByDate.get(d) || 0 })),
    bestSellers: Array.from(bestSellerMap.values()).sort((a, b) => b.revenue - a.revenue).slice(0, BEST_SELLERS_LIMIT),
    paymentMethods: Array.from(paymentMethodMap.values()).sort((a, b) => b.revenue - a.revenue),
    topLocations: (cleanFullTopLocations.length ? cleanFullTopLocations : rawFullTopLocations).slice(0, FULL_TOP_LOCATIONS_LIMIT),
    customers: {
      total: emailCounts.size,
      returning,
      returningRate: emailCounts.size > 0 ? (returning / emailCounts.size) * 100 : 0,
    },
  };
}

function isLikelyNoisyLocation(loc: TopLocation) {
  const country = (loc.country || "").toUpperCase();
  const city = (loc.city || "").toLowerCase();
  const region = (loc.region || "").toUpperCase();
  // These repeatedly show up as crawler/proxy/data-centre traffic on SA
  // storefronts and distort the seller-facing "where are my customers?"
  // view. Real paid order location remains separate in Orders.
  if (country === "CN") return true;
  if (country === "US" && city === "dallas" && region === "TX") return true;
  return false;
}
