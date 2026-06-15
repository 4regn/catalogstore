import { createClient } from "@supabase/supabase-js";

/* During Next 16's collect-page-data / generate-static-pages phases the
   build process imports this module without real env values. The
   supabase-js constructor throws if the URL is empty, breaking the
   build. We feed it a placeholder URL when env is missing so module
   evaluation succeeds; any actual call would 404 against the placeholder,
   but at runtime the env values are always present. */
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
