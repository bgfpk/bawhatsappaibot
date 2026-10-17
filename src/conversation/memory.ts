import { createHmac } from 'node:crypto';
import { CampaignStore } from '../campaigns/store';
import { ensure } from '../campaigns/contracts';
import { encryptServerSecret,decryptServerSecret } from '../services/secret-crypto-service';
import { automaticLanguage } from './language';
import { mergeCustomerMemorySummary } from '../services/customer-memory-merge-service';
import { renderCombinedCustomerMemoryUpdate } from '../services/combined-reply-memory-service';
import { compactSummary,reduceRecentMessages } from '../services/ai-context-reducer-service';

export type ConversationScope={account:string;campaign:string;number:string;customer:string};
type Memory={profile:any;summary:string;turns:Array<{role:'user'|'model';text:string;sequence:number}>};
const blank=():Memory=>({profile:{},summary:'',turns:[]});
export const memoryAllowed=(...configs:any[])=>!configs.some(c=>c&&(c.memoryEnabled===false||c.memory_enabled===false||c.conversationMemoryEnabled===false||c.rememberConversations===false||c.memory===false||c.memory?.enabled===false||c.privacy?.memoryEnabled===false||c.privacy?.retainConversations===false))&&process.env.BLACKARROW_MEMORY_ENABLED!=='false';
export class ConversationMemory {
 constructor(readonly store:CampaignStore){}
 token(value:unknown){const secret=process.env.BLACKARROW_SECRET_ENCRYPTION_KEY;ensure(secret,'Private encryption custody is required',503);return createHmac('sha256',secret).update(JSON.stringify(value)).digest('hex');}
 id(scope:ConversationScope){ensure(scope.customer.trim().length>0&&scope.customer.length<=200,'Invalid customer identity',422);return this.token([scope.account,scope.campaign,scope.number,scope.customer.trim()]);}
 read(account:string,id:string):Memory{
  const row=this.store.db.prepare('SELECT * FROM conversation_threads WHERE account_id=? AND id=?').get(account,id);
  if(!row||!row.memory_enabled||Number(row.expires_at)<=Date.now()||!row.cipher)return blank();
  return JSON.parse(decryptServerSecret(row.cipher));
 }
 write(account:string,id:string,memory:Memory){
  this.store.db.prepare('UPDATE conversation_threads SET cipher=?,expires_at=? WHERE account_id=? AND id=? AND memory_enabled=1')
   .run(encryptServerSecret(JSON.stringify(memory)),Date.now()+14*86400000,account,id);
 }
 inbound(account:string,id:string,sequence:number,text:string){
  const m=this.read(account,id);m.turns=[...m.turns,{role:'user' as const,text,sequence}].slice(-20);this.write(account,id,m);
 }
 context(account:string,id:string,sequence:number,text:string,enabled=true){
  const m=enabled?this.read(account,id):blank(),language=automaticLanguage(m.profile,text);
  return {...language,summary:compactSummary(m.summary,2400),
   history:reduceRecentMessages(m.turns.filter(t=>t.sequence<sequence),12).map(t=>({role:t.role,text:t.text}))};
 }
 reply(account:string,id:string,sequence:number,text:string,update:any,profile:any){
  const m=this.read(account,id);m.profile=profile;
  // Empty/invalid memory updates must never invalidate a confirmed delivery.
  let candidate='';try{candidate=renderCombinedCustomerMemoryUpdate(update);}catch{}
  if(candidate)m.summary=mergeCustomerMemorySummary(m.summary,candidate,{preferCandidate:true});
  m.turns=[...m.turns,{role:'model' as const,text,sequence}].slice(-20);this.write(account,id,m);
 }
 reset(account:string,campaign:string){
  this.store.owned(account,campaign);
  return this.store.transaction(()=>{
   this.store.db.prepare("UPDATE conversation_threads SET cipher='',privacy_epoch=privacy_epoch+1 WHERE account_id=? AND campaign_id=?").run(account,campaign);
   this.store.db.prepare("UPDATE conversation_jobs SET input_cipher='',recipient_cipher='',output_cipher='' WHERE account_id=? AND campaign_id=?").run(account,campaign);
   this.store.db.prepare("UPDATE conversation_jobs SET state='SUPERSEDED',input_cipher='',output_cipher='',reason='memory_reset' WHERE account_id=? AND campaign_id=? AND state IN('RECEIVED','AI_RETRY','GENERATING','SEND_PENDING')").run(account,campaign);
   this.store.db.prepare("UPDATE conversation_deliveries SET state='cancelled' WHERE state='queued' AND job_id IN(SELECT id FROM conversation_jobs WHERE account_id=? AND campaign_id=? AND reason='memory_reset')").run(account,campaign);
   return {reset:true};
  });
 }
 prune(){
  const now=Date.now();
  this.store.db.prepare("UPDATE conversation_threads SET cipher='' WHERE expires_at<=?").run(now);
  this.store.db.prepare("UPDATE conversation_jobs SET input_cipher='',recipient_cipher='',output_cipher='',state=CASE WHEN state IN('SENT','CAPTURED','SUPERSEDED','FAILED','BLOCKED','UNKNOWN') THEN state ELSE 'BLOCKED' END,reason=CASE WHEN state IN('SENT','CAPTURED','SUPERSEDED','FAILED','BLOCKED','UNKNOWN') THEN reason ELSE 'retention_expired' END WHERE expires_at<=?").run(now);
 }
}
