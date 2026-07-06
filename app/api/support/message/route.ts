import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";

/* Visitor sends a chat message. Creates the conversation on first message.
   Visitors are anonymous — identified by a random visitorId the widget
   stores in localStorage. All writes go through the service role; the
   tables have no RLS policies. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit(`support-msg:${ip}`, 15, 60).allowed) {
    return NextResponse.json({ error: "Too many messages — please slow down." }, { status: 429 });
  }

  try {
    const { visitorId, conversationId, message, name, email } = await req.json();

    if (!visitorId || typeof visitorId !== "string" || visitorId.length < 8 || visitorId.length > 64) {
      return NextResponse.json({ error: "Invalid visitor id" }, { status: 400 });
    }
    const body = typeof message === "string" ? message.trim().slice(0, 2000) : "";
    if (!body) {
      return NextResponse.json({ error: "Message is empty" }, { status: 400 });
    }

    const admin = getAdmin();
    let convId = conversationId;

    if (convId) {
      // Verify the conversation belongs to this visitor.
      const { data: conv } = await admin
        .from("support_conversations")
        .select("id, visitor_id, status")
        .eq("id", convId)
        .maybeSingle();
      if (!conv || conv.visitor_id !== visitorId) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      // Reuse the visitor's most recent open conversation, else create one.
      const { data: existing } = await admin
        .from("support_conversations")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing) {
        convId = existing.id;
      } else {
        const { data: created, error: createErr } = await admin
          .from("support_conversations")
          .insert({
            visitor_id: visitorId,
            name: typeof name === "string" ? name.trim().slice(0, 80) || null : null,
            email: typeof email === "string" ? email.trim().slice(0, 120) || null : null,
          })
          .select("id")
          .single();
        if (createErr || !created) {
          return NextResponse.json({ error: "Could not start conversation" }, { status: 500 });
        }
        convId = created.id;
      }
    }

    const { error: msgErr } = await admin.from("support_messages").insert({
      conversation_id: convId,
      sender: "visitor",
      body,
    });
    if (msgErr) {
      return NextResponse.json({ error: "Could not send message" }, { status: 500 });
    }

    // Bump conversation metadata + admin unread counter.
    const { data: conv } = await admin
      .from("support_conversations")
      .select("admin_unread")
      .eq("id", convId)
      .maybeSingle();
    await admin.from("support_conversations").update({
      status: "open", // a new visitor message re-opens a closed conversation
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 120),
      admin_unread: (conv?.admin_unread || 0) + 1,
      ...(typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 80) } : {}),
      ...(typeof email === "string" && email.trim() ? { email: email.trim().slice(0, 120) } : {}),
    }).eq("id", convId);

    return NextResponse.json({ ok: true, conversationId: convId });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
