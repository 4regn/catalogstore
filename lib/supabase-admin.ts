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
