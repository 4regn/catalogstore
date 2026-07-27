import { SupabaseClient } from "@supabase/supabase-js";

// A heartbeat older than this is treated as "gone" (tab closed, navigated
// away without a final ping, etc.) rather than deleted outright -- rows just
// age out of every query's window naturally.
export const LIVE_VISITOR_WINDOW_MS = 2 * 60 * 1000;

export type LiveVisitor = {
  id: string;
  visitor_id: string;
  status: "browsing" | "active_cart" | "checkout";
  path: string | null;
  cart_item_count: number;
  cart_value: number;
  customer_name: string | null;
  customer_email: string | null;
  first_seen_at: string;
  last_seen_at: string;
};

const STATUS_RANK: Record<string, number> = { checkout: 0, active_cart: 1, browsing: 2 };

/* Sellers only ever want to know who's on their store *right now* --
   ordered so the most actionable visitors (mid-checkout, then an active
   cart) surface first regardless of how recently they last pinged. */
export async function getLiveVisitors(admin: SupabaseClient, sellerId: string): Promise<LiveVisitor[]> {
  const cutoff = new Date(Date.now() - LIVE_VISITOR_WINDOW_MS).toISOString();
  const { data, error } = await admin
    .from("store_live_sessions")
    .select("id, visitor_id, status, path, cart_item_count, cart_value, customer_name, customer_email, first_seen_at, last_seen_at")
    .eq("seller_id", sellerId)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(200);
  if (error) {
    console.error("getLiveVisitors: query failed", error);
    return [];
  }
  return ((data || []) as LiveVisitor[]).sort((a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3));
}
