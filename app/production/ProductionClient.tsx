"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import { batchTotals, DEFAULT_PRODUCTION_COSTS, orderCostComponents, orderTotals, PRODUCTION_BATCH_STATUSES, PRODUCTION_SIZES, suggestSupplierSize, type ProductionOrder } from "../../lib/four-regn-production-calculations";
import styles from "./production.module.css";

type Batch = { id: string; name: string; notes: string; status: string; created_at: string; updated_at: string; archived_at?: string | null };
type Settings = Record<keyof typeof DEFAULT_PRODUCTION_COSTS, number>;
type Activity = { id: number; batch_id: string; order_id?: string | null; action: string; details: Record<string, unknown>; created_at: string };
type View = "batches" | "orders" | "production" | "summary";
type Modal = "batch" | "order" | "settings" | "activity" | null;

const emptyOrder = (settings: Settings) => ({
  customer_name: "", order_reference: "", design_name: "", custom_print: false, design_ready: false,
  garment_type: "tee" as const, colour: "", customer_size: "M", supplier_size: "M", print_size: "a3_plus" as const, delivery_method: "aramex" as const,
  tee_material_cost: settings.tee_material, tee_production_cost: settings.tee_production, hoodie_cost: settings.hoodie,
  a3_plus_cost: settings.a3_plus, a4_cost: settings.a4, aramex_cost: settings.aramex, paxi_cost: settings.paxi,
  material_complete: false, production_complete: false, garment_complete: false, printing_complete: false, delivery_complete: false,
});
const money = (value: number) => `R${Number(value || 0).toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;
const dateTime = (value: string) => new Intl.DateTimeFormat("en-ZA", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Johannesburg" }).format(new Date(value));
const cn = (...classes: Array<string | false | undefined>) => classes.filter(Boolean).join(" ");

export default function ProductionClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [token, setToken] = useState("");
  const [settings, setSettings] = useState<Settings>({ ...DEFAULT_PRODUCTION_COSTS });
  const [batches, setBatches] = useState<Batch[]>([]);
  const [orders, setOrders] = useState<ProductionOrder[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [activeBatchId, setActiveBatchId] = useState("");
  const [view, setView] = useState<View>("batches");
  const [modal, setModal] = useState<Modal>(null);
  const [batchForm, setBatchForm] = useState({ id: "", name: "", notes: "", status: "Draft" });
  const [orderForm, setOrderForm] = useState<any>(emptyOrder(settings));
  const importRef = useRef<HTMLInputElement>(null);

  const showToast = (message: string) => { setToast(message); window.setTimeout(() => setToast(""), 2400); };
  const api = async (payload?: any) => {
    const response = await fetch("/api/production", { method: payload ? "POST" : "GET", headers: { Authorization: `Bearer ${token}`, ...(payload ? { "Content-Type": "application/json" } : {}) }, body: payload ? JSON.stringify(payload) : undefined, cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Production request failed");
    return data;
  };

  useEffect(() => {
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { router.replace(`/login?next=${encodeURIComponent("/production")}`); return; }
      setToken(session.access_token);
      try {
        const response = await fetch("/api/production", { headers: { Authorization: `Bearer ${session.access_token}` }, cache: "no-store" });
        const data = await response.json();
        if (response.status === 401) { router.replace(`/login?next=${encodeURIComponent("/production")}`); return; }
        if (!response.ok) throw new Error(data.error || "Could not load Production");
        setSettings(data.settings); setBatches(data.batches); setOrders(data.orders); setActivity(data.activity);
        const saved = sessionStorage.getItem("4regn_active_production_batch");
        const selected = data.batches.some((b: Batch) => b.id === saved) ? saved : data.batches.find((b: Batch) => b.status !== "Archived")?.id || data.batches[0]?.id || "";
        setActiveBatchId(selected || "");
      } catch (cause: any) { setError(cause.message); }
      finally { setLoading(false); }
    })();
  }, [router]);

  useEffect(() => { if (activeBatchId) sessionStorage.setItem("4regn_active_production_batch", activeBatchId); }, [activeBatchId]);
  const activeBatch = batches.find((batch) => batch.id === activeBatchId);
  const activeOrders = useMemo(() => orders.filter((order) => order.batch_id === activeBatchId).sort((a, b) => Number(orderTotals(a).complete) - Number(orderTotals(b).complete)), [orders, activeBatchId]);
  const totals = useMemo(() => batchTotals(activeOrders), [activeOrders]);

  const openBatch = (batch: Batch) => { setActiveBatchId(batch.id); setView("orders"); };
  const openBatchModal = (batch?: Batch) => { setBatchForm(batch ? { id: batch.id, name: batch.name, notes: batch.notes, status: batch.status } : { id: "", name: "", notes: "", status: "Draft" }); setModal("batch"); };
  const saveBatch = async () => {
    if (!batchForm.name.trim()) return showToast("Batch name is required");
    try {
      const data = await api(batchForm.id ? { action: "update_batch", batch_id: batchForm.id, ...batchForm } : { action: "create_batch", ...batchForm });
      setBatches((current) => batchForm.id ? current.map((batch) => batch.id === data.batch.id ? data.batch : batch) : [data.batch, ...current]);
      setActiveBatchId(data.batch.id); setModal(null); setView("orders"); showToast(batchForm.id ? "Batch updated ✓" : "Batch created ✓");
    } catch (cause: any) { showToast(cause.message); }
  };
  const duplicateBatch = async (batch: Batch) => {
    try { const data = await api({ action: "duplicate_batch", batch_id: batch.id }); setBatches((current) => [data.batch, ...current]); setOrders((current) => [...current, ...(data.orders || [])]); setActiveBatchId(data.batch.id); setView("orders"); showToast("Batch duplicated ✓"); } catch (cause: any) { showToast(cause.message); }
  };
  const archiveBatch = async (batch: Batch) => {
    try { const data = await api({ action: "update_batch", batch_id: batch.id, status: batch.status === "Archived" ? "Draft" : "Archived" }); setBatches((current) => current.map((item) => item.id === batch.id ? data.batch : item)); showToast(batch.status === "Archived" ? "Batch restored ✓" : "Batch archived ✓"); } catch (cause: any) { showToast(cause.message); }
  };
  const deleteBatch = async (batch: Batch) => {
    if (!window.confirm(`Permanently delete “${batch.name}” and all its production orders?`)) return;
    try { await api({ action: "delete_batch", batch_id: batch.id }); setBatches((current) => current.filter((item) => item.id !== batch.id)); setOrders((current) => current.filter((order) => order.batch_id !== batch.id)); if (activeBatchId === batch.id) setActiveBatchId(""); showToast("Batch deleted"); } catch (cause: any) { showToast(cause.message); }
  };

  const openOrderModal = (order?: ProductionOrder) => { setOrderForm(order ? { ...order } : emptyOrder(settings)); setModal("order"); };
  const updateOrderForm = (patch: any) => setOrderForm((current: any) => ({ ...current, ...patch }));
  const changeGarmentOrSize = (patch: any) => setOrderForm((current: any) => { const next = { ...current, ...patch }; return { ...next, supplier_size: suggestSupplierSize(next.garment_type, next.customer_size) }; });
  const saveOrder = async () => {
    if (!activeBatchId) return showToast("Create or select a batch first");
    try { const data = await api({ action: "save_order", batch_id: activeBatchId, order: orderForm }); setOrders((current) => orderForm.id ? current.map((order) => order.id === data.order.id ? data.order : order) : [...current, data.order]); setModal(null); showToast(orderForm.id ? "Order updated ✓" : "Order added ✓"); } catch (cause: any) { showToast(cause.message); }
  };
  const deleteOrder = async (order: ProductionOrder) => {
    if (!window.confirm(`Delete ${order.customer_name} from this batch?`)) return;
    try { await api({ action: "delete_order", batch_id: order.batch_id, order_id: order.id }); setOrders((current) => current.filter((item) => item.id !== order.id)); showToast("Order deleted"); } catch (cause: any) { showToast(cause.message); }
  };
  const patchOrder = async (order: ProductionOrder, field: string, value: unknown) => {
    const previous = order[field as keyof ProductionOrder];
    setOrders((current) => current.map((item) => item.id === order.id ? { ...item, [field]: value } : item));
    try { const data = await api({ action: "patch_order", batch_id: order.batch_id, order_id: order.id, field, value }); setOrders((current) => current.map((item) => item.id === order.id ? data.order : item)); }
    catch (cause: any) { setOrders((current) => current.map((item) => item.id === order.id ? { ...item, [field]: previous } : item)); showToast(cause.message); }
  };
  const saveSettings = async () => { try { const data = await api({ action: "save_settings", settings }); setSettings(data.settings); setModal(null); showToast("Settings saved ✓"); } catch (cause: any) { showToast(cause.message); } };

  const download = (value: unknown, name: string) => { const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: "application/json" })); const link = document.createElement("a"); link.href = url; link.download = name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); };
  const safeName = (name: string) => name.replace(/[^a-z0-9]+/gi, "_").replace(/^_|_$/g, "");
  const supplierData = useMemo(() => buildSupplierList(activeOrders), [activeOrders]);
  const printQueue = activeOrders.map((order) => ({ customer: order.customer_name, reference: order.order_reference, design: order.design_name, garment: order.garment_type, colour: order.colour, supplier_size: order.supplier_size, print_size: order.print_size === "a4" ? "A4" : "A3+", design_status: order.design_ready ? "Ready to Print" : "Needs Design", printing_status: order.printing_complete ? "Printed" : "Outstanding" }));
  const exportBatch = (kind: "full" | "audit" | "supplier" | "printing") => {
    if (!activeBatch) return showToast("No active batch");
    const base = safeName(activeBatch.name);
    if (kind === "supplier") return download({ batch: activeBatch.name, generated_at: new Date().toISOString(), supplier_list: supplierData }, `${base}_supplier.json`);
    if (kind === "printing") return download({ batch: activeBatch.name, generated_at: new Date().toISOString(), printing_queue: printQueue }, `${base}_printing.json`);
    if (kind === "audit") return download({ batch: activeBatch, totals, orders: activeOrders.map((order) => ({ ...order, totals: orderTotals(order), components: orderCostComponents(order) })), activity: activity.filter((item) => item.batch_id === activeBatch.id) }, `${base}_audit.json`);
    download({ type: "4regn-production-batch", version: 2, exported_at: new Date().toISOString(), batch: activeBatch, orders: activeOrders }, `${base}.json`);
  };
  const importBatch = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()); const source = parsed.batch || parsed; const importedOrders = Array.isArray(parsed.orders) ? parsed.orders : Array.isArray(source.orders) ? source.orders : [];
      if (!source.name || importedOrders.length > 500) throw new Error("This is not a valid 4REGN batch export");
      const created = await api({ action: "create_batch", name: `${String(source.name).slice(0, 145)} — Imported`, notes: String(source.notes || "").slice(0, 4000), status: "Draft" });
      const newOrders: ProductionOrder[] = [];
      for (const order of importedOrders) { const result = await api({ action: "save_order", batch_id: created.batch.id, order: { ...order, id: undefined } }); newOrders.push(result.order); }
      setBatches((current) => [created.batch, ...current]); setOrders((current) => [...current, ...newOrders]); setActiveBatchId(created.batch.id); setView("orders"); showToast("Batch imported ✓");
    } catch (cause: any) { showToast(cause.message || "Could not import that file"); }
  };
  const logout = async () => { await supabase.auth.signOut(); router.replace("/login"); };

  if (loading) return <div className={styles.loading}>Opening 4REGN Production…</div>;
  if (error) return <div className={styles.loading}><div><b>Production could not open.</b><div className={styles.error}>{error}</div><button className={styles.btn} onClick={() => location.reload()}>Try again</button></div></div>;

  return <main className={styles.page}>
    <div className={styles.app}>
      <header className={styles.topbar}><div className={styles.brand}><div className={styles.logo}>4R</div><div>Batch Compiler</div></div><div className={styles.topActions}><button className={styles.iconBtn} onClick={() => setModal("settings")}>Settings</button><button className={cn(styles.iconBtn,styles.logout)} onClick={logout}>Log out</button></div></header>
      <section className={styles.hero}><div className={styles.eyebrow}>4REGN • Production Operations</div><h1>Build the batch.<br/>Clear the noise.</h1><p>Create order batches, compile supplier requirements, track every production cost and watch the remaining balance fall as the work gets done.</p><div className={styles.heroActions}><button className={styles.btn} onClick={() => openBatchModal()}>+ Create Batch</button><button className={cn(styles.btn,styles.dark)} onClick={() => setView("orders")}>Add Orders</button></div></section>
      <div className={styles.mobileBanner}><b>Mobile mode active.</b><span>Your work saves securely in the background and will be waiting on every signed-in device.</span></div>

      {view === "batches" && <BatchesView batches={batches} orders={orders} onOpen={openBatch} onNew={() => openBatchModal()} onEdit={openBatchModal} onDuplicate={duplicateBatch} onArchive={archiveBatch} onDelete={deleteBatch}/>} 
      {view === "orders" && <OrdersView batch={activeBatch} orders={activeOrders} onAdd={() => openOrderModal()} onEdit={openOrderModal} onDelete={deleteOrder} onProduction={() => setView("production")} onExport={() => exportBatch("full")} onImport={() => importRef.current?.click()}/>} 
      {view === "production" && <ProductionView batch={activeBatch} orders={activeOrders} totals={totals} supplier={supplierData} printing={printQueue} onPatch={patchOrder} onEdit={openOrderModal} onHistory={async () => { setModal("activity"); try { const data = await api(); setActivity(data.activity || []); } catch {} }} onExport={(kind: "full" | "audit" | "supplier" | "printing") => exportBatch(kind)}/>} 
      {view === "summary" && <SummaryView batch={activeBatch} orders={activeOrders} totals={totals} onExport={(kind: "full" | "audit" | "supplier" | "printing") => exportBatch(kind)}/>} 
    </div>
    <nav className={styles.bottomNav}>{(["batches","orders","production","summary"] as View[]).map((item) => <button key={item} className={cn(styles.navBtn,view===item&&styles.navActive)} onClick={() => setView(item)}>{item[0].toUpperCase()+item.slice(1)}</button>)}</nav>
    <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={importBatch}/>
    {modal === "batch" && <BatchModal value={batchForm} setValue={setBatchForm} onClose={() => setModal(null)} onSave={saveBatch}/>} 
    {modal === "order" && <OrderModal value={orderForm} setValue={updateOrderForm} changeGarmentOrSize={changeGarmentOrSize} onClose={() => setModal(null)} onSave={saveOrder}/>} 
    {modal === "settings" && <SettingsModal settings={settings} setSettings={setSettings} onClose={() => setModal(null)} onSave={saveSettings}/>} 
    {modal === "activity" && <ActivityModal activity={activity.filter((item) => item.batch_id === activeBatchId)} onClose={() => setModal(null)}/>} 
    {toast && <div className={styles.toast}>{toast}</div>}
  </main>;
}

function BatchesView({ batches, orders, onOpen, onNew, onEdit, onDuplicate, onArchive, onDelete }: any) {
  return <section className={styles.view}><div className={styles.grid}><div className={styles.card}><div className={styles.sectionHead}><div><h2>Your batches</h2><div className={styles.sub}>Open an existing production batch or start a new one.</div></div><button className={cn(styles.btn,styles.small)} onClick={onNew}>+ New</button></div><div className={styles.batchList}>{!batches.length ? <div className={styles.empty}>No batches yet. Create your first production batch.</div> : batches.map((batch: Batch) => { const batchOrders=orders.filter((order:ProductionOrder)=>order.batch_id===batch.id); const totals=batchTotals(batchOrders); return <article className={styles.batchCard} key={batch.id}><div className={styles.batchTop}><div><div className={styles.batchName}>{batch.name}</div><div className={styles.sub}>Created {dateTime(batch.created_at)} • Updated {dateTime(batch.updated_at)}</div></div><span className={cn(styles.badge,batch.status==="Draft"?styles.badgeDraft:styles.badgeActive)}>{batch.status}</span></div><div className={styles.batchMeta}><div><small>Orders</small><b>{batchOrders.length}</b></div><div><small>Total cost</small><b>{money(totals.total)}</b></div><div><small>Paid</small><b>{money(totals.paid)}</b></div><div><small>Remaining</small><b>{money(totals.remaining)}</b></div><div><small>Complete</small><b>{totals.complete}</b></div><div><small>Outstanding</small><b>{batchOrders.length-totals.complete}</b></div></div><div className={styles.actions}><button className={cn(styles.btn,styles.small)} onClick={()=>onOpen(batch)}>Open</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onEdit(batch)}>Edit</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onDuplicate(batch)}>Duplicate</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onArchive(batch)}>{batch.status==="Archived"?"Restore":"Archive"}</button><button className={cn(styles.btn,styles.danger,styles.small)} onClick={()=>onDelete(batch)}>Delete</button></div></article>; })}</div></div></div></section>;
}

function OrdersView({ batch, orders, onAdd, onEdit, onDelete, onProduction, onExport, onImport }: any) {
  return <section className={styles.view}><div className={styles.grid}><div className={cn(styles.card,styles.twoThird)}><div className={styles.sectionHead}><div><h2>{batch?.name||"Order Compiler"}</h2><div className={styles.sub}>{batch?`${orders.length} order${orders.length===1?"":"s"} • ${batch.status}`:"Create a batch first, then add orders."}</div></div><button className={cn(styles.btn,styles.small)} onClick={onAdd}>+ Add Order</button></div><div className={styles.orderList}>{!batch?<div className={styles.empty}>No active batch.</div>:!orders.length?<div className={styles.empty}>No orders in this batch yet. Add the first one.</div>:orders.map((order:ProductionOrder,index:number)=><article className={styles.orderRow} key={order.id}><div className={styles.orderMain}><div><b>{index+1}. {order.customer_name} — {order.design_name}</b><span>{order.colour} {order.garment_type==="hoodie"?"Hoodie":"Tee"} • customer {order.customer_size} / supplier {order.supplier_size} • {order.delivery_method==="paxi"?"PAXI":"Aramex"}</span></div><span className={styles.badge}>{order.print_size==="a4"?"A4":"A3+"}</span></div><div className={styles.actions}><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onEdit(order)}>Edit</button><button className={cn(styles.btn,styles.danger,styles.small)} onClick={()=>onDelete(order)}>Delete</button></div></article>)}</div></div><aside className={cn(styles.card,styles.third)}><h2>Batch controls</h2><div className={styles.sub} style={{marginBottom:12}}>Work with the currently selected batch.</div><div className={styles.actions}><button className={cn(styles.btn,styles.small)} onClick={onProduction}>Production Board</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={onExport}>Export Batch</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={onImport}>Import Batch</button></div><div className={styles.notice} style={{marginTop:12}}>Order costs are copied into the order when it is created, so future Settings changes do not rewrite old batch history.</div></aside></div></section>;
}

function ProductionView({ batch, orders, totals, supplier, printing, onPatch, onEdit, onHistory, onExport }: any) {
  if(!batch||!orders.length) return <section className={styles.view}><div className={cn(styles.card,styles.empty)}>Select a batch with orders to open the production board.</div></section>;
  return <section className={styles.view}><div className={styles.stickySummary}><div className={styles.stickyGrid}><div><small>Total cost</small><b>{money(totals.total)}</b></div><div><small>Completed / paid</small><b>{money(totals.paid)}</b></div><div><small>Remaining balance</small><b>{money(totals.remaining)}</b></div><div><small>Orders complete</small><b>{totals.complete} / {orders.length}</b></div></div></div><div className={styles.grid}><div className={cn(styles.card,styles.half)}><div className={styles.sectionHead}><div><h2>Supplier buying list</h2><div className={styles.sub}>Compiled automatically from supplier sizes.</div></div><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onExport("supplier")}>Export</button></div><SupplierList supplier={supplier}/></div><div className={cn(styles.card,styles.half)}><div className={styles.sectionHead}><div><h2>Printing queue</h2><div className={styles.sub}>Everything in this batch, including print status.</div></div><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onExport("printing")}>Export</button></div><div className={styles.orderList}>{printing.map((item:any,index:number)=><div className={styles.orderRow} key={index}><div className={styles.orderMain}><div><b>{item.customer} — {item.design}</b><span>{item.colour} {item.garment} • {item.supplier_size} • {item.print_size}</span></div><span className={styles.badge}>{item.printing_status==="Printed"?"PRINTED":item.design_status==="Ready to Print"?"READY":"NEEDS FILE"}</span></div></div>)}</div></div><div className={styles.card}><div className={styles.sectionHead}><div><h2>{batch.name}</h2><div className={styles.sub}>Tick work as paid/completed. Every change saves immediately.</div></div><div className={styles.actions}><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={onHistory}>History</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onExport("audit")}>Export Audit</button></div></div><div className={styles.prodGrid}>{orders.map((order:ProductionOrder,index:number)=><ProductionCard key={order.id} order={order} index={index} onPatch={onPatch} onEdit={onEdit}/>)}</div></div></div></section>;
}

function ProductionCard({ order, index, onPatch, onEdit }: any) { const totals=orderTotals(order); const components=orderCostComponents(order); const garmentComponents=components.filter((item)=>!["printing_complete","delivery_complete"].includes(item.key)); const doneCount=components.filter((item)=>item.complete).length+(order.design_ready?1:0); const pct=Math.round(doneCount/(components.length+1)*100); return <article className={cn(styles.prodCard,totals.complete&&styles.prodDone)}><div className={styles.prodHead}><div><div className={styles.eyebrow}>#{String(index+1).padStart(2,"0")}</div><h3>{order.customer_name}</h3><p>{order.colour} {order.garment_type==="hoodie"?"Hoodie":"Tee"} • {order.customer_size} → supplier {order.supplier_size}</p></div><span className={styles.orderBal}>{totals.complete?"ORDER COMPLETE ✓":`${money(totals.remaining)} left`}</span></div><CheckRow checked={order.design_ready} label="Print file / design ready" detail={order.design_name} value="✓" onChange={(value: boolean)=>onPatch(order,"design_ready",value)}/>{garmentComponents.map((item)=><CheckRow key={item.key} checked={item.complete} label={item.label} detail={item.detail} value={money(item.value)} onChange={(value: boolean)=>onPatch(order,item.key,value)}/>)}<div className={cn(styles.selectRow,order.delivery_complete&&styles.checked)}><input aria-label="Delivery complete" type="checkbox" checked={order.delivery_complete} onChange={(event)=>onPatch(order,"delivery_complete",event.target.checked)}/><div><b>Delivery</b><span>{order.delivery_method==="paxi"?"PAXI":"Aramex"}</span></div><select aria-label="Delivery method" value={order.delivery_method} onChange={(event)=>onPatch(order,"delivery_method",event.target.value)}><option value="aramex">Aramex • {money(order.aramex_cost)}</option><option value="paxi">PAXI • {money(order.paxi_cost)}</option></select></div><div className={cn(styles.selectRow,order.printing_complete&&styles.checked)}><input aria-label="Printing complete" type="checkbox" checked={order.printing_complete} onChange={(event)=>onPatch(order,"printing_complete",event.target.checked)}/><div><b>Printing</b><span>{order.custom_print?"Custom print":"Standard print"}</span></div><select aria-label="Print size" value={order.print_size} onChange={(event)=>onPatch(order,"print_size",event.target.value)}><option value="a3_plus">A3+ • {money(order.a3_plus_cost)}</option><option value="a4">A4 • {money(order.a4_cost)}</option></select></div><div className={styles.progress}><span style={{width:`${pct}%`}}/></div><div className={styles.actions} style={{marginTop:10}}><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onEdit(order)}>Edit / override costs</button></div></article>; }
function CheckRow({checked,label,detail,value,onChange}:any){return <label className={cn(styles.costRow,checked&&styles.checked)}><input type="checkbox" checked={checked} onChange={(event)=>onChange(event.target.checked)}/><div><b>{label}</b><span>{detail}</span></div><strong>{value}</strong></label>}

function SummaryView({ batch, orders, totals, onExport }: any) { const categories={"Tee material":0,"Tee production":0,Hoodies:0,Printing:0,"PAXI delivery":0,"Aramex delivery":0}; orders.forEach((order:ProductionOrder)=>orderCostComponents(order).filter((component)=>!component.complete).forEach((component)=>{if(component.key==="material_complete")categories["Tee material"]+=component.value;else if(component.key==="production_complete")categories["Tee production"]+=component.value;else if(component.key==="garment_complete")categories.Hoodies+=component.value;else if(component.key==="printing_complete")categories.Printing+=component.value;else categories[order.delivery_method==="paxi"?"PAXI delivery":"Aramex delivery"]+=component.value;})); return <section className={styles.view}><div className={styles.grid}><div className={styles.card}><div className={styles.sectionHead}><div><h2>Batch summary</h2><div className={styles.sub}>A clean financial and production overview.</div></div><div className={styles.actions}><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onExport("audit")}>Audit</button><button className={cn(styles.btn,styles.secondary,styles.small)} onClick={()=>onExport("full")}>Full export</button></div></div>{!batch?<div className={styles.empty}>No active batch.</div>:<div className={styles.stats}><Stat label="Total orders" value={orders.length}/><Stat label="Completed orders" value={totals.complete}/><Stat label="Outstanding orders" value={orders.length-totals.complete}/><Stat label="Total batch cost" value={money(totals.total)}/><Stat label="Completed / paid" value={money(totals.paid)}/><Stat label="Remaining" value={money(totals.remaining)}/></div>}</div><div className={cn(styles.card,styles.half)}><h2>Outstanding by category</h2><div className={styles.orderList}>{Object.entries(categories).map(([label,value])=><div className={styles.orderRow} key={label}><div className={styles.orderMain}><b>{label}</b><strong>{money(value)}</strong></div></div>)}</div></div><div className={cn(styles.card,styles.half)}><h2>Batch details</h2>{batch&&<div className={styles.orderList}><div className={styles.orderRow}><div className={styles.orderMain}><b>Status</b><span className={styles.badge}>{batch.status}</span></div></div><div className={styles.orderRow}><div className={styles.orderMain}><b>Created</b><span>{dateTime(batch.created_at)}</span></div></div><div className={styles.orderRow}><b>Notes</b><div className={styles.sub}>{batch.notes||"No notes"}</div></div></div>}</div></div></section> }
function Stat({label,value}:any){return <div className={styles.stat}><small>{label}</small><strong>{value}</strong></div>}

function SupplierList({supplier}:any){return <div className={styles.supplierGrid}>{(["hoodie","tee"] as const).map((type)=><div className={styles.supplierGroup} key={type}><h3>{type==="hoodie"?"Hoodies":"Tees"}</h3>{Object.keys(supplier[type]).length?Object.entries(supplier[type]).map(([size,data]:any)=><div className={styles.supplierItem} key={size}><div><b>{size}</b><div className={styles.sub}>{Object.entries(data.colours).map(([colour,count])=>`${colour} ×${count}`).join(" • ")}</div></div><strong>{data.count}</strong></div>):<div className={styles.sub}>None</div>}</div>)}</div>}
function buildSupplierList(orders:ProductionOrder[]){const groups:any={hoodie:{},tee:{}};orders.forEach((order)=>{const group=groups[order.garment_type];group[order.supplier_size]||={count:0,colours:{}};group[order.supplier_size].count++;group[order.supplier_size].colours[order.colour]=(group[order.supplier_size].colours[order.colour]||0)+1;});return groups}

function BatchModal({value,setValue,onClose,onSave}:any){return <ModalShell title={value.id?"Edit Batch":"Create Batch"} subtitle="Give the production run a name and status." onClose={onClose}><div className={cn(styles.formGrid,styles.formGridTwo)}><Field label="Batch name"><input autoFocus value={value.name} onChange={(e)=>setValue({...value,name:e.target.value})} placeholder="Month End Orders — 31 Aug"/></Field><Field label="Status"><select value={value.status} onChange={(e)=>setValue({...value,status:e.target.value})}>{PRODUCTION_BATCH_STATUSES.map((status)=><option key={status}>{status}</option>)}</select></Field></div><div style={{marginTop:11}}><Field label="Notes"><textarea value={value.notes} onChange={(e)=>setValue({...value,notes:e.target.value})} placeholder="Optional notes for this batch"/></Field></div><div className={styles.heroActions}><button className={styles.btn} onClick={onSave}>{value.id?"Save Changes":"Create Batch"}</button></div></ModalShell>}
function OrderModal({value,setValue,changeGarmentOrSize,onClose,onSave}:any){const costFields=[["tee_material_cost","Tee material"],["tee_production_cost","Tee production"],["hoodie_cost","Hoodie"],["a3_plus_cost","A3+"],["a4_cost","A4"],["aramex_cost","Aramex"],["paxi_cost","PAXI"]];return <ModalShell title={value.id?"Edit Order":"Add Order"} subtitle="Compile the customer, garment, print and costs." onClose={onClose}><div className={cn(styles.formGrid,styles.formGridTwo)}><Field label="Customer name"><input autoFocus value={value.customer_name} onChange={(e)=>setValue({customer_name:e.target.value})} placeholder="Liyema"/></Field><Field label="Order / reference (optional)"><input value={value.order_reference||""} onChange={(e)=>setValue({order_reference:e.target.value})} placeholder="#3540D"/></Field><Field label="Design name"><input value={value.design_name} onChange={(e)=>setValue({design_name:e.target.value})} placeholder="Custom Print"/></Field><Field label="Garment type"><select value={value.garment_type} onChange={(e)=>changeGarmentOrSize({garment_type:e.target.value})}><option value="tee">Tee</option><option value="hoodie">Hoodie</option></select></Field><Field label="Colour"><input value={value.colour} onChange={(e)=>setValue({colour:e.target.value})} placeholder="Black"/></Field><Field label="Customer size"><select value={value.customer_size} onChange={(e)=>changeGarmentOrSize({customer_size:e.target.value})}>{PRODUCTION_SIZES.map((size)=><option key={size}>{size}</option>)}</select></Field><Field label="Supplier size"><select value={value.supplier_size} onChange={(e)=>setValue({supplier_size:e.target.value})}>{PRODUCTION_SIZES.map((size)=><option key={size}>{size}</option>)}</select></Field><Field label="Print size"><select value={value.print_size} onChange={(e)=>setValue({print_size:e.target.value})}><option value="a3_plus">A3+ • {money(value.a3_plus_cost)}</option><option value="a4">A4 • {money(value.a4_cost)}</option></select></Field><Field label="Delivery method"><select value={value.delivery_method} onChange={(e)=>setValue({delivery_method:e.target.value})}><option value="aramex">Aramex • {money(value.aramex_cost)}</option><option value="paxi">PAXI • {money(value.paxi_cost)}</option></select></Field></div><div className={styles.inlineChecks}><label className={styles.inlineCheck}><input type="checkbox" checked={value.custom_print} onChange={(e)=>setValue({custom_print:e.target.checked})}/> Custom print</label><label className={styles.inlineCheck}><input type="checkbox" checked={value.design_ready} onChange={(e)=>setValue({design_ready:e.target.checked})}/> Design already ready</label></div><details className={styles.costEditor}><summary>Individual cost overrides</summary><div className={styles.costEditorGrid}>{costFields.map(([key,label])=><Field label={label} key={key}><input type="number" min="0" step="0.01" value={value[key]} onChange={(e)=>setValue({[key]:Number(e.target.value)})}/></Field>)}</div></details><div className={styles.notice} style={{marginTop:12}}>Hoodies suggest one supplier size up. Supplier size, courier, print size and this order’s cost snapshots remain editable.</div><div className={styles.heroActions}><button className={styles.btn} onClick={onSave}>Save Order</button></div></ModalShell>}
function SettingsModal({settings,setSettings,onClose,onSave}:any){const fields=[["tee_material","Tee material","Material only"],["tee_production","Tee production","Cut / make garment"],["hoodie","Hoodie garment","Current combined cost"],["aramex","Aramex delivery","Default per Aramex order"],["paxi","PAXI delivery","Default per PAXI order"],["a3_plus","A3+ printing",""] ,["a4","A4 printing",""]];return <ModalShell title="Cost Settings" subtitle="Used as snapshots for newly created orders." onClose={onClose}>{fields.map(([key,label,detail])=><div className={styles.settingRow} key={key}><div><b>{label}</b>{detail&&<div className={styles.sub}>{detail}</div>}</div><input type="number" min="0" step="0.01" value={settings[key]} onChange={(e)=>setSettings({...settings,[key]:Number(e.target.value)})}/></div>)}<div className={styles.heroActions}><button className={styles.btn} onClick={onSave}>Save Settings</button></div></ModalShell>}
function ActivityModal({activity,onClose}:any){return <ModalShell title="Activity History" subtitle="Newest production changes first." onClose={onClose}><div className={styles.orderList}>{activity.length?activity.map((item:Activity)=><div className={styles.historyItem} key={item.id}><b>{item.action}</b><time>{dateTime(item.created_at)}</time></div>):<div className={styles.empty}>No activity recorded yet.</div>}</div></ModalShell>}
function ModalShell({title,subtitle,onClose,children}:any){return <div className={styles.backdrop} role="presentation" onMouseDown={(e)=>{if(e.target===e.currentTarget)onClose()}}><section className={styles.modal} role="dialog" aria-modal="true" aria-label={title}><div className={styles.modalHead}><div><h2>{title}</h2><div className={styles.sub}>{subtitle}</div></div><button className={styles.closeBtn} aria-label="Close" onClick={onClose}>×</button></div>{children}</section></div>}
function Field({label,children}:any){return <div className={styles.field}><label>{label}</label>{children}</div>}
