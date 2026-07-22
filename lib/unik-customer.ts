import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";

export const UNIK_SLUG = "unik";

export async function getUnikSeller() {
  const { data, error } = await getAdmin()
    .from("sellers")
    .select("id, subdomain, store_name, template")
    .eq("subdomain", UNIK_SLUG)
    .maybeSingle();

  if (error || !data || data.template !== "unik-labs") return null;
  return data;
}

export async function requireUnikCustomer(req: NextRequest) {
  const authorization = req.headers.get("authorization") || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  const token = bearer || req.cookies.get("unik-customer-access")?.value || "";
  if (!token) {
    return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  }

  const { data, error } = await getAdmin().auth.getUser(token);
  if (error || !data.user?.email) {
    return { response: NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 }) } as const;
  }

  const seller = await getUnikSeller();
  if (!seller) {
    return { response: NextResponse.json({ error: "UNIK Labs is unavailable" }, { status: 404 }) } as const;
  }

  return { user: data.user, seller } as const;
}
