import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Shipping Policy — UNIK Labs" };

export default async function ShippingPolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Shipping Policy" lastUpdated="July 2026" basePath={basePath}>
      <p>
        At UNIK Labs, every garment is custom-made specifically for your order. Because each item
        is produced on demand, please allow time for both production and delivery before your
        order arrives.
      </p>
      <p>This Shipping Policy explains how we process, produce and deliver your order.</p>

      <h2>Delivery Locations</h2>
      <p>UNIK Labs currently delivers physical products within South Africa only.</p>
      <p>While our platform is accessible worldwide, we do not currently offer international shipping for physical products.</p>
      <p>International shipping may become available in the future.</p>

      <h2>Production</h2>
      <p>Every custom garment is produced after your order has been confirmed.</p>
      <p>Unlike traditional retail stores, we do not keep pre-printed inventory ready for shipment.</p>
      <p>Production includes:</p>
      <ul>
        <li>Preparing your artwork</li>
        <li>Printing your design</li>
        <li>Quality inspection</li>
        <li>Packaging your order</li>
        <li>Preparing your parcel for courier collection</li>
      </ul>
      <p>Production times may vary depending on order volume, seasonal demand and operational requirements.</p>

      <h2>Estimated Delivery Times</h2>
      <p>Estimated production and delivery times will be communicated during checkout or after your order has been placed.</p>
      <p>These estimates are provided as a guide only and should not be considered guaranteed delivery dates.</p>
      <p>Delivery times may be affected by:</p>
      <ul>
        <li>Public holidays</li>
        <li>Peak shopping periods</li>
        <li>Weather conditions</li>
        <li>Courier delays</li>
        <li>Remote delivery locations</li>
        <li>Circumstances beyond our reasonable control</li>
      </ul>

      <h2>Order Processing</h2>
      <p>Once payment has been successfully received, your order enters our production queue.</p>
      <p>After production begins, changes or cancellations may no longer be possible.</p>
      <p>Please ensure that all information provided during checkout is accurate before completing your purchase.</p>

      <h2>Shipping Confirmation</h2>
      <p>Once your order has been prepared for shipment, you will receive confirmation that your order has been dispatched.</p>
      <p>Where available, tracking information will be provided so you can monitor your delivery.</p>
      <p>Please note that tracking updates may not appear immediately after collection by the courier.</p>

      <h2>Delivery Address</h2>
      <p>Customers are responsible for providing a complete and accurate delivery address.</p>
      <p>Before placing your order, please carefully review:</p>
      <ul>
        <li>Recipient name</li>
        <li>Street address</li>
        <li>Apartment or unit number (if applicable)</li>
        <li>City</li>
        <li>Postal code</li>
        <li>Contact number</li>
      </ul>
      <p>UNIK Labs is not responsible for delays or failed deliveries resulting from incorrect or incomplete information supplied by the customer.</p>
      <p>Additional delivery charges may apply if a parcel must be re-shipped due to an incorrect address.</p>

      <h2>Missed Deliveries</h2>
      <p>If delivery cannot be completed because:</p>
      <ul>
        <li>No one is available to receive the parcel</li>
        <li>The address provided is incorrect</li>
        <li>The courier is unable to access the delivery location</li>
      </ul>
      <p>the courier may attempt another delivery or hold the parcel according to their policies.</p>
      <p>Additional delivery fees may apply where re-delivery is required.</p>

      <h2>Delays</h2>
      <p>While we work closely with our courier partners, delays can occasionally occur after a parcel has left our production facility.</p>
      <p>Once an order has been handed to the courier, delivery times are largely outside of our control.</p>
      <p>We will gladly assist in obtaining updates from the courier where possible, but courier delays do not automatically qualify for refunds or compensation.</p>

      <h2>Lost Parcels</h2>
      <p>If your parcel appears to be lost during transit, please contact us as soon as possible.</p>
      <p>We will work with the courier to investigate the shipment before determining the most appropriate resolution.</p>
      <p>Depending on the outcome of the investigation, this may include:</p>
      <ul>
        <li>Replacing your order</li>
        <li>Reprinting your garment</li>
        <li>Issuing a refund where appropriate</li>
      </ul>

      <h2>Damaged Packages</h2>
      <p>If your package arrives visibly damaged, we recommend taking photographs of:</p>
      <ul>
        <li>The outer packaging</li>
        <li>The shipping label</li>
        <li>The damaged item</li>
        <li>Any damage to the contents</li>
      </ul>
      <p>Please contact us within 72 hours of delivery so we can investigate the issue.</p>

      <h2>Order Tracking</h2>
      <p>Where tracking is available, you can use the tracking information provided in your shipping confirmation email to monitor your parcel&rsquo;s progress.</p>
      <p>Tracking updates are managed by the courier and may occasionally be delayed.</p>

      <h2>International Customers</h2>
      <p>Customers outside South Africa are welcome to browse and use the UNIK Labs platform.</p>
      <p>At this time, physical orders cannot be shipped internationally.</p>
      <p>We look forward to expanding our delivery network in the future.</p>

      <h2>Contact Us</h2>
      <p>If you have any questions regarding shipping or the status of your order, please contact us through our official support channels.</p>
    </UnikInfoLayout>
  );
}
