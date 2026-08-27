import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../lib/supabase-admin";

export const dynamic = "force-dynamic";

type Audience = "all" | "email" | "sms" | "both";

const CUSTOMER_COLUMNS = [
  "id",
  "external_id",
  "first_name",
  "last_name",
  "email",
  "phone",
  "accepts_email_marketing",
  "accepts_sms_marketing",
  "marketing_consent_updated_at",
  "total_spent",
  "total_orders",
  "tags",
  "source",
  "created_at",
].join(",");

function applyAudience<T extends { eq: (column: string, value: unknown) => T; not: (column: string, operator: string, value: unknown) => T }>(query: T, audience: Audience) {
  if (audience === "email" || audience === "both") {
    query = query.eq("accepts_email_marketing", true).not("email", "is", null);
  }
  if (audience === "sms" || audience === "both") {
    query = query.eq("accepts_sms_marketing", true).not("phone", "is", null);
  }
  return query;
}

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const accessToken = typeof body.access_token === "string" ? body.access_token : "";
    if (!accessToken) return NextResponse.json({ error: "Missing access_token" }, { status: 400 });

    const admin = getAdmin();
    const { data: userData, error: userError } = await admin.auth.getUser(accessToken);
    if (userError || !userData.user) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

    const sellerId = userData.user.id;
    const audience: Audience = ["email", "sms", "both"].includes(body.audience) ? body.audience : "all";
    const search = typeof body.search === "string"
      ? body.search.trim().slice(0, 100).replace(/[,%()]/g, " ")
      : "";
    const exportCsv = body.format === "csv";

    if (exportCsv && audience === "all") {
      return NextResponse.json({ error: "Choose an opted-in email, SMS or combined audience before exporting." }, { status: 400 });
    }

    const countQuery = (kind: Audience) => {
      let query: any = admin.from("customers").select("id", { count: "exact", head: true }).eq("seller_id", sellerId);
      query = applyAudience(query, kind);
      return query;
    };

    const [totalResult, emailResult, smsResult, bothResult] = await Promise.all([
      countQuery("all"),
      countQuery("email"),
      countQuery("sms"),
      countQuery("both"),
    ]);
    const countError = totalResult.error || emailResult.error || smsResult.error || bothResult.error;
    if (countError) throw countError;

    if (exportCsv) {
      let exportQuery: any = admin
        .from("customers")
        .select(CUSTOMER_COLUMNS)
        .eq("seller_id", sellerId)
        .order("created_at", { ascending: false })
        .limit(10000);
      exportQuery = applyAudience(exportQuery, audience);
      const { data, error } = await exportQuery;
      if (error) throw error;

      const rows = (data || []).map((customer: any) => [
        customer.first_name,
        customer.last_name,
        customer.email,
        customer.phone,
        customer.accepts_email_marketing ? "yes" : "no",
        customer.accepts_sms_marketing ? "yes" : "no",
        customer.marketing_consent_updated_at,
        customer.source,
      ].map(csvCell).join(","));
      const csv = [
        ["First Name", "Last Name", "Email", "Phone", "Email Marketing Consent", "SMS Marketing Consent", "Consent Updated At", "Consent Source"].map(csvCell).join(","),
        ...rows,
      ].join("\r\n");

      return new NextResponse(`\uFEFF${csv}`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="catalogstore-${audience}-marketing-audience.csv"`,
          "Cache-Control": "private, no-store",
        },
      });
    }

    const page = Math.max(1, Math.floor(Number(body.page) || 1));
    const pageSize = Math.min(100, Math.max(10, Math.floor(Number(body.page_size) || 50)));
    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;

    let customersQuery: any = admin
      .from("customers")
      .select(CUSTOMER_COLUMNS, { count: "exact" })
      .eq("seller_id", sellerId)
      .order("created_at", { ascending: false })
      .range(from, to);
    customersQuery = applyAudience(customersQuery, audience);
    if (search) {
      const pattern = `%${search.replace(/[%_]/g, "")}%`;
      customersQuery = customersQuery.or(`first_name.ilike.${pattern},last_name.ilike.${pattern},email.ilike.${pattern},phone.ilike.${pattern},external_id.ilike.${pattern}`);
    }

    const { data: customers, count, error } = await customersQuery;
    if (error) throw error;

    return NextResponse.json({
      ok: true,
      customers: customers || [],
      counts: {
        total: totalResult.count || 0,
        email: emailResult.count || 0,
        sms: smsResult.count || 0,
        both: bothResult.count || 0,
      },
      pagination: {
        page,
        pageSize,
        total: count || 0,
        pages: Math.max(1, Math.ceil((count || 0) / pageSize)),
      },
    }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error: any) {
    console.error("Dashboard customers fetch error:", error);
    return NextResponse.json({ error: error?.message || "Could not load customers" }, { status: 500 });
  }
}
