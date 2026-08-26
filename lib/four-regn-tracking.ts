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
