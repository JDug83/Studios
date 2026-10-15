/* Pure state controller: cloud revision checks and pending-write recovery. */
(function(root){
  class AccountStore {
    constructor({remote,saveCache,cache}){
      this.remote=remote;this.saveCache=saveCache;this.payload={};this.revision=0;
      this.generation=0;this.savedGeneration=0;this.cache=cache;this.conflict=false;this.running=null;this.closed=false;
    }
    async init(){
      const row=await this.remote.read();this.payload=row?.payload||{};this.revision=Number(row?.revision||0);
      if(this.cache?.dirty){
        if(Number(this.cache.revision)===this.revision){this.payload=this.cache.payload;this.generation=1;}
        else{this.pendingCopy=this.cache.payload;this.conflict=true;}
      }
      this.cacheNow();return this;
    }
    cacheNow(){this.saveCache({payload:this.pendingCopy||this.payload,revision:this.revision,dirty:!!this.pendingCopy||this.generation!==this.savedGeneration});}
    get(key){return Object.prototype.hasOwnProperty.call(this.payload,key)?this.payload[key]:null;}
    set(key,value){
      if(this.closed)throw new Error('Your session has ended. Sign in again.');
      if(this.conflict)throw new Error('Cloud conflict: export your pending copy, then reload cloud data.');
      if(value===null)delete this.payload[key];else this.payload[key]=String(value);
      this.generation++;this.cacheNow();
    }
    async flush(){
      if(this.running)return this.running;
      this.running=this.drain().finally(()=>{this.running=null;});return this.running;
    }
    async drain(){
      if(this.closed)throw new Error('Your session has ended.');
      if(this.conflict)throw new Error('Cloud conflict. Export your pending copy before reloading.');
      while(this.generation!==this.savedGeneration){
        const generation=this.generation, snapshot=JSON.parse(JSON.stringify(this.payload));
        try{this.revision=Number(await this.remote.write(snapshot,this.revision));}
        catch(e){if(e.code==='40001'){this.conflict=true;this.pendingCopy=this.payload;}this.cacheNow();throw e;}
        this.savedGeneration=generation;this.cacheNow();
      }
    }
    close(){this.closed=true;}
  }
  root.GazAccountStore=AccountStore;
  if(typeof module!=='undefined')module.exports=AccountStore;
})(typeof window!=='undefined'?window:globalThis);
