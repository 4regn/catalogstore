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
    .select("id, email, subdomain, subscription_status")
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
  const text = readFileSync(csvPath, "utf8");
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

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

export function parseYesNo(value: string): boolean {
  return /^(yes|true|1)$/i.test(value.trim());
}
