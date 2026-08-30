// Shared by the storefront's search overlay (FourRegnStore.tsx's `searched`)
// and the dedicated /search results page (search/page.tsx's `matched`) --
// both need identical behavior since the page is meant to be a shareable
// URL for the same results the popup shows (see that route's own comment).

// Lowercases and replaces anything that isn't a letter or digit with a
// space, so punctuation never blocks a match: "A-Reece" and "a reece" (or
// "a & reece") all normalize to the same "a reece".
function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function tokenize(text: string): string[] {
  const n = normalize(text);
  return n ? n.split(" ") : [];
}

// Optimal-string-alignment distance: like Levenshtein but an adjacent
// transposition ("klevin" -> "kelvin") costs 1 edit instead of 2 --
// swapped letters are the single most common typo, so plain Levenshtein
// under-tolerates exactly the mistake most worth catching. Words here are
// short (a few chars), so a full DP grid per pair is cheap even across a
// few hundred products.
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        dp[i][j] = Math.min(dp[i][j], dp[i - 2][j - 2] + 1);
      }
    }
  }
  return dp[m][n];
}

// How many typos a word this long can absorb before it's a different word
// rather than a misspelling -- short words stay exact-only (fuzzy-matching
// "cap" would otherwise match almost anything), longer words tolerate more.
function typoBudget(len: number): number {
  if (len <= 3) return 0;
  if (len <= 6) return 1;
  return 2;
}

function tokenMatches(queryToken: string, haystackTokens: string[]): boolean {
  // Only "haystack word contains query word" (e.g. query "cap" matches
  // product word "caps"), not the reverse -- matching the other direction
  // let short, common haystack words (like the lone "a" in "A-Reece")
  // trivially satisfy almost any query that happens to contain that
  // letter, which turned unrelated products into false positives.
  for (const t of haystackTokens) {
    if (t.includes(queryToken)) return true;
  }
  const budget = typoBudget(queryToken.length);
  if (budget === 0) return false;
  for (const t of haystackTokens) {
    if (Math.abs(t.length - queryToken.length) > budget) continue;
    if (editDistance(queryToken, t, budget) <= budget) return true;
  }
  return false;
}

/* Multi-word, punctuation-insensitive, typo-tolerant product search. Every
   word in the query must match somewhere in the product's name/category
   text -- as a substring or, for longer words, a near-miss spelling -- but
   not necessarily in the same order or adjacent to each other. So "cap
   trucker" and "trucker cap" both find "Trucker Caps & Beanies", "a reece"
   finds "A-Reece" despite the hyphen, and a small typo like "truker cap"
   still surfaces the same result instead of coming back empty. */
export function productMatchesQuery(product: { name?: string | null; category?: string | null }, query: string): boolean {
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) return true;
  const haystackTokens = tokenize(`${product.name || ""} ${product.category || ""}`);
  if (haystackTokens.length === 0) return false;
  return queryTokens.every((qt) => tokenMatches(qt, haystackTokens));
}
