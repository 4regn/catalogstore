import type { Metadata } from "next";
import UnikInfoLayout from "../_unik/UnikInfoLayout";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "Contact Us — UNIK Labs" };

export default async function ContactPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return (
    <UnikInfoLayout kicker="Support" title="Contact us">
      <p>
        A direct contact form is on its way. In the meantime, if your question is about an order
        you've already placed, the fastest answer is in your account — every order shows its own
        status and tracking history there.
      </p>
      <div className="ui-notice">
        Contact form coming soon. Check back here, or find your order details under your account's
        order history.
      </div>
    </UnikInfoLayout>
  );
}
