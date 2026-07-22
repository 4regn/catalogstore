import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Cookie Policy — UNIK Labs" };

export default async function CookiePolicyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Cookie Policy" lastUpdated="July 2026" basePath={basePath}>
      <p>This Cookie Policy explains how UNIK Labs uses cookies and similar technologies when you visit or use our website.</p>
      <p>By continuing to use UNIK Labs, you consent to our use of cookies as described in this policy.</p>

      <h2>What Are Cookies?</h2>
      <p>Cookies are small text files that are stored on your device when you visit a website.</p>
      <p>They help websites remember information about your visit, improve performance, enhance security and provide a more personalised browsing experience.</p>
      <p>Cookies do not usually contain information that directly identifies you, but they may be linked to information associated with your account.</p>

      <h2>How We Use Cookies</h2>
      <p>UNIK Labs uses cookies to provide a secure, reliable and user-friendly experience.</p>
      <p>Cookies help us:</p>
      <ul>
        <li>Keep you signed in to your account.</li>
        <li>Remember your preferences.</li>
        <li>Maintain secure sessions.</li>
        <li>Improve website performance.</li>
        <li>Understand how visitors use our platform.</li>
        <li>Detect and prevent fraudulent or suspicious activity.</li>
        <li>Support essential platform functionality.</li>
      </ul>
      <p>Without certain cookies, some features of UNIK Labs may not function correctly.</p>

      <h2>Types of Cookies We Use</h2>
      <h3>Essential Cookies</h3>
      <p>These cookies are necessary for the operation of UNIK Labs.</p>
      <p>They enable core functionality such as:</p>
      <ul>
        <li>User authentication</li>
        <li>Account security</li>
        <li>Session management</li>
        <li>Navigation</li>
        <li>Shopping cart functionality</li>
      </ul>
      <p>These cookies cannot be disabled because the platform depends on them to operate correctly.</p>

      <h3>Performance Cookies</h3>
      <p>Performance cookies help us understand how visitors interact with our website.</p>
      <p>They allow us to improve:</p>
      <ul>
        <li>Website speed</li>
        <li>Stability</li>
        <li>User experience</li>
        <li>Feature performance</li>
      </ul>
      <p>The information collected is generally aggregated and does not directly identify individual users.</p>

      <h3>Functional Cookies</h3>
      <p>Functional cookies remember choices you make while using UNIK Labs.</p>
      <p>These may include:</p>
      <ul>
        <li>Language preferences</li>
        <li>Theme or appearance settings</li>
        <li>Recently used options</li>
        <li>Other personalised settings</li>
      </ul>
      <p>These cookies help provide a more consistent browsing experience.</p>

      <h3>Security Cookies</h3>
      <p>Security cookies help protect both you and UNIK Labs by detecting suspicious activity and maintaining secure user sessions.</p>
      <p>These cookies assist with fraud prevention, account protection and platform integrity.</p>

      <h2>Third-Party Cookies</h2>
      <p>Some cookies are placed by trusted third-party services that help us provide the UNIK Labs platform.</p>
      <p>These services may include:</p>
      <ul>
        <li>Google Authentication</li>
        <li>Stripe</li>
        <li>Supabase</li>
        <li>Cloudflare</li>
        <li>Vercel</li>
      </ul>
      <p>These providers may use cookies in accordance with their own privacy and cookie policies.</p>

      <h2>Managing Cookies</h2>
      <p>Most web browsers allow you to control or disable cookies through your browser settings.</p>
      <p>Please note that disabling certain cookies may affect the functionality of UNIK Labs and prevent some features from working correctly.</p>

      <h2>Updates to This Policy</h2>
      <p>We may update this Cookie Policy from time to time to reflect changes to our services, technology or legal obligations.</p>
      <p>When changes are made, we will update the &ldquo;Last Updated&rdquo; date at the top of this page.</p>

      <h2>Contact Us</h2>
      <p>If you have any questions about our use of cookies or this Cookie Policy, please contact us through our official support channels.</p>
    </UnikInfoLayout>
  );
}
