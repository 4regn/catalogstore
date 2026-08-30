import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";

export const dynamic = "force-dynamic";

// Same auth shape as /api/dashboard/analytics and /api/dashboard/flash-cap-analytics.
type WishlistRow = { product_id: string; account_id: string; created_at: string };

export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const sellerId = userData.user.id;

    const rows = await fetchAllRows<WishlistRow>(
      admin,
      "customer_wishlist_items",
      "product_id, account_id, created_at",
      (q) => q.eq("seller_id", sellerId).order("created_at", { ascending: false })
    );

    if (rows.length === 0) {
      return NextResponse.json({ ok: true, totals: { totalSaves: 0, uniqueProducts: 0, uniqueCustomers: 0 }, products: [] });
    }

    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const accountIds = [...new Set(rows.map((r) => r.account_id))];

    const [productsResult, accountsResult] = await Promise.all([
      admin.from("products").select("id, name, price, old_price, image_url, handle, in_stock").in("id", productIds),
      admin.from("customer_accounts").select("id, email, customers(first_name, last_name, email, phone)").eq("seller_id", sellerId).in("id", accountIds),
    ]);
    const productById = new Map((productsResult.data || []).map((p: any) => [p.id, p]));
    const accountById = new Map((accountsResult.data || []).map((a: any) => [a.id, a]));

    const byProduct = new Map<string, { rows: WishlistRow[] }>();
    for (const row of rows) {
      if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, { rows: [] });
      byProduct.get(row.product_id)!.rows.push(row);
    }

    const products = [...byProduct.entries()]
      .map(([productId, { rows: productRows }]) => {
        const product = productById.get(productId);
        const savers = productRows
          .map((row) => {
            const account: any = accountById.get(row.account_id);
            const customer = account?.customers;
            const name = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : "";
            return { name: name || null, email: customer?.email || account?.email || null, phone: customer?.phone || null, savedAt: row.created_at };
          })
          .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
        return {
          productId,
          name: product?.name || "Deleted product",
          price: product?.price ?? null,
          oldPrice: product?.old_price ?? null,
          imageUrl: product?.image_url ?? null,
          handle: product?.handle ?? null,
          inStock: product?.in_stock ?? null,
          saveCount: productRows.length,
          uniqueCustomers: new Set(productRows.map((r) => r.account_id)).size,
          lastSavedAt: productRows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), productRows[0].created_at),
          savers,
        };
      })
      .sort((a, b) => b.saveCount - a.saveCount);

    return NextResponse.json({
      ok: true,
      totals: { totalSaves: rows.length, uniqueProducts: productIds.length, uniqueCustomers: accountIds.length },
      products,
    });
  } catch (e: any) {
    console.error("Wishlist analytics fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
