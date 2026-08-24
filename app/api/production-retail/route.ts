/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/supabase-admin";
import { cleanMoney, cleanText, requireFourRegnProductionAdmin } from "@/lib/four-regn-production";

export const dynamic = "force-dynamic";
const DEFAULTS = { sewing_rate: 30, fabric_cost: 40, retail_commission: 30, retail_price: 120 };
const uuid = (v: unknown) => typeof v === "string" && /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(v);
const qty = (v: unknown, allowZero = true) => { const n = Number(v); return Number.isInteger(n) && n >= (allowZero ? 0 : 1) && n <= 100000 ? n : null; };
const iso = (v: unknown, required = true) => { const d = new Date(String(v || "")); return Number.isNaN(d.getTime()) ? (required ? null : undefined) : d.toISOString(); };
const round = (v: number) => Math.round(v * 100) / 100;

async function log(sellerId: string, userId: string, action: string, batchId: string | null, partnerId: string | null, details: Record<string, unknown> = {}) {
  await getAdmin().from("production_retail_activity").insert({ seller_id: sellerId, actor_user_id: userId, action, batch_id: batchId, partner_id: partnerId, details });
}

async function ownedBatch(sellerId: string, id: unknown) {
  if (!uuid(id)) return null;
  const { data } = await getAdmin().from("sewing_batches").select("*").eq("seller_id", sellerId).eq("id", id).maybeSingle();
  return data;
}

async function ownedPartner(sellerId: string, id: unknown) {
  if (!uuid(id)) return null;
  const { data } = await getAdmin().from("retail_partners").select("*").eq("seller_id", sellerId).eq("id", id).maybeSingle();
  return data;
}

function normalizedItems(input: unknown, fields: string[]) {
  if (!Array.isArray(input) || !input.length) return null;
  const seen = new Set<string>();
  const rows: any[] = [];
  for (const raw of input) {
    const itemId = cleanText(raw?.batch_item_id, 40);
    if (!uuid(itemId) || seen.has(itemId)) return null;
    const row: any = { batch_item_id: itemId };
    for (const field of fields) {
      const parsed = qty(raw?.[field]);
      if (parsed === null) return null;
      row[field] = parsed;
    }
    seen.add(itemId); rows.push(row);
  }
  return rows;
}

async function snapshot(sellerId: string, range = "all") {
  const db = getAdmin();
  let { data: settings } = await db.from("production_retail_settings").select("*").eq("seller_id", sellerId).maybeSingle();
  if (!settings) {
    const made = await db.from("production_retail_settings").insert({ seller_id: sellerId, ...DEFAULTS }).select("*").single();
    if (made.error) throw made.error; settings = made.data;
  }
  const results = await Promise.all([
    db.from("sewing_batches").select("*").eq("seller_id", sellerId).order("fabric_sent_at", { ascending: false }),
    db.from("sewing_batch_items").select("*"), db.from("sewing_reports").select("*"), db.from("sewing_report_items").select("*"),
    db.from("sewing_receipts").select("*"), db.from("sewing_receipt_items").select("*"),
    db.from("sewing_payments").select("*").eq("seller_id", sellerId).order("paid_at", { ascending: false }),
    db.from("retail_allocations").select("*").eq("seller_id", sellerId).order("allocated_at", { ascending: false }), db.from("retail_allocation_items").select("*"),
    db.from("retail_collections").select("*").eq("seller_id", sellerId).order("collected_at", { ascending: false }), db.from("retail_collection_items").select("*"),
    db.from("production_inventory_movements").select("*").eq("seller_id", sellerId).order("occurred_at", { ascending: false }).limit(5000),
    db.from("retail_partners").select("*").eq("seller_id", sellerId).neq("status", "Archived").order("name"),
    db.from("production_retail_activity").select("*").eq("seller_id", sellerId).order("created_at", { ascending: false }).limit(3000),
  ]);
  const error = results.find(r => r.error)?.error; if (error) throw error;
  const [batchesR, itemsR, reportsR, reportItemsR, receiptsR, receiptItemsR, paymentsR, allocationsR, allocationItemsR, collectionsR, collectionItemsR, movementsR, partnersR, activityR] = results;
  const batchesRaw = batchesR.data || [], items = itemsR.data || [], reports = reportsR.data || [], reportItems = reportItemsR.data || [], receipts = receiptsR.data || [], receiptItems = receiptItemsR.data || [], payments = paymentsR.data || [], allocations = allocationsR.data || [], allAllocationItems = allocationItemsR.data || [], collections = collectionsR.data || [], allCollectionItems = collectionItemsR.data || [];
  const batchIds = new Set(batchesRaw.map((b:any) => b.id));
  const ownItems = items.filter((x:any) => batchIds.has(x.batch_id));
  const reportIds = new Set(reports.filter((x:any) => batchIds.has(x.batch_id)).map((x:any) => x.id));
  const receiptIds = new Set(receipts.filter((x:any) => batchIds.has(x.batch_id)).map((x:any) => x.id));
  const allocationById = new Map(allocations.map((x:any) => [x.id, x]));
  const collectionById = new Map(collections.map((x:any) => [x.id, x]));
  const allocationItems = allAllocationItems.filter((x:any)=>allocationById.has(x.allocation_id));
  const collectionItems = allCollectionItems.filter((x:any)=>collectionById.has(x.collection_id));
  const batchItems = ownItems.map((item:any) => {
    const reportItem:any = reportItems.find((x:any) => x.batch_item_id === item.id && reportIds.has(x.report_id));
    const receiptItem:any = receiptItems.find((x:any) => x.batch_item_id === item.id && receiptIds.has(x.receipt_id));
    const alloc4 = allocationItems.filter((x:any) => x.batch_item_id === item.id && allocationById.get(x.allocation_id)?.destination === "4regn").reduce((n:number,x:any)=>n+Number(x.quantity),0);
    const allocRetail = allocationItems.filter((x:any) => x.batch_item_id === item.id && allocationById.get(x.allocation_id)?.destination === "retailer").reduce((n:number,x:any)=>n+Number(x.quantity),0);
    const sold = collectionItems.filter((x:any)=>x.batch_item_id===item.id && collectionById.has(x.collection_id)).reduce((n:number,x:any)=>n+Number(x.quantity_sold),0);
    const received = Number(receiptItem?.received_quantity || 0), defects = Number(receiptItem?.defect_quantity || 0), accepted = Math.max(0, received - defects);
    return { ...item, reported_quantity: Number(reportItem?.reported_quantity || 0), received_quantity: received, defect_quantity: defects, accepted_quantity: accepted, allocated_4regn: alloc4, allocated_retail: allocRetail, sold_retail: sold, unallocated_quantity: accepted - alloc4 - allocRetail };
  });
  const enriched = batchesRaw.map((batch:any) => {
    const variants = batchItems.filter((x:any) => x.batch_id === batch.id), report = reports.find((x:any) => x.batch_id === batch.id) || null, receipt = receipts.find((x:any) => x.batch_id === batch.id) || null;
    const requested = variants.reduce((n:number,x:any)=>n+Number(x.requested_quantity),0), reported = variants.reduce((n:number,x:any)=>n+x.reported_quantity,0), received = variants.reduce((n:number,x:any)=>n+x.received_quantity,0), defects = variants.reduce((n:number,x:any)=>n+x.defect_quantity,0), accepted = variants.reduce((n:number,x:any)=>n+x.accepted_quantity,0);
    const liability = round((receipt ? accepted : requested) * Number(batch.sewing_rate_snapshot));
    const paid = round(payments.filter((x:any)=>x.batch_id===batch.id).reduce((n:number,x:any)=>n+Number(x.amount),0));
    const shortage = Math.max(0, requested - received), surplus = Math.max(0, received - requested), balance = round(liability - paid);
    const status = batch.archived_at ? "Archived" : !report ? "Awaiting tailor update" : !receipt ? "Ready for collection" : balance > .009 ? "Payment due" : balance < -.009 ? "Credit" : "Settled";
    const attention:string[]=[]; if(batch.expected_collection_at && !receipt && new Date(batch.expected_collection_at)<new Date())attention.push("Collection overdue"); if(shortage)attention.push(`${shortage} unit shortage`); if(defects)attention.push(`${defects} defective`); if(balance>0)attention.push(`${balance.toFixed(2)} sewing balance`); if(variants.some((x:any)=>x.unallocated_quantity<0))attention.push("Inventory over-allocated");
    return { ...batch, items: variants, report, receipt, requested, reported, received, defects, accepted, shortage, surplus, sewing_liability: liability, sewing_paid: paid, sewing_balance: balance, status, attention };
  });
  const rangeDays = range === "week" ? 7 : range === "last_week" ? 14 : range === "30" ? 30 : null;
  const now = Date.now(), inRange = (d:string) => { const age=now-new Date(d).getTime(); return !rangeDays || (age<=rangeDays*86400000 && (range!=="last_week" || age>7*86400000)); };
  let rangedCollections = collections.filter((x:any)=>inRange(x.collected_at));
  const rangedCollectionIds = new Set(rangedCollections.map((x:any)=>x.id));
  const rangedItems = collectionItems.filter((x:any)=>rangedCollectionIds.has(x.collection_id));
  const rangedBatches=enriched.filter((x:any)=>inRange(x.fabric_sent_at));
  const totalRequested = rangedBatches.reduce((n:number,x:any)=>n+x.requested,0), totalAccepted = rangedBatches.reduce((n:number,x:any)=>n+x.accepted,0), totalDefects = rangedBatches.reduce((n:number,x:any)=>n+x.defects,0);
  const fabricCost=round(rangedBatches.reduce((n:number,x:any)=>n+x.accepted*Number(x.fabric_cost_snapshot),0));
  const sewingLiability=round(rangedBatches.reduce((n:number,x:any)=>n+x.sewing_liability,0));
  const expectedShare=round(rangedCollections.reduce((n:number,x:any)=>n+Number(x.expected_4regn_share),0));
  const variantPerformance=Array.from(new Set(rangedItems.map((x:any)=>x.batch_item_id))).map(id=>{const item:any=batchItems.find((x:any)=>x.id===id);return{batch_item_id:id,colour:item?.colour||"",size:item?.size||"",units_sold:rangedItems.filter((x:any)=>x.batch_item_id===id).reduce((n:number,x:any)=>n+Number(x.quantity_sold),0)}}).sort((a:any,b:any)=>b.units_sold-a.units_sold);
  const partnerRanking=(partnersR.data||[]).map((p:any)=>{const rows=rangedCollections.filter((x:any)=>x.partner_id===p.id);return{partner_id:p.id,name:p.name,units_sold:rangedItems.filter((x:any)=>rows.some((r:any)=>r.id===x.collection_id)).reduce((n:number,x:any)=>n+Number(x.quantity_sold),0),cash_collected:round(rows.reduce((n:number,x:any)=>n+Number(x.actual_cash_collected),0)),outstanding:round(rows.reduce((n:number,x:any)=>n+Number(x.expected_4regn_share)-Number(x.actual_cash_collected),0))}}).sort((a:any,b:any)=>b.units_sold-a.units_sold);
  const weeklyTrend=Array.from({length:6},(_,i)=>{const end=now-i*7*86400000,start=end-7*86400000,rows=collections.filter((x:any)=>{const t=new Date(x.collected_at).getTime();return t>start&&t<=end});return{week_start:new Date(start).toISOString(),units_sold:collectionItems.filter((x:any)=>rows.some((r:any)=>r.id===x.collection_id)).reduce((n:number,x:any)=>n+Number(x.quantity_sold),0),cash_collected:round(rows.reduce((n:number,x:any)=>n+Number(x.actual_cash_collected),0))}}).reverse();
  const inventory={unallocated:enriched.reduce((n:number,b:any)=>n+b.items.reduce((s:number,x:any)=>s+Math.max(0,x.unallocated_quantity),0),0),allocated_4regn:batchItems.reduce((n:number,x:any)=>n+x.allocated_4regn,0),retailer_stock:batchItems.reduce((n:number,x:any)=>n+Math.max(0,x.allocated_retail-x.sold_retail),0)};
  const analytics = {
    range, batches: rangedBatches.length, requested_units: totalRequested, accepted_units: totalAccepted,
    units_sold: rangedItems.reduce((n:number,x:any)=>n+Number(x.quantity_sold),0), customer_sales: round(rangedCollections.reduce((n:number,x:any)=>n+Number(x.customer_sales),0)),
    commission: round(rangedCollections.reduce((n:number,x:any)=>n+Number(x.commission_total),0)), expected_share: expectedShare, cash_collected: round(rangedCollections.reduce((n:number,x:any)=>n+Number(x.actual_cash_collected),0)),
    outstanding_settlement: round(rangedCollections.reduce((n:number,x:any)=>n+Number(x.expected_4regn_share)-Number(x.actual_cash_collected),0)),
    sewing_liability: sewingLiability, sewing_paid: round(rangedBatches.reduce((n:number,x:any)=>n+x.sewing_paid,0)), fabric_cost: fabricCost, gross_margin_after_production: round(expectedShare-fabricCost-sewingLiability), defects: totalDefects, defect_rate: totalAccepted+totalDefects ? round(totalDefects/(totalAccepted+totalDefects)*100) : 0,
    inventory, variant_performance:variantPerformance, partner_ranking:partnerRanking, weekly_trend:weeklyTrend,
  };
  return { settings, batches: enriched, partners: partnersR.data || [], allocations, allocationItems, collections, collectionItems, payments, movements: movementsR.data || [], activity: activityR.data || [], analytics };
}

export async function GET(req: NextRequest) {
  const auth = await requireFourRegnProductionAdmin(req); if (!auth.ok) return auth.response;
  try { return NextResponse.json(await snapshot(auth.sellerId, req.nextUrl.searchParams.get("range") || "all")); }
  catch (e:any) { return NextResponse.json({ error: e.message || "Could not load production and retail operations" }, { status: 500 }); }
}

export async function POST(req: NextRequest) {
  const auth = await requireFourRegnProductionAdmin(req); if (!auth.ok) return auth.response;
  let body:any; try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const db=getAdmin(), action=cleanText(body.action,50);
  try {
    if(action==="save_settings") {
      const s=body.settings||{}, row={sewing_rate:cleanMoney(s.sewing_rate,-1),fabric_cost:cleanMoney(s.fabric_cost,-1),retail_commission:cleanMoney(s.retail_commission,-1),retail_price:cleanMoney(s.retail_price,-1)};
      if(Object.values(row).some(v=>v<0)||row.retail_commission>row.retail_price)return NextResponse.json({error:"Enter valid rates; commission cannot exceed retail price."},{status:400});
      const r=await db.from("production_retail_settings").upsert({seller_id:auth.sellerId,...row},{onConflict:"seller_id"});if(r.error)throw r.error;await log(auth.sellerId,auth.userId,"Operating rates updated",null,null,row);
    } else if(action==="create_batch") {
      const sent=iso(body.fabric_sent_at), expected=iso(body.expected_collection_at,false), raw=Array.isArray(body.items)?body.items:[];
      const items=raw.map((x:any)=>({colour:cleanText(x.colour,80),size:cleanText(x.size,40),requested_quantity:qty(x.requested_quantity,false)}));
      if(!sent||!items.length||items.some((x:any)=>!x.colour||!x.size||x.requested_quantity===null))return NextResponse.json({error:"Handover date and at least one valid colour/size quantity are required."},{status:400});
      const keys=new Set(items.map((x:any)=>`${x.colour.toLowerCase()}|${x.size.toLowerCase()}`));if(keys.size!==items.length)return NextResponse.json({error:"Each colour and size combination may appear only once."},{status:400});
      const current=await snapshot(auth.sellerId);const code=`SEW-${new Date(sent).toISOString().slice(0,10).replaceAll("-","")}-${Date.now().toString(36).slice(-4).toUpperCase()}`;
      const r=await db.from("sewing_batches").insert({seller_id:auth.sellerId,batch_code:code,title:cleanText(body.title,160),fabric_sent_at:sent,expected_collection_at:expected||null,sewing_rate_snapshot:current.settings.sewing_rate,fabric_cost_snapshot:current.settings.fabric_cost,retail_commission_snapshot:current.settings.retail_commission,retail_price_snapshot:current.settings.retail_price,notes:cleanText(body.notes,4000),created_by:auth.userId}).select("*").single();if(r.error)throw r.error;
      const ir=await db.from("sewing_batch_items").insert(items.map((x:any)=>({...x,batch_id:r.data.id})));if(ir.error){await db.from("sewing_batches").delete().eq("id",r.data.id);throw ir.error;}const locked=await db.from("sewing_batches").update({handover_locked_at:new Date().toISOString()}).eq("id",r.data.id);if(locked.error)throw locked.error;await log(auth.sellerId,auth.userId,"Batch handed to tailor",r.data.id,null,{code,items});
    } else if(action==="create_partner") {
      const name=cleanText(body.name,160);if(!name)return NextResponse.json({error:"Retailer name is required."},{status:400});const r=await db.from("retail_partners").insert({seller_id:auth.sellerId,created_by:auth.userId,store_code:`RP-${Date.now().toString(36).toUpperCase()}`,name,location:cleanText(body.location,180),contact_name:cleanText(body.contact_name,160),joined_on:String(body.joined_on||new Date().toISOString().slice(0,10)),notes:cleanText(body.notes,4000)}).select("*").single();if(r.error)throw r.error;await log(auth.sellerId,auth.userId,"Retail partner added",null,r.data.id,{name});
    } else {
      const batch=await ownedBatch(auth.sellerId,body.batch_id);if(!batch)return NextResponse.json({error:"Batch not found."},{status:404});
      const {data:ownedItems,error:itemError}=await db.from("sewing_batch_items").select("*").eq("batch_id",batch.id);if(itemError)throw itemError;const allowed=new Set((ownedItems||[]).map((x:any)=>x.id));
      if(action==="save_report") {
        const at=iso(body.reported_at), items=normalizedItems(body.items,["reported_quantity"]);if(!at||!items||items.length!==allowed.size||items.some(x=>!allowed.has(x.batch_item_id)))return NextResponse.json({error:"Enter a reported quantity for every variant in this batch."},{status:400});
        const rr=await db.from("sewing_reports").upsert({batch_id:batch.id,reported_at:at,channel:["manual","phone","whatsapp","in_person","other"].includes(body.channel)?body.channel:"manual",notes:cleanText(body.notes,4000),recorded_by:auth.userId},{onConflict:"batch_id"}).select("*").single();if(rr.error)throw rr.error;await db.from("sewing_report_items").delete().eq("report_id",rr.data.id);const ins=await db.from("sewing_report_items").insert(items.map(x=>({...x,report_id:rr.data.id})));if(ins.error)throw ins.error;await log(auth.sellerId,auth.userId,"Tailor report recorded",batch.id,null,{reported_at:at,items});
      } else if(action==="save_receipt") {
        const at=iso(body.received_at), items=normalizedItems(body.items,["received_quantity","defect_quantity"]);if(!at||!items||items.length!==allowed.size||items.some(x=>!allowed.has(x.batch_item_id)||x.defect_quantity>x.received_quantity))return NextResponse.json({error:"Enter received and defective quantities for every variant in this batch."},{status:400});
        const old=await snapshot(auth.sellerId);const oldBatch=old.batches.find((x:any)=>x.id===batch.id);const rr=await db.from("sewing_receipts").upsert({batch_id:batch.id,received_at:at,notes:cleanText(body.notes,4000),recorded_by:auth.userId},{onConflict:"batch_id"}).select("*").single();if(rr.error)throw rr.error;await db.from("sewing_receipt_items").delete().eq("receipt_id",rr.data.id);const ins=await db.from("sewing_receipt_items").insert(items.map(x=>({...x,receipt_id:rr.data.id})));if(ins.error)throw ins.error;
        const movements=items.map(x=>{const previous=oldBatch?.items.find((i:any)=>i.id===x.batch_item_id)?.accepted_quantity||0;const next=x.received_quantity-x.defect_quantity;return{seller_id:auth.sellerId,batch_id:batch.id,batch_item_id:x.batch_item_id,movement_type:previous?"receipt_adjustment":"receipt",from_location:previous?"unallocated":null,to_location:"unallocated",quantity:next-previous,source_id:rr.data.id,occurred_at:at,notes:"Physical receipt accepted quantity",recorded_by:auth.userId}}).filter(x=>x.quantity!==0);if(movements.length){const mr=await db.from("production_inventory_movements").insert(movements);if(mr.error)throw mr.error;}await db.from("sewing_batches").update({actual_collection_at:at}).eq("id",batch.id);await log(auth.sellerId,auth.userId,"Physical receipt recorded",batch.id,null,{received_at:at,items});
      } else if(action==="record_payment") {
        const amount=cleanMoney(body.amount,-1),at=iso(body.paid_at);if(amount<=0||!at)return NextResponse.json({error:"Enter a valid payment amount and date."},{status:400});const r=await db.from("sewing_payments").insert({seller_id:auth.sellerId,batch_id:batch.id,amount,payment_source:body.payment_source==="upfront"?"upfront":"manual",paid_at:at,notes:cleanText(body.notes,1000),recorded_by:auth.userId});if(r.error)throw r.error;await log(auth.sellerId,auth.userId,`Sewing payment of R${amount.toFixed(2)} recorded`,batch.id,null,{amount,source:body.payment_source});
      } else if(action==="allocate") {
        const destination=body.destination==="retailer"?"retailer":"4regn",partner=destination==="retailer"?await ownedPartner(auth.sellerId,body.partner_id):null,at=iso(body.allocated_at),items=normalizedItems(body.items,["quantity"]);if(!at||!items||items.some(x=>!allowed.has(x.batch_item_id)||x.quantity<1)||destination==="retailer"&&!partner)return NextResponse.json({error:"Choose a valid destination and allocation quantities."},{status:400});
        const current=await snapshot(auth.sellerId),currentBatch=current.batches.find((x:any)=>x.id===batch.id);for(const x of items){const item=currentBatch.items.find((i:any)=>i.id===x.batch_item_id);if(!item||x.quantity>item.unallocated_quantity)return NextResponse.json({error:`Only ${Math.max(0,item?.unallocated_quantity||0)} ${item?.colour||""} ${item?.size||""} units remain unallocated.`},{status:400});}
        const ar=await db.from("retail_allocations").insert({seller_id:auth.sellerId,batch_id:batch.id,destination,partner_id:partner?.id||null,allocated_at:at,notes:cleanText(body.notes,1000),recorded_by:auth.userId}).select("*").single();if(ar.error)throw ar.error;const ai=await db.from("retail_allocation_items").insert(items.map(x=>({...x,allocation_id:ar.data.id})));if(ai.error)throw ai.error;const mr=await db.from("production_inventory_movements").insert(items.map(x=>({seller_id:auth.sellerId,batch_id:batch.id,batch_item_id:x.batch_item_id,movement_type:destination==="retailer"?"allocate_retail":"allocate_4regn",from_location:"unallocated",to_location:destination,partner_id:partner?.id||null,quantity:x.quantity,source_id:ar.data.id,occurred_at:at,notes:cleanText(body.notes,1000),recorded_by:auth.userId})));if(mr.error)throw mr.error;await log(auth.sellerId,auth.userId,`Inventory allocated to ${partner?.name||"4REGN"}`,batch.id,partner?.id||null,{items});
      } else if(action==="record_collection") {
        const partner=await ownedPartner(auth.sellerId,body.partner_id),at=iso(body.collected_at),items=normalizedItems(body.items,["quantity_sold"]);if(!partner||!at||!items||items.some(x=>!allowed.has(x.batch_item_id)||x.quantity_sold<1))return NextResponse.json({error:"Choose a retailer and valid sold quantities."},{status:400});const current=await snapshot(auth.sellerId),currentBatch=current.batches.find((x:any)=>x.id===batch.id);
        const partnerAllocationIds=new Set(current.allocations.filter((a:any)=>a.partner_id===partner.id).map((a:any)=>a.id));for(const x of items){const allocated=current.allocationItems.filter((i:any)=>partnerAllocationIds.has(i.allocation_id)&&i.batch_item_id===x.batch_item_id).reduce((n:number,i:any)=>n+Number(i.quantity),0);const priorSold=current.collectionItems.filter((i:any)=>i.batch_item_id===x.batch_item_id&&current.collections.find((c:any)=>c.id===i.collection_id)?.partner_id===partner.id).reduce((n:number,i:any)=>n+Number(i.quantity_sold),0);if(x.quantity_sold>allocated-priorSold)return NextResponse.json({error:`Retailer only has ${Math.max(0,allocated-priorSold)} remaining for this variant.`},{status:400});}
        const sold=items.reduce((n,x)=>n+x.quantity_sold,0),price=Number(batch.retail_price_snapshot),commission=Number(batch.retail_commission_snapshot),customerSales=round(sold*price),commissionTotal=round(sold*commission),expected=round(customerSales-commissionTotal),cash=cleanMoney(body.actual_cash_collected,-1),sewing=cleanMoney(body.sewing_payment_amount,0);if(cash<0||sewing>cash)return NextResponse.json({error:"Cash must be valid and the sewing payment cannot exceed cash collected."},{status:400});
        const cr=await db.from("retail_collections").insert({seller_id:auth.sellerId,partner_id:partner.id,collected_at:at,customer_sales:customerSales,commission_total:commissionTotal,expected_4regn_share:expected,actual_cash_collected:cash,sewing_payment_amount:sewing,notes:cleanText(body.notes,2000),recorded_by:auth.userId}).select("*").single();if(cr.error)throw cr.error;const ci=await db.from("retail_collection_items").insert(items.map(x=>({...x,collection_id:cr.data.id,retail_price_snapshot:price,commission_snapshot:commission})));if(ci.error)throw ci.error;const mr=await db.from("production_inventory_movements").insert(items.map(x=>({seller_id:auth.sellerId,batch_id:batch.id,batch_item_id:x.batch_item_id,movement_type:"retail_sale",from_location:"retailer",to_location:"customer",partner_id:partner.id,quantity:x.quantity_sold,source_id:cr.data.id,occurred_at:at,notes:cleanText(body.notes,1000),recorded_by:auth.userId})));if(mr.error)throw mr.error;if(sewing>0){const pr=await db.from("sewing_payments").insert({seller_id:auth.sellerId,batch_id:batch.id,amount:sewing,payment_source:"retail_collection",retail_collection_id:cr.data.id,paid_at:at,notes:`Funded by ${partner.name} collection`,recorded_by:auth.userId});if(pr.error)throw pr.error;}await log(auth.sellerId,auth.userId,`Weekly retailer collection recorded`,batch.id,partner.id,{sold,customerSales,commissionTotal,expected,cash,sewing});
      } else if(action==="archive_batch") {const r=await db.from("sewing_batches").update({archived_at:new Date().toISOString()}).eq("id",batch.id).eq("seller_id",auth.sellerId);if(r.error)throw r.error;await log(auth.sellerId,auth.userId,"Batch archived",batch.id,null,{});
      } else return NextResponse.json({error:"Unknown action"},{status:400});
    }
    return NextResponse.json(await snapshot(auth.sellerId, cleanText(body.range,20)||"all"));
  } catch(e:any) { return NextResponse.json({error:e.message||"Production and retail request failed"},{status:400}); }
}
