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

export const MARKETING_CAMPAIGNS = [R229_FLASH_SALE_CAMPAIGN, SETLA_PAY_LATER_CAMPAIGN];

export function getMarketingCampaign(key: string) {
  return MARKETING_CAMPAIGNS.find((campaign) => campaign.key === key);
}
