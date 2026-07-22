import type { Metadata } from "next";
import LegalPlaceholder from "../_unik/LegalPlaceholder";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "Terms of Service — UNIK Labs" };

export default async function TermsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return <LegalPlaceholder title="Terms of Service" />;
}
