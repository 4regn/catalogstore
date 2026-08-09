import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getAdmin } from "../../../../../../lib/supabase-admin";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL || "info@4regn.com";

/* Admin assist storage uploads.
   The browser supabase client uses the admin's auth.uid(), which usually
   doesn't satisfy storage RLS like "path must start with auth.uid()". This
   endpoint accepts an upload from the admin, verifies admin via the session,
   and writes to the seller's storage path using the service role. */

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_SUFFIXES = new Set([
  "logo", "banner", "hero_image", "about_image",
  "promise_0", "promise_1", "promise_2", "promise_3",
]);

async function requireAdmin(req: NextRequest) {
  const cookieStore = await cookies();
  const accessToken =
    cookieStore.get("sb-access-token")?.value ||
    req.headers.get("authorization")?.replace("Bearer ", "");
  if (!accessToken) return { ok: false as const, res: NextResponse.json({ error: "Not authenticated" }, { status: 401 }) };
  const { data, error } = await getAdmin().auth.getUser(accessToken);
  if (error || !data.user) return { ok: false as const, res: NextResponse.json({ error: "Invalid session" }, { status: 401 }) };
  if ((data.user.email || "").toLowerCase() !== ADMIN_EMAIL.toLowerCase()) {
    return { ok: false as const, res: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }
  return { ok: true as const };
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(req);
  if (!auth.ok) return auth.res;

  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: "Missing seller id" }, { status: 400 });

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = (form?.get("kind") || "").toString();

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }
  if (!ALLOWED_SUFFIXES.has(kind)) {
    return NextResponse.json({ error: "Invalid upload kind" }, { status: 400 });
  }
  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "File must be an image" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image must be 5MB or smaller" }, { status: 400 });
  }

  const ext = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = kind === "logo"
    ? `logos/${id}-${Date.now()}.${ext}`
    : `${id}/${kind}.${ext}`;

  const arrayBuf = await file.arrayBuffer();
  const { error: upErr } = await getAdmin().storage
    .from("store-assets")
    .upload(path, arrayBuf, {
      upsert: true,
      contentType: file.type,
      // Real PageSpeed trace showed this bucket's default 1h Cache-Control
      // on a live logo -- only safe to lengthen for "logo" here, since its
      // path is already Date.now()-suffixed (every upload gets a brand new
      // URL, so a long cache can never serve stale bytes). "banner" reuses
      // a stable `${id}/${kind}.${ext}` path across re-uploads (upsert
      // overwrites in place) -- caching that long would show visitors an
      // old banner for up to a year after a seller changes it, so it's left
      // on the bucket default until that path scheme also gets a
      // per-upload-unique suffix.
      ...(kind === "logo" ? { cacheControl: "31536000" } : {}),
    });

  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const { data } = getAdmin().storage.from("store-assets").getPublicUrl(path);
  return NextResponse.json({ url: data.publicUrl });
}
