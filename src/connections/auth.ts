import { ConnectionState } from './state';
import type { AdapterGrant } from '../numbers/contracts';
import { ensure } from '../campaigns/contracts';
import { encryptServerSecret,decryptServerSecret } from '../services/secret-crypto-service';
export type AuthCodec={replacer:(key:string,value:any)=>any;reviver:(key:string,value:any)=>any;init:()=>any;appState:(value:any)=>any};
/** Per-number encrypted Baileys credentials and Signal keys. Never uses a filesystem auth folder. */
export function encryptedAuth(state:ConnectionState,grant:AdapterGrant,session:string,epoch:number,codec:AuthCodec){
 const a=grant.accountId,n=grant.numberId,g=state.guard(grant,session,epoch).auth_generation,db=state.store.db;
 const guard=()=>{ensure(state.guard(grant,session,epoch).auth_generation===g,'Pairing credentials were reset',409);};
 function read(kind:string,id:string){
  guard();const r=db.prepare('SELECT cipher FROM number_auth_vault WHERE account_id=? AND number_id=? AND generation=? AND kind=? AND key_id=?').get(a,n,g,kind,id);
  if(!r)return null;const v=JSON.parse(decryptServerSecret(r.cipher),codec.reviver);
  ensure(v.account===a&&v.number===n&&v.generation===g&&v.kind===kind&&v.id===id,'Invalid auth custody scope',409);return v.value;
 }
 function write(kind:string,id:string,value:any){
  guard();ensure(id.length<=300&&kind.length<=80,'Invalid authentication key',422);
  const cipher=encryptServerSecret(JSON.stringify({account:a,number:n,generation:g,kind,id,value},codec.replacer));
  db.prepare('INSERT INTO number_auth_vault VALUES(?,?,?,?,?,1,?,?) ON CONFLICT(account_id,number_id,generation,kind,key_id) DO UPDATE SET revision=revision+1,cipher=excluded.cipher,updated_at=excluded.updated_at').run(a,n,g,kind,id,cipher,Date.now());
 }
 const creds=read('creds','main')||codec.init();
 const keys={async get(type:string,ids:string[]){guard();ensure(ids.length<=1000,'Too many authentication keys',422);const result:Record<string,any>={};for(const id of ids){let value=read(type,id);if(value&&type==='app-state-sync-key')value=codec.appState(value);if(value!==null)result[id]=value;}return result;},
  async set(data:Record<string,Record<string,any>>){state.store.transaction(()=>{guard();for(const[type,entries]of Object.entries(data))for(const[id,value]of Object.entries(entries))write(type,id,value);});}};
 async function saveCreds(update:any={}){state.store.transaction(()=>{guard();Object.assign(creds,update);write('creds','main',creds);});}
 return {state:{creds,keys},saveCreds,generation:g};
}
