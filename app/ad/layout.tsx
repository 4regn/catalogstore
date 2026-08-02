// Hide overflow on body while the ad page is mounted so the fullscreen
// motion graphic doesn't show scrollbars or the global affiliate banner
// peeking through behind it.
export const metadata = {
  title: "CatalogStore — Built for South African Sellers",
  description: "60-second ad for CatalogStore.",
};

export default function AdLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <style>{`html, body { overflow: hidden !important; margin: 0; padding: 0; }`}</style>
      {children}
    </>
  );
}
