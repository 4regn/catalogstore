export const FOUR_REGN_TRACKING_STAGES = [
  { key: "confirmed", label: "Confirmed", copy: "Your order is confirmed." },
  { key: "processing", label: "Processing", copy: "Your order is being prepared." },
  { key: "shipped", label: "Shipped", copy: "Your order has left 4REGN." },
  { key: "picked_up", label: "Picked up by courier", copy: "A courier has collected your order." },
  { key: "in_transit", label: "In transit", copy: "Your order is on its way to you." },
  { key: "out_for_delivery", label: "Out for delivery", copy: "Your order is out for delivery today." },
  { key: "delivered", label: "Delivered", copy: "Your order has been delivered." },
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

export function buildFourRegnTracking(order: TrackingOrder) {
  const rawStatus = String(order.status || "pending").toLowerCase();
  const status = rawStatus === "pending" && order.payment_status === "paid" ? "confirmed" : rawStatus;
  const cancelled = status === "cancelled";
  const currentIndex = FOUR_REGN_TRACKING_STAGES.findIndex((stage) => stage.key === status);

  return {
    status,
    statusLabel: cancelled ? "Cancelled" : currentIndex >= 0 ? FOUR_REGN_TRACKING_STAGES[currentIndex].label : "Order received",
    cancelled,
    updatedAt: order.tracking_updated_at || order.created_at || null,
    shippingOption: order.shipping_option || null,
    customerNote: String(order.customer_tracking_note || "").trim() || null,
    stages: FOUR_REGN_TRACKING_STAGES.map((stage, index) => ({
      ...stage,
      complete: !cancelled && currentIndex >= 0 && index <= currentIndex,
      current: !cancelled && index === currentIndex,
    })),
  };
}

export function isFourRegnOrderTrackable(order: TrackingOrder) {
  return order.payment_status === "paid" || FOUR_REGN_TRACKABLE_STATUSES.includes(String(order.status || "") as typeof FOUR_REGN_TRACKABLE_STATUSES[number]);
}
