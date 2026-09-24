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

export type ReconcileChunkResult = { checked: number; corrected: number; neverSyncedEmails: string[]; nextCursor: string | null; complete: boolean };

const RECONCILE_CHUNK_SIZE = 150;
const RECONCILE_CONCURRENCY = 5;
// Resend enforces 10 requests/second account-wide. 5-wide batches at least
// 650ms apart stay comfortably under that (~7.7 req/s) even with jitter.
const RECONCILE_BATCH_INTERVAL_MS = 650;

/* Shared by the daily reconciliation cron (app/api/cron/reconcile-resend-unsubscribes,
   which loops chunks itself within its own time budget) and the dashboard
   "Sync unsubscribes from Resend" button (action "reconcile_unsubscribes" in
   app/api/dashboard/email-marketing, which loops chunks the same way create_draft/
   prepare_draft already do for campaign batches) so both trigger the exact same logic.

   This used to discover contacts by paginating GET /segments/{id}/contacts across every
   batch segment, trusting each entry's unsubscribed field. That field turned out to be
   unreliable: real customers confirmed "Unsubscribed" in Resend's own dashboard (verified
   against GET /contacts/{email} via the diagnose_emails debug tool) were coming back as
   still-subscribed through the segment listing, so reconciliation silently corrected
   nothing for them. GET /contacts/{email} is the one source that matched Resend's dashboard
   exactly, so that's now the ONLY source of truth here -- every customer we still believe
   is opted in gets looked up directly by email instead of relying on any segment listing.

   That also means one request per customer, which a large audience can't do in a single
   call without tripping Resend's 10 req/s limit (checking ~1,150 at once did exactly that)
   or Vercel's function duration limit. So this processes one bounded, rate-limited chunk
   at a time via keyset pagination (id cursor, not offset -- an offset would drift as
   corrections remove rows from the accepts_email_marketing=true filter mid-scan, silently
   skipping whoever the shift pushed past the page boundary). Callers loop chunk to chunk
   until `complete`. */
export async function reconcileSellerUnsubscribes(admin: any, sellerId: string, afterId: string | null = null): Promise<ReconcileChunkResult> {
  let query = admin.from("customers")
    .select("id, email, accepts_email_marketing")
    .eq("seller_id", sellerId).eq("accepts_email_marketing", true).not("email", "is", null)
    .order("id", { ascending: true })
    .limit(RECONCILE_CHUNK_SIZE);
  if (afterId) query = query.gt("id", afterId);
  const { data } = await query;
  const localCustomers: { id: string; email: string; accepts_email_marketing: boolean }[] = data || [];

  let checked = 0;
  let corrected = 0;
  // Customers with no Resend contact record at all (404) -- never synced, so
  // they cannot have unsubscribed via Resend. Surfaced for visibility only.
  const neverSyncedEmails: string[] = [];
  const nowIso = new Date().toISOString();
  for (let index = 0; index < localCustomers.length; index += RECONCILE_CONCURRENCY) {
    const batchStart = Date.now();
    const batch = localCustomers.slice(index, index + RECONCILE_CONCURRENCY);
    const contacts = await Promise.all(batch.map((c) => getContactByEmail(String(c.email).trim().toLowerCase())));
    checked += batch.length;
    for (let i = 0; i < batch.length; i++) {
      const contact = contacts[i];
      if (!contact) { neverSyncedEmails.push(String(batch[i].email).trim().toLowerCase()); continue; }
      if (!contact.unsubscribed) continue;
      const { error } = await admin
        .from("customers")
        .update({ accepts_email_marketing: false, marketing_consent_updated_at: nowIso, updated_at: nowIso })
        .eq("id", batch[i].id);
      if (!error) corrected++;
    }
    const isLastBatch = index + RECONCILE_CONCURRENCY >= localCustomers.length;
    const elapsed = Date.now() - batchStart;
    if (!isLastBatch && elapsed < RECONCILE_BATCH_INTERVAL_MS) {
      await new Promise((resolve) => setTimeout(resolve, RECONCILE_BATCH_INTERVAL_MS - elapsed));
    }
  }

  return {
    checked,
    corrected,
    neverSyncedEmails,
    nextCursor: localCustomers.length ? localCustomers[localCustomers.length - 1].id : afterId,
    complete: localCustomers.length < RECONCILE_CHUNK_SIZE,
  };
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

/* Manual override for a seller who has confirmed specific emails as
   unsubscribed by eye in Resend's own dashboard and wants them excluded
   from the next batch right away, without waiting on API-based
   reconciliation. Pure local write -- no Resend calls, so no rate limit
   concerns. Matches case-insensitively and updates every row for that
   email (a customer can have more than one row from duplicate imports/
   guest checkouts, and every one of them feeds the campaign audience query). */
export async function manuallyUnsubscribeEmails(admin: any, sellerId: string, emails: string[]): Promise<{ matched: number; updated: number }> {
  const nowIso = new Date().toISOString();
  let matched = 0;
  let updated = 0;
  for (const raw of emails) {
    const email = String(raw || "").trim().toLowerCase();
    if (!email) continue;
    const { data, error } = await admin.from("customers")
      .update({ accepts_email_marketing: false, marketing_consent_updated_at: nowIso, updated_at: nowIso })
      .eq("seller_id", sellerId).ilike("email", email)
      .select("id");
    if (!error) { matched++; updated += data?.length || 0; }
  }
  return { matched, updated };
}
