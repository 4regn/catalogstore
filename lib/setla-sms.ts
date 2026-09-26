import { sendSms } from "./sms";
import { SETLA_CUSTOMER_ORIGIN, SETLA_NUDGE_MAX_LIMIT } from "./setla-email";

// setla.4regn.com is the SETLA marketing/customer-facing domain (see
// middleware.ts's SETLA_MARKETING_HOSTS) -- it rewrites clean paths like
// /dashboard straight to the real /setla/dashboard.html page, so this is
// the same destination the "official" uniklabs.co.za link points at,
// just branded to 4REGN, which is who most of these customers actually
// know (they bought there, not on uniklabs.co.za).
const SETLA_DASHBOARD_URL = `${SETLA_CUSTOMER_ORIGIN}/dashboard`;
const SETLA_APPLY_URL = `${SETLA_CUSTOMER_ORIGIN}/apply`;

// SMS companion to signupNudgeEmailContent (lib/setla-email.ts) -- same
// audience as that email (application_status 'not_applied' OR 'draft', see
// app/api/cron/setla-signup-nudge's own comment on why both matter) and the
// same "sent once, not a nag" semantics via signup_nudge_sent_at. No
// separate copy needed for the two statuses: a 'draft' customer has
// SOMETHING saved but still hasn't submitted, so "finish your application"
// reads correctly either way.
export function signupNudgeSmsContent(firstName: string): string {
  return `Hi ${firstName}, you're almost there! Finish your SETLA application to unlock spending limits of up to R${SETLA_NUDGE_MAX_LIMIT.toLocaleString("en-ZA")}. Buy Now, Pay Later on 4REGN & UNIK Labs: ${SETLA_APPLY_URL}`;
}

export async function sendSignupNudgeSms(opts: { to: string; firstName: string }) {
  await sendSms({ to: opts.to, message: signupNudgeSmsContent(opts.firstName) });
}

// SMS companion to sendApprovedSetlaLimitEmail -- same "standard vs
// starter" variant split (see that function's own comment for why), kept
// deliberately short since SMS is billed per-segment (~160 chars for
// plain GSM-7 text) rather than styled like the email at all. Copy
// matches what's actually already gone out to real approved customers
// (confirmed directly), not a separate draft.
// approvedLimit is accepted (not just firstName/variant) to keep this
// function's shape symmetric with sendApprovedSetlaLimitEmail's and
// because every caller already has it in hand for their own audit-log
// entry -- the real copy just doesn't mention the number, unlike the
// email, so it's unused in the string itself right now.
export function approvedLimitSmsContent(firstName: string, approvedLimit: number, variant: "standard" | "starter" = "standard"): string {
  const limitLabel = variant === "starter" ? "starter limit" : "spend limit";
  return `Hi ${firstName}, you've been approved! \u{1F389} Your SETLA ${limitLabel} is ready. BUY NOW, PAY LATER! Shop on 4REGN or UNIK Labs: ${SETLA_DASHBOARD_URL}`;
}

export async function sendApprovedSetlaLimitSms(opts: { to: string; firstName: string; approvedLimit: number; variant?: "standard" | "starter" }) {
  await sendSms({ to: opts.to, message: approvedLimitSmsContent(opts.firstName, opts.approvedLimit, opts.variant) });
}

// Ongoing "you still haven't used it" nudge for an already-approved
// customer, distinct from the one-time approvedLimitSmsContent above --
// see limitReminderEmailContent in lib/setla-email.ts for the email
// counterpart. Unlike the approval SMS, this one names the actual amount:
// the whole point is reminding someone of money they're specifically not
// using, so the number is what makes it worth reading.
export function limitReminderSmsContent(firstName: string, availableLimit: number): string {
  return `Hi ${firstName}, you still have R${Math.round(availableLimit).toLocaleString("en-ZA")} SETLA spend limit ready to use! Buy Now, Pay Later on 4REGN: ${SETLA_DASHBOARD_URL}`;
}

export async function sendLimitReminderSms(opts: { to: string; firstName: string; availableLimit: number }) {
  await sendSms({ to: opts.to, message: limitReminderSmsContent(opts.firstName, opts.availableLimit) });
}

// SMS companion to limitAdjustedEmailContent (lib/setla-email.ts) -- same
// "explicit send only" rule applies: this fires only when an admin clicks
// "Send limit update SMS" in the SETLA admin panel, never automatically off
// an adjust-limit save. Same increased/not split as the email: a real
// increase gets the exclamation-and-emoji treatment (matches
// approvedLimitSmsContent's tone above), a decrease/correction stays plain.
export function limitAdjustedSmsContent(firstName: string, newLimit: number, increased: boolean): string {
  const amount = `R${Math.round(newLimit).toLocaleString("en-ZA")}`;
  if (increased) {
    return `Hi ${firstName}, great news! \u{1F389} Your SETLA limit just went up to ${amount}. Shop now, pay later at 4REGN & UNIK Labs: ${SETLA_DASHBOARD_URL}`;
  }
  return `Hi ${firstName}, your SETLA spending limit has been updated to ${amount}. View details: ${SETLA_DASHBOARD_URL}`;
}

export async function sendLimitAdjustedSms(opts: { to: string; firstName: string; newLimit: number; increased: boolean }) {
  await sendSms({ to: opts.to, message: limitAdjustedSmsContent(opts.firstName, opts.newLimit, opts.increased) });
}

// SMS companion to the admin "Send reminder" button on an instalment
// (app/api/setla/admin/instalments/[id]/remind) -- that route previously
// only ever sent the branded email version. dueLabel is expected to come
// from formatInstalmentDueDate (lib/setla-instalments.ts), which already
// renders "Today" for a same-day due date instead of the raw date, so an
// SMS sent the day something's due reads as urgent rather than generic.
// Links straight to the Payment Plans view (#plans, same as the email's
// ctaUrl) so tapping it lands directly on the Pay Now button.
//
// overdue/delivered noticeably change the tone: an overdue instalment on
// an order that's already been delivered is the strongest, most factual
// case there is (the customer already has the goods), so that combination
// gets stated plainly rather than softened into the same generic wording
// as a payment that's merely coming up.
//
// overdueCount/overdueTotal cover a second miss: once 2+ instalments on
// the same plan are overdue at once, they're one balance, not two separate
// ones -- the copy says so explicitly and states the combined total, since
// paying just the instalment this reminder was sent for would still leave
// the customer overdue on the other one(s).
export function instalmentReminderSmsContent(firstName: string, amount: number, dueLabel: string, reference: string, overdue = false, delivered = false, overdueCount = 1, overdueTotal = amount): string {
  const link = `${SETLA_DASHBOARD_URL}#plans`;
  if (overdue && overdueCount >= 2) {
    const context = delivered ? `Your order ${reference} has been delivered and` : `For your SETLA plan on ${reference},`;
    return `Hi ${firstName}, ${context} ${overdueCount} payments totaling R${Number(overdueTotal).toFixed(2)} are OVERDUE. These must be paid together to settle your account. Pay now: ${link}`;
  }
  if (overdue) {
    const context = delivered ? `Your order ${reference} has been delivered and this payment` : `Your SETLA payment for ${reference}`;
    return `Hi ${firstName}, ${context} of R${Number(amount).toFixed(2)} is OVERDUE (was due ${dueLabel}). Please pay now to settle your account: ${link}`;
  }
  const when = dueLabel === "Today" ? "TODAY" : `on ${dueLabel}`;
  return `Hi ${firstName}, your SETLA payment of R${Number(amount).toFixed(2)} for ${reference} is due ${when}. Pay now: ${link}`;
}

export async function sendInstalmentReminderSms(opts: { to: string; firstName: string; amount: number; dueLabel: string; reference: string; overdue?: boolean; delivered?: boolean; overdueCount?: number; overdueTotal?: number }) {
  await sendSms({ to: opts.to, message: instalmentReminderSmsContent(opts.firstName, opts.amount, opts.dueLabel, opts.reference, opts.overdue, opts.delivered, opts.overdueCount, opts.overdueTotal) });
}
