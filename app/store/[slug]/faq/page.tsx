import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "FAQs — UNIK Labs" };

const CHIPS = [
  { id: "general", label: "General" },
  { id: "ai-studio", label: "AI Studio" },
  { id: "custom-upload", label: "Custom Upload" },
  { id: "orders", label: "Orders" },
  { id: "shipping", label: "Shipping" },
  { id: "returns", label: "Returns & Refunds" },
  { id: "payments", label: "Payments" },
  { id: "account", label: "Account" },
  { id: "ip", label: "Intellectual Property" },
];

function Faq({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details>
      <summary>{q}</summary>
      <div className="ui-faq-a">{children}</div>
    </details>
  );
}

export default async function FaqPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout
      kicker="Support"
      title="Frequently asked questions"
      subtitle={<>Find quick answers to the questions we receive most often. If you need more detailed information, visit our <a href={`${basePath}/help`}>Help Centre</a>.</>}
      wide
      basePath={basePath}
    >
      <ul className="ui-chips">
        {CHIPS.map((c) => <li key={c.id}><a href={`#${c.id}`}>{c.label}</a></li>)}
      </ul>

      <h2 id="general">General</h2>
      <div className="ui-faq">
        <Faq q="What is UNIK Labs?">
          <p>UNIK Labs is an AI-powered apparel design platform that lets you create custom artwork for premium T-shirts and hoodies. Choose a design template, upload your images, generate artwork with AI and preview your design before ordering it printed on our garments.</p>
        </Faq>
        <Faq q="Do I need design experience?">
          <p>Not at all.</p>
          <p>UNIK Labs is designed for everyone &mdash; from first-time creators to experienced designers. Our templates and AI tools simplify the creative process so you can focus on your ideas rather than complicated software.</p>
        </Faq>
        <Faq q="Is UNIK Labs available worldwide?">
          <p>Yes. Anyone can access and use the platform.</p>
          <p>However, physical product delivery is currently available only within South Africa.</p>
        </Faq>
      </div>

      <h2 id="ai-studio">AI Design Studio</h2>
      <div className="ui-faq">
        <Faq q="How many free AI generations do I get?">
          <p>Every registered account currently receives 3 free AI generations per day.</p>
          <p>Additional generation credits may become available in the future.</p>
        </Faq>
        <Faq q="Why did my AI generation fail?">
          <p>Generations can occasionally fail due to:</p>
          <ul>
            <li>Poor image quality</li>
            <li>Temporary server issues</li>
            <li>Unsupported content</li>
            <li>Network interruptions</li>
            <li>AI provider restrictions</li>
          </ul>
          <p>If this happens, try uploading a clearer image or generating again later.</p>
        </Faq>
        <Faq q="Can I regenerate a design?">
          <p>Yes.</p>
          <p>You can generate another version as long as you still have available daily generations.</p>
        </Faq>
        <Faq q="Does AI always generate perfect results?">
          <p>No.</p>
          <p>AI-generated artwork can sometimes produce unexpected or imperfect results. Always review your artwork and mockup before placing an order.</p>
        </Faq>
      </div>

      <h2 id="custom-upload">Custom Upload</h2>
      <div className="ui-faq">
        <Faq q="Can I upload my own design?">
          <p>Yes.</p>
          <p>If you&rsquo;ve already created your artwork, simply use the Custom Upload feature instead of the AI Design Studio.</p>
        </Faq>
        <Faq q="What file types are supported?">
          <p>For the best results, we recommend high-resolution PNG files with transparent backgrounds.</p>
          <p>Additional file types may be supported depending on the upload tool.</p>
        </Faq>
        <Faq q="Can I upload logos or artwork?">
          <p>Yes.</p>
          <p>You may upload logos, illustrations or other artwork, provided you have the legal right to use them.</p>
        </Faq>
      </div>

      <h2 id="orders">Orders</h2>
      <div className="ui-faq">
        <Faq q="What products do you print on?">
          <p>Currently we print on premium T-shirts and hoodies supplied by UNIK Labs.</p>
          <p>Customers cannot send their own garments for printing.</p>
        </Faq>
        <Faq q="Can I order just one item?">
          <p>Yes.</p>
          <p>There is no minimum order quantity. You can order a single customised garment or multiple items.</p>
        </Faq>
        <Faq q="Can I change my order?">
          <p>If production has not started, contact us as soon as possible.</p>
          <p>Once production begins, changes may no longer be possible.</p>
        </Faq>
        <Faq q="Can I cancel my order?">
          <p>Cancellation requests must be submitted within 48 hours of placing your order.</p>
          <p>Orders that have entered production or have already been shipped cannot be cancelled.</p>
        </Faq>
      </div>

      <h2 id="shipping">Shipping</h2>
      <div className="ui-faq">
        <Faq q="Where do you deliver?">
          <p>We currently deliver physical products within South Africa only.</p>
        </Faq>
        <Faq q="How long does production take?">
          <p>Production times vary depending on order volume and product type.</p>
          <p>Estimated production and delivery times are provided during checkout whenever available.</p>
        </Faq>
        <Faq q="Will I receive tracking information?">
          <p>Yes.</p>
          <p>Tracking details will be provided once your order has been prepared for shipment, where available.</p>
        </Faq>
      </div>

      <h2 id="returns">Returns &amp; Refunds</h2>
      <div className="ui-faq">
        <Faq q="Can I return a customised product?">
          <p>Because every garment is made specifically for you, customised products cannot usually be returned simply because you changed your mind.</p>
        </Faq>
        <Faq q="What if my item arrives damaged?">
          <p>If your order arrives damaged, defective or incorrect, contact us within 72 hours of delivery.</p>
          <p>After reviewing the issue, we may offer a replacement, exchange or refund where appropriate.</p>
        </Faq>
      </div>

      <h2 id="payments">Payments</h2>
      <div className="ui-faq">
        <Faq q="How do I pay?">
          <p>Payments are securely processed through our supported payment providers.</p>
          <p>Available payment methods are displayed during checkout.</p>
        </Faq>
        <Faq q="Is my payment information secure?">
          <p>Yes.</p>
          <p>Payment processing is handled securely by our payment partners. UNIK Labs does not store your complete payment card details.</p>
        </Faq>
      </div>

      <h2 id="account">Account</h2>
      <div className="ui-faq">
        <Faq q="How do I create an account?">
          <p>You can quickly create an account using Google Sign-In.</p>
          <p>Additional sign-in options may be introduced in the future.</p>
        </Faq>
        <Faq q="Can I delete my account?">
          <p>Account deletion is not currently available through the platform.</p>
          <p>This feature is planned for a future update.</p>
        </Faq>
        <Faq q="Can my account be suspended?">
          <p>Yes.</p>
          <p>Accounts that engage in spam, fraud, abuse, chargeback fraud, attempts to bypass platform limitations or other violations of our policies may be suspended or permanently removed.</p>
        </Faq>
      </div>

      <h2 id="ip">Intellectual Property</h2>
      <div className="ui-faq">
        <Faq q="Who owns the designs I create?">
          <p>You retain the rights to the designs you create using UNIK Labs.</p>
          <p>UNIK Labs retains ownership of the platform, software, templates and underlying technology.</p>
        </Faq>
        <Faq q="Can I sell my designs?">
          <p>Yes.</p>
          <p>You may use your designs for personal or commercial purposes, provided they do not infringe the rights of others.</p>
        </Faq>
        <Faq q="Does UNIK Labs train AI using my uploads?">
          <p>No.</p>
          <p>UNIK Labs does not use customer-uploaded images or generated artwork to train artificial intelligence models.</p>
        </Faq>
      </div>

      <h2>Still have questions?</h2>
      <p>Can&rsquo;t find the answer you&rsquo;re looking for?</p>
      <p>
        Visit our <a href={`${basePath}/help`}>Help Centre</a> for more detailed guidance, or
        contact our support team once our customer support channels become available.
      </p>
    </UnikInfoLayout>
  );
}
