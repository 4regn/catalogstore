export interface ProductSizeChart {
  headers: string[];
  rows: string[][];
  note?: string;
  bodyChart?: { headers: string[]; rows: string[][] };
  measureImages?: string[];
}

const ENTITY_MAP: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function decodeEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === "#") {
      const hex = entity[1]?.toLowerCase() === "x";
      const code = Number.parseInt(entity.slice(hex ? 2 : 1), hex ? 16 : 10);
      return Number.isFinite(code) && code >= 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ENTITY_MAP[entity.toLowerCase()] ?? match;
  });
}

function plainCell(value: string) {
  return decodeEntities(value.replace(/<br\s*\/?\s*>/gi, " ").replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

export function parseProductSizeChartHtml(html?: string | null): ProductSizeChart | null {
  if (!html) return null;
  const safeLengthHtml = html.slice(0, 100_000);
  const parseRows = (tableHtml: string) => [...tableHtml.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)]
    .map((row) => [...row[1].matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)].map((cell) => plainCell(cell[2])).filter(Boolean))
    .filter((row) => row.length > 1);
  const productSection = safeLengthHtml.match(/<section\b[^>]*data-size-chart=["']product["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || safeLengthHtml;
  const table = productSection.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1];
  if (!table) return null;
  const parsedRows = parseRows(table);
  if (parsedRows.length < 2) return null;

  const tableEnd = productSection.search(/<\/table>/i);
  const afterTable = tableEnd >= 0 ? productSection.slice(tableEnd + "</table>".length) : "";
  const note = plainCell(afterTable.match(/<(?:p|em)\b[^>]*>([\s\S]*?)<\/(?:p|em)>/i)?.[1] || "");
  const bodySection = safeLengthHtml.match(/<section\b[^>]*data-size-chart=["']body["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || "";
  const bodyTable = bodySection.match(/<table\b[^>]*>([\s\S]*?)<\/table>/i)?.[1] || "";
  const bodyRows = bodyTable ? parseRows(bodyTable) : [];
  const measureSection = safeLengthHtml.match(/<section\b[^>]*data-size-chart-measure-images=["']true["'][^>]*>([\s\S]*?)<\/section>/i)?.[1] || "";
  const measureImages = [...measureSection.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["'][^>]*>/gi)].map((match) => decodeEntities(match[1]).trim()).filter((src) => /^https?:\/\//i.test(src));

  return { headers: parsedRows[0], rows: parsedRows.slice(1), ...(note ? { note } : {}), ...(bodyRows.length >= 2 ? { bodyChart: { headers: bodyRows[0], rows: bodyRows.slice(1) } } : {}), ...(measureImages.length ? { measureImages: [...new Set(measureImages)].slice(0, 4) } : {}) };
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export function extractLegacyImportedSizeChart(description?: string | null) {
  const source = description || "";
  const markerIndex = source.search(/\*\*Size Chart\*\*/i);
  if (markerIndex < 0) return { description: source, sizeChartHtml: "" };

  const chartBlock = source.slice(markerIndex);
  const tableText = chartBlock.match(/\[\[table\]\]\s*([\s\S]*?)\s*\[\[\/table\]\]/i)?.[1];
  if (!tableText) return { description: source, sizeChartHtml: "" };
  const rows = tableText.split(/\r?\n/).map((row) => row.split("|").map((cell) => cell.trim()).filter(Boolean)).filter((row) => row.length > 1);
  if (rows.length < 2) return { description: source, sizeChartHtml: "" };

  const notice = chartBlock.match(/\[\[\/table\]\]\s*__([^_]+)__/i)?.[1]?.trim() || "All measurements are in CM.";
  const rowHtml = (row: string[], cell: "th" | "td") => `<tr>${row.map((value) => `<${cell}>${escapeHtml(value)}</${cell}>`).join("")}</tr>`;
  const sizeChartHtml = `<table><thead>${rowHtml(rows[0], "th")}</thead><tbody>${rows.slice(1).map((row) => rowHtml(row, "td")).join("")}</tbody></table><p><em>${escapeHtml(notice)}</em></p>`;
  return { description: source.slice(0, markerIndex).trim(), sizeChartHtml };
}

export function resolveProductSizeChart(sizeChartHtml?: string | null, description?: string | null) {
  const stored = parseProductSizeChartHtml(sizeChartHtml);
  if (stored) return stored;
  const legacy = extractLegacyImportedSizeChart(description);
  return parseProductSizeChartHtml(legacy.sizeChartHtml);
}
