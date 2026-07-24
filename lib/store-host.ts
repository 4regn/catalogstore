import { headers } from "next/headers";
import { usesCleanStorePaths } from "./store-url";

// Server-component-only: tells the storefront route handlers whether this
// specific request can use clean, relative in-app links -- true for
// mystore.catalogstore.co.za (subdomain) and any seller's connected custom
// domain, false for the legacy catalogstore.co.za/store/mystore path form,
// localhost, and preview URLs -- so they can pass the right link-building
// mode down to the template components. (Name kept for the existing call
// sites; see usesCleanStorePaths()'s own comment for why this now covers
// custom domains too, not just subdomains.)
export async function isStoreSubdomainRequest(): Promise<boolean> {
  const host = (await headers()).get("host") || "";
  return usesCleanStorePaths(host.split(":")[0]);
}
