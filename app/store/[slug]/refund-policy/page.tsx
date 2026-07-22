import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Refund & Returns Policy — UNIK Labs" };

export default async function RefundPolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Refund & Returns Policy" lastUpdated="July 2026" basePath={basePath}>
      <p>
        At UNIK Labs, every custom garment is made specifically for each customer. Because each
        order is personalised, our refund and return policy differs from that of standard retail
        products.
      </p>
      <p>Please read this policy carefully before placing your order.</p>

      <h2>Our Commitment</h2>
      <p>We want you to be confident when ordering from UNIK Labs.</p>
      <p>If something goes wrong due to a production or quality issue on our end, we&rsquo;ll work with you to make it right.</p>

      <h2>Order Cancellations</h2>
      <p>Orders may be cancelled within 48 hours of being placed, provided production has not already begun.</p>
      <p>
        Because production may begin before the 48-hour period has expired, submitting a
        cancellation request within 48 hours does not automatically guarantee that your order can
        be cancelled.
      </p>
      <p>Once production has started, cancellation is no longer possible.</p>
      <p>Orders that have already been shipped cannot be cancelled.</p>

      <h2>Returns</h2>
      <p>Because every garment is produced specifically for your order, we generally do not accept returns for:</p>
      <ul>
        <li>Change of mind</li>
        <li>Ordering the wrong size</li>
        <li>Choosing the wrong garment colour</li>
        <li>Uploaded artwork errors</li>
        <li>Design approval after checkout</li>
        <li>Minor colour differences between digital screens and printed products</li>
        <li>Personal preference</li>
      </ul>
      <p>Please review your artwork, garment selection, sizing and shipping details carefully before completing your purchase.</p>

      <h2>Refund Eligibility</h2>
      <p>A refund, replacement or exchange may be considered where:</p>
      <ul>
        <li>You received the wrong product.</li>
        <li>Your item arrived damaged during production.</li>
        <li>Your garment contains a manufacturing defect.</li>
        <li>Your order contains a confirmed printing error caused by UNIK Labs.</li>
      </ul>
      <p>Each request is reviewed individually.</p>
      <p>Approval of one refund request does not guarantee approval of future requests.</p>

      <h2>Reporting a Problem</h2>
      <p>If you believe your order has a quality issue, please contact us within 72 hours of receiving your package.</p>
      <p>When contacting us, please include:</p>
      <ul>
        <li>Your order number</li>
        <li>Your full name</li>
        <li>A description of the issue</li>
        <li>Clear photographs of the full garment</li>
        <li>Close-up photographs of the affected area</li>
        <li>Photographs of the packaging if relevant</li>
      </ul>
      <p>Providing complete information helps us assess your request as quickly as possible.</p>

      <h2>Inspection Process</h2>
      <p>Once your request has been received, our team will review the information provided.</p>
      <p>Depending on the nature of the issue, we may:</p>
      <ul>
        <li>Approve a replacement</li>
        <li>Offer an exchange</li>
        <li>Issue a partial refund</li>
        <li>Issue a full refund</li>
        <li>Request additional information before making a decision</li>
      </ul>
      <p>We aim to assess refund and quality requests as promptly as reasonably possible.</p>

      <h2>Non-Refundable Situations</h2>
      <p>Refunds or replacements will generally not be provided where:</p>
      <ul>
        <li>The issue was caused by incorrect artwork supplied by the customer.</li>
        <li>The uploaded image was low quality or low resolution.</li>
        <li>The customer selected the incorrect size.</li>
        <li>The shipping address provided was incorrect.</li>
        <li>The garment has been washed, altered or damaged after delivery.</li>
        <li>Normal wear and tear has occurred.</li>
        <li>The customer simply changes their mind after production has begun.</li>
        <li>The printed product matches the approved design and mockup.</li>
      </ul>

      <h2>Colour and Print Variations</h2>
      <p>
        Please note that colours displayed on digital screens may differ slightly from colours on
        printed garments due to differences in screen calibration, printing processes and fabric
        materials.
      </p>
      <p>Minor variations in colour, print placement or garment positioning are normal and do not constitute manufacturing defects.</p>

      <h2>AI-Generated Designs</h2>
      <p>AI-generated artwork may contain unexpected details or imperfections.</p>
      <p>Customers are responsible for reviewing both the generated artwork and garment mockup before placing an order.</p>
      <p>UNIK Labs is not responsible for errors that were visible in the approved design before production.</p>

      <h2>Shipping Issues</h2>
      <p>If your parcel is delayed after being handed to the courier, we will do our best to assist in obtaining updates.</p>
      <p>However, courier delays outside our control do not automatically qualify for a refund.</p>
      <p>If your package is confirmed as lost during transit, we will investigate the matter with the courier before determining an appropriate resolution.</p>

      <h2>Chargebacks</h2>
      <p>If you experience an issue with your order, we encourage you to contact UNIK Labs before initiating a chargeback with your payment provider.</p>
      <p>Fraudulent or abusive chargebacks may result in the suspension or termination of your account.</p>

      <h2>Consumer Rights</h2>
      <p>Nothing in this Refund &amp; Returns Policy limits or excludes any rights you may have under applicable consumer protection laws.</p>
      <p>Where local laws provide additional rights or remedies, those rights will continue to apply.</p>

      <h2>Contact Us</h2>
      <p>If you have any questions about this policy or need assistance with an order, please contact us through our official support channels.</p>
    </UnikInfoLayout>
  );
}
