import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import {
  FLASH_WEEKEND_CAMPAIGN,
  ensureContactInSegment,
  fourRegnMarketingFrom,
  resendMarketingRequest,
  flashWeekendCampaignHtml,
} from "../../../../lib/resend-marketing";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const MAX_BATCH_SIZE = 600;

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
  return (await personalizedAudienceContacts(admin, sellerId)).length;
}

async function unnamedAudienceCount(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const rows = await allRows<{ email: string; first_name: string | null }>((from, to) => admin.from("customers")
    .select("email, first_name").eq("seller_id", sellerId).eq("accepts_email_marketing", true)
    .not("email", "is", null).order("id", { ascending: true }).range(from, to));
  const namesByEmail = new Map<string, boolean>();
  for (const contact of rows) {
    const email = contact.email?.trim().toLowerCase();
    if (!email) continue;
    namesByEmail.set(email, (namesByEmail.get(email) || false) || !!contact.first_name?.trim());
  }
  return [...namesByEmail.values()].filter((hasName) => !hasName).length;
}

async function allRows<T>(loadPage: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: any }>) {
  const rows: T[] = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await loadPage(from, from + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function personalizedAudienceContacts(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const rows = await allRows<{ id: string; email: string; first_name: string | null; last_name: string | null }>((from, to) => admin.from("customers")
    .select("id, email, first_name, last_name").eq("seller_id", sellerId).eq("accepts_email_marketing", true)
    .not("email", "is", null).order("id", { ascending: true }).range(from, to));
  const seen = new Set<string>();
  return rows.filter((contact) => {
    const email = contact.email?.trim().toLowerCase();
    const firstName = contact.first_name?.trim();
    if (!email || !firstName || seen.has(email)) return false;
    contact.email = email;
    contact.first_name = firstName;
    seen.add(email);
    return true;
  });
}

async function campaignAudienceState(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const used = await allRows<{ email: string }>((from, to) => admin.from("marketing_email_campaign_recipients")
    .select("email").eq("seller_id", sellerId).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).range(from, to));
  return new Set(used.map((row) => row.email.trim().toLowerCase()));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    const action = typeof body.action === "string" ? body.action : "overview";
    const { admin, seller } = await authenticate(accessToken);

    if (action === "overview") {
      const [settings, count, skippedUnnamedCount, campaignsResult, usedEmails] = await Promise.all([
        getSettings(admin, seller.id),
        audienceCount(admin, seller.id),
        unnamedAudienceCount(admin, seller.id),
        admin.from("marketing_email_campaigns")
          .select("id, name, subject, preview_text, resend_broadcast_id, resend_segment_id, batch_number, recipient_count, status, scheduled_at, sent_at, last_error, created_at")
          .eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(20),
        campaignAudienceState(admin, seller.id),
      ]);
      if (campaignsResult.error) throw campaignsResult.error;
      return NextResponse.json({ ok: true, settings, audienceCount: count, skippedUnnamedCount, remainingCount: Math.max(0, count - usedEmails.size), campaigns: campaignsResult.data || [], template: FLASH_WEEKEND_CAMPAIGN, sellerEmail: seller.email, maxBatchSize: MAX_BATCH_SIZE });
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
      const html = (await flashWeekendCampaignHtml())
        .replaceAll("{{{contact.first_name|there}}}", "there")
        .replaceAll("{{{RESEND_UNSUBSCRIBE_URL}}}", "https://4regn.com/");
      const result = await resendMarketingRequest<{ id: string }>("/emails", {
        method: "POST",
        body: JSON.stringify({ from: fourRegnMarketingFrom(), to: [to], reply_to: "info@4regn.com", subject: `[TEST] ${FLASH_WEEKEND_CAMPAIGN.subject}`, html }),
      });
      return NextResponse.json({ ok: true, emailId: result.id });
    }

    if (action === "create_draft") {
      const requestedLimit = Math.floor(Number(body.recipient_limit) || MAX_BATCH_SIZE);
      const limit = Math.min(MAX_BATCH_SIZE, Math.max(1, requestedLimit));
      const existingOpen = await admin.from("marketing_email_campaigns").select("id, status")
        .eq("seller_id", seller.id).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).in("status", ["preparing", "draft"]).limit(1).maybeSingle();
      if (existingOpen.data) return NextResponse.json({ error: "Finish the existing prepared batch before creating another one." }, { status: 409 });

      const [contacts, usedEmails] = await Promise.all([
        personalizedAudienceContacts(admin, seller.id),
        campaignAudienceState(admin, seller.id),
      ]);
      const selected = contacts.filter((contact) => !usedEmails.has(contact.email.trim().toLowerCase())).slice(0, limit);
      if (!selected.length) return NextResponse.json({ error: "Every eligible subscriber has already been included in this campaign." }, { status: 409 });

      const { data: lastBatch } = await admin.from("marketing_email_campaigns").select("batch_number")
        .eq("seller_id", seller.id).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).order("batch_number", { ascending: false }).limit(1).maybeSingle();
      const batchNumber = Number(lastBatch?.batch_number || 0) + 1;
      const segment = await resendMarketingRequest<{ id: string }>("/segments", {
        method: "POST",
        body: JSON.stringify({ name: `4REGN Flash Weekend — Batch ${batchNumber}` }),
      });
      const html = await flashWeekendCampaignHtml();
      if (!html.includes("{{{RESEND_UNSUBSCRIBE_URL}}}")) throw new Error("Campaign template is missing its Resend unsubscribe link");
      const { data: campaign, error } = await admin.from("marketing_email_campaigns").insert({
        seller_id: seller.id,
        name: `${FLASH_WEEKEND_CAMPAIGN.name} — Batch ${batchNumber}`,
        subject: FLASH_WEEKEND_CAMPAIGN.subject,
        preview_text: FLASH_WEEKEND_CAMPAIGN.previewText,
        template_key: FLASH_WEEKEND_CAMPAIGN.key,
        html_snapshot: html,
        resend_segment_id: segment.id,
        batch_number: batchNumber,
        recipient_count: selected.length,
        status: "preparing",
      }).select("id, resend_segment_id, batch_number, recipient_count, status").single();
      if (error) throw error;
      const { error: recipientsError } = await admin.from("marketing_email_campaign_recipients").insert(selected.map((contact) => ({
        campaign_id: campaign.id,
        seller_id: seller.id,
        customer_id: contact.id,
        template_key: FLASH_WEEKEND_CAMPAIGN.key,
        email: contact.email.trim().toLowerCase(),
        first_name: contact.first_name,
        last_name: contact.last_name,
      })));
      if (recipientsError) {
        await admin.from("marketing_email_campaigns").delete().eq("id", campaign.id);
        throw recipientsError;
      }
      return NextResponse.json({ ok: true, campaign, prepared: 0, total: selected.length, complete: false });
    }

    if (action === "prepare_draft") {
      const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
      const { data: campaign, error } = await admin.from("marketing_email_campaigns").select("*")
        .eq("id", campaignId).eq("seller_id", seller.id).single();
      if (error || !campaign) return NextResponse.json({ error: "Campaign batch not found" }, { status: 404 });
      if (campaign.status !== "preparing" || !campaign.resend_segment_id) return NextResponse.json({ error: "This campaign batch is not awaiting preparation" }, { status: 409 });

      const { data: recipients, error: recipientsError } = await admin.from("marketing_email_campaign_recipients")
        .select("id, email, first_name, last_name").eq("campaign_id", campaign.id).eq("status", "queued")
        .order("created_at", { ascending: true }).limit(12);
      if (recipientsError) throw recipientsError;

      for (const recipient of recipients || []) {
        await ensureContactInSegment({ email: recipient.email, firstName: recipient.first_name, lastName: recipient.last_name }, campaign.resend_segment_id);
        await admin.from("marketing_email_campaign_recipients").update({ status: "synced", updated_at: new Date().toISOString() }).eq("id", recipient.id);
      }

      const { count: queuedCount, error: queuedError } = await admin.from("marketing_email_campaign_recipients")
        .select("id", { count: "exact", head: true }).eq("campaign_id", campaign.id).eq("status", "queued");
      if (queuedError) throw queuedError;
      const prepared = campaign.recipient_count - (queuedCount || 0);
      if ((queuedCount || 0) > 0) return NextResponse.json({ ok: true, campaignId: campaign.id, prepared, total: campaign.recipient_count, complete: false });

      const broadcast = await resendMarketingRequest<{ id: string }>("/broadcasts", {
        method: "POST",
        body: JSON.stringify({
          segment_id: campaign.resend_segment_id,
          from: fourRegnMarketingFrom(),
          reply_to: "info@4regn.com",
          name: campaign.name,
          subject: campaign.subject,
          preview_text: campaign.preview_text,
          html: campaign.html_snapshot,
        }),
      });
      await admin.from("marketing_email_campaigns").update({ resend_broadcast_id: broadcast.id, status: "draft", updated_at: new Date().toISOString() }).eq("id", campaign.id);
      return NextResponse.json({ ok: true, campaignId: campaign.id, prepared, total: campaign.recipient_count, complete: true });
    }

    if (action === "send") {
      const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
      const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
      const { data: campaign, error } = await admin.from("marketing_email_campaigns").select("*").eq("id", campaignId).eq("seller_id", seller.id).single();
      if (error || !campaign) return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
      if (campaign.status !== "draft" || !campaign.resend_broadcast_id) return NextResponse.json({ error: "Only an unsent draft can be sent" }, { status: 409 });
      if (campaign.recipient_count > MAX_BATCH_SIZE) return NextResponse.json({ error: `This batch exceeds the ${MAX_BATCH_SIZE}-recipient safety limit and cannot be sent.` }, { status: 409 });
      const { data: campaignRecipients, error: campaignRecipientsError } = await admin.from("marketing_email_campaign_recipients")
        .select("first_name").eq("campaign_id", campaign.id);
      if (campaignRecipientsError) throw campaignRecipientsError;
      if ((campaignRecipients || []).some((recipient) => !recipient.first_name?.trim())) {
        return NextResponse.json({ error: "This draft contains unnamed recipients and is blocked from sending. Prepare a new named-subscriber batch." }, { status: 409 });
      }
      if (confirmation !== `SEND ${campaign.recipient_count}`) return NextResponse.json({ error: `Type SEND ${campaign.recipient_count} to confirm` }, { status: 400 });

      await admin.from("marketing_email_campaigns").update({ status: "sending", updated_at: new Date().toISOString() }).eq("id", campaign.id);
      try {
        await resendMarketingRequest(`/broadcasts/${campaign.resend_broadcast_id}/send`, { method: "POST", body: "{}" });
        await admin.from("marketing_email_campaigns").update({ status: "sent", sent_at: new Date().toISOString(), updated_at: new Date().toISOString(), last_error: null }).eq("id", campaign.id);
        await admin.from("marketing_email_campaign_recipients").update({ status: "sent", updated_at: new Date().toISOString() }).eq("campaign_id", campaign.id);
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
