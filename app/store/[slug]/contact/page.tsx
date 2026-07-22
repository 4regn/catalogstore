import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";
import { getAdmin } from "../../../../lib/supabase-admin";

export const metadata: Metadata = { title: "Contact Us — UNIK Labs" };

function socialUrl(raw: string | undefined, base: string): string {
  if (!raw) return "";
  const trimmed = raw.trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${base}${trimmed.replace(/^@/, "").replace(/^\/+/, "")}`;
}

const ICONS: Record<string, React.ReactNode> = {
  whatsapp: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" /></svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" /></svg>
  ),
  tiktok: (
    <svg viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M448 209.9a210.1 210.1 0 01-122.8-39.3v178.8A162.6 162.6 0 11185 188.3v89.9a74.6 74.6 0 1052.2 71.2V0h88a121 121 0 00122.8 121z" /></svg>
  ),
  facebook: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" /></svg>
  ),
  twitter: (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" /></svg>
  ),
};

const LABELS: Record<string, string> = { whatsapp: "WhatsApp", instagram: "Instagram", tiktok: "TikTok", facebook: "Facebook", twitter: "X (Twitter)" };

export default async function ContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();

  // A failure here (misconfigured environment, transient Supabase issue)
  // should degrade to the "channels are being set up" empty state below,
  // not take down the whole page -- this is purely informational content.
  let seller: { whatsapp_number: string | null; social_links: unknown } | null = null;
  try {
    const res = await getAdmin().from("sellers").select("whatsapp_number, social_links").eq("subdomain", "unik").maybeSingle();
    seller = res.data;
  } catch {}

  const social = (seller?.social_links || {}) as { instagram?: string; tiktok?: string; facebook?: string; twitter?: string };
  const links: Array<{ key: string; href: string }> = [];
  if (seller?.whatsapp_number) links.push({ key: "whatsapp", href: `https://wa.me/${String(seller.whatsapp_number).replace(/\D/g, "")}` });
  if (social.instagram) links.push({ key: "instagram", href: socialUrl(social.instagram, "instagram.com/") });
  if (social.tiktok) links.push({ key: "tiktok", href: socialUrl(social.tiktok, "tiktok.com/@") });
  if (social.facebook) links.push({ key: "facebook", href: socialUrl(social.facebook, "facebook.com/") });
  if (social.twitter) links.push({ key: "twitter", href: socialUrl(social.twitter, "x.com/") });

  return (
    <UnikInfoLayout kicker="Support" title="Contact us" basePath={basePath}>
      <p>The fastest way to reach us right now is through our social channels below.</p>
      {links.length > 0 ? (
        <div className="ui-social">
          {links.map((l) => (
            <a href={l.href} target="_blank" rel="noreferrer" key={l.key}>
              {ICONS[l.key]}
              {LABELS[l.key]}
            </a>
          ))}
        </div>
      ) : (
        <div className="ui-notice">Our contact channels are being set up. Please check back here soon.</div>
      )}
      <p>
        If your question is about an order you&rsquo;ve already placed, the fastest answer is in
        your account &mdash; every order shows its own status and tracking history there.
      </p>
    </UnikInfoLayout>
  );
}
