import type { Metadata } from "next";
import LegalPlaceholder from "../_unik/LegalPlaceholder";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "Privacy Policy — UNIK Labs" };

export default async function PrivacyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return <LegalPlaceholder title="Privacy Policy" />;
}
