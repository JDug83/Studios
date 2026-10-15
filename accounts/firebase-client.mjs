import {initializeApp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import {getAuth,setPersistence,browserLocalPersistence,onAuthStateChanged,createUserWithEmailAndPassword,signInWithEmailAndPassword,signOut,updateProfile,sendEmailVerification,sendPasswordResetEmail,reload,reauthenticateWithCredential,EmailAuthProvider,updatePassword} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import {getFirestore,doc,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import {APPS,dataStore} from './data-core.mjs';

export async function createBackend(config, accountUrl, onAccountChange) {
  const app=initializeApp(config);
  const auth=getAuth(app),db=getFirestore(app);
  auth.languageCode='en';
  await setPersistence(auth,browserLocalPersistence);
  await new Promise((resolve,reject)=>{let stop;stop=onAuthStateChanged(auth,()=>{stop?.();resolve();},reject);});
  onAuthStateChanged(auth,user=>onAccountChange(user?.uid||null));
  const map=u=>({id:u.uid,email:u.email,emailVerified:u.emailVerified,user_metadata:{display_name:u.displayName||u.email}});
  function assertUser(uid) {if(!auth.currentUser||auth.currentUser.uid!==uid||!auth.currentUser.emailVerified)throw Object.assign(new Error('Your verified account session changed. Sign in again.'),{status:401});}
  async function current() {
    const user=auth.currentUser;if(!user)throw Object.assign(new Error('Sign in to your account.'),{status:401});
    await reload(user);await user.getIdToken(true);
    if(auth.currentUser?.uid!==user.uid)throw Object.assign(new Error('Account changed. Reload the page.'),{status:401});
    return map(user);
  }
  return {
    async api(route,value,expectedUid) {
      if(route==='signup'){
        if(typeof value.password!=='string'||value.password.length<12||value.password.length>128)throw Error('Use a password between 12 and 128 characters.');
        const result=await createUserWithEmailAndPassword(auth,value.email,value.password);
        await updateProfile(result.user,{displayName:String(value.displayName||'').trim().slice(0,80)});
        let verificationError;
        try{await sendEmailVerification(result.user,{url:accountUrl});}catch(e){verificationError=e.message;}
        return{user:map(result.user),verificationError};
      }
      if(route==='login')return{user:map((await signInWithEmailAndPassword(auth,value.email,value.password)).user)};
      if(route==='reset') {await sendPasswordResetEmail(auth,value.email,{url:accountUrl});return{ok:true};}
      if(route==='session'||route==='verify-status')return{user:await current()};
      if(route==='resend-verification'){if(!auth.currentUser)throw Error('Sign in first.');await sendEmailVerification(auth.currentUser,{url:accountUrl});return{ok:true};}
      if(route==='logout'){await signOut(auth);return{ok:true};}
      assertUser(expectedUid);
      if(route==='profile'){await updateProfile(auth.currentUser,{displayName:String(value.displayName||'').trim().slice(0,80)});assertUser(expectedUid);return{user:map(auth.currentUser)};}
      if(route==='password'){
        if(typeof value.password!=='string'||value.password.length<12||value.password.length>128)throw Error('Use a password between 12 and 128 characters.');
        const user=auth.currentUser;
        await reauthenticateWithCredential(user,EmailAuthProvider.credential(user.email,value.currentPassword));
        assertUser(expectedUid);await updatePassword(user,value.password);return{ok:true};
      }
      if(route==='export'){
        const apps=await Promise.all(APPS.map(async app=>({app,...(await dataStore({doc,runTransaction,serverTimestamp},db,expectedUid,app,assertUser).read()||{payload:{},revision:0})})));
        return{user:map(auth.currentUser),apps};
      }
      if(route.startsWith('data/')){
        const store=dataStore({doc,runTransaction,serverTimestamp},db,expectedUid,route.slice(5),assertUser);
        return value===undefined?store.read():{revision:await store.write(value.payload,value.revision)};
      }
      throw Error('Unknown account action.');
    }
  };
}
