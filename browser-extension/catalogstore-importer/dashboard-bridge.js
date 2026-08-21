(() => {
  const APP_SOURCE = "catalogstore-product-importer";
  const EXTENSION_SOURCE = "4regn-catalog-importer-extension";

  const post = (message) => window.postMessage({ source: EXTENSION_SOURCE, ...message }, window.location.origin);

  window.addEventListener("message", (event) => {
    if (event.source !== window || event.data?.source !== APP_SOURCE) return;
    if (event.data.type === "PING") {
      post({ type: "PONG", version: chrome.runtime.getManifest().version });
      return;
    }
    if (event.data.type !== "CAPTURE_PRODUCT") return;
    const { requestId, url } = event.data;
    post({ type: "CAPTURE_PROGRESS", requestId, message: "Browser capture extension detected. Opening the supplier page..." });
    chrome.runtime.sendMessage({ type: "CATALOG_CAPTURE_START", requestId, url }, (response) => {
      if (chrome.runtime.lastError) {
        post({ type: "CAPTURE_RESULT", requestId, ok: false, error: chrome.runtime.lastError.message });
        return;
      }
      post({ type: "CAPTURE_RESULT", requestId, ...(response || { ok: false, error: "The capture extension did not respond." }) });
    });
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message?.type !== "CATALOG_CAPTURE_PROGRESS") return;
    post({ type: "CAPTURE_PROGRESS", requestId: message.requestId, message: message.message });
  });
})();
