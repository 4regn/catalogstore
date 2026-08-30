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
// Resend's free Marketing plan allows 1,000 contacts. Keep the campaign
// audience inside that hard limit so a later batch can never fail halfway
// through contact syncing after an earlier batch has already been sent.
const MAX_MARKETING_CONTACTS = 1000;

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
  return (await marketingAudienceContacts(admin, sellerId)).length;
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

type AudienceContact = { id: string; email: string; first_name: string | null; last_name: string | null };

async function allMarketingAudienceContacts(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  const rows = await allRows<{ id: string; email: string; first_name: string | null; last_name: string | null }>((from, to) => admin.from("customers")
    .select("id, email, first_name, last_name").eq("seller_id", sellerId).eq("accepts_email_marketing", true)
    .not("email", "is", null).order("id", { ascending: true }).range(from, to));
  const contactsByEmail = new Map<string, AudienceContact>();
  for (const contact of rows) {
    const email = contact.email?.trim().toLowerCase();
    if (!email) continue;
    const normalized = { ...contact, email, first_name: contact.first_name?.trim() || null, last_name: contact.last_name?.trim() || null };
    const existing = contactsByEmail.get(email);
    // A duplicate customer record with a name should always win over the
    // anonymous version so that as many subscribers as possible receive a
    // personalised greeting.
    if (!existing || (!existing.first_name && normalized.first_name)) contactsByEmail.set(email, normalized);
  }
  return [...contactsByEmail.values()].sort((a, b) => Number(!!b.first_name) - Number(!!a.first_name));
}

async function marketingAudienceContacts(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  return (await allMarketingAudienceContacts(admin, sellerId)).slice(0, MAX_MARKETING_CONTACTS);
}

async function campaignAudienceState(admin: ReturnType<typeof getAdmin>, sellerId: string) {
  // A recipient is only consumed once Resend has accepted a sent broadcast.
  // Keeping failed or discarded draft rows out of this set lets the merchant
  // correct the underlying Resend issue and safely prepare that same audience.
  const campaigns = await allRows<{ id: string }>((from, to) => admin.from("marketing_email_campaigns")
    .select("id").eq("seller_id", sellerId).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).eq("status", "sent").range(from, to));
  const used: Array<{ email: string }> = [];
  for (let index = 0; index < campaigns.length; index += 100) {
    const campaignIds = campaigns.slice(index, index + 100).map((campaign) => campaign.id);
    used.push(...await allRows<{ email: string }>((from, to) => admin.from("marketing_email_campaign_recipients")
      .select("email").eq("seller_id", sellerId).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).in("campaign_id", campaignIds).range(from, to)));
  }
  return new Set(used.map((row) => row.email.trim().toLowerCase()));
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    const action = typeof body.action === "string" ? body.action : "overview";
    const { admin, seller } = await authenticate(accessToken);

    if (action === "overview") {
      const [settings, allAudience, campaignsResult, usedEmails] = await Promise.all([
        getSettings(admin, seller.id),
        allMarketingAudienceContacts(admin, seller.id),
        admin.from("marketing_email_campaigns")
          .select("id, name, subject, preview_text, resend_broadcast_id, resend_segment_id, batch_number, recipient_count, status, scheduled_at, sent_at, last_error, created_at")
          .eq("seller_id", seller.id).order("created_at", { ascending: false }).limit(20),
        campaignAudienceState(admin, seller.id),
      ]);
      if (campaignsResult.error) throw campaignsResult.error;
      const audience = allAudience.slice(0, MAX_MARKETING_CONTACTS);
      const genericGreetingCount = audience.filter((contact) => !contact.first_name).length;
      return NextResponse.json({ ok: true, settings, audienceCount: audience.length, planExcludedCount: Math.max(0, allAudience.length - audience.length), genericGreetingCount, remainingCount: Math.max(0, audience.length - usedEmails.size), campaigns: campaignsResult.data || [], template: FLASH_WEEKEND_CAMPAIGN, sellerEmail: seller.email, maxBatchSize: MAX_BATCH_SIZE });
    }

    if (action === "sync") {
      const settings = await ensureSegment(admin, seller.id);
      const offset = Math.max(0, Math.floor(Number(body.offset) || 0));
      const batchSize = 12;
      const audience = await marketingAudienceContacts(admin, seller.id);
      const contacts = audience.slice(offset, offset + batchSize);

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
      const nextOffset = offset + contacts.length;
      const complete = nextOffset >= audience.length;
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
        marketingAudienceContacts(admin, seller.id),
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

    if (action === "free_contact_capacity") {
      const allAudience = await allMarketingAudienceContacts(admin, seller.id);
      const heldContacts = allAudience.slice(MAX_MARKETING_CONTACTS);
      const confirmation = typeof body.confirmation === "string" ? body.confirmation.trim() : "";
      if (confirmation !== `REMOVE ${heldContacts.length}`) {
        return NextResponse.json({ error: `Type REMOVE ${heldContacts.length} to confirm` }, { status: 400 });
      }
      if (heldContacts.length === 0) return NextResponse.json({ ok: true, deleted: 0, discardedBatches: 0 });

      // The quota-failed batch was never delivered. Remove its remote draft
      // and private segment first so the replacement batch has a segment slot.
      const { data: failedBatches, error: failedBatchesError } = await admin.from("marketing_email_campaigns")
        .select("id, resend_broadcast_id, resend_segment_id")
        .eq("seller_id", seller.id).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).eq("status", "failed");
      if (failedBatchesError) throw failedBatchesError;
      for (const batch of failedBatches || []) {
        if (batch.resend_broadcast_id) {
          try { await resendMarketingRequest(`/broadcasts/${batch.resend_broadcast_id}`, { method: "DELETE" }); }
          catch (error: any) { if (error?.status !== 404) throw error; }
        }
        if (batch.resend_segment_id) {
          try { await resendMarketingRequest(`/segments/${batch.resend_segment_id}`, { method: "DELETE" }); }
          catch (error: any) { if (error?.status !== 404) throw error; }
        }
        const { error: deleteBatchError } = await admin.from("marketing_email_campaigns").delete().eq("id", batch.id).eq("seller_id", seller.id);
        if (deleteBatchError) throw deleteBatchError;
      }

      // A broadcast that is already sent no longer needs its private segment.
      // Releasing it does not alter delivery, analytics, or the historical
      // broadcast; it only gives the Free plan a segment slot for Batch 2.
      const { data: sentBatches, error: sentBatchesError } = await admin.from("marketing_email_campaigns")
        .select("id, resend_segment_id")
        .eq("seller_id", seller.id).eq("template_key", FLASH_WEEKEND_CAMPAIGN.key).eq("status", "sent")
        .not("resend_segment_id", "is", null);
      if (sentBatchesError) throw sentBatchesError;
      let releasedSegments = 0;
      for (const batch of sentBatches || []) {
        try {
          await resendMarketingRequest(`/segments/${batch.resend_segment_id}`, { method: "DELETE" });
          releasedSegments += 1;
        } catch (error: any) {
          if (error?.status !== 404) throw error;
        }
        const { error: clearSegmentError } = await admin.from("marketing_email_campaigns")
          .update({ resend_segment_id: null, updated_at: new Date().toISOString() }).eq("id", batch.id).eq("seller_id", seller.id);
        if (clearSegmentError) throw clearSegmentError;
      }

      // Only the 150 contacts deliberately outside this 1,000-contact
      // campaign audience are deleted from Resend. Their CatalogStore records
      // and marketing-consent history remain untouched and can be re-synced later.
      let deleted = 0;
      for (let index = 0; index < heldContacts.length; index += 5) {
        const batch = heldContacts.slice(index, index + 5);
        const results = await Promise.all(batch.map(async (contact) => {
          try {
            await resendMarketingRequest(`/contacts/${encodeURIComponent(contact.email)}`, { method: "DELETE" });
            return true;
          } catch (error: any) {
            if (error?.status === 404) return false;
            throw error;
          }
        }));
        deleted += results.filter(Boolean).length;
      }
      return NextResponse.json({ ok: true, deleted, discardedBatches: (failedBatches || []).length, releasedSegments });
    }

    if (action === "discard") {
      const campaignId = typeof body.campaign_id === "string" ? body.campaign_id : "";
      const { data: campaign, error } = await admin.from("marketing_email_campaigns").select("id, status, resend_broadcast_id, resend_segment_id, template_key")
        .eq("id", campaignId).eq("seller_id", seller.id).single();
      if (error || !campaign) return NextResponse.json({ error: "Campaign batch not found" }, { status: 404 });
      if (campaign.template_key !== FLASH_WEEKEND_CAMPAIGN.key) return NextResponse.json({ error: "Only Flash Weekend drafts can be discarded here" }, { status: 403 });
      if (!['preparing', 'draft'].includes(campaign.status)) return NextResponse.json({ error: "Only unsent batches can be discarded" }, { status: 409 });

      // Delete the Resend draft first. If this ever fails (for example because
      // a draft was already sent outside the dashboard), keep the local batch
      // intact rather than risking a campaign that cannot be audited.
      if (campaign.resend_broadcast_id) {
        try {
          await resendMarketingRequest(`/broadcasts/${campaign.resend_broadcast_id}`, { method: "DELETE" });
        } catch (discardError: any) {
          if (discardError?.status !== 404) throw discardError;
        }
      }
      if (campaign.resend_segment_id) {
        try {
          await resendMarketingRequest(`/segments/${campaign.resend_segment_id}`, { method: "DELETE" });
        } catch (discardError: any) {
          if (discardError?.status !== 404) throw discardError;
        }
      }
      const { error: deleteError } = await admin.from("marketing_email_campaigns").delete().eq("id", campaign.id).eq("seller_id", seller.id);
      if (deleteError) throw deleteError;
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (error: any) {
    console.error("Email marketing API error:", error);
    return NextResponse.json({ error: error?.message || "Email marketing request failed" }, { status: error?.status || 500 });
  }
}
