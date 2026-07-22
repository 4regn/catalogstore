import { isStoreSubdomainRequest } from "../../../../lib/store-host";

// UNIK's footer/header links need to point at "/help", "/terms" etc. on
// unik.catalogstore.co.za (middleware already rewrites those to
// /store/unik/* internally) but at "/store/unik/help" on the legacy
// catalogstore.co.za/store/unik path form -- otherwise the /store/unik
// prefix gets applied twice and every link 404s. Mirrors the same
// subdomain-vs-path branch app/store/[slug]/layout.tsx already uses for
// the favicon URL.
export async function getUnikBasePath(): Promise<string> {
  const isSubdomain = await isStoreSubdomainRequest();
  return isSubdomain ? "" : "/store/unik";
}
