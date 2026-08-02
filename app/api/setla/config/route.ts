import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/* public/setla/reset-password.html is the one SETLA page that has to load
   the Supabase SDK client-side (see that file for why -- the password-
   recovery token lands in the URL fragment, which never reaches the
   server). It's a plain static file, so it can't read process.env at
   request time the way a React page can; this just hands it the same
   NEXT_PUBLIC_* values already shipped to every browser bundle in this
   app (lib/supabase.ts) -- the anon key is meant to be public, safe
   behind RLS, not a secret. */
export async function GET() {
  return NextResponse.json({
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
  });
}
