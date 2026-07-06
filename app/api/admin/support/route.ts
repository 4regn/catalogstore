import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireAdmin } from "../../../../lib/require-admin";

/* Admin: list support conversations, newest activity first. */
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const status = req.nextUrl.searchParams.get("status"); // 'open' | 'closed' | null = all

  let query = getAdmin()
    .from("support_conversations")
    .select("id, visitor_id, name, email, status, admin_unread, last_message_at, last_message_preview, created_at")
    .order("last_message_at", { ascending: false })
    .limit(100);
  if (status === "open" || status === "closed") {
    query = query.eq("status", status);
  }

  const { data: conversations, error } = await query;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const totalUnread = (conversations ?? []).reduce((s, c) => s + (c.admin_unread || 0), 0);
  return NextResponse.json({ conversations: conversations ?? [], totalUnread });
}
