import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Acceptable Use Policy — UNIK Labs" };

export default async function AcceptableUsePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Acceptable Use Policy" lastUpdated="July 2026" basePath={basePath}>
      <p>At UNIK Labs, we want to provide a safe, creative and enjoyable experience for everyone.</p>
      <p>
        This Acceptable Use Policy explains the standards that apply when using our platform. By
        accessing or using UNIK Labs, you agree to follow this policy in addition to our Terms of
        Service.
      </p>
      <p>Failure to comply with this policy may result in the suspension or permanent termination of your account.</p>

      <h2>Our Goal</h2>
      <p>UNIK Labs is designed to help people create custom apparel through artificial intelligence and custom printing.</p>
      <p>We encourage creativity, originality and responsible use of our platform while maintaining a safe environment for all users.</p>

      <h2>Permitted Use</h2>
      <p>You may use UNIK Labs to:</p>
      <ul>
        <li>Create custom apparel designs.</li>
        <li>Generate artwork using our AI Design Studio.</li>
        <li>Upload your own original artwork.</li>
        <li>Design apparel for personal use.</li>
        <li>Create merchandise for commercial use.</li>
        <li>Experiment with creative ideas.</li>
        <li>Purchase products offered through the platform.</li>
      </ul>

      <h2>Prohibited Content</h2>
      <p>You may not upload, generate or attempt to create content that:</p>
      <ul>
        <li>Is illegal or promotes illegal activity.</li>
        <li>Contains child sexual abuse material or exploits minors.</li>
        <li>Contains explicit sexual or pornographic material.</li>
        <li>Promotes or glorifies violence or terrorism.</li>
        <li>Encourages hatred, discrimination or harassment.</li>
        <li>Contains graphic or disturbing content.</li>
        <li>Promotes self-harm or suicide.</li>
        <li>Is intended to threaten, intimidate or harm others.</li>
        <li>Is deceptive, fraudulent or misleading.</li>
        <li>Violates another person&rsquo;s privacy or publicity rights.</li>
      </ul>
      <p>UNIK Labs reserves the right to remove or refuse content that violates these standards.</p>

      <h2>Intellectual Property</h2>
      <p>You must only upload content that you own or have permission to use.</p>
      <p>You are responsible for ensuring that your uploaded images, logos, artwork and other materials do not infringe the intellectual property rights of others.</p>
      <p>UNIK Labs does not verify ownership of uploaded content before it is processed.</p>

      <h2>Platform Abuse</h2>
      <p>You may not:</p>
      <ul>
        <li>Attempt to gain unauthorised access to the platform.</li>
        <li>Circumvent security measures.</li>
        <li>Reverse engineer or interfere with our systems.</li>
        <li>Use automated tools to abuse or overload the platform.</li>
        <li>Attempt to bypass AI generation limits or account restrictions.</li>
        <li>Interfere with another user&rsquo;s experience.</li>
      </ul>

      <h2>Fraudulent Activity</h2>
      <p>You may not use UNIK Labs to:</p>
      <ul>
        <li>Commit fraud.</li>
        <li>Engage in payment fraud.</li>
        <li>Abuse refunds or chargebacks.</li>
        <li>Provide false identity information.</li>
        <li>Use stolen payment methods.</li>
        <li>Place fraudulent orders.</li>
      </ul>
      <p>Accounts involved in fraudulent activity may be suspended immediately and, where appropriate, reported to the relevant authorities.</p>

      <h2>Spam and Automated Behaviour</h2>
      <p>Users may not:</p>
      <ul>
        <li>Send spam through the platform.</li>
        <li>Create fake accounts.</li>
        <li>Use bots to abuse platform functionality.</li>
        <li>Attempt to manipulate platform usage or availability.</li>
        <li>Exploit bugs or vulnerabilities.</li>
      </ul>

      <h2>Artificial Intelligence</h2>
      <p>Our AI tools are intended to support creativity.</p>
      <p>
        You may not intentionally attempt to use the platform to generate content that violates
        this policy or bypass safeguards implemented by UNIK Labs or our AI service providers.
      </p>
      <p>AI-generated content should always be reviewed before being used commercially or submitted for production.</p>

      <h2>Account Suspension</h2>
      <p>UNIK Labs may suspend, restrict or permanently terminate accounts that:</p>
      <ul>
        <li>Repeatedly violate this policy.</li>
        <li>Engage in fraudulent behaviour.</li>
        <li>Abuse platform features.</li>
        <li>Attempt to compromise platform security.</li>
        <li>Violate applicable laws.</li>
        <li>Create significant risk to other users or the platform.</li>
      </ul>
      <p>In serious cases, accounts may be suspended without prior notice.</p>

      <h2>Reporting Abuse</h2>
      <p>If you become aware of activity that violates this Acceptable Use Policy, please report it through our support channels once they become available.</p>
      <p>We appreciate the assistance of our community in helping keep UNIK Labs safe and welcoming.</p>

      <h2>Changes to This Policy</h2>
      <p>We may update this Acceptable Use Policy from time to time.</p>
      <p>When changes are made, we will update the &ldquo;Last Updated&rdquo; date shown at the top of this page.</p>
      <p>Your continued use of UNIK Labs after changes take effect constitutes acceptance of the updated policy.</p>

      <h2>Contact Us</h2>
      <p>If you have any questions about this Acceptable Use Policy, please contact us through our official support channels.</p>
    </UnikInfoLayout>
  );
}
