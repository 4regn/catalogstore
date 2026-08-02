import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

const COOKIE = "setla-customer-access";

export async function GET(req: NextRequest) {
  const token = req.cookies.get(COOKIE)?.value || "";
  if (!token) return NextResponse.json({ error: "Sign in required" }, { status: 401 });

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user) {
    const response = NextResponse.json({ error: "Your session has expired" }, { status: 401 });
    response.cookies.set(COOKIE, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  }

  const response = NextResponse.json({ ok: true });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

// Used only by reset-password.html: that page signs in via the client-side
// Supabase SDK (the one exception, see that file's comment), then hands
// the resulting access token here to be exchanged for the same httpOnly
// cookie every other SETLA auth route sets -- mirrors the brand-manager/
// partner session routes' POST handler exactly.
export async function POST(req: NextRequest) {
  let body: { accessToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const token = String(body.accessToken || "");
  if (!token) return NextResponse.json({ error: "Missing session" }, { status: 400 });

  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const { data: customer } = await admin.from("setla_customers").select("id").eq("auth_user_id", data.user.id).maybeSingle();
  if (!customer) return NextResponse.json({ error: "This account doesn't have a SETLA profile" }, { status: 403 });

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
