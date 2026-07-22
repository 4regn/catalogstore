import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { requireUnikCustomer } from "../../../../lib/unik-customer";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUnikCustomer(req);
  if ("response" in auth) return auth.response;

  const { user, seller } = auth;
  const metadata = user.user_metadata || {};
  const fullName = String(metadata.full_name || metadata.name || "").trim() || null;
  const avatarUrl = String(metadata.avatar_url || metadata.picture || "").trim() || null;

  const { data: profile, error: profileError } = await getAdmin()
    .from("unik_customer_profiles")
    .upsert({
      seller_id: seller.id,
      auth_user_id: user.id,
      email: user.email!.toLowerCase(),
      full_name: fullName,
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString(),
    }, { onConflict: "seller_id,auth_user_id" })
    .select("id, email, full_name, avatar_url, created_at")
    .single();

  if (profileError) {
    return NextResponse.json({ error: "Customer account storage is not ready", detail: profileError.message }, { status: 503 });
  }

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const [designsResult, ordersResult, usageResult] = await Promise.all([
    getAdmin()
      .from("unik_designs")
      .select("id, source, status, name, garment, colour, size, style, options, preview_url, mockup_url, saved_at, created_at")
      .eq("seller_id", seller.id)
      .eq("auth_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(60),
    getAdmin()
      .from("orders")
      .select("id, order_number, items, total, status, payment_status, created_at")
      .eq("seller_id", seller.id)
      .eq("customer_auth_user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    getAdmin()
      .from("unik_generation_attempts")
      .select("id", { count: "exact", head: true })
      .eq("seller_id", seller.id)
      .eq("auth_user_id", user.id)
      .eq("status", "succeeded")
      .gte("created_at", since),
  ]);

  return NextResponse.json({
    profile,
    designs: designsResult.data || [],
    orders: ordersResult.data || [],
    generationLimit: { used: usageResult.count || 0, limit: 3, remaining: Math.max(0, 3 - (usageResult.count || 0)) },
  }, { headers: { "Cache-Control": "private, no-store" } });
}

