import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

/* Lists the authenticated seller's customer-inbox conversations (storefront
   live chat, e.g. Velour's chat widget) -- distinct from the platform
   admin's inbox, which sees every seller's threads. support_conversations
   has no RLS policies (service-role only), so this is the only way a
   seller can read their own threads. */
export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit(`seller-support-list:${ip}`, 30, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const accessToken = req.nextUrl.searchParams.get("accessToken");
  if (!accessToken) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const authed = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
  );
  const { data: userData } = await authed.auth.getUser();
  if (!userData?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdmin();
  const { data: conversations } = await admin
    .from("support_conversations")
    .select("id, name, email, status, seller_unread, last_message_at, last_message_preview, created_at")
    .eq("seller_id", userData.user.id)
    .eq("category", "storefront")
    .order("last_message_at", { ascending: false })
    .limit(100);

  return NextResponse.json({ conversations: conversations ?? [] });
}
