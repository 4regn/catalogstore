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

// Inclusive list of "YYYY-MM-DD" calendar-date strings from startDate to
// endDate -- same pure string arithmetic as pastNDaysStrings, generalized
// to an arbitrary explicit range (Today/This Week/This Month/Custom aren't
// expressible as "the last N days" the way the older day-count-based
// analytics functions assume).
function dateStringsBetween(startDate: string, endDate: string): string[] {
  const out: string[] = [];
  const startMs = new Date(startDate + "T00:00:00Z").getTime();
  const endMs = new Date(endDate + "T00:00:00Z").getTime();
  for (let t = startMs; t <= endMs; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
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

export type CheckoutFunnelCount = { key: string; count: number };
export type CheckoutFunnelDailyPoint = { date: string; reachedCheckout: number; filledDeliveryDetails: number; clickedPayNow: number; paidOrders: number };
// Who's actually behind the "filled in details" number -- an identity
// (name/email), what was in their cart at the time, and what became of it.
// "no_order" is the case a seller has no visibility into at all otherwise:
// someone typed their details and cart at checkout and simply never
// clicked Place Order (or did, and it never reached a gateway) -- there's
// no orders row for these, so this is the only place they show up.
export type IdentifiedCheckoutLead = {
  visitorId: string;
  customerName: string | null;
  customerEmail: string;
  timestamp: string;
  cartItemCount: number;
  cartValue: number;
  cartItems: FunnelVisitorActivity["cartItems"];
  outcome: "paid" | "order_unpaid" | "no_order";
  orderId: string | null;
  orderReference: string | null;
};
// The other half of the same question -- visitors who had a cart or
// reached checkout but never gave a name/email at all, so there's no one
// to identify or follow up with individually. Aggregated rather than
// listed per-visitor for exactly that reason.
export type AnonymousDropoffSummary = {
  count: number;
  totalCartValue: number;
  topProducts: { name: string; count: number }[];
};
export type CheckoutFunnelAnalytics = {
  rangeDays: number;
  totals: {
    reachedCheckout: number;
    filledDeliveryDetails: number;
    clickedPayNow: number;
    paidOrders: number;
    retries: number;
    paymentMethodSwitches: number;
    shippingMethodSwitches: number;
  };
  paymentMethodSelections: CheckoutFunnelCount[];
  shippingOptionSelections: CheckoutFunnelCount[];
  dailySeries: CheckoutFunnelDailyPoint[];
  identifiedLeads: IdentifiedCheckoutLead[];
  anonymousDropoff: AnonymousDropoffSummary;
};

const CHECKOUT_FUNNEL_EVENT_TYPES = [
  "checkout_delivery_details_filled",
  "checkout_pay_clicked",
  "checkout_payment_retry",
] as const;

/* Breaks down what happens on the checkout page itself, day by day --
   companion to getFullAnalytics above (which already covers reachedCheckout/
   orders at the session level) but reading the granular events
   CheckoutPageClient.tsx now fires (see lib/use-live-visitor-ping.ts's own
   comment on each one) so a seller can see not just "conversion went down"
   but WHERE in the form people are dropping off, and which payment/
   shipping method they were actually choosing when it happened.

   Payment/shipping method breakdowns are derived from checkout_pay_clicked's
   own metadata (what was selected at the moment a customer actually
   committed, i.e. clicked Pay Now), NOT from a separate "fires on every
   click" selection event -- an earlier version of this did that and it
   recorded pure noise (clicking through payment options while just
   looking, and a render-order artifact that logged "eft" as a real
   selection on stores where EFT isn't even enabled). Method switches
   are visitors whose checkout_pay_clicked attempts (multiple = a retry
   happened) used a different payment/shipping method than their first
   attempt -- grouped by visitor_id, in chronological order.

   Reads store_visitor_events directly (not the storefront_funnel_hourly
   rollup) -- that rollup only stores per-event-type counts, not the
   metadata (which payment method, etc.) this needs, and store_visitor_events_seller_type_time_idx
   covers exactly this query shape: seller_id + event_type IN (...) +
   created_at range. Finer-grained hour-by-hour analysis beyond what this
   daily chart shows is still available by querying storefront_funnel_hourly
   directly.

   Also answers the two questions the stage counts alone can't: who's
   actually behind "filled in details" (identifiedLeads -- name, email,
   cart contents, and what became of it: paid / order placed but unpaid /
   never placed at all), and how much is walking away anonymously
   (anonymousDropoff -- nobody to name, but still a real cart value and
   real products). Identity/cart snapshot per visitor is sourced the same
   way the abandoned-checkout-email cron already does: store_visitor_sessions
   for the authoritative reached_checkout flag and identity (updated live
   as a customer types, unlike a one-off event row), enriched with the most
   recent store_visitor_events row that actually carried cart_items for
   that same visitor. */
export async function getCheckoutFunnelAnalytics(admin: SupabaseClient, sellerId: string, range: { startDate: string; endDate: string }): Promise<CheckoutFunnelAnalytics> {
  // Bounded to a year so a custom range picked far too wide (e.g. "all
  // time") can't turn this into an unbounded full-table scan -- every
  // query below is a real-time read, not a pre-aggregated rollup.
  const MAX_RANGE_DAYS = 366;
  const dateStrings = dateStringsBetween(range.startDate, range.endDate).slice(-MAX_RANGE_DAYS);
  const startDate = dateStrings[0];
  const endDate = dateStrings[dateStrings.length - 1];
  const rangeStartIso = sastDayStartUtc(startDate).toISOString();
  // Exclusive upper bound: the instant SAST midnight begins on the day
  // AFTER endDate, so activity anywhere during endDate itself is included.
  const rangeEndIso = new Date(sastDayStartUtc(endDate).getTime() + 86_400_000).toISOString();

  const events = await fetchAllRows<{ event_type: string; created_at: string; event_metadata: Record<string, unknown> | null; visitor_id: string | null }>(
    admin, "store_visitor_events", "event_type, created_at, event_metadata, visitor_id", (q) =>
      q.eq("seller_id", sellerId).in("event_type", CHECKOUT_FUNNEL_EVENT_TYPES as unknown as string[]).gte("created_at", rangeStartIso).lt("created_at", rangeEndIso)
  );

  const dailyMap = new Map(dateStrings.map((d) => [d, { reachedCheckout: 0, filledDeliveryDetails: 0, clickedPayNow: 0, paidOrders: 0 }]));
  const paymentMethodCounts = new Map<string, number>();
  const shippingOptionCounts = new Map<string, number>();
  const payClicksByVisitor = new Map<string, { created_at: string; paymentMethod: string | null; shippingOption: string | null }[]>();
  let filledDeliveryDetails = 0, clickedPayNow = 0, retries = 0;

  for (const e of events) {
    const d = sastDateOf(e.created_at);
    const bucket = dailyMap.get(d);
    const meta = e.event_metadata || {};
    switch (e.event_type) {
      case "checkout_delivery_details_filled":
        filledDeliveryDetails++;
        if (bucket) bucket.filledDeliveryDetails++;
        break;
      case "checkout_pay_clicked": {
        clickedPayNow++;
        if (bucket) bucket.clickedPayNow++;
        const method = typeof meta.paymentMethod === "string" ? meta.paymentMethod : "unknown";
        paymentMethodCounts.set(method, (paymentMethodCounts.get(method) || 0) + 1);
        if (typeof meta.shippingOption === "string") shippingOptionCounts.set(meta.shippingOption, (shippingOptionCounts.get(meta.shippingOption) || 0) + 1);
        if (e.visitor_id) {
          const list = payClicksByVisitor.get(e.visitor_id) || [];
          list.push({ created_at: e.created_at, paymentMethod: typeof meta.paymentMethod === "string" ? meta.paymentMethod : null, shippingOption: typeof meta.shippingOption === "string" ? meta.shippingOption : null });
          payClicksByVisitor.set(e.visitor_id, list);
        }
        break;
      }
      case "checkout_payment_retry":
        retries++;
        break;
    }
  }

  let paymentMethodSwitches = 0, shippingMethodSwitches = 0;
  for (const clicks of payClicksByVisitor.values()) {
    if (clicks.length < 2) continue;
    clicks.sort((a, b) => a.created_at.localeCompare(b.created_at));
    if (clicks.some((c) => c.paymentMethod && c.paymentMethod !== clicks[0].paymentMethod)) paymentMethodSwitches++;
    if (clicks.some((c) => c.shippingOption && c.shippingOption !== clicks[0].shippingOption)) shippingMethodSwitches++;
  }

  // reachedCheckout/paidOrders reuse the exact same source data
  // getFullAnalytics already draws on (store_visitor_sessions.reached_checkout,
  // paid orders), rather than re-deriving them from the event log, so this
  // card's numbers always agree with the rest of the Analytics tab.
  //
  // The full session rows (not just reached_checkout) are also this
  // function's source of identity for identifiedLeads/anonymousDropoff
  // below -- fetched once here and reused, rather than a second query.
  const [sessionsRes, orders, dropoffEventRows] = await Promise.all([
    admin.from("store_visitor_sessions").select("visitor_id, session_date, customer_name, customer_email, had_cart, reached_checkout").eq("seller_id", sellerId).gte("session_date", startDate).lte("session_date", endDate),
    // Orders placed up to 3 days after the range ends still count as this
    // range's outcome -- someone who reached checkout on the last day of a
    // custom range and paid the next morning shouldn't show as "no_order".
    fetchAllRows<{ id: string; order_number: number | string | null; external_id: string | null; customer_email: string | null; payment_status: string; created_at: string }>(
      admin, "orders", "id, order_number, external_id, customer_email, payment_status, created_at", (q) =>
        q.eq("seller_id", sellerId).gte("created_at", rangeStartIso).lt("created_at", new Date(new Date(rangeEndIso).getTime() + 3 * 86_400_000).toISOString())
    ),
    fetchAllRows<{ visitor_id: string; customer_name: string | null; customer_email: string | null; cart_item_count: number; cart_value: number; cart_items: unknown; created_at: string }>(
      admin, "store_visitor_events", "visitor_id, customer_name, customer_email, cart_item_count, cart_value, cart_items, created_at", (q) =>
        q.eq("seller_id", sellerId).in("event_type", ["add_to_cart", "reached_checkout"]).gte("created_at", rangeStartIso).lt("created_at", rangeEndIso).order("created_at", { ascending: false })
    ),
  ]);
  const sessionRowsInRange = sessionsRes.data || [];
  let reachedCheckoutTotal = 0;
  for (const row of sessionRowsInRange) {
    if (!row.reached_checkout) continue;
    reachedCheckoutTotal++;
    const bucket = dailyMap.get(row.session_date);
    if (bucket) bucket.reachedCheckout++;
  }
  let paidOrdersTotal = 0;
  for (const o of orders) {
    if (o.payment_status !== "paid" || new Date(o.created_at) >= new Date(rangeEndIso)) continue;
    paidOrdersTotal++;
    const bucket = dailyMap.get(sastDateOf(o.created_at));
    if (bucket) bucket.paidOrders++;
  }

  // Most recent cart snapshot per visitor within the range -- dropoffEventRows
  // is already sorted newest-first, so the first row seen per visitor_id
  // wins, same "latest wins" technique the abandoned-checkout-email cron
  // uses to find real cart_items for a given visitor.
  const latestCartByVisitor = new Map<string, (typeof dropoffEventRows)[number]>();
  for (const row of dropoffEventRows) {
    if (!latestCartByVisitor.has(row.visitor_id)) latestCartByVisitor.set(row.visitor_id, row);
  }

  // One snapshot per visitor who had a cart or reached checkout during the
  // range, combining store_visitor_sessions' authoritative identity/flags
  // with whichever event row carried the most complete cart_items.
  type VisitorSnapshot = { visitorId: string; name: string | null; email: string | null; cartItemCount: number; cartValue: number; cartItems: FunnelVisitorActivity["cartItems"]; timestamp: string };
  const snapshotByVisitor = new Map<string, VisitorSnapshot>();
  for (const row of sessionRowsInRange) {
    if (!row.had_cart && !row.reached_checkout) continue;
    const cart = latestCartByVisitor.get(row.visitor_id);
    const existing = snapshotByVisitor.get(row.visitor_id);
    snapshotByVisitor.set(row.visitor_id, {
      visitorId: row.visitor_id,
      name: row.customer_name || existing?.name || null,
      email: row.customer_email || existing?.email || null,
      cartItemCount: Number(cart?.cart_item_count ?? existing?.cartItemCount ?? 0),
      cartValue: Number(cart?.cart_value ?? existing?.cartValue ?? 0),
      cartItems: (Array.isArray(cart?.cart_items) ? cart!.cart_items : existing?.cartItems || []) as FunnelVisitorActivity["cartItems"],
      timestamp: cart?.created_at || existing?.timestamp || sastDayStartUtc(row.session_date).toISOString(),
    });
  }

  const orderByEmail = new Map<string, (typeof orders)[number]>();
  for (const o of orders) {
    const email = (o.customer_email || "").trim().toLowerCase();
    if (!email) continue;
    const existing = orderByEmail.get(email);
    // Prefer a paid order over an unpaid one if a visitor somehow has both
    // (e.g. an abandoned attempt followed by a successful retry).
    if (!existing || o.payment_status === "paid") orderByEmail.set(email, o);
  }

  const identifiedLeads: IdentifiedCheckoutLead[] = [];
  let anonymousCount = 0;
  let anonymousCartValueTotal = 0;
  const anonymousProductCounts = new Map<string, number>();
  for (const snap of snapshotByVisitor.values()) {
    if (snap.email) {
      const order = orderByEmail.get(snap.email.trim().toLowerCase()) || null;
      identifiedLeads.push({
        visitorId: snap.visitorId,
        customerName: snap.name,
        customerEmail: snap.email,
        timestamp: snap.timestamp,
        cartItemCount: snap.cartItemCount,
        cartValue: snap.cartValue,
        cartItems: snap.cartItems,
        outcome: !order ? "no_order" : order.payment_status === "paid" ? "paid" : "order_unpaid",
        orderId: order?.id || null,
        orderReference: order ? (order.external_id ? String(order.external_id).replace(/^#?/, "#") : order.order_number != null ? `#${order.order_number}` : null) : null,
      });
    } else {
      anonymousCount++;
      anonymousCartValueTotal += snap.cartValue;
      for (const item of snap.cartItems) {
        if (!item?.name) continue;
        anonymousProductCounts.set(item.name, (anonymousProductCounts.get(item.name) || 0) + (Number(item.qty) || 1));
      }
    }
  }
  identifiedLeads.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));
  const anonymousDropoff: AnonymousDropoffSummary = {
    count: anonymousCount,
    totalCartValue: anonymousCartValueTotal,
    topProducts: Array.from(anonymousProductCounts.entries()).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 10),
  };

  return {
    rangeDays: dateStrings.length,
    totals: {
      reachedCheckout: reachedCheckoutTotal,
      filledDeliveryDetails,
      clickedPayNow,
      paidOrders: paidOrdersTotal,
      retries,
      paymentMethodSwitches,
      shippingMethodSwitches,
    },
    paymentMethodSelections: Array.from(paymentMethodCounts.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    shippingOptionSelections: Array.from(shippingOptionCounts.entries()).map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    dailySeries: dateStrings.map((d) => ({ date: d, ...(dailyMap.get(d) || { reachedCheckout: 0, filledDeliveryDetails: 0, clickedPayNow: 0, paidOrders: 0 }) })),
    identifiedLeads,
    anonymousDropoff,
  };
}

export type TrafficSourceRow = { source: string; visitors: number; orders: number; paidOrders: number; revenue: number };
export type TrafficSourceOrder = { orderId: string; orderReference: string | null; customerName: string | null; customerEmail: string | null; total: number; paymentStatus: string; source: string; timestamp: string };
export type TrafficSourceAnalytics = {
  rangeDays: number;
  totals: { visitors: number; orders: number; paidOrders: number; revenue: number };
  sources: TrafficSourceRow[];
  dailySeries: { date: string; visitors: number; orders: number }[];
  recentOrders: TrafficSourceOrder[];
};

const TRAFFIC_ORDERS_LIMIT = 200;

/* Where visitors and orders actually come from -- Google, WhatsApp,
   Instagram, a raw UTM-tagged link, or someone just typing the URL
   directly ("direct"). Two independent signals, both first-touch and both
   captured client-side (see lib/traffic-attribution.ts), read here rather
   than joined at query time so this still works even if a visitor's
   attribution row is later pruned:

   - store_visitor_attribution: one row per visitor, written by the very
     first heartbeat that visitor ever sends (ignoreDuplicates on
     (seller_id, visitor_id) enforces "first touch wins"). Counted here by
     first_seen_at falling inside the selected range, i.e. "new visitors
     from this source during this window".
   - orders.traffic_source / traffic_attribution: denormalized onto the
     order itself at place-order time from the client's own cached
     attribution value, so an order's source is a permanent fact about
     that order that survives independently of the table above.

   A visitor's first-touch source and the source recorded on an order they
   place later in the same session should usually agree, but this
   deliberately doesn't require it -- an order with no traffic_source
   (placed before this feature shipped, or by a return visitor whose
   original attribution row predates the retention window) simply buckets
   under "unknown" rather than being silently dropped from the totals. */
export async function getTrafficSourceAnalytics(admin: SupabaseClient, sellerId: string, range: { startDate: string; endDate: string }): Promise<TrafficSourceAnalytics> {
  const MAX_RANGE_DAYS = 366;
  const dateStrings = dateStringsBetween(range.startDate, range.endDate).slice(-MAX_RANGE_DAYS);
  const startDate = dateStrings[0];
  const endDate = dateStrings[dateStrings.length - 1];
  const rangeStartIso = sastDayStartUtc(startDate).toISOString();
  const rangeEndIso = new Date(sastDayStartUtc(endDate).getTime() + 86_400_000).toISOString();

  const [attributionRows, orders] = await Promise.all([
    fetchAllRows<{ visitor_id: string; source: string; first_seen_at: string }>(
      admin, "store_visitor_attribution", "visitor_id, source, first_seen_at", (q) =>
        q.eq("seller_id", sellerId).gte("first_seen_at", rangeStartIso).lt("first_seen_at", rangeEndIso)
    ),
    fetchAllRows<{ id: string; order_number: number | string | null; external_id: string | null; customer_name: string | null; customer_email: string | null; total: number; payment_status: string; traffic_source: string | null; created_at: string }>(
      admin, "orders", "id, order_number, external_id, customer_name, customer_email, total, payment_status, traffic_source, created_at", (q) =>
        q.eq("seller_id", sellerId).gte("created_at", rangeStartIso).lt("created_at", rangeEndIso)
    ),
  ]);

  const dailyMap = new Map(dateStrings.map((d) => [d, { visitors: 0, orders: 0 }]));
  const sourceMap = new Map<string, TrafficSourceRow>();
  const ensureSource = (key: string): TrafficSourceRow => {
    let row = sourceMap.get(key);
    if (!row) { row = { source: key, visitors: 0, orders: 0, paidOrders: 0, revenue: 0 }; sourceMap.set(key, row); }
    return row;
  };

  for (const row of attributionRows) {
    ensureSource(row.source || "direct").visitors++;
    const bucket = dailyMap.get(sastDateOf(row.first_seen_at));
    if (bucket) bucket.visitors++;
  }

  let ordersTotal = 0, paidOrdersTotal = 0, revenueTotal = 0;
  const recentOrders: TrafficSourceOrder[] = [];
  for (const o of orders) {
    const source = o.traffic_source || "unknown";
    const row = ensureSource(source);
    row.orders++;
    ordersTotal++;
    const bucket = dailyMap.get(sastDateOf(o.created_at));
    if (bucket) bucket.orders++;
    if (o.payment_status === "paid") {
      row.paidOrders++;
      row.revenue += Number(o.total || 0);
      paidOrdersTotal++;
      revenueTotal += Number(o.total || 0);
    }
    recentOrders.push({
      orderId: o.id,
      orderReference: o.external_id ? String(o.external_id).replace(/^#?/, "#") : o.order_number != null ? `#${o.order_number}` : null,
      customerName: o.customer_name,
      customerEmail: o.customer_email,
      total: Number(o.total || 0),
      paymentStatus: o.payment_status,
      source,
      timestamp: o.created_at,
    });
  }
  recentOrders.sort((a, b) => +new Date(b.timestamp) - +new Date(a.timestamp));

  return {
    rangeDays: dateStrings.length,
    totals: { visitors: attributionRows.length, orders: ordersTotal, paidOrders: paidOrdersTotal, revenue: revenueTotal },
    sources: Array.from(sourceMap.values()).sort((a, b) => b.visitors - a.visitors || b.orders - a.orders),
    dailySeries: dateStrings.map((d) => ({ date: d, ...(dailyMap.get(d) || { visitors: 0, orders: 0 }) })),
    recentOrders: recentOrders.slice(0, TRAFFIC_ORDERS_LIMIT),
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
