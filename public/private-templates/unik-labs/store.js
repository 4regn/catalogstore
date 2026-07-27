(function () {
  'use strict';

  const CART_KEY = 'unik-labs-cart-v1';
  const ORDER_KEY = 'unik-labs-orders-v1';
  const ACCOUNT_KEY = 'unik-labs-account-v1';
  const GENERATION_KEY = 'unik-labs-generations-v1';
  const THEME_KEY = 'unik-labs-theme-v1';
  const DARK_BACKDROP = 'dark-studio-backdrop.png';
  const darkImageCache = new Map();

  function read(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) || fallback; }
    catch (_) { return fallback; }
  }

  function write(key, value) {
    // Returns false instead of throwing so callers (add(), in particular)
    // can tell the customer their click didn't actually work -- large
    // custom-upload artwork can exceed the localStorage quota, and an
    // uncaught QuotaExceededError here used to make "Add to Cart" silently
    // do nothing.
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (_) {
      return false;
    }
  }

  function cart() { return read(CART_KEY, []); }

  function updateCount() {
    const count = cart().reduce((sum, item) => sum + (item.qty || 1), 0);
    document.querySelectorAll('[data-unik-cart-count]').forEach((el) => {
      el.textContent = count;
      el.hidden = count === 0;
      const headerCart = el.closest('.unik-header-cart');
      if (headerCart) headerCart.setAttribute('aria-label', count ? `Open cart, ${count} item${count === 1 ? '' : 's'}` : 'Open cart');
    });
  }

  function notify(message) {
    let toast = document.getElementById('unikToast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'unikToast';
      toast.className = 'unik-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => toast.classList.remove('show'), 2200);
  }

  function add(item) {
    const items = cart();
    items.push({
      id: 'unik-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      qty: 1,
      addedAt: new Date().toISOString(),
      ...item
    });
    if (!write(CART_KEY, items)) {
      notify('Could not add to cart -- try a smaller photo');
      return false;
    }
    updateCount();
    notify('Added to your UNIK Labs cart');
    return items;
  }

  function remove(id) {
    write(CART_KEY, cart().filter((item) => item.id !== id));
    updateCount();
  }

  function updateQty(id, qty) {
    const clamped = Math.max(1, Math.min(10, Math.round(qty) || 1));
    write(CART_KEY, cart().map((item) => item.id === id ? { ...item, qty: clamped } : item));
    updateCount();
  }

  function clear() { write(CART_KEY, []); updateCount(); }

  // Swaps a custom-upload cart item's raw image bytes for a designId
  // reference once its background /api/unik/custom-upload/save call
  // finishes -- called from upload.html (right after Add to Cart) and
  // checkout.html (as a catch-all for any item that's still in the raw
  // shape when the checkout page loads). A no-op if the item was removed,
  // or already upgraded, before the upload finished.
  function upgradeCustomUpload(id, designId) {
    const items = cart();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return;
    const cu = items[idx].options && items[idx].options.customUpload;
    if (!cu || cu.designId) return;
    const upgraded = items.slice();
    upgraded[idx] = { ...items[idx], options: { ...items[idx].options, customUpload: { garment: cu.garment, colour: cu.colour, size: cu.size, zone: cu.zone, designId } } };
    write(CART_KEY, upgraded);
  }

  // Last-resort fallback for when a custom-upload item's background save
  // call fails outright (not just "hasn't finished yet") -- writes the raw
  // image bytes into the cart item so checkout's own slow-path can still
  // pick it up. Only ever called after the network attempt has already
  // failed, never as part of the normal Add to Cart write, which is what
  // made "could not add to cart -- try a smaller photo" come back: every
  // add was writing multi-MB raw images to localStorage up front again.
  // Returns false (and lets the caller decide how to warn) if even this
  // raw write blows the quota.
  function attachCustomUploadRaw(id, rawFields) {
    const items = cart();
    const idx = items.findIndex((item) => item.id === id);
    if (idx === -1) return true; // item was removed before the upload settled -- nothing to attach
    const cu = items[idx].options && items[idx].options.customUpload;
    if (!cu || cu.designId) return true;
    const updated = items.slice();
    updated[idx] = { ...items[idx], options: { ...items[idx].options, customUpload: { ...cu, ...rawFields } } };
    return write(CART_KEY, updated);
  }

  function saveOrder(order) {
    const orders = read(ORDER_KEY, []);
    orders.unshift(order);
    write(ORDER_KEY, orders.slice(0, 20));
  }

  function currentAccount() { return read(ACCOUNT_KEY, null); }

  function signIn(profile) {
    const account = {
      name: String(profile.name || '').trim(),
      email: String(profile.email || '').trim().toLowerCase(),
      joinedAt: currentAccount()?.joinedAt || new Date().toISOString()
    };
    write(ACCOUNT_KEY, account);
    const archived = read(GENERATION_KEY, []).map((item) => item.email === '__device__' ? {...item,email:account.email} : item);
    write(GENERATION_KEY, archived);
    return account;
  }

  function signOut() { localStorage.removeItem(ACCOUNT_KEY); }

  function accountOrders() {
    const account = currentAccount();
    if (!account) return [];
    return read(ORDER_KEY, []).filter((order) => String(order.customer?.email || '').toLowerCase() === account.email);
  }

  function generations() {
    const account = currentAccount();
    const all = read(GENERATION_KEY, []);
    return account ? all.filter((item) => item.email === account.email) : [];
  }

  function saveGeneration(generation) {
    const account = currentAccount();
    const all = read(GENERATION_KEY, []);
    const item = {
      id: 'gen-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      createdAt: new Date().toISOString(),
      email: account?.email || '__device__',
      ...generation
    };
    all.unshift(item);
    write(GENERATION_KEY, all.slice(0, 60));
    return item;
  }

  function currentTheme() { return localStorage.getItem(THEME_KEY) || 'dark'; }

  function updateThemeControls() {
    const theme = currentTheme();
    document.querySelectorAll('[data-unik-theme-toggle]').forEach((button) => {
      const target = theme === 'dark' ? 'Light' : 'Dark';
      button.innerHTML = `<span>${target} mode</span><span class="unik-theme-glyph" aria-hidden="true">${theme === 'dark' ? '☼' : '◐'}</span>`;
      button.setAttribute('aria-label', `Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`);
    });
  }

  function applyTheme(theme) {
    const next = theme === 'light' ? 'light' : 'dark';
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isHome = path === 'index.html' || path === '';
    // The landing page has a fixed art direction. Its mode control saves the
    // preference for product pages without restyling the landing experience.
    document.documentElement.dataset.unikTheme = isHome ? 'landing' : next;
    document.documentElement.style.colorScheme = isHome ? 'dark' : next;
    localStorage.setItem(THEME_KEY, next);
    updateThemeControls();
    window.dispatchEvent(new CustomEvent('unik:themechange',{detail:{theme:next}}));
  }

  function toggleTheme() { applyTheme(currentTheme() === 'dark' ? 'light' : 'dark'); }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function cover(ctx, image, width, height) {
    const scale = Math.max(width / image.naturalWidth, height / image.naturalHeight);
    const w = image.naturalWidth * scale, h = image.naturalHeight * scale;
    ctx.drawImage(image, (width - w) / 2, (height - h) / 2, w, h);
  }

  async function darkSource(source) {
    if (!source || source.includes(DARK_BACKDROP)) return source;
    if (darkImageCache.has(source)) return darkImageCache.get(source);
    const job = (async () => {
      const [subject, backdrop] = await Promise.all([loadImage(source), loadImage(DARK_BACKDROP)]);
      const scale = Math.min(1, 900 / Math.max(subject.naturalWidth, subject.naturalHeight));
      const width = Math.max(1, Math.round(subject.naturalWidth * scale));
      const height = Math.max(1, Math.round(subject.naturalHeight * scale));
      const subjectCanvas = document.createElement('canvas');
      subjectCanvas.width = width; subjectCanvas.height = height;
      const subjectContext = subjectCanvas.getContext('2d', {willReadFrequently:true});
      subjectContext.drawImage(subject, 0, 0, width, height);
      const pixels = subjectContext.getImageData(0, 0, width, height);
      const data = pixels.data;

      // Estimate the pale studio background from the outer edge. Flood-filling
      // only from that edge protects the garment and keeps its exact position.
      const samples = [];
      const stride = Math.max(1, Math.floor(Math.min(width, height) / 80));
      for (let x = 0; x < width; x += stride) {
        for (const y of [0, height - 1]) { const i = (y * width + x) * 4; samples.push([data[i], data[i+1], data[i+2]]); }
      }
      for (let y = 0; y < height; y += stride) {
        for (const x of [0, width - 1]) { const i = (y * width + x) * 4; samples.push([data[i], data[i+1], data[i+2]]); }
      }
      const median = channel => samples.map(sample => sample[channel]).sort((a,b)=>a-b)[Math.floor(samples.length/2)];
      const bg = [median(0), median(1), median(2)];
      const distance = (r,g,b,ref=bg) => Math.hypot(r-ref[0],g-ref[1],b-ref[2]);
      const total = width * height;
      const removed = new Uint8Array(total);
      const queued = new Uint8Array(total);
      const queue = new Int32Array(total);
      let head = 0, tail = 0;
      const seed = index => {
        if (queued[index]) return;
        const i=index*4;
        if (distance(data[i],data[i+1],data[i+2]) < 82) { queued[index]=1; queue[tail++]=index; }
      };
      for (let x=0;x<width;x++){seed(x);seed((height-1)*width+x);}
      for (let y=0;y<height;y++){seed(y*width);seed(y*width+width-1);}
      while(head<tail){
        const index=queue[head++], i=index*4;
        removed[index]=1;
        const x=index%width;
        const neighbours=[];
        if(x>0)neighbours.push(index-1);if(x<width-1)neighbours.push(index+1);
        if(index>=width)neighbours.push(index-width);if(index<total-width)neighbours.push(index+width);
        neighbours.forEach(next=>{
          if(queued[next])return;
          const n=next*4;
          const local=Math.hypot(data[n]-data[i],data[n+1]-data[i+1],data[n+2]-data[i+2]);
          const max=Math.max(data[n],data[n+1],data[n+2]), min=Math.min(data[n],data[n+1],data[n+2]);
          const pale=(data[n]+data[n+1]+data[n+2])/3>142 && max-min<72;
          if(local<46 && (pale || distance(data[n],data[n+1],data[n+2])<112)) { queued[next]=1; queue[tail++]=next; }
        });
      }
      for(let index=0;index<total;index++)if(removed[index])data[index*4+3]=0;
      subjectContext.putImageData(pixels,0,0);
      const output=document.createElement('canvas');output.width=width;output.height=height;
      const ctx=output.getContext('2d');cover(ctx,backdrop,width,height);ctx.drawImage(subjectCanvas,0,0);
      return output.toDataURL('image/jpeg',.9);
    })().catch(() => source);
    darkImageCache.set(source, job);
    return job;
  }

  const productSelector = '.garment-img,.colour-model-img,.ug-img,.mg-img,.fm-face img,.gc img,.cc img';
  function processProductImage(image) {
    if (!image.matches(productSelector) || image.id === 'designImg') return;
    const source = image.getAttribute('src');
    if (!source || source === image.dataset.unikDarkSource || source.includes(DARK_BACKDROP)) return;
    image.dataset.unikOriginalSource = source;
    image.classList.add('unik-dark-product');
    const requested = source;
    darkSource(source).then(result => {
      if (image.dataset.unikOriginalSource !== requested) return;
      image.dataset.unikDarkSource = result;
      image.src = result;
    });
  }

  function initProductImages() {
    if (document.documentElement.dataset.unikPage === 'home') return;
    document.querySelectorAll(productSelector).forEach(processProductImage);
    new MutationObserver(records => records.forEach(record => {
      if (record.type === 'attributes') processProductImage(record.target);
      record.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches?.(productSelector)) processProductImage(node);
        node.querySelectorAll?.(productSelector).forEach(processProductImage);
      });
    })).observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['src']});
  }

  applyTheme(currentTheme());

  const style = document.createElement('style');
  style.textContent = `
    .unik-site-nav{position:relative;z-index:1000;height:62px;background:#050505;color:#fff;display:flex;align-items:center;justify-content:space-between;padding:0 max(18px,calc((100vw - 1120px)/2));font-family:Arial,sans-serif;border-bottom:1px solid rgba(255,255,255,.12)}
    .unik-site-brand{color:#fff;text-decoration:none;font-weight:900;letter-spacing:.16em;font-size:14px;white-space:nowrap}
    .unik-site-links{display:flex;align-items:center;gap:20px}
    .unik-site-links a{color:#aaa;text-decoration:none;font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;transition:color .2s}
    .unik-site-links a:hover,.unik-site-links a.active{color:#fff}
    .unik-cart-link{position:relative;border:1px solid #444;border-radius:999px;padding:8px 12px!important;color:#fff!important}
    .unik-cart-count{display:inline-grid;place-items:center;min-width:17px;height:17px;padding:0 4px;background:#fff;color:#000;border-radius:99px;font-size:9px;margin-left:5px}
    .unik-toast{position:fixed;z-index:9999;left:50%;bottom:24px;transform:translate(-50%,20px);background:#fff;color:#050505;border:1px solid #ddd;border-radius:999px;padding:12px 18px;font:700 11px/1 Arial,sans-serif;letter-spacing:.08em;text-transform:uppercase;box-shadow:0 12px 35px rgba(0,0,0,.25);opacity:0;pointer-events:none;transition:.25s}
    .unik-toast.show{opacity:1;transform:translate(-50%,0)}
    .unik-home-menu{position:fixed;z-index:3000;inset:0;background:rgba(0,0,0,.94);display:none;place-items:center;text-align:center}
    .unik-home-menu.open{display:grid}
    .unik-home-menu a{display:block;color:#fff;text-decoration:none;font:700 30px/1.8 Arial,sans-serif;letter-spacing:.04em}
    .unik-home-close{position:absolute;right:24px;top:24px;border:0;background:transparent;color:#fff;font-size:34px;cursor:pointer}
    a.btn-primary,a.btn-secondary{text-decoration:none}
    @media(max-width:620px){.unik-site-nav{height:auto;min-height:58px;gap:12px;flex-wrap:wrap;padding:12px 16px}.unik-site-links{gap:11px}.unik-site-links a{font-size:9px}.unik-site-brand{font-size:12px}}
  `;
  document.head.appendChild(style);

  const fontLink = document.createElement('link');
  fontLink.rel = 'stylesheet';
  fontLink.href = 'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Manrope:wght@400;500;600;700&display=swap';
  document.head.appendChild(fontLink);

  const premiumStyle = document.createElement('style');
  premiumStyle.textContent = `
    :root{--unik-ivory:#f1eee7;--unik-ink:#090909;--unik-night:#080909;--unik-panel:#111312;--unik-line-dark:#2a2c2a;--unik-gold:#bda36a}
    body,button,input,select,textarea{font-family:'Manrope','Inter','Montserrat',sans-serif}
    .unik-site-nav{min-height:72px;height:auto;background:rgba(8,9,9,.94);backdrop-filter:blur(18px);border-bottom:1px solid rgba(255,255,255,.1);padding-top:10px;padding-bottom:10px}
    .unik-brand-group{display:flex;align-items:center;gap:14px;flex:none}
    .unik-site-brand{display:flex;align-items:center;text-decoration:none;line-height:0}
    .unik-site-brand-logo{display:block;width:124px;height:auto;object-fit:contain}
    .unik-site-links{gap:10px}
    .unik-site-links a,.unik-theme-toggle{border:0;background:transparent;color:#9f9f9a;text-decoration:none;font-size:9px;font-weight:600;letter-spacing:.17em;text-transform:uppercase;padding:10px 11px;cursor:pointer;transition:color .2s,background .2s}
    .unik-site-links a:hover,.unik-site-links a.active,.unik-theme-toggle:hover{color:#fff}
    .unik-theme-toggle:disabled{opacity:.38;cursor:wait}
    .unik-nav-theme{display:flex;align-items:center;gap:7px;flex:none;margin-left:6px;border:1px solid rgba(255,255,255,.18)!important;border-radius:999px!important;background:rgba(255,255,255,.055)!important;padding:5px 6px 5px 10px!important;color:#d6d5cf!important;box-shadow:inset 0 1px rgba(255,255,255,.07)}
    .unik-nav-theme .unik-theme-glyph{width:23px;height:23px;font-size:11px}
    .unik-account-link{border-left:1px solid rgba(255,255,255,.16)!important}
    .unik-cart-link{border:1px solid rgba(255,255,255,.22);background:rgba(255,255,255,.04);padding:10px 14px!important}
    .unik-home-menu a{font-family:'Manrope','Inter',sans-serif;font-weight:600;font-size:clamp(20px,6vw,30px);letter-spacing:.08em;text-transform:uppercase;line-height:2}
    .unik-home-theme{margin:22px auto 0;border:1px solid rgba(255,255,255,.28);border-radius:999px;color:#fff;background:rgba(255,255,255,.06);padding:8px 10px 8px 14px;font:600 9px 'Manrope',sans-serif;letter-spacing:.14em;text-transform:uppercase;cursor:pointer;display:flex;align-items:center;gap:10px;box-shadow:inset 0 1px rgba(255,255,255,.1)}
    .unik-theme-glyph{width:26px;height:26px;border-radius:50%;display:grid;place-items:center;background:#f1eee7;color:#090909;font-size:12px}
    .unik-drawer-cart{display:flex!important;align-items:center;justify-content:center;gap:10px;width:max-content;margin-left:auto;margin-right:auto}
    .unik-drawer-cart svg{width:18px;height:20px;flex:none}
    .results-title,.account-display{font-family:'DM Serif Display',serif!important;font-weight:400!important;letter-spacing:-.035em!important}
    .stitle,.step-title{letter-spacing:.035em!important}
    html[data-unik-theme='light'] body{background:#f1eee7;color:#090909}
    html[data-unik-page='home'] body{background:#000!important;color:#fff!important}
    html[data-unik-page='home'] .wrap,html[data-unik-page='home'] .trust-bar{background:#000!important;color:#fff!important}
    html[data-unik-page='home'] .trust-name{color:#fff!important}
    html[data-unik-page='home'] .trust-desc{color:rgba(255,255,255,.58)!important}
    html[data-unik-page='home'] .nav{display:grid!important;grid-template-columns:82px minmax(0,1fr) 82px;align-items:center!important;padding-left:22px!important;padding-right:22px!important}
    html[data-unik-page='home'] .nav-logo{justify-self:center!important;max-width:min(46vw,170px)!important;height:auto!important}
    html[data-unik-page='home'] .nav-icon-btn{justify-self:start}
    .unik-header-actions{justify-self:end;display:flex;align-items:center;justify-content:flex-end;gap:5px}
    .unik-header-account,.unik-header-cart{position:relative;width:36px;height:36px;display:grid;place-items:center;color:#fff;text-decoration:none;border-radius:50%;transition:background .2s ease}
    .unik-header-account:hover,.unik-header-cart:hover{background:rgba(255,255,255,.12)}
    .unik-account-glyph{position:relative;display:block;width:20px;height:20px}
    .unik-account-glyph:before{content:'';position:absolute;left:50%;top:1px;width:6px;height:6px;transform:translateX(-50%);border:1.5px solid currentColor;border-radius:50%}
    .unik-account-glyph:after{content:'';position:absolute;left:50%;bottom:1px;width:14px;height:8px;transform:translateX(-50%);border:1.5px solid currentColor;border-radius:9px 9px 5px 5px}
    .unik-header-cart .nav-bag{display:block}
    .unik-header-cart-count{position:absolute;top:-1px;right:-3px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:#007517;color:#fff;border:1.5px solid rgba(8,9,9,.9);font:700 9px/13px 'Manrope',sans-serif;text-align:center;box-sizing:border-box}
    @media(max-width:420px){html[data-unik-page='home'] .nav{grid-template-columns:74px minmax(0,1fr) 74px;padding-left:16px!important;padding-right:16px!important}.unik-header-account,.unik-header-cart{width:33px;height:33px}.unik-header-actions{gap:3px}}
    html[data-unik-theme='dark'] body{background:var(--unik-night)!important;color:#f4f1e9!important}
    html[data-unik-theme='dark'] .hdr,html[data-unik-theme='dark'] #pb,html[data-unik-theme='dark'] #progressBar,html[data-unik-theme='dark'] .wrap,html[data-unik-theme='dark'] #studioSteps{background:rgba(8,9,9,.96)!important;color:#f4f1e9!important;border-color:#2a2c2a!important}
    html[data-unik-theme='dark'] .sc,html[data-unik-theme='dark'] .sdb,html[data-unik-theme='dark'] .step-card,html[data-unik-theme='dark'] .step-done,html[data-unik-theme='dark'] .review-card,html[data-unik-theme='dark'] .trust-bar,html[data-unik-theme='dark'] .results-inner,html[data-unik-theme='dark'] .cal-panel,html[data-unik-theme='dark'] .panel{background:var(--unik-panel)!important;color:#f4f1e9!important;border-color:var(--unik-line-dark)!important}
    html[data-unik-theme='dark'] .gc,html[data-unik-theme='dark'] .cc,html[data-unik-theme='dark'] .zc,html[data-unik-theme='dark'] .garment-card,html[data-unik-theme='dark'] .colour-card,html[data-unik-theme='dark'] .subject-card,html[data-unik-theme='dark'] .style-card,html[data-unik-theme='dark'] .upload-zone,html[data-unik-theme='dark'] .size-seg,html[data-unik-theme='dark'] .view-toggle{background:#151716!important;color:#f4f1e9!important;border-color:#30322f!important}
    html[data-unik-theme='dark'] h1,html[data-unik-theme='dark'] h2,html[data-unik-theme='dark'] h3,html[data-unik-theme='dark'] .stitle,html[data-unik-theme='dark'] .step-title,html[data-unik-theme='dark'] .hdr-title,html[data-unik-theme='dark'] .csub,html[data-unik-theme='dark'] .size-lbl,html[data-unik-theme='dark'] .review-val,html[data-unik-theme='dark'] .gc-lbl,html[data-unik-theme='dark'] .cc-lbl,html[data-unik-theme='dark'] .zc-name{color:#f4f1e9!important}
    html[data-unik-theme='dark'] .gc-lbl,html[data-unik-theme='dark'] .cc-lbl{background:#151716!important}
    html[data-unik-theme='dark'] .sdesc,html[data-unik-theme='dark'] .step-desc,html[data-unik-theme='dark'] .hdr-sub,html[data-unik-theme='dark'] .seye,html[data-unik-theme='dark'] .step-eyebrow,html[data-unik-theme='dark'] .dlbl,html[data-unik-theme='dark'] .dval,html[data-unik-theme='dark'] .review-label,html[data-unik-theme='dark'] .cal-sub,html[data-unik-theme='dark'] .cal-label,html[data-unik-theme='dark'] .cal-pixels{color:#979992!important}
    html[data-unik-theme='dark'] input,html[data-unik-theme='dark'] textarea,html[data-unik-theme='dark'] select,html[data-unik-theme='dark'] .cal-input,html[data-unik-theme='dark'] .cal-select{background:#0d0f0e!important;color:#f4f1e9!important;border-color:#343631!important}
    html[data-unik-theme='dark'] .dedit,html[data-unik-theme='dark'] a{color:inherit}
    html[data-unik-theme='dark'] .hdr-title{background:none!important;-webkit-background-clip:initial!important;background-clip:initial!important;-webkit-text-fill-color:#f4f1e9!important;color:#f4f1e9!important;font-family:'Bebas Neue','Anton',sans-serif!important;letter-spacing:2px!important}
    html[data-unik-theme='dark'] .hdr-eye,html[data-unik-theme='dark'] .pb-lbl,html[data-unik-theme='dark'] .pb-label,html[data-unik-theme='dark'] .fu-lbl-wrap,html[data-unik-theme='dark'] .fu-lbl-wrap span,html[data-unik-theme='dark'] .vt-btn,html[data-unik-theme='dark'] .zc-price,html[data-unik-theme='dark'] .price-tag{color:#f4f1e9!important}
    html[data-unik-theme='dark'] .pb-d,html[data-unik-theme='dark'] .pb-dot{background:#343631!important}
    html[data-unik-theme='dark'] .pb-d.done,html[data-unik-theme='dark'] .pb-d.active,html[data-unik-theme='dark'] .pb-dot.done,html[data-unik-theme='dark'] .pb-dot.active{background:#f1eee7!important;opacity:1!important}
    html[data-unik-theme='dark'] .btn-checkout{background:#007517!important;color:#fff!important;opacity:.48!important}
    html[data-unik-theme='dark'] .btn-checkout.go{opacity:1!important}
    html[data-unik-theme='dark'] .btn-checkout .co-sub{color:#fff!important;opacity:.68!important}
    html[data-unik-theme='dark'] .upload-stage,html[data-unik-theme='dark'] .gc img,html[data-unik-theme='dark'] .cc img,html[data-unik-theme='dark'] .garment-card img,html[data-unik-theme='dark'] .colour-card img,html[data-unik-theme='dark'] .style-card img{background:#111312!important}
    img.unik-dark-product{background:#111312!important}
    html[data-unik-theme='dark'] img.unik-dark-fallback{filter:brightness(.68) contrast(1.12) saturate(.9)}
    html[data-unik-theme='dark'] .fu-flip-btn,html[data-unik-theme='dark'] .cal-btn{background:#151716;color:#f4f1e9;border-color:#3b3d39}
    html[data-unik-theme='dark'] .cal-btn.primary{background:#f1eee7;color:#090909;border-color:#f1eee7}
    html[data-unik-theme='dark'] .checkout-shell{color:#f4f1e9}
    html[data-unik-theme='dark'] .checkout-shell .panel{box-shadow:0 24px 80px rgba(0,0,0,.22)}
    html[data-unik-theme='dark'] .total-row{color:#d8d5cc}
    html[data-unik-theme='dark'] .trust-icon,html[data-unik-theme='dark'] .trust-icon-wrap{color:#fff!important}
    html[data-unik-theme='dark'] .trust-icon svg,html[data-unik-theme='dark'] .trust-icon-wrap svg{stroke:currentColor!important}
    .unik-size-guide-trigger{display:inline-flex;align-items:center;gap:8px;margin-top:12px;border:0;border-bottom:1px solid currentColor;background:transparent;color:inherit;padding:3px 0 5px;font:700 10px/1.4 'Manrope',sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .unik-size-guide-trigger svg{width:17px;height:17px;flex:none;stroke:currentColor;stroke-width:1.5;transition:transform .2s ease}
    .unik-size-guide-trigger:hover svg{transform:rotate(-8deg)}
    .unik-size-guide-trigger[hidden]{display:none!important}
    .unik-size-modal[hidden]{display:none!important}
    .unik-size-modal{position:fixed;z-index:10000;inset:0;display:grid;place-items:center;padding:20px;background:rgba(0,0,0,.74);backdrop-filter:blur(10px)}
    .unik-size-modal-card{width:min(760px,100%);max-height:min(900px,92vh);overflow:auto;background:#f7f5ef;color:#090909;border:1px solid rgba(0,0,0,.13);border-radius:24px;box-shadow:0 32px 100px rgba(0,0,0,.42)}
    .unik-size-modal-head{position:sticky;z-index:2;top:0;display:flex;align-items:center;justify-content:space-between;gap:20px;padding:22px 24px;background:inherit;border-bottom:1px solid rgba(0,0,0,.12)}
    .unik-size-modal-kicker{margin:0 0 5px;color:#71716c;font:700 9px/1.2 'Manrope',sans-serif;letter-spacing:.18em;text-transform:uppercase}
    .unik-size-modal-title{margin:0;font:600 clamp(16px,3vw,22px)/1.15 'Manrope',sans-serif;letter-spacing:.08em;text-transform:uppercase}
    .unik-size-modal-close{flex:none;width:40px;height:40px;border:1px solid rgba(0,0,0,.18);border-radius:50%;background:transparent;color:inherit;font:300 28px/1 Arial,sans-serif;cursor:pointer}
    .unik-size-tabs{display:grid;grid-template-columns:1fr 1fr;border-bottom:1px solid rgba(0,0,0,.12)}
    .unik-size-tab{position:relative;border:0;background:transparent;color:#777771;padding:18px 12px;font:700 10px/1 'Manrope',sans-serif;letter-spacing:.16em;text-transform:uppercase;cursor:pointer}
    .unik-size-tab[aria-selected='true']{color:inherit}
    .unik-size-tab[aria-selected='true']:after{content:'';position:absolute;left:18%;right:18%;bottom:-1px;height:2px;background:currentColor}
    .unik-size-panel{padding:24px}
    .unik-size-panel[hidden]{display:none!important}
    .unik-size-table-wrap{overflow-x:auto;border-radius:14px;border:1px solid rgba(0,0,0,.11)}
    .unik-size-table{width:100%;border-collapse:collapse;min-width:560px;font-size:13px}
    .unik-size-table th{background:#090909;color:#fff;padding:16px 18px;text-align:left;font-size:9px;letter-spacing:.15em;text-transform:uppercase}
    .unik-size-table td{padding:17px 18px;border-bottom:1px solid rgba(0,0,0,.09)}
    .unik-size-table tbody tr:nth-child(even){background:rgba(0,0,0,.035)}
    .unik-size-table tbody tr:last-child td{border-bottom:0}
    .unik-size-note{margin:16px 0 0;padding:15px 17px;border-radius:14px;background:rgba(0,0,0,.05);color:#55554f;font-size:12px;line-height:1.6}
    .unik-measure-switch{display:flex;gap:8px;margin-bottom:16px}
    .unik-measure-person{border:1px solid rgba(0,0,0,.18);border-radius:999px;background:transparent;color:inherit;padding:9px 16px;font:700 9px/1 'Manrope',sans-serif;letter-spacing:.12em;text-transform:uppercase;cursor:pointer}
    .unik-measure-person[aria-pressed='true']{background:#090909;color:#fff;border-color:#090909}
    .unik-measure-grid{display:grid;grid-template-columns:minmax(220px,.9fr) 1.1fr;gap:24px;align-items:start}
    .unik-measure-img{display:block;width:100%;max-height:520px;object-fit:contain;object-position:top;border-radius:16px;background:#eee}
    .unik-measure-list{display:grid;gap:17px;margin:0;padding:0;list-style:none}
    .unik-measure-item{display:grid;grid-template-columns:36px 1fr;gap:12px;align-items:start}
    .unik-measure-num{width:34px;height:34px;display:grid;place-items:center;border-radius:50%;background:#090909;color:#fff;font-size:11px;font-weight:700}
    .unik-measure-name{display:block;margin:1px 0 4px;font-size:13px;font-weight:700}
    .unik-measure-copy{margin:0;color:#686862;font-size:11px;line-height:1.55}
    html[data-unik-theme='dark'] .unik-size-modal-card{background:#111312;color:#f4f1e9;border-color:#343631}
    html[data-unik-theme='dark'] .unik-size-modal-head,html[data-unik-theme='dark'] .unik-size-tabs{border-color:#343631}
    html[data-unik-theme='dark'] .unik-size-modal-kicker,html[data-unik-theme='dark'] .unik-size-tab,html[data-unik-theme='dark'] .unik-measure-copy{color:#aaa9a3}
    html[data-unik-theme='dark'] .unik-size-modal-close,html[data-unik-theme='dark'] .unik-measure-person{border-color:#444741}
    html[data-unik-theme='dark'] .unik-size-table-wrap{border-color:#343631}
    html[data-unik-theme='dark'] .unik-size-table th,html[data-unik-theme='dark'] .unik-measure-num,html[data-unik-theme='dark'] .unik-measure-person[aria-pressed='true']{background:#f1eee7;color:#090909;border-color:#f1eee7}
    html[data-unik-theme='dark'] .unik-size-table td{border-color:#343631}
    html[data-unik-theme='dark'] .unik-size-table tbody tr:nth-child(even),html[data-unik-theme='dark'] .unik-size-note{background:#191b1a}
    html[data-unik-theme='dark'] .unik-size-note{color:#c2c0b9}
    @media(max-width:760px){.unik-site-nav{justify-content:space-between}.unik-site-links{order:3;width:100%;justify-content:space-between;gap:0}.unik-site-links a{padding:8px 6px;font-size:8px}.unik-account-link{border-left:0!important}.unik-site-brand-logo{width:110px}.unik-brand-group{gap:9px}.unik-nav-theme{order:2;margin-left:auto;font-size:8px!important;padding:4px 5px 4px 8px!important}.unik-nav-theme .unik-theme-glyph{width:21px;height:21px}}
    @media(max-width:620px){.unik-size-modal{padding:10px}.unik-size-modal-card{border-radius:18px;max-height:95vh}.unik-size-modal-head{padding:18px}.unik-size-panel{padding:18px}.unik-measure-grid{grid-template-columns:1fr}.unik-measure-img{max-height:420px}.unik-size-table{min-width:520px}}
  `;
  document.head.appendChild(premiumStyle);

  const footerStyle = document.createElement('style');
  footerStyle.textContent = `
    .unik-footer{background:#000;color:#d8d5cc;border-top:1px solid rgba(255,255,255,.08);font-family:'Manrope',Arial,sans-serif}
    .uf-inner{width:min(1200px,calc(100% - 48px));margin:0 auto;padding:64px 0 32px}
    .uf-grid{display:grid;grid-template-columns:1.6fr 1fr 1fr 1fr 1fr;gap:40px;padding-bottom:44px}
    .uf-brand{max-width:340px;min-width:0}
    .uf-logo{display:inline-block;line-height:0;margin-bottom:18px}
    .uf-logo img{width:150px;height:auto;display:block}
    .uf-desc{font-size:13px;line-height:1.7;color:#a9a7a0;margin:0 0 14px}
    .uf-location{font-size:12px;color:#8b8b85;margin:0}
    .uf-col{min-width:0}
    .uf-col h3{font-size:11px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#fff;margin:0 0 20px}
    .uf-col ul{list-style:none;margin:0;padding:0;display:grid;gap:14px}
    .uf-col a{color:#a9a7a0;text-decoration:none;font-size:13px;transition:color .2s;display:inline-block;min-height:20px}
    .uf-col a:hover,.uf-col a:focus-visible{color:#fff}
    .uf-col a:focus-visible{outline:2px solid #007517;outline-offset:3px;border-radius:2px}
    .uf-soon{display:flex;align-items:center;gap:8px;font-size:13px;color:#5f5f5a;cursor:default}
    .uf-soon em{font-style:normal;font-size:9px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8b8b85;border:1px solid #333;border-radius:999px;padding:3px 9px}
    .uf-pay{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:24px;padding:28px 0;border-top:1px solid rgba(255,255,255,.08)}
    .uf-pay-accept{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
    .uf-pay-label{font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#8b8b85}
    .uf-pay-logos{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
    .uf-pay-logo{height:22px;width:auto;object-fit:contain;display:block;background:#fff;border-radius:6px;padding:4px 8px}
    .uf-pay-logo--flush{height:26px;background:none;padding:0;border-radius:0}
    .uf-pay-delivery{display:flex;align-items:center;gap:12px;text-align:left}
    .uf-flag{font-size:22px;line-height:1}
    .uf-pay-delivery-text strong{display:block;font-size:11px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;color:#fff;margin-bottom:3px}
    .uf-pay-delivery-text span{font-size:12px;color:#8b8b85;line-height:1.5}
    .uf-secure{margin:0;padding:18px 0 0;font-size:11px;color:#6f6f6a;border-top:1px solid rgba(255,255,255,.06)}
    .uf-bottom{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:14px;padding-top:18px;font-size:11px;color:#77776f}
    .uf-bottom-links{display:flex;gap:18px}
    .uf-bottom-links a{color:#77776f;text-decoration:none}
    .uf-bottom-links a:hover,.uf-bottom-links a:focus-visible{color:#fff}
    .uf-bottom-links a:focus-visible{outline:2px solid #007517;outline-offset:2px;border-radius:2px}
    @media(max-width:980px){.uf-grid{grid-template-columns:1fr 1fr 1fr;row-gap:36px}.uf-brand{grid-column:1/-1;max-width:none}}
    @media(max-width:620px){.uf-grid{grid-template-columns:1fr 1fr;gap:32px 20px}.uf-inner{padding:48px 0 28px}.uf-pay{flex-direction:column;align-items:flex-start}.uf-bottom{flex-direction:column;align-items:flex-start}}
  `;
  document.head.appendChild(footerStyle);

  // Mirrors lib/store-url.ts's usesCleanStorePaths()/storePath() -- store.js
  // is plain static JS (no bundler) so it can't import that TS module, but
  // the branch must stay in sync: on unik.catalogstore.co.za, AND on any
  // custom domain connected to this store (e.g. uniklabs.co.za), the
  // platform's middleware already rewrites "/help" to "/store/unik/help"
  // internally, so the link here must be the bare path -- otherwise the
  // /store/unik prefix gets applied twice and every link 404s, which is
  // exactly what happened here before custom domains were accounted for.
  // Only the bare platform root domain, localhost and preview URLs (which
  // middleware does NOT rewrite) need the literal /store/unik prefix.
  function unikBasePath() {
    var ROOT = 'catalogstore.co.za';
    var host = location.hostname.toLowerCase();
    var needsPrefix = host === ROOT || host === 'www.' + ROOT || host === 'localhost' || host.slice(-11) === '.vercel.app';
    return needsPrefix ? '/store/unik' : '';
  }

  function initFooter() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    if (path !== 'index.html' && path !== '') return;
    if (document.querySelector('.unik-footer')) return;
    const base = unikBasePath();
    const footer = document.createElement('footer');
    footer.className = 'unik-footer';
    footer.setAttribute('aria-label', 'Site footer');
    footer.innerHTML = `
      <div class="uf-inner">
        <div class="uf-grid">
          <div class="uf-brand">
            <a class="uf-logo" href="index.html" aria-label="UNIK home"><img src="assets/unik-logo-v3-header.png" alt="UNIK — For you. And only you"></a>
            <p class="uf-desc">AI-powered apparel design, made uniquely yours. Create custom artwork, preview it on premium garments and bring your ideas to life.</p>
            <p class="uf-location">Built in Durban, South Africa.</p>
          </div>
          <nav class="uf-col" aria-label="Products">
            <h3>Products</h3>
            <ul>
              <li><a href="studio.html">AI Design Studio</a></li>
              <li><a href="upload.html">Custom Upload</a></li>
              <li><span class="uf-soon">Plain Garments <em>Coming Soon</em></span></li>
            </ul>
          </nav>
          <nav class="uf-col" aria-label="Support">
            <h3>Support</h3>
            <ul>
              <li><a href="${base}/help" target="_top">Help Centre</a></li>
              <li><a href="${base}/faq" target="_top">FAQs</a></li>
              <li><a href="${base}/contact" target="_top">Contact Us</a></li>
            </ul>
          </nav>
          <nav class="uf-col" aria-label="Company">
            <h3>Company</h3>
            <ul>
              <li><a href="${base}/about" target="_top">About UNIK Labs</a></li>
              <li><a href="${base}/about#our-story" target="_top">Our Story</a></li>
            </ul>
          </nav>
          <nav class="uf-col" aria-label="Legal">
            <h3>Legal</h3>
            <ul>
              <li><a href="${base}/terms" target="_top">Terms of Service</a></li>
              <li><a href="${base}/privacy" target="_top">Privacy Policy</a></li>
              <li><a href="${base}/refund-policy" target="_top">Refund &amp; Returns Policy</a></li>
              <li><a href="${base}/shipping-policy" target="_top">Shipping Policy</a></li>
              <li><a href="${base}/cookie-policy" target="_top">Cookie Policy</a></li>
              <li><a href="${base}/acceptable-use" target="_top">Acceptable Use Policy</a></li>
              <li><a href="${base}/intellectual-property" target="_top">Intellectual Property Policy</a></li>
            </ul>
          </nav>
        </div>
        <div class="uf-pay">
          <div class="uf-pay-accept">
            <span class="uf-pay-label">We accept</span>
            <span class="uf-pay-logos">
              <img src="/checkout/yoco.png" alt="Yoco" class="uf-pay-logo uf-pay-logo--flush">
              <img src="/checkout/visa.png" alt="Visa" class="uf-pay-logo">
              <img src="/checkout/mastercard.png" alt="Mastercard" class="uf-pay-logo">
              <img src="/checkout/applepay.png" alt="Apple Pay" class="uf-pay-logo">
            </span>
          </div>
          <div class="uf-pay-delivery">
            <span class="uf-flag" role="img" aria-label="South Africa">🇿🇦</span>
            <div class="uf-pay-delivery-text">
              <strong>Delivery within South Africa only</strong>
              <span>We currently deliver to all major cities and towns across South Africa.</span>
            </div>
          </div>
        </div>
        <p class="uf-secure">Secure payments processed through our payment partners.</p>
        <div class="uf-bottom">
          <span>© <span data-unik-footer-year></span> UNIK Labs. All rights reserved.</span>
          <div class="uf-bottom-links">
            <a href="${base}/privacy" target="_top">Privacy</a>
            <a href="${base}/terms" target="_top">Terms</a>
            <a href="${base}/cookie-policy" target="_top">Cookies</a>
          </div>
        </div>
      </div>`;
    document.body.appendChild(footer);
    const yearEl = footer.querySelector('[data-unik-footer-year]');
    if (yearEl) yearEl.textContent = String(new Date().getFullYear());
  }

  // Live chat widget: talks to the same /api/support/message + /api/support/messages
  // endpoints the rest of the platform's storefront chat already uses
  // (category="storefront"), so replies show up in the Brand Manager's
  // real inbox. No React here -- these static pages share this one script,
  // so the widget is built by hand the same way the footer above is.
  const SUPPORT_VISITOR_KEY = 'unik-labs-support-visitor';
  const SUPPORT_CONVERSATION_KEY = 'unik-labs-support-conversation';
  const SUPPORT_IDENTITY_KEY = 'unik-labs-support-identity';
  let supportSellerId = null;
  let supportPollTimer = null;

  function supportVisitorId() {
    let id = null;
    try { id = localStorage.getItem(SUPPORT_VISITOR_KEY); } catch (e) {}
    if (!id) {
      id = 'v-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(SUPPORT_VISITOR_KEY, id); } catch (e) {}
    }
    return id;
  }

  async function supportSeller() {
    if (supportSellerId) return supportSellerId;
    try {
      const res = await fetch('/api/seller-public?slug=unik');
      const data = await res.json();
      supportSellerId = data.id || null;
    } catch (e) {}
    return supportSellerId;
  }

  function initSupportChat() {
    const chatStyle = document.createElement('style');
    chatStyle.textContent = `
      .unik-chat-toggle{position:fixed;right:18px;bottom:18px;z-index:2000;width:56px;height:56px;border-radius:50%;background:#050505;border:1px solid rgba(255,255,255,.18);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 14px 40px rgba(0,0,0,.4)}
      .unik-chat-toggle svg{width:24px;height:24px}
      .unik-chat-panel{position:fixed;right:18px;bottom:86px;z-index:2000;width:min(340px,calc(100vw - 36px));height:min(460px,calc(100vh - 140px));background:#0d0d0f;border:1px solid #27272a;border-radius:20px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.5);font-family:Arial,sans-serif}
      .unik-chat-panel.open{display:flex}
      .unik-chat-head{padding:14px 16px;border-bottom:1px solid #27272a;display:flex;align-items:center;justify-content:space-between}
      .unik-chat-head strong{color:#fff;font-size:13px}
      .unik-chat-close{background:none;border:0;color:#999;font-size:20px;cursor:pointer;line-height:1}
      .unik-chat-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
      .unik-chat-msg{max-width:80%;padding:9px 12px;border-radius:14px;background:#17171a;color:#f4f1e9;font-size:12px;line-height:1.5;border:1px solid #26262a}
      .unik-chat-msg.out{margin-left:auto;background:#f43d32;border-color:#f43d32;color:#fff}
      .unik-chat-form{padding:12px;border-top:1px solid #27272a;display:flex;gap:8px}
      .unik-chat-form input{flex:1;min-width:0;background:#111113;border:1px solid #27272a;border-radius:10px;color:#fff;padding:10px 12px;font-size:12px;outline:none}
      .unik-chat-send{background:#f43d32;color:#fff;border:0;border-radius:10px;padding:0 14px;font-weight:800;cursor:pointer}
      .unik-chat-intro{padding:16px;display:flex;flex-direction:column;gap:10px}
      .unik-chat-intro p{margin:0;color:#c9c9c4;font-size:12px;line-height:1.5}
      .unik-chat-intro input{background:#111113;border:1px solid #27272a;border-radius:10px;color:#fff;padding:10px 12px;font-size:12px;outline:none}
      .unik-chat-intro button{background:#f43d32;color:#fff;border:0;border-radius:10px;padding:11px;font-weight:800;font-size:12px;cursor:pointer}
    `;
    document.head.appendChild(chatStyle);

    const toggle = document.createElement('button');
    toggle.className = 'unik-chat-toggle';
    toggle.setAttribute('aria-label', 'Open live chat');
    toggle.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4z"/></svg>';
    document.body.appendChild(toggle);

    const panel = document.createElement('div');
    panel.className = 'unik-chat-panel';
    panel.innerHTML = `
      <div class="unik-chat-head"><strong>Chat with us</strong><button class="unik-chat-close" type="button" aria-label="Close chat">&times;</button></div>
      <div class="unik-chat-scroll" style="flex:1;overflow:hidden;display:flex;flex-direction:column"></div>
    `;
    document.body.appendChild(panel);
    const scrollArea = panel.querySelector('.unik-chat-scroll');

    function identity() {
      try { return JSON.parse(localStorage.getItem(SUPPORT_IDENTITY_KEY) || 'null'); } catch (e) { return null; }
    }

    function renderIntro() {
      scrollArea.innerHTML = `
        <div class="unik-chat-intro">
          <p>Tell us a little about yourself so we can help you out.</p>
          <input type="text" id="unikChatName" placeholder="Your name" autocomplete="name">
          <input type="email" id="unikChatEmail" placeholder="Email address" autocomplete="email">
          <button type="button" id="unikChatStart">Start chat</button>
        </div>`;
      scrollArea.querySelector('#unikChatStart').addEventListener('click', () => {
        const name = scrollArea.querySelector('#unikChatName').value.trim();
        const email = scrollArea.querySelector('#unikChatEmail').value.trim();
        if (!name || !email) return;
        try { localStorage.setItem(SUPPORT_IDENTITY_KEY, JSON.stringify({ name, email })); } catch (e) {}
        renderThread();
      });
    }

    function renderThread() {
      scrollArea.innerHTML = `
        <div class="unik-chat-body" id="unikChatBody"></div>
        <form class="unik-chat-form" id="unikChatForm">
          <input type="text" id="unikChatInput" placeholder="Write a message" autocomplete="off">
          <button class="unik-chat-send" type="submit">Send</button>
        </form>`;
      const body = scrollArea.querySelector('#unikChatBody');
      const form = scrollArea.querySelector('#unikChatForm');
      const input = scrollArea.querySelector('#unikChatInput');

      function paint(messages) {
        body.innerHTML = messages.map(m => `<div class="unik-chat-msg${m.sender === 'visitor' ? '' : ' out'}">${String(m.body || '').replace(/</g, '&lt;')}</div>`).join('');
        body.scrollTop = body.scrollHeight;
      }

      async function poll() {
        const conversationId = (function () { try { return localStorage.getItem(SUPPORT_CONVERSATION_KEY); } catch (e) { return null; } })();
        if (!conversationId) return;
        try {
          const res = await fetch(`/api/support/messages?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(supportVisitorId())}`);
          const data = await res.json();
          if (data.messages) paint(data.messages);
        } catch (e) {}
      }

      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const text = input.value.trim();
        if (!text) return;
        input.value = '';
        const id = identity() || {};
        const sellerId = await supportSeller();
        let conversationId = null;
        try { conversationId = localStorage.getItem(SUPPORT_CONVERSATION_KEY); } catch (e) {}
        try {
          const res = await fetch('/api/support/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              visitorId: supportVisitorId(),
              conversationId: conversationId || undefined,
              message: text,
              name: id.name,
              email: id.email,
              category: 'storefront',
              storefrontSellerId: sellerId,
            }),
          });
          const data = await res.json();
          if (data.conversationId) { try { localStorage.setItem(SUPPORT_CONVERSATION_KEY, data.conversationId); } catch (e) {} }
        } catch (e) {}
        poll();
      });

      poll();
      clearInterval(supportPollTimer);
      supportPollTimer = setInterval(poll, 5000);
    }

    toggle.addEventListener('click', () => {
      panel.classList.add('open');
      if (identity()) renderThread(); else renderIntro();
    });
    panel.querySelector('.unik-chat-close').addEventListener('click', () => {
      panel.classList.remove('open');
      clearInterval(supportPollTimer);
    });
  }

  function initNavigation() {
    const path = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const isHome = path === 'index.html' || path === '';
    if (isHome) document.documentElement.dataset.unikPage = 'home';
    const account = currentAccount();
    const accountLabel = account?.name ? account.name.split(/\s+/)[0] : 'Account';
    if (isHome) {
      const landingLogo = document.querySelector('.nav-logo');
      if (landingLogo) {
        landingLogo.src = 'assets/unik-logo-v3-header.png';
        landingLogo.removeAttribute('srcset');
        landingLogo.alt = 'UNIK — For you. And only you';
      }
      const menu = document.createElement('div');
      menu.className = 'unik-home-menu';
      const bagIcon = '<svg fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="1.4" viewBox="0 0 20 22" aria-hidden="true"><path d="M4 7h12l1 13H3L4 7z"></path><path d="M7 7V5a3 3 0 016 0v2"></path></svg>';
      menu.innerHTML = '<button class="unik-home-close" aria-label="Close menu">&times;</button><div><a href="studio.html">Create with AI</a><a href="upload.html">Upload artwork</a><a href="/account" target="_top">'+accountLabel+'</a><a href="checkout.html" class="unik-drawer-cart">'+bagIcon+'<span>Cart</span><span data-unik-cart-count class="unik-cart-count" hidden>0</span></a><button class="unik-home-theme" data-unik-theme-toggle type="button">Theme</button></div>';
      document.body.appendChild(menu);
      const trigger = document.querySelector('.nav-icon-btn');
      if (trigger) trigger.addEventListener('click', () => menu.classList.add('open'));
      menu.querySelector('.unik-home-close').addEventListener('click', () => menu.classList.remove('open'));
      menu.addEventListener('click', (e) => { if (e.target === menu) menu.classList.remove('open'); });
      menu.querySelector('[data-unik-theme-toggle]').addEventListener('click', toggleTheme);
      const bag = document.querySelector('.nav-bag');
      if (bag && !bag.closest('a')) {
        const actions = document.createElement('div');
        actions.className = 'unik-header-actions';
        const accountLink = document.createElement('a');
        accountLink.href = '/account';
        accountLink.target = '_top';
        accountLink.className = 'unik-header-account';
        accountLink.setAttribute('aria-label', account ? `Open ${accountLabel}'s account` : 'Open account');
        accountLink.innerHTML = '<span class="unik-account-glyph" aria-hidden="true"></span>';
        const cartLink = document.createElement('a');
        cartLink.href = 'checkout.html';
        cartLink.className = 'unik-header-cart';
        cartLink.setAttribute('aria-label','Open cart');
        const countBadge = document.createElement('span');
        countBadge.className = 'unik-header-cart-count';
        countBadge.setAttribute('data-unik-cart-count','');
        countBadge.hidden = true;
        bag.parentNode.insertBefore(actions,bag);
        cartLink.appendChild(bag);
        cartLink.appendChild(countBadge);
        actions.appendChild(accountLink);
        actions.appendChild(cartLink);
      }
      updateThemeControls();
      return;
    }

    const nav = document.createElement('nav');
    nav.className = 'unik-site-nav';
    nav.setAttribute('aria-label', 'UNIK Labs product navigation');
    nav.innerHTML = `
      <div class="unik-brand-group">
        <a class="unik-site-brand" href="index.html" aria-label="UNIK home"><img class="unik-site-brand-logo" src="assets/unik-logo-v3-header.png" alt="UNIK — For you. And only you"></a>
      </div>
      <div class="unik-site-links">
        <a href="studio.html"${path === 'studio.html' ? ' class="active"' : ''}>AI Studio</a>
        <a href="upload.html"${path === 'upload.html' ? ' class="active"' : ''}>Custom Upload</a>
        <a href="/account" target="_top" class="unik-account-link">${accountLabel}</a>
        <a href="checkout.html" class="unik-cart-link${path === 'checkout.html' ? ' active' : ''}">Cart <span data-unik-cart-count class="unik-cart-count" hidden>0</span></a>
      </div>
      <button class="unik-theme-toggle unik-nav-theme" data-unik-theme-toggle type="button">Theme</button>`;
    document.body.insertBefore(nav, document.body.firstChild);
    nav.querySelector('[data-unik-theme-toggle]').addEventListener('click', toggleTheme);
    updateThemeControls();
  }

  function initSizeGuide() {
    const triggers = [...document.querySelectorAll('[data-unik-size-guide]')];
    if (!triggers.length) return;
    const modal = document.createElement('div');
    modal.className = 'unik-size-modal';
    modal.hidden = true;
    modal.innerHTML = `
      <section class="unik-size-modal-card" role="dialog" aria-modal="true" aria-labelledby="unikSizeTitle">
        <header class="unik-size-modal-head">
          <div><p class="unik-size-modal-kicker">UNIK Labs fit reference</p><h2 class="unik-size-modal-title" id="unikSizeTitle">Oversized Tee · Size Guide</h2></div>
          <button class="unik-size-modal-close" type="button" aria-label="Close size guide">&times;</button>
        </header>
        <div class="unik-size-tabs" role="tablist" aria-label="Size guide sections">
          <button class="unik-size-tab" type="button" role="tab" aria-selected="true" data-size-tab="chart">Size Chart</button>
          <button class="unik-size-tab" type="button" role="tab" aria-selected="false" data-size-tab="measure">How to Measure</button>
        </div>
        <div class="unik-size-panel" data-size-panel="chart">
          <div class="unik-size-table-wrap"><table class="unik-size-table">
            <thead><tr><th>Label size</th><th>Bust (cm)</th><th>Waist (cm)</th><th>Height (cm)</th></tr></thead>
            <tbody>
              <tr><td>XS</td><td>88–92</td><td>74–78</td><td>170–175</td></tr>
              <tr><td>S</td><td>92–96</td><td>78–82</td><td>170–175</td></tr>
              <tr><td>M</td><td>96–100</td><td>82–86</td><td>175–180</td></tr>
              <tr><td>L</td><td>100–105</td><td>86–91</td><td>180–185</td></tr>
              <tr><td>XL</td><td>105–110</td><td>91–96</td><td>185–190</td></tr>
              <tr><td>XXL</td><td>110–115</td><td>96–102</td><td>185–190</td></tr>
            </tbody>
          </table></div>
          <p class="unik-size-note">All measurements are in centimetres. If you are between sizes, we recommend sizing up.</p>
        </div>
        <div class="unik-size-panel" data-size-panel="measure" hidden>
          <div class="unik-measure-switch" aria-label="Choose measurement illustration">
            <button class="unik-measure-person" type="button" aria-pressed="true" data-measure-person="women">Women</button>
            <button class="unik-measure-person" type="button" aria-pressed="false" data-measure-person="men">Men</button>
          </div>
          <div class="unik-measure-grid">
            <img class="unik-measure-img" src="assets/size-guide/tee-how-to-measure-women.jpeg" alt="How to take body measurements for the UNIK oversized tee" data-measure-image>
            <ol class="unik-measure-list">
              <li class="unik-measure-item"><span class="unik-measure-num">1</span><div><strong class="unik-measure-name">Bust</strong><p class="unik-measure-copy">Measure the circumference of the fullest part of your bust.</p></div></li>
              <li class="unik-measure-item"><span class="unik-measure-num">2</span><div><strong class="unik-measure-name">Waist</strong><p class="unik-measure-copy">Measure the thinnest part of your waist.</p></div></li>
              <li class="unik-measure-item"><span class="unik-measure-num">3</span><div><strong class="unik-measure-name">Hips</strong><p class="unik-measure-copy">Measure the fullest part of your hips.</p></div></li>
              <li class="unik-measure-item"><span class="unik-measure-num">4</span><div><strong class="unik-measure-name">Height</strong><p class="unik-measure-copy">Measure your height.</p></div></li>
            </ol>
          </div>
        </div>
      </section>`;
    document.body.appendChild(modal);
    let lastFocus = null;
    const closeButton = modal.querySelector('.unik-size-modal-close');
    const close = () => {
      modal.hidden = true;
      document.body.style.overflow = '';
      if (lastFocus) lastFocus.focus();
    };
    const open = (trigger) => {
      lastFocus = trigger;
      modal.hidden = false;
      document.body.style.overflow = 'hidden';
      closeButton.focus();
    };
    triggers.forEach(trigger => trigger.addEventListener('click', () => open(trigger)));
    closeButton.addEventListener('click', close);
    modal.addEventListener('click', event => { if (event.target === modal) close(); });
    document.addEventListener('keydown', event => { if (!modal.hidden && event.key === 'Escape') close(); });
    modal.querySelectorAll('[data-size-tab]').forEach(tab => tab.addEventListener('click', () => {
      modal.querySelectorAll('[data-size-tab]').forEach(item => item.setAttribute('aria-selected', String(item === tab)));
      modal.querySelectorAll('[data-size-panel]').forEach(panel => { panel.hidden = panel.dataset.sizePanel !== tab.dataset.sizeTab; });
    }));
    modal.querySelectorAll('[data-measure-person]').forEach(button => button.addEventListener('click', () => {
      const person = button.dataset.measurePerson;
      modal.querySelectorAll('[data-measure-person]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      modal.querySelector('[data-measure-image]').src = `assets/size-guide/tee-how-to-measure-${person}.jpeg`;
    }));
  }

  window.UNIK_CART = { add, remove, updateQty, clear, get: cart, updateCount, saveOrder, notify, upgradeCustomUpload, attachCustomUploadRaw };
  window.UNIK_ACCOUNT = { get:currentAccount, signIn, signOut, orders:accountOrders, generations, saveGeneration };
  window.UNIK_THEME = { get:currentTheme, apply:applyTheme, toggle:toggleTheme };
  initNavigation();
  initSizeGuide();
  initFooter();
  initSupportChat();
  updateCount();
  window.addEventListener('storage', updateCount);
})();
