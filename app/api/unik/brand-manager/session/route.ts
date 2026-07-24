import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { getUnikSeller } from "../../../../../lib/unik-customer";

export const dynamic = "force-dynamic";

const COOKIE = "unik-brand-manager-access";

async function isBrandManager(authUserId: string) {
  const seller = await getUnikSeller();
  if (!seller) {
    console.error("Brand manager session: getUnikSeller() found no seller", { authUserId });
    return false;
  }
  const { data, error } = await getAdmin().from("brand_managers").select("id").eq("seller_id", seller.id).eq("auth_user_id", authUserId).maybeSingle();
  if (error || !data) {
    console.error("Brand manager session: no matching brand_managers row", { authUserId, sellerId: seller.id, error });
  }
  return !!data;
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value || "";
  if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user || !(await isBrandManager(data.user.id))) {
    const response = NextResponse.json({ error: "Your session has expired" }, { status: 401 });
    response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(req: NextRequest) {
  let body: { accessToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const token = String(body.accessToken || "");
  if (!token) return NextResponse.json({ error: "Missing session" }, { status: 400 });

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });
  if (!(await isBrandManager(data.user.id))) return NextResponse.json({ error: "This account doesn't have Brand Manager access" }, { status: 403 });

  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 55 * 60,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function DELETE() {
  const response = NextResponse.json({ ok: true });
  response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
