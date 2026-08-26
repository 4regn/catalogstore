const SUPPORTED_HOSTS = ["shein.com", "temu.com", "nike.com", "superbalist.com"];
// Product cards can use modest files, but these are also the source for a
// full-screen gallery. Preserve verified gallery-quality supplier images.
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
// A multicolour SHEIN product can have 15–30 genuine gallery photos. The old
// 45 MB aggregate cap was reached by the first colour's high-res photos, then
// silently left later colour galleries as supplier links instead of importing
// them. Keep the individual 8 MB guardrail but allow a complete product set.
const MAX_TOTAL_IMAGE_BYTES = 120 * 1024 * 1024;
const MIN_HIGH_RES_EDGE = 900;

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

function startProgressHeartbeat(tabId, requestId, message) {
  const interval = setInterval(() => progress(tabId, requestId, message), 20000);
  return () => clearInterval(interval);
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

function sheinImageCandidates(value) {
  try {
    const url = new URL(value);
    if (!/(?:^|\.)ltwebstatic\.com$/i.test(url.hostname)) return [url.toString()];
    const candidates = [1200, 900].map((width) => {
      const candidate = new URL(url.toString());
      candidate.pathname = candidate.pathname.replace(/_thumbnail_\d+x\d*\.(?:jpe?g|png|webp)$/i, `_thumbnail_${width}x.webp`);
      return candidate.toString();
    });
    return [...new Set([...candidates, url.toString()])];
  } catch {
    return [value];
  }
}

async function decodedImageSize(blob) {
  if (typeof createImageBitmap !== "function") return { width: 0, height: 0 };
  const bitmap = await createImageBitmap(blob);
  const size = { width: bitmap.width, height: bitmap.height };
  bitmap.close?.();
  return size;
}

async function copyBestImage(url) {
  let bestLowResolution = null;
  for (const candidate of sheinImageCandidates(url)) {
    const response = await fetchImage(candidate);
    if (!response.ok) continue;
    const type = (response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!type.startsWith("image/")) continue;
    const blob = await response.blob();
    if (!blob.size || blob.size > MAX_IMAGE_BYTES) continue;
    const dimensions = await decodedImageSize(blob).catch(() => ({ width: 0, height: 0 }));
    const record = { candidate, type, bytes: blob.size, dimensions, blob };
    if (Math.max(dimensions.width, dimensions.height) >= MIN_HIGH_RES_EDGE) return record;
    if (!bestLowResolution || Math.max(dimensions.width, dimensions.height) > Math.max(bestLowResolution.dimensions.width, bestLowResolution.dimensions.height)) bestLowResolution = record;
  }
  return bestLowResolution;
}

async function downloadImages(urls, onProgress) {
  const images = [];
  const copiedByKey = {};
  const warnings = [];
  const imageDetails = [];
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
      const copied = await copyBestImage(url);
      if (!copied || totalBytes + copied.bytes > MAX_TOTAL_IMAGE_BYTES) {
        warnings.push(`A supplier photo could not be copied within the ${Math.round(MAX_TOTAL_IMAGE_BYTES / 1024 / 1024)} MB import limit.`);
      } else {
        const bytes = new Uint8Array(await copied.blob.arrayBuffer());
        totalBytes += bytes.length;
        copiedImage = `data:${copied.type};base64,${bytesToBase64(bytes)}`;
        imageDetails.push({ width: copied.dimensions.width, height: copied.dimensions.height, bytes: copied.bytes, sourceUrl: copied.candidate });
        if (Math.max(copied.dimensions.width, copied.dimensions.height) < MIN_HIGH_RES_EDGE) {
          warnings.push("One or more supplier photos are below the high-resolution threshold; review them before publishing.");
        }
      }
    } catch {
      warnings.push("One or more supplier photos could not be copied; their original URLs were kept for review.");
    }
    images.push(copiedImage);
    copiedByKey[key] = copiedImage;
    onProgress?.(index + 1, uniqueUrls.length);
  }
  return { images, copiedByKey, imageDetails, warnings: [...new Set(warnings)] };
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
    const stopReadingHeartbeat = startProgressHeartbeat(dashboardTabId, requestId, "Still reading colour variants, stock and the size chart…");
    let captured;
    try {
      captured = await sendToTab(tab.id, { type: "CATALOG_CAPTURE_PAGE" });
    } finally {
      stopReadingHeartbeat();
    }
    if (!captured.ok) throw new Error(captured.error || "The rendered product could not be captured.");
    progress(dashboardTabId, requestId, "Copying supplier photos into CatalogStore...");
    const stopCopyingHeartbeat = startProgressHeartbeat(dashboardTabId, requestId, "Still copying verified high-resolution supplier photos…");
    let copied;
    try {
      copied = await downloadImages(captured.product.images || [], (completed, total) => {
        progress(dashboardTabId, requestId, `Copying supplier photos into CatalogStore (${completed}/${total})...`);
      });
    } finally {
      stopCopyingHeartbeat();
    }
    const copiedVariants = (captured.product.variants || []).map((group) => ({
      ...group,
      images: Object.fromEntries(Object.entries(group.images || {}).map(([option, image]) => {
        const gallery = Array.isArray(image) ? image : [image];
        return [option, gallery.map((item) => copied.copiedByKey[canonicalImageKey(item)] || item).filter(Boolean)];
      })),
    }));
    sendResponse({
      ok: true,
      product: {
        ...captured.product,
        images: copied.images,
        imageDetails: copied.imageDetails,
        variants: copiedVariants,
        warnings: [...new Set([...(captured.product.warnings || []), ...copied.warnings])],
      },
    });
  })().catch((error) => sendResponse({ ok: false, error: error?.message || "Browser capture failed." }));
  return true;
});
