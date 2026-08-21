import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";
export * from "./four-regn-production-calculations";

export function cleanText(value: unknown, max = 180) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

export function cleanMoney(value: unknown, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000 ? Math.round(number * 100) / 100 : fallback;
}

export async function requireFourRegnProductionAdmin(req: NextRequest): Promise<
  | { ok: true; userId: string; sellerId: string; email: string }
  | { ok: false; response: NextResponse }
> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!token) return { ok: false, response: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return { ok: false, response: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };

  const { data: ownSeller } = await admin.from("sellers").select("id,subdomain").eq("id", data.user.id).maybeSingle();
  if (ownSeller?.subdomain === "4regn") {
    return { ok: true, userId: data.user.id, sellerId: ownSeller.id, email: data.user.email || "" };
  }

  const platformAdmin = (process.env.ADMIN_EMAIL || "info@4regn.com").toLowerCase();
  if ((data.user.email || "").toLowerCase() === platformAdmin) {
    const { data: fourRegn } = await admin.from("sellers").select("id").eq("subdomain", "4regn").maybeSingle();
    if (fourRegn) return { ok: true, userId: data.user.id, sellerId: fourRegn.id, email: data.user.email || "" };
  }
  return { ok: false, response: NextResponse.json({ error: "Production is restricted to 4REGN admin" }, { status: 403 }) };
}
