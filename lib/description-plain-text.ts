// Strips the custom description markup htmlToDescriptionMarkup() produces
// (scripts/lib/migrate-shared.ts) -- **bold**, __italic__,
// [[color:VALUE]]...[[/color]], and [[table]]...[[/table]] (rows joined by
// "\n", cells by " | ", same convention FourRegnStore.tsx's DescriptionText/
// DescriptionTable read for the real render) -- down to plain text for
// contexts that can't render it: <meta name="description">, OpenGraph/
// Twitter descriptions, JSON-LD. Without this, those tags shipped the raw
// tokens verbatim (confirmed on live product pages with a bold/color/table
// description: the Google-snippet-equivalent text read literally
// "**Premium** cotton [[color:#c00]]Sale![[/color]]" or a wall of
// "Chest | 36 | 38 | 40" table rows) instead of clean copy.
export function descriptionToPlainText(raw: string): string {
  return raw
    .replace(/\[\[table\]\]([\s\S]*?)\[\[\/table\]\]/g, (_m, rows: string) =>
      rows
        .split("\n")
        .map((row: string) => row.split(" | ").join(" "))
        .join(" ")
    )
    .replace(/\[\[color:[^\]]+\]\]([\s\S]*?)\[\[\/color\]\]/g, "$1")
    .replace(/\*\*([\s\S]*?)\*\*/g, "$1")
    .replace(/__([\s\S]*?)__/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}
