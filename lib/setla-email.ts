import { sendEmail } from "./email";

// SETLA sends from its own address on its own separate Resend account
// (setla@uniklabs.co.za is verified there, not on the shared account that
// orders@catalogstore.co.za uses for every other seller's order emails) --
// so every SETLA email needs both this "from" and SETLA_RESEND_API_KEY,
// never the platform-wide defaults. Exported so the handful of SETLA
// routes that still build their own plain-text email (rather than going
// through sendSetlaEmail below) stay in sync with this one, instead of
// each hardcoding the same string separately.
export const SETLA_EMAIL_FROM = "SETLA Payments <setla@uniklabs.co.za>";
export const SETLA_RESEND_API_KEY = process.env.SETLA_RESEND_API_KEY;

// Links inside a SETLA email must resolve on the same domain it's sent
// from, same reasoning as APP_ORIGIN above -- uniklabs.co.za now that the
// sender is setla@uniklabs.co.za, not catalogstore.co.za. Every /setla/*
// page is a static file, byte-identical no matter which domain serves it
// (see middleware.ts), so pointing here instead of APP_ORIGIN changes
// nothing about what actually loads.
export const SETLA_APP_ORIGIN = "https://uniklabs.co.za";

// Logos as CID attachments instead of remotely-hosted <img src="https://...">
// -- most mail clients block remote images by default for a sender with no
// track record yet (Apple Mail showed just the alt text in a placeholder
// box until "Load External Images" was tapped), so the logo never actually
// rendered on open. An embedded attachment referenced as cid:xxx displays
// immediately, nothing to fetch. Fetched from the live site rather than
// read off disk (simpler than reasoning about which files a Vercel
// function bundle includes) and cached in-module so a warm serverless
// instance only fetches once, not on every send.
let logoAttachmentsCache: Array<{ filename: string; content: string; content_id: string }> | null = null;
async function logoAttachments() {
  if (logoAttachmentsCache) return logoAttachmentsCache;
  const [setlaLogo, unikLogo] = await Promise.all([
    fetch(`${SETLA_APP_ORIGIN}/setla/assets/setla-payments-logo.png`).then((r) => r.arrayBuffer()),
    fetch(`${SETLA_APP_ORIGIN}/setla/assets/unik-labs-logo.png`).then((r) => r.arrayBuffer()),
  ]);
  logoAttachmentsCache = [
    { filename: "setla-payments-logo.png", content: Buffer.from(setlaLogo).toString("base64"), content_id: "setla-logo" },
    { filename: "unik-labs-logo.png", content: Buffer.from(unikLogo).toString("base64"), content_id: "unik-logo" },
  ];
  return logoAttachmentsCache;
}

// Shared branded shell for every SETLA transactional/marketing email --
// logo header, dark/green card matching the product itself, one CTA
// button, footer.
export async function sendSetlaEmail(opts: {
  to: string;
  firstName: string;
  subject: string;
  kicker: string;
  headline: string;
  bodyHtml: string;
  extraHtml?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}) {
  const ctaLabel = opts.ctaLabel || "View my dashboard";
  const ctaUrl = opts.ctaUrl || `${SETLA_APP_ORIGIN}/setla/dashboard.html`;

  // A bare <table> fragment (no <head>) gives clients nothing to signal
  // "this email already has its own dark design, don't auto dark-mode
  // it" -- Apple Mail/Gmail's automatic color inversion was flipping the
  // card background toward white while the white/transparent logo PNGs
  // (correct on the real dark background) stayed white, making them
  // disappear into it. The color-scheme meta tags below opt out of that
  // inversion; bgcolor attributes are belt-and-suspenders for clients
  // (Outlook desktop especially) that only partially honor CSS background.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${opts.subject}</title>
</head>
<body style="margin:0;padding:32px 16px;background:#000000" bgcolor="#000000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#000000" bgcolor="#000000">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;background:#000000;border:1px solid #2a2f2a;border-radius:20px;overflow:hidden;font-family:'DM Sans',Arial,sans-serif;color:#ffffff" bgcolor="#000000">
<tr><td style="padding:32px 36px 26px;text-align:center;border-bottom:1px solid #1c1f1c" bgcolor="#000000">
<img src="cid:setla-logo" alt="SETLA Payments" height="32" style="display:inline-block;vertical-align:middle;border:0">
<span style="display:inline-block;width:1px;height:20px;background:#2a2f2a;margin:0 14px;vertical-align:middle;font-size:0;line-height:0">&nbsp;</span>
<img src="cid:unik-logo" alt="Powered by UNIK Labs" height="24" style="display:inline-block;vertical-align:middle;border:0">
</td></tr>
<tr><td style="padding:38px 36px 6px" bgcolor="#000000">
<div style="color:#4ade80;font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px">${opts.kicker}</div>
<h1 style="font:600 25px/1.28 'Manrope',Arial,sans-serif;letter-spacing:-.02em;margin:0 0 18px;color:#ffffff">${opts.headline}</h1>
<p style="font-size:14.5px;line-height:1.75;color:#ffffff;margin:0 0 8px 0">Hi ${opts.firstName},</p>
<p style="font-size:14.5px;line-height:1.75;color:#ffffff;margin:0 0 24px 0">${opts.bodyHtml}</p>
${opts.extraHtml || ""}
<a href="${ctaUrl}" style="display:inline-block;background:#007517;color:#ffffff;text-decoration:none;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:15px 28px;border-radius:999px;margin-top:4px">${ctaLabel}</a>
</td></tr>
<tr><td style="padding:26px 36px 32px;border-top:1px solid #1c1f1c" bgcolor="#000000">
<p style="font-size:11px;color:#ffffff;line-height:1.7;margin:0">SETLA Payments is powered by UNIK Labs. Questions? Reply to this email or reach us at <a href="mailto:setla@uniklabs.co.za" style="color:#4ade80;text-decoration:none">setla@uniklabs.co.za</a>.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

  let attachments: Array<{ filename: string; content: string; content_id: string }> = [];
  try {
    attachments = await logoAttachments();
  } catch (err) {
    console.error("sendSetlaEmail: could not fetch logo attachments, sending without them", err);
  }

  await sendEmail({ to: opts.to, from: SETLA_EMAIL_FROM, subject: opts.subject, html, apiKey: SETLA_RESEND_API_KEY, attachments });
}

// The ceiling advertised in the signup-nudge email -- an aspirational
// "up to" figure, not a promise. One constant to change if the real
// policy ceiling differs.
export const SETLA_NUDGE_MAX_LIMIT = 5000;

// Shared content for the "you signed up but haven't applied" nudge -- used
// by both the daily cron (app/api/cron/setla-signup-nudge) and the manual
// send-email tool in Brand Manager, so the two can never drift apart.
export function signupNudgeEmailContent(firstName: string) {
  return {
    firstName,
    subject: "Application Almost Done!",
    kicker: "Your spending power. Buy now. Pay later.",
    headline: "Complete your application and find out how much you qualify for.",
    bodyHtml: `You signed up for SETLA, but your application isn't done yet &mdash; it only takes a few minutes. Approved customers can unlock spending limits of up to <strong style="color:#ffffff">R${SETLA_NUDGE_MAX_LIMIT.toLocaleString("en-ZA")}</strong>, based on their application.`,
    extraHtml: `<p style="font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0">Your starting limit reflects your application today &mdash; it isn't fixed. Repay on time and your limit grows from there.</p>`,
    ctaLabel: "Complete my application",
    ctaUrl: `${SETLA_APP_ORIGIN}/setla/apply.html`,
  };
}

const money = (value: number) => `R${Number(value || 0).toFixed(2)}`;

// One content-builder per email type, shared between wherever it fires
// automatically (apply/finish, the decision route, adjust-limit) and the
// manual send-email tool in Brand Manager -- same reasoning as
// signupNudgeEmailContent above: one copy, not two that can drift.
export function applicationReceivedEmailContent(firstName: string) {
  return {
    firstName,
    subject: "We've received your SETLA application",
    kicker: "Application received",
    headline: "We're reviewing your application.",
    bodyHtml: "Thanks for applying to SETLA Payments. We're reviewing your identity, affordability and banking details now and will email you as soon as a decision is ready.",
  };
}

export function underReviewEmailContent(firstName: string) {
  return {
    firstName,
    subject: "Your SETLA application is being reviewed",
    kicker: "Status update",
    headline: "Your application is being reviewed.",
    bodyHtml: "Your application is currently being reviewed. You'll hear back from us with a decision within 2-5 working days &mdash; no need to do anything further in the meantime.",
  };
}

export function approvedEmailContent(firstName: string, approvedLimit: number) {
  return {
    firstName,
    subject: "Application approved",
    kicker: "You're approved",
    headline: "Your SETLA spending limit is ready.",
    bodyHtml: `You're approved for a SETLA spending limit of <strong style="color:#ffffff">${money(approvedLimit)}</strong>.`,
    extraHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 26px 0;background:#000000;border:1px solid #007517;border-radius:16px"><tr><td style="padding:20px 22px"><div style="color:#4ade80;font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">Your spending limit</div><div style="font:500 38px/1 'Manrope',Arial,sans-serif;letter-spacing:-.03em;color:#ffffff">${money(approvedLimit)}</div></td></tr></table>`,
  };
}

export function declinedEmailContent(firstName: string, reason: string | null) {
  return {
    firstName,
    subject: "Application declined",
    kicker: "Application update",
    headline: "Your application wasn't approved this time.",
    bodyHtml: reason || "Your application wasn't approved this time. You're welcome to appeal or re-apply after 30 days.",
    extraHtml: `<p style="font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0">You can submit an appeal from your <a href="${SETLA_APP_ORIGIN}/setla/dashboard.html" style="color:#4ade80">SETLA dashboard</a> if you believe this decision should be reconsidered.</p>`,
    ctaLabel: "Go to my dashboard",
  };
}

export function manualReviewEmailContent(firstName: string) {
  return {
    firstName,
    subject: "Application under further review",
    kicker: "Status update",
    headline: "Your application needs a closer look.",
    bodyHtml: "Your application needs a closer look &mdash; we'll be in touch shortly.",
  };
}

export function limitAdjustedEmailContent(firstName: string, newLimit: number, increased: boolean, reason: string | null) {
  return {
    firstName,
    subject: increased ? "Your SETLA limit has increased" : "Your SETLA limit has changed",
    kicker: increased ? "Good news" : "Account update",
    headline: increased ? "Your SETLA limit has increased." : "Your SETLA limit has changed.",
    bodyHtml: increased
      ? `Good news &mdash; based on your account, your SETLA spending limit is now <strong style="color:#ffffff">${money(newLimit)}</strong>.`
      : `Your SETLA spending limit has been updated to <strong style="color:#ffffff">${money(newLimit)}</strong>.`,
    extraHtml: reason ? `<p style="font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0">${reason}</p>` : undefined,
  };
}

// A placeholder used only by the no-customer test-send path (see
// app/api/setla/admin/send-test-email) -- "approved" needs a limit amount
// to render its highlighted card, and there's no real customer record to
// pull one from when testing in the abstract.
export const SETLA_SAMPLE_LIMIT = 2000;

export type SetlaEmailContent = Omit<Parameters<typeof sendSetlaEmail>[0], "to">;

// One entry per manually-sendable email type, shared by both the
// per-customer send-email route (real customer, real eligibility check)
// and the standalone test-send route (typed name/email, no customer
// record, no eligibility check) -- so neither one can define its own
// slightly-different copy of this list.
export const SETLA_EMAIL_TYPES: Record<string, { eligibleStatus: string; content: (firstName: string, approvedLimit?: number) => SetlaEmailContent }> = {
  signup_nudge: { eligibleStatus: "not_applied", content: (firstName) => signupNudgeEmailContent(firstName) },
  received: { eligibleStatus: "pending", content: (firstName) => applicationReceivedEmailContent(firstName) },
  under_review: { eligibleStatus: "pending", content: (firstName) => underReviewEmailContent(firstName) },
  approved: { eligibleStatus: "approved", content: (firstName, approvedLimit) => approvedEmailContent(firstName, approvedLimit ?? SETLA_SAMPLE_LIMIT) },
  declined: { eligibleStatus: "declined", content: (firstName) => declinedEmailContent(firstName, null) },
};
