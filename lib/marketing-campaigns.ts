export const SETLA_PAY_LATER_CAMPAIGN = {
  key: "4regn-setla-pay-later-2026",
  name: "4REGN × SETLA — Your Fit, Your Pace",
  subject: "Your 4REGN fit. Your pace. Pay with SETLA.",
  previewText: "Sign up for SETLA, see what you qualify for, then shop 4REGN your way at checkout.",
  previewUrl: "/email/4regn-setla-pay-later-2026.html",
};

export const R229_FLASH_SALE_CAMPAIGN = {
  key: "4regn-r229-flash-sale-2026-09",
  name: "4REGN R229 Weekend Flash Sale",
  subject: "🛍️ FLASH SALE!! 🛍️ ⏰ R229 PREMIUM OVERSIZED TEES! ENDS AT MIDNIGHT",
  previewText: "Oversized Premium Tees from R350 to R229. Buy 2 for R449. Ends Saturday at 23:59.",
  previewUrl: "/email/4regn-r229-flash-sale-2026-09.html",
};

export const R229_REMINDER_CAMPAIGN = {
  ...R229_FLASH_SALE_CAMPAIGN,
  key: "4regn-r229-flash-sale-reminder-2026-09-12",
  name: "4REGN R229 Flash Sale — 3 Hours Left Reminder",
  subject: "3 HOURS LEFT!! ⏰ 🛍️ FLASH SALE!! ⏰ 🛍️",
};

export const BIG_SPRING_SALE_CAMPAIGN = {
  key: "4regn-big-spring-sale-2026-09",
  name: "4REGN BIG SPRING SALE",
  subject: "🛍️ BIG SPRING SALE!! Tees from R229 · Hoodies from R299 — Buy 2 & Save",
  previewText: "Oversized Premium Tees, Printed Hoodies & Graphic Hoodies all discounted. Buy 2 and save even more. Plus a free trucker cap on orders above R499. Ends 2 October.",
  previewUrl: "/email/4regn-big-spring-sale-2026-09.html",
};

// Reminder variant, same shape as R229_REMINDER_CAMPAIGN above -- spread the
// base campaign with a new key/name/subject, shares the same HTML (see
// marketingCampaignHtml in lib/resend-marketing.ts).
export const BIG_SPRING_SALE_REMINDER_CAMPAIGN = {
  ...BIG_SPRING_SALE_CAMPAIGN,
  key: "4regn-big-spring-sale-reminder-2026-10-02",
  name: "4REGN BIG SPRING SALE — Last Day Reminder",
  subject: "LAST DAY!! ⏰ 🛍️ BIG SPRING SALE ENDS TONIGHT ⏰ 🛍️",
};

export const MARKETING_CAMPAIGNS = [
  BIG_SPRING_SALE_REMINDER_CAMPAIGN, BIG_SPRING_SALE_CAMPAIGN,
  R229_REMINDER_CAMPAIGN, R229_FLASH_SALE_CAMPAIGN, SETLA_PAY_LATER_CAMPAIGN,
];

export function getMarketingCampaign(key: string) {
  return MARKETING_CAMPAIGNS.find((campaign) => campaign.key === key);
}
