import { createClient, SupabaseClient } from "@supabase/supabase-js";

/* Lazy-initialised service-role Supabase client for API routes.
   Next 16's collect-page-data build phase imports route modules even when
   no request is being served; if those modules call createClient() at the
   top level and the env vars are missing, the build dies with
   "supabaseUrl is required". Importing this helper and calling getAdmin()
   inside the handler defers the actual client construction to runtime. */

let _client: SupabaseClient | null = null;

export function getAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  _client = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return _client;
}

export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop, receiver) {
    return Reflect.get(getAdmin(), prop, receiver);
  },
});

/* getAdmin()'s whole point is a SHARED client instance reused across
   requests on the same warm serverless instance. That's safe for plain
   data queries (the service-role key is just a static header) but NOT
   for auth.signInWithPassword()/auth.refreshSession() -- both of those
   call supabase-js's internal _saveSession(), which overwrites the
   client's in-memory active session, and every PostgREST/RPC call made
   through that same client afterward is signed with THAT session's JWT
   instead of the service-role key -- persistSession:false only stops it
   from being written to storage, it does nothing to stop the in-memory
   swap. Confirmed as a real, live bug: a customer logging in via
   /api/setla/auth/login (which calls signInWithPassword on the shared
   getAdmin() client) then placing an order via /api/checkout/place-order
   moments later, on the same warm instance, hit "new row violates row-
   level security policy for table orders" -- place-order's own insert had
   silently started running as that customer's own low-privilege JWT
   instead of the service role. Any route that signs in or refreshes a
   session server-side (SETLA/UNIK login+refresh) must use a disposable
   client from here instead of the shared singleton above, so the swap
   dies with the request instead of poisoning whatever else that instance
   handles next. */
export function createDisposableAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin client missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
