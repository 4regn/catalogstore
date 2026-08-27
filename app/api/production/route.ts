/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unused-vars */
import { NextRequest, NextResponse } from "next/server";
import {
  DEFAULT_PRODUCTION_COSTS,
  PRODUCTION_BATCH_STATUSES,
  PRODUCTION_SIZES,
  cleanMoney,
  cleanText,
  requireFourRegnProductionAdmin,
} from "../../../lib/four-regn-production";
import { getAdmin } from "../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

async function addActivity(sellerId: string, userId: string, batchId: string, orderId: string | null, action: string, details: Record<string, unknown> = {}) {
  await getAdmin().from("production_order_activity").insert({ seller_id: sellerId, actor_user_id: userId, batch_id: batchId, order_id: orderId, action, details });
}

async function ownedBatch(sellerId: string, batchId: string) {
  const { data } = await getAdmin().from("production_batches").select("*").eq("seller_id", sellerId).eq("id", batchId).maybeSingle();
  return data;
}

function validUuid(value: unknown) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function GET(req: NextRequest) {
  const auth = await requireFourRegnProductionAdmin(req);
  if (!auth.ok) return auth.response;
  const admin = getAdmin();
  let { data: settings } = await admin.from("production_cost_settings").select("*").eq("seller_id", auth.sellerId).maybeSingle();
  if (!settings) {
    const created = await admin.from("production_cost_settings").insert({ seller_id: auth.sellerId, ...DEFAULT_PRODUCTION_COSTS }).select("*").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 500 });
    settings = created.data;
  }
  const [batches, orders, activity] = await Promise.all([
    admin.from("production_batches").select("*").eq("seller_id", auth.sellerId).order("updated_at", { ascending: false }),
    admin.from("production_batch_orders").select("*").eq("seller_id", auth.sellerId).order("created_at", { ascending: true }),
    admin.from("production_order_activity").select("*").eq("seller_id", auth.sellerId).order("created_at", { ascending: false }).limit(500),
  ]);
  const error = batches.error || orders.error || activity.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ settings, batches: batches.data || [], orders: orders.data || [], activity: activity.data || [] });
}

export async function POST(req: NextRequest) {
  const auth = await requireFourRegnProductionAdmin(req);
  if (!auth.ok) return auth.response;
  const admin = getAdmin();
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }
  const action = cleanText(body?.action, 40);

  if (action === "save_settings") {
    const row = Object.fromEntries(Object.keys(DEFAULT_PRODUCTION_COSTS).map((key) => [key, cleanMoney(body.settings?.[key], DEFAULT_PRODUCTION_COSTS[key as keyof typeof DEFAULT_PRODUCTION_COSTS])]));
    const result = await admin.from("production_cost_settings").upsert({ seller_id: auth.sellerId, ...row }, { onConflict: "seller_id" }).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json({ settings: result.data });
  }

  if (action === "create_batch") {
    const name = cleanText(body.name, 160);
    const status = PRODUCTION_BATCH_STATUSES.includes(body.status) ? body.status : "Draft";
    if (!name) return NextResponse.json({ error: "Batch name is required" }, { status: 400 });
    const result = await admin.from("production_batches").insert({ seller_id: auth.sellerId, created_by: auth.userId, name, notes: cleanText(body.notes, 4000), status }).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await addActivity(auth.sellerId, auth.userId, result.data.id, null, "Batch created", { status });
    return NextResponse.json({ batch: result.data });
  }

  const batchId = body.batch_id;
  if (!validUuid(batchId) || !(await ownedBatch(auth.sellerId, batchId))) return NextResponse.json({ error: "Batch not found" }, { status: 404 });

  if (action === "update_batch") {
    const patch: Record<string, unknown> = {};
    if (body.name !== undefined) { const name = cleanText(body.name, 160); if (!name) return NextResponse.json({ error: "Batch name is required" }, { status: 400 }); patch.name = name; }
    if (body.notes !== undefined) patch.notes = cleanText(body.notes, 4000);
    if (PRODUCTION_BATCH_STATUSES.includes(body.status)) {
      patch.status = body.status;
      patch.archived_at = body.status === "Archived" ? new Date().toISOString() : null;
    }
    const result = await admin.from("production_batches").update(patch).eq("seller_id", auth.sellerId).eq("id", batchId).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await addActivity(auth.sellerId, auth.userId, batchId, null, "Batch updated", patch);
    return NextResponse.json({ batch: result.data });
  }

  if (action === "delete_batch") {
    const result = await admin.from("production_batches").delete().eq("seller_id", auth.sellerId).eq("id", batchId);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "duplicate_batch") {
    const original = await ownedBatch(auth.sellerId, batchId);
    const sourceOrders = await admin.from("production_batch_orders").select("*").eq("seller_id", auth.sellerId).eq("batch_id", batchId).order("created_at");
    const created = await admin.from("production_batches").insert({ seller_id: auth.sellerId, created_by: auth.userId, name: `${original.name} — Copy`.slice(0, 160), notes: original.notes, status: "Draft" }).select("*").single();
    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 });
    if (sourceOrders.data?.length) {
      const copies = sourceOrders.data.map(({ id, created_at, updated_at, ...order }) => ({ ...order, batch_id: created.data.id, material_complete: false, production_complete: false, garment_complete: false, printing_complete: false, delivery_complete: false }));
      const copied = await admin.from("production_batch_orders").insert(copies).select("*");
      if (copied.error) { await admin.from("production_batches").delete().eq("id", created.data.id); return NextResponse.json({ error: copied.error.message }, { status: 400 }); }
      await addActivity(auth.sellerId, auth.userId, created.data.id, null, "Batch duplicated", { source_batch_id: batchId });
      return NextResponse.json({ batch: created.data, orders: copied.data });
    }
    return NextResponse.json({ batch: created.data, orders: [] });
  }

  if (action === "save_order") {
    const orderId = validUuid(body.order?.id) ? body.order.id : null;
    const existingResult = orderId ? await admin.from("production_batch_orders").select("*").eq("seller_id", auth.sellerId).eq("batch_id", batchId).eq("id", orderId).maybeSingle() : null;
    const existing = existingResult?.data;
    if (orderId && !existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    const { data: settings } = await admin.from("production_cost_settings").select("*").eq("seller_id", auth.sellerId).single();
    const input = body.order || {};
    const garmentType = input.garment_type === "hoodie" ? "hoodie" : "tee";
    const customerName = cleanText(input.customer_name, 160);
    const designName = cleanText(input.design_name, 180);
    const colour = cleanText(input.colour, 80);
    if (!customerName || !designName || !colour) return NextResponse.json({ error: "Customer, design and colour are required" }, { status: 400 });
    let sourceOrderId: string | null = null;
    if (validUuid(input.source_order_id)) {
      const { data: sourceOrder } = await admin.from("orders").select("id").eq("seller_id", auth.sellerId).eq("id", input.source_order_id).maybeSingle();
      if (!sourceOrder) return NextResponse.json({ error: "Linked store order not found" }, { status: 400 });
      sourceOrderId = sourceOrder.id;
    }
    const cost = (key: string) => cleanMoney(input[key], existing?.[key] ?? settings?.[key.replace("_cost", "")] ?? DEFAULT_PRODUCTION_COSTS[key.replace("_cost", "") as keyof typeof DEFAULT_PRODUCTION_COSTS]);
    const row = {
      seller_id: auth.sellerId, batch_id: batchId,
      source_order_id: sourceOrderId,
      customer_name: customerName, order_reference: cleanText(input.order_reference, 100) || null,
      design_name: designName, custom_print: !!input.custom_print, design_ready: !!input.design_ready,
      garment_type: garmentType, colour,
      customer_size: PRODUCTION_SIZES.includes(input.customer_size) ? input.customer_size : "M",
      supplier_size: PRODUCTION_SIZES.includes(input.supplier_size) ? input.supplier_size : "M",
      print_size: input.print_size === "a4" ? "a4" : "a3_plus",
      delivery_method: input.delivery_method === "paxi" ? "paxi" : "aramex",
      tee_material_cost: cost("tee_material_cost"), tee_production_cost: cost("tee_production_cost"), hoodie_cost: cost("hoodie_cost"),
      a3_plus_cost: cost("a3_plus_cost"), a4_cost: cost("a4_cost"), aramex_cost: cost("aramex_cost"), paxi_cost: cost("paxi_cost"),
      material_complete: !!(input.material_complete ?? existing?.material_complete), production_complete: !!(input.production_complete ?? existing?.production_complete),
      garment_complete: !!(input.garment_complete ?? existing?.garment_complete), printing_complete: !!(input.printing_complete ?? existing?.printing_complete), delivery_complete: !!(input.delivery_complete ?? existing?.delivery_complete),
    };
    const result = orderId
      ? await admin.from("production_batch_orders").update(row).eq("seller_id", auth.sellerId).eq("batch_id", batchId).eq("id", orderId).select("*").single()
      : await admin.from("production_batch_orders").insert(row).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await addActivity(auth.sellerId, auth.userId, batchId, result.data.id, existing ? "Order edited" : "Order added", { customer_name: customerName });
    return NextResponse.json({ order: result.data });
  }

  const orderId = body.order_id;
  if (!validUuid(orderId)) return NextResponse.json({ error: "Order not found" }, { status: 404 });
  const existingResult = await admin.from("production_batch_orders").select("*").eq("seller_id", auth.sellerId).eq("batch_id", batchId).eq("id", orderId).maybeSingle();
  const existing = existingResult.data;
  if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

  if (action === "delete_order") {
    const result = await admin.from("production_batch_orders").delete().eq("seller_id", auth.sellerId).eq("batch_id", batchId).eq("id", orderId);
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    await addActivity(auth.sellerId, auth.userId, batchId, null, "Order deleted", { customer_name: existing.customer_name });
    return NextResponse.json({ ok: true });
  }

  if (action === "patch_order") {
    const allowed: Record<string, (value: unknown) => unknown> = {
      design_ready: Boolean, material_complete: Boolean, production_complete: Boolean, garment_complete: Boolean, printing_complete: Boolean, delivery_complete: Boolean,
      print_size: (value) => value === "a4" ? "a4" : "a3_plus",
      delivery_method: (value) => value === "paxi" ? "paxi" : "aramex",
    };
    if (!allowed[body.field]) return NextResponse.json({ error: "Invalid update" }, { status: 400 });
    const nextValue = allowed[body.field](body.value);
    const result = await admin.from("production_batch_orders").update({ [body.field]: nextValue }).eq("seller_id", auth.sellerId).eq("batch_id", batchId).eq("id", orderId).select("*").single();
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 400 });
    const oldValue = existing[body.field];
    const label = body.field.replace(/_/g, " ").replace(/complete$/, "").trim();
    const activity = body.field.endsWith("_complete") ? `${label} ${nextValue ? "marked completed" : "reopened"}` : `${label} changed`;
    await addActivity(auth.sellerId, auth.userId, batchId, orderId, activity, { from: oldValue, to: nextValue });
    return NextResponse.json({ order: result.data });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
