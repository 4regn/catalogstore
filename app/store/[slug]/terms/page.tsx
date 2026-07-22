import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Terms of Service — UNIK Labs" };

export default async function TermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Terms of Service" lastUpdated="July 2026" basePath={basePath}>
      <p>Welcome to UNIK Labs.</p>
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of the UNIK
        Labs website, products and services (collectively, the &ldquo;Services&rdquo;). By
        accessing or using UNIK Labs, you agree to be bound by these Terms. If you do not agree
        to these Terms, you should not access or use our Services.
      </p>
      <p>Please read these Terms carefully before using the platform.</p>

      <h2>1. About UNIK Labs</h2>
      <p>
        UNIK Labs is an AI-powered apparel design platform that allows users to create custom
        apparel artwork using artificial intelligence, upload their own designs, preview designs
        on premium garments and purchase custom printed apparel.
      </p>
      <p>The platform is operated under the trading name UNIK Labs and is based in Durban, South Africa.</p>

      <h2>2. Eligibility</h2>
      <p>To use UNIK Labs, you must:</p>
      <ul>
        <li>Be at least 13 years old.</li>
        <li>Have the legal capacity to enter into these Terms.</li>
        <li>Provide accurate account information.</li>
        <li>Comply with all applicable laws while using the platform.</li>
      </ul>
      <p>
        If you are under the age of majority in your country, you should use the Services with
        the involvement of a parent or legal guardian where required by law.
      </p>

      <h2>3. Creating an Account</h2>
      <p>You may be required to create an account to access certain features of the platform.</p>
      <p>You are responsible for maintaining the confidentiality of your account and for all activity that occurs under your account.</p>
      <p>You agree to notify us immediately if you believe your account has been accessed without your permission.</p>
      <p>Google Sign-In is currently supported. Additional authentication methods may be introduced in the future.</p>

      <h2>4. Using UNIK Labs</h2>
      <p>UNIK Labs provides tools that allow users to:</p>
      <ul>
        <li>Generate apparel artwork using AI.</li>
        <li>Upload their own artwork.</li>
        <li>Preview designs on garments.</li>
        <li>Purchase custom printed apparel supplied by UNIK Labs.</li>
      </ul>
      <p>You agree to use the platform responsibly and only for lawful purposes.</p>

      <h2>5. AI Generated Content</h2>
      <p>Artificial intelligence is designed to assist your creative process.</p>
      <p>
        Although we strive to provide high-quality results, AI-generated content may occasionally
        contain inaccuracies, unexpected results or similarities to existing works.
      </p>
      <p>You should carefully review all generated content before using it commercially or submitting it for printing.</p>
      <p>UNIK Labs does not guarantee that AI-generated designs will be unique or suitable for every intended use.</p>

      <h2>6. User Content</h2>
      <p>You retain ownership of the content you upload to UNIK Labs.</p>
      <p>By uploading content, you confirm that:</p>
      <ul>
        <li>You own the content or have permission to use it.</li>
        <li>Your uploads do not infringe another person&rsquo;s intellectual property rights.</li>
        <li>Your uploads comply with these Terms.</li>
      </ul>
      <p>You remain solely responsible for all uploaded content.</p>

      <h2>7. Intellectual Property</h2>
      <p>
        You retain the rights to AI-generated designs you create using UNIK Labs and may use them
        for personal or commercial purposes, subject to applicable law.
      </p>
      <p>
        UNIK Labs retains ownership of its software, website, templates, branding, logos,
        technology and all other intellectual property associated with the platform.
      </p>
      <p>Nothing in these Terms transfers ownership of the UNIK Labs platform to users.</p>

      <h2>8. Orders</h2>
      <p>When placing an order, you agree that:</p>
      <ul>
        <li>All information provided is accurate.</li>
        <li>You have reviewed your artwork before checkout.</li>
        <li>You understand that customised products are made specifically for your order.</li>
      </ul>
      <p>Production may begin shortly after an order is confirmed.</p>

      <h2>9. Payments</h2>
      <p>Payments are processed securely through supported third-party payment providers.</p>
      <p>UNIK Labs does not store complete payment card information.</p>
      <p>Prices displayed on the platform are subject to change without prior notice.</p>

      <h2>10. Cancellations</h2>
      <p>Orders may be cancelled within 48 hours of being placed, provided production has not already begun.</p>
      <p>Once production begins, cancellation may no longer be possible.</p>
      <p>Orders that have already been shipped cannot be cancelled.</p>

      <h2>11. Returns and Refunds</h2>
      <p>
        Because products are customised specifically for each customer, refunds or returns are
        generally not available once production has begun.
      </p>
      <p>
        If a product arrives damaged, defective or incorrect, customers should contact UNIK Labs
        within 72 hours of delivery.
      </p>
      <p>Following review, we may offer a replacement, exchange or refund where appropriate.</p>
      <p>Please refer to our Refund &amp; Returns Policy for additional information.</p>

      <h2>12. Shipping</h2>
      <p>Physical delivery is currently available only within South Africa.</p>
      <p>Delivery estimates are provided for convenience and are not guaranteed.</p>
      <p>
        UNIK Labs is not responsible for delays caused by courier services, weather, customs,
        strikes or events beyond our reasonable control.
      </p>

      <h2>13. Acceptable Use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Use the platform for unlawful purposes.</li>
        <li>Upload malicious software.</li>
        <li>Engage in spam or fraudulent activity.</li>
        <li>Attempt to interfere with the operation or security of the platform.</li>
        <li>Attempt to bypass platform limitations or security measures.</li>
        <li>Upload content that is illegal, harmful or infringes the rights of others.</li>
      </ul>
      <p>Accounts that violate these Terms may be suspended or permanently terminated.</p>

      <h2>14. Third-Party Services</h2>
      <p>UNIK Labs integrates with trusted third-party service providers to deliver parts of our Services.</p>
      <p>
        These may include authentication providers, hosting providers, payment processors, email
        services and artificial intelligence providers.
      </p>
      <p>Your use of certain features may also be subject to the terms and privacy policies of those third parties.</p>

      <h2>15. Availability of the Service</h2>
      <p>
        While we aim to provide uninterrupted access to UNIK Labs, we do not guarantee that the
        Services will always be available or free from errors.
      </p>
      <p>We may modify, suspend or discontinue parts of the platform at any time without prior notice.</p>

      <h2>16. Limitation of Liability</h2>
      <p>
        To the maximum extent permitted by applicable law, UNIK Labs shall not be liable for any
        indirect, incidental, special or consequential damages arising from your use of the
        platform.
      </p>
      <p>
        Our total liability for any claim relating to the Services shall not exceed the amount
        paid by you for the relevant order or service giving rise to the claim.
      </p>
      <p>Nothing in these Terms excludes liability where it cannot legally be excluded under applicable law.</p>

      <h2>17. Termination</h2>
      <p>We reserve the right to suspend or terminate accounts that:</p>
      <ul>
        <li>Violate these Terms.</li>
        <li>Engage in fraud or chargeback abuse.</li>
        <li>Attempt to compromise the platform.</li>
        <li>Repeatedly misuse the Services.</li>
        <li>Engage in unlawful activity.</li>
      </ul>
      <p>Termination may occur without prior notice where necessary to protect the platform or other users.</p>

      <h2>18. Changes to These Terms</h2>
      <p>We may update these Terms from time to time.</p>
      <p>
        Where changes are significant, we will update the &ldquo;Last Updated&rdquo; date and,
        where appropriate, provide additional notice.
      </p>
      <p>Continued use of the Services after changes become effective constitutes acceptance of the revised Terms.</p>

      <h2>19. Governing Law</h2>
      <p>These Terms are governed by the laws of the Republic of South Africa.</p>
      <p>
        Any disputes arising in connection with these Terms or the use of the Services shall be
        subject to the jurisdiction of the South African courts, unless otherwise required by
        applicable law.
      </p>

      <h2>20. Contact</h2>
      <p>If you have any questions regarding these Terms of Service, please contact us using our official support channels.</p>
    </UnikInfoLayout>
  );
}
