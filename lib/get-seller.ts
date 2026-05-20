import { cache } from "react";
import { supabaseAdmin } from "./supabase-admin";

// React's cache() de-duplicates the fetch across generateMetadata + the page render
// within a single request, so we don't hit Supabase twice just to set the favicon.

export const SELLER_COLUMNS =
  "id, store_name, whatsapp_number, subdomain, template, primary_color, logo_url, banner_url, tagline, description, collections, social_links, store_config, checkout_config, subscription_status, trial_ends_at, payfast_subscription_token";

export const getSeller = cache(async (slug: string) => {
  const { data } = await supabaseAdmin
    .from("sellers")
    .select(SELLER_COLUMNS)
    .eq("subdomain", slug)
    .maybeSingle();
  return data;
});
