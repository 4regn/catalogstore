import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getAdmin } from "../../../../lib/supabase-admin";
import { rateLimit, getClientIP } from "../../../../lib/rate-limit";
import { sendEmail } from "../../../../lib/email";

const VALID_CATEGORIES = ["general", "domain", "storefront"] as const;

/* Visitor (or logged-in seller) sends a chat message. Creates the
   conversation on first message. Anonymous visitors are identified by a
   random visitorId the widget stores in localStorage. A seller sending
   from inside the dashboard additionally passes their Supabase
   access_token, which we verify server-side to attach a trusted
   seller_id/category — the client-supplied name/email/category are never
   trusted for that linkage. All writes go through the service role; the
   tables have no RLS policies. */
export async function POST(req: NextRequest) {
  const ip = getClientIP(req);
  if (!rateLimit(`support-msg:${ip}`, 15, 60).allowed) {
    return NextResponse.json({ error: "Too many messages — please slow down." }, { status: 429 });
  }

  try {
    const { visitorId, conversationId, message, name, email, access_token, category, storefrontSellerId } = await req.json();

    if (!visitorId || typeof visitorId !== "string" || visitorId.length < 8 || visitorId.length > 64) {
      return NextResponse.json({ error: "Invalid visitor id" }, { status: 400 });
    }
    const body = typeof message === "string" ? message.trim().slice(0, 2000) : "";
    if (!body) {
      return NextResponse.json({ error: "Message is empty" }, { status: 400 });
    }

    let sellerId: string | null = null;
    let sellerName: string | null = null;
    let sellerEmail: string | null = null;
    if (typeof access_token === "string" && access_token) {
      const authed = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { global: { headers: { Authorization: `Bearer ${access_token}` } }, auth: { persistSession: false } }
      );
      const { data: userData } = await authed.auth.getUser();
      if (userData?.user) {
        sellerId = userData.user.id;
        const { data: sellerRow } = await getAdmin().from("sellers").select("store_name, email").eq("id", sellerId).maybeSingle();
        sellerName = sellerRow?.store_name || null;
        sellerEmail = sellerRow?.email || null;
      }
    }
    const cat = VALID_CATEGORIES.includes(category) ? category : "general";

    // A customer messaging a seller's storefront widget (Velour's live
    // chat) isn't authenticated as that seller -- storefrontSellerId just
    // says which public seller's inbox this belongs in. It grants no
    // privilege (the lookup below only confirms the id is a real seller),
    // it just routes the conversation for display.
    if (!sellerId && cat === "storefront" && typeof storefrontSellerId === "string") {
      const { data: sellerRow } = await getAdmin().from("sellers").select("id").eq("id", storefrontSellerId).maybeSingle();
      if (sellerRow) sellerId = sellerRow.id;
    }

    const admin = getAdmin();
    let convId = conversationId;

    if (convId) {
      // Verify the conversation belongs to this visitor (and, for seller
      // threads, to this seller).
      const { data: conv } = await admin
        .from("support_conversations")
        .select("id, visitor_id, seller_id, status")
        .eq("id", convId)
        .maybeSingle();
      if (!conv || conv.visitor_id !== visitorId || (sellerId && conv.seller_id !== sellerId)) {
        return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
      }
    } else {
      // Reuse the visitor's most recent open conversation in this category, else create one.
      let existingQuery = admin
        .from("support_conversations")
        .select("id")
        .eq("visitor_id", visitorId)
        .eq("category", cat)
        .eq("status", "open")
        .order("created_at", { ascending: false })
        .limit(1);
      if (sellerId) existingQuery = existingQuery.eq("seller_id", sellerId);
      const { data: existing } = await existingQuery.maybeSingle();

      if (existing) {
        convId = existing.id;
      } else {
        const { data: created, error: createErr } = await admin
          .from("support_conversations")
          .insert({
            visitor_id: visitorId,
            category: cat,
            seller_id: sellerId,
            name: sellerName || (typeof name === "string" ? name.trim().slice(0, 80) || null : null),
            email: sellerEmail || (typeof email === "string" ? email.trim().slice(0, 120) || null : null),
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

    // Bump conversation metadata + admin unread counter. Also bump the
    // seller's own unread counter, but only when this message is a
    // customer writing IN to a seller's storefront inbox -- not when the
    // seller themselves sent it (the access_token-authenticated domain
    // widget case), which would otherwise mark the seller's own message
    // as something they need to be notified about.
    const isSellerAuthored = !!access_token && !!sellerId;
    const { data: conv } = await admin
      .from("support_conversations")
      .select("admin_unread, seller_unread")
      .eq("id", convId)
      .maybeSingle();
    await admin.from("support_conversations").update({
      status: "open", // a new visitor message re-opens a closed conversation
      last_message_at: new Date().toISOString(),
      last_message_preview: body.slice(0, 120),
      admin_unread: (conv?.admin_unread || 0) + 1,
      ...(!isSellerAuthored && sellerId ? { seller_unread: (conv?.seller_unread || 0) + 1 } : {}),
      ...(sellerName ? { name: sellerName } : typeof name === "string" && name.trim() ? { name: name.trim().slice(0, 80) } : {}),
      ...(sellerEmail ? { email: sellerEmail } : typeof email === "string" && email.trim() ? { email: email.trim().slice(0, 120) } : {}),
    }).eq("id", convId);

    // Notify the seller by email of a new customer message (best-effort,
    // never blocks the visitor's own send).
    if (!isSellerAuthored && sellerId) {
      const { data: sellerRow } = await admin.from("sellers").select("email, store_name").eq("id", sellerId).maybeSingle();
      if (sellerRow?.email) {
        await sendEmail({
          to: sellerRow.email,
          subject: `New message from a customer — ${sellerRow.store_name || "your store"}`,
          html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#2A1F18">
            <h2 style="margin:0 0 12px">New Customer Message</h2>
            <p style="margin:0 0 12px;padding:14px 16px;background:#F5EDE3;border-radius:10px">${body.replace(/</g, "&lt;")}</p>
            <p style="margin:0;font-size:13px;color:#6B5141">Reply from your dashboard's Inbox.</p>
          </div>`,
        });
      }
    }

    return NextResponse.json({ ok: true, conversationId: convId });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
