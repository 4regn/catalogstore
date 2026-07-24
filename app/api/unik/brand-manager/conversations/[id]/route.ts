import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireUnikBrandManager } from "../../../../../../lib/unik-brand-manager";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;
  const { id } = await context.params;

  const admin = getAdmin();
  const { data: conv } = await admin.from("support_conversations").select("id, seller_id, name, email, status").eq("id", id).maybeSingle();
  if (!conv || conv.seller_id !== seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: messages } = await admin.from("support_messages").select("id, sender, body, created_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
  await admin.from("support_conversations").update({ seller_unread: 0 }).eq("id", id);

  return NextResponse.json({ conversation: conv, messages: messages ?? [] });
}

/* Brand Manager reply. sender="brand_manager" -- support_messages.sender has
   no CHECK constraint and the customer-facing widget only special-cases
   sender==="visitor", so this needs no schema change; it just renders as a
   business reply like "seller" does. */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireUnikBrandManager(req);
  if ("response" in auth) return auth.response;
  const { seller } = auth;
  const { id } = await context.params;

  let body: { message?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
  if (!message) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

  const admin = getAdmin();
  const { data: conv } = await admin.from("support_conversations").select("id, seller_id").eq("id", id).maybeSingle();
  if (!conv || conv.seller_id !== seller.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin.from("support_messages").insert({ conversation_id: id, sender: "brand_manager", body: message });
  if (error) return NextResponse.json({ error: "Could not send message" }, { status: 500 });

  await admin.from("support_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: message.slice(0, 120) }).eq("id", id);

  return NextResponse.json({ ok: true });
}
