import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";
import { fetchAllRows } from "../../../../lib/fetch-all-rows";

export const dynamic = "force-dynamic";

// Same auth shape as /api/dashboard/analytics and /api/dashboard/flash-cap-analytics.
type WishlistRow = { product_id: string; account_id: string; created_at: string };
type WishlistEventRow = { visitor_id: string; event_metadata: { productId?: string } | null };

export async function POST(req: NextRequest) {
  try {
    const { access_token } = await req.json();
    if (!access_token) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userErr } = await admin.auth.getUser(access_token);
    if (userErr || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
    const sellerId = userData.user.id;

    // customer_wishlist_items only exists for visitors signed into a
    // customer account -- toggling the heart icon while signed out still
    // saves locally in the visitor's own browser but never reaches this
    // table. wishlist_added/wishlist_removed events (fired for every
    // visitor regardless of account status) are the only server-side
    // record of that anonymous activity, so both sources are combined
    // below rather than trusting customer_wishlist_items as the full picture.
    const [rows, eventRows] = await Promise.all([
      fetchAllRows<WishlistRow>(
        admin,
        "customer_wishlist_items",
        "product_id, account_id, created_at",
        (q) => q.eq("seller_id", sellerId).order("created_at", { ascending: false })
      ),
      fetchAllRows<WishlistEventRow>(
        admin,
        "store_visitor_events",
        "visitor_id, event_metadata",
        (q) => q.eq("seller_id", sellerId).eq("event_type", "wishlist_added")
      ),
    ]);

    if (rows.length === 0 && eventRows.length === 0) {
      return NextResponse.json({
        ok: true,
        totals: { totalSaves: 0, uniqueProducts: 0, uniqueCustomers: 0, allVisitorAdds: 0, allVisitorUniqueVisitors: 0 },
        products: [],
      });
    }

    const eventsByProduct = new Map<string, { visitorIds: Set<string>; count: number }>();
    const allVisitorIds = new Set<string>();
    for (const row of eventRows) {
      const productId = row.event_metadata?.productId;
      allVisitorIds.add(row.visitor_id);
      if (!productId) continue;
      if (!eventsByProduct.has(productId)) eventsByProduct.set(productId, { visitorIds: new Set(), count: 0 });
      const entry = eventsByProduct.get(productId)!;
      entry.count += 1;
      entry.visitorIds.add(row.visitor_id);
    }

    const productIds = [...new Set([...rows.map((r) => r.product_id), ...eventsByProduct.keys()])];
    const accountIds = [...new Set(rows.map((r) => r.account_id))];

    const [productsResult, accountsResult] = await Promise.all([
      admin.from("products").select("id, name, price, old_price, image_url, handle, in_stock").in("id", productIds),
      admin.from("customer_accounts").select("id, email, customers(first_name, last_name, email, phone)").eq("seller_id", sellerId).in("id", accountIds),
    ]);
    const productById = new Map((productsResult.data || []).map((p: any) => [p.id, p]));
    const accountById = new Map((accountsResult.data || []).map((a: any) => [a.id, a]));

    const byProduct = new Map<string, WishlistRow[]>();
    for (const row of rows) {
      if (!byProduct.has(row.product_id)) byProduct.set(row.product_id, []);
      byProduct.get(row.product_id)!.push(row);
    }

    const products = productIds
      .map((productId) => {
        const product = productById.get(productId);
        const productRows = byProduct.get(productId) || [];
        const savers = productRows
          .map((row) => {
            const account: any = accountById.get(row.account_id);
            const customer = account?.customers;
            const name = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") : "";
            return { name: name || null, email: customer?.email || account?.email || null, phone: customer?.phone || null, savedAt: row.created_at };
          })
          .sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
        const eventEntry = eventsByProduct.get(productId);
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
          lastSavedAt: productRows.reduce((latest, r) => (r.created_at > latest ? r.created_at : latest), productRows[0]?.created_at || ""),
          savers,
          allVisitorAdds: eventEntry?.count || 0,
          allVisitorUniqueVisitors: eventEntry?.visitorIds.size || 0,
        };
      })
      .sort((a, b) => (b.allVisitorAdds || b.saveCount) - (a.allVisitorAdds || a.saveCount));

    return NextResponse.json({
      ok: true,
      totals: {
        totalSaves: rows.length,
        uniqueProducts: productIds.length,
        uniqueCustomers: accountIds.length,
        allVisitorAdds: eventRows.length,
        allVisitorUniqueVisitors: allVisitorIds.size,
      },
      products,
    });
  } catch (e: any) {
    console.error("Wishlist analytics fetch error:", e);
    return NextResponse.json({ error: e.message || "Internal error" }, { status: 500 });
  }
}
