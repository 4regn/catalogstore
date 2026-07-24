import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

export async function PATCH(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { manager } = auth;

  let body: { fullName?: string; email?: string; avatarUrl?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }

  const fullName = String(body.fullName || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  if (!fullName) return NextResponse.json({ error: "Add your name" }, { status: 400 });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });

  const update: Record<string, string | null> = { full_name: fullName, email, updated_at: new Date().toISOString() };
  if (body.avatarUrl !== undefined) update.avatar_url = body.avatarUrl ? String(body.avatarUrl).slice(0, 500) : null;

  const { error } = await getAdmin().from("brand_managers").update(update).eq("id", manager.id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
