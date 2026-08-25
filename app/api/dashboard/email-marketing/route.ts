import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import {
  SPRING_CAMPAIGN,
  ensureContactInSegment,
  fourRegnMarketingFrom,
  resendMarketingRequest,
  springCampaignHtml,
} from "../../../../lib/resend-marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Settings = {
  seller_id: string;
  resend_segment_id: string | null;
  segment_name: string;
  synced_contact_count: number;
  last_synced_at: string | null;
};

async function authenticate(accessToken: string) {
  const admin = getAdmin();
  const { data, error } = await admin.auth.getUser(accessToken);
  if (error || !data.user) throw Object.assign(new Error("Not signed in"), { status: 401 });
  const { data: seller } = await admin.from("sellers").select("id, email, store_name, subdomain").eq("id", data.user.id).maybeSingle();
  if (!seller || seller.subdomain !== "4regn") throw Object.assign(new Error("Email campaigns are currently enabled for 4REGN only"), { status: 403 });
  return { admin, seller };
}

async function getSettings(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const { data } = await admin.from("marketing_email_settings").select("*").eq("seller_id", sellerId).maybeSingle();
  return data as Settings | null;
}

async function ensureSegment(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const existing = await getSettings(admin, sellerId);
  if (existing?.resend_segment_id) return existing;
  const segment = await resendMarketingRequest<{ id: string }>("/segments", {
    method: "POST",
    body: JSON.stringify({ name: "4REGN Email Subscribers" }),
  });
  const { data, error } = await admin.from("marketing_email_settings").upsert({
    seller_id: sellerId,
    resend_segment_id: segment.id,
    segment_name: "4REGN Email Subscribers",
    updated_at: new Date().toISOString(),
  }).select("*").single();
  if (error) throw error;
  return data as Settings;
}

async function audienceCount(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const { count, error } = await admin.from("customers").select("id", { count: "exact", head: true })
    .eq("seller_id", sellerId).eq("accepts_email_marketing", true).not("email", "is", null);
  if (error) throw error;
  return count || 0;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    const action = typeof body.action === "string" ? body.action : "overview";
    const { admin, seller } = await authenticate(accessToken);

    if (action === "overview") {
      const [settings, count, campaignsResult] = await Promise.all([
        getSettings(admin, seller.id),
        audienceCount(admin, seller.id),
        admin.from("marketing_email_campaigns")
          .select("id, name, subject, preview_text, resend_broadcast_id, recipient_count, status, scheduled_at, sent_at, last_error, created_at")
          .eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(20),
      ]);
      if (campaignsResult.error) throw campaignsResult.error;
      return NextResponse.json({ ok: true, settings, audienceCount: count, campaigns: campaignsResult.data || [], template: SPRING_CAMPAIGN, sellerEmail: seller.email });
    }

    if (action === "sync") {
      const settings = await ensureSegment(admin, seller.id);
      const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
      const batchSize = 12;
      const { data: contacts, error } = await admin.from("customers")
        .select("email, first_name, last_name")
        .eq("seller_id", seller.id).eq("accepts_email_marketing", true).not("email", "is", null)
        .order("id", { ascending: true }).range(offset, offset + batchSize - 1);
      if (error) throw error;

      let synced = 0;
      const failures: string[] = [];
      for (const contact of contacts || []) {
        try {
          await ensureContactInSegment({ email: String(contact.email).trim().toLowerCase(), firstName: contact.first_name, lastName: contact.last_name }, settings.resend_segment_id!);
          synced += 1;
        } catch (contactError: any) {
          failures.push(contactError?.message || "Contact sync failed");
        }
      }

      const total = await audienceCount(admin, seller.id);
      const nextOffset = offset + (contacts?.length || 0);
      const complete = nextOffset >= total;
      if (complete) {
        await admin.from("marketing_email_settings").update({ synced_contact_count: total - failures.length, last_synced_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("seller_id", seller.id);
      }
      return NextResponse.json({ ok: failures.length === 0, synced, failed: failures.length, errors: failures.slice(0, 3), offset: nextOffset, total, complete });
    }

    if (action === "test") {
      const to = typeof body.to === "string" ? body.to.trim().toLowerCase() : "";
      if (!/^\S+@\S+\.\S+$/.test(to)) return NextResponse.json({ error: "Enter a valid test email address" }, { status: 400 });
      const html = (await springCampaignHtml())
        .replaceAll("{{{contact.first_name|there}}}", "there")
        .replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://4regn.com/");
      const result = await resendMarketingRequest<{ id: string }>("/emails", {
        method: "POST",
        body: JSON.stringify({ from: fourRegnMarketingFrom(), to: [to], reply_to: "info@4regn.com", subject: `[TEST] ${SPRING_CAMPAIGN.subject}`, html }),
      });
      return NextResponse.json({ ok: true, emailId: result.id });
    }

    if (action === "create_draft") {
      const settings = await ensureSegment(admin, seller.id);
      const count = await audienceCount(admin, seller.id);
      if (!settings.last_synced_at || settings.synced_contact_count < count) {
        return NextResponse.json({ error: "Sync the complete opted-in audience before creating this Broadcast." }, { status: 409 });
      }
      const html = await springCampaignHtml();
      if (!html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")) throw new Error("Campaign template is missing its Resend unsubscribe link");
      const broadcast = await resendMarketingRequest<{ id: string }>("/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          segment_id: settings.resend_segment_id,
          from: fourRegnMarketingFrom(),
          reply_to: "info@4regn.com",
          name: SPRING_CAMPAIGN.name,
          subject: SPRING_CAMPAIGN.subject,
          preview_text: SPRING_CAMPAIGN.previewText,
          html,
        }),
      });
      const { data: campaign, error } = await admin.from("marketing_email_campaigns").insert({
        seller_id: seller.id,
        name: SPRING_CAMPAIGN.name,
        subject: SPRING_CAMPAIGN.subject,
        preview_text: SPRING_CAMPAIGN.previewText,
        template_key: SPRING_CAMPAIGN.key,
        html_snapshot: html,
        resend_broadcast_id: broadcast.id,
        recipient_count: count,
        status: "draft",
      }).select("id, resend_broadcast_id, status").single();
      if (error) throw error;
      return NextResponse.json({ ok: true, campaign });
    }

    if (action === "send") {
      const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
      const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
      const { data: campaign, error } = await admin.from("marketing_email_campaigns").select("*").eq("id", campaignId).eq("seller_id", seller.id).single();
      if (error || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      if (campaign.status !== "draft" || !campaign.resend_broadcast_id) return NextResponse.json({ error: "Only an unsent draft can be sent" }, { status: 409 });
      if (confirmation !== `SEND ${campaign.recipient_count}`) return NextResponse.json({ error: `Type SEND ${campaign.recipient_count} to confirm` }, { status: 400 });

      await admin.from("marketing_email_campaigns").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", campaign.id);
      try {
        await resendMarketingRequest(`/broadcasts/${campaign.resend_broadcast_id}/send`, { method: "POST", body: "{}" });
        await admin.from("marketing_email_campaigns").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", campaign.id);
      } catch (sendError: any) {
        await admin.from("marketing_email_campaigns").update({ status: "failed", last_error: sendError?.message || "Send failed", updated_at: new Date().toISOString() }).eq("id", campaign.id);
        throw sendError;
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Email marketing API error:", error);
    return NextResponse.json({ error: error?.message || "Email marketing request failed" }, { status: error?.status || 500 });
  }
}
