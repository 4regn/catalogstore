import { readFile } from "node:fs/promises";
import path from "node:path";
import { getFourRegnResendFrom } from "./email";

import { SETLA_PAY_LATER_CAMPAIGN, BIG_SPRING_SALE_CAMPAIGN, BIG_SPRING_SALE_REMINDER_CAMPAIGN, getMarketingCampaign } from "./marketing-campaigns";
export { SETLA_PAY_LATER_CAMPAIGN } from "./marketing-campaigns";

export async function marketingCampaignHtml(key: string) {
  const campaign = getMarketingCampaign(key);
  if (!campaign) throw new Error("Unknown email campaign");
  // Literal paths ensure both templates are included in the server deployment.
  if (campaign.key === SETLA_PAY_LATER_CAMPAIGN.key) {
    return readFile(path.join(process.cwd(), "public", "email", "4regn-setla-pay-later-2026.html"), "utf8");
  }
  if (campaign.key === BIG_SPRING_SALE_CAMPAIGN.key || campaign.key === BIG_SPRING_SALE_REMINDER_CAMPAIGN.key) {
    return readFile(path.join(process.cwd(), "public", "email", "4regn-big-spring-sale-2026-09.html"), "utf8");
  }
  return readFile(path.join(process.cwd(), "public", "email", "4regn-r229-flash-sale-2026-09.html"), "utf8");
}

export async function setlaPayLaterCampaignHtml() {
  return marketingCampaignHtml(SETLA_PAY_LATER_CAMPAIGN.key);
}

export function marketingApiKey() {
  const key = process.env.FOUR_REGN_RESEND_MARKETING_API_KEY;
  if (!key) {
    throw new Error("FOUR_REGN_RESEND_MARKETING_API_KEY is not configured. Add a separate Resend Full access key in Vercel for Contacts, Segments and Broadcasts.");
  }
  return key;
}

export async function resendMarketingRequest<T>(endpoint: string, init: RequestInit = {}, retry = true): Promise<T> {
  const response = await fetch(`https://api.resend.com${endpoint}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${marketingApiKey()}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });

  if (response.status === 429 && retry) {
    const retryAfter = Math.min(5000, Math.max(500, Number(response.headers.get("retry-after") || 1) * 1000));
    await new Promise((resolve) => setTimeout(resolve, retryAfter));
    return resendMarketingRequest<T>(endpoint, init, false);
  }

  const body = await response.text();
  let parsed: any = {};
  try { parsed = body ? JSON.parse(body) : {}; } catch { parsed = { message: body }; }
  if (!response.ok) {
    const error = new Error(parsed?.message || `Resend request failed (${response.status})`) as Error & { status?: number; details?: unknown };
    error.status = response.status;
    error.details = parsed;
    throw error;
  }
  return parsed as T;
}

export async function ensureContactInSegment(contact: { email: string; firstName?: string | null; lastName?: string | null }, segmentId: string) {
  try {
    await resendMarketingRequest("/contacts", {
      method: "POST",
      body: JSON.stringify({
        email: contact.email,
        first_name: contact.firstName || undefined,
        last_name: contact.lastName || undefined,
        unsubscribed: false,
        segments: [{ id: segmentId }],
      }),
    });
    return "created" as const;
  } catch (error: any) {
    if (error?.status !== 409) throw error;
  }

  const encodedEmail = encodeURIComponent(contact.email);
  await resendMarketingRequest(`/contacts/${encodedEmail}`, {
    method: "PATCH",
    body: JSON.stringify({
      first_name: contact.firstName || undefined,
      last_name: contact.lastName || undefined,
    }),
  });
  try {
    await resendMarketingRequest(`/contacts/${encodedEmail}/segments/${segmentId}`, { method: "POST", body: "{}" });
  } catch (error: any) {
    if (error?.status !== 409) throw error;
  }
  return "updated" as const;
}

export type ResendSegmentContact = { id: string; email: string; unsubscribed: boolean };

/* Full contact list for a segment, with each contact's CURRENT unsubscribed
   status -- the read half of what ensureContactInSegment only ever writes.
   Paginates via Resend's cursor convention (GET .../contacts, response
   { object: "list", data: [...], has_more }, next page via
   ?after=<last item's id>) since a real segment here can hold 1000+
   contacts, well past a single page. Used by the unsubscribe reconciliation
   cron to catch anyone the contact.updated webhook missed (e.g. the 25 days
   it sat disabled in Resend's dashboard before anyone noticed) -- Resend's
   own unsubscribed flag is authoritative here, not our local guess. */
export async function listSegmentContacts(segmentId: string): Promise<ResendSegmentContact[]> {
  const all: ResendSegmentContact[] = [];
  let after: string | null = null;
  for (let page = 0; page < 50; page++) {
    const queryString: string = after ? `?after=${encodeURIComponent(after)}` : "";
    const response: { data: ResendSegmentContact[]; has_more?: boolean } = await resendMarketingRequest(`/segments/${segmentId}/contacts${queryString}`);
    const batch: ResendSegmentContact[] = response?.data || [];
    all.push(...batch);
    if (!response?.has_more || !batch.length) break;
    after = batch[batch.length - 1]?.id || null;
    if (!after) break;
  }
  return all;
}

export function fourRegnMarketingFrom() {
  return getFourRegnResendFrom();
}

/* Single-contact counterpart to the PATCH/DELETE /contacts/{email} calls
   above -- looks a contact up by email with no segment involved. Used to
   close the gap segment scanning can't: a batch's segment gets deleted once
   "Free Resend contact capacity" cleans it up (or a segment reference was
   never recorded at all), but the underlying Resend contact -- and its
   unsubscribed flag -- survives that deletion. Returns null on 404 (this
   email was simply never synced to Resend, so there's nothing to reconcile). */
export async function getContactByEmail(email: string): Promise<ResendSegmentContact | null> {
  try {
    return await resendMarketingRequest<ResendSegmentContact>(`/contacts/${encodeURIComponent(email)}`);
  } catch (error: any) {
    if (error?.status === 404) return null;
    throw error;
  }
}

export type ReconcileUnsubscribesResult = { checked: number; corrected: number; segmentsScanned: number; lookedUpIndividually: number; neverSyncedEmails: string[]; note?: string };

/* Shared by the daily reconciliation cron (app/api/cron/reconcile-resend-unsubscribes)
   and the dashboard "Sync unsubscribes from Resend" button (action "reconcile_unsubscribes"
   in app/api/dashboard/email-marketing) so both trigger the exact same logic -- Resend's
   own unsubscribed flag is authoritative, corrected onto the local customers row in
   whichever direction they disagree.

   There is no single "audience" segment that holds every subscriber: each campaign batch
   (app/api/dashboard/email-marketing action "create_draft") creates its OWN Resend segment,
   so real contacts are scattered across every batch's segment_id on marketing_email_campaigns
   (plus the legacy marketing_email_settings.resend_segment_id, from an unused "sync" action,
   kept here in case it's ever populated). A contact's unsubscribed flag is a single account-wide
   attribute in Resend -- segments are just membership groups -- so it doesn't matter which
   segment a contact is read from, only that every segment that might hold real subscribers
   gets scanned. A batch's segment can be gone by now (deleted by "Free Resend contact capacity"
   cleanup), so a 404 on any one segment is skipped rather than failing the whole reconciliation. */
export async function reconcileSellerUnsubscribes(admin: any, sellerId: string): Promise<ReconcileUnsubscribesResult> {
  const [settingsRes, campaignsRes] = await Promise.all([
    admin.from("marketing_email_settings").select("resend_segment_id").eq("seller_id", sellerId).maybeSingle(),
    admin.from("marketing_email_campaigns").select("resend_segment_id").eq("seller_id", sellerId).not("resend_segment_id", "is", null),
  ]);

  const segmentIds = new Set<string>();
  if (settingsRes.data?.resend_segment_id) segmentIds.add(settingsRes.data.resend_segment_id);
  for (const row of campaignsRes.data || []) {
    if (row.resend_segment_id) segmentIds.add(row.resend_segment_id);
  }
  if (!segmentIds.size) return { checked: 0, corrected: 0, segmentsScanned: 0, lookedUpIndividually: 0, neverSyncedEmails: [], note: "No Resend segments found yet -- prepare and send a campaign batch first" };

  const resendContactsByEmail = new Map<string, ResendSegmentContact>();
  let segmentsScanned = 0;
  for (const segmentId of segmentIds) {
    try {
      const contacts = await listSegmentContacts(segmentId);
      segmentsScanned++;
      for (const contact of contacts) {
        const email = String(contact.email || "").trim().toLowerCase();
        if (email) resendContactsByEmail.set(email, contact);
      }
    } catch (segmentError: any) {
      if (segmentError?.status !== 404) throw segmentError;
    }
  }

  const { data: localCustomersData } = await admin.from("customers").select("id, email, accepts_email_marketing").eq("seller_id", sellerId);
  const localCustomers: { id: string; email: string; accepts_email_marketing: boolean }[] = localCustomersData || [];
  const localByEmail = new Map(localCustomers.map((c) => [String(c.email || "").trim().toLowerCase(), c]));

  // Segment scanning can miss real contacts (a batch's segment gets deleted by
  // "Free Resend contact capacity" cleanup once sent, or was never recorded).
  // For every customer we still believe is opted in but didn't turn up in any
  // scanned segment, look their contact up directly by email -- this is the
  // set someone would notice as "still getting emails after unsubscribing",
  // so it's worth the extra requests even though it's not every customer.
  const missingEmails = localCustomers
    .filter((c) => c.accepts_email_marketing)
    .map((c) => String(c.email || "").trim().toLowerCase())
    .filter((email) => email && !resendContactsByEmail.has(email));

  let lookedUpIndividually = 0;
  // Emails still unaccounted for after the direct lookup too -- these never
  // received a Resend contact record at all (404 both ways), so they cannot
  // have unsubscribed via Resend. Surfaced so a human can eyeball them rather
  // than assume "not found in a segment" means "unsubscribed".
  const neverSyncedEmails: string[] = [];
  const LOOKUP_CONCURRENCY = 5;
  for (let index = 0; index < missingEmails.length; index += LOOKUP_CONCURRENCY) {
    const batch = missingEmails.slice(index, index + LOOKUP_CONCURRENCY);
    const results = await Promise.all(batch.map((email) => getContactByEmail(email)));
    lookedUpIndividually += batch.length;
    batch.forEach((email, i) => {
      const contact = results[i];
      if (contact?.email) resendContactsByEmail.set(String(contact.email).trim().toLowerCase(), contact);
      else neverSyncedEmails.push(email);
    });
  }

  let corrected = 0;
  const nowIso = new Date().toISOString();
  for (const contact of resendContactsByEmail.values()) {
    const email = String(contact.email || "").trim().toLowerCase();
    if (!email) continue;
    const local = localByEmail.get(email);
    if (!local) continue; // Resend contact with no matching local customer row -- nothing to reconcile.
    const shouldAcceptMarketing = !contact.unsubscribed;
    if (local.accepts_email_marketing === shouldAcceptMarketing) continue;

    const { error } = await admin
      .from("customers")
      .update({ accepts_email_marketing: shouldAcceptMarketing, marketing_consent_updated_at: nowIso, updated_at: nowIso })
      .eq("id", local.id);
    if (!error) corrected++;
  }

  return { checked: resendContactsByEmail.size, corrected, segmentsScanned, lookedUpIndividually, neverSyncedEmails };
}

export type EmailDiagnosis = {
  email: string;
  localFound: boolean;
  localAcceptsMarketing: boolean | null;
  localRowCount: number;
  resendFound: boolean;
  resendUnsubscribed: boolean | null;
};

/* Pinpoints exactly why a specific email isn't being reconciled correctly,
   instead of guessing again -- checks the local customers row(s) (case-
   insensitive, and counts duplicates since a customer can have more than
   one row for the same email) side by side with what Resend's own contact
   record says right now. Built for spot-checking real examples a seller
   found by eye in Resend's dashboard (e.g. "Unsubscribed 29d ago") against
   what reconcileSellerUnsubscribes concluded for them. */
export async function diagnoseEmails(admin: any, sellerId: string, emails: string[]): Promise<EmailDiagnosis[]> {
  const results: EmailDiagnosis[] = [];
  for (const raw of emails) {
    const email = String(raw || "").trim().toLowerCase();
    if (!email) continue;
    const [{ data: localRows }, resendContact] = await Promise.all([
      admin.from("customers").select("accepts_email_marketing").eq("seller_id", sellerId).ilike("email", email),
      getContactByEmail(email),
    ]);
    const rows: { accepts_email_marketing: boolean }[] = localRows || [];
    results.push({
      email,
      localFound: rows.length > 0,
      localAcceptsMarketing: rows.length > 0 ? rows.some((r) => r.accepts_email_marketing) : null,
      localRowCount: rows.length,
      resendFound: !!resendContact,
      resendUnsubscribed: resendContact ? resendContact.unsubscribed : null,
    });
  }
  return results;
}
