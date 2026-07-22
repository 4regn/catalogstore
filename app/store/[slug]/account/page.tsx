import { notFound } from "next/navigation";
import { getAdmin } from "../../../../lib/supabase-admin";
import UnikAccountClient from "./UnikAccountClient";
import { getUnikBasePath } from "../_unik/getUnikBasePath";

export const dynamic = "force-dynamic";

export default async function StoreAccountPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data: seller } = await getAdmin()
    .from("sellers")
    .select("id, subdomain, store_name, template")
    .eq("subdomain", slug)
    .maybeSingle();

  if (!seller || seller.template !== "unik-labs") notFound();
  const basePath = await getUnikBasePath();
  return <UnikAccountClient storeName={seller.store_name || "UNIK Labs"} basePath={basePath} />;
}
