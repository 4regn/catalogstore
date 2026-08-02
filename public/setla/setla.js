(function(){
  const KEYS={accounts:'setla-accounts-v1',session:'setla-session-v1',profile:'setla-customer-v1',orders:'setla-orders-v1',draft:'unik-setla-checkout-draft-v1'};
  const read=(key,fallback=null)=>{try{return JSON.parse(localStorage.getItem(key)||'null')??fallback}catch{return fallback}};
  const write=(key,value)=>localStorage.setItem(key,JSON.stringify(value));
  const safeNext=()=>{const value=new URLSearchParams(location.search).get('next')||'';return /^[a-z0-9-]+\.html(?:[?#].*)?$/i.test(value)?value:''};
  const money=value=>`R${Number(value||0).toLocaleString('en-ZA',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
  async function passwordHash(email,password){
    const input=new TextEncoder().encode(`${String(email).trim().toLowerCase()}:${password}`);
    if(window.crypto?.subtle){const digest=await window.crypto.subtle.digest('SHA-256',input);return [...new Uint8Array(digest)].map(byte=>byte.toString(16).padStart(2,'0')).join('')}
    return btoa(unescape(encodeURIComponent(`${email}:${password}`)));
  }
  function session(){const current=read(KEYS.session);if(!current||Date.now()>Number(current.expiresAt||0)){localStorage.removeItem(KEYS.session);return null}return current}
  function currentAccount(){const active=session();if(!active)return null;return (read(KEYS.accounts,[])||[]).find(account=>account.id===active.accountId)||null}
  function saveAccount(next){const accounts=read(KEYS.accounts,[])||[];const index=accounts.findIndex(account=>account.id===next.id);if(index>=0)accounts[index]=next;else accounts.push(next);write(KEYS.accounts,accounts);return next}
  function beginSession(account,remember=false){write(KEYS.session,{accountId:account.id,createdAt:Date.now(),expiresAt:Date.now()+(remember?30:1)*24*60*60*1000})}
  function requireAccount(next=location.pathname.split('/').pop()+location.search){if(currentAccount())return true;location.href=`login.html?next=${encodeURIComponent(next)}`;return false}
  document.querySelectorAll('[data-copy-next]').forEach(link=>{const next=safeNext();if(next)link.href=`${link.getAttribute('href')}?next=${encodeURIComponent(next)}`});
  const authError=document.getElementById('authError');
  const showAuthError=message=>{if(!authError)return;authError.textContent=message;authError.classList.add('show')};
  document.getElementById('signupForm')?.addEventListener('submit',async event=>{
    event.preventDefault();authError?.classList.remove('show');const data=new FormData(event.currentTarget);const email=String(data.get('email')).trim().toLowerCase();
    if(data.get('password')!==data.get('confirmPassword')){showAuthError('Your passwords do not match.');return}
    if((read(KEYS.accounts,[])||[]).some(account=>account.email===email)){showAuthError('An account already exists for this email. Log in instead.');return}
    const account=saveAccount({id:`ST-${Date.now().toString(36).toUpperCase()}`,firstName:String(data.get('firstName')).trim(),lastName:String(data.get('lastName')).trim(),name:`${data.get('firstName')} ${data.get('lastName')}`.trim(),email,phone:String(data.get('phone')).trim(),passwordHash:await passwordHash(email,data.get('password')),applicationStatus:'not_applied',approvedLimit:0,availableLimit:0,createdAt:new Date().toISOString()});
    beginSession(account,true);location.href=safeNext()||'apply.html';
  });
  document.getElementById('loginForm')?.addEventListener('submit',async event=>{
    event.preventDefault();authError?.classList.remove('show');const data=new FormData(event.currentTarget);const email=String(data.get('email')).trim().toLowerCase();const account=(read(KEYS.accounts,[])||[]).find(item=>item.email===email);
    if(!account||account.passwordHash!==await passwordHash(email,data.get('password'))){showAuthError('The email or password is incorrect. Please try again.');return}
    beginSession(account,!!data.get('remember'));location.href=safeNext()||'dashboard.html';
  });
  document.getElementById('forgotForm')?.addEventListener('submit',event=>{event.preventDefault();event.currentTarget.innerHTML='<div class="confirmation-mark small-mark"><svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg></div><div class="eyebrow">Request received</div><h1>Check your email.</h1><p>If that address is linked to a SETLA account, secure recovery instructions will be sent. For this local preview, no email is sent.</p><a class="button primary auth-submit" href="login.html">Return to login</a>'});
  document.getElementById('logoutButton')?.addEventListener('click',()=>{localStorage.removeItem(KEYS.session);location.href='login.html'});
  const protectedPage=document.body.dataset.page;
  if(['dashboard','checkout','confirmed'].includes(protectedPage)&&!currentAccount()){requireAccount();return}
  if(document.getElementById('applicationForm')&&!currentAccount()){requireAccount('apply.html');return}
  const toast=document.querySelector('.toast');
  window.setlaToast=(message)=>{if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3200)};
  document.querySelectorAll('.choice input').forEach(input=>input.addEventListener('change',()=>document.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',Boolean(choice.querySelector('input')?.checked)))));
  const form=document.getElementById('applicationForm');
  const video=document.getElementById('identityVideo');
  const frame=document.getElementById('cameraFrame');
  const status=document.getElementById('verificationStatus');
  const start=document.getElementById('startIdentityCamera');
  const capture=document.getElementById('captureIdentity');
  const canvas=document.getElementById('identityCanvas');
  const fallback=document.getElementById('selfieFallback');
  let stream=null,captured=false;
  async function startCamera(){
    try{stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});video.srcObject=stream;await video.play();frame.classList.add('ready');capture.disabled=false;status.textContent='Camera ready'}
    catch(error){status.textContent='Upload selfie';setlaToast('Camera access was unavailable. Please upload a recent selfie instead.')}
  }
  function captureSelfie(){canvas.width=video.videoWidth;canvas.height=video.videoHeight;canvas.getContext('2d').drawImage(video,0,0);captured=true;status.textContent='Selfie captured';frame.classList.add('captured');stream?.getTracks().forEach(track=>track.stop());capture.disabled=true;start.textContent='Retake selfie'}
  start?.addEventListener('click',()=>{captured=false;frame?.classList.remove('captured');startCamera()});
  capture?.addEventListener('click',captureSelfie);
  fallback?.addEventListener('change',()=>{if(fallback.files.length){captured=true;status.textContent='Selfie selected'}});
  const applicationAccount=currentAccount();
  if(form&&applicationAccount){const parts={firstName:applicationAccount.firstName,lastName:applicationAccount.lastName,email:applicationAccount.email,phone:applicationAccount.phone};Object.entries(parts).forEach(([name,value])=>{const input=form.elements[name];if(input&&value)input.value=value})}
  form?.addEventListener('submit',event=>{event.preventDefault();if(!captured){setlaToast('Complete the live identity check or upload a recent selfie.');return}const data=new FormData(form);const account=currentAccount();if(!account)return;const updated=saveAccount({...account,firstName:String(data.get('firstName')).trim(),lastName:String(data.get('lastName')).trim(),name:`${data.get('firstName')} ${data.get('lastName')}`.trim(),email:String(data.get('email')).trim().toLowerCase(),phone:String(data.get('phone')).trim(),applicationStatus:'pending',application:{submittedAt:new Date().toISOString(),city:data.get('city'),province:data.get('province'),income:Number(data.get('income')||0),expenses:Number(data.get('expenses')||0),bank:data.get('bank'),accountLast4:String(data.get('accountNumber')||'').slice(-4)}});write(KEYS.profile,{name:updated.name,email:updated.email,status:'pending',appliedAt:updated.application.submittedAt});stream?.getTracks().forEach(track=>track.stop());location.href='dashboard.html?submitted=1'});
  const profile=currentAccount()||read(KEYS.profile);
  const emptyView=(eyebrow,title,copy)=>`<div class="view-head"><div><div class="eyebrow">${eyebrow}</div><h1>${title}</h1><p>${copy}</p></div></div><section class="card empty-state"><h2>Nothing here yet</h2><p>Your own SETLA activity will appear here automatically.</p></section>`;
  const orderStatus=order=>order.methodCode==='laybuy'?'Paying':'Confirmed';
  const scheduleCard=order=>`<article class="card plan-card"><div class="plan-top"><div><small>UNIK Labs · ${escapeHTML(order.id)}</small><h2>${escapeHTML(itemTitle(order.items?.[0]||{}))}</h2></div><span class="status-badge ${order.methodCode==='laybuy'?'pending':'good'}">${orderStatus(order)}</span></div><div class="plan-numbers"><div><small>Order total</small><strong>${money(order.total)}</strong></div><div><small>Payment route</small><strong>${escapeHTML(order.method)}</strong></div><div><small>Status</small><strong>${order.methodCode==='laybuy'?'Production locked':'First payment due'}</strong></div></div><div class="instalments">${(order.schedule||[]).map((row,index)=>`<div class="${index===0?'next':''}"><i>${index+1}</i><span><strong>${index===0?'Due now':'Scheduled'}</strong><small>${escapeHTML(row.date)}</small></span><b>${money(row.amount)}</b></div>`).join('')}</div></article>`;
  function renderDashboard(account){
    const status=account.applicationStatus||account.status||'not_applied',approved=status==='approved',pending=status==='pending';
    const approvedLimit=approved?Number(account.approvedLimit||0):0,available=approved?Number(account.availableLimit??approvedLimit):0;
    const orders=(read(KEYS.orders,[])||[]).filter(order=>order.accountId===account.id).sort((a,b)=>new Date(b.createdAt)-new Date(a.createdAt));
    const payLater=orders.filter(order=>order.methodCode!=='laybuy'),laybuy=orders.filter(order=>order.methodCode==='laybuy'),latest=orders[0];
    const firstName=account.firstName||account.name?.split(' ')[0]||'there',fullName=account.name||[account.firstName,account.lastName].filter(Boolean).join(' ')||'Customer';
    document.getElementById('welcomeName').textContent=`Welcome, ${firstName}.`;document.getElementById('welcomeEmail').textContent=account.email||'';
    document.getElementById('accountStatus').innerHTML=`<span></span>${approved?'Active account':pending?'Application in review':'Application required'}`;
    document.getElementById('availableLimit').textContent=money(available);document.getElementById('limitProgress').style.width=`${approvedLimit?Math.max(0,Math.min(100,(approvedLimit-available)/approvedLimit*100)):0}%`;
    document.getElementById('limitCaption').textContent=approved?`${money(approvedLimit-available)} used of your ${money(approvedLimit)} approved limit`:pending?'Your personal limit will appear after review.':'Complete your application to discover your personal limit.';
    document.getElementById('accountState').innerHTML=approved?'':`<section class="card account-state-card"><div><div class="card-kicker">${pending?'Application received':'Next step'}</div><h2>${pending?'We are reviewing your application.':'Complete your SETLA application.'}</h2><p>${pending?'We will email you when a decision and personal limit are ready. SETLA Laybuy remains available at checkout.':'Submit your identity, affordability and banking information to be considered for Pay Later.'}</p></div><a class="button ${pending?'outline':'primary'}" href="${pending?'#support':'apply.html'}" ${pending?'data-view="support"':''}>${pending?'Speak to support':'Start application'}</a></section>`;
    const next=(latest?.schedule||[])[0];document.getElementById('nextPaymentCard').innerHTML=next?`<div class="card-kicker">Coming up</div><h2>Next payment</h2><div class="due-amount">${money(next.amount)}</div><p>${escapeHTML(next.date)} · Order ${escapeHTML(latest.id)}</p><button class="button primary" data-view="${latest.methodCode==='laybuy'?'laybuy':'plans'}">Manage payment plan</button>`:`<div class="card-kicker">Coming up</div><h2>No payment due</h2><p>Your next confirmed payment will appear here.</p>`;
    document.getElementById('latestOrderCard').innerHTML=latest?`<div class="section-heading"><div><div class="card-kicker">Latest purchase</div><h2>Order ${escapeHTML(latest.id)}</h2></div><span class="status-badge ${latest.methodCode==='laybuy'?'pending':'good'}">${orderStatus(latest)}</span></div><div class="order-preview"><div class="product-thumb"><svg viewBox="0 0 64 64"><path d="M20 13 9 20l6 12 7-4v25h20V28l7 4 6-12-11-7-6 5H26Z"/></svg></div><div><strong>${escapeHTML(itemTitle(latest.items?.[0]||{}))}</strong><p>${Number(latest.items?.length||0)} item${latest.items?.length===1?'':'s'}</p></div><div class="order-price"><small>Order total</small><strong>${money(latest.total)}</strong></div></div><button class="text-action" data-view="track">Track this order</button>`:`<div class="card-kicker">Latest purchase</div><h2>No orders yet</h2><p>Your first UNIK Labs order paid with SETLA will appear here.</p>`;
    document.getElementById('notificationPreview').innerHTML=pending?`<div class="notice-icon"></div><div><small>Application update</small><strong>Your application is being reviewed</strong><p>We will notify ${escapeHTML(account.email||'you')} when a decision is ready.</p></div><button class="text-action" data-view="notifications">View all</button>`:`<div class="notice-icon"></div><div><small>SETLA updates</small><strong>${latest?'Your order is connected':'No new notifications'}</strong><p>${latest?`Order ${escapeHTML(latest.id)} is now visible in your dashboard.`:'Account, payment and order updates will appear here.'}</p></div>`;
    document.getElementById('view-plans').innerHTML=payLater.length?`<div class="view-head"><div><div class="eyebrow">Payments</div><h1>Active plans.</h1><p>Your SETLA Pay Later schedules.</p></div><span class="account-pill">${payLater.length} active</span></div>${payLater.map(scheduleCard).join('')}`:emptyView('Payments','Active plans.','Your Pay Later schedules will appear after an eligible checkout.');
    document.getElementById('view-laybuy').innerHTML=laybuy.length?`<div class="view-head"><div><div class="eyebrow">SETLA Laybuy</div><h1>Pay first.<br>We create next.</h1><p>Complete your schedule to unlock production.</p></div></div>${laybuy.map(scheduleCard).join('')}`:emptyView('SETLA Laybuy','Pay first. We create next.','Your Laybuy orders will appear here.');
    document.getElementById('view-history').innerHTML=orders.length?`<div class="view-head"><div><div class="eyebrow">Purchases</div><h1>Order history.</h1><p>Every SETLA order connected to your account.</p></div></div><section class="card history-card"><div class="history-table"><div class="history-row history-head"><span>Order</span><span>Date</span><span>Total</span><span>Status</span><span></span></div>${orders.map(order=>`<div class="history-row"><span><strong>${escapeHTML(order.id)}</strong><small>${escapeHTML(itemTitle(order.items?.[0]||{}))}</small></span><span>${new Date(order.createdAt).toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}</span><span>${money(order.total)}</span><span><b class="status-badge ${order.methodCode==='laybuy'?'pending':'good'}">${orderStatus(order)}</b></span><span><button data-view="${order.methodCode==='laybuy'?'laybuy':'plans'}">View</button></span></div>`).join('')}</div></section>`:emptyView('Purchases','Order history.','Your completed and active orders will appear here.');
    document.getElementById('view-track').innerHTML=latest?`<div class="view-head"><div><div class="eyebrow">Order tracking</div><h1>Made for you.</h1><p>Follow your latest personalised order.</p></div><span class="status-badge ${latest.methodCode==='laybuy'?'pending':'good'}">${latest.methodCode==='laybuy'?'Awaiting full payment':'Confirmed'}</span></div><section class="card tracking-card"><div class="track-order-head"><div><small>Order ${escapeHTML(latest.id)}</small><h2>${escapeHTML(itemTitle(latest.items?.[0]||{}))}</h2></div></div><div class="track-line"><div class="track-step done"><i>1</i><div><strong>Order received</strong><p>Your SETLA order has been recorded.</p></div></div><div class="track-step current"><i>2</i><div><strong>${latest.methodCode==='laybuy'?'Complete payment schedule':'Complete first payment'}</strong><p>${latest.methodCode==='laybuy'?'Production unlocks after full payment.':'Production begins after payment confirmation.'}</p></div></div><div class="track-step"><i>3</i><div><strong>UNIK Labs production</strong><p>Your personalised garment is created and quality checked.</p></div></div><div class="track-step"><i>4</i><div><strong>Delivery</strong><p>Courier details appear when the order is dispatched.</p></div></div></div></section>`:emptyView('Order tracking','Made for you.','Your latest order journey will appear here.');
    document.getElementById('view-notifications').innerHTML=`<div class="view-head"><div><div class="eyebrow">Updates</div><h1>Notifications.</h1><p>Account, payment and order updates from SETLA and UNIK Labs.</p></div></div>${pending?'<article class="card notification unread"><div><strong>Application received</strong><p>Your SETLA application is being reviewed. We will email you when a decision is ready.</p></div></article>':latest?`<article class="card notification unread"><div><strong>Order connected</strong><p>Order ${escapeHTML(latest.id)} is now available in your SETLA dashboard.</p></div></article>`:'<section class="card empty-state"><h2>No notifications</h2><p>Your account updates will appear here.</p></section>'}`;
    const initials=fullName.split(/\s+/).filter(Boolean).slice(0,2).map(part=>part[0]).join('').toUpperCase();document.getElementById('profileInitials').textContent=initials||'—';document.getElementById('profileName').textContent=fullName;document.getElementById('profileContact').textContent=[account.email,account.phone].filter(Boolean).join(' · ');document.getElementById('profileLimit').textContent=money(approvedLimit);document.getElementById('profileMemberSince').textContent=new Date(account.createdAt||Date.now()).toLocaleDateString('en-ZA',{month:'long',year:'numeric'});document.getElementById('profilePaymentStatus').textContent=orders.length?'Plan active':'No active plan';document.getElementById('detailName').textContent=fullName;document.getElementById('detailEmail').textContent=account.email||'—';document.getElementById('detailPhone').textContent=account.phone||'—';document.getElementById('detailAddress').textContent=account.address||'Not supplied';document.getElementById('profileBadge').textContent=approved?'Verified customer':pending?'Verification in review':'Application required';document.getElementById('identityStatus').textContent=approved?'Identity verified':pending?'Verification in review':'Verification required';
    const bank=account.application?.bank,last4=account.application?.accountLast4;document.getElementById('bankType').textContent=bank?`${bank} · Verification ${approved?'approved':'pending'}`:'No verified bank account';document.getElementById('bankAccount').textContent=bank&&last4?`${fullName} · •••• ${last4}`:'Add your banking details during your application.';document.getElementById('bankStatus').textContent=bank?(approved?'Approved':'Under review'):'Not verified';
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
  document.getElementById('appeal')?.addEventListener('click',event=>{event.preventDefault();setlaToast('Appeals become available after an application decision.')});
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

  document.getElementById('chatForm')?.addEventListener('submit',event=>{
    event.preventDefault();
    const input=document.getElementById('chatInput');
    const message=input?.value.trim();
    if(!message)return;
    const bubble=document.createElement('div');
    bubble.className='message customer';
    bubble.innerHTML=`${message.replace(/[&<>]/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[char]))}<small>Now</small>`;
    document.getElementById('chatMessages')?.appendChild(bubble);
    input.value='';
    bubble.scrollIntoView({behavior:'smooth',block:'nearest'});
    setTimeout(()=>setlaToast('Message sent to SETLA Support.'),150);
  });

  document.getElementById('editProfile')?.addEventListener('click',()=>setlaToast('Profile editing will open after secure identity confirmation.'));

  function splitAmount(total,count){const cents=Math.round(Number(total)*100),base=Math.floor(cents/count),parts=Array(count).fill(base);for(let index=0;index<cents-base*count;index++)parts[index]++;return parts.map(value=>value/100)}
  function dateAfter(days){const date=new Date();date.setDate(date.getDate()+days);return date.toLocaleDateString('en-ZA',{day:'numeric',month:'short',year:'numeric'})}
  function selectedPlan(){return document.querySelector('input[name="plan"]:checked')?.value||'limit'}
  function checkoutDraft(){try{return JSON.parse(sessionStorage.getItem(KEYS.draft)||'null')}catch{return null}}
  function renderSchedule(total,plan){
    const schedule=document.getElementById('paymentSchedule');if(!schedule)return [];
    const count=plan==='laybuy'?4:3,interval=plan==='laybuy'?7:14,parts=splitAmount(total,count);
    const rows=parts.map((amount,index)=>({number:index+1,amount,date:index===0?'Today':dateAfter(index*interval),status:index===0?'Due now':'Scheduled'}));
    schedule.innerHTML=rows.map(row=>`<div class="schedule-row"><i>${row.number}</i><span><small>${row.status}</small><strong>${row.date}</strong></span><b>${money(row.amount)}</b></div>`).join('');
    document.getElementById('scheduleTotal').textContent=money(total);
    document.getElementById('scheduleNote').textContent=plan==='laybuy'?'UNIK Labs production remains locked until all four Laybuy instalments are complete. Once fully paid, your order moves into production automatically.':'Your first instalment is due today. The remaining two payments follow every 14 days and can be managed from your dashboard.';
    return rows;
  }
  function itemTitle(item){return item?.name||item?.title||item?.productName||item?.options?.name||`${item?.options?.garment||'Custom'} ${item?.options?.type||'garment'}`}
  function itemImage(item){const value=item?.preview||item?.image||item?.options?.preview;return typeof value==='string'&&value?value:''}
  function initCheckout(){
    const draft=checkoutDraft(),account=currentAccount(),container=document.getElementById('checkoutItems');if(!container)return;
    if(!draft?.items?.length){document.querySelector('.checkout-layout').innerHTML='<section class="card empty-state"><div class="eligibility-icon"><svg viewBox="0 0 24 24"><path d="M6 8h12l1 12H5L6 8Z"/></svg></div><h2>No UNIK order found.</h2><p>Return to UNIK Labs, add your personalised garment to cart and choose SETLA at checkout.</p><a class="button primary" href="/private-templates/unik-labs/checkout.html">Return to UNIK checkout</a></section>';return}
    const total=Number(draft.total||0),subtotal=Number(draft.subtotal||0),delivery=Number(draft.delivery||0);
    container.innerHTML=draft.items.map(item=>{const image=itemImage(item);return `<article class="checkout-item">${image?`<img src="${escapeHTML(image)}" alt="${escapeHTML(itemTitle(item))}">`:'<div class="item-placeholder"><svg viewBox="0 0 64 64"><path d="M20 13 9 20l6 12 7-4v25h20V28l7 4 6-12-11-7-6 5H26Z"/></svg></div>'}<span><strong>${escapeHTML(itemTitle(item))}</strong><small>Quantity ${Number(item.qty||1)}${item?.options?.size?` · ${escapeHTML(item.options.size)}`:''}</small></span><b>${money(Number(item.price||0)*Number(item.qty||1))}</b></article>`}).join('');
    document.getElementById('summarySubtotal').textContent=money(subtotal);document.getElementById('summaryDelivery').textContent=money(delivery);document.getElementById('orderTotal').textContent=money(total);
    const address=draft.address||{},method=draft.deliveryMethod||{};document.getElementById('deliverySummary').innerHTML=`<strong>${escapeHTML(method.name||'Delivery')}</strong><br>${method.isPickup?'Collection details will be confirmed by UNIK Labs.':escapeHTML([address.address,address.suburb,address.city,address.province,address.postal_code].filter(Boolean).join(', '))}`;
    const payLater=document.getElementById('payLaterChoice'),title=document.getElementById('eligibilityTitle'),copy=document.getElementById('eligibilityCopy'),hint=document.getElementById('limitHint'),action=document.getElementById('eligibilityAction'),card=document.getElementById('eligibilityCard');
    const status=account.applicationStatus||'not_applied',available=Number(account.availableLimit||0);let allowed=status==='approved'&&available>=total;
    if(status==='approved'){title.textContent=allowed?'Pay Later is available for this order.':'This order is above your available limit.';copy.textContent=`Available now: ${money(available)} · Order total: ${money(total)}`;hint.textContent=`${money(available)} available`;action.href='dashboard.html';action.textContent='View limit';if(!allowed)card.classList.add('needs-action')}
    else if(status==='pending'){title.textContent='Your Pay Later application is in review.';copy.textContent='SETLA Laybuy remains available while you wait for your decision.';action.href='dashboard.html';action.textContent='View status';card.classList.add('pending-state')}
    else{title.textContent='Apply to unlock a SETLA spending limit.';copy.textContent='You can apply now or continue with SETLA Laybuy without using credit.';action.href='apply.html';action.textContent='Apply now';card.classList.add('needs-action')}
    if(!allowed){payLater.classList.add('disabled');payLater.querySelector('input').disabled=true;document.querySelector('input[value="laybuy"]').checked=true;document.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',choice.querySelector('input')?.checked))}
    const requested=new URLSearchParams(location.search).get('plan');if(requested==='laybuy')document.querySelector('input[value="laybuy"]').click();
    renderSchedule(total,selectedPlan());
    document.querySelectorAll('input[name="plan"]').forEach(input=>input.addEventListener('change',()=>renderSchedule(total,input.value)));
    document.getElementById('confirmSETLA').addEventListener('click',()=>{
      const error=document.getElementById('checkoutError');error.classList.remove('show');const plan=selectedPlan();if(!document.getElementById('checkoutTerms').checked){error.textContent='Review the schedule and accept the SETLA terms before continuing.';error.classList.add('show');return}if(plan==='limit'&&!allowed){error.textContent='Pay Later is not available for this order. Select SETLA Laybuy to continue.';error.classList.add('show');return}
      const scheduleRows=renderSchedule(total,plan),orders=read(KEYS.orders,[])||[],id=`SL-${String(Date.now()).slice(-6)}`;const order={id,accountId:account.id,method:plan==='laybuy'?'SETLA Laybuy':'SETLA Pay Later',methodCode:plan,total,items:draft.items,customer:draft.customer,address:draft.address,deliveryMethod:draft.deliveryMethod,schedule:scheduleRows,status:plan==='laybuy'?'production_locked':'confirmed',paymentStatus:'first_payment_due',createdAt:new Date().toISOString()};orders.unshift(order);write(KEYS.orders,orders);sessionStorage.removeItem(KEYS.draft);localStorage.removeItem('unik-labs-cart-v1');location.href=`order-confirmed.html?id=${encodeURIComponent(id)}`;
    });
  }
  if(protectedPage==='checkout')initCheckout();
  if(protectedPage==='confirmed'){
    const id=new URLSearchParams(location.search).get('id'),order=(read(KEYS.orders,[])||[]).find(item=>item.id===id);if(!order){location.href='dashboard.html';return}
    document.getElementById('confirmationId').textContent=order.id;document.getElementById('confirmationMethod').textContent=order.method;document.getElementById('confirmationTotal').textContent=money(order.total);
    document.getElementById('confirmationTitle').textContent=order.methodCode==='laybuy'?'Your Laybuy order is reserved.':'Your Pay Later plan is ready.';
    document.getElementById('confirmationCopy').textContent=order.methodCode==='laybuy'?'Complete the payment schedule from your dashboard. Production unlocks automatically when the balance is fully paid.':'Your order, payment schedule and UNIK Labs production journey are now connected to your SETLA dashboard.';
    document.getElementById('confirmationNext').innerHTML=`<strong>Next step</strong><br>${order.methodCode==='laybuy'?'Pay the first Laybuy instalment to begin your payment journey.':'Complete the first scheduled payment to release your order into the UNIK Labs production queue.'}`;
    document.getElementById('confirmationDashboard').href=`dashboard.html#${order.methodCode==='laybuy'?'laybuy':'plans'}`;
  }
})();
