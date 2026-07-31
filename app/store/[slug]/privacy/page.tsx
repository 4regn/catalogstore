import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Privacy Policy — UNIK Labs" };

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Privacy Policy" lastUpdated="July 2026" basePath={basePath}>
      <p>At UNIK Labs, we value your privacy and are committed to protecting your personal information.</p>
      <p>
        This Privacy Policy explains what information we collect, how we use it, who we share it
        with and the choices you have regarding your information when using UNIK Labs.
      </p>
      <p>By using our platform, you agree to the collection and use of information in accordance with this Privacy Policy.</p>

      <h2>1. Information We Collect</h2>
      <p>To provide our services, we collect certain information when you use UNIK Labs.</p>
      <h3>Information You Provide</h3>
      <p>Depending on how you use the platform, you may provide:</p>
      <ul>
        <li>Your name</li>
        <li>Email address</li>
        <li>Google account information (when signing in with Google)</li>
        <li>Uploaded images</li>
        <li>AI-generated designs</li>
        <li>Order information</li>
        <li>Shipping information</li>
        <li>Messages you send to our support team</li>
      </ul>
      <h3>Information Collected Automatically</h3>
      <p>When you visit UNIK Labs, certain technical information may be collected automatically, including:</p>
      <ul>
        <li>Browser type</li>
        <li>Device information</li>
        <li>IP address</li>
        <li>Cookies</li>
        <li>Pages visited</li>
        <li>General usage information</li>
        <li>Error reports and diagnostics</li>
      </ul>
      <p>This information helps us improve the performance, reliability and security of our platform.</p>

      <h2>2. How We Use Your Information</h2>
      <p>We use your information to:</p>
      <ul>
        <li>Create and manage your account.</li>
        <li>Generate AI-powered apparel designs.</li>
        <li>Process and fulfil your orders.</li>
        <li>Display garment previews.</li>
        <li>Improve platform performance.</li>
        <li>Detect fraud and abuse.</li>
        <li>Respond to support requests.</li>
        <li>Communicate important updates regarding your account or orders.</li>
        <li>Maintain the security of our platform.</li>
      </ul>
      <p>We do not sell your personal information.</p>

      <h2>3. AI Processing</h2>
      <p>When you use the AI Design Studio, your uploaded images are securely processed to generate the design you request.</p>
      <p>Your uploads are used only for providing the requested service.</p>
      <p>UNIK Labs does not use your uploaded images or generated designs to train artificial intelligence models.</p>
      <p>To help us review generation quality and investigate reported issues, your uploaded images may be retained for up to 30 days after your design is generated. After this period, they are automatically deleted.</p>

      <h2>4. Cookies</h2>
      <p>UNIK Labs uses cookies and similar technologies to:</p>
      <ul>
        <li>Keep you signed in.</li>
        <li>Remember your preferences.</li>
        <li>Improve website performance.</li>
        <li>Measure website usage.</li>
        <li>Maintain security.</li>
      </ul>
      <p>Some features of the platform may not function correctly if cookies are disabled.</p>
      <p>For more information, please refer to our Cookie Policy.</p>

      <h2>5. Third-Party Services</h2>
      <p>To provide our services, UNIK Labs works with trusted third-party providers.</p>
      <p>These providers may process information on our behalf in accordance with their own privacy policies.</p>
      <p>Current providers include:</p>
      <ul>
        <li>Google Authentication</li>
        <li>Stripe</li>
        <li>Supabase</li>
        <li>Vercel</li>
        <li>Cloudflare</li>
        <li>Resend</li>
      </ul>
      <p>Additional providers may be introduced as the platform evolves.</p>

      <h2>6. Payment Information</h2>
      <p>Payments are processed securely by our payment provider.</p>
      <p>UNIK Labs does not store your complete debit or credit card details.</p>
      <p>Payment information is handled directly by the payment provider in accordance with its own privacy and security practices.</p>

      <h2>7. Data Storage</h2>
      <p>Your information is stored only for as long as reasonably necessary to:</p>
      <ul>
        <li>Provide our services.</li>
        <li>Fulfil orders.</li>
        <li>Maintain your account.</li>
        <li>Comply with legal obligations.</li>
        <li>Resolve disputes.</li>
        <li>Protect the security of the platform.</li>
      </ul>
      <p>When information is no longer required, it may be securely deleted or anonymised where appropriate.</p>

      <h2>8. Protecting Your Information</h2>
      <p>We take reasonable technical and organisational measures to protect your information from:</p>
      <ul>
        <li>Unauthorised access</li>
        <li>Loss</li>
        <li>Misuse</li>
        <li>Alteration</li>
        <li>Disclosure</li>
      </ul>
      <p>However, no online service can guarantee absolute security, and you use the platform at your own risk.</p>

      <h2>9. Your Rights</h2>
      <p>Depending on applicable law, you may have the right to:</p>
      <ul>
        <li>Access your personal information.</li>
        <li>Request corrections to inaccurate information.</li>
        <li>Request deletion of your information where applicable.</li>
        <li>Object to certain types of data processing.</li>
        <li>Request a copy of certain personal information.</li>
      </ul>
      <p>Some of these features may become available directly through your UNIK Labs account in future updates.</p>

      <h2>10. Children&rsquo;s Privacy</h2>
      <p>UNIK Labs is intended for users aged 13 years and older.</p>
      <p>We do not knowingly collect personal information from children below the minimum age permitted by applicable law.</p>
      <p>If we become aware that information has been collected in violation of applicable laws, we will take reasonable steps to remove it.</p>

      <h2>11. International Access</h2>
      <p>UNIK Labs may be accessed from countries around the world.</p>
      <p>By using our platform, you understand that your information may be processed in countries where our service providers operate.</p>
      <p>Physical product delivery is currently limited to South Africa.</p>

      <h2>12. Changes to this Privacy Policy</h2>
      <p>We may update this Privacy Policy from time to time.</p>
      <p>When changes are made, we will update the &ldquo;Last Updated&rdquo; date shown at the top of this page.</p>
      <p>Continued use of UNIK Labs after changes become effective constitutes acceptance of the revised Privacy Policy.</p>

      <h2>13. Contact Us</h2>
      <p>If you have questions about this Privacy Policy or how your information is handled, please contact us through our official support channels once they become available.</p>

      <h2>14. Data We Never Sell</h2>
      <p>We believe your personal information belongs to you.</p>
      <p>
        UNIK Labs does not sell your personal information, uploaded images or AI-generated designs
        to advertisers, data brokers or other third parties.
      </p>
      <p>We also do not use your uploaded content to train artificial intelligence models.</p>
      <p>Your information is used only to provide and improve the services you request.</p>
    </UnikInfoLayout>
  );
}
