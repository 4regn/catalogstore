import { readFile } from "node:fs/promises";
import path from "node:path";
import { getFourRegnResendFrom } from "./email";

export const FLASH_WEEKEND_CAMPAIGN = {
  key: "4regn-flash-weekend-trucker-cap-2026",
  name: "4REGN Flash Weekend — Free Trucker Cap",
  subject: "FLASH WEEKEND: Get a FREE Trucker Cap 🎁",
  previewText: "Spend R499+ this weekend and choose one FREE trucker cap. Ends 31 August at 23:59 SAST.",
  previewUrl: "/email/4regn-flash-weekend-2026.html",
};

export async function flashWeekendCampaignHtml() {
  return readFile(path.join(process.cwd(), "public", "email", "4regn-flash-weekend-2026.html"), "utf8");
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

export function fourRegnMarketingFrom() {
  return getFourRegnResendFrom();
}
