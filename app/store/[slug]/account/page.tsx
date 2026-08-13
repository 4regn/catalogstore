import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/supabase-admin";
import UnikAccountClient from "./UnikAccountClient";
import FourRegnAccountClient from "./FourRegnAccountClient";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const dynamic = "force-dynamic";

export default async function StoreAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: seller } = await getAdmin()
    .from("sellers")
    .select("id, subdomain, store_name, template, logo_url")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller) notFound();
  if (seller.template === "4regn") return <FourRegnAccountClient seller={seller} />;
  if (seller.template !== "unik-labs") notFound();
  const basePath = await getUnikBasePath();
  return <UnikAccountClient storeName={seller.store_name || "UNIK Labs"} basePath={basePath} />;
}
