import { NextRequest, NextResponse } from "next/server";
import { createDisposableAdmin } from "../../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

/* Exchanges a Supabase refresh token for a fresh unik-customer-access
   cookie, without the customer needing to sign in again. The static
   storefront pages (checkout.html in particular) never load the Supabase
   SDK, so they can't refresh their own session -- this lets them recover
   from an expired 55-minute access-token cookie using the refresh token
   UnikAccountClient.tsx already stashed in localStorage at sign-in,
   instead of bouncing the customer back to /account mid-checkout and
   losing whatever they'd already typed into the delivery form. */
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
  response.cookies.set("unik-customer-access", data.session.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 55 * 60,
  });
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
