(function(){
  const toast=document.querySelector('.toast');
  window.setlaToast=(message)=>{if(!toast)return;toast.textContent=message;toast.classList.add('show');setTimeout(()=>toast.classList.remove('show'),3200)};
  document.querySelectorAll('.choice input').forEach(input=>input.addEventListener('change',()=>document.querySelectorAll('.choice').forEach(choice=>choice.classList.toggle('selected',choice.contains(document.querySelector('.choice input:checked'))))));
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
  form?.addEventListener('submit',event=>{event.preventDefault();if(!captured){setlaToast('Complete the live identity check or upload a recent selfie.');return}const data=new FormData(form);localStorage.setItem('setla-customer-v1',JSON.stringify({name:`${data.get('firstName')} ${data.get('lastName')}`.trim(),email:data.get('email'),status:'pending',appliedAt:new Date().toISOString()}));stream?.getTracks().forEach(track=>track.stop());location.href='dashboard.html?submitted=1'});
  const profile=(()=>{try{return JSON.parse(localStorage.getItem('setla-customer-v1')||'null')}catch{return null}})();
  const welcome=document.getElementById('welcomeName'),email=document.getElementById('welcomeEmail');
  if(profile&&welcome){welcome.textContent=`Welcome, ${profile.name.split(' ')[0]}.`;email.textContent=profile.email}
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
    setlaToast('Your appeal has been sent to the Setla review team.');
  });
  document.getElementById('bankUpdate')?.addEventListener('click',event=>{event.preventDefault();setlaToast('Bank-detail changes open a new secure verification review.')});
  document.getElementById('appeal')?.addEventListener('click',event=>{event.preventDefault();setlaToast('Appeals become available after an application decision.')});
  document.getElementById('continueSetla')?.addEventListener('click',()=>{const choice=document.querySelector('input[name="plan"]:checked')?.value;if(choice==='limit'&&!profile){location.href='apply.html';return}setlaToast(choice==='laybuy'?'Laybuy selected. Your payment schedule is the next step.':'Your approved Setla limit will be verified securely.')});
})();
