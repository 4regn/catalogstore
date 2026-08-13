import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "crypto";
import { promisify } from "util";
import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";

const scrypt = promisify(scryptCallback);
export const CUSTOMER_SESSION_COOKIE = "catalog-customer-session";

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export async function hashCustomerPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt:${salt}:${derived.toString("hex")}`;
}

export async function verifyCustomerPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, salt, expectedHex] = String(stored || "").split(":");
  if (algorithm !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function hashAccountCode(code: string, sellerId: string, email: string) {
  return sha256(`${sellerId}:${email.toLowerCase()}:${code}`);
}

export async function createCustomerSession(accountId: string, sellerId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await getAdmin().from("customer_account_sessions").insert({
    account_id: accountId,
    seller_id: sellerId,
    token_hash: sha256(token),
    expires_at: expiresAt.toISOString(),
  });
  return { token, expiresAt };
}

export function setCustomerSessionCookie(response: NextResponse, token: string, expiresAt: Date) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export function clearCustomerSessionCookie(response: NextResponse) {
  response.cookies.set(CUSTOMER_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

export async function requireCustomerAccount(req: NextRequest, slug?: string) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE)?.value || "";
  if (!token) return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
  const admin = getAdmin();
  const { data: session } = await admin
    .from("customer_account_sessions")
    .select("id, account_id, seller_id, expires_at")
    .eq("token_hash", sha256(token))
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (!session) {
    const response = NextResponse.json({ error: "Your session has expired" }, { status: 401 });
    clearCustomerSessionCookie(response);
    return { response } as const;
  }
  const { data: seller } = await admin.from("sellers").select("id, subdomain, store_name, logo_url, template").eq("id", session.seller_id).maybeSingle();
  if (!seller || (slug && seller.subdomain !== slug)) return { response: NextResponse.json({ error: "Sign in required for this store" }, { status: 401 }) } as const;
  const { data: account } = await admin.from("customer_accounts").select("id, customer_id, email, activated_at").eq("id", session.account_id).maybeSingle();
  if (!account?.activated_at) return { response: NextResponse.json({ error: "Account activation required" }, { status: 401 }) } as const;
  return { session, seller, account } as const;
}

