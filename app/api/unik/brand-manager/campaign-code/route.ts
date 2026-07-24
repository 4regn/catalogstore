import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { manager } = auth;

  let body: { code?: string; discountPercent?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 20);
  const discountPercent = Math.max(0, Math.min(100, Number(body.discountPercent) || 0));
  if (code.length < 4) return NextResponse.json({ error: "Use at least four letters or numbers" }, { status: 400 });

  const { error } = await getAdmin().from("brand_managers").update({
    campaign_code: code,
    campaign_discount_percent: discountPercent,
    updated_at: new Date().toISOString(),
  }).eq("id", manager.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true, code, discountPercent });
}
