export const APPS = ['studios','gazcode','gazchat','gizmo'];
export const MAX_BYTES = 3 * 1024 * 1024;
export const CHUNK_BYTES = 550000;
export function splitPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw Error('Invalid account data.');
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  if (bytes.length > MAX_BYTES) throw Error('This app exceeds its 3 MiB save limit. Export a copy and reduce its size.');
  const chunks = [];
  for (let start=0;start<bytes.length;) {
    let end=Math.min(start+CHUNK_BYTES,bytes.length);
    while (end<bytes.length && (bytes[end]&0xc0)===0x80) end--;
    chunks.push(new TextDecoder('utf-8',{fatal:true}).decode(bytes.subarray(start,end)));
    start=end;
  }
  return chunks;
}
export function dataStore(sdk, db, uid, app, assertUser) {
  if (!APPS.includes(app)) throw Error('Unknown app.');
  const header=sdk.doc(db,'gaz_accounts',uid,'apps',app);
  const part=i=>sdk.doc(db,'gaz_accounts',uid,'apps',app,'chunks',String(i));
  return {
    async read() {
      assertUser(uid);
      const result=await sdk.runTransaction(db,async t=>{
        const snap=await t.get(header);
        assertUser(uid);
        if(!snap.exists())return null;
        const meta=snap.data();
        if(!Number.isSafeInteger(meta.revision)||!Number.isInteger(meta.chunkCount)||meta.chunkCount<1||meta.chunkCount>10)throw Error('Invalid saved-data metadata.');
        const docs=await Promise.all(Array.from({length:meta.chunkCount},(_,i)=>t.get(part(i))));
        assertUser(uid);
        const text=docs.map(x=>{if(!x.exists()||x.data().revision!==meta.revision||typeof x.data().text!=='string')throw Error('Saved-data parts are incomplete. Export pending changes and contact the owner.');return x.data().text;}).join('');
        if(new TextEncoder().encode(text).length>MAX_BYTES)throw Error('Saved data is too large.');
        const payload=JSON.parse(text);
        if(!payload||typeof payload!=='object'||Array.isArray(payload))throw Error('Invalid saved data.');
        return {payload,revision:meta.revision};
      });
      assertUser(uid);return result;
    },
    async write(payload, revision) {
      assertUser(uid);
      if(!Number.isSafeInteger(revision)||revision<0)throw Error('Invalid save revision.');
      const chunks=splitPayload(payload);
      return sdk.runTransaction(db,async t=>{
        const snap=await t.get(header);assertUser(uid);
        if((snap.exists()?snap.data().revision:0)!==revision)throw Object.assign(new Error('Data changed on another device. Export pending changes before reloading.'),{code:'40001'});
        t.set(header,{revision:revision+1,chunkCount:chunks.length,updatedAt:sdk.serverTimestamp()});
        for(let i=0;i<10;i++){
          if(i<chunks.length)t.set(part(i),{revision:revision+1,text:chunks[i]});
          else t.delete(part(i));
        }
        return revision+1;
      });
    }
  };
}
