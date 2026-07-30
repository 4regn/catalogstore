type UnikLabsStoreProps = {
  initialSeller: {
    store_name?: string | null;
    tagline?: string | null;
    description?: string | null;
  };
};

const DEFAULT_DESCRIPTION =
  "UNIK Labs turns your own photos into custom AI-designed streetwear. Pick a style, upload your photos, and we print and ship a one-of-one tee or hoodie made just for you, anywhere in South Africa.";

// Visually hidden but present in the DOM -- same technique used for
// accessible icon-button labels, not "different content for crawlers".
const srOnly: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0,0,0,0)",
  whiteSpace: "nowrap",
  border: 0,
};

/**
 * Private UNIK storefront bridge.
 *
 * The existing UNIK experience remains intact while its product, order and
 * payment calls are progressively moved onto Catalogstore's backend. Keeping
 * it behind the normal seller route means subscription checks and the private
 * template allowlist still run before anything is displayed.
 *
 * The real storefront markup lives in the static HTML loaded into the
 * iframe below, so this document -- the one search crawlers and Google's
 * OAuth consent-screen branding review actually fetch -- previously had no
 * text of its own at all beyond the iframe's title attribute. The h1/p
 * pair mirrors the iframe's own copy so it's real, matching content rather
 * than crawler-only text.
 */
export default function UnikLabsStore({ initialSeller }: UnikLabsStoreProps) {
  const name = initialSeller.store_name || "UNIK Labs";
  const description = initialSeller.tagline || initialSeller.description || DEFAULT_DESCRIPTION;

  return (
    <main style={{ width: "100%", height: "100dvh", overflow: "hidden", background: "#050505" }}>
      <h1 style={srOnly}>{name}</h1>
      <p style={srOnly}>{description}</p>
      <iframe
        src="/private-templates/unik-labs/index.html"
        title={`${name} storefront`}
        allow="clipboard-read; clipboard-write"
        style={{ width: "100%", height: "100%", display: "block", border: 0, background: "#050505" }}
      />
    </main>
  );
}
