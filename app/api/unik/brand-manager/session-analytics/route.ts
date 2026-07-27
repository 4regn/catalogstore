import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";
import { getSessionAnalytics } from "../../../../../lib/store-analytics";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const analytics = await getSessionAnalytics(getAdmin(), seller.id);
  return NextResponse.json({ ok: true, ...analytics });
}
