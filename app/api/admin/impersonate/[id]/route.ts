import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { writeAudit } from "../../../../../lib/admin-audit";
import { getClientIP } from "../../../../../lib/rate-limit";

/* Lazy-init the supabase admin client so module evaluation at build time
   (Next 16 "collect page data" phase) doesn't crash when env vars aren't
   present. The runtime always has them. */
let _admin: SupabaseClient | null = null;
function admin() {
  if (_admin) return _admin;
  _admin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
  return _admin;
}

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@4regn.com";
const APP_ORIGIN = process.env.NEXT_PUBLIC_APP_URL || "https://catalogstore.co.za";

/* POST /api/admin/impersonate/[id]
   Admin-only. Mints a magic-link session for the target seller using the
   service role, returns the action_link. The browser will navigate to it,
   which signs the admin out and signs them in as the seller for the
   duration of the session.

   The admin's previous email is saved in a separate cookie (cs_admin_email)
   so the "Exit assist" flow knows who to redirect back to. The seller's
   session itself is just a normal Supabase session — no special tokens
   floating around, no parallel impersonation framework to maintain. */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  /* Authenticate the admin */
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const { data: userData, error: userErr } = await admin().auth.getUser(accessToken);
  if (userErr || !userData.user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

  const adminEmail = (userData.user.email || "").toLowerCase();
  if (adminEmail !== ADMIN_EMAIL.toLowerCase()) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id: sellerId } = await ctx.params;
  if (!sellerId) return NextResponse.json({ error: "Missing seller id" }, { status: 400 });

  /* Find the seller */
  const { data: seller, error: sellerErr } = await admin()
    .from("sellers")
    .select("id, email, store_name")
    .eq("id", sellerId)
    .single();
  if (sellerErr || !seller) return NextResponse.json({ error: "Seller not found" }, { status: 404 });
  if (!seller.email) return NextResponse.json({ error: "Seller has no email on file" }, { status: 400 });

  /* Generate a magic link that signs the seller in.
     The action_link contains the access + refresh tokens in its hash
     fragment, which the Supabase client picks up on landing. */
  const { data: link, error: linkErr } = await admin().auth.admin.generateLink({
    type: "magiclink",
    email: seller.email,
    options: {
      redirectTo: `${APP_ORIGIN}/dashboard?assisted=1`,
    },
  });

  if (linkErr || !link?.properties?.action_link) {
    console.error("[impersonate] generateLink failed", linkErr);
    return NextResponse.json({ error: "Could not generate impersonation link" }, { status: 500 });
  }

  await writeAudit({
    adminEmail,
    action: "impersonate_start",
    targetSellerId: seller.id,
    details: { sellerEmail: seller.email, storeName: seller.store_name },
    ip: getClientIP(req),
    userAgent: req.headers.get("user-agent"),
  });

  /* The response sets a cookie the client uses to recognise impersonation
     across pages. It's HttpOnly: false so the React layer can read it and
     show the banner without an extra fetch on every page load. */
  const res = NextResponse.json({
    actionLink: link.properties.action_link,
    seller: { id: seller.id, store_name: seller.store_name, email: seller.email },
    adminEmail,
  });
  res.cookies.set("cs_impersonating", seller.id, {
    path: "/",
    sameSite: "lax",
    secure: APP_ORIGIN.startsWith("https://"),
    maxAge: 60 * 60 * 8, // 8 hours
  });
  res.cookies.set("cs_admin_email", adminEmail, {
    path: "/",
    sameSite: "lax",
    secure: APP_ORIGIN.startsWith("https://"),
    maxAge: 60 * 60 * 8,
  });
  return res;
}
