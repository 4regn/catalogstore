import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "FAQs — UNIK Labs" };

export default async function FaqPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return (
    <UnikInfoLayout kicker="Support" title="Frequently asked questions">
      <h2>Do I need an account to order?</h2>
      <p>
        Yes. You can sign in with Google or with an email and password — it only takes a moment,
        and it's what lets you see your saved designs and order history afterwards.
      </p>

      <h2>How many AI designs can I generate?</h2>
      <p>
        Three AI generations per rolling 24-hour window are included per account. We're planning a
        credit-based option for higher volume in the future, but it isn't live yet.
      </p>

      <h2>Can I upload my own design instead of using AI?</h2>
      <p>Yes — Custom Upload lets you place your own image directly onto a garment, no AI involved.</p>

      <h2>What garments can I order?</h2>
      <p>
        T-shirts and hoodies, printed on UNIK Labs' own garments. We don't print on garments you
        send us. Plain (unprinted) garments are planned for the future.
      </p>

      <h2>Where do you deliver?</h2>
      <p>Delivery is currently available within South Africa only, to all major cities and towns.</p>

      <h2>How do I pay?</h2>
      <p>Checkout is processed securely through Yoco.</p>

      <h2>How do I track my order?</h2>
      <p>Sign in to your account and open Order History — every order shows its current status.</p>
    </UnikInfoLayout>
  );
}
