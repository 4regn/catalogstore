import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "./supabase-admin";
import { getUnikSeller } from "./unik-customer";

/* recap.html/recap-custom.html are embedded as an iframe from BOTH the
   Brand Manager dashboard and the Partner dashboard, with no auth
   plumbing of their own -- rather than pass a bearer token in over
   postMessage, this relies on the iframe being genuinely same-origin (it
   is: same Next.js app, just a different path), so whichever session
   cookie the parent page already set (unik-brand-manager-access or
   unik-partner-access) is sent automatically on every fetch the iframe
   makes with credentials:'include'. Tries brand manager first, then
   partner, and returns whichever one actually resolves to a real row --
   a stale/foreign cookie from the other role doesn't get a free pass. */
export async function requireUnikRecapCreator(req: NextRequest) {
  const seller = await getUnikSeller();
  if (!seller) {
    return { response: NextResponse.json({ error: "UNIK Labs is unavailable" }, { status: 404 }) } as const;
  }

  const admin = getAdmin();

  const bmToken = req.cookies.get("unik-brand-manager-access")?.value;
  if (bmToken) {
    const { data: userData } = await admin.auth.getUser(bmToken);
    if (userData.user) {
      const { data: manager } = await admin.from("brand_managers").select("id").eq("seller_id", seller.id).eq("auth_user_id", userData.user.id).maybeSingle();
      if (manager) return { seller, role: "brand-manager" as const, creatorId: manager.id } as const;
    }
  }

  const partnerToken = req.cookies.get("unik-partner-access")?.value;
  if (partnerToken) {
    const { data: userData } = await admin.auth.getUser(partnerToken);
    if (userData.user) {
      const { data: partner } = await admin.from("unik_partners").select("id").eq("seller_id", seller.id).eq("auth_user_id", userData.user.id).maybeSingle();
      if (partner) return { seller, role: "partner" as const, creatorId: partner.id } as const;
    }
  }

  return { response: NextResponse.json({ error: "Sign in required" }, { status: 401 }) } as const;
}
