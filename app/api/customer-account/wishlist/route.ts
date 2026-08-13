import { NextRequest, NextResponse } from "next/server";
import { requireCustomerAccount } from "../../../../lib/customer-account";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireCustomerAccount(req, req.nextUrl.searchParams.get("slug") || "");
  if ("response" in auth) return auth.response;
  const { data } = await getAdmin().from("customer_wishlist_items").select("product_id").eq("account_id", auth.account.id);
  return NextResponse.json({ productIds: (data || []).map((row) => row.product_id) }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(req: NextRequest) {
  let body: { slug?: string; productId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const auth = await requireCustomerAccount(req, String(body.slug || ""));
  if ("response" in auth) return auth.response;
  const productId = String(body.productId || "");
  const { data: product } = await getAdmin().from("products").select("id").eq("id", productId).eq("seller_id", auth.seller.id).maybeSingle();
  if (!product) return NextResponse.json({ error: "Product not found" }, { status: 404 });
  const { error } = await getAdmin().from("customer_wishlist_items").upsert({ account_id: auth.account.id, seller_id: auth.seller.id, product_id: product.id }, { onConflict: "account_id,product_id" });
  if (error) return NextResponse.json({ error: "Could not save wishlist" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  let body: { slug?: string; productId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request" }, { status: 400 }); }
  const auth = await requireCustomerAccount(req, String(body.slug || ""));
  if ("response" in auth) return auth.response;
  await getAdmin().from("customer_wishlist_items").delete().eq("account_id", auth.account.id).eq("product_id", String(body.productId || ""));
  return NextResponse.json({ ok: true });
}
