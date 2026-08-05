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
};

export function parseArgs(usage: string): CliArgs {
  const out: Partial<CliArgs> = { dryRun: false, force: false, limit: null, sourceDomain: null };
  for (const arg of process.argv.slice(2)) {
    if (arg === "--dry-run") out.dryRun = true;
    else if (arg === "--force") out.force = true;
    else if (arg.startsWith("--csv=")) out.csv = arg.slice("--csv=".length);
    else if (arg.startsWith("--seller=")) out.seller = arg.slice("--seller=".length);
    else if (arg.startsWith("--limit=")) out.limit = parseInt(arg.slice("--limit=".length), 10);
    else if (arg.startsWith("--source-domain=")) out.sourceDomain = arg.slice("--source-domain=".length).replace(/\/$/, "");
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
