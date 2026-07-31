import { sendEmail } from "./email";
import { canonicalStoreUrl } from "./store-url";

type SellerBrand = { store_name: string; logo_url: string | null; subdomain: string };
type PartnerContact = { full_name: string; email: string };

// Shared by the approve action (app/api/unik/brand-manager/partners/route.ts)
// and the resend action on the same route, so a partner approved before
// this email existed can be sent the exact same notification after the
// fact, not a slightly different one.
export async function sendPartnerApprovalEmail(params: {
  seller: SellerBrand;
  partner: PartnerContact;
  discountCode: string;
  commissionPercent: number;
}) {
  const { seller, partner, discountCode, commissionPercent } = params;
  const firstName = partner.full_name.split(" ")[0];
  await sendEmail({
    to: partner.email,
    // Display name only -- orders@catalogstore.co.za stays the actual
    // verified sending address, same pattern as bookings/update-status's
    // confirmation email, so this doesn't need its own domain verification
    // in Resend to read as coming from the seller's own brand.
    from: `${seller.store_name} <orders@catalogstore.co.za>`,
    subject: `You're in! Welcome as a ${seller.store_name} Partner`,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
      ${seller.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
      <p style="margin:0 0 12px;font-size:15px">Hi ${firstName}, your application to become a ${seller.store_name} Partner has been approved.</p>
      <p style="margin:0 0 20px;font-size:14px;color:#444;line-height:1.6">You earn <strong>${commissionPercent}% commission</strong> on every sale — whether someone uses your discount code, or simply clicks your referral link and checks out without it. Either way, it counts as your sale.</p>
      <div style="background:#f7f7f5;border-radius:12px;padding:16px 18px;margin:0 0 20px">
        <span style="display:block;font-size:11px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#888">Your discount code</span>
        <span style="display:block;font-size:22px;font-weight:800;margin-top:4px;letter-spacing:.02em">${discountCode}</span>
        <span style="display:block;font-size:12px;color:#888;margin-top:6px">You can change this anytime from your dashboard.</span>
      </div>
      <p style="margin:0 0 10px;font-size:14px;font-weight:700">Before you start sharing, finish setting up:</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px">
        <tr>
          <td style="width:28px;vertical-align:top;padding:8px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#007517;color:#fff;font-size:12px;font-weight:800;text-align:center;line-height:22px">1</span></td>
          <td style="padding:8px 0 8px 10px;font-size:13.5px;color:#333;line-height:1.5">Upload a profile picture — it's the first thing people see when they click your link.</td>
        </tr>
        <tr>
          <td style="width:28px;vertical-align:top;padding:8px 0"><span style="display:inline-block;width:22px;height:22px;border-radius:50%;background:#007517;color:#fff;font-size:12px;font-weight:800;text-align:center;line-height:22px">2</span></td>
          <td style="padding:8px 0 8px 10px;font-size:13.5px;color:#333;line-height:1.5">Add your banking details — this is where your payouts get sent.</td>
        </tr>
      </table>
      <a href="${canonicalStoreUrl(seller.subdomain, "/partners/login")}" style="display:inline-block;padding:13px 26px;background:#007517;color:#fff;text-decoration:none;border-radius:100px;font-weight:700;font-size:13.5px">Log in to your dashboard</a>
    </div>`,
  });
}

export async function sendPartnerRejectionEmail(params: { seller: SellerBrand; partner: PartnerContact }) {
  const { seller, partner } = params;
  await sendEmail({
    to: partner.email,
    from: `${seller.store_name} <orders@catalogstore.co.za>`,
    subject: `Update on your ${seller.store_name} Partner application`,
    html: `<div style="font-family:-apple-system,sans-serif;max-width:520px;margin:0 auto;color:#111">
      ${seller.logo_url ? `<img src="${seller.logo_url}" alt="" style="height:40px;margin-bottom:16px" />` : `<h2 style="margin:0 0 12px">${seller.store_name}</h2>`}
      <p style="margin:0 0 12px">Hi ${partner.full_name.split(" ")[0]}, thanks for your interest in becoming a ${seller.store_name} Partner.</p>
      <p style="margin:0">We won't be moving forward with your application at this time. You're welcome to apply again in future.</p>
    </div>`,
  });
}
