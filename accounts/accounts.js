(function () {
'use strict';
const app = document.currentScript.dataset.app || 'studios';
const config=window.GAZ_FIREBASE_CONFIG||{};
const accountUrl=window.GAZ_ACCOUNT_URL||'https://jdug83.github.io/Studios/Account.html';
const clientModule=new URL('firebase-client.mjs',document.currentScript.src).href;
let backendClient;
const keys = {studios:['gaz_theme'],gazcode:['gazcode.v1.projects','gazcode.v1.settings','gazcode.v1.session'],gazchat:['gz.chats.3.account','gz.prefs.3','gz.active.3'],gizmo:['gn2.prefs','gn2.chats','gn2.projects','gn2.openproj','gn2.usage2','gn2.feedback']}[app];
let resolveReady, box, form, message, status, timer, booted = false, activeUser = null, activating;
const A = window.GazAccounts = {ready:new Promise(r => {resolveReady=r;}),user:null,store:null};
function el(tag, text) { const x=document.createElement(tag);if(text!==undefined)x.textContent=text;return x; }
function button(label, fn) { const x=el('button',label);x.type='button';x.onclick=()=>Promise.resolve().then(fn).catch(e=>say(e.message));return x; }
function say(text) {message.textContent=text;}
function raw(key) {try{return localStorage.getItem(key);}catch{return null;}}
function save(key,value) {try{localStorage.setItem(key,value);}catch{status.textContent='Device cache is full. Keep this page open until saved.';}}
function cacheKey() {return 'gaz.firebase.v1:'+config.projectId+':'+activeUser+':'+app;}
function canonical(key) {return app==='gazchat'&&key.startsWith('gz.chats.3.')?'gz.chats.3.account':key;}
async function api(route,value){
 if(!backendClient)throw Error('Firebase accounts are not configured yet.');
 try{return await backendClient.api(route,value,activeUser);}
 catch(e){if(e.status===401&&booted&&!['password'].includes(route)){A.store?.close();location.reload();}throw e;}
}

function download(value, filename) {const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=el('a');a.href=u;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function field(label,type='text',autocomplete='off') {const wrap=el('label',label),input=el('input');input.type=type;input.required=true;input.autocomplete=autocomplete;wrap.append(input);form.append(wrap);return input;}
function authForm(mode='login') {
 box.hidden=false;form.replaceChildren();say('');
 form.append(el('h2',mode==='signup'?'Create your GazStudios account':mode==='reset'?'Reset your password':'Sign in to GazStudios'),el('p','One account for Studios, GazCode, GazChat and Gizmo.'));
 let display,password;
 if(mode==='signup'){display=field('Display name','text','name');display.maxLength=80;}
 const email=field('Email','email','email');email.autocapitalize='none';email.spellcheck=false;
 if(mode!=='reset'){password=field('Password','password',mode==='login'?'current-password':'new-password');password.minLength=mode==='login'?1:12;password.maxLength=128;}
 if(mode==='signup')form.append(el('p','We will send a verification email before you can open your saved data.'));
 const submit=el('button',mode==='signup'?'Create account':mode==='reset'?'Send reset email':'Sign in');submit.type='submit';form.append(submit);
 if(mode==='login')form.append(button('Create account',()=>authForm('signup')),button('Forgot password?',()=>authForm('reset')));
 else form.append(button('Back to sign in',()=>authForm()));
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;say('Working…');try{
  const result=await api(mode==='signup'?'signup':mode==='reset'?'reset':'login',{email:email.value.trim(),...(password?{password:password.value}:{}),...(display?{displayName:display.value.trim()}:{})});
  if(mode==='reset'){say('If this account can receive a reset email, a link will arrive shortly. Check spam too.');return;}
  await activate(result.user);
  if(result.verificationError)say('Your account was created, but the verification email could not be sent: '+result.verificationError+'. Use Resend verification email below.');
 }catch(err){say(err.message);}finally{submit.disabled=false;if(password)password.value='';}};
}
function showVerification(){
 box.hidden=false;form.replaceChildren(el('h2','Verify your email'),el('p','Check '+A.user.email+' for your GazStudios verification email. Click its link, then return here. Check spam too.'));
 form.append(button('I verified my email',async()=>{const result=await api('verify-status');await activate(result.user);if(!result.user.emailVerified)say('Your email is not verified yet. Follow the link in your email first.');}),button('Resend verification email',async()=>{await api('resend-verification',{});say('Verification email sent. Check your inbox and spam folder.');}),button('Sign out',()=>A.signOut()));
 say('Email verification is required before saved data can load.');
}

async function activateOnce(user) {
 if(activeUser&&activeUser!==user.id){A.store?.close();location.reload();return;}
 if(booted){A.user=user;return;}
 activeUser=user.id;A.user=user;
 if(!user.emailVerified){showVerification();return;}
 let cache;try{cache=JSON.parse(raw(cacheKey())||'null');}catch{}
 A.store=new GazAccountStore({cache,saveCache:c=>save(cacheKey(),JSON.stringify(c)),remote:{read:()=>api('data/'+app),write:async(payload,revision)=>(await api('data/'+app,{payload,revision})).revision}});
 try{await A.store.init();}catch(e){A.store=null;throw e;}
 if(A.store.conflict){showAccount();return;}
 booted=true;box.hidden=true;status.textContent='Signed in · '+user.email;resolveReady(A);
 if(A.store.generation)A.flush().catch(()=>{});
}
async function activate(user){if(activating)return activating;activating=activateOnce(user);try{return await activating;}finally{activating=null;}}
A.storage={
 getItem(key){key=canonical(key);return !A.store?null:keys.includes(key)?A.store.get(key):raw(cacheKey()+':device:'+key);},
 setItem(key,value){if(!A.user||!A.store)throw Error('Sign in before saving.');key=canonical(key);if(!keys.includes(key)){save(cacheKey()+':device:'+key,String(value));return;}A.store.set(key,value);status.textContent='Saving to account…';clearTimeout(timer);timer=setTimeout(()=>A.flush().catch(()=>{}),650);},
 removeItem(key){key=canonical(key);if(!keys.includes(key)){try{localStorage.removeItem(cacheKey()+':device:'+key);}catch{}return;}if(!A.store)throw Error('Sign in first.');A.store.set(key,null);clearTimeout(timer);timer=setTimeout(()=>A.flush().catch(()=>{}),650);}
};
A.flush=async()=>{if(!A.store)return;clearTimeout(timer);try{await A.store.flush();status.textContent='Saved to account';}catch(e){status.textContent=A.store.conflict?'Save conflict — open Account':'Cloud unavailable — changes pending on this device';if(A.store.conflict)showAccount();throw e;}};
A.signOut=async()=>{await A.flush();await api('logout',{});A.store?.close();location.reload();};
async function importData(){
 const picker=el('input');picker.type='file';picker.accept='.json,application/json';picker.onchange=async()=>{try{
  const file=picker.files[0];if(!file)return;if(file.size>22*1024*1024)throw Error('Import file is too large.');
  const data=JSON.parse(await file.text());const incoming=data.apps?.find(x=>x.app===app)?.payload;
  if(!incoming||typeof incoming!=='object'||Array.isArray(incoming))throw Error('Select an account export containing data for this app.');
  if(!confirm('Import into your signed-in account? Existing items with the same key will be replaced. Export current data first.'))return;
  for(const key of keys)if(Object.hasOwn(incoming,key)&&typeof incoming[key]==='string')A.store.set(key,incoming[key]);
  await A.flush();location.reload();
 }catch(e){say(e.message);}};picker.click();
}
function showAccount(){
 if(!A.user){authForm();return;}if(!A.user.emailVerified){showVerification();return;}
 box.hidden=false;form.replaceChildren(el('h2','Your GazStudios account'),el('p',A.user.email));
 const display=field('Display name');display.value=A.user.user_metadata.display_name;display.maxLength=80;
 const submit=el('button','Save name');submit.type='submit';form.append(submit);
 form.onsubmit=async e=>{e.preventDefault();try{A.user=(await api('profile',{displayName:display.value})).user;say('Name saved.');}catch(e){say(e.message);}};
 form.append(button('Save now',()=>A.flush()),button('Export account data',async()=>{await A.flush();download(await api('export'),'GazStudios-Account.json');}),button('Import account export',importData),button('Export pending changes',()=>download({apps:[{app,payload:A.store?.pendingCopy||A.store?.payload||{}}]},'GazStudios-Pending.json')),button('Change password',()=>passwordForm()),button('Sign out',()=>A.signOut()),button('Close',()=>{if(booted&&!A.store?.conflict)box.hidden=true;}));
 if(A.store?.conflict){form.append(button('Reload cloud data',()=>{if(confirm('Export pending changes first. Reloading replaces unsaved changes on this device.')){localStorage.removeItem(cacheKey());location.reload();}}));say('Another device changed your data. Export pending changes before reloading.');}else say('Your data is saved to your GazStudios account.');
}
function passwordForm(){
 form.replaceChildren(el('h2','Change password'));
 const current=field('Current password','password','current-password');current.maxLength=128;
 const next=field('New password','password','new-password');next.minLength=12;next.maxLength=128;
 const submit=el('button','Save password');submit.type='submit';form.append(submit,button('Back',showAccount));say('');
 form.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{await A.flush();await api('password',{currentPassword:current.value,password:next.value});showAccount();say('Password updated.');}catch(e){say(e.message);}finally{current.value='';next.value='';submit.disabled=false;}};
}

A.open=showAccount;
async function init(){
 const style=el('style');style.textContent=`
 :root{--ga-bg:#fffaf0;--ga-text:#22222a;--ga-muted:#5a5a66;--ga-border:#d8bd7f;--ga-button:#fce8ad;--ga-overlay:#fffaf0f5}.dark{--ga-bg:#121217;--ga-text:#f5f5f7;--ga-muted:#b8b8c0;--ga-border:#66532b;--ga-button:#59431e;--ga-overlay:#0a0a0ef5}
 #ga-bar{position:fixed;bottom:12px;right:14px;z-index:2147483600;display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--ga-bg);color:var(--ga-text);border:1px solid var(--ga-border);border-radius:10px;font:12px system-ui;max-width:calc(100vw - 28px)}#ga-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#ga-bar button,#ga-card button{background:var(--ga-button);color:var(--ga-text);border:1px solid var(--ga-border);border-radius:8px;padding:10px 13px;font:600 13px system-ui;cursor:pointer}#ga-gate{position:fixed;inset:0;z-index:2147483601;background:var(--ga-overlay);color:var(--ga-text);display:grid;place-items:center;overflow:auto;padding:20px;font:15px/1.6 system-ui}#ga-gate[hidden]{display:none!important}#ga-card{box-sizing:border-box;width:min(100%,460px);padding:28px;border:1px solid var(--ga-border);border-radius:18px;background:var(--ga-bg);max-height:calc(100dvh - 40px);overflow:auto}#ga-card *{box-sizing:border-box}#ga-card h2{font:600 25px/1.3 system-ui;margin:0 0 14px}#ga-card p{color:var(--ga-muted);margin:0 0 16px}#ga-card label{display:block;margin:14px 0;font:500 13px system-ui}#ga-card input{display:block;width:100%;padding:12px;margin-top:7px;border:1px solid var(--ga-border);border-radius:8px;background:var(--ga-bg);color:var(--ga-text);font:15px system-ui}#ga-card button{margin:5px 6px 5px 0}#ga-card button:disabled{opacity:.6;cursor:wait}#ga-message{white-space:pre-wrap;overflow-wrap:anywhere;margin-top:14px;font-size:13px}#ga-card :focus-visible{outline:2px solid #d6a94f;outline-offset:3px}@media(max-width:767px){#ga-bar{bottom:85px}#ga-card{padding:20px}}
 `;document.head.append(style);
 box=el('div');box.id='ga-gate';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','GazStudios account');const card=el('section');card.id='ga-card';form=el('form');message=el('div');message.id='ga-message';message.setAttribute('role','status');card.append(form,message);box.append(card);document.body.append(box);
 const bar=el('div');bar.id='ga-bar';status=el('span','Connecting Firebase accounts…');status.id='ga-status';bar.append(status,button('Account',showAccount));document.body.append(bar);
 box.addEventListener('keydown',e=>{if(e.key==='Escape'&&booted&&!A.store?.conflict)box.hidden=true;if(e.key==='Tab'){const nodes=[...box.querySelectorAll('input,button')].filter(x=>!x.disabled),first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last?.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first?.focus();}}});
 authForm();
 if(!config.apiKey||!config.authDomain||!config.projectId||!config.appId){
  form.replaceChildren(el('h2','Firebase setup required'),el('p','The owner needs to add the Firebase Web app configuration to Studios/accounts/accounts-config.js.'));status.textContent='Firebase not configured';return;
 }
 try{
  const {createBackend}=await import(clientModule);
  backendClient=await createBackend(config,accountUrl,uid=>{if(activeUser&&uid!==activeUser){A.store?.close();location.reload();}});
  try{await activate((await api('session')).user);}catch(e){if(e.status===401)status.textContent='Sign in to save across devices';else throw e;}
 }catch(e){say('Could not connect Firebase accounts: '+e.message);status.textContent='Accounts unavailable';}
 window.addEventListener('online',()=>A.flush().catch(()=>{}));
 window.addEventListener('beforeunload',e=>{if(A.store&&(A.store.conflict||A.store.generation!==A.store.savedGeneration)){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')A.flush().catch(()=>{});else if(booted)api('session').then(data=>{if(data.user.id!==activeUser){A.store.close();location.reload();}}).catch(()=>{});});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(console.error),{once:true});else init().catch(console.error);
})();
