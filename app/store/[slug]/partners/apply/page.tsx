import { notFound } from "next/navigation";
import { getAdmin } from "../../../../../lib/supabase-admin";
import PartnerApplyClient from "./PartnerApplyClient";

export const dynamic = "force-dynamic";

export default async function PartnerApplyPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: seller } = await getAdmin()
    .from("sellers")
    .select("id, subdomain, store_name, template")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller || seller.template !== "unik-labs") notFound();
  return <PartnerApplyClient storeName={seller.store_name || "UNIK Labs"} />;
}
