// Same full-viewport iframe shell as UnikLabsStore.tsx (the storefront
// home), reused for every other UNIK "page" that's really a static HTML
// file under public/private-templates/unik-labs/ -- this is what gives
// each of them a real, addressable, shareable URL (uniklabs.co.za/studio,
// /upload, /checkout) instead of every internal navigation just changing
// the iframe's own src while the browser's address bar sits frozen on
// whatever URL the visitor first landed on.
export default function UnikLabsIframePage({ file, title }: { file: string; title: string }) {
  return (
    <main style={{ width: "100%", height: "100dvh", overflow: "hidden", background: "#050505" }}>
      <iframe
        src={`/private-templates/unik-labs/${file}`}
        title={title}
        allow="clipboard-read; clipboard-write"
        style={{ width: "100%", height: "100%", display: "block", border: 0, background: "#050505" }}
      />
    </main>
  );
}
