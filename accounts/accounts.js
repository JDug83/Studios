/* Real shared identity; Supabase verifies accounts and enforces database access. */
(function(){
'use strict';
const script=document.currentScript, app=script.dataset.app||'studios';
const config=window.GAZ_ACCOUNTS_CONFIG||{};
let resolveReady;const ready=new Promise(r=>resolveReady=r);
const A=window.GazAccounts={ready,app,user:null,store:null,client:null,storage:null};
let client,box,state,status,timer,sessionUser=null,handledRecovery=false,booted=false, activation=null, authEpoch=0;
const keys={studios:['gaz_theme'],gazcode:['gazcode.v1.projects','gazcode.v1.settings','gazcode.v1.session'],gazchat:['gz.chats.3.account','gz.prefs.3','gz.active.3'],gizmo:['gn2.prefs','gn2.chats','gn2.projects','gn2.openproj','gn2.usage2','gn2.feedback']};
function rawGet(k){try{return localStorage.getItem(k);}catch{return null;}}
function rawSet(k,v){try{localStorage.setItem(k,v);}catch{notice('This device cannot keep a pending copy. Keep this page open until cloud saving succeeds.');}}
function name(){return A.user?.user_metadata?.display_name||A.user?.email||'GazStudios account';}
function message(text){if(state)state.textContent=text;}
function notice(text){if(status)status.textContent=text;}
function el(tag,text){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
function button(text,action){const b=el('button',text);b.type='button';b.onclick=action;return b;}
function download(value,label){const u=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=u;a.download=label;a.click();setTimeout(()=>URL.revokeObjectURL(u),1000);}
function configured(){return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(config.supabaseUrl||'')&&/^sb_publishable_/.test(config.publishableKey||'');}
function fatal(text){message(text);box.hidden=false;}
function authForm(mode='login'){
 const form=box.querySelector('form');form.replaceChildren();
 const title=el('h2',mode==='signup'?'Create your GazStudios account':mode==='reset'?'Reset your password':mode==='recovery'?'Set a new password':'Sign in to GazStudios');form.append(title,el('p','One account for Studios, GazCode, GazChat and Gizmo.'));
 let display,email,password;
 function input(label,type,autocomplete){const wrap=el('label',label),i=el('input');i.type=type;i.required=true;i.autocomplete=autocomplete;wrap.append(i);form.append(wrap);return i;}
 if(mode==='signup'){display=input('Your name','text','name');display.maxLength=80;}
 if(mode!=='recovery')email=input('Email','email','email');
 if(mode!=='reset'){password=input('Password','password',mode==='login'?'current-password':'new-password');password.minLength=mode==='login'?1:12;password.maxLength=128;}
 const submit=el('button',mode==='signup'?'Create account':mode==='reset'?'Send reset email':mode==='recovery'?'Save password':'Sign in');submit.type='submit';form.append(submit);
 const links=el('div');links.className='ga-links';
 if(mode==='login'){links.append(button('Create account',()=>authForm('signup')),button('Forgot password?',()=>authForm('reset')));}
 else if(mode!=='recovery')links.append(button('Back to sign in',()=>authForm('login')));
 form.append(links);
 form.onsubmit=async e=>{e.preventDefault();if(!client){message('Accounts are not configured yet.');return;}submit.disabled=true;message('Working…');
 try{
  let result;
  if(mode==='signup')result=await client.auth.signUp({email:email.value.trim(),password:password.value,options:{data:{display_name:display.value.trim()},emailRedirectTo:config.accountUrl}});
  else if(mode==='reset')result=await client.auth.resetPasswordForEmail(email.value.trim(),{redirectTo:config.accountUrl});
  else if(mode==='recovery'){result=await client.auth.updateUser({password:password.value});if(!result.error){handledRecovery=false;await activate(result.data.user);message('Password updated.');showAccount();}}
  else result=await client.auth.signInWithPassword({email:email.value.trim(),password:password.value});
  if(result?.error)throw result.error;
  if(mode==='signup'&&!result.data.session)message('Check your email to confirm your account, then sign in.');
  else if(mode==='reset')message('If this address can receive a reset email, a link will arrive shortly.');
 }catch(err){message(err.message||'Could not sign in.');}finally{submit.disabled=false;if(password)password.value='';}
 };
}
function showAccount(){
 if(!A.user){box.hidden=false;authForm();return;}
 box.hidden=false;const form=box.querySelector('form');form.replaceChildren(el('h2','Your GazStudios account'),el('p',A.user.email));
 const label=el('label','Display name'),input=el('input');input.value=A.user.user_metadata?.display_name||'';input.maxLength=80;label.append(input);form.append(label);
 const save=el('button','Save name');save.type='submit';form.append(save);form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{const {data,error}=await client.auth.updateUser({data:{display_name:input.value.trim()}});if(error)throw error;A.user=data.user;message('Name saved.');}catch(e){message(e.message);}save.disabled=false;};
 form.append(button('Save to cloud now',()=>A.flush().catch(e=>message(e.message))),button('Send password reset email',async()=>{const {error}=await client.auth.resetPasswordForEmail(A.user.email,{redirectTo:config.accountUrl});message(error?error.message:'Check your email for a password reset link.');}),button('Download account data',async()=>{try{await A.flush();const {data,error}=await client.from('gaz_app_data').select('app,payload,revision,updated_at');if(error)throw error;download({email:A.user.email,apps:data},'gazstudios-account.json');}catch(e){message(e.message);}}),button('Export pending copy',()=>download(A.store?.pendingCopy||A.store?.payload||{},app+'-pending.json')),button('Import this browser’s older data',importLegacy),button('Sign out',()=>A.signOut().catch(e=>message(e.message))),button('Close',()=>{if(booted&&!A.store?.conflict)box.hidden=true;}));
 if(A.store?.conflict)form.append(button('Reload cloud version',()=>{if(confirm('Export your pending copy first. Reloading will replace this device’s unsaved changes with the cloud version.')){try{localStorage.removeItem(cacheKey());}catch{}location.reload();}}));
 message(A.store?.conflict?'Another device changed the cloud data. Export your pending copy, then reload the cloud version.':'Signed in. Data belongs to this account.');
}
A.open=showAccount;
function cacheKey(){return 'gaz.accounts.v1:'+sessionUser+':'+app;}
function canonical(key){if(app==='gazchat'&&key.startsWith('gz.chats.3.'))return 'gz.chats.3.account';return key;}
A.storage={
 getItem(key){key=canonical(key);if(!A.store)return null;if(keys[app].includes(key))return A.store.get(key);return rawGet(cacheKey()+':local:'+key);},
 setItem(key,value){key=canonical(key);if(!A.user||!A.store)throw Error('Sign in before saving.');if(!keys[app].includes(key)){rawSet(cacheKey()+':local:'+key,String(value));return;}A.store.set(key,value);notice('Saving to account…');clearTimeout(timer);timer=setTimeout(()=>A.flush().catch(()=>{}),650);},
 removeItem(key){key=canonical(key);if(!keys[app].includes(key)){try{localStorage.removeItem(cacheKey()+':local:'+key);}catch{}return;}A.store.set(key,null);notice('Saving to account…');clearTimeout(timer);timer=setTimeout(()=>A.flush().catch(()=>{}),650);}
};
A.flush=async()=>{if(!A.store)return;clearTimeout(timer);try{await A.store.flush();notice('Saved to account');}catch(e){notice(A.store.conflict?'Save conflict — open Account':'Not saved to cloud — pending on this device');if(A.store.conflict)showAccount();throw e;}};
A.signOut=async()=>{
 if(!client)return;
 try{await A.flush();}catch(e){showAccount();message('Sign-out paused because cloud saving failed. Export your pending copy, then retry once the connection is restored.');throw e;}
 const {error}=await client.auth.signOut({scope:'local'});if(error)throw error;
};
async function importLegacy(){
 if(!A.store||A.store.conflict)return;
 if(!confirm('Only import data that belongs to you. This adds this browser’s older data only where your current account has no saved value. Existing account data is kept.'))return;
 try{
  const entries=keys[app];let count=0;
  const lists=new Set(['gazcode.v1.projects','gz.chats.3.account','gn2.chats','gn2.projects']);
  for(const key of entries){
   const legacy=key==='gz.chats.3.account'?'gz.chats.3.local':key,value=rawGet(legacy);if(value===null)continue;
   const incoming=JSON.parse(value),current=A.store.get(key);
   if(current===null){A.store.set(key,value);count++;continue;}
   if(lists.has(key)&&Array.isArray(incoming)){
    const existing=JSON.parse(current);if(!Array.isArray(existing))continue;
    const ids=new Set(existing.map(x=>x.id));const extra=incoming.filter(x=>x&&x.id&&!ids.has(x.id));
    if(extra.length){A.store.set(key,JSON.stringify(existing.concat(extra)));count+=extra.length;}
   }
  }
  await A.flush();message(count?'Imported. Reload this page to see the imported data.':'No older data found, or the account already has data for those items.');
 }catch(e){message(e.message);}
}
async function activateOnce(user){
 const activationEpoch=authEpoch;
 if(sessionUser&&user.id!==sessionUser){A.store?.close();location.reload();return;}
 if(booted)return;sessionUser=user.id;A.user=user;
 let cache;try{cache=JSON.parse(rawGet(cacheKey())||'null');}catch{}
 const remote={read:async()=>{const {data,error}=await client.from('gaz_app_data').select('payload,revision').eq('app',app).eq('user_id',user.id).maybeSingle();if(error)throw error;return data;},write:async(payload,revision)=>{const {data,error}=await client.rpc('gaz_save_data',{p_app:app,p_payload:payload,p_revision:revision});if(error)throw error;return data;}};
 A.store=new GazAccountStore({remote,cache,saveCache:c=>rawSet(cacheKey(),JSON.stringify(c))});
 try{await A.store.init();}catch(e){A.store=null;message('Could not load account data: '+e.message+'. Check the database setup and connection, then reload.');return;}
 if(activationEpoch!==authEpoch){A.store?.close();return;}
 if(A.store.conflict){showAccount();return;}
 booted=true;box.hidden=true;notice('Signed in · '+name());resolveReady(A);
 if(A.store.generation)A.flush().catch(()=>{});
}
async function activate(user){if(activation)return activation;activation=activateOnce(user);try{return await activation;}finally{activation=null;}}
async function authEvent(event,session){
 if(event==='PASSWORD_RECOVERY'){handledRecovery=true;box.hidden=false;authForm('recovery');message('Enter a new password.');}
 if(event==='SIGNED_OUT'){
  authEpoch++;
  A.store?.close();A.user=null;box.hidden=false;authForm();notice('Signed out');if(booted)location.reload();return;
 }
 if(session?.user&&!handledRecovery){
  try{const {data,error}=await client.auth.getUser();if(error)throw error;await activate(data.user);}catch(e){message('Session could not be verified: '+e.message);}
 }
}
async function init(){
 const style=el('style');style.textContent=`:root{--ga-bg:#fffbf0;--ga-overlay:#fffbf0f5;--ga-text:#17171c;--ga-muted:#55555f;--ga-border:#d6bb7a;--ga-button:#fce8ad}.dark{--ga-bg:#121217;--ga-overlay:#0a0a0ef5;--ga-text:#f5f5f6;--ga-muted:#aaaab4;--ga-border:#66532b;--ga-button:#59431e}

#ga-bar{position:fixed;right:14px;bottom:12px;z-index:2147483600;display:flex;align-items:center;gap:10px;padding:7px 10px;border:1px solid var(--ga-border);border-radius:9px;background:var(--ga-bg);color:var(--ga-text);font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 12px #00000020;max-width:calc(100vw - 28px)}#ga-bar button{border:0;border-radius:6px;background:var(--ga-button);color:var(--ga-text);padding:7px 12px;font:600 12px system-ui;cursor:pointer}#ga-status{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ga-gate{position:fixed;inset:0;z-index:2147483601;background:var(--ga-overlay);display:grid;place-items:center;padding:20px;overflow:auto;color:var(--ga-text);font:15px/1.6 system-ui,sans-serif}#ga-gate[hidden]{display:none!important}#ga-card{background:var(--ga-bg);border:1px solid var(--ga-border);border-radius:16px;padding:28px;width:min(100%,440px)}#ga-card *{box-sizing:border-box}#ga-card h2{font:600 26px/1.2 system-ui;margin:0 0 12px;letter-spacing:-.7px}#ga-card p{margin:0 0 16px;color:var(--ga-muted)}#ga-card label{display:block;margin:14px 0;font:500 13px system-ui}#ga-card input{display:block;width:100%;border:1px solid var(--ga-border);border-radius:8px;padding:12px;margin-top:6px;background:var(--ga-bg);color:var(--ga-text);font:15px system-ui}#ga-card button{background:var(--ga-button);color:var(--ga-text);border:1px solid var(--ga-border);padding:11px 14px;border-radius:8px;font:600 13px system-ui;cursor:pointer;margin:5px 5px 5px 0}#ga-card button:disabled{opacity:.6;cursor:wait}#ga-card :focus-visible{outline:2px solid #c58f1f;outline-offset:3px}#ga-message{font-size:13px;white-space:pre-wrap;overflow-wrap:anywhere;min-height:20px;margin-top:16px}.ga-links{display:flex;flex-wrap:wrap}@media(max-width:767px){#ga-bar{bottom:85px;font-size:11px}#ga-card{padding:22px}}
`;document.head.append(style);
 box=el('div');box.id='ga-gate';box.setAttribute('role','dialog');box.setAttribute('aria-modal','true');box.setAttribute('aria-label','GazStudios account');const card=el('section');card.id='ga-card';card.append(el('form'));state=el('div');state.id='ga-message';state.setAttribute('role','status');card.append(state);box.append(card);document.body.append(box);
 box.addEventListener('keydown',e=>{if(e.key==='Escape'&&A.user&&!A.store?.conflict&&!handledRecovery)box.hidden=true;if(e.key==='Tab'){const a=[...box.querySelectorAll('input,button')].filter(x=>!x.disabled);if(!a.length)return;const first=a[0],last=a[a.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}});
 const bar=el('div');bar.id='ga-bar';status=el('span','Connecting accounts…');status.id='ga-status';bar.append(status,button('Account',showAccount));document.body.append(bar);
 authForm();
 if(!configured()){box.querySelector('form').hidden=true;fatal('Accounts are not connected yet. The website owner must configure the Supabase project URL and public publishable key in accounts-config.js.');notice('Accounts setup required');return;}
 client=A.client=window.GazSupabase.createClient(config.supabaseUrl,config.publishableKey,{auth:{storageKey:'gazstudios.auth.v1',persistSession:true,autoRefreshToken:true,detectSessionInUrl:true,flowType:'implicit'}});
 client.auth.onAuthStateChange((event,session)=>{setTimeout(()=>authEvent(event,session),0);});
 // SDK owns token refresh. Database permissions never rely on this page's user object.
 const {data,error}=await client.auth.getSession();if(error){message(error.message);return;}
 if(data.session)setTimeout(()=>authEvent('INITIAL_SESSION',data.session),0);else notice('Sign in to save across devices');
 window.addEventListener('online',()=>A.flush().catch(()=>{}));
 window.addEventListener('beforeunload',e=>{if(A.store&&(A.store.generation!==A.store.savedGeneration||A.store.conflict)){e.preventDefault();e.returnValue='';}});
 document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden'&&A.user)A.flush().catch(()=>{});});
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>message(e.message)),{once:true});else init().catch(e=>message(e.message));
})();
