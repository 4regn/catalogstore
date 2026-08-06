import { SupabaseClient } from "@supabase/supabase-js";

/* PostgREST applies its own default row cap to any select with no
   explicit .range() -- confirmed against a real seller's project (the
   cap there is 1000): a client-requested .limit() can't exceed the
   server's own cap, so even `.limit(2000)` on the sitemap query was
   silently truncated. Any query that could plausibly return more than a
   few hundred rows for a real seller (product listings, sitemaps) needs
   to page through via .range() rather than trust a single request to
   return everything. */
export async function fetchAllRows<T>(
  client: SupabaseClient,
  table: string,
  columns: string,
  filter: (q: any) => any,
  pageSize = 1000
): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await filter(client.from(table).select(columns)).range(from, from + pageSize - 1);
    if (error) throw new Error(`Fetching "${table}" failed at offset ${from}: ${error.message}`);
    all.push(...((data as T[]) || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}
