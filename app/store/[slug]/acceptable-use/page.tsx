import type { Metadata } from "next";
import LegalPlaceholder from "../_unik/LegalPlaceholder";
import { requireUnikSlug } from "../_unik/requireUnikSlug";

export const metadata: Metadata = { title: "Acceptable Use Policy — UNIK Labs" };

export default async function AcceptableUsePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  requireUnikSlug(slug);
  return <LegalPlaceholder title="Acceptable Use Policy" />;
}
