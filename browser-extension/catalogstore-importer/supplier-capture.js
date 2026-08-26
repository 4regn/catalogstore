(() => {
  const clean = (value) => String(value || "").replace(/\s+/g, " ").trim();
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const uniq = (values) => [...new Set(values.map(clean).filter(Boolean))];
  const supplier = () => location.hostname.includes("shein") ? "SHEIN" : location.hostname.includes("temu") ? "Temu" : location.hostname.includes("nike") ? "Nike" : "Superbalist";
  const isShein = () => location.hostname.includes("shein");

  function decode(value) {
    const textarea = document.createElement("textarea");
    let decoded = String(value || "");
    for (let index = 0; index < 3; index += 1) {
      textarea.innerHTML = decoded;
      const next = textarea.value;
      if (next === decoded) break;
      decoded = next;
    }
    return clean(decoded);
  }

  function productTitle(product) {
    const raw = product?.name || meta("og:title") || document.querySelector("h1")?.textContent || document.title;
    return decode(raw)
      .replace(/\s*[|｜]\s*SHEIN(?:\s+South Africa)?\s*$/i, "")
      .replace(/\s*[|｜]\s*(Temu|Nike|Superbalist).*$/i, "")
      .replace(/\s+-\s+SHEIN(?:\s+South Africa)?\s*$/i, "");
  }

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
      if (types.some((type) => ["product", "productgroup"].includes(String(type).toLowerCase()))) found.push(node);
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
      if (!value || /^data:/i.test(value)) return "";
      const url = new URL(value.startsWith("//") ? "https:" + value : value, location.href);
      if (!/^https?:$/.test(url.protocol)) return "";
      // SHEIN exposes both small card thumbnails and larger gallery renditions
      // under the same stable image id. The background worker verifies the
      // decoded pixels before the image is allowed into an import.
      if (isShein() && /(?:^|\.)ltwebstatic\.com$/i.test(url.hostname)) {
        url.pathname = url.pathname.replace(/_thumbnail_\d+x\d*\.(?:jpe?g|png|webp)$/i, "_thumbnail_1200x.webp");
      }
      return url.toString();
    } catch { return ""; }
  }

  function imageKey(value) {
    try {
      const url = new URL(value);
      const path = url.pathname
        .replace(/(_thumbnail|_square|_main|_medium|_small)?_\d+x\d+(?=\.)/gi, "")
        .replace(/\.webp$/i, "")
        .replace(/\.jpg$/i, "")
        .replace(/\.jpeg$/i, "")
        .replace(/\.png$/i, "");
      return `${url.hostname}${path}`;
    } catch {
      return value;
    }
  }

  function imageLooksLikeProduct(url, img, context) {
    if (!url || /^data:/i.test(url)) return false;
    if (/logo|icon|avatar|sprite|placeholder|payment|badge|emoji|fire|review|comment|star|loading/i.test(`${url} ${context}`)) return false;
    if (isShein()) {
      if (!/ltwebstatic|shein/i.test(url)) return false;
      if (/\/(avatar|comment|review|user|icon|sprite|logo|payment|badge)\//i.test(url)) return false;
      const galleryContext = /product-intro|product-detail|goods-detail|goods-img|gallery|swiper|crop-image|j-expose__product-intro/i.test(context);
      const fileLooksProduct = /\/goods|\/product|\/images3?\//i.test(url) || /_thumbnail_|_main_|_square_|_medium_/i.test(url);
      const largeEnough = !img || img.naturalWidth >= 250 || img.naturalHeight >= 250 || img.clientWidth >= 120 || img.clientHeight >= 120;
      return (galleryContext || fileLooksProduct) && largeEnough;
    }
    return true;
  }

  function sheinGalleryFromDom() {
    if (!isShein()) return [];
    const values = [];
    const seen = new Set();
    const add = (value) => {
      const url = absoluteImage(value);
      const key = imageKey(url);
      if (url && key && !seen.has(key)) {
        seen.add(key);
        values.push(url);
      }
    };
    const sections = [...document.querySelectorAll('section.main-picture,section[aria-label="Product images" i]')]
      .filter((section, index, all) => all.indexOf(section) === index);
    const ranked = sections
      .map((section) => {
        const rect = section.getBoundingClientRect();
        const style = getComputedStyle(section);
        const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        return { section, score: visible ? rect.width * rect.height : 0 };
      })
      .sort((left, right) => right.score - left.score);
    const gallery = ranked[0]?.section;
    if (!gallery) return [];
    gallery.querySelectorAll([
      '[data-before-crop-src*="_thumbnail_" i]',
      '[data-before-crop-src]',
    ].join(",")).forEach((element) => add(element.getAttribute("data-before-crop-src")));
    return values.slice(0, 20);
  }

  function images(product) {
    const values = [];
    const keys = new Set();
    const add = (value) => {
      if (Array.isArray(value)) return value.forEach(add);
      if (typeof value !== "string") return;
      const url = absoluteImage(value);
      const key = imageKey(url);
      if (url && !keys.has(key) && !/logo|icon|avatar|sprite|placeholder|payment|badge|emoji|fire/i.test(url)) {
        keys.add(key);
        values.push(url);
      }
    };

    if (isShein()) {
      const active = colorNodes().find((node) => node.getAttribute("aria-checked") === "true" || /\bactive\b/i.test(clean(node.className)));
      const activeKey = imageKey(absoluteImage(active?.querySelector?.("[data-before-crop-src]")?.getAttribute("data-before-crop-src") || ""));
      const domGallery = sheinGalleryFromDom();
      if (domGallery.length && (!activeKey || imageKey(domGallery[0]) === activeKey)) return domGallery;

      // The schema is a clean fallback on the initial page, but SHEIN can leave it
      // stale after a colour switch, so only trust it when it matches the swatch.
      add(product?.image);
      if (values.length && (!activeKey || imageKey(values[0]) === activeKey)) return values.slice(0, 20);
      return domGallery.length ? domGallery : values.slice(0, 20);
    } else {
      add(product?.image);
      add(meta("og:image"));
    }

    const gallerySelectors = isShein()
      ? [
          '[class*="product-intro" i] img',
          '[class*="product-detail" i] img',
          '[class*="goods-detail" i] img',
          '[class*="gallery" i] img',
          '[class*="swiper" i] img',
        ].join(",")
      : "img";

    document.querySelectorAll(gallerySelectors).forEach((img) => {
      const source = bestImageSource(img);
      const context = clean(`${img.alt} ${img.className} ${img.closest('[class*="product" i],[class*="gallery" i]')?.className || ""}`);
      const largeEnough = img.naturalWidth >= 250 || img.naturalHeight >= 250 || img.clientWidth >= 120 || img.clientHeight >= 120;
      const supplierCdn = /shein|ltwebstatic|temu|kwcdn|nike|superbalist|cloudfront/i.test(source);
      const url = absoluteImage(source);
      if ((largeEnough || supplierCdn) && imageLooksLikeProduct(url, img, context)) add(url);
    });
    return values.slice(0, isShein() ? 10 : 16);
  }

  function disabled(el) {
    const text = clean(`${el.className} ${el.getAttribute("aria-label")} ${el.textContent}`);
    return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true" || /sold.?out|disabled|unavailable|out.?of.?stock/i.test(text) || getComputedStyle(el).pointerEvents === "none";
  }

  function colorNodes() {
    if (isShein()) {
      const groups = [...document.querySelectorAll([
        '.product-intro__color [role="radiogroup"][aria-label*="color" i]',
        '.product-intro__color .main-sales-attr__color-container[role="radiogroup"]',
        '[class*="product-intro__color" i] [role="radiogroup"][aria-label*="color" i]',
      ].join(","))];
      const ranked = groups
        .map((group) => {
          const rect = group.getBoundingClientRect();
          const style = getComputedStyle(group);
          const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
          return { group, score: visible ? rect.width * rect.height : 0 };
        })
        .sort((left, right) => right.score - left.score);
      const group = ranked[0]?.group;
      if (!group) return [];
      return [...group.querySelectorAll(':scope > [role="radio"],:scope > .radio-container[role="radio"]')]
        .filter((element, index, all) => all.indexOf(element) === index);
    }

    const candidates = [...document.querySelectorAll([
      '.product-intro__color-radio',
      '.product-intro__color-radio-inner',
      '[class*="product-intro__color" i] [data-attr_value_name]',
      '[class*="product-intro" i] [class*="color" i] [data-attr_value_name]',
      '.main-sales-attr__item',
      '.main-sales-attr__color-item',
      '[class*="main-sales-attr" i] [class*="radio-container" i]',
      '[class*="main-sales-attr" i] img',
      '[class*="radio-container__circleImage" i]',
      '[class*="radio-container__squareImage" i]',
      '[data-attr_name*="color" i]',
      '[data-attr_name*="colour" i]',
      '[aria-label*="color" i][role="radio"]',
      '[aria-label*="colour" i][role="radio"]',
    ].join(","))];

    const picked = [];
    const seen = new Set();
    for (const el of candidates) {
      const clickable = el.closest('[role="radio"],button,a,[tabindex],.product-intro__color-radio,.main-sales-attr__item,[class*="radio-container" i]') || el;
      if (seen.has(clickable)) continue;
      seen.add(clickable);
      const context = clean(`${clickable.className} ${clickable.getAttribute("data-attr_name")} ${clickable.getAttribute("aria-label")} ${clickable.closest('[class*="color" i],[class*="colour" i],[class*="main-sales-attr" i],[data-attr_name*="color" i],[data-attr_name*="colour" i]')?.className || ""}`);
      const hasImageSwatch = !!clickable.querySelector?.("img") || clickable.tagName === "IMG" || /circleImage|squareImage|main-sales-attr/i.test(context);
      if (!(/color|colour|main-sales-attr|radio-container/i.test(context) || hasImageSwatch)) continue;
      if (/size|guide|quantity|add to|shipping|coupon|recommend/i.test(context)) continue;
      picked.push(clickable);
    }

    return picked
      .filter((el) => {
        const context = clean(`${el.className} ${el.getAttribute("data-attr_name")} ${el.getAttribute("aria-label")} ${el.closest('[class*="color" i],[class*="colour" i],[class*="main-sales-attr" i],[data-attr_name*="color" i],[data-attr_name*="colour" i]')?.className || ""}`);
        const value = clean(el.getAttribute("data-attr_value_name") || el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent)
          .replace(/^(?:color|colour)\s*:?\s*/i, "");
        const hasImageSwatch = !!el.querySelector?.("img") || el.tagName === "IMG" || /circleImage|squareImage|main-sales-attr/i.test(context);
        return (hasImageSwatch || /color|colour|main-sales-attr/i.test(context)) && (!value || value.length <= 45) && !/size|guide|select size|quantity|add to/i.test(`${context} ${value}`);
      });
  }

  function variants(product) {
    const structuredRows = (Array.isArray(product?.hasVariant) ? product.hasVariant : [])
      .map((variant) => {
        const offer = Array.isArray(variant?.offers) ? variant.offers[0] : variant?.offers;
        return {
          value: clean(variant?.size),
          available: !/outofstock|soldout|discontinued/i.test(String(offer?.availability || "")),
        };
      })
      .filter((row) => row.value);
    const sizeSelector = isShein()
      ? '[class*="product-intro__size" i] [data-attr_value_name][role="radio"],[class*="product-intro__size" i] .product-intro__size-radio[role="radio"]'
      : '[data-attr_value_name][role="radio"],[data-attr_value_name].product-intro__size-radio,[role="radiogroup"] [role="radio"],button[data-testid*="size" i],button[class*="size" i]';
    const sizeNodes = [...document.querySelectorAll(sizeSelector)];
    const sizeRows = [];
    for (const el of sizeNodes) {
      const value = clean(el.getAttribute("data-attr_value_name") || el.getAttribute("aria-label") || el.textContent);
      if (!value || value.length > 30 || /size guide|select size|find your size/i.test(value)) continue;
      if (!/^(?:XX?S|S|M|L|X{1,4}L|[2-6]XL|UK\s*\d+(?:\.5)?|US\s*\d+(?:\.5)?|EU\s*\d+(?:\.5)?|\d{1,3}(?:\.5)?)$/i.test(value) && !el.hasAttribute("data-attr_value_name")) continue;
      sizeRows.push({ value, available: !disabled(el) });
    }
    // After a SHEIN colour switch the JSON-LD can remain on the original
    // colour. Prefer the live size radios and use structured rows as fallback.
    if (!sizeRows.length && structuredRows.length) sizeRows.push(...structuredRows);
    const allSizes = uniq(sizeRows.map((row) => row.value));
    const availableSizes = uniq(sizeRows.filter((row) => row.available).map((row) => row.value));

    const colorValues = [];
    colorNodes().forEach((el) => {
      const value = clean(el.getAttribute("data-attr_value_name") || el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent)
        .replace(/^(?:color|colour)\s*:?\s*/i, "");
      if (value && value.length <= 40 && !/select|swatch/i.test(value)) colorValues.push(value);
    });
    if (clean(product?.color)) colorValues.unshift(clean(product.color));

    const groups = [];
    if (availableSizes.length) groups.push({ name: "Size", options: availableSizes });
    if (uniq(colorValues).length) groups.push({ name: "Color", options: uniq(colorValues).slice(0, 40) });
    return { groups, allSizes, availableSizes, soldOutSizes: allSizes.filter((value) => !availableSizes.includes(value)) };
  }

  function capture() {
    const product = jsonLdProducts()[0];
    const firstVariant = Array.isArray(product?.hasVariant) ? product.hasVariant[0] : null;
    const offerSource = product?.offers || firstVariant?.offers;
    const offer = Array.isArray(offerSource) ? offerSource[0] : offerSource;
    const title = productTitle(product);
    const mainPriceNode = document.querySelector('#productMainPriceId,.productPrice__main,[data-testid*="current-price" i],[class*="product-price" i],[class*="current-price" i]');
    const oldPriceNode = document.querySelector('.productDiscountInfo__retail,.productEstimatedTagNewRetail__retail,[data-testid*="original-price" i],[class*="old-price" i],[class*="original-price" i]');
    const sellingPrice = price(offer?.price ?? mainPriceNode?.getAttribute("aria-label") ?? mainPriceNode?.textContent ?? meta("product:price:amount"));
    const compareAtPrice = price(offer?.highPrice ?? oldPriceNode?.getAttribute("aria-label") ?? oldPriceNode?.textContent);
    const variantData = variants(product);
    const pageText = clean(document.body?.innerText);
    const soldOutPage = /\b(sold out|out of stock|currently unavailable)\b/i.test(pageText);
    const inStock = variantData.allSizes.length ? variantData.availableSizes.length > 0 : !soldOutPage;
    const capturedImages = images(product);
    const warnings = [];
    if (!capturedImages.length) warnings.push("No product photos were detected; add photos manually before publishing.");
    if (!variantData.groups.length) warnings.push("No selectable sizes or colours were detected; confirm variants manually.");
    if (variantData.soldOutSizes.length) warnings.push(`Sold-out sizes were excluded: ${variantData.soldOutSizes.join(", ")}.`);
    return {
      sourceUrl: clean(product?.url || meta("og:url") || location.href),
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

  async function captureAllColorVariants(baseProduct) {
    if (!isShein()) return baseProduct;
    const swatches = colorNodes();
    if (swatches.length <= 1) return baseProduct;

    const byColor = [];
    const imageValues = [];
    // Keep the whole gallery against each colour, not only its cover. The
    // storefront uses the first image as the swatch cover and leads the PDP
    // gallery with the complete matching set after a customer changes colour.
    const colorGalleryImages = {};
    const colorValues = [];
    const sizeValues = [];
    const soldOutValues = [];
    const failedColors = [];
    const repeatedGalleries = [];
    const originalScroll = window.scrollY;
    const duplicateColorCounts = new Map();

    const swatchImageKey = (swatch) => imageKey(absoluteImage(
      swatch?.querySelector?.("[data-before-crop-src]")?.getAttribute("data-before-crop-src") ||
      swatch?.querySelector?.("img")?.getAttribute("src") ||
      ""
    ));
    const currentGallerySignature = () => {
      const domGallery = sheinGalleryFromDom();
      if (domGallery.length) return JSON.stringify(domGallery.map(imageKey));
      const product = jsonLdProducts()[0];
      return JSON.stringify((Array.isArray(product?.image) ? product.image : [product?.image])
        .filter(Boolean)
        .map((image) => imageKey(absoluteImage(image))));
    };
    const selectedColorSignature = () => {
      const active = colorNodes().find((node) => node.getAttribute("aria-checked") === "true" || /\bactive\b/i.test(clean(node.className)));
      return JSON.stringify([
        clean(active?.getAttribute("aria-label")),
        swatchImageKey(active),
        currentGallerySignature(),
      ]);
    };
    const targets = swatches.map((swatch, index) => {
      const rawColor = clean(swatch.getAttribute("data-attr_value_name") || swatch.getAttribute("aria-label") || swatch.getAttribute("title") || swatch.querySelector?.("img")?.getAttribute("alt") || swatch.textContent || `Colour ${index + 1}`)
        .replace(/^(?:color|colour)\s*:?\s*/i, "") || `Colour ${index + 1}`;
      const duplicateNumber = (duplicateColorCounts.get(rawColor.toLowerCase()) || 0) + 1;
      duplicateColorCounts.set(rawColor.toLowerCase(), duplicateNumber);
      return {
        index,
        color: duplicateNumber === 1 ? rawColor : `${rawColor} ${duplicateNumber}`,
      };
    });

    const initialActiveIndex = swatches.findIndex((node) => node.getAttribute("aria-checked") === "true" || /\bactive\b/i.test(clean(node.className)));
    const orderedTargets = [
      ...(initialActiveIndex >= 0 ? targets.filter((target) => target.index === initialActiveIndex) : []),
      ...targets.filter((target) => target.index !== initialActiveIndex),
    ].slice(0, 12);
    const visitedIndexes = new Set();
    const visitedGallerySignatures = new Set();
    let settledBaseProduct = null;

    for (const target of orderedTargets) {
      if (visitedIndexes.has(target.index)) continue;
      visitedIndexes.add(target.index);
      const currentSwatches = colorNodes();
      // SHEIN mutates and can temporarily duplicate swatch thumbnails after a
      // selection. The radio order stays stable, so position is the identity.
      const swatch = currentSwatches[target.index];
      if (!swatch) continue;
      const color = target.color;
      const wasSelected = swatch.getAttribute("aria-checked") === "true" || /\bactive\b/i.test(clean(swatch.className));
      swatch.scrollIntoView({ block: "center", inline: "center" });
      if (!wasSelected) swatch.click();

      // Never record SHEIN's transition state. Prices, stock and galleries can
      // change more than once during the first few seconds after a click.
      const minimumCaptureTime = Date.now() + 7000;
      while (Date.now() < minimumCaptureTime) await sleep(500);

      let matchedTarget = false;
      const matchStarted = Date.now();
      while (Date.now() - matchStarted < 18000) {
        const latestSwatches = colorNodes();
        const activeIndex = latestSwatches.findIndex((node) => node.getAttribute("aria-checked") === "true" || /\bactive\b/i.test(clean(node.className)));
        const active = activeIndex >= 0 ? latestSwatches[activeIndex] : null;
        const activeMatches = activeIndex === target.index;
        // A SHEIN swatch is often a cropped colour chip rather than the first
        // full gallery photograph. Requiring those two image URLs to match
        // caused legitimate non-default colours to be skipped completely.
        // The selected radio state plus the later stability check is reliable
        // enough, while the gallery signature below still prevents duplicates.
        if (activeMatches) {
          matchedTarget = true;
          break;
        }
        await sleep(400);
      }

      if (!matchedTarget) {
        failedColors.push(color);
        continue;
      }

      // After the mandatory delay, require another three seconds with no
      // gallery, selected-radio, price or stock changes.
      let stableSignature = selectedColorSignature();
      let stableChecks = 0;
      const settleStarted = Date.now();
      while (Date.now() - settleStarted < 20000 && stableChecks < 6) {
        await sleep(500);
        const liveProduct = capture();
        const nextSignature = JSON.stringify([
          selectedColorSignature(),
          liveProduct.price,
          liveProduct.compareAtPrice,
          liveProduct.variants,
        ]);
        if (nextSignature === stableSignature) stableChecks += 1;
        else {
          stableSignature = nextSignature;
          stableChecks = 0;
        }
      }
      const captured = capture();
      const gallerySignature = JSON.stringify(captured.images.map(imageKey));
      if (!captured.images.length) {
        failedColors.push(color);
        continue;
      }
      if (visitedGallerySignatures.has(gallerySignature)) {
        repeatedGalleries.push(color);
        continue;
      }
      visitedGallerySignatures.add(gallerySignature);
      if (target.index === initialActiveIndex) settledBaseProduct = captured;
      const variantData = variants(jsonLdProducts()[0]);
      imageValues.push(...captured.images);
      colorValues.push(color);
      colorGalleryImages[color] = captured.images;
      const sizeGroup = variantData.groups.find((group) => /size/i.test(group.name));
      if (sizeGroup) sizeValues.push(...sizeGroup.options);
      soldOutValues.push(...variantData.soldOutSizes.map((size) => `${color}: ${size}`));
      byColor.push(`${color} (${captured.images.length} photo${captured.images.length === 1 ? "" : "s"}, ${sizeGroup?.options.length || 0} available size${sizeGroup?.options.length === 1 ? "" : "s"})`);
    }

    window.scrollTo({ top: originalScroll });
    const mergedVariants = [];
    const colors = uniq(colorValues);
    const sizes = uniq(sizeValues);
    if (sizes.length) mergedVariants.push({ name: "Size", options: sizes });
    if (colors.length) mergedVariants.push({
      name: "Color",
      options: colors,
      images: Object.fromEntries(colors.filter((color) => colorGalleryImages[color]?.length).map((color) => [color, colorGalleryImages[color]])),
    });
    const mergedImages = [];
    const seen = new Set();
    for (const image of imageValues) {
      const key = imageKey(image);
      if (!seen.has(key)) {
        seen.add(key);
        mergedImages.push(image);
      }
    }

    return {
      ...(settledBaseProduct || baseProduct),
      images: mergedImages.length ? mergedImages.slice(0, 60) : baseProduct.images.slice(0, 20),
      variants: mergedVariants.length ? mergedVariants : baseProduct.variants,
      inStock: sizes.length ? true : baseProduct.inStock,
      stockNote: byColor.length ? `Captured ${colors.length} colour variant${colors.length === 1 ? "" : "s"}: ${byColor.join("; ")}.` : baseProduct.stockNote,
      warnings: [
        ...(baseProduct.warnings || []),
        ...(soldOutValues.length ? [`Sold-out sizes were excluded by colour: ${soldOutValues.join(", ")}.`] : []),
        ...(failedColors.length ? [`These colours did not finish loading and were skipped to prevent incorrect duplicates: ${uniq(failedColors).join(", ")}. Try Browser Capture again if they remain missing.`] : []),
        ...(repeatedGalleries.length ? [`SHEIN returned a gallery that had already been captured for: ${uniq(repeatedGalleries).join(", ")}. It was skipped instead of importing duplicate photos.`] : []),
      ],
    };
  }

  function largestVisible(elements) {
    return [...elements]
      .map((element) => {
        const rect = element.getBoundingClientRect();
        const style = getComputedStyle(element);
        const visible = rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
        return { element, score: visible ? rect.width * rect.height : 0 };
      })
      .sort((left, right) => right.score - left.score)[0]?.element || null;
  }

  async function captureSheinSizeChart() {
    if (!isShein()) return { attempted: false, html: "" };
    const button = largestVisible(document.querySelectorAll('.product-intro__size-guide,[aria-label="Size Guide" i]'));
    if (!button) return { attempted: false, html: "" };
    button.scrollIntoView({ block: "center", inline: "center" });
    button.click();

    let chart = null;
    const openedAt = Date.now();
    while (Date.now() - openedAt < 15000) {
      chart = largestVisible(document.querySelectorAll('.bsc-common-size-table'));
      if (chart) break;
      await sleep(300);
    }
    if (!chart) return { attempted: true, html: "" };

    // SHEIN labels this tab differently between product types and releases:
    // "Product Chart", "Product Measurements" and "Product Size" are all
    // the garment dimensions. If we miss it, SHEIN's default Buyer/Body table
    // is mistakenly stored as the product size chart.
    const productTab = [...chart.querySelectorAll('[aria-label],.bsc-common-size-table__top_tabs_item')]
      .find((element) => /product\s*(?:chart|measurement|measurements|size)/i.test(clean(`${element.getAttribute("aria-label")} ${element.textContent}`)));
    if (productTab && !/\bactive\b/i.test(clean(productTab.className))) {
      productTab.click();
      await sleep(2500);
      chart = largestVisible(document.querySelectorAll('.bsc-common-size-table')) || chart;
    }

    const tableRows = (container) => [...container.querySelectorAll('.bsc-common-size-table__content table,table')][0]
      ? [...container.querySelector('.bsc-common-size-table__content table,table').querySelectorAll("tr")]
      .map((row) => [...row.querySelectorAll("th,td")].map((cell) => clean(cell.textContent)).filter(Boolean))
      .filter((cells) => cells.length > 1)
      : [];
    const rows = tableRows(chart);
    if (rows.length < 2) return { attempted: true, html: "" };

    const notice = [...chart.querySelectorAll('.bsc-size-table__notice')]
      .map((element) => clean(element.textContent))
      .find((text) => /manually measuring the product/i.test(text)) ||
      "*This data was obtained from manually measuring the product, it may be off by 1-2 CM.";
    const escapeHtml = (value) => clean(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    const htmlRow = (row, cell) => `<tr>${row.map((value) => `<${cell}>${escapeHtml(value)}</${cell}>`).join("")}</tr>`;
    const htmlTable = (values) => `<table><thead>${htmlRow(values[0], "th")}</thead><tbody>${values.slice(1).map((row) => htmlRow(row, "td")).join("")}</tbody></table>`;

    // SHEIN's Body Measurements is a separate tab from Product Chart. Capture
    // it independently so a customer can compare their own measurements in
    // the same Size Guide, rather than seeing a generic fallback only.
    const bodyTab = [...chart.querySelectorAll('[aria-label],.bsc-common-size-table__top_tabs_item')]
      .find((element) => /body\s*(?:measurement|measurements|size|chart)/i.test(clean(`${element.getAttribute("aria-label")} ${element.textContent}`)));
    let bodyRows = [];
    let measureImages = [];
    if (bodyTab) {
      bodyTab.click();
      await sleep(1800);
      chart = largestVisible(document.querySelectorAll('.bsc-common-size-table')) || chart;
      bodyRows = tableRows(chart);
      measureImages = [...chart.querySelectorAll("img")]
        .map((image) => absoluteImage(bestImageSource(image)))
        .filter((url) => url && !/logo|icon|avatar|sprite|payment|badge/i.test(url));
    }
    measureImages = uniq(measureImages).slice(0, 4);
    const bodyHtml = bodyRows.length >= 2 ? `<section data-size-chart="body"><h4>Body Measurements</h4>${htmlTable(bodyRows)}</section>` : "";
    const measureHtml = measureImages.length ? `<section data-size-chart-measure-images="true">${measureImages.map((url) => `<img src="${escapeHtml(url)}" alt="How to measure" loading="lazy">`).join("")}</section>` : "";
    return {
      attempted: true,
      html: `<section data-size-chart="product">${htmlTable(rows)}<p><em>${escapeHtml(notice)}</em></p></section>${bodyHtml}${measureHtml}`,
    };
  }

  async function enhanceCapture(product) {
    const withColors = await captureAllColorVariants(product);
    const sizeChart = await captureSheinSizeChart();
    if (!sizeChart.html) {
      if (sizeChart.attempted) withColors.warnings = [...(withColors.warnings || []), "The SHEIN size guide opened, but its Product Chart could not be read. Add the size chart manually before publishing."];
      return withColors;
    }
    return {
      ...withColors,
      sizeChartHtml: sizeChart.html,
      stockNote: `${withColors.stockNote || ""} Product size chart captured in CM.`.trim(),
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
      if (current.title && current.images.length && stable >= 2) return await enhanceCapture(current);
      await sleep(1200);
    }
    if (verificationPage()) throw new Error("Supplier verification is still blocking the page. Complete it in the opened tab, then run Browser Capture again.");
    const partial = capture();
    if (!partial.title || (!partial.images.length && partial.price === null)) throw new Error("The page loaded, but no reliable product details were found. Confirm this is a product URL and try again.");
    partial.warnings.push("The supplier page did not fully settle; review every field before publishing.");
    return await enhanceCapture(partial);
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== "CATALOG_CAPTURE_PAGE") return;
    captureWhenReady()
      .then((product) => sendResponse({ ok: true, product }))
      .catch((error) => sendResponse({ ok: false, error: error?.message || "Could not capture this product page." }));
    return true;
  });
})();
