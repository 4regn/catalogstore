import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 25;
// Safety cap on the raw rows aggregated per request -- UNIK is a single
// seller today, so this is generous headroom rather than a real limit.
const RAW_FETCH_CAP = 5000;

type CustomerRow = {
  id: string; profileId: string | null; fullName: string | null; email: string | null; avatarUrl: string | null;
  createdAt: string; orderCount: number; totalSpent: number; designCount: number; lastOrderAt: string | null;
};

/* A "customer" here isn't one single table -- unik_customer_profiles only
   gets a row the first time someone visits their account page (see
   app/api/unik/account/route.ts's upsert), so a customer who checked out
   without ever revisiting /account, or who only generated a design and
   never bought, wouldn't show up if we only read that table. This unions
   profiles with distinct customer_auth_user_id on orders and auth_user_id
   on unik_designs, aggregating order/spend/design counts in memory --
   there's no cheap GROUP BY across three sources via the Supabase JS
   client, and at UNIK's current scale a full in-memory merge is cheap. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const admin = getAdmin();
  const [profilesResult, ordersResult, designsResult] = await Promise.all([
    admin.from("unik_customer_profiles").select("id, auth_user_id, email, full_name, avatar_url, created_at").eq("seller_id", seller.id).limit(RAW_FETCH_CAP),
    admin.from("orders").select("customer_auth_user_id, customer_name, customer_email, total, payment_status, created_at").eq("seller_id", seller.id).not("customer_auth_user_id", "is", null).limit(RAW_FETCH_CAP),
    admin.from("unik_designs").select("auth_user_id, created_at").eq("seller_id", seller.id).eq("owner_role", "customer").not("auth_user_id", "is", null).limit(RAW_FETCH_CAP),
  ]);

  const byId = new Map<string, CustomerRow>();
  function ensure(id: string, createdAt: string): CustomerRow {
    let c = byId.get(id);
    if (!c) {
      c = { id, profileId: null, fullName: null, email: null, avatarUrl: null, createdAt, orderCount: 0, totalSpent: 0, designCount: 0, lastOrderAt: null };
      byId.set(id, c);
    }
    return c;
  }

  for (const p of profilesResult.data || []) {
    const c = ensure(p.auth_user_id, p.created_at);
    c.profileId = p.id;
    c.fullName = p.full_name;
    c.email = p.email;
    c.avatarUrl = p.avatar_url;
  }
  for (const o of ordersResult.data || []) {
    if (!o.customer_auth_user_id) continue;
    const c = ensure(o.customer_auth_user_id, o.created_at);
    c.orderCount += 1;
    if (o.payment_status === "paid") c.totalSpent += Number(o.total) || 0;
    if (!c.lastOrderAt || o.created_at > c.lastOrderAt) c.lastOrderAt = o.created_at;
    if (!c.fullName && o.customer_name) c.fullName = o.customer_name;
    if (!c.email && o.customer_email) c.email = o.customer_email;
  }
  for (const d of designsResult.data || []) {
    if (!d.auth_user_id) continue;
    ensure(d.auth_user_id, d.created_at).designCount += 1;
  }

  let customers = Array.from(byId.values());
  const q = (req.nextUrl.searchParams.get("q") || "").trim().toLowerCase();
  if (q) {
    customers = customers.filter((c) => (c.fullName || "").toLowerCase().includes(q) || (c.email || "").toLowerCase().includes(q));
  }
  customers.sort((a, b) => (b.lastOrderAt || b.createdAt).localeCompare(a.lastOrderAt || a.createdAt));

  const page = Math.max(0, Number(req.nextUrl.searchParams.get("page") || "0"));
  const from = page * PAGE_SIZE;
  const paged = customers.slice(from, from + PAGE_SIZE);

  return NextResponse.json({ customers: paged, total: customers.length, page, hasMore: customers.length > from + PAGE_SIZE }, { headers: { "Cache-Control": "private, no-store" } });
}
