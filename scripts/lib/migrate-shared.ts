// Shared plumbing for the scripts/migrate-4regn-*.ts family: env loading,
// CSV parsing, and seller resolution. Extracted once three scripts needed
// it identically (products/customers/orders are separate files in a real
// Shopify export) -- not worth it for a single script, worth it for three.

import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

// .env.local loader -- Next loads this automatically for `next dev`/`next
// build`; a bare `tsx` script does not, and this repo has no `dotenv`
// dependency to reach for instead. Minimal KEY=VALUE parser; real env vars
// already set always win.
export function loadDotEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return;
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}

// PostgREST applies its own default row cap (commonly 1000) to any select
// with no explicit .limit() -- confirmed in practice: a real seller with
// ~2,032 products got a silently-truncated read of the products table via
// --resume-images's source_url lookup, causing ~1,030 genuinely-existing
// products to register as "not found" even though they were already
// correctly imported. .range() pages through in fixed-size chunks so the
// full row set always comes back regardless of the project's row cap.
export async function fetchAllRows<T>(admin: SupabaseClient, table: string, columns: string, filter: (q: any) => any, pageSize = 1000): Promise<T[]> {
  const all: T[] = [];
  let from = 0;
  while (true) {
    const { data, error } = await withTimeout<{ data: any[] | null; error: any }>(
      filter(admin.from(table).select(columns)).range(from, from + pageSize - 1),
      `fetch ${table} rows ${from}-${from + pageSize - 1}`
    );
    if (error) throw new Error(`Fetching "${table}" failed at offset ${from}: ${error.message}`);
    all.push(...((data as T[]) || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

// This codebase's own live checkout route (app/api/checkout/place-order/
// route.ts) already has to defensively handle "Could not find the 'X'
// column of 'orders' in the schema cache" -- not every Supabase project
// this code runs against has every historical migration applied, so
// optional columns like subtotal/discount_code/shipping_option aren't
// guaranteed to exist. Confirmed in practice against 4regn's project,
// which is missing several of them. Probes once up front (rather than
// place-order's per-request tiered retry, which doesn't fit a batched
// import) so every row in a run consistently includes only columns that
// actually exist, instead of failing batch after batch on the same error.
export async function probeExistingColumns(admin: SupabaseClient, table: string, candidates: string[]): Promise<Set<string>> {
  let remaining = [...candidates];
  while (remaining.length > 0) {
    const { error } = await admin.from(table).select(remaining.join(",")).limit(1);
    if (!error) return new Set(remaining);
    // Two different error shapes turn up in practice for the same
    // underlying problem: PostgREST's own schema-cache message, and a raw
    // (optionally table-qualified) Postgres "column does not exist" --
    // confirmed both occur against the same table depending on how many
    // missing columns are in one .select() at once.
    const match =
      error.message.match(/Could not find the '([^']+)' column/) ||
      error.message.match(/column\s+(?:[\w"]+\.)?"?(\w+)"?\s+does not exist/i);
    if (!match) {
      console.error(`Warning: couldn't probe optional columns on "${table}" (${error.message}) -- proceeding without any of: ${remaining.join(", ")}`);
      return new Set();
    }
    remaining = remaining.filter((c) => c !== match[1]);
  }
  return new Set();
}

export function getAdminClient(): SupabaseClient {
  loadDotEnvLocal();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (set them in the environment or .env.local).");
    process.exit(1);
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

export type CliArgs = {
  csv: string;
  seller: string;
  dryRun: boolean;
  force: boolean;
  limit: number | null;
  sourceDomain: string | null;
  resumeImages: boolean;
  concurrency: number;
};

export function parseArgs(usage: string): CliArgs {
  const out: Partial<CliArgs> = { dryRun: false, force: false, limit: null, sourceDomain: null, resumeImages: false, concurrency: 4 };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg === "--resume-images") out.resumeImages = true;
    else if (arg.startsWith("--csv=")) out.csv = arg.slice("--csv=".length);
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--limit=")) out.limit = parseInt(arg.slice("--limit=".length), 10);
    else if (arg.startsWith("--source-domain=")) out.sourceDomain = arg.slice("--source-domain=".length).replace(/\/$/, "");
    else if (arg.startsWith("--concurrency=")) out.concurrency = parseInt(arg.slice("--concurrency=".length), 10);
  }
  if (!out.csv || !out.seller) {
    console.error(usage);
    process.exit(1);
  }
  return out as CliArgs;
}

export async function resolveSeller(admin: SupabaseClient, sellerArg: string) {
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sellerArg);
  const { data: seller, error } = await admin
    .from("sellers")
    .select("id, email, subdomain, subscription_status, collections")
    .eq(isUuid ? "id" : "email", sellerArg)
    .maybeSingle();
  if (error || !seller) {
    console.error(`Could not find a seller matching "${sellerArg}": ${error?.message || "no matching row"}`);
    process.exit(1);
  }
  console.log(`Seller: ${seller.email} (${seller.subdomain}), plan status: ${seller.subscription_status}`);
  return seller;
}

export function readCsv(csvArg: string): { lines: string[]; header: string[] } {
  const csvPath = resolve(process.cwd(), csvArg);
  if (!existsSync(csvPath)) {
    console.error(`CSV file not found: ${csvPath}`);
    process.exit(1);
  }
  // Node's utf8 decoding doesn't strip a leading byte-order-mark -- left
  // in place, it silently corrupts the first header cell (e.g. "ID"
  // becomes "﻿ID"), breaking every col()/makeCol() lookup against it.
  // Confirmed present on a real Matrixify export.
  const text = readFileSync(csvPath, "utf8").replace(/^﻿/, "");
  const lines = splitCsvRows(text);
  if (lines.length < 2) {
    console.error("CSV must have a header row and at least one data row.");
    process.exit(1);
  }
  const rawHeader = parseCsvLine(lines[0]);
  const header = rawHeader.map((h) => h.toLowerCase().replace(/"/g, "").trim());
  return { lines, header };
}

// Splits raw CSV text into logical rows, respecting quoted fields -- a plain
// `text.split(/\r?\n/)` (the previous approach) breaks the moment any quoted
// field contains a literal newline, which Shopify's "Body (HTML)" column
// does constantly (multi-paragraph descriptions). That shattered one real
// row into several bogus ones and misaligned every column after it,
// silently corrupting the parse for a large share of rows rather than
// erroring -- caught via a dry-run skip count (85% of a real catalog) that
// was far too high to be genuine bad data.
function splitCsvRows(text: string): string[] {
  const rows: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (inQuote && text[i + 1] === '"') {
        cur += '""';
        i++;
        continue;
      }
      inQuote = !inQuote;
      cur += ch;
    } else if ((ch === "\n" || ch === "\r") && !inQuote) {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      if (cur.trim()) rows.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) rows.push(cur);
  return rows;
}

export function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuote = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuote = !inQuote;
      }
    } else if (ch === "," && !inQuote) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  result.push(cur.trim());
  return result;
}

export function makeCol(header: string[]) {
  return (row: string[], name: string) => {
    const idx = header.indexOf(name);
    return idx >= 0 ? (row[idx] || "").trim() : "";
  };
}

// The exact ordered, deduped "Image Src" list migrate-4regn.ts builds a
// product's images[] gallery from (one upload per entry, in this order,
// becoming images[0], images[1], ...). Re-exposed so
// mirror-4regn-variant-images.ts can recompute the same list and match a
// raw Shopify CDN URL against the Storage URL it already became, instead
// of fetching and uploading a second copy of a photo this project already
// has mirrored.
export function collectImageSrcs(variantRows: string[][], col: (row: string[], name: string) => string): string[] {
  const imageSrcs: string[] = [];
  const seenUrls = new Set<string>();
  for (const vRow of variantRows) {
    const img = col(vRow, "image src");
    if (img && !seenUrls.has(img)) {
      seenUrls.add(img);
      imageSrcs.push(img);
    }
  }
  return imageSrcs;
}

// Shared by migrate-4regn.ts (fresh imports) and
// backfill-4regn-variant-images.ts (retrofitting products already
// imported before this existed) -- kept in one place so the two can never
// silently drift apart on what counts as a valid variant-image mapping.
//
// Shopify's CSV has one row per variant. It carries TWO different image
// columns that are easy to conflate: "Image Src" (which rows add a photo
// to the product's overall gallery -- populated wherever a new photo
// happens to be declared, with no guarantee it's related to that row's
// own option value) and "Variant Image" (Shopify's actual, authoritative
// "this exact variant uses this photo" assignment, reusing one of the
// same URLs already seen in Image Src elsewhere for the product).
// Grouping by "Image Src" was confirmed wrong against real data (Color=
// Apricot showing Color=Brown's photos, and similar for most colors) --
// Image Src just happens to land on whichever row Shopify used to declare
// that photo, not necessarily the row for the variant it visually
// belongs to. "Variant Image" is the column actually meant for this.
// Falls back to "Image Src" only when a CSV has no "Variant Image" column
// at all (hasVariantImageColumn=false), so older/non-Shopify exports
// still get a best-effort mapping instead of none.
//
// An earlier version of this function assumed each option value (e.g.
// Color=Grey) maps to exactly ONE photo, and refused to guess when that
// wasn't a clean 1:1 function -- but confirmed against a real product (a
// pullover sweater): a single color can legitimately have a whole SET of
// its own photos (front/back/close-up, ~8 for Grey alone), not one
// canonical image. There's no single "right" photo to pick there, so this
// groups every image seen under each option value into an ordered,
// deduped array instead of trying to pick one -- the PDP swaps its
// gallery to that whole set when the value is selected, same as
// Shopify's own storefront does for this exact product.
//
// A dimension only gets an images map if it shows genuine
// differentiation: at least 2 values with any images, and not every
// value's photo SET is identical (which would mean no real per-value
// distinction exists at all, and the dimension should just fall back to
// the product's plain images[] gallery).
//
// opt1Name/opt2Name/opt3Name must come from the product's FIRST row --
// Shopify's export only populates "OptionN Name" there, leaving it blank
// on every subsequent variant row (only "OptionN Value" is repeated per
// row). Confirmed live: comparing each row's OWN option-name column
// against the target dimension (instead of using a fixed column position
// for the whole product) silently matched only the first row every time,
// which is why an earlier version of this function found zero variant-
// image mappings across an entire real catalog.
export function computeVariantImageMaps(
  variantRows: string[][],
  col: (row: string[], name: string) => string,
  opt1Name: string,
  opt2Name: string,
  opt3Name: string,
  hasVariantImageColumn: boolean
): Record<string, Record<string, string[]>> {
  const dimensions = [
    opt1Name ? { name: opt1Name, valueCol: "option1 value" } : null,
    opt2Name ? { name: opt2Name, valueCol: "option2 value" } : null,
    opt3Name ? { name: opt3Name, valueCol: "option3 value" } : null,
  ].filter((d): d is { name: string; valueCol: string } => d !== null);

  const imageCol = hasVariantImageColumn ? "variant image" : "image src";
  const imagesByDimension: Record<string, Record<string, string[]>> = {};
  for (const { name, valueCol } of dimensions) {
    const valueToImages: Record<string, string[]> = {};
    const seenPerValue: Record<string, Set<string>> = {};
    for (const vRow of variantRows) {
      const optValue = col(vRow, valueCol);
      const img = col(vRow, imageCol);
      if (!optValue || !img) continue;
      if (!valueToImages[optValue]) { valueToImages[optValue] = []; seenPerValue[optValue] = new Set(); }
      if (!seenPerValue[optValue].has(img)) { seenPerValue[optValue].add(img); valueToImages[optValue].push(img); }
    }
    const entries = Object.entries(valueToImages);
    if (entries.length < 2) continue;
    const distinctSets = new Set(entries.map(([, imgs]) => imgs.slice().sort().join("|")));
    if (distinctSets.size < 2) continue;
    imagesByDimension[name] = valueToImages;
  }
  return imagesByDimension;
}

// Thrown by writeInBatches/insertInBatchesReturning so each call site can
// decide whether a failed batch is fatal (most writes -- exit and tell the
// operator what's safe to re-run) or soft (e.g. redirect rows, where the
// products they point at are already safely written by that point).
export class BatchWriteError extends Error {
  constructor(message: string, public writtenCount: number) {
    super(message);
  }
}

const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000];
const CALL_TIMEOUT_MS = 20000;

// Supabase-js's fetch calls have no default timeout, so a stalled (not
// dropped) connection hangs forever rather than erroring -- confirmed in
// practice with the image-download step. Races any Supabase call against a
// timer so it always eventually settles one way or the other.
export function withTimeout<T>(promise: PromiseLike<T>, label: string, ms = CALL_TIMEOUT_MS): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms / 1000}s (no response -- likely a stalled connection)`)), ms);
    Promise.resolve(promise).then(
      (v) => { clearTimeout(timer); resolve(v); },
      (e) => { clearTimeout(timer); reject(e); }
    );
  });
}

// Retries a single batch attempt on failure with exponential backoff before
// giving up -- added after observing real, intermittent "TypeError: fetch
// failed" errors on a home network that landed at a different row range
// each run (600, then 1400, then 600 again), the signature of a flaky
// connection rather than a payload-size problem (batching already fixed
// that). `attempt()` should return the Supabase `{data, error}` result, not
// throw -- a thrown exception (e.g. an actual dropped connection mid-request,
// or the timeout above firing) is caught and retried the same as a returned
// `error`.
async function withRetry<T extends { data?: any; error: any }>(attempt: () => PromiseLike<T>, label: string): Promise<T> {
  let lastResult: T | undefined;
  for (let i = 0; i <= RETRY_DELAYS_MS.length; i++) {
    try {
      lastResult = await withTimeout(attempt(), label);
      if (!lastResult.error) return lastResult;
    } catch (e) {
      lastResult = { error: e instanceof Error ? e : new Error(String(e)) } as T;
    }
    if (i < RETRY_DELAYS_MS.length) {
      process.stdout.write(`\n  ${label} failed (${lastResult.error?.message || lastResult.error}), retrying in ${RETRY_DELAYS_MS[i] / 1000}s...`);
      await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[i]));
    }
  }
  return lastResult!;
}

// Writing thousands of rows in one insert/upsert call risks hitting a
// payload-size or timeout limit on the request -- confirmed in practice: a
// single ~5,800-row customer upsert failed with a generic "fetch failed"
// (no useful error detail, since the request itself never completed). Batches
// keep each request small and let a real error from row N surface with
// exactly which rows failed, rather than losing the whole write.
export async function writeInBatches(
  admin: SupabaseClient,
  table: string,
  rows: any[],
  opts: { onConflict?: string } = {},
  batchSize = 200
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { data, error } = await withRetry(
      () => (opts.onConflict ? admin.from(table).upsert(chunk, { onConflict: opts.onConflict }) : admin.from(table).insert(chunk)).select("id"),
      `${table} rows ${i}-${i + chunk.length - 1}`
    );
    if (error) {
      const safety = opts.onConflict
        ? `${written} row(s) before this batch were written successfully -- safe to re-run the same import once the underlying issue is fixed, this table upserts on (${opts.onConflict}) so already-written rows just update in place rather than duplicating.`
        : `${written} row(s) before this batch were written successfully as plain inserts (no dedupe key on this table) -- do not blindly re-run the full import, or those rows will be duplicated.`;
      throw new BatchWriteError(`Write to "${table}" failed on rows ${i}-${i + chunk.length - 1} of ${rows.length}: ${error.message}\n${safety}`, written);
    }
    written += data?.length || 0;
    if (rows.length > batchSize) process.stdout.write(`\r  ${table}: ${written}/${rows.length} written...`);
  }
  if (rows.length > batchSize) process.stdout.write("\n");
  return written;
}

// Same batching rationale as writeInBatches, but for the one call site
// (product insert) where the caller needs the actual inserted rows back --
// not just a count -- to reference by index afterward (image uploads,
// redirect-row building). Supabase preserves input order in the returned
// `data` array per request, so concatenating each batch's result in order
// keeps `result[i]` corresponding to `rows[i]` across the whole run.
export async function insertInBatchesReturning(admin: SupabaseClient, table: string, rows: any[], batchSize = 200): Promise<any[]> {
  const result: any[] = [];
  for (let i = 0; i < rows.length; i += batchSize) {
    const chunk = rows.slice(i, i + batchSize);
    const { data, error } = await withRetry(() => admin.from(table).insert(chunk).select(), `${table} rows ${i}-${i + chunk.length - 1}`);
    if (error || !data) {
      throw new BatchWriteError(
        `Insert into "${table}" failed on rows ${i}-${i + chunk.length - 1} of ${rows.length}: ${error?.message}\n` +
          `${result.length} row(s) before this batch were inserted successfully -- do not blindly re-run the full import, or those rows will be duplicated.`,
        result.length
      );
    }
    result.push(...data);
    if (rows.length > batchSize) process.stdout.write(`\r  ${table}: ${result.length}/${rows.length} inserted...`);
  }
  if (rows.length > batchSize) process.stdout.write("\n");
  return result;
}

// Shopify Admin GraphQL request helper, shared by every script that talks
// to Shopify's Admin API directly (as opposed to reading a Matrixify CSV
// export). Retries on HTTP 429 and on GraphQL's own THROTTLED error code
// (query-cost throttling, distinct from the HTTP-level rate limit), plus a
// generic retry-with-backoff on any other failure (e.g. a dropped
// connection), up to 5 attempts total. Each request is raced against a 20s
// timeout via withTimeout so a stalled connection can't hang forever.
export async function shopifyGraphQL<T>(domain: string, token: string, apiVersion: string, query: string, variables: Record<string, unknown>): Promise<T> {
  const url = `https://${domain}/admin/api/${apiVersion}/graphql.json`;
  let lastErr: unknown;
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      const res = await withTimeout(
        fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
          body: JSON.stringify({ query, variables }),
        }),
        "Shopify GraphQL request",
        20000
      );
      if (res.status === 429) {
        const wait = 1000 * attempt;
        console.log(`  rate-limited, waiting ${wait}ms before retry...`);
        await new Promise((r) => setTimeout(r, wait));
        continue;
      }
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
      }
      const json = await res.json();
      if (json.errors) {
        const throttled = json.errors.some((e: any) => e.extensions?.code === "THROTTLED");
        if (throttled) {
          const wait = 1000 * attempt;
          console.log(`  throttled by query cost, waiting ${wait}ms before retry...`);
          await new Promise((r) => setTimeout(r, wait));
          continue;
        }
        throw new Error(`GraphQL error(s): ${JSON.stringify(json.errors).slice(0, 500)}`);
      }
      return json.data as T;
    } catch (err) {
      lastErr = err;
      if (attempt < 5) {
        const wait = 1000 * attempt;
        console.log(`  request failed (${(err as Error).message}), retrying in ${wait}ms...`);
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }
  throw lastErr;
}

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

// Converts Shopify policy HTML (real <p>/<br>/<ul>/<li>/<h1-6> markup, plus
// HTML entities) into clean plain text that PRESERVES paragraph/list
// structure as blank-line-separated blocks -- unlike stripHtml() above,
// which collapses all whitespace (including line breaks) to single spaces
// and is relied on elsewhere for that exact behavior, so this is a
// deliberate separate function rather than a change to stripHtml(). No
// length cap -- these are full legal documents (Shipping/Refund/Privacy/
// Terms), not short CSV cell values.
export function htmlToParagraphs(html: string): string {
  return html
    // Block-closing tags become a line break.
    .replace(/<\s*(\/p|br\s*\/?|\/li|\/h[1-6]|\/div)\s*>/gi, "\n")
    // List items get a leading bullet marker.
    .replace(/<\s*li[^>]*>/gi, "\n- ")
    // Everything else (remaining tags) is stripped outright.
    .replace(/<[^>]*>/g, "")
    // Decode the common entities Shopify's policy HTML actually contains.
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(#39|apos);/gi, "'")
    // Collapse spaces/tabs within a line (but not the newlines themselves).
    .replace(/[ \t]+/g, " ")
    // Collapse 3+ consecutive newlines (with only whitespace between them)
    // down to exactly one blank line between paragraphs.
    .replace(/\n[ \t]*(\n[ \t]*)+/g, "\n\n")
    // Trim each line individually...
    .split("\n")
    .map((line) => line.trim())
    .join("\n")
    // ...and the result as a whole.
    .trim();
}

// Mirrors the entity list htmlToParagraphs() decodes (same set, same
// order) -- kept as its own small helper rather than reaching into
// htmlToParagraphs() itself, which is left completely untouched per its own
// doc comment above. Used by tableToRowLines() below so table cell text is
// decoded the same way as everything else in a description.
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&(#39|apos);/gi, "'");
}

// Converts one <table>...</table> block into one line of text per <tr>,
// cells joined with " | " -- e.g. a size-chart header row
// <tr><th>Size</th><th>Bust</th></tr> becomes "Size | Bust", a data row
// becomes "S | 92-96". <thead>/<tbody> wrappers (if present) are ignored --
// <tr> is matched wherever it occurs in the table's HTML regardless of
// nesting. Any tags nested inside a cell (<strong>, <br>, etc.) are
// stripped, not preserved -- a cell is one flat value, not its own
// sub-document.
function tableToRowLines(tableHtml: string): string[] {
  const rowMatches = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const lines: string[] = [];
  for (const rowHtml of rowMatches) {
    const cellMatches = rowHtml.match(/<(?:td|th)\b[^>]*>[\s\S]*?<\/(?:td|th)>/gi) || [];
    if (!cellMatches.length) continue;
    const cells = cellMatches.map((cellHtml) =>
      decodeHtmlEntities(
        cellHtml
          .replace(/^<(?:td|th)\b[^>]*>/i, "")
          .replace(/<\/(?:td|th)>\s*$/i, "")
          .replace(/<[^>]*>/g, " ")
      )
        .replace(/\s+/g, " ")
        .trim()
    );
    lines.push(cells.join(" | "));
  }
  return lines;
}

// Extends htmlToParagraphs() with real <table> support -- a size-chart
// table (rows like Size/Shoulder/Bust/Length with numeric columns per size)
// has no block-level markup htmlToParagraphs() can turn into line breaks,
// so it collapses into an unreadable run-on paragraph ("...S 47.5 110 53
// 62.8 40.8 23.8 M 49 114 55 64 42 25..."). This is why migrate-4regn.ts's
// description field needs this function instead of stripHtml() -- confirmed
// against a real Shopify product description containing exactly this shape
// of size-chart table.
//
// Approach: pull each <table>...</table> block out with a regex pass, turn
// it into pipe-separated-rows text via tableToRowLines() above (one line
// per <tr>, NOT one blank-line-separated paragraph per <tr> -- a table's
// rows are one visual block), splice that text back into the original
// string wrapped in blank lines so it reads as its own paragraph-like
// block, then run the ENTIRE result through the existing, unmodified
// htmlToParagraphs() -- so every entity-decoding/line-collapsing/paragraph
// rule already relied on for the non-table portions of a description
// applies identically here too, rather than a second, subtly different
// implementation of the same logic. No length cap (matches
// htmlToParagraphs() -- these are real product descriptions, not
// stripHtml()'s short CSV cell values).
export function htmlToDescriptionText(html: string): string {
  const withTablesConverted = html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) => {
    const lines = tableToRowLines(tableHtml);
    if (!lines.length) return "";
    return `\n\n${lines.join("\n")}\n\n`;
  });
  return htmlToParagraphs(withTablesConverted);
}

// Narrow, defensively-validated CSS color value: hex (#abc/#aabbcc/#aabbccdd),
// rgb(r, g, b), or a bare CSS color keyword (red, DarkRed, etc). Anything
// else found in a `color:` style declaration is treated as absent rather
// than passed through -- this is the one place a malicious/malformed style
// attribute in imported HTML could otherwise leak an unvalidated string into
// stored product data, so this stays conservative rather than permissive.
const SAFE_COLOR_VALUE = /^(#[0-9a-fA-F]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\)|[a-zA-Z]+)$/;

// Extracts a `color: VALUE` declaration from an inline style="..." attribute
// value, returning VALUE only if it passes SAFE_COLOR_VALUE -- e.g.
// `color: red; font-size: 12px` -> "red", `color:#ff0000` -> "#ff0000".
// Returns null both when there's no color declaration at all AND when there
// is one but it fails validation -- callers can't (and don't need to)
// distinguish those two cases, both mean "render as unstyled text".
function extractSafeColor(styleAttr: string): string | null {
  const match = styleAttr.match(/color\s*:\s*([^;]+?)\s*(?:;|$)/i);
  if (!match) return null;
  const value = match[1].trim();
  return SAFE_COLOR_VALUE.test(value) ? value : null;
}

// Converts one <table>...</table> block into pipe-separated-row lines, same
// as tableToRowLines() above, but ALSO preserves <strong>/<b>, <em>/<i>, and
// a validated inline `color` style as the same **/__ /[[color:...]] markers
// markupInline() below produces for non-table text -- a bold/colored cell
// (e.g. a sale price highlighted in a size chart) shouldn't lose that
// formatting just because it's inside a table. Structurally identical to
// tableToRowLines(): one line per <tr>, cells joined with " | ", only the
// per-cell text extraction differs (markupInline() instead of a flat
// tag-strip).
function tableToRowLinesMarkup(tableHtml: string): string[] {
  const rowMatches = tableHtml.match(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi) || [];
  const lines: string[] = [];
  for (const rowHtml of rowMatches) {
    const cellMatches = rowHtml.match(/<(?:td|th)\b[^>]*>[\s\S]*?<\/(?:td|th)>/gi) || [];
    if (!cellMatches.length) continue;
    const cells = cellMatches.map((cellHtml) =>
      markupInline(
        cellHtml
          .replace(/^<(?:td|th)\b[^>]*>/i, "")
          .replace(/<\/(?:td|th)>\s*$/i, "")
      )
        .replace(/[ \t]+/g, " ")
        .trim()
    );
    lines.push(cells.join(" | "));
  }
  return lines;
}

// Converts a run of inline HTML (no block-level tags expected -- this
// operates on already-isolated fragments like a single table cell, or the
// body text between block boundaries) into the small custom markup grammar
// htmlToDescriptionMarkup() emits: <strong>/<b> -> **text**, <em>/<i> ->
// __text__, and any element carrying a validated inline `color` style ->
// [[color:VALUE]]text[[/color]]. Deliberately single-level: it matches each
// of these element types by tag pair and recurses into its own inner HTML
// once (so bold-and-colored combinations survive, e.g. a <strong> wrapping a
// colored <span> or vice versa), but doesn't attempt to handle arbitrary
// deeper nesting -- real Shopify rich-text descriptions don't produce that,
// and the point of this grammar is to stay trivial to parse back out again
// in Part 2, not to be a general HTML-to-markup converter. Anything left
// after those substitutions (any other tag) is stripped outright, same as
// htmlToParagraphs() does today.
// Block-level tags htmlToParagraphs() itself treats as paragraph/line
// boundaries (see its own block-tag regex) -- when a color style lands on
// one of these (a real, common Shopify export shape: a rich-text editor
// applying a color to a whole selected paragraph produces
// <p style="color:red">...</p>, not a <span> wrapped inside a plain <p>),
// the color pass below must NOT consume the tag's own open/close markers,
// only wrap its inner content -- otherwise the </p> that htmlToParagraphs()
// needs to detect the paragraph boundary is gone from the string entirely,
// and that paragraph silently merges into whatever follows with no break at
// all. Confirmed as a real bug via a direct test before this fix: a
// <p style="color:red"> paragraph run together with the very next <p>,
// producing "...R700!![[/color]]__discount..." with no separator between
// two visually distinct paragraphs.
const BLOCK_LEVEL_TAGS = new Set(["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"]);

function markupInline(html: string): string {
  let out = html;
  // <span ... style="...color:...">text</span> (and any other element type
  // carrying a style attribute, e.g. a Shopify export's <p style="color:red">)
  // -- matched generically by tag name so both cases work the same way.
  out = out.replace(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>([\s\S]*?)<\/\1>/g, (full, tag, attrs, inner) => {
    const styleMatch = attrs.match(/style\s*=\s*"([^"]*)"|style\s*=\s*'([^']*)'/i);
    if (!styleMatch) return full; // no style attribute -- leave for the tag-specific passes below
    const color = extractSafeColor(styleMatch[1] ?? styleMatch[2] ?? "");
    if (!color) return inner; // style present but no safe color -- drop the wrapper, keep the text
    const marked = `[[color:${color}]]${inner}[[/color]]`;
    // Inline tag (span, a, etc.) -- safe to discard entirely, it never
    // carries paragraph-boundary significance for htmlToParagraphs().
    // Block tag -- keep the real open/close tags around the marked-up
    // inner content so the </p>/</div>/etc. survives for htmlToParagraphs()
    // to convert into a line break exactly as it would have unstyled.
    return BLOCK_LEVEL_TAGS.has(tag.toLowerCase()) ? `<${tag}${attrs}>${marked}</${tag}>` : marked;
  });
  // <strong>/<b> -> **text**, <em>/<i> -> __text__. Applied after the color
  // pass above so e.g. <strong><span style="color:red">SALE</span></strong>
  // has already had its inner <span> replaced with [[color:...]] markers by
  // the time this wraps it in **...**.
  out = out.replace(/<(?:strong|b)\b[^>]*>([\s\S]*?)<\/(?:strong|b)>/gi, (_full, inner) => `**${inner}**`);
  out = out.replace(/<(?:em|i)\b[^>]*>([\s\S]*?)<\/(?:em|i)>/gi, (_full, inner) => `__${inner}__`);
  return out;
}

// Same purpose as htmlToDescriptionText() above -- convert a Shopify product
// description into readable plain text with table support -- but preserves
// bold/italic/color formatting as the plain-text marker grammar documented
// on DescriptionText in FourRegnStore.tsx, instead of stripping all inline
// formatting the way htmlToDescriptionText() does. htmlToDescriptionText()
// itself is left completely untouched (still used as-is wherever exact
// current behavior -- fully flat plain text -- is relied on); this is a new,
// additional function for call sites that want formatting preserved.
//
// Shares the same table-to-pipe-lines / htmlToParagraphs() core as
// htmlToDescriptionText(): tables become pipe-separated-row blocks spliced
// back into the HTML and the whole result still goes through the existing,
// unmodified htmlToParagraphs() for paragraph/line structure and entity
// decoding. The only difference is what happens to inline formatting tags
// before that: markupInline() converts them to markers instead of
// tableToRowLines()/htmlToParagraphs()'s flat stripping.
export function htmlToDescriptionMarkup(html: string): string {
  const withInlineMarked = markupInline(html);
  const withTablesConverted = withInlineMarked.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, (tableHtml) => {
    // markupInline() already ran over the whole document above, so any
    // <strong>/<em>/color spans inside this table's cells have already been
    // turned into **/__/[[color:...]] markers by the time tableHtml gets
    // here -- tableToRowLinesMarkup()'s own per-cell markupInline() call is
    // therefore a no-op on this path (no raw tags left to match), kept only
    // because that function is also usable standalone on not-yet-marked-up
    // table HTML. Passing the marked-up HTML through tableToRowLinesMarkup
    // (rather than the original tableToRowLines()) keeps its per-cell
    // whitespace collapsing but leaves the markers already inserted intact.
    const lines = tableToRowLinesMarkup(tableHtml);
    if (!lines.length) return "";
    // [[table]]/[[/table]] wrapper lines tell DescriptionText (FourRegnStore.tsx)
    // to render these pipe-separated rows as a real <table> (first row as the
    // header) instead of plain text with visible "|" characters -- a size
    // chart otherwise renders as an unstructured wall of numbers, exactly the
    // "Shopify shows a real table, this platform doesn't" gap reported
    // directly against a live product page. Can't use a tab character to
    // separate cells instead of " | " -- htmlToParagraphs() below collapses
    // all runs of spaces/tabs to a single space, which would silently erase
    // tab-separated cell boundaries; " | " survives that pass unchanged since
    // "|" isn't whitespace.
    return `\n\n[[table]]\n${lines.join("\n")}\n[[/table]]\n\n`;
  });
  return htmlToParagraphs(withTablesConverted);
}

export function parseYesNo(value: string): boolean {
  return /^(yes|true|1)$/i.test(value.trim());
}
