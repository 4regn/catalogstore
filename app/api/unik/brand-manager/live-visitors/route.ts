import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";
import { getLiveVisitors } from "../../../../../lib/live-visitors";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const visitors = await getLiveVisitors(getAdmin(), seller.id);
  return NextResponse.json({ ok: true, visitors });
}
