export const FOUR_REGN_TRACKING_STAGES = [
  { key: "confirmed", label: "Confirmed", copy: "Your payment was received and your order was successfully confirmed." },
  { key: "processing", label: "Processing", copy: "Your order moved into preparation and your items are being prepared for dispatch." },
  { key: "shipped", label: "Shipped", copy: "Your parcel has been packed and marked as shipped by 4REGN. It is now waiting for courier pickup." },
  { key: "picked_up", label: "Picked up by courier", copy: "The courier has collected your parcel from 4REGN." },
  { key: "in_transit", label: "In transit", copy: "Your parcel is moving through the courier network toward your delivery area." },
  { key: "out_for_delivery", label: "Out for delivery", copy: "Your parcel is with the driver and is scheduled for delivery." },
  { key: "delivered", label: "Delivered", copy: "Your order has been delivered successfully." },
] as const;

export const FOUR_REGN_TRACKABLE_STATUSES = FOUR_REGN_TRACKING_STAGES.map((stage) => stage.key);

type TrackingOrder = {
  status?: string | null;
  payment_status?: string | null;
  tracking_updated_at?: string | null;
  created_at?: string | null;
  shipping_option?: string | null;
  customer_tracking_note?: string | null;
};

type TrackingHistoryEntry = { status: string; occurred_at: string };

export function buildFourRegnTracking(order: TrackingOrder, history: TrackingHistoryEntry[] = []) {
  const rawStatus = String(order.status || "pending").toLowerCase();
  const status = rawStatus === "pending" && order.payment_status === "paid" ? "confirmed" : rawStatus;
  const cancelled = status === "cancelled";
  const currentIndex = FOUR_REGN_TRACKING_STAGES.findIndex((stage) => stage.key === status);

  // orders.tracking_updated_at is a single column -- it only ever holds
  // the timestamp of whichever status change happened MOST RECENTLY, so
  // moving from "picked_up" to "in_transit" overwrites picked_up's own
  // timestamp with in_transit's. order_tracking_history (see
  // supabase/migrations/20260904_order_tracking_history.sql) is the real,
  // append-only per-status log that doesn't have this problem -- take the
  // latest logged occurred_at per stage from there when one exists.
  const latestByStage = new Map<string, string>();
  for (const entry of history) {
    const existing = latestByStage.get(entry.status);
    if (!existing || new Date(entry.occurred_at).getTime() > new Date(existing).getTime()) {
      latestByStage.set(entry.status, entry.occurred_at);
    }
  }

  return {
    status,
    statusLabel: cancelled ? "Cancelled" : currentIndex >= 0 ? FOUR_REGN_TRACKING_STAGES[currentIndex].label : "Order received",
    cancelled,
    updatedAt: order.tracking_updated_at || order.created_at || null,
    shippingOption: order.shipping_option || null,
    customerNote: String(order.customer_tracking_note || "").trim() || null,
    stages: FOUR_REGN_TRACKING_STAGES.map((stage, index) => {
      const complete = !cancelled && currentIndex >= 0 && index <= currentIndex;
      const current = !cancelled && index === currentIndex;
      // Falls back to the old single-timestamp behaviour only when no
      // history row covers this stage yet (an update made before that
      // table existed, or the table hasn't been migrated in this project) --
      // same shape the customer tracking page already rendered, so an
      // order with no history at all looks exactly as it did before.
      const fallback = current ? order.tracking_updated_at || order.created_at || null : index === 0 && complete ? order.created_at || null : null;
      return { ...stage, complete, current, occurredAt: latestByStage.get(stage.key) || fallback };
    }),
  };
}

export function isFourRegnOrderTrackable(order: TrackingOrder) {
  return order.payment_status === "paid" || FOUR_REGN_TRACKABLE_STATUSES.includes(String(order.status || "") as typeof FOUR_REGN_TRACKABLE_STATUSES[number]);
}
