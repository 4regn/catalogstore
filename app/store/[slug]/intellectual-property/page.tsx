import type { Metadata } from "next";
import LegalPlaceholder from "../_unik/LegalPlaceholder";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "Intellectual Property Policy — UNIK Labs" };

export default async function IntellectualPropertyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return <LegalPlaceholder title="Intellectual Property Policy" />;
}
