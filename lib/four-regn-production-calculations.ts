export const PRODUCTION_BATCH_STATUSES = ["Draft", "Buying", "Printing", "Packing", "Complete", "Archived"] as const;
export const PRODUCTION_SIZES = ["S", "M", "L", "XL", "2XL", "3XL", "4XL"] as const;
export const DEFAULT_PRODUCTION_COSTS = { tee_material: 40, tee_production: 30, hoodie: 175, a3_plus: 60, a4: 25, aramex: 90, paxi: 60 } as const;

export type ProductionOrder = {
  id: string; batch_id: string; customer_name: string; order_reference?: string | null; design_name: string;
  custom_print: boolean; design_ready: boolean; garment_type: "tee" | "hoodie"; colour: string;
  customer_size: string; supplier_size: string; print_size: "a3_plus" | "a4"; delivery_method: "aramex" | "paxi";
  tee_material_cost: number; tee_production_cost: number; hoodie_cost: number; a3_plus_cost: number; a4_cost: number; aramex_cost: number; paxi_cost: number;
  material_complete: boolean; production_complete: boolean; garment_complete: boolean; printing_complete: boolean; delivery_complete: boolean;
  created_at: string; updated_at: string;
};
export type CostComponent = { key: string; label: string; detail: string; value: number; complete: boolean };

export function orderCostComponents(order: ProductionOrder): CostComponent[] {
  const garment = order.garment_type === "tee"
    ? [
        { key: "material_complete", label: "Tee material", detail: `${order.colour} • ${order.supplier_size}`, value: Number(order.tee_material_cost), complete: order.material_complete },
        { key: "production_complete", label: "Tee production", detail: "Cut / make garment", value: Number(order.tee_production_cost), complete: order.production_complete },
      ]
    : [{ key: "garment_complete", label: "Hoodie garment", detail: `${order.colour} • ${order.supplier_size}`, value: Number(order.hoodie_cost), complete: order.garment_complete }];
  return [
    ...garment,
    { key: "delivery_complete", label: "Delivery", detail: order.delivery_method === "paxi" ? "PAXI" : "Aramex", value: order.delivery_method === "paxi" ? Number(order.paxi_cost) : Number(order.aramex_cost), complete: order.delivery_complete },
    { key: "printing_complete", label: "Printing", detail: order.print_size === "a4" ? "A4" : "A3+", value: order.print_size === "a4" ? Number(order.a4_cost) : Number(order.a3_plus_cost), complete: order.printing_complete },
  ];
}
export function orderTotals(order: ProductionOrder) {
  const components = orderCostComponents(order);
  const total = components.reduce((sum, component) => sum + component.value, 0);
  const paid = components.filter((component) => component.complete).reduce((sum, component) => sum + component.value, 0);
  return { total, paid, remaining: total - paid, complete: order.design_ready && components.every((component) => component.complete) };
}
export function batchTotals(orders: ProductionOrder[]) {
  return orders.reduce((totals, order) => { const value = orderTotals(order); totals.total += value.total; totals.paid += value.paid; totals.remaining += value.remaining; if (value.complete) totals.complete++; return totals; }, { total: 0, paid: 0, remaining: 0, complete: 0 });
}
export function suggestSupplierSize(garment: "tee" | "hoodie", customerSize: string) {
  if (garment === "tee") return customerSize;
  return ({ S: "M", M: "L", L: "XL", XL: "2XL", "2XL": "3XL", "3XL": "4XL", "4XL": "4XL" } as Record<string, string>)[customerSize] || customerSize;
}
