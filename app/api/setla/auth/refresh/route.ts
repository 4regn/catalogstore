import { NextRequest, NextResponse } from "next/server";
import { createDisposableAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

/* Same purpose as unik/auth/refresh: the static SETLA pages never load the
   Supabase SDK, so they can't refresh their own session. This exchanges
   the refresh token setla.js stashed at sign-in for a fresh 55-minute
   setla-customer-access cookie. */
export async function POST(req: NextRequest) {
  let body: { refreshToken?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const refreshToken = String(body.refreshToken || "");
  if (!refreshToken) return NextResponse.json({ error: "Missing refresh token" }, { status: 400 });

  // Disposable, not the shared getAdmin() singleton -- refreshSession()
  // mutates the client's in-memory active session the same way
  // signInWithPassword does; see createDisposableAdmin's own comment for
  // the real RLS-violation bug that pattern caused elsewhere.
  const { data, error } = await createDisposableAdmin().auth.refreshSession({ refresh_token: refreshToken });
  if (error || !data.session) {
    return NextResponse.json({ error: "Could not refresh session" }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true, refreshToken: data.session.refresh_token });
  response.cookies.set("setla-customer-access", data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 55 * 60,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
