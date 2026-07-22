import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "Help Centre — UNIK Labs" };

export default async function HelpPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return (
    <UnikInfoLayout kicker="Support" title="Help centre">
      <p>A quick guide to how UNIK Labs works while our full help centre is being built out.</p>

      <h2>Creating a design</h2>
      <p>
        Use the AI Design Studio to generate artwork from a prompt, or Custom Upload to place your
        own image directly onto a garment. Both let you preview the result on the garment before
        you order.
      </p>

      <h2>AI generations</h2>
      <p>
        AI Studio generations are limited to three per rolling 24-hour window per account. Custom
        Upload has no generation limit since it doesn't use AI.
      </p>

      <h2>Accounts</h2>
      <p>
        You can sign in with Google or with an email and password. Signing in keeps your saved
        designs and order history together in one place.
      </p>

      <h2>Orders and delivery</h2>
      <p>
        All garments are printed on UNIK Labs' own T-shirts and hoodies — we don't print on
        garments customers send in. Delivery is currently available within South Africa only. Once
        an order is placed, you can track its progress from your account's order history.
      </p>

      <h2>Payments</h2>
      <p>Checkout is processed securely through Yoco.</p>
    </UnikInfoLayout>
  );
}
