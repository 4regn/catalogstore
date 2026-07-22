import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const token = req.cookies.get("unik-customer-access")?.value || "";
  if (!token) {
    return NextResponse.json({ error: "Sign in required" }, { status: 401 });
  }

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user) {
    const response = NextResponse.json({ error: "Your session has expired" }, { status: 401 });
    response.cookies.set("unik-customer-access", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: 0,
    });
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

  const response = NextResponse.json({ ok: true });
  response.cookies.set("unik-customer-access", token, {
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
  response.cookies.set("unik-customer-access", "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
