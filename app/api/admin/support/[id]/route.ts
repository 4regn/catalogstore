import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { requireAdmin } from "../../../../../lib/require-admin";

/* Admin: read a conversation (marks it read), reply, or open/close it. */

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  const admin = getAdmin();

  const { data: conversation } = await admin
    .from("support_conversations")
    .select("id, visitor_id, name, email, status, admin_unread, last_message_at, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!conversation) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { data: messages } = await admin
    .from("support_messages")
    .select("id, sender, body, created_at")
    .eq("conversation_id", id)
    .order("created_at", { ascending: true })
    .limit(500);

  // Opening the thread clears the unread counter.
  if (conversation.admin_unread > 0) {
    await admin.from("support_conversations").update({ admin_unread: 0 }).eq("id", id);
  }

  return NextResponse.json({ conversation, messages: messages ?? [] });
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const text = typeof body?.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!text) {
    return NextResponse.json({ error: "Message is empty" }, { status: 400 });
  }

  const admin = getAdmin();
  const { data: conv } = await admin
    .from("support_conversations")
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (!conv) {
    return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
  }

  const { error: msgErr } = await admin.from("support_messages").insert({
    conversation_id: id,
    sender: "admin",
    body: text,
  });
  if (msgErr) {
    return NextResponse.json({ error: "Could not send reply" }, { status: 500 });
  }

  await admin.from("support_conversations").update({
    status: "open",
    last_message_at: new Date().toISOString(),
    last_message_preview: text.slice(0, 120),
    admin_unread: 0,
  }).eq("id", id);

  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const status = body?.status;
  if (status !== "open" && status !== "closed") {
    return NextResponse.json({ error: "status must be 'open' or 'closed'" }, { status: 400 });
  }

  const { error } = await getAdmin()
    .from("support_conversations")
    .update({ status })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
