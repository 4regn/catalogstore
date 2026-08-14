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
// track record yet, so a remote logo may never actually load on open. An
// embedded attachment referenced as cid:xxx displays immediately, nothing
// to fetch. Fetched from the live site rather than read off disk (simpler
// than reasoning about which files a Vercel function bundle includes) and
// cached in-module so a warm serverless instance only fetches once, not on
// every send.
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
  // it" -- Apple Mail's automatic color inversion, and then Gmail's
  // mobile app on top of that, kept flipping the card background toward
  // white while the white/transparent logo PNGs (correct on the real
  // dark background) stayed white, disappearing into it. Root cause
  // turned out to be `content="dark light"` -- declaring support for
  // BOTH schemes, which was untrue (there's only one hardcoded dark
  // palette here, no light variant), and some clients read that
  // ambiguity as license to generate their own light version rather than
  // trust the author's colors. Declaring "dark" only is the honest
  // signal: this content has no light mode, don't try to make one.
  // Backed up with a <style> block using !important on named classes --
  // some clients weight a stylesheet block differently than inline
  // style="" when deciding whether to override colors, so this is a
  // second, independently-styled layer saying the same thing as the
  // inline styles and bgcolor attributes throughout, not a replacement
  // for them. With the background actually staying black, the real logo
  // images are back (they're the point of a "branded" email) instead of
  // the plain-text fallback tried in between.
  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark">
<meta name="supported-color-schemes" content="dark">
<title>${opts.subject}</title>
<style>
  .setla-bg,.setla-bg td{background-color:#000000!important}
  .setla-fg{color:#ffffff!important}
  .setla-green{color:#4ade80!important}
</style>
</head>
<body style="margin:0;padding:32px 16px;background:#000000" bgcolor="#000000">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="setla-bg" style="background:#000000" bgcolor="#000000">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="setla-bg" style="max-width:520px;background:#000000;border:1px solid #2a2f2a;border-radius:20px;overflow:hidden;font-family:'DM Sans',Arial,sans-serif;color:#ffffff" bgcolor="#000000">
<tr><td class="setla-bg" style="padding:28px 36px 24px;text-align:center;border-bottom:1px solid #1c1f1c" bgcolor="#000000">
<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:0 auto"><tr>
<td style="padding-right:14px"><img src="cid:setla-logo" alt="SETLA Payments" height="30" style="display:block;border:0"></td>
<td width="1" style="width:1px;background-color:#2a2f2a;font-size:0;line-height:1px" bgcolor="#2a2f2a">&nbsp;</td>
<td style="padding-left:14px"><img src="cid:unik-logo" alt="Powered by UNIK Labs" height="22" style="display:block;border:0"></td>
</tr></table>
</td></tr>
<tr><td class="setla-bg" style="padding:38px 36px 6px" bgcolor="#000000">
<div class="setla-green" style="color:#4ade80;font-size:10.5px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;margin-bottom:14px">${opts.kicker}</div>
<h1 class="setla-fg" style="font:600 25px/1.28 'Manrope',Arial,sans-serif;letter-spacing:-.02em;margin:0 0 18px;color:#ffffff">${opts.headline}</h1>
<p class="setla-fg" style="font-size:14.5px;line-height:1.75;color:#ffffff;margin:0 0 8px 0">Hi ${opts.firstName},</p>
<p class="setla-fg" style="font-size:14.5px;line-height:1.75;color:#ffffff;margin:0 0 24px 0">${opts.bodyHtml}</p>
${opts.extraHtml || ""}
<a href="${ctaUrl}" style="display:inline-block;background:#007517;color:#ffffff;text-decoration:none;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:15px 28px;border-radius:999px;margin-top:4px">${ctaLabel}</a>
</td></tr>
<tr><td class="setla-bg" style="padding:26px 36px 32px;border-top:1px solid #1c1f1c" bgcolor="#000000">
<p class="setla-fg" style="font-size:11px;color:#ffffff;line-height:1.7;margin:0">SETLA Payments is powered by UNIK Labs. Questions? Reply to this email or reach us at <a href="mailto:setla@uniklabs.co.za" style="color:#4ade80;text-decoration:none">setla@uniklabs.co.za</a>.</p>
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
    bodyHtml: `You signed up for SETLA, but your application isn't done yet &mdash; it only takes a few minutes. Approved customers can unlock spending limits of up to <strong class="setla-fg" style="color:#ffffff">R${SETLA_NUDGE_MAX_LIMIT.toLocaleString("en-ZA")}</strong>, based on their application.`,
    extraHtml: `<p class="setla-fg" style="font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0">Your starting limit reflects your application today &mdash; it isn't fixed. Repay on time and your limit grows from there.</p>`,
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

// Kept for callers that only need the raw copy (subject line, etc) --
// actual sending for "approved" goes through sendApprovedSetlaLimitEmail
// below instead of the generic sendSetlaEmail shell, since the seller
// supplied a completely different bespoke design for this one email
// specifically (light theme, hero + dark limit card + brand tiles) that
// doesn't fit the shared dark shell every other SETLA email uses.
export function approvedEmailContent(firstName: string, approvedLimit: number) {
  return {
    firstName,
    subject: "Application approved",
    kicker: "You're approved",
    headline: "Your SETLA spending limit is ready.",
    bodyHtml: `You're approved for a SETLA spending limit of <strong class="setla-fg" style="color:#ffffff">${money(approvedLimit)}</strong>.`,
    extraHtml: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="setla-bg" style="margin:0 0 26px 0;background:#000000;border:1px solid #007517;border-radius:16px"><tr><td class="setla-bg" style="padding:20px 22px" bgcolor="#000000"><div class="setla-green" style="color:#4ade80;font-size:9.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;margin-bottom:8px">Your spending limit</div><div class="setla-fg" style="font:500 38px/1 'Manrope',Arial,sans-serif;letter-spacing:-.03em;color:#ffffff">${money(approvedLimit)}</div></td></tr></table>`,
  };
}

// Separate logo set from logoAttachments() above -- this email also shows
// the 4REGN mark on its own "where you can use SETLA" tile, which no
// other SETLA email needs. Cached the same way (module-level, warm
// instance reuses it) and with distinct content_ids so a send of this
// email can never accidentally pick up a stale cid from the generic
// shell's cache or vice versa.
let approvedLogoAttachmentsCache: Array<{ filename: string; content: string; content_id: string }> | null = null;
async function approvedLogoAttachments() {
  if (approvedLogoAttachmentsCache) return approvedLogoAttachmentsCache;
  const [setlaLogo, fourRegnLogo, unikLogo] = await Promise.all([
    fetch(`${SETLA_APP_ORIGIN}/setla/assets/setla-payments-logo.png`).then((r) => r.arrayBuffer()),
    fetch(`${SETLA_APP_ORIGIN}/setla/assets/footer-4regn-logo.png`).then((r) => r.arrayBuffer()),
    fetch(`${SETLA_APP_ORIGIN}/setla/assets/unik-labs-logo.png`).then((r) => r.arrayBuffer()),
  ]);
  approvedLogoAttachmentsCache = [
    { filename: "setla-payments-logo.png", content: Buffer.from(setlaLogo).toString("base64"), content_id: "approved-setla-logo" },
    { filename: "4regn-logo.png", content: Buffer.from(fourRegnLogo).toString("base64"), content_id: "approved-4regn-logo" },
    { filename: "unik-labs-logo.png", content: Buffer.from(unikLogo).toString("base64"), content_id: "approved-unik-logo" },
  ];
  return approvedLogoAttachmentsCache;
}

// Bespoke design supplied directly by the seller (SETLA_approved_limit_email.html)
// -- light theme, green hero, dark limit card, 4REGN/UNIK brand tiles.
// Deliberately NOT routed through sendSetlaEmail's shared dark shell
// (that shell's whole point -- forcing color-scheme:dark so mail clients
// don't invert a design with no light variant -- would be actively wrong
// here, since this design IS the light variant). Every other SETLA email
// keeps using the shared shell unchanged.
export async function sendApprovedSetlaLimitEmail(opts: { to: string; firstName: string; approvedLimit: number }) {
  const amount = Math.round(Number(opts.approvedLimit) || 0);
  const amountFormatted = `R${amount.toLocaleString("en-ZA")}`;
  const dashboardUrl = `${SETLA_APP_ORIGIN}/setla/dashboard.html`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>Application approved</title>
</head>
<body style="margin:0;background:#eef1ed;font-family:Arial,Helvetica,sans-serif;color:#141714;-webkit-font-smoothing:antialiased">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef1ed"><tr><td align="center" style="padding:34px 14px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:680px;background:#ffffff;border-radius:28px;overflow:hidden">

<tr><td style="padding:22px 26px;border-bottom:1px solid #e7ebe7;text-align:center;background:#ffffff">
  <img src="cid:approved-setla-logo" alt="SETLA Payments" height="32" style="display:inline-block;border:0">
</td></tr>

<tr><td style="background:linear-gradient(145deg,#0c5f2f 0%,#119644 54%,#19b954 100%);color:#ffffff;padding:54px 34px 48px;text-align:center">
  <span style="display:inline-block;border:1px solid rgba(255,255,255,.35);background:rgba(255,255,255,.13);border-radius:999px;padding:9px 14px;font-size:12px;font-weight:800;letter-spacing:2.1px;margin-bottom:22px;color:#ffffff">&#10003; APPLICATION APPROVED</span>
  <h1 style="margin:0 0 8px;font-size:38px;line-height:1.05;letter-spacing:-1.5px;color:#ffffff;font-weight:800">You got the green light &#127881;</h1>
  <p style="margin:0 auto;max-width:460px;color:rgba(255,255,255,.88);font-size:16px;line-height:1.55">Your SETLA spending limit is live and ready to use.</p>
</td></tr>

<tr><td style="padding:0 28px;background:#ffffff">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:570px;margin:-26px auto 0;background:#111613;border-radius:24px"><tr><td style="padding:26px 28px 24px">
  <div style="font-size:11px;letter-spacing:2px;color:#8ce7ac;font-weight:800">YOUR SETLA SPENDING LIMIT</div>
  <div style="font-size:52px;line-height:1;font-weight:800;letter-spacing:-2px;margin:10px 0 18px;color:#ffffff">${amountFormatted}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
    <td style="font-size:13px;color:#b9c6bd"><span style="display:inline-block;width:9px;height:9px;border-radius:50%;background:#25cc5f;margin-right:7px"></span>Available to spend</td>
    <td align="right" style="font-size:13px;color:#b9c6bd">SETLA</td>
  </tr></table>
</td></tr></table>
</td></tr>

<tr><td style="padding:38px 34px 16px;background:#ffffff">
  <h2 style="font-size:24px;line-height:1.2;margin:0 0 14px;letter-spacing:-.5px;color:#141714;font-weight:800">Hi ${opts.firstName}, your limit is ready.</h2>
  <p style="font-size:15.5px;line-height:1.62;color:#505850;margin:0 0 20px">Your application has been approved and you now have <strong style="color:#111613;font-weight:800">${money(opts.approvedLimit)}</strong> available through SETLA.</p>
  <p style="font-size:15.5px;line-height:1.62;color:#505850;margin:0 0 20px">Use your SETLA limit when shopping at <strong style="color:#111613;font-weight:800">4REGN</strong> or <strong style="color:#111613;font-weight:800">UNIK Labs</strong>. Pick what you want, choose SETLA at checkout, and your available limit will be shown before you confirm.</p>

  <div style="margin-top:26px;font-size:12.5px;letter-spacing:1.6px;font-weight:800;color:#16773a;text-transform:uppercase">Where you can use SETLA</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:14px"><tr>
    <td width="50%" style="padding-right:6px;vertical-align:top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8e4;border-radius:18px;background:#fafbfa"><tr><td style="padding:20px">
        <img src="cid:approved-4regn-logo" alt="4REGN" height="30" style="display:block;border:0;margin-bottom:14px">
        <div style="color:#737b75;font-size:12px;line-height:1.4">Shop 4REGN with your SETLA spending limit.</div>
      </td></tr></table>
    </td>
    <td width="50%" style="padding-left:6px;vertical-align:top">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e3e8e4;border-radius:18px;background:#fafbfa"><tr><td style="padding:20px">
        <img src="cid:approved-unik-logo" alt="UNIK Labs" height="30" style="display:block;border:0;margin-bottom:14px">
        <div style="color:#737b75;font-size:12px;line-height:1.4">Shop UNIK Labs with your SETLA spending limit.</div>
      </td></tr></table>
    </td>
  </tr></table>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:26px 0 0"><tr><td>
    <a href="${dashboardUrl}" style="display:block;background:#19ad50;color:#ffffff;text-decoration:none;text-align:center;padding:17px 22px;border-radius:999px;font-size:13.5px;letter-spacing:1.1px;font-weight:800">USE MY ${amountFormatted} LIMIT</a>
  </td></tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="text-align:center;padding:12px 0 6px">
    <a href="${dashboardUrl}" style="color:#176f37;font-weight:700;font-size:13px;text-decoration:none">VIEW MY SETLA DASHBOARD &rarr;</a>
  </td></tr></table>
</td></tr>

<tr><td style="padding:0 34px 28px;background:#ffffff">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f2faf4;border:1px solid #d9f0df;border-radius:15px"><tr><td style="padding:17px 18px">
    <strong style="color:#1c632f;font-size:13px">Your SETLA limit stays in one place.</strong><br>
    <span style="font-size:13px;line-height:1.55;color:#4f5f54">You can view your available balance and payment information from your SETLA dashboard whenever you need it.</span>
  </td></tr></table>
</td></tr>

<tr><td style="border-top:1px solid #e7ebe7;padding:24px 34px 30px;text-align:center;color:#788079;font-size:12px;line-height:1.6;background:#fbfcfb">
  <strong style="color:#303630">SETLA Payments</strong><br>
  Available for purchases at <strong style="color:#303630">4REGN</strong> and <strong style="color:#303630">UNIK Labs</strong>.<br><br>
  Questions? Reply to this email or contact <a href="mailto:setla@uniklabs.co.za" style="color:#16803d;text-decoration:none">setla@uniklabs.co.za</a>.
</td></tr>

</table>
</td></tr></table>
</body>
</html>`;

  let attachments: Array<{ filename: string; content: string; content_id: string }> = [];
  try {
    attachments = await approvedLogoAttachments();
  } catch (err) {
    console.error("sendApprovedSetlaLimitEmail: could not fetch logo attachments, sending without them", err);
  }

  await sendEmail({ to: opts.to, from: SETLA_EMAIL_FROM, subject: "Application approved", html, apiKey: SETLA_RESEND_API_KEY, attachments });
}

export function declinedEmailContent(firstName: string, reason: string | null) {
  return {
    firstName,
    subject: "Application declined",
    kicker: "Application update",
    headline: "Your application wasn't approved this time.",
    bodyHtml: reason || "Your application wasn't approved this time. You're welcome to appeal or re-apply after 30 days.",
    extraHtml: `<p class="setla-fg" style="font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0">You can submit an appeal from your <a href="${SETLA_APP_ORIGIN}/setla/dashboard.html" class="setla-green" style="color:#4ade80">SETLA dashboard</a> if you believe this decision should be reconsidered.</p>`,
    ctaLabel: "Go to my dashboard",
  };
}

export function documentsRequestedEmailContent(firstName: string) {
  return {
    firstName,
    subject: "We need a bit more from you — SETLA application",
    kicker: "Action needed",
    headline: "We need 3 months of bank statements to continue.",
    bodyHtml: "Your application is still under review, but the bank statement you sent only covers one month &mdash; we need the most recent <strong class=\"setla-fg\" style=\"color:#ffffff\">3 months</strong> to properly assess affordability. One month isn't enough to tell a normal pattern from a one-off.",
    extraHtml: "<p class=\"setla-fg\" style=\"font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0\">Reply to this email with your latest 3-month bank statement (PDF is fine) and we'll pick your review back up as soon as it arrives.</p>",
    ctaLabel: "Message support",
    ctaUrl: `${SETLA_APP_ORIGIN}/setla/dashboard.html`,
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
      ? `Good news &mdash; based on your account, your SETLA spending limit is now <strong class="setla-fg" style="color:#ffffff">${money(newLimit)}</strong>.`
      : `Your SETLA spending limit has been updated to <strong class="setla-fg" style="color:#ffffff">${money(newLimit)}</strong>.`,
    extraHtml: reason ? `<p class="setla-fg" style="font-size:13px;line-height:1.7;color:#ffffff;margin:0 0 24px 0">${reason}</p>` : undefined,
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
  documents_requested: { eligibleStatus: "pending", content: (firstName) => documentsRequestedEmailContent(firstName) },
  approved: { eligibleStatus: "approved", content: (firstName, approvedLimit) => approvedEmailContent(firstName, approvedLimit ?? SETLA_SAMPLE_LIMIT) },
  declined: { eligibleStatus: "declined", content: (firstName) => declinedEmailContent(firstName, null) },
};
