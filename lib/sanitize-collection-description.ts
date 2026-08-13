// Shopify collection descriptions for 4regn use only paragraphs, simple
// emphasis, line breaks and inline colour. Keep that small formatting subset
// while stripping scripts, event handlers, metadata and every other tag before
// the HTML is ever sent to a shopper's browser.
export function sanitizeCollectionDescriptionHtml(html: string): string {
  return (html || "")
    .replace(/<meta\b[^>]*>/gi, "")
    .replace(/<(script|style|iframe|object|embed)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s(href|src)\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/<\/?(?!p\b|br\b|strong\b|em\b|span\b|div\b)[a-z][^>]*>/gi, "")
    .replace(/<(p|strong|em|div)\b[^>]*>/gi, "<$1>")
    .replace(/<br\b[^>]*>/gi, "<br>")
    .replace(/<span\b([^>]*)>/gi, (_match, attrs: string) => {
      const color = attrs.match(/(?:^|;)\s*color\s*:\s*(#[0-9a-f]{3,8}|rgb\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*\))/i)?.[1];
      return color ? `<span style="color:${color}">` : "<span>";
    });
}
