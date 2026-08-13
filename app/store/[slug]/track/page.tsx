import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/supabase-admin";
import FourRegnTrackingClient from "./FourRegnTrackingClient";

export const dynamic = "force-dynamic";

export default async function TrackingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: seller } = await getAdmin().from("sellers")
    .select("subdomain, store_name, logo_url, template")
    .eq("subdomain", slug)
    .maybeSingle();
  if (!seller || seller.template !== "4regn") notFound();
  return <FourRegnTrackingClient seller={seller} />;
}
