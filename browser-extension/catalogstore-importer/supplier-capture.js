(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const uniq = (values) => [...new Set(values.map(clean).filter(Boolean))];
  const supplier = () => location.hostname.includes("shein") ? "SHEIN" : location.hostname.includes("temu") ? "Temu" : location.hostname.includes("nike") ? "Nike" : "Superbalist";

  function verificationPage() {
    const text = clean(document.body?.innerText);
    return /captcha|verify you are human|security verification|slide to verify|unusual traffic|access denied/i.test(text) ||
      !!document.querySelector('iframe[src*="captcha" i],[class*="captcha" i],[id*="captcha" i]');
  }

  function meta(name) {
    return clean(document.querySelector(`meta[property="${name}"],meta[name="${name}"]`)?.getAttribute("content"));
  }

  function jsonLdProducts() {
    const found = [];
    const visit = (node) => {
      if (!node) return;
      if (Array.isArray(node)) return node.forEach(visit);
      if (typeof node !== "object") return;
      const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
      if (types.some((type) => String(type).toLowerCase() === "product")) found.push(node);
      if (node["@graph"]) visit(node["@graph"]);
    };
    document.querySelectorAll('script[type="application/ld+json"]').forEach((script) => {
      try { visit(JSON.parse(script.textContent || "")); } catch {}
    });
    return found;
  }

  function price(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    const text = clean(value).replace(/\u00a0/g, " ");
    const match = text.match(/(?:R|ZAR|US\$|\$|€|£)?\s*([0-9][0-9\s,.]*)/i);
    if (!match) return null;
    let raw = match[1].replace(/\s/g, "");
    if (raw.includes(",") && raw.includes(".")) raw = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
    else if (/^\d{1,3}(,\d{3})+$/.test(raw)) raw = raw.replace(/,/g, "");
    else raw = raw.replace(",", ".");
    const number = Number(raw);
    return Number.isFinite(number) ? Math.round(number * 100) / 100 : null;
  }

  function bestImageSource(img) {
    const srcset = clean(img.getAttribute("srcset") || img.getAttribute("data-srcset"));
    if (srcset) {
      const entries = srcset.split(",").map((part) => part.trim().split(/\s+/)).filter((part) => part[0]);
      if (entries.length) return entries[entries.length - 1][0];
    }
    return img.currentSrc || img.getAttribute("src") || img.getAttribute("data-src") || img.getAttribute("data-original") || "";
  }

  function absoluteImage(value) {
    try {
      const url = new URL(value.startsWith("//") ? "https:" + value : value, location.href);
      if (!/^https?:$/.test(url.protocol)) return "";
      return url.toString();
    } catch { return ""; }
  }

  function images(product) {
    const values = [];
    const add = (value) => {
      if (Array.isArray(value)) return value.forEach(add);
      if (typeof value !== "string") return;
      const url = absoluteImage(value);
      if (url && !/logo|icon|avatar|sprite|placeholder|payment|badge/i.test(url)) values.push(url);
    };
    add(product?.image);
    add(meta("og:image"));
    document.querySelectorAll("img").forEach((img) => {
      const source = bestImageSource(img);
      const context = clean(`${img.alt} ${img.className} ${img.closest('[class*="product" i],[class*="gallery" i]')?.className || ""}`);
      const largeEnough = img.naturalWidth >= 250 || img.naturalHeight >= 250;
      const supplierCdn = /shein|ltwebstatic|temu|kwcdn|nike|superbalist|cloudfront/i.test(source);
      if ((largeEnough || supplierCdn) && !/logo|icon|avatar|payment|review/i.test(context)) add(source);
    });
    return uniq(values).slice(0, 10);
  }

  function disabled(el) {
    const text = clean(`${el.className} ${el.getAttribute("aria-label")} ${el.textContent}`);
    return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || /sold.?out|disabled|unavailable|out.?of.?stock/i.test(text) || getComputedStyle(el).pointerEvents === "none";
  }

  function variants() {
    const sizeNodes = [...document.querySelectorAll('[data-attr_value_name][role="radio"],[data-attr_value_name].product-intro__size-radio,[role="radiogroup"] [role="radio"],button[data-testid*="size" i],button[class*="size" i]')];
    const sizeRows = [];
    for (const el of sizeNodes) {
      const value = clean(el.getAttribute("data-attr_value_name") || el.getAttribute("aria-label") || el.textContent);
      if (!value || value.length > 30 || /size guide|select size|find your size/i.test(value)) continue;
      if (!/^(?:XX?S|S|M|L|X{1,4}L|[2-6]XL|UK\s*\d+(?:\.5)?|US\s*\d+(?:\.5)?|EU\s*\d+(?:\.5)?|\d{1,3}(?:\.5)?)$/i.test(value) && !el.hasAttribute("data-attr_value_name")) continue;
      sizeRows.push({ value, available: !disabled(el) });
    }
    const allSizes = uniq(sizeRows.map((row) => row.value));
    const availableSizes = uniq(sizeRows.filter((row) => row.available).map((row) => row.value));

    const colorValues = [];
    document.querySelectorAll('[data-attr_value_name][class*="color" i],[aria-label*="colour" i],[aria-label*="color" i],[data-testid*="color" i],[data-testid*="colour" i]').forEach((el) => {
      const value = clean(el.getAttribute("data-attr_value_name") || el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent)
        .replace(/^(?:color|colour)\s*:?\s*/i, "");
      if (value && value.length <= 40 && !/select|swatch/i.test(value)) colorValues.push(value);
    });

    const groups = [];
    if (availableSizes.length) groups.push({ name: "Size", options: availableSizes });
    if (uniq(colorValues).length) groups.push({ name: "Color", options: uniq(colorValues).slice(0, 40) });
    return { groups, allSizes, availableSizes, soldOutSizes: allSizes.filter((value) => !availableSizes.includes(value)) };
  }

  function capture() {
    const product = jsonLdProducts()[0];
    const offer = Array.isArray(product?.offers) ? product.offers[0] : product?.offers;
    const title = clean(product?.name || meta("og:title") || document.querySelector("h1")?.textContent || document.title.replace(/\s*[|–-].*$/, ""));
    const mainPriceNode = document.querySelector('#productMainPriceId,.productPrice__main,[data-testid*="current-price" i],[class*="product-price" i],[class*="current-price" i]');
    const oldPriceNode = document.querySelector('.productDiscountInfo__retail,.productEstimatedTagNewRetail__retail,[data-testid*="original-price" i],[class*="old-price" i],[class*="original-price" i]');
    const sellingPrice = price(offer?.price ?? mainPriceNode?.getAttribute("aria-label") ?? mainPriceNode?.textContent ?? meta("product:price:amount"));
    const compareAtPrice = price(offer?.highPrice ?? oldPriceNode?.getAttribute("aria-label") ?? oldPriceNode?.textContent);
    const variantData = variants();
    const pageText = clean(document.body?.innerText);
    const soldOutPage = /\b(sold out|out of stock|currently unavailable)\b/i.test(pageText);
    const inStock = variantData.allSizes.length ? variantData.availableSizes.length > 0 : !soldOutPage;
    const capturedImages = images(product);
    const warnings = [];
    if (!capturedImages.length) warnings.push("No product photos were detected; add photos manually before publishing.");
    if (!variantData.groups.length) warnings.push("No selectable sizes or colours were detected; confirm variants manually.");
    if (variantData.soldOutSizes.length) warnings.push(`Sold-out sizes were excluded: ${variantData.soldOutSizes.join(", ")}.`);
    return {
      sourceUrl: location.href,
      supplier: supplier(),
      title,
      price: sellingPrice,
      compareAtPrice: compareAtPrice && sellingPrice && compareAtPrice > sellingPrice ? compareAtPrice : null,
      currency: clean(offer?.priceCurrency || meta("product:price:currency") || "ZAR").toUpperCase(),
      description: clean(product?.description || meta("og:description") || meta("description")).slice(0, 2500),
      images: capturedImages,
      variants: variantData.groups,
      inStock,
      stockNote: variantData.allSizes.length ? `${variantData.availableSizes.length} of ${variantData.allSizes.length} detected sizes currently available.` : (inStock ? "The page appears to be available." : "The supplier page appears sold out."),
      captureMethod: "browser",
      warnings,
    };
  }

  async function captureWhenReady() {
    const started = Date.now();
    let last = null;
    let stable = 0;
    while (Date.now() - started < 60000) {
      if (verificationPage()) {
        await sleep(1500);
        continue;
      }
      const current = capture();
      const key = JSON.stringify([current.title, current.price, current.images.length, current.variants]);
      stable = last === key ? stable + 1 : 0;
      last = key;
      if (current.title && current.images.length && stable >= 2) return current;
      await sleep(1200);
    }
    if (verificationPage()) throw new Error("Supplier verification is still blocking the page. Complete it in the opened tab, then run Browser Capture again.");
    const partial = capture();
    if (!partial.title || (!partial.images.length && partial.price === null)) throw new Error("The page loaded, but no reliable product details were found. Confirm this is a product URL and try again.");
    partial.warnings.push("The supplier page did not fully settle; review every field before publishing.");
    return partial;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "CATALOG_CAPTURE_PAGE") return;
    captureWhenReady()
      .then((product) => sendResponse({ ok: true, product }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Could not capture this product page." }));
    return true;
  });
})();
