import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

/* Lists the UNIK Labs storefront's customer-chat conversations, plus
   Partner HQ support conversations (category="partner") so a partner
   asking for help lands in the same inbox instead of a separate system.
   Reuses the same support_conversations/support_messages tables the rest
   of the platform's live chat already uses -- nothing new to migrate,
   just a Brand-Manager-scoped read. */
export async function GET(req: NextRequest) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;

  const { data: conversations, error } = await getAdmin()
    .from("support_conversations")
    .select("id, name, email, status, category, seller_unread, last_message_at, last_message_preview, created_at")
    .eq("seller_id", seller.id)
    .in("category", ["storefront", "partner"])
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ conversations: conversations ?? [] });
}
