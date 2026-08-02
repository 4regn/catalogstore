import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

const ROW_CAP = 20000; // aggregated in-process below -- fine at Phase 1 volume, a real GROUP BY becomes worth it well before this cap is ever hit

// Aggregates setla_page_views into what the admin Analytics panel needs:
// a daily trend, a top-pages breakdown, and headline totals for the
// selected window. Rows are fetched once and reduced in JS rather than
// with several separate aggregate queries -- simplest thing that works
// at the traffic this product actually has right now.
export async function GET(req: NextRequest) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;

  const days = Math.min(90, Math.max(1, Number(new URL(req.url).searchParams.get("days") || 30)));
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

  const admin = getAdmin();
  const { data: rows, error } = await admin
    .from("setla_page_views")
    .select("path, visitor_id, host, created_at")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const views = rows || [];
  const uniqueVisitors = new Set(views.map((v) => v.visitor_id)).size;

  const byPage = new Map<string, number>();
  for (const v of views) byPage.set(v.path, (byPage.get(v.path) || 0) + 1);
  const topPages = [...byPage.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([path, count]) => ({ path, count }));

  // Which domain views actually came from -- e.g. telling setla.4regn.com
  // (the standalone demand-validation landing page) apart from these same
  // static pages being reached via uniklabs.co.za/setla/*.
  const byHost = new Map<string, number>();
  for (const v of views) byHost.set(v.host || "(unknown)", (byHost.get(v.host || "(unknown)") || 0) + 1);
  const topHosts = [...byHost.entries()].sort((a, b) => b[1] - a[1]).map(([host, count]) => ({ host, count }));

  const byDay = new Map<string, number>();
  for (let i = days - 1; i >= 0; i--) {
    const key = new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    byDay.set(key, 0);
  }
  for (const v of views) {
    const key = v.created_at.slice(0, 10);
    if (byDay.has(key)) byDay.set(key, (byDay.get(key) || 0) + 1);
  }
  const daily = [...byDay.entries()].map(([date, count]) => ({ date, count }));

  const todayKey = new Date().toISOString().slice(0, 10);
  const viewsToday = byDay.get(todayKey) || 0;

  return NextResponse.json({
    days,
    totalViews: views.length,
    uniqueVisitors,
    viewsToday,
    topPages,
    topHosts,
    daily,
    truncated: views.length >= ROW_CAP,
  });
}
