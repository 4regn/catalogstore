import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../../lib/rate-limit";

async function authenticate(accessToken: string | null) {
  if (!accessToken) return null;
  const authed = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } }, auth: { persistSession: false } }
  );
  const { data } = await authed.auth.getUser();
  return data?.user || null;
}

/* Fetch a single conversation's messages + mark the seller's unread
   counter clear (separate from admin_unread, the platform admin's own
   counter for the same table). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = getClientIP(req);
  if (!rateLimit(`seller-support-thread:${ip}`, 60, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const user = await authenticate(req.nextUrl.searchParams.get("accessToken"));
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const admin = getAdmin();
  const { data: conv } = await admin.from("support_conversations").select("id, seller_id, name, email, status").eq("id", id).maybeSingle();
  if (!conv || conv.seller_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: messages } = await admin.from("support_messages").select("id, sender, body, created_at").eq("conversation_id", id).order("created_at", { ascending: true }).limit(200);
  await admin.from("support_conversations").update({ seller_unread: 0 }).eq("id", id);

  return NextResponse.json({ conversation: conv, messages: messages ?? [] });
}

/* Seller replies. sender="seller" (a new value alongside the existing
   'visitor'/'admin' -- support_messages.sender has no CHECK constraint,
   and the widget only special-cases sender==="visitor", so anything else
   renders as a business reply with no schema change needed). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ip = getClientIP(req);
  if (!rateLimit(`seller-support-reply:${ip}`, 20, 60).allowed) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }
  const { accessToken, message } = await req.json();
  const user = await authenticate(accessToken);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = typeof message === "string" ? message.trim().slice(0, 2000) : "";
  if (!body) return NextResponse.json({ error: "Message is empty" }, { status: 400 });

  const admin = getAdmin();
  const { data: conv } = await admin.from("support_conversations").select("id, seller_id").eq("id", id).maybeSingle();
  if (!conv || conv.seller_id !== user.id) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { error } = await admin.from("support_messages").insert({ conversation_id: id, sender: "seller", body });
  if (error) return NextResponse.json({ error: "Could not send message" }, { status: 500 });

  await admin.from("support_conversations").update({ last_message_at: new Date().toISOString(), last_message_preview: body.slice(0, 120) }).eq("id", id);

  return NextResponse.json({ ok: true });
}
