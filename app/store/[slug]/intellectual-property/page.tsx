import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const metadata: Metadata = { title: "Intellectual Property Policy — UNIK Labs" };

export default async function IntellectualPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  const basePath = await getUnikBasePath();
  return (
    <UnikInfoLayout kicker="Legal" title="Intellectual Property Policy" lastUpdated="July 2026" basePath={basePath}>
      <p>UNIK Labs respects the intellectual property rights of creators, artists, businesses and copyright holders.</p>
      <p>
        This Intellectual Property Policy explains ownership of content created and uploaded
        through our platform, as well as the responsibilities of all users.
      </p>
      <p>By using UNIK Labs, you agree to comply with this policy.</p>

      <h2>Our Approach</h2>
      <p>UNIK Labs exists to help people create original custom apparel through artificial intelligence and custom printing.</p>
      <p>We believe creators should have confidence in the work they produce while respecting the rights of others.</p>
      <p>For that reason, users remain responsible for the content they upload and how they use the designs they create.</p>

      <h2>Your Uploaded Content</h2>
      <p>You retain ownership of any images, artwork, logos, photographs or other content that you upload to UNIK Labs.</p>
      <p>By uploading content, you confirm that:</p>
      <ul>
        <li>You own the content; or</li>
        <li>You have obtained all necessary permissions, licences or rights to use it.</li>
      </ul>
      <p>You are solely responsible for ensuring that your uploaded content does not infringe the intellectual property rights of any third party.</p>
      <p>UNIK Labs does not verify ownership of uploaded content before processing it.</p>

      <h2>AI-Generated Designs</h2>
      <p>Designs generated through the UNIK Labs AI Design Studio are created using your inputs together with our AI-powered design technology.</p>
      <p>Unless otherwise required by applicable law, you retain the rights to the AI-generated designs you create using UNIK Labs.</p>
      <p>You may use your generated designs for:</p>
      <ul>
        <li>Personal use</li>
        <li>Commercial use</li>
        <li>Printing</li>
        <li>Merchandise</li>
        <li>Clothing brands</li>
        <li>Marketing materials</li>
      </ul>
      <p>However, you remain responsible for ensuring that your final design does not infringe the rights of another person or organisation.</p>

      <h2>Commercial Use</h2>
      <p>UNIK Labs permits customers to use their generated designs commercially.</p>
      <p>This includes selling products featuring your generated artwork.</p>
      <p>Before using a design commercially, you should ensure that:</p>
      <ul>
        <li>You have permission to use any uploaded material.</li>
        <li>Your design does not copy or closely imitate another protected work.</li>
        <li>Your design does not infringe another person&rsquo;s copyright, trademark or other intellectual property rights.</li>
      </ul>
      <p>UNIK Labs cannot provide legal advice regarding intellectual property ownership or infringement.</p>

      <h2>Similar AI Outputs</h2>
      <p>Artificial intelligence may occasionally generate designs that contain similarities to other artwork or to designs created by other users.</p>
      <p>UNIK Labs does not guarantee that every AI-generated design will be completely unique.</p>
      <p>Users are responsible for reviewing their generated designs before using them commercially or submitting them for production.</p>

      <h2>Trademarks and Copyrighted Material</h2>
      <p>Users may upload trademarks, logos or copyrighted material only if they have the legal right or permission to use that content.</p>
      <p>You must not upload content in a way that infringes another person&rsquo;s intellectual property rights or violates applicable laws.</p>
      <p>If you are unsure whether you have permission to use particular content, you should not upload or print it.</p>

      <h2>UNIK Labs Intellectual Property</h2>
      <p>While users retain ownership of their uploaded content and generated designs, UNIK Labs retains all rights, title and interest in its own intellectual property.</p>
      <p>This includes, but is not limited to:</p>
      <ul>
        <li>The UNIK Labs name</li>
        <li>Logos</li>
        <li>Branding</li>
        <li>Website design</li>
        <li>Software</li>
        <li>Source code</li>
        <li>AI workflows</li>
        <li>Design templates</li>
        <li>User interface</li>
        <li>Platform features</li>
        <li>Documentation</li>
        <li>Original written content</li>
        <li>Graphics created by UNIK Labs</li>
      </ul>
      <p>Nothing in this policy transfers ownership of UNIK Labs&rsquo; intellectual property to users.</p>

      <h2>AI Model Training</h2>
      <p>UNIK Labs does not use customer-uploaded images or AI-generated designs to train artificial intelligence models.</p>
      <p>Your content is processed solely to provide the services you request.</p>

      <h2>Copyright Complaints</h2>
      <p>If you believe that content created or available through UNIK Labs infringes your intellectual property rights, please contact us once our official support channels become available.</p>
      <p>To help us investigate your request, please include:</p>
      <ul>
        <li>Your name and contact details</li>
        <li>A description of the copyrighted work</li>
        <li>The location of the allegedly infringing content</li>
        <li>Evidence supporting your claim</li>
        <li>A statement confirming that the information provided is accurate</li>
      </ul>
      <p>We will investigate all legitimate intellectual property complaints and take appropriate action where necessary.</p>

      <h2>Repeat Infringement</h2>
      <p>UNIK Labs reserves the right to suspend or permanently terminate accounts that repeatedly infringe the intellectual property rights of others or repeatedly violate this policy.</p>

      <h2>Changes to This Policy</h2>
      <p>We may update this Intellectual Property Policy from time to time.</p>
      <p>When changes are made, we will update the &ldquo;Last Updated&rdquo; date at the top of this page.</p>
      <p>Your continued use of UNIK Labs after changes become effective constitutes acceptance of the updated policy.</p>

      <h2>Contact Us</h2>
      <p>If you have questions regarding this Intellectual Property Policy, please contact us through our official support channels.</p>
    </UnikInfoLayout>
  );
}
