import { createHmac } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

// Signed so a guessed/enumerated URL can't unsubscribe someone else's
// email address -- keyed off the service-role key rather than a new env
// var, since it's already a strong per-project secret every deployment
// already has configured (getAdmin() requires it to function at all).
function secret(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured");
  return key;
}

export function unsubscribeToken(sellerId: string, email: string): string {
  return createHmac("sha256", secret()).update(`${sellerId}:${email.trim().toLowerCase()}`).digest("hex").slice(0, 32);
}

export function buildUnsubscribeUrl(origin: string, sellerId: string, email: string): string {
  const qs = new URLSearchParams({ seller: sellerId, email, token: unsubscribeToken(sellerId, email) });
  return `${origin}/api/email/unsubscribe?${qs.toString()}`;
}

export async function isUnsubscribed(admin: SupabaseClient, sellerId: string, email: string): Promise<boolean> {
  const { data } = await admin
    .from("marketing_email_unsubscribes")
    .select("id")
    .eq("seller_id", sellerId)
    .eq("email", email.trim().toLowerCase())
    .maybeSingle();
  return !!data;
}
