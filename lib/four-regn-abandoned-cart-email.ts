import { readFile } from "node:fs/promises";
import path from "node:path";
import { sendEmail } from "./email";
import { buildUnsubscribeUrl } from "./marketing-unsubscribe";

const FOUR_REGN_ORIGIN = "https://4regn.com";

// Logos as CID attachments rather than remotely-hosted <img src> -- same
// reasoning and pattern as lib/setla-email.ts's own logoAttachments():
// most mail clients block remote images by default for a sender with no
// track record yet, so an embedded attachment displays immediately
// instead of possibly never loading. Fetched from the live site (not read
// off disk) so this doesn't have to reason about which files a Vercel
// function bundle includes, and cached in-module so a warm serverless
// instance only fetches once.
let logoAttachmentsCache: Array<{ filename: string; content: string; content_id: string }> | null = null;
async function abandonedCartLogoAttachments() {
  if (logoAttachmentsCache) return logoAttachmentsCache;
  const [fourRegnLogo, stitchLogo] = await Promise.all([
    fetch(`${FOUR_REGN_ORIGIN}/setla/assets/footer-4regn-logo.png`).then((r) => r.arrayBuffer()),
    fetch(`${FOUR_REGN_ORIGIN}/email/stitch-logo.png`).then((r) => r.arrayBuffer()),
  ]);
  logoAttachmentsCache = [
    { filename: "4regn-logo.png", content: Buffer.from(fourRegnLogo).toString("base64"), content_id: "4regn-email-logo" },
    { filename: "stitch-logo.png", content: Buffer.from(stitchLogo).toString("base64"), content_id: "stitch-logo" },
  ];
  return logoAttachmentsCache;
}

function templateHtml() {
  return readFile(path.join(process.cwd(), "public", "email", "4regn-abandoned-cart.html"), "utf8");
}

function renderTemplate(html: string, vars: Record<string, string>): string {
  return Object.entries(vars).reduce((out, [key, value]) => out.replaceAll(`{{${key}}}`, value), html);
}

export type AbandonedCartOrderItem = { id?: string; name: string; price: number; qty: number; variant?: string; image?: string; giftTag?: string };

// Mirrors the ?cart= shape CheckoutPageClient.tsx's own load() decodes
// (JSON.parse(decodeURIComponent(escape(atob(raw))))) -- an order's stored
// `items` (see place-order/route.ts's insert) is already a subset of the
// fields that decoder reads, so this is the encode-side inverse of that
// same function, not a new cart format.
export function buildCartRecoveryUrl(items: AbandonedCartOrderItem[]): string {
  const payload = items.map((i) => ({
    id: i.id,
    name: i.name,
    price: i.price,
    qty: i.qty,
    variant: i.variant || "",
    image: i.image || "",
    ...(i.giftTag ? { giftTag: i.giftTag } : {}),
  }));
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64");
  return `${FOUR_REGN_ORIGIN}/checkout?cart=${encodeURIComponent(encoded)}`;
}

export async function sendAbandonedCartRecoveryEmail(order: {
  seller_id: string;
  customer_name: string | null;
  customer_email: string;
  items: AbandonedCartOrderItem[];
}): Promise<void> {
  const items = order.items || [];
  if (!items.length || !order.customer_email) return;

  const [first, ...rest] = items;
  const firstName = (order.customer_name || "").trim().split(/\s+/)[0] || "";

  const html = renderTemplate(await templateHtml(), {
    preheader_text: "Your 4REGN pick is still waiting. Stitch Pay Later is available at checkout.",
    customer_first_name_greeting: firstName ? `Hi ${firstName}, ` : "",
    product_image_url: first.image || "",
    product_name: first.name,
    product_variant: first.variant || "",
    product_price: `R${Math.round(first.price)}`,
    additional_items_copy: rest.length ? `+ ${rest.length} more item${rest.length > 1 ? "s" : ""} in your cart` : "",
    cart_recovery_url: buildCartRecoveryUrl(items),
    unsubscribe_url: buildUnsubscribeUrl(FOUR_REGN_ORIGIN, order.seller_id, order.customer_email),
  });

  await sendEmail({
    to: order.customer_email,
    subject: "You left heat in your cart 👀",
    html,
    seller: { subdomain: "4regn" },
    attachments: await abandonedCartLogoAttachments(),
  });
}
