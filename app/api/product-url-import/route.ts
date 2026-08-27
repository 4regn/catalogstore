import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 30;

type ImportedProductPreview = {
  sourceUrl: string;
  supplier: string;
  title: string;
  price: number | null;
  compareAtPrice: number | null;
  currency: string;
  description: string;
  images: string[];
  variants: { name: string; options: string[] }[];
  inStock: boolean | null;
  captureMethod: "server" | "browser";
  warnings: string[];
};

const SUPPORTED_HOSTS = [
  "shein.com",
  "temu.com",
  "nike.com",
  "superbalist.com",
];

function getSupplier(hostname: string) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  if (host.includes("shein.")) return "SHEIN";
  if (host.includes("temu.")) return "Temu";
  if (host.includes("nike.")) return "Nike";
  if (host.includes("superbalist.")) return "Superbalist";
  return host;
}

function isSupportedSupplier(hostname: string) {
  const host = hostname.replace(/^www\./, "").toLowerCase();
  return SUPPORTED_HOSTS.some((allowed) => host === allowed || host.endsWith("." + allowed));
}

function decodeHtml(value: string) {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function stripHtml(value: string) {
  return decodeHtml(value.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ").replace(/<[^>]+>/g, " "));
}

function absolutizeUrl(value: string, baseUrl: string) {
  if (!value) return "";
  try {
    if (value.startsWith("//")) return new URL("https:" + value).toString();
    return new URL(value, baseUrl).toString();
  } catch {
    return "";
  }
}

function pickMeta(html: string, names: string[]) {
  for (const name of names) {
    const attr = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(`<meta[^>]+property=["']${attr}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+name=["']${attr}["'][^>]+content=["']([^"']+)["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+property=["']${attr}["'][^>]*>`, "i"),
      new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+name=["']${attr}["'][^>]*>`, "i"),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  }
  return "";
}

function pickTitle(html: string) {
  const metaTitle = pickMeta(html, ["og:title", "twitter:title"]);
  if (metaTitle) return metaTitle;
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  return decodeHtml(title.replace(/\s*[|–-]\s*(SHEIN|Temu|Nike|Superbalist).*$/i, ""));
}

function parsePrice(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return Math.round(value * 100) / 100;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/g, "").replace(/,/g, ".").match(/\d+(?:\.\d{1,2})?/);
  if (!normalized) return null;
  const n = parseFloat(normalized[0]);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function readJsonLdProducts(html: string) {
  const blocks = Array.from(html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)).map((m) => m[1]);
  const products: any[] = [];
  const visit = (node: any) => {
    if (!node) return;
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object") return;
    const type = node["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (types.some((t) => String(t).toLowerCase() === "product")) products.push(node);
    if (node["@graph"]) visit(node["@graph"]);
  };
  for (const block of blocks) {
    try { visit(JSON.parse(block)); } catch {}
  }
  return products;
}

function normalizeOption(value: string) {
  return decodeHtml(value).replace(/\s+/g, " ").trim();
}

function addVariantOption(groups: Map<string, Set<string>>, name: string, value: unknown) {
  if (Array.isArray(value)) return value.forEach((v) => addVariantOption(groups, name, v));
  if (typeof value !== "string" && typeof value !== "number") return;
  const option = normalizeOption(String(value));
  if (!option || option.length > 40) return;
  const key = normalizeOption(name);
  if (!key) return;
  if (!groups.has(key)) groups.set(key, new Set());
  groups.get(key)!.add(option);
}

function collectVariants(html: string, jsonProduct?: any) {
  const groups = new Map<string, Set<string>>();
  const productProps = Array.isArray(jsonProduct?.additionalProperty) ? jsonProduct.additionalProperty : [];
  for (const prop of productProps) {
    const name = String(prop?.name || "").trim();
    if (/size|colour|color|waist|length/i.test(name)) addVariantOption(groups, name, prop?.value);
  }

  const offers = Array.isArray(jsonProduct?.offers) ? jsonProduct.offers : jsonProduct?.offers ? [jsonProduct.offers] : [];
  for (const offer of offers) {
    addVariantOption(groups, "Size", offer?.size);
    addVariantOption(groups, "Color", offer?.color || offer?.colour);
  }

  const sizeMatches = Array.from(html.matchAll(/(?:size|sizes|attr_name)["'\s:=]+(?:[^<>{}\]]{0,200}?)(XS|S|M|L|XL|XXL|2XL|3XL|4XL|5XL|\d{2,3})/gi));
  for (const match of sizeMatches) addVariantOption(groups, "Size", match[1].toUpperCase());

  const colorMatches = Array.from(html.matchAll(/(?:color|colour|attr_name)["'\s:=]+(?:[^<>{}\]]{0,200}?)(Black|White|Blue|Navy|Red|Green|Brown|Grey|Gray|Pink|Purple|Orange|Beige|Khaki|Cream|Yellow)/gi));
  for (const match of colorMatches) addVariantOption(groups, "Color", match[1]);

  return Array.from(groups.entries())
    .map(([name, values]) => ({ name, options: Array.from(values).slice(0, 80) }))
    .filter((v) => v.options.length > 0)
    .slice(0, 3);
}

function collectImages(html: string, baseUrl: string, jsonProduct?: any) {
  const raw = new Set<string>();
  const add = (value: unknown) => {
    if (Array.isArray(value)) return value.forEach(add);
    if (typeof value !== "string") return;
    const url = absolutizeUrl(decodeHtml(value), baseUrl);
    if (url && /^https?:\/\//i.test(url)) raw.add(url);
  };
  add(jsonProduct?.image);
  add(pickMeta(html, ["og:image", "twitter:image"]));
  for (const match of html.matchAll(/<img[^>]+(?:src|data-src|data-original)=["']([^"']+)["'][^>]*>/gi)) add(match[1]);
  return Array.from(raw)
    .filter((url) => !/sprite|logo|icon|avatar|placeholder|blank/i.test(url))
    .slice(0, 12);
}

function assessPreview(preview: Omit<ImportedProductPreview, "variants" | "inStock" | "captureMethod" | "warnings">, variantCount: number) {
  const genericTitles = ["Women's & Men's Clothing, Shop Online Fashion", "Shop online fashion", "SHEIN", "Temu"];
  const title = preview.title.trim().toLowerCase();
  const genericTitle = genericTitles.some((generic) => title === generic.toLowerCase());
  const warnings: string[] = [];
  if (genericTitle) warnings.push("The supplier returned a generic page title instead of the product title.");
  if (preview.images.length === 0) warnings.push("No product images were exposed to the server.");
  if (preview.price === null) warnings.push("No product price was exposed to the server.");
  if (variantCount === 0) warnings.push("No sizes or other variants were exposed to the server.");
  return {
    unusable: genericTitle && preview.images.length === 0 && preview.price === null,
    needsBrowserAssist: genericTitle || preview.images.length === 0 || variantCount === 0,
    warnings,
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const rawUrl = String(body?.url || "").trim();
    if (!rawUrl) return NextResponse.json({ error: "Paste a supplier product URL first." }, { status: 400 });

    let parsed: URL;
    try { parsed = new URL(rawUrl); } catch {
      return NextResponse.json({ error: "That URL does not look valid." }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ error: "Only http/https product links are supported." }, { status: 400 });
    }
    if (!isSupportedSupplier(parsed.hostname)) {
      return NextResponse.json({ error: "For now this importer supports Shein, Temu, Nike, and Superbalist product links." }, { status: 400 });
    }

    const resp = await fetch(parsed.toString(), {
      redirect: "follow",
      headers: {
        "accept": "text/html,application/xhtml+xml",
        "accept-language": "en-ZA,en;q=0.9",
        "user-agent": "Mozilla/5.0 (compatible; 4REGNProductImporter/1.0; +https://4regn.com)",
      },
      next: { revalidate: 0 },
    });
    if (!resp.ok) {
      return NextResponse.json({
        error: `The supplier blocked the server request (${resp.status}). Use browser capture so CatalogStore can read the product page you can already see in Chrome.`,
        code: "SUPPLIER_BLOCKED_SERVER",
        browserAssisted: true,
      }, { status: 502 });
    }

    const html = await resp.text();
    const jsonProduct = readJsonLdProducts(html)[0];
    const offer = Array.isArray(jsonProduct?.offers) ? jsonProduct.offers[0] : jsonProduct?.offers;
    const title = decodeHtml(jsonProduct?.name || pickTitle(html));
    const description = stripHtml(jsonProduct?.description || pickMeta(html, ["og:description", "description"])).slice(0, 2500);
    const price = parsePrice(offer?.price || pickMeta(html, ["product:price:amount", "og:price:amount"]));
    const compareAtPrice = parsePrice(offer?.highPrice || offer?.priceSpecification?.price);
    const currency = String(offer?.priceCurrency || pickMeta(html, ["product:price:currency", "og:price:currency"]) || "ZAR").toUpperCase();
    const images = collectImages(html, parsed.toString(), jsonProduct);
    const variants = collectVariants(html, jsonProduct);

    const preview = {
      sourceUrl: parsed.toString(),
      supplier: getSupplier(parsed.hostname),
      title: title || `${getSupplier(parsed.hostname)} product`,
      price,
      compareAtPrice: compareAtPrice && price && compareAtPrice > price ? compareAtPrice : null,
      currency,
      description,
      images,
    };

    const quality = assessPreview(preview, variants.reduce((sum, group) => sum + group.options.length, 0));
    if (quality.unusable) {
      return NextResponse.json({
        error: `${preview.supplier} hid the product details from the server. Use browser capture to collect the rendered title, photos, price, sizes and stock from Chrome.`,
        code: "BROWSER_CAPTURE_REQUIRED",
        browserAssisted: true,
        partialProduct: { ...preview, variants, inStock: null, captureMethod: "server", warnings: quality.warnings },
      }, { status: 422 });
    }

    return NextResponse.json({
      product: { ...preview, variants, inStock: null, captureMethod: "server", warnings: quality.warnings } satisfies ImportedProductPreview,
      browserAssisted: quality.needsBrowserAssist,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Could not import this product URL." }, { status: 500 });
  }
}
