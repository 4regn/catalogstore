import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

/* Visitor polls their conversation for new messages (including admin
   replies). Ownership check: the conversation's visitor_id must match
   the visitorId the widget presents. */
export async function GET(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit(`support-poll:${ip}`, 60, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const conversationId = req.nextUrl.searchParams.get("conversationId");
  const visitorId = req.nextUrl.searchParams.get("visitorId");
  if (!conversationId || !visitorId) {
    return NextResponse.json({ error: "Missing params" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: conv } = await admin
    .from("support_conversations")
    .select("id, visitor_id, status")
    .eq("id", conversationId)
    .maybeSingle();
  if (!conv || conv.visitor_id !== visitorId) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: messages } = await admin
    .from("support_messages")
    .select("id, sender, body, created_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(200);

  return NextResponse.json({ status: conv.status, messages: messages ?? [] });
}
