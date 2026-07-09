import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireAdmin } from "../../../../lib/require-admin";

/* Admin: list support conversations, newest activity first. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const status = req.nextUrl.searchParams.get("status"); // 'open' | 'closed' | null = all
  const category = req.nextUrl.searchParams.get("category"); // 'general' | 'domain' | 'seller' | null = all

  let query = getAdmin()
    .from("support_conversations")
    .select("id, visitor_id, name, email, status, admin_unread, last_message_at, last_message_preview, created_at, category, seller_id")
    .order("last_message_at", { ascending: false })
    .limit(200);
  if (status === "open" || status === "closed") {
    query = query.eq("status", status);
  }
  if (category === "seller") {
    query = query.not("seller_id", "is", null);
  } else if (category === "general" || category === "domain") {
    query = query.eq("category", category);
  }

  const { data: conversations, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalUnread = (conversations ?? []).reduce((s, c) => s + (c.admin_unread || 0), 0);
  return NextResponse.json({ conversations: conversations ?? [], totalUnread });
}
