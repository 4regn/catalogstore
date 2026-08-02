import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

export const dynamic = "force-dynamic";

const COOKIE = "setla-customer-access";

/* Server-side sign-in for the same reason signup is server-side (see that
   route's comment) -- login.html never loads the Supabase SDK. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit("setla-login:" + ip, 10, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const email = String(body.email || "").trim().toLowerCase();
  const password = String(body.password || "");
  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  const admin = getAdmin();
  const { data: signInData, error: signInErr } = await admin.auth.signInWithPassword({ email, password });
  if (signInErr || !signInData.session) {
    return NextResponse.json({ error: "The email or password is incorrect. Please try again." }, { status: 401 });
  }

  const { data: customer } = await admin.from("setla_customers").select("id").eq("auth_user_id", signInData.session.user.id).maybeSingle();
  if (!customer) {
    return NextResponse.json({ error: "This account doesn't have a SETLA profile" }, { status: 403 });
  }

  // The cookie is always short-lived (matches the underlying Supabase
  // access token's own ~1hr expiry, same as every other unik-*-access
  // cookie in this app) -- "remember me" doesn't extend it. Instead it's a
  // signal the client uses to decide whether to persist refreshToken in
  // localStorage (survives closing the browser) vs sessionStorage
  // (cleared on close), and /api/setla/auth/refresh silently mints a new
  // cookie from that refresh token whenever the short one expires.
  const response = NextResponse.json({ success: true, refreshToken: signInData.session.refresh_token });
  response.cookies.set(COOKIE, signInData.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 55 * 60,
  });
  return response;
}
