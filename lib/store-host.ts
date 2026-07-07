import { headers } from "next/headers";
import { isSubdomainHost } from "./store-url";

// Server-component-only: tells the storefront route handlers whether this
// specific request arrived via mystore.catalogstore.co.za (subdomain) or
// the legacy catalogstore.co.za/store/mystore path form, so they can pass
// the right link-building mode down to the template components.
export async function isStoreSubdomainRequest(): Promise<boolean> {
  const host = (await headers()).get("host") || "";
  return isSubdomainHost(host.split(":")[0]);
}
