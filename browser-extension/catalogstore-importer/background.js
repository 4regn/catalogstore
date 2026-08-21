const SUPPORTED_HOSTS = ["shein.com", "temu.com", "nike.com", "superbalist.com"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 20 * 1024 * 1024;

function supportedUrl(rawUrl) {
  try {
    const parsed = new URL(rawUrl);
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return parsed.protocol === "https:" && SUPPORTED_HOSTS.some((allowed) => host === allowed || host.endsWith("." + allowed));
  } catch {
    return false;
  }
}

function progress(tabId, requestId, message) {
  chrome.tabs.sendMessage(tabId, { type: "CATALOG_CAPTURE_PROGRESS", requestId, message }).catch(() => {});
}

function waitForTab(tabId) {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      reject(new Error("The supplier page took too long to load."));
    }, 70000);
    const listener = (updatedId, info) => {
      if (updatedId !== tabId || info.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    };
    chrome.tabs.onUpdated.addListener(listener);
    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status !== "complete") return;
      clearTimeout(timeout);
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }).catch(() => {});
  });
}

function sendToTab(tabId, message) {
  return new Promise((resolve, reject) => {
    let attempts = 0;
    const trySend = () => {
      chrome.tabs.sendMessage(tabId, message, (response) => {
        if (!chrome.runtime.lastError && response) return resolve(response);
        attempts += 1;
        if (attempts >= 12) return reject(new Error("The capture worker did not start on the supplier page. Reload the extension and try again."));
        setTimeout(trySend, 500);
      });
    };
    trySend();
  });
}

function bytesToBase64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}

function canonicalImageKey(value) {
  try {
    const url = new URL(value);
    return `${url.hostname}${url.pathname}`
      .replace(/(_thumbnail|_square|_main|_medium|_small)?_\d+x\d*(?=\.)/gi, "")
      .replace(/\.(webp|jpe?g|png)$/i, "");
  } catch {
    return String(value || "");
  }
}

async function fetchImage(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    return await fetch(url, {
      credentials: "omit",
      cache: "no-store",
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function downloadImages(urls, onProgress) {
  const images = [];
  const copiedByKey = {};
  const warnings = [];
  let totalBytes = 0;
  const seen = new Set();
  const uniqueUrls = urls.filter((url) => {
    const key = canonicalImageKey(url);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 60);
  for (let index = 0; index < uniqueUrls.length; index += 1) {
    const url = uniqueUrls[index];
    const key = canonicalImageKey(url);
    let copiedImage = url;
    try {
      const response = await fetchImage(url);
      if (!response.ok) throw new Error(String(response.status));
      const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!type.startsWith("image/")) throw new Error("not an image");
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!bytes.length || bytes.length > MAX_IMAGE_BYTES || totalBytes + bytes.length > MAX_TOTAL_IMAGE_BYTES) {
        warnings.push("One or more very large supplier photos were skipped.");
      } else {
        totalBytes += bytes.length;
        copiedImage = `data:${type};base64,${bytesToBase64(bytes)}`;
      }
    } catch {
      warnings.push("One or more supplier photos could not be copied; their original URLs were kept for review.");
    }
    images.push(copiedImage);
    copiedByKey[key] = copiedImage;
    onProgress?.(index + 1, uniqueUrls.length);
  }
  return { images, copiedByKey, warnings: [...new Set(warnings)] };
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== "CATALOG_CAPTURE_START") return;
  const dashboardTabId = sender.tab?.id;
  const requestId = String(message.requestId || "");
  const url = String(message.url || "");
  if (!dashboardTabId || !requestId || !supportedUrl(url)) {
    sendResponse({ ok: false, error: "Use a valid SHEIN, Temu, Nike or Superbalist HTTPS product URL." });
    return;
  }

  (async () => {
    progress(dashboardTabId, requestId, "Opening the product in a dedicated Chrome tab...");
    const tab = await chrome.tabs.create({ url, active: true });
    if (!tab.id) throw new Error("Chrome could not open the supplier tab.");
    await waitForTab(tab.id);
    progress(dashboardTabId, requestId, "Waiting for the rendered photos, price and size controls...");
    const captured = await sendToTab(tab.id, { type: "CATALOG_CAPTURE_PAGE" });
    if (!captured.ok) throw new Error(captured.error || "The rendered product could not be captured.");
    progress(dashboardTabId, requestId, "Copying supplier photos into CatalogStore...");
    const copied = await downloadImages(captured.product.images || [], (completed, total) => {
      progress(dashboardTabId, requestId, `Copying supplier photos into CatalogStore (${completed}/${total})...`);
    });
    const copiedVariants = (captured.product.variants || []).map((group) => ({
      ...group,
      images: Object.fromEntries(Object.entries(group.images || {}).map(([option, image]) => [
        option,
        copied.copiedByKey[canonicalImageKey(image)] || image,
      ])),
    }));
    sendResponse({
      ok: true,
      product: {
        ...captured.product,
        images: copied.images,
        variants: copiedVariants,
        warnings: [...new Set([...(captured.product.warnings || []), ...copied.warnings])],
      },
    });
  })().catch((error) => sendResponse({ ok: false, error: error?.message || "Browser capture failed." }));
  return true;
});
