import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "../../../../../../lib/supabase-admin";
import { requireSetlaAdmin } from "../../../../../../lib/setla-admin";

export const dynamic = "force-dynamic";

const BUCKET = "setla-private-documents";

/* Same signed-URL-proxy pattern as app/api/unik/brand-manager/customers/
   download/route.ts: a short-lived (60s) signed URL is generated fresh
   per request and never handed to the browser directly -- this route
   fetches it server-side and streams the bytes back itself, so the raw
   storage path/signed URL never leaves the server. Any active SETLA
   admin can view any customer's documents (that's the review queue's
   entire purpose); there's no customer_id-scoping check here the way
   the customer-facing equivalent has, since this is an admin-only route. */
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireSetlaAdmin(req);
  if ("response" in auth) return auth.response;
  const { id } = await ctx.params;

  const admin = getAdmin();
  const { data: doc, error } = await admin.from("setla_documents").select("id, storage_path, document_type").eq("id", id).maybeSingle();
  if (error || !doc) return NextResponse.json({ error: "Document not found" }, { status: 404 });

  const { data: signed, error: signErr } = await admin.storage.from(BUCKET).createSignedUrl(doc.storage_path, 60);
  if (signErr || !signed) return NextResponse.json({ error: "Could not access this document" }, { status: 500 });

  const fileRes = await fetch(signed.signedUrl);
  if (!fileRes.ok) return NextResponse.json({ error: "Could not load this document" }, { status: 502 });
  const bytes = await fileRes.arrayBuffer();
  const contentType = fileRes.headers.get("content-type") || "application/octet-stream";
  // storage_path may or may not carry a file extension (newer uploads go
  // straight from the browser to Storage and are saved extension-less --
  // see app/api/setla/apply/start), so the filename extension is derived
  // from the real content-type instead of parsed off the path.
  const ext = contentType === "application/pdf" ? "pdf" : contentType === "image/png" ? "png" : "jpg";

  return new NextResponse(bytes, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename="${doc.document_type}-${doc.id}.${ext}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
