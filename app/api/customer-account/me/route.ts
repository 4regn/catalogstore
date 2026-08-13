import { NextRequest, NextResponse } from "next/server";
import { requireCustomerAccount } from "../../../../lib/customer-account";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get("slug") || "";
  const auth = await requireCustomerAccount(req, slug);
  if ("response" in auth) return auth.response;
  const admin = getAdmin();
  const [customerResult, ordersResult, wishlistResult] = await Promise.all([
    admin.from("customers").select("id, first_name, last_name, email, phone, created_at").eq("id", auth.account.customer_id).single(),
    admin.from("orders").select("id, order_number, external_id, items, total, status, payment_status, shipping_option, shipping_address, created_at").eq("seller_id", auth.seller.id).eq("customer_id", auth.account.customer_id).order("created_at", { ascending: false }).limit(50),
    admin.from("customer_wishlist_items").select("product_id, created_at, products(id, name, price, old_price, image_url, handle, in_stock, category)").eq("account_id", auth.account.id).order("created_at", { ascending: false }),
  ]);
  if (customerResult.error) return NextResponse.json({ error: "Could not load customer account" }, { status: 500 });
  return NextResponse.json({
    customer: customerResult.data,
    orders: ordersResult.data || [],
    wishlist: (wishlistResult.data || []).map((row: any) => row.products).filter(Boolean),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
