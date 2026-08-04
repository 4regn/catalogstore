(async function(){
  // KEYS.orders/draft stay localStorage-backed for now -- checkout/order
  // creation is still Phase 2 (real order + instalment plan creation is
  // its own separate build). Everything auth-related below is real.
  const KEYS={orders:'setla-orders-v1',draft:'unik-setla-checkout-draft-v1'};
  const REFRESH_KEY='setla-labs-refresh-token-v1';
  const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const safeNext=()=>{const value=new URLSearchParams(location.search).get('next')||'';return /^[a-z0-9-]+\.html(?:[?#].*)?$/i.test(value)?value:''};
  const money=value=>`R${Number(value||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  // Fire-and-forget page-view beacon -- every SETLA static page loads this
  // script, so this single line covers analytics for the whole site with
  // no per-page wiring. Anonymous per-browser id, no auth required (most
  // visitors haven't signed up yet). See app/api/setla/admin/analytics.
  (function trackPageView(){
    let visitorId=null;
    try{visitorId=localStorage.getItem('setla-analytics-visitor-v1')}catch(_){}
    if(!visitorId){visitorId='v-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);try{localStorage.setItem('setla-analytics-visitor-v1',visitorId)}catch(_){}}
    // document.referrer alone under-counts channels like WhatsApp, whose
    // in-app browser strips it on most devices -- utm_source on the link
    // (e.g. ?utm_source=whatsapp) is the only reliable way to attribute
    // those, so it's captured here and preferred over referrer when both
    // are present. Persisted per-visitor so a page viewed later in the
    // same session (no utm_source on that specific URL) still attributes
    // back to how they originally arrived, not to "direct".
    let source=null;
    try{
      const fromUrl=new URLSearchParams(location.search).get('utm_source');
      if(fromUrl){source=fromUrl.slice(0,40);sessionStorage.setItem('setla-analytics-source-v1',source)}
      else source=sessionStorage.getItem('setla-analytics-source-v1')||null;
    }catch(_){}
    fetch('/api/setla/analytics/pageview',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({path:location.pathname.split('/').pop()||'index.html',visitorId,referrer:document.referrer||'',source})}).catch(()=>{});
  })();

  function storeRefreshToken(token,persist){
    try{
      if(persist){localStorage.setItem(REFRESH_KEY,token);sessionStorage.removeItem(REFRESH_KEY)}
      else{sessionStorage.setItem(REFRESH_KEY,token);localStorage.removeItem(REFRESH_KEY)}
    }catch(_){}
  }
  function getRefreshToken(){try{return localStorage.getItem(REFRESH_KEY)||sessionStorage.getItem(REFRESH_KEY)}catch(_){return null}}
  function clearRefreshToken(){try{localStorage.removeItem(REFRESH_KEY);sessionStorage.removeItem(REFRESH_KEY)}catch(_){}}

  // Real session resolution against the httpOnly setla-customer-access
  // cookie, same shape as UnikAccountClient.tsx/checkout.html's own
  // refresh dance: if the ~55min cookie has expired, trade the refresh
  // token stashed at sign-in for a fresh one before giving up. Resolved
  // ONCE at load and cached in `resolvedAccount` so every later
  // currentAccount() call in this file (there are many, further down)
  // can stay a plain synchronous read instead of needing to be rewritten
  // async throughout.
  let resolvedAccount=null;
  function currentAccount(){return resolvedAccount}
  async function resolveSession(){
    let res=await fetch('/api/setla/auth/session',{credentials:'include',cache:'no-store'}).catch(()=>null);
    if(!res||res.status===401){
      const refreshToken=getRefreshToken();
      if(refreshToken){
        const refreshRes=await fetch('/api/setla/auth/refresh',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({refreshToken})}).catch(()=>null);
        if(refreshRes&&refreshRes.ok){
          const payload=await refreshRes.json().catch(()=>({}));
          if(payload.refreshToken)storeRefreshToken(payload.refreshToken,!!localStorage.getItem(REFRESH_KEY));
          res=await fetch('/api/setla/auth/session',{credentials:'include',cache:'no-store'}).catch(()=>null);
        }else{
          clearRefreshToken();
        }
      }
    }
    if(!res||!res.ok)return null;
    const dashRes=await fetch('/api/setla/dashboard',{credentials:'include',cache:'no-store'}).catch(()=>null);
    if(!dashRes||!dashRes.ok)return null;
    return await dashRes.json().catch(()=>null);
  }
  function requireAccount(next=location.pathname.split('/').pop()+location.search){if(currentAccount())return true;location.href=`login.html?next=${encodeURIComponent(next)}`;return false}
  // Show/hide toggle for every password field -- lets a customer confirm
  // what they actually typed before submitting, especially on mobile
  // keyboards. data-toggle-password points at the input's id.
  document.querySelectorAll('[data-toggle-password]').forEach(btn=>{
    const input=document.getElementById(btn.dataset.togglePassword);
    if(!input)return;
    btn.addEventListener('click',()=>{
      const nowVisible=input.type==='password';
      input.type=nowVisible?'text':'password';
      btn.classList.toggle('is-visible',nowVisible);
      btn.setAttribute('aria-label',nowVisible?'Hide password':'Show password');
    });
  });
  document.querySelectorAll('[data-copy-next]').forEach(link=>{const next=safeNext();if(next)link.href=`${link.getAttribute('href')}?next=${encodeURIComponent(next)}`});
  const authError=document.getElementById('authError');
  const showAuthError=message=>{if(!authError)return;authError.textContent=message;authError.classList.add('show')};

  document.getElementById('signupForm')?.addEventListener('submit',async event=>{
    event.preventDefault();authError?.classList.remove('show');
    const data=new FormData(event.currentTarget);
    const submitBtn=event.currentTarget.querySelector('.auth-submit');
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Creating account…'}
    try{
      const res=await fetch('/api/setla/auth/signup',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({
        firstName:data.get('firstName'),lastName:data.get('lastName'),email:data.get('email'),phone:data.get('phone'),
        password:data.get('password'),confirmPassword:data.get('confirmPassword'),
      })});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){showAuthError(payload.error||'Could not create your account');return}
      if(payload.reusedExistingAccount){
        event.currentTarget.innerHTML=`<div class="confirmation-mark small-mark"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></div><div class="eyebrow">Almost there</div><h1>Check your email.</h1><p>${escapeHTML(payload.message||"You already had an account under this email -- we've sent a link to set your SETLA password.")}</p><a class="button primary auth-submit" href="login.html">Return to login</a>`;
        return;
      }
      if(payload.refreshToken)storeRefreshToken(payload.refreshToken,true);
      location.href=safeNext()||'apply.html';
    }catch(_){
      showAuthError('Something went wrong. Please try again.');
    }finally{
      if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Create SETLA account'}
    }
  });

  document.getElementById('loginForm')?.addEventListener('submit',async event=>{
    event.preventDefault();authError?.classList.remove('show');
    const data=new FormData(event.currentTarget);
    const submitBtn=event.currentTarget.querySelector('.auth-submit');
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Signing in…'}
    try{
      const res=await fetch('/api/setla/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({
        email:data.get('email'),password:data.get('password'),
      })});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){showAuthError(payload.error||'Could not sign in');return}
      if(payload.refreshToken)storeRefreshToken(payload.refreshToken,!!data.get('remember'));
      location.href=safeNext()||'dashboard.html';
    }catch(_){
      showAuthError('Something went wrong. Please try again.');
    }finally{
      if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Log in securely'}
    }
  });

  document.getElementById('forgotForm')?.addEventListener('submit',async event=>{
    event.preventDefault();authError?.classList.remove('show');
    const data=new FormData(event.currentTarget);
    const email=String(data.get('email')||'').trim();
    const submitBtn=event.currentTarget.querySelector('.auth-submit');
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Sending…'}
    try{
      await fetch('/api/setla/auth/forgot-password',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email})}).catch(()=>{});
    }finally{
      event.currentTarget.innerHTML=`<div class="confirmation-mark small-mark"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></div><div class="eyebrow">Request received</div><h1>Check your email.</h1><p>If ${escapeHTML(email)} is linked to a SETLA account, recovery instructions are on their way.</p><a class="button primary auth-submit" href="login.html">Return to login</a>`;
    }
  });

  document.getElementById('logoutButton')?.addEventListener('click',async()=>{
    await fetch('/api/setla/auth/session',{method:'DELETE',credentials:'include'}).catch(()=>{});
    clearRefreshToken();
    location.href='login.html';
  });

  resolvedAccount=await resolveSession();

  // "Live now" presence for the admin Analytics panel -- separate from the
  // one-shot pageview beacon above (that's a historical log; this is a
  // recurring heartbeat so the admin side can tell who's on the site right
  // now, not just who has ever visited). Placed after resolveSession() so
  // even the very first heartbeat already knows whether this is a signed-in
  // customer, not just anonymous until the next tick. Paused while the tab
  // isn't visible so someone leaving a background tab open for hours
  // doesn't read as "online" the whole time.
  (function trackPresence(){
    let visitorId=null;
    try{visitorId=localStorage.getItem('setla-analytics-visitor-v1')}catch(_){}
    if(!visitorId)return;
    function beat(){
      if(document.visibilityState!=='visible')return;
      fetch('/api/setla/analytics/heartbeat',{method:'POST',keepalive:true,headers:{'Content-Type':'application/json'},body:JSON.stringify({visitorId,path:location.pathname.split('/').pop()||'index.html',customerId:resolvedAccount?.id||null})}).catch(()=>{});
    }
    beat();
    setInterval(beat,20000);
    document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')beat()});
  })();

  const protectedPage=document.body.dataset.page;
  if(['dashboard','checkout','confirmed'].includes(protectedPage)&&!currentAccount()){requireAccount();return}
  if(document.getElementById('applicationForm')&&!currentAccount()){requireAccount('apply.html');return}
  const toast=document.querySelector('.toast');
  window.setlaToast=(message)=>{if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3200)};
  document.querySelectorAll('.choice input').forEach(input=>input.addEventListener('change',()=>document.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',Boolean(choice.querySelector('input')?.checked)))));
  const form=document.getElementById('applicationForm');
  const video=document.getElementById('identityVideo');
  const preview=document.getElementById('identityPreview');
  const frame=document.getElementById('cameraFrame');
  const status=document.getElementById('verificationStatus');
  const start=document.getElementById('startIdentityCamera');
  const capture=document.getElementById('captureIdentity');
  const retake=document.getElementById('retakeIdentity');
  const canvas=document.getElementById('identityCanvas');
  const captureTick=document.getElementById('captureTick');
  const captureConfirmText=document.getElementById('captureConfirmText');
  const TARGET_RATIO=3/4; // width/height -- matches .camera's aspect-ratio in setla.css
  let stream=null,captured=false,capturedBlob=null,previewUrl=null;
  let sbClientPromise=null;
  // Lazily loads a plain Supabase client (anon key only, no session needed)
  // for uploadToSignedUrl -- only apply.html loads the CDN SDK this needs.
  function getSbClient(){
    if(!sbClientPromise)sbClientPromise=fetch('/api/setla/config').then(r=>r.json()).then(cfg=>{
      if(!cfg.supabaseUrl||!cfg.supabaseAnonKey)throw new Error('Missing SETLA config');
      return supabase.createClient(cfg.supabaseUrl,cfg.supabaseAnonKey);
    });
    return sbClientPromise;
  }
  // Uploads go straight from this browser to Supabase Storage, never through
  // our own API -- Vercel Functions cap request bodies at 4.5MB, and a real
  // phone photo/PDF can get close to that on its own. One document at a
  // time now (see the "save the moment they add something" wiring below),
  // not all 5 batched at final submit: request a signed URL scoped to just
  // this document, upload to it, then confirm so setla_documents/progress
  // updates immediately -- a customer who only has their ID photo ready
  // today keeps that saved even if they close the tab before the rest.
  async function uploadOneDocument(documentType,file){
    try{
      const urlRes=await fetch('/api/setla/apply/document-upload-url',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentType})});
      const urlPayload=await urlRes.json().catch(()=>({}));
      if(!urlRes.ok)return{ok:false,error:urlPayload.error||'Could not prepare upload'};
      const sb=await getSbClient();
      const{error:uploadErr}=await sb.storage.from(urlPayload.bucket).uploadToSignedUrl(urlPayload.path,urlPayload.token,file,{contentType:file.type||'application/octet-stream',upsert:true});
      if(uploadErr)return{ok:false,error:uploadErr.message||'Upload failed'};
      const confirmRes=await fetch('/api/setla/apply/document-confirm',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({documentType})});
      const confirmPayload=await confirmRes.json().catch(()=>({}));
      if(!confirmRes.ok)return{ok:false,error:confirmPayload.error||'Could not save document'};
      return{ok:true,progress:confirmPayload};
    }catch(err){
      return{ok:false,error:err instanceof Error?err.message:'Upload failed'};
    }
  }
  function setUploadStatus(documentType,text,cls){
    const el=form?.querySelector(`[data-status-for="${documentType}"]`);
    if(!el)return;
    el.textContent=text;
    el.className='upload-status'+(cls?` ${cls}`:'');
  }

  // Single render function for the progress bar/checklist/submit-button
  // state -- called after every save (field blur, document upload, or the
  // initial prefill load) so the UI is always showing exactly what's
  // actually persisted, never a locally-guessed state.
  function renderApplyProgress(progress){
    if(!progress)return;
    const percentEl=document.getElementById('applyProgressPercent');
    const remainingEl=document.getElementById('applyProgressRemaining');
    const fillEl=document.getElementById('applyProgressFill');
    const submitBtn=document.getElementById('applySubmitBtn');
    if(percentEl)percentEl.textContent=`${progress.percent}% complete`;
    if(fillEl)fillEl.style.width=`${progress.percent}%`;
    if(remainingEl)remainingEl.textContent=(progress.remaining&&progress.remaining.length)?`Still needed: ${progress.remaining.map(r=>r.label).join(', ')}`:'Everything is in — ready to submit';
    if(submitBtn){
      submitBtn.disabled=!progress.complete;
      submitBtn.textContent=progress.complete?'Submit for review':'Complete every section to submit';
    }
  }

  const DRAFT_FIELD_NAMES=['idNumber','address','city','province','postal','income','expenses','bank','accountHolder','accountNumber','accountType'];
  async function saveDraftField(name,value){
    try{
      const res=await fetch('/api/setla/apply/draft',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({[name]:value})});
      const payload=await res.json().catch(()=>({}));
      if(res.ok)renderApplyProgress(payload);
    }catch(_){/* best-effort -- the field keeps its typed value regardless; the next successful save or a reload (which prefills from the server) catches up */}
  }

  function stopStream(){stream?.getTracks().forEach(track=>track.stop());stream=null}

  // idle: nothing captured yet, camera off. streaming: live camera showing,
  // ready to capture. captured: a real preview of what was actually saved,
  // so the customer can see it (and retake it) before it's ever uploaded --
  // previously there was no way to see the captured shot at all.
  function setCameraState(next){
    if(next==='idle'){
      video.hidden=false;preview.hidden=true;captureTick.hidden=true;captureConfirmText.hidden=true;frame.classList.remove('ready','captured');
      start.hidden=false;capture.hidden=false;capture.disabled=true;retake.hidden=true;
      status.textContent='Not started';
    }else if(next==='streaming'){
      video.hidden=false;preview.hidden=true;captureTick.hidden=true;captureConfirmText.hidden=true;frame.classList.add('ready');frame.classList.remove('captured');
      start.hidden=true;capture.hidden=false;capture.disabled=false;retake.hidden=true;
      status.textContent='Camera ready';
    }else if(next==='captured'){
      video.hidden=true;preview.hidden=false;captureTick.hidden=false;captureConfirmText.hidden=false;frame.classList.add('ready','captured');
      start.hidden=true;capture.hidden=true;retake.hidden=false;
      status.textContent='Selfie captured';
    }
  }

  async function startCamera(){
    try{
      // Ask for a portrait-oriented stream to match the 3:4 frame -- most
      // cameras (especially laptops) can't truly deliver this, but this at
      // least gets the closest match the hardware supports; captureSelfie()
      // below does the real work of cropping to exactly 3:4 regardless of
      // what the camera actually hands back.
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user',width:{ideal:720},height:{ideal:960},aspectRatio:{ideal:TARGET_RATIO}},audio:false});
      video.srcObject=stream;await video.play();
      setCameraState('streaming');
    }catch(error){
      status.textContent='Camera required';
      setlaToast('Camera access is required to complete your application. Please allow camera access and try again.');
    }
  }

  function captureSelfie(){
    const vw=video.videoWidth,vh=video.videoHeight;
    // Center-crop whatever the camera actually delivered down to exactly
    // 3:4, matching what object-fit:cover already shows the customer in
    // the preview box -- without this, a landscape camera's raw frame
    // (e.g. 4:3 or 16:9) would be saved uncropped, showing more (or less)
    // than what was actually framed on screen.
    let sx,sy,sw,sh;
    if(vw/vh>TARGET_RATIO){sh=vh;sw=vh*TARGET_RATIO;sx=(vw-sw)/2;sy=0}
    else{sw=vw;sh=vw/TARGET_RATIO;sx=0;sy=(vh-sh)/2}
    canvas.width=720;canvas.height=960;
    // Note: drawImage() reads the video's real decoded frame, not its
    // on-screen CSS appearance -- the live preview is mirrored with
    // transform:scaleX(-1) purely so framing yourself feels like a mirror,
    // but that CSS transform has no effect here, so the saved photo is
    // already the correct, non-mirrored orientation without any extra flip.
    canvas.getContext('2d').drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
    canvas.toBlob(blob=>{
      capturedBlob=blob;
      if(previewUrl)URL.revokeObjectURL(previewUrl);
      previewUrl=URL.createObjectURL(blob);
      preview.src=previewUrl;
      // Uploads immediately -- same "save the moment they add something"
      // rule the other documents follow, just triggered by the capture
      // button instead of a file input's change event.
      status.textContent='Saving selfie…';
      uploadOneDocument('live_selfie',blob).then(result=>{
        if(result.ok){status.textContent='Selfie captured & saved';renderApplyProgress(result.progress)}
        else{status.textContent='Not saved — retake';setlaToast(result.error||'Could not save your selfie. Please retake it.')}
      });
    },'image/jpeg',0.92);
    captured=true;
    stopStream();
    setCameraState('captured');
  }

  start?.addEventListener('click',startCamera);
  capture?.addEventListener('click',captureSelfie);
  retake?.addEventListener('click',()=>{captured=false;capturedBlob=null;setCameraState('idle');startCamera()});
  // Camera elements only exist on apply.html -- calling this unconditionally
  // on every page (dashboard, checkout, login...) threw on the first line
  // of setCameraState (video.hidden=... on a null video), which silently
  // killed the rest of this script before renderDashboard()/nav wiring ran.
  if(form)setCameraState('idle');
  const applicationAccount=currentAccount();
  if(form&&applicationAccount){const parts={firstName:applicationAccount.firstName,lastName:applicationAccount.lastName,email:applicationAccount.email,phone:applicationAccount.phone};Object.entries(parts).forEach(([name,value])=>{const input=form.elements[name];if(input&&value)input.value=value})}

  if(form){
    // Save on blur (change for selects), not on every keystroke -- fires
    // once the customer actually moves to the next field.
    DRAFT_FIELD_NAMES.forEach(name=>{
      const input=form.elements[name];
      if(!input)return;
      input.addEventListener(input.tagName==='SELECT'?'change':'blur',()=>{if(input.value)saveDraftField(name,input.value)});
    });
    // Documents upload the instant a file is chosen -- same "save the
    // moment they add something" rule the text fields follow above, just
    // triggered by a change event instead of blur.
    [['idDocument','id_document'],['addressProof','proof_of_address'],['bankProof','proof_of_banking'],['statement','bank_statement']].forEach(([fieldName,documentType])=>{
      const input=form.elements[fieldName];
      if(!input)return;
      input.addEventListener('change',async()=>{
        const file=input.files&&input.files[0];
        if(!file)return;
        setUploadStatus(documentType,'Uploading…');
        const result=await uploadOneDocument(documentType,file);
        if(result.ok){setUploadStatus(documentType,'✓ Uploaded','is-done');renderApplyProgress(result.progress)}
        else setUploadStatus(documentType,result.error||'Upload failed','is-error');
      });
    });
    // Resumes a return visit: prefill every saved field and mark already-
    // uploaded documents as done, then render the real progress bar --
    // without this, "save as you go" would save correctly but a reload
    // would still look like starting over blank.
    fetch('/api/setla/apply/draft',{credentials:'include',cache:'no-store'}).then(r=>r.json()).then(payload=>{
      const draft=payload.draft||{};
      DRAFT_FIELD_NAMES.forEach(name=>{
        const input=form.elements[name];
        if(input&&draft[name]!=null&&draft[name]!=='')input.value=draft[name];
      });
      (payload.items||[]).forEach(item=>{
        if(!item.done)return;
        if(item.key==='live_selfie'){status.textContent='Selfie captured & saved';return}
        if(['id_document','proof_of_address','proof_of_banking','bank_statement'].includes(item.key))setUploadStatus(item.key,'✓ Already uploaded','is-done');
      });
      renderApplyProgress(payload);
    }).catch(()=>{});
  }
  // Every field and document is already saved by the time this fires --
  // submit is just the final "I'm done" action, not the thing that
  // actually moves the data. The button stays disabled (see
  // renderApplyProgress) until the server-computed progress says 100%,
  // so a real click here should always have everything it needs.
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    const submitBtn=document.getElementById('applySubmitBtn');
    if(submitBtn){submitBtn.disabled=true;submitBtn.textContent='Submitting…'}
    try{
      const res=await fetch('/api/setla/apply/submit',{method:'POST',credentials:'include'});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){
        setlaToast(payload.error||'Could not submit your application');
        if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Submit for review'}
        return;
      }
      stream?.getTracks().forEach(track=>track.stop());
      location.href='dashboard.html?submitted=1';
    }catch(_){
      setlaToast('Something went wrong. Please try again.');
      if(submitBtn){submitBtn.disabled=false;submitBtn.textContent='Submit for review'}
    }
  });
  const profile=currentAccount();
  const emptyView=(eyebrow,title,copy)=>`<div class="view-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div></div><section class="card empty-state"><h2>Nothing here yet</h2><p>Your own SETLA activity will appear here automatically.</p></section>`;
  const orderStatus=order=>order.methodCode==='laybuy'?'Paying':'Confirmed';
  // Which instalment is "next" is driven by real per-instalment status
  // (schedule[].isNext, computed server-side in /api/setla/dashboard) --
  // not array position 0, since instalment #1 is normally already paid at
  // checkout by the time a customer looks at their dashboard.
  function scheduleCard(order){
    const nextRow=(order.schedule||[]).find(row=>row.isNext);
    return `<article class="card plan-card"><div class="plan-top"><div><small>UNIK Labs · ${escapeHTML(order.id)}</small><h2>${escapeHTML(itemTitle(order.items?.[0]||{}))}</h2></div><span class="status-badge ${order.methodCode==='laybuy'?'pending':'good'}">${orderStatus(order)}</span></div><div class="plan-numbers"><div><small>Order total</small><strong>${money(order.total)}</strong></div><div><small>Payment route</small><strong>${escapeHTML(order.method)}</strong></div><div><small>Status</small><strong>${order.methodCode==='laybuy'?'Production locked':'First payment due'}</strong></div></div><div class="instalments">${(order.schedule||[]).map((row,index)=>`<div class="${row.isNext?'next':''}${row.status==='paid'?' paid':''}"><i>${row.status==='paid'?'✓':index+1}</i><span><strong>${row.status==='paid'?'Paid':row.isNext?'Due now':row.status==='overdue'?'Overdue':'Scheduled'}</strong><small>${escapeHTML(row.date)}</small></span><b>${money(row.amount)}</b></div>`).join('')}</div>${nextRow?`<button class="button primary pay-instalment" data-instalment-id="${escapeHTML(nextRow.instalmentId)}" type="button">Pay ${money(nextRow.amount)} now</button>`:''}</article>`;
  }
  // Delegated so it works regardless of when a plan card gets injected by
  // renderDashboard() below.
  document.addEventListener('click',async event=>{
    const btn=event.target.closest?.('.pay-instalment');
    if(!btn)return;
    const instalmentId=btn.dataset.instalmentId;
    if(!instalmentId)return;
    btn.disabled=true;btn.textContent='Starting secure payment…';
    try{
      const res=await fetch(`/api/setla/instalments/${encodeURIComponent(instalmentId)}/pay`,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({returnOrigin:location.origin})});
      const payload=await res.json().catch(()=>({}));
      if(!res.ok){setlaToast(payload.error||'Could not start payment. Please try again.');btn.disabled=false;btn.textContent='Pay now';return}
      location.href=payload.redirectUrl;
    }catch(_){
      setlaToast('Something went wrong. Please try again.');btn.disabled=false;btn.textContent='Pay now';
    }
  });
  function renderDashboard(account){
    const status=account.applicationStatus||account.status||'not_applied',approved=status==='approved',pending=status==='pending';
    const approvedLimit=approved?Number(account.approvedLimit||0):0,available=approved?Number(account.availableLimit??approvedLimit):0;
    // account.orders comes straight from /api/setla/dashboard, already
    // scoped to this customer -- real orders/instalments are Phase 2, so
    // this is always [] for now, which every branch below already
    // handles gracefully via emptyView()/the `latest` undefined checks.
    const orders=(account.orders||[]).slice().sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const payLater=orders.filter(order=>order.methodCode!=='laybuy'),laybuy=orders.filter(order=>order.methodCode==='laybuy'),latest=orders[0];
    const firstName=account.firstName||account.name?.split(' ')[0]||'there',fullName=account.name||[account.firstName,account.lastName].filter(Boolean).join(' ')||'Customer';
    document.getElementById('welcomeName').textContent=`Welcome, ${firstName}.`;document.getElementById('welcomeEmail').textContent=account.email||'';
    document.getElementById('accountStatus').innerHTML=`<span></span>${approved?'Active account':pending?'Application in review':'Application required'}`;
    // Bar represents spending POWER remaining, not amount used -- starts
    // full (100% = full approved limit still available) and depletes
    // toward 0 as the customer spends, like a fuel/battery gauge, matching
    // the "Available spending limit" label above it.
    document.getElementById('availableLimit').textContent=money(available);document.getElementById('limitProgress').style.width=`${approvedLimit?Math.max(0,Math.min(100,available/approvedLimit*100)):0}%`;
    document.getElementById('limitCaption').textContent=approved?`${money(approvedLimit-available)} used of your ${money(approvedLimit)} approved limit`:pending?'Your personal limit will appear after review.':'Complete your application to discover your personal limit.';
    // Not yet applied and started at least one field/document ('draft') get
    // a real, server-computed progress bar and a "still needed" checklist
    // instead of generic "one step left" copy -- driven by
    // applicationProgress from /api/setla/dashboard, the same shape
    // apply.html itself uses, so the two never disagree on the percentage.
    const progress=account.applicationProgress;
    const inProgress=status==='draft'||(status==='not_applied'&&progress&&progress.percent>0);
    document.getElementById('accountState').innerHTML=approved?'':pending?`<section class="card account-state-card"><div><div class="card-kicker">Application received</div><h2>We are reviewing your application.</h2><p>We will email you when a decision and personal limit are ready. SETLA Laybuy remains available at checkout.</p></div><a class="button outline" href="#support" data-view="support">Speak to support</a></section>`:`<section class="card account-state-card action-needed"><div><div class="card-kicker">${inProgress?'Continue your application':'One step left'}</div><h2>${inProgress?`${progress.percent}% of your application is done.`:"You're one step closer to unlocking your spending limit."}</h2><p>${inProgress?`Still needed: ${progress.remaining.map(r=>r.label).join(', ')}`:'You signed up, but your application is not done yet. Submit your identity, affordability and banking information to be considered for Pay Later.'}</p>${inProgress?`<div class="apply-progress"><div class="apply-progress-bar"><i style="width:${progress.percent}%"></i></div></div>`:''}</div><a class="button primary" href="apply.html">${inProgress?'Continue application':'Start application'}</a></section>`;
    const next=(latest?.schedule||[])[0];document.getElementById('nextPaymentCard').innerHTML=next?`<div class="card-kicker">Coming up</div><h2>Next payment</h2><div class="due-amount">${money(next.amount)}</div><p>${escapeHTML(next.date)} · Order ${escapeHTML(latest.id)}</p><button class="button primary" data-view="${latest.methodCode==='laybuy'?'laybuy':'plans'}">Manage payment plan</button>`:`<div class="card-kicker">Coming up</div><h2>No payment due</h2><p>Your next confirmed payment will appear here.</p>`;
    document.getElementById('latestOrderCard').innerHTML=latest?`<div class="section-heading"><div><div class="card-kicker">Latest purchase</div><h2>Order ${escapeHTML(latest.id)}</h2></div><span class="status-badge ${latest.methodCode==='laybuy'?'pending':'good'}">${orderStatus(latest)}</span></div><div class="order-preview"><div class="product-thumb"><svg viewBox="0 0 64 64"><path d="M20 13 9 20l6 12 7-4v25h20V28l7 4 6-12-11-7-6 5H26Z"/></svg></div><div><strong>${escapeHTML(itemTitle(latest.items?.[0]||{}))}</strong><p>${Number(latest.items?.length||0)} item${latest.items?.length===1?'':'s'}</p></div><div class="order-price"><small>Order total</small><strong>${money(latest.total)}</strong></div></div><button class="text-action" data-view="track">Track this order</button>`:`<div class="card-kicker">Latest purchase</div><h2>No orders yet</h2><p>Your first 4REGN x SETLA x UNIK Labs order will appear here.</p>`;
    document.getElementById('notificationPreview').innerHTML=pending?`<div class="notice-icon"></div><div><small>Application update</small><strong>Your application is being reviewed</strong><p>We will notify ${escapeHTML(account.email||'you')} when a decision is ready.</p></div><button class="text-action" data-view="notifications">View all</button>`:`<div class="notice-icon"></div><div><small>SETLA updates</small><strong>${latest?'Your order is connected':'No new notifications'}</strong><p>${latest?`Order ${escapeHTML(latest.id)} is now visible in your dashboard.`:'Account, payment and order updates will appear here.'}</p></div>`;
    document.getElementById('view-plans').innerHTML=payLater.length?`<div class="view-head"><div><div class="eyebrow">Payments</div><h1>Active plans.</h1><p>Your SETLA Pay Later schedules.</p></div><span class="account-pill">${payLater.length} active</span></div>${payLater.map(scheduleCard).join('')}`:emptyView('Payments','Active plans.','Your Pay Later schedules will appear after an eligible checkout.');
    document.getElementById('view-laybuy').innerHTML=laybuy.length?`<div class="view-head"><div><div class="eyebrow">SETLA Laybuy</div><h1>Pay first.<br>We create next.</h1><p>Complete your schedule to unlock production.</p></div></div>${laybuy.map(scheduleCard).join('')}`:emptyView('SETLA Laybuy','Pay first. We create next.','Your Laybuy orders will appear here.');
    document.getElementById('view-history').innerHTML=orders.length?`<div class="view-head"><div><div class="eyebrow">Purchases</div><h1>Order history.</h1><p>Every SETLA order connected to your account.</p></div></div><section class="card history-card"><div class="history-table"><div class="history-row history-head"><span>Order</span><span>Date</span><span>Total</span><span>Status</span><span></span></div>${orders.map(order=>`<div class="history-row"><span><strong>${escapeHTML(order.id)}</strong><small>${escapeHTML(itemTitle(order.items?.[0]||{}))}</small></span><span>${new Date(order.createdAt).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</span><span>${money(order.total)}</span><span><b class="status-badge ${order.methodCode==='laybuy'?'pending':'good'}">${orderStatus(order)}</b></span><span><button data-view="${order.methodCode==='laybuy'?'laybuy':'plans'}">View</button></span></div>`).join('')}</div></section>`:emptyView('Purchases','Order history.','Your completed and active orders will appear here.');
    document.getElementById('view-track').innerHTML=latest?`<div class="view-head"><div><div class="eyebrow">Order tracking</div><h1>Made for you.</h1><p>Follow your latest personalised order.</p></div><span class="status-badge ${latest.methodCode==='laybuy'?'pending':'good'}">${latest.methodCode==='laybuy'?'Awaiting full payment':'Confirmed'}</span></div><section class="card tracking-card"><div class="track-order-head"><div><small>Order ${escapeHTML(latest.id)}</small><h2>${escapeHTML(itemTitle(latest.items?.[0]||{}))}</h2></div></div><div class="track-line"><div class="track-step done"><i>1</i><div><strong>Order received</strong><p>Your SETLA order has been recorded.</p></div></div><div class="track-step current"><i>2</i><div><strong>${latest.methodCode==='laybuy'?'Complete payment schedule':'Complete first payment'}</strong><p>${latest.methodCode==='laybuy'?'Production unlocks after full payment.':'Production begins after payment confirmation.'}</p></div></div><div class="track-step"><i>3</i><div><strong>UNIK Labs production</strong><p>Your personalised garment is created and quality checked.</p></div></div><div class="track-step"><i>4</i><div><strong>Delivery</strong><p>Courier details appear when the order is dispatched.</p></div></div></div></section>`:emptyView('Order tracking','Made for you.','Your latest order journey will appear here.');
    document.getElementById('view-notifications').innerHTML=`<div class="view-head"><div><div class="eyebrow">Updates</div><h1>Notifications.</h1><p>Account, payment and order updates from SETLA and UNIK Labs.</p></div></div>${pending?'<article class="card notification unread"><div><strong>Application received</strong><p>Your SETLA application is being reviewed. We will email you when a decision is ready.</p></div></article>':latest?`<article class="card notification unread"><div><strong>Order connected</strong><p>Order ${escapeHTML(latest.id)} is now available in your SETLA dashboard.</p></div></article>`:'<section class="card empty-state"><h2>No notifications</h2><p>Your account updates will appear here.</p></section>'}`;
    const initials=fullName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();document.getElementById('profileInitials').textContent=initials||'—';document.getElementById('profileName').textContent=fullName;document.getElementById('profileContact').textContent=[account.email,account.phone].filter(Boolean).join(' · ');document.getElementById('profileLimit').textContent=money(approvedLimit);document.getElementById('profileMemberSince').textContent=new Date(account.createdAt||Date.now()).toLocaleDateString('en-ZA',{month:'long',year:'numeric'});document.getElementById('profilePaymentStatus').textContent=orders.length?'Plan active':'No active plan';document.getElementById('detailName').textContent=fullName;document.getElementById('detailEmail').textContent=account.email||'—';document.getElementById('detailPhone').textContent=account.phone||'—';document.getElementById('detailAddress').textContent=account.address||'Not supplied';document.getElementById('profileBadge').textContent=approved?'Verified customer':pending?'Verification in review':'Application required';document.getElementById('identityStatus').textContent=approved?'Identity verified':pending?'Verification in review':'Verification required';
    const bank=account.application?.bank,last4=account.application?.accountLast4;document.getElementById('bankType').textContent=bank?`${bank} · Verification ${approved?'approved':'pending'}`:'No verified bank account';document.getElementById('bankAccount').textContent=bank&&last4?`${fullName} · •••• ${last4}`:'Add your banking details during your application.';document.getElementById('bankStatus').textContent=bank?(approved?'Approved':'Under review'):'Not verified';
    // Only a declined applicant has anything to appeal -- showing this to
    // everyone else was both confusing and misleading for an approved or
    // still-pending customer.
    const appealPanel=document.getElementById('appeal');if(appealPanel)appealPanel.hidden=status!=='declined';
  }
  if(protectedPage==='dashboard'&&profile)renderDashboard(profile);
  if(new URLSearchParams(location.search).has('submitted'))setTimeout(()=>setlaToast('Application received. We will email you when your review is complete.'),300);
  document.querySelectorAll('[data-panel]').forEach(link=>link.addEventListener('click',()=>{
    const panel=document.getElementById(link.dataset.panel);
    if(!panel)return;
    document.querySelectorAll('[data-panel]').forEach(item=>item.classList.toggle('active',item===link));
    panel.classList.add('is-open');
    setTimeout(()=>panel.scrollIntoView({behavior:'smooth',block:'start'}),40);
  }));
  document.getElementById('bankForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    setlaToast('Bank update submitted for secure review. Your approved account remains active until the review is complete.');
  });
  document.getElementById('appealForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    setlaToast('Your appeal has been sent to the SETLA review team.');
  });
  document.getElementById('bankUpdate')?.addEventListener('click',event=>{event.preventDefault();setlaToast('Bank-detail changes open a new secure verification review.')});
  document.getElementById('continueSETLA')?.addEventListener('click',()=>{const choice=document.querySelector('input[name="plan"]:checked')?.value;if(choice==='limit'&&!profile){location.href='apply.html';return}setlaToast(choice==='laybuy'?'Laybuy selected. Your payment schedule is the next step.':'Your approved SETLA limit will be verified securely.')});

  const dashboardViews=[...document.querySelectorAll('.dashboard-view')];
  const viewControls=[...document.querySelectorAll('[data-view]')];
  function showDashboardView(name,scroll=true){
    const next=document.getElementById(`view-${name}`);
    if(!next)return;
    dashboardViews.forEach(view=>view.classList.toggle('active',view===next));
    document.querySelectorAll('.side-link[data-view],.account-dock [data-view]').forEach(control=>control.classList.toggle('active',control.dataset.view===name));
    history.replaceState(null,'',`#${name}`);
    if(scroll)window.scrollTo({top:0,behavior:'smooth'});
  }
  viewControls.forEach(control=>control.addEventListener('click',event=>{
    if(control.tagName==='A')event.preventDefault();
    showDashboardView(control.dataset.view);
  }));
  const initialView=location.hash.replace('#','');
  if(initialView&&document.getElementById(`view-${initialView}`))showDashboardView(initialView,false);

  document.querySelectorAll('.pay-early').forEach(button=>button.addEventListener('click',()=>{
    const amount=button.dataset.amount;
    button.disabled=true;
    button.textContent='Payment secured';
    button.closest('.plan-card')?.querySelector('.progress span')?.setAttribute('style','width:100%');
    setlaToast(`R${amount} payment confirmed. Your plan is now fully paid.`);
  }));

  const laybuyPay=document.getElementById('payLaybuy');
  let laybuyPaid=300;
  laybuyPay?.addEventListener('click',()=>{
    laybuyPaid=Math.min(600,laybuyPaid+150);
    document.getElementById('laybuyPaid').textContent=`R${laybuyPaid}`;
    document.getElementById('laybuyRemaining').textContent=`R${600-laybuyPaid}`;
    document.getElementById('laybuyProgress').style.width=`${laybuyPaid/6}%`;
    const next=document.getElementById('laybuyNext');
    if(laybuyPaid===450){
      next?.classList.add('paid');next?.classList.remove('next');
      if(next){next.querySelector('i').textContent='✓';next.querySelector('small').textContent='Paid now'}
      laybuyPay.textContent='Pay final R150';
      setlaToast('Payment received. One final Laybuy payment remains.');
    }else{
      laybuyPay.disabled=true;laybuyPay.textContent='Laybuy fully paid';
      const lock=document.getElementById('productionLock');
      lock?.classList.add('unlocked');
      if(lock)lock.innerHTML='<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg><div><strong>Production unlocked</strong><p>Your order has moved into the UNIK Labs production queue.</p></div>';
      setlaToast('Fully paid. Production is now unlocked for your order.');
    }
  });

  document.getElementById('markRead')?.addEventListener('click',event=>{
    document.querySelectorAll('.notification.unread').forEach(item=>item.classList.remove('unread'));
    event.currentTarget.textContent='All caught up';
    setlaToast('All notifications marked as read.');
  });

  // Real support chat -- reuses the exact same support_conversations/
  // support_messages system the UNIK storefront's own chat widget uses
  // (store.js's initSupportChat -- see supportSeller()/supportVisitorId()
  // there for the identical pattern), just filed under category:'setla'
  // so it lands in Brand Manager's inbox alongside storefront/partner
  // chats instead of a fourth, separate, never-actually-reachable system.
  (function initSetlaChat(){
    const chatForm=document.getElementById('chatForm');
    const chatInput=document.getElementById('chatInput');
    const chatMessages=document.getElementById('chatMessages');
    if(!chatForm||!chatMessages)return;
    const VISITOR_KEY='setla-support-visitor-v1';
    const CONVERSATION_KEY='setla-support-conversation-v1';
    let sellerId=null,pollTimer=null;

    function visitorId(){
      let id=null;
      try{id=localStorage.getItem(VISITOR_KEY)}catch(_){}
      if(!id){id='v-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);try{localStorage.setItem(VISITOR_KEY,id)}catch(_){}}
      return id;
    }
    async function resolveSeller(){
      if(sellerId)return sellerId;
      try{const res=await fetch('/api/seller-public?slug=unik');const data=await res.json();sellerId=data.id||null}catch(_){}
      return sellerId;
    }
    function paint(messages){
      if(!messages.length)return; // keep the static greeting until a real reply/message exists
      chatMessages.innerHTML=messages.map(m=>`<div class="message ${m.sender==='visitor'?'customer':'agent'}">${escapeHTML(m.body)}</div>`).join('');
      chatMessages.scrollTop=chatMessages.scrollHeight;
    }
    async function poll(){
      let conversationId=null;
      try{conversationId=localStorage.getItem(CONVERSATION_KEY)}catch(_){}
      if(!conversationId)return;
      try{
        const res=await fetch(`/api/support/messages?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId())}`);
        const data=await res.json();
        if(data.messages)paint(data.messages);
      }catch(_){}
    }

    chatForm.addEventListener('submit',async event=>{
      event.preventDefault();
      const message=chatInput?.value.trim();
      if(!message)return;
      chatInput.value='';
      const account=currentAccount();
      let conversationId=null;
      try{conversationId=localStorage.getItem(CONVERSATION_KEY)}catch(_){}
      try{
        const seller=await resolveSeller();
        const res=await fetch('/api/support/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          visitorId:visitorId(),conversationId:conversationId||undefined,message,
          name:account?.name,email:account?.email,category:'setla',storefrontSellerId:seller,
        })});
        const data=await res.json();
        if(data.conversationId){try{localStorage.setItem(CONVERSATION_KEY,data.conversationId)}catch(_){}}
      }catch(_){
        setlaToast('Could not send your message. Please try again.');
      }
      poll();
    });

    poll();
    clearInterval(pollTimer);
    pollTimer=setInterval(poll,5000);
  })();

  // Floating chat bubble for the landing page -- same idea as store.js's
  // initSupportChat() on uniklabs.co.za (bubble launcher -> expandable
  // panel, business-hours online indicator, name/email intro for a first-
  // time visitor), recolored to SETLA's own green rather than reusing
  // UNIK's red, matching the precedent already set by .message.customer
  // above. Shares the exact same visitor/conversation localStorage keys as
  // initSetlaChat() so a conversation started here continues seamlessly if
  // the same browser later opens the dashboard's own "Live support" tab --
  // one thread, not two. Only the landing page gets the floating bubble;
  // dashboard.html already has the full-page version and doesn't need both.
  (function initSetlaFloatingChat(){
    if(document.getElementById('chatForm'))return;
    if((location.pathname.split('/').pop()||'index.html')!=='index.html')return;

    const VISITOR_KEY='setla-support-visitor-v1';
    const CONVERSATION_KEY='setla-support-conversation-v1';
    const IDENTITY_KEY='setla-support-identity-v1';
    let sellerId=null,pollTimer=null;

    function visitorId(){
      let id=null;
      try{id=localStorage.getItem(VISITOR_KEY)}catch(_){}
      if(!id){id='v-'+Date.now().toString(36)+Math.random().toString(36).slice(2,10);try{localStorage.setItem(VISITOR_KEY,id)}catch(_){}}
      return id;
    }
    async function resolveSeller(){
      if(sellerId)return sellerId;
      try{const res=await fetch('/api/seller-public?slug=unik');const data=await res.json();sellerId=data.id||null}catch(_){}
      return sellerId;
    }
    function identity(){
      const account=currentAccount();
      if(account)return{name:account.name,email:account.email};
      try{return JSON.parse(localStorage.getItem(IDENTITY_KEY)||'null')}catch(_){return null}
    }

    // Mon-Fri 9am-6pm, Sat 10am-3pm, closed Sunday, SAST (UTC+2, no DST) --
    // mirrors store.js's unikChatBusinessHours()/lib/unik-business-hours.ts;
    // same support team behind both, so kept in sync by hand on purpose.
    const HOURS={0:null,1:[9,18],2:[9,18],3:[9,18],4:[9,18],5:[9,18],6:[10,15]};
    const DAY_NAMES=['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
    const formatHour=h=>{const period=h>=12?'pm':'am';const h12=h%12===0?12:h%12;return h12+period};
    function businessHours(){
      const sast=new Date(Date.now()+2*60*60*1000);
      const day=sast.getUTCDay();
      const minutesNow=sast.getUTCHours()*60+sast.getUTCMinutes();
      const todayRange=HOURS[day];
      if(todayRange&&minutesNow>=todayRange[0]*60&&minutesNow<todayRange[1]*60)return{online:true,nextOpenLabel:''};
      if(todayRange&&minutesNow<todayRange[0]*60)return{online:false,nextOpenLabel:'today at '+formatHour(todayRange[0])};
      for(let i=1;i<=7;i++){
        const nextDay=(day+i)%7,range=HOURS[nextDay];
        if(range){const label=i===1?'tomorrow':DAY_NAMES[nextDay];return{online:false,nextOpenLabel:label+' at '+formatHour(range[0])}}
      }
      return{online:false,nextOpenLabel:'soon'};
    }

    const style=document.createElement('style');
    style.textContent=`
      .setla-chat-toggle{position:fixed;right:18px;bottom:18px;z-index:2000;width:56px;height:56px;border-radius:50%;background:#050505;border:1px solid rgba(255,255,255,.18);color:#fff;display:grid;place-items:center;cursor:pointer;box-shadow:0 14px 40px rgba(0,0,0,.4);transition:box-shadow .3s ease,border-color .3s ease}
      .setla-chat-toggle svg{width:24px;height:24px}
      .setla-chat-toggle.online{border-color:rgba(74,222,128,.55);box-shadow:0 14px 40px rgba(0,0,0,.4),0 0 0 3px rgba(0,117,23,.2),0 0 22px 4px rgba(74,222,128,.4);animation:setlaChatPulse 2.6s ease-in-out infinite}
      @keyframes setlaChatPulse{0%,100%{box-shadow:0 14px 40px rgba(0,0,0,.4),0 0 0 3px rgba(0,117,23,.2),0 0 22px 4px rgba(74,222,128,.4)}50%{box-shadow:0 14px 40px rgba(0,0,0,.4),0 0 0 5px rgba(0,117,23,.14),0 0 30px 8px rgba(74,222,128,.55)}}
      .setla-chat-status{position:fixed;right:14px;bottom:78px;z-index:2000;display:flex;align-items:center;gap:5px;padding:4px 10px;border-radius:999px;background:rgba(5,5,5,.9);border:1px solid rgba(255,255,255,.12);font-size:10px;font-weight:700;letter-spacing:.02em;color:#8fe3ac;pointer-events:none;opacity:0;transform:translateY(4px);transition:opacity .3s ease,transform .3s ease}
      .setla-chat-status.show{opacity:1;transform:none}
      .setla-chat-status span{width:6px;height:6px;border-radius:50%;background:#4ade80;box-shadow:0 0 6px 1px rgba(74,222,128,.8)}
      .setla-chat-panel{position:fixed;right:18px;bottom:86px;z-index:2000;width:min(340px,calc(100vw - 36px));height:min(460px,calc(100vh - 140px));background:#0d100d;border:1px solid #2a2f2a;border-radius:20px;display:none;flex-direction:column;overflow:hidden;box-shadow:0 24px 70px rgba(0,0,0,.5);font-family:'DM Sans',Arial,sans-serif}
      .setla-chat-panel.open{display:flex}
      .setla-chat-head{padding:14px 16px;border-bottom:1px solid #1c1f1c;display:flex;align-items:center;justify-content:space-between}
      .setla-chat-head strong{color:#fff;font-size:13px;display:block}
      .setla-chat-head-status{display:flex;align-items:center;gap:5px;font-size:10.5px;font-weight:700;color:#8fe3ac;margin-top:2px}
      .setla-chat-head-status.offline{color:#9ba29b}
      .setla-chat-head-status span{width:6px;height:6px;border-radius:50%;background:#4ade80}
      .setla-chat-head-status.offline span{background:#5a5f5a}
      .setla-chat-close{background:none;border:0;color:#9ba29b;font-size:20px;cursor:pointer;line-height:1}
      .setla-chat-body{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:8px}
      .setla-chat-msg{max-width:80%;padding:9px 12px;border-radius:14px;background:#171b17;color:#f5f7f4;font-size:12px;line-height:1.5;border:1px solid #26292a}
      .setla-chat-msg.out{margin-left:auto;background:#155522;border-color:#155522;color:#fff}
      .setla-chat-form{padding:12px;border-top:1px solid #1c1f1c;display:flex;gap:8px}
      .setla-chat-form input{flex:1;min-width:0;background:#080a08;border:1px solid #363c36;border-radius:10px;color:#fff;padding:10px 12px;font-size:12px;outline:none}
      .setla-chat-send{background:#007517;color:#fff;border:0;border-radius:10px;padding:0 14px;font-weight:800;cursor:pointer}
      .setla-chat-intro{padding:16px;display:flex;flex-direction:column;gap:10px}
      .setla-chat-intro p{margin:0;color:#c7cbc7;font-size:12px;line-height:1.5}
      .setla-chat-offline-banner{background:rgba(255,255,255,.04);border:1px solid #1c1f1c;border-radius:12px;padding:10px 12px;margin:0 0 2px}
      .setla-chat-offline-banner p{margin:0;color:#c7cbc7;font-size:11.5px;line-height:1.5}
      .setla-chat-offline-banner strong{display:block;color:#fff;font-size:12px;margin-bottom:3px}
      .setla-chat-intro input{background:#080a08;border:1px solid #363c36;border-radius:10px;color:#fff;padding:10px 12px;font-size:12px;outline:none}
      .setla-chat-intro button{background:#007517;color:#fff;border:0;border-radius:10px;padding:11px;font-weight:800;font-size:12px;cursor:pointer}
      @media(max-width:590px){.setla-chat-toggle{right:14px;bottom:14px}.setla-chat-panel{right:10px;bottom:80px}}
    `;
    document.head.appendChild(style);

    const toggle=document.createElement('button');
    toggle.className='setla-chat-toggle';
    toggle.setAttribute('aria-label','Open live chat');
    toggle.innerHTML='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16v11H8l-4 4z"/></svg>';
    document.body.appendChild(toggle);

    const statusPill=document.createElement('div');
    statusPill.className='setla-chat-status';
    statusPill.innerHTML='<span></span>We\'re online';
    document.body.appendChild(statusPill);

    let chatOnline=false;
    function refreshStatus(){
      const status=businessHours();
      chatOnline=status.online;
      toggle.classList.toggle('online',chatOnline);
      statusPill.classList.toggle('show',chatOnline);
      const headStatus=panel.querySelector('.setla-chat-head-status');
      if(headStatus){
        headStatus.classList.toggle('offline',!chatOnline);
        headStatus.innerHTML='<span></span>'+(chatOnline?"We're online":"We're offline");
      }
      return status;
    }

    const panel=document.createElement('div');
    panel.className='setla-chat-panel';
    panel.innerHTML=`
      <div class="setla-chat-head"><div><strong>Chat with us</strong><div class="setla-chat-head-status"><span></span>We're online</div></div><button class="setla-chat-close" type="button" aria-label="Close chat">&times;</button></div>
      <div class="setla-chat-scroll" style="flex:1;overflow:hidden;display:flex;flex-direction:column"></div>
    `;
    document.body.appendChild(panel);
    const scrollArea=panel.querySelector('.setla-chat-scroll');

    refreshStatus();
    setInterval(refreshStatus,60000);

    function renderIntro(){
      const status=refreshStatus();
      const offlineBanner=status.online?'':`
        <div class="setla-chat-offline-banner">
          <strong>Sorry, we're offline right now</strong>
          <p>We'll be available again ${status.nextOpenLabel}. Leave a message below and we'll get back to you as soon as we're available.</p>
        </div>`;
      scrollArea.innerHTML=`
        <div class="setla-chat-intro">
          ${offlineBanner}
          <p>Tell us a little about yourself so we can help you out.</p>
          <input type="text" id="setlaChatName" placeholder="Your name" autocomplete="name">
          <input type="email" id="setlaChatEmail" placeholder="Email address" autocomplete="email">
          <button type="button" id="setlaChatStart">${status.online?'Start chat':'Leave a message'}</button>
        </div>`;
      scrollArea.querySelector('#setlaChatStart').addEventListener('click',()=>{
        const name=scrollArea.querySelector('#setlaChatName').value.trim();
        const email=scrollArea.querySelector('#setlaChatEmail').value.trim();
        if(!name||!email)return;
        try{localStorage.setItem(IDENTITY_KEY,JSON.stringify({name,email}))}catch(_){}
        renderThread();
      });
    }

    function renderThread(){
      scrollArea.innerHTML=`
        <div class="setla-chat-body" id="setlaChatBody"></div>
        <form class="setla-chat-form" id="setlaChatForm">
          <input type="text" id="setlaChatInput" placeholder="Write a message" autocomplete="off">
          <button class="setla-chat-send" type="submit">Send</button>
        </form>`;
      const body=scrollArea.querySelector('#setlaChatBody');
      const form=scrollArea.querySelector('#setlaChatForm');
      const input=scrollArea.querySelector('#setlaChatInput');

      function paint(messages){
        body.innerHTML=messages.map(m=>`<div class="setla-chat-msg${m.sender==='visitor'?'':' out'}">${escapeHTML(m.body)}</div>`).join('');
        body.scrollTop=body.scrollHeight;
      }

      async function poll(){
        let conversationId=null;
        try{conversationId=localStorage.getItem(CONVERSATION_KEY)}catch(_){}
        if(!conversationId)return;
        try{
          const res=await fetch(`/api/support/messages?conversationId=${encodeURIComponent(conversationId)}&visitorId=${encodeURIComponent(visitorId())}`);
          const data=await res.json();
          if(data.messages)paint(data.messages);
        }catch(_){}
      }

      form.addEventListener('submit',async event=>{
        event.preventDefault();
        const text=input.value.trim();
        if(!text)return;
        input.value='';
        const id=identity()||{};
        let conversationId=null;
        try{conversationId=localStorage.getItem(CONVERSATION_KEY)}catch(_){}
        try{
          const seller=await resolveSeller();
          const res=await fetch('/api/support/message',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({
            visitorId:visitorId(),conversationId:conversationId||undefined,message:text,
            name:id.name,email:id.email,category:'setla',storefrontSellerId:seller,
          })});
          const data=await res.json();
          if(data.conversationId){try{localStorage.setItem(CONVERSATION_KEY,data.conversationId)}catch(_){}}
        }catch(_){}
        poll();
      });

      poll();
      clearInterval(pollTimer);
      pollTimer=setInterval(poll,5000);
    }

    toggle.addEventListener('click',()=>{
      panel.classList.add('open');
      if(identity())renderThread();else renderIntro();
    });
    panel.querySelector('.setla-chat-close').addEventListener('click',()=>{
      panel.classList.remove('open');
      clearInterval(pollTimer);
    });
  })();

  document.getElementById('editProfile')?.addEventListener('click',()=>setlaToast('Profile editing will open after secure identity confirmation.'));

  function splitAmount(total,count){const cents=Math.round(Number(total)*100),base=Math.floor(cents/count),parts=Array(count).fill(base);for(let index=0;index<cents-base*count;index++)parts[index]++;return parts.map(value=>value/100)}
  function dateAfter(days){const date=new Date();date.setDate(date.getDate()+days);return date.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}
  function selectedPlan(){return document.querySelector('input[name="plan"]:checked')?.value||'limit'}
  // Real handoff written by the "Pay with SETLA" button on the actual UNIK
  // storefront checkout (public/private-templates/unik-labs/checkout.html)
  // -- same origin (SETLA's static pages bypass the platform's subdomain
  // rewrite, same as that checkout page does), so a plain localStorage
  // write/read works across the navigation. A stale abandoned handoff
  // (older than a day) is treated as if there's no order at all.
  function checkoutDraft(){
    try{
      const raw=JSON.parse(localStorage.getItem('unik-setla-handoff-v1')||'null');
      if(!raw||!raw.ts||Date.now()-raw.ts>24*60*60*1000)return null;
      return raw;
    }catch{return null}
  }
  // Cart items are deliberately NOT part of the handoff above (a
  // not-yet-saved custom upload can carry a multi-megabyte base64 image
  // directly on the item, and duplicating the whole cart into a second
  // localStorage key was blowing past the browser's storage quota) --
  // read straight from the same cart key store.js itself writes to
  // (CART_KEY = 'unik-labs-cart-v1'), same origin, no duplication needed.
  function unikCartItems(){try{return JSON.parse(localStorage.getItem('unik-labs-cart-v1')||'[]')}catch{return []}}
  // Pay Later = "Pay in 4" (4 instalments, 14 days apart, 6 weeks total),
  // Laybuy = "Pay half / half" (2 instalments, 30 days apart) -- matches
  // both lib/setla-instalments.ts (the real server-side charge) and every
  // customer-facing plan description elsewhere in the product.
  function renderSchedule(total,plan){
    const schedule=document.getElementById('paymentSchedule');if(!schedule)return [];
    const count=plan==='laybuy'?2:4,interval=plan==='laybuy'?30:14,parts=splitAmount(total,count);
    const rows=parts.map((amount,index)=>({number:index+1,amount,date:index===0?'Today':dateAfter(index*interval),status:index===0?'Due now':'Scheduled'}));
    schedule.innerHTML=rows.map(row=>`<div class="schedule-row"><i>${row.number}</i><span><small>${row.status}</small><strong>${row.date}</strong></span><b>${money(row.amount)}</b></div>`).join('');
    document.getElementById('scheduleTotal').textContent=money(total);
    document.getElementById('scheduleNote').textContent=plan==='laybuy'?'UNIK Labs production remains locked until both Laybuy instalments are complete. Once fully paid, your order moves into production automatically.':'Your first instalment is due today. The remaining three payments follow every 14 days and can be managed from your dashboard.';
    return rows;
  }
  function itemTitle(item){return item?.name||item?.title||item?.productName||item?.options?.name||`${item?.options?.garment||'Custom'} ${item?.options?.type||'garment'}`}
  function itemImage(item){const value=item?.preview||item?.image||item?.options?.preview;return typeof value==='string'&&value?value:''}
  function initCheckout(){
    const draft=checkoutDraft(),account=currentAccount(),container=document.getElementById('checkoutItems');if(!container)return;
    const cartItems=unikCartItems();
    if(!draft||!cartItems.length){document.querySelector('.checkout-layout').innerHTML='<section class="card empty-state"><div class="eligibility-icon"><svg viewBox="0 0 24 24"><path d="M6 8h12l1 12H5L6 8Z"/></svg></div><h2>No UNIK order found.</h2><p>Return to UNIK Labs, add your personalised garment to cart and choose SETLA at checkout.</p><a class="button primary" href="/private-templates/unik-labs/checkout.html">Return to UNIK checkout</a></section>';return}
    // The handoff only carries form fields (no cart items, no precomputed
    // totals) -- this is purely a display estimate; the real total is
    // always recomputed server-side from scratch at submit time
    // (lib/unik-cart-resolve.ts), same trust model as the UNIK checkout
    // this order came from.
    const subtotal=cartItems.reduce((sum,item)=>sum+Number(item.price||0)*Number(item.qty||1),0);
    const delivery=Number(draft.deliveryMethod?.price||0);
    const total=subtotal+delivery;
    container.innerHTML=cartItems.map(item=>{const image=itemImage(item);return `<article class="checkout-item">${image?`<img src="${escapeHTML(image)}" alt="${escapeHTML(itemTitle(item))}">`:'<div class="item-placeholder"><svg viewBox="0 0 64 64"><path d="M20 13 9 20l6 12 7-4v25h20V28l7 4 6-12-11-7-6 5H26Z"/></svg></div>'}<span><strong>${escapeHTML(itemTitle(item))}</strong><small>Quantity ${Number(item.qty||1)}${item?.options?.size?` · ${escapeHTML(item.options.size)}`:''}</small></span><b>${money(Number(item.price||0)*Number(item.qty||1))}</b></article>`}).join('');
    document.getElementById('summarySubtotal').textContent=money(subtotal);document.getElementById('summaryDelivery').textContent=money(delivery);document.getElementById('orderTotal').textContent=money(total);
    const customerInfo=draft.customer||{},method=draft.deliveryMethod||{};document.getElementById('deliverySummary').innerHTML=`<strong>${escapeHTML(method.name||'Delivery')}</strong><br>${method.isPickup?'Collection details will be confirmed by UNIK Labs.':escapeHTML([customerInfo.streetAddress,customerInfo.suburb,customerInfo.townCity,customerInfo.province,customerInfo.postal].filter(Boolean).join(', '))}`;
    const payLater=document.getElementById('payLaterChoice'),title=document.getElementById('eligibilityTitle'),copy=document.getElementById('eligibilityCopy'),hint=document.getElementById('limitHint'),action=document.getElementById('eligibilityAction'),card=document.getElementById('eligibilityCard');
    // Checkout can silently run against whichever SETLA session already
    // exists in the browser (e.g. left over from earlier testing) --
    // eligibility/limit math is already correctly tied to that real
    // account (see below), but nothing on the page ever SHOWED which one,
    // so a stale session could drive the calculation without anyone
    // noticing. Making the identity explicit, with an easy way out,
    // fixes that without forcing a fresh login on every legitimate
    // returning customer.
    const accountLine=document.getElementById('checkoutAccountLine');
    if(accountLine){
      const accountName=[account.firstName,account.lastName].filter(Boolean).join(' ')||account.email;
      accountLine.innerHTML=`Checking out as <strong>${escapeHTML(accountName)}</strong> (${escapeHTML(account.email||'')}) &middot; <a href="#" id="switchAccountLink">Not you? Log out</a>`;
      accountLine.hidden=false;
      document.getElementById('switchAccountLink')?.addEventListener('click',async(event)=>{
        event.preventDefault();
        await fetch('/api/setla/auth/session',{method:'DELETE',credentials:'include'}).catch(()=>{});
        clearRefreshToken();
        location.href='login.html?next=checkout.html';
      });
    }
    const status=account.applicationStatus||'not_applied',available=Number(account.availableLimit||0);let allowed=status==='approved'&&available>=total;
    if(status==='approved'){title.textContent=allowed?'Pay Later is available for this order.':'This order is above your available limit.';copy.textContent=`Available now: ${money(available)} · Order total: ${money(total)}`;hint.textContent=`${money(available)} available`;action.href='dashboard.html';action.textContent='View limit';if(!allowed)card.classList.add('needs-action')}
    else if(status==='pending'){title.textContent='Your Pay Later application is in review.';copy.textContent='SETLA Laybuy remains available while you wait for your decision.';action.href='dashboard.html';action.textContent='View status';card.classList.add('pending-state')}
    else{title.textContent='Apply to unlock a SETLA spending limit.';copy.textContent='You can apply now or continue with SETLA Laybuy without using credit.';action.href='apply.html';action.textContent='Apply now';card.classList.add('needs-action')}
    if(!allowed){payLater.classList.add('disabled');payLater.querySelector('input').disabled=true;document.querySelector('input[value="laybuy"]').checked=true;document.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',choice.querySelector('input')?.checked))}
    const requested=new URLSearchParams(location.search).get('plan');if(requested==='laybuy')document.querySelector('input[value="laybuy"]').click();
    renderSchedule(total,selectedPlan());
    document.querySelectorAll('input[name="plan"]').forEach(input=>input.addEventListener('change',()=>renderSchedule(total,input.value)));
    document.getElementById('confirmSETLA').addEventListener('click',async()=>{
      const btn=document.getElementById('confirmSETLA');
      const error=document.getElementById('checkoutError');error.classList.remove('show');
      const rawPlan=selectedPlan(),plan=rawPlan==='laybuy'?'laybuy':'pay_later';
      if(!document.getElementById('checkoutTerms').checked){error.textContent='Review the schedule and accept the SETLA terms before continuing.';error.classList.add('show');return}
      if(plan==='pay_later'&&!allowed){error.textContent='Pay Later is not available for this order. Select SETLA Laybuy to continue.';error.classList.add('show');return}
      btn.disabled=true;btn.textContent='Starting secure payment…';
      try{
        const res=await fetch('/api/setla/checkout/create',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({
          plan,
          items:cartItems.map(item=>item.options?.customUpload?{customUpload:item.options.customUpload,qty:item.qty||1,preview:item.preview}:{designId:item.options?.designId,qty:item.qty||1}),
          customer:draft.customer,
          notes:draft.notes,
          deliveryMethod:draft.deliveryMethod,
          discountCode:draft.discountCode,
          returnOrigin:location.origin,
        })});
        const payload=await res.json().catch(()=>({}));
        if(!res.ok){error.textContent=payload.error||'Could not start payment. Please try again.';error.classList.add('show');btn.disabled=false;btn.textContent='Confirm SETLA plan';return}
        localStorage.removeItem('unik-setla-handoff-v1');localStorage.removeItem('unik-labs-cart-v1');
        location.href=payload.redirectUrl;
      }catch(_){
        error.textContent='Something went wrong. Please try again.';error.classList.add('show');btn.disabled=false;btn.textContent='Confirm SETLA plan';
      }
    });
  }
  if(protectedPage==='checkout')initCheckout();
  if(protectedPage==='confirmed'){
    (async()=>{
      const params=new URLSearchParams(location.search),orderId=params.get('orderId');
      if(params.has('cancelled')||params.has('failed')){
        document.getElementById('confirmationTitle').textContent=params.has('cancelled')?'Payment cancelled.':'Payment could not be completed.';
        document.getElementById('confirmationCopy').textContent='Your order was created but the first payment did not go through. You can retry it from your dashboard.';
        document.getElementById('confirmationNext').innerHTML='<strong>Next step</strong><br>Open your dashboard to retry the payment.';
        document.getElementById('confirmationDashboard').href='dashboard.html#plans';
        return;
      }
      if(!orderId){location.href='dashboard.html';return}
      const res=await fetch(`/api/setla/orders/${encodeURIComponent(orderId)}`,{credentials:'include',cache:'no-store'}).catch(()=>null);
      const payload=res&&res.ok?await res.json().catch(()=>null):null;
      const order=payload?.order;
      if(!order){location.href='dashboard.html';return}
      document.getElementById('confirmationId').textContent=order.id;document.getElementById('confirmationMethod').textContent=order.method;document.getElementById('confirmationTotal').textContent=money(order.total);
      document.getElementById('confirmationTitle').textContent=order.methodCode==='laybuy'?'Your Laybuy order is reserved.':'Your Pay Later plan is ready.';
      document.getElementById('confirmationCopy').textContent=order.methodCode==='laybuy'?'Complete the payment schedule from your dashboard. Production unlocks automatically when the balance is fully paid.':'Your order, payment schedule and UNIK Labs production journey are now connected to your SETLA dashboard.';
      document.getElementById('confirmationNext').innerHTML=`<strong>Next step</strong><br>${order.methodCode==='laybuy'?'Pay the next Laybuy instalment to keep your payment journey moving.':'Your order is already in the UNIK Labs production queue -- manage the rest of your schedule from your dashboard.'}`;
      document.getElementById('confirmationDashboard').href=`dashboard.html#${order.methodCode==='laybuy'?'laybuy':'plans'}`;
    })();
  }
})();
