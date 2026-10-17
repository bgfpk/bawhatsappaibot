import { createHash } from 'node:crypto';
import { ensure } from '../campaigns/contracts';
import type { AdapterGrant } from '../numbers/contracts';
import type { DeliveryAdapter } from '../conversation/generation';
import type { ConversationPipeline } from '../conversation/pipeline';
import { encryptServerSecret,decryptServerSecret } from '../services/secret-crypto-service';
import { ConnectionState } from './state';
import type { SessionSocket } from './socket';
export class SocketDelivery implements DeliveryAdapter {
 readonly mode:'non-sending'|'authorized';
 constructor(readonly state:ConnectionState,readonly grant:AdapterGrant,readonly session:string,readonly epoch:number,readonly socket:()=>SessionSocket|undefined,readonly connected:()=>boolean,readonly permit:()=>void){this.mode=grant.mode==='synthetic'?'non-sending':'authorized';}
 async deliver(input:Parameters<DeliveryAdapter['deliver']>[0]){
  this.permit();const g=this.grant,r=this.state.guard(g,this.session,this.epoch),db=this.state.store.db;
  ensure(input.numberId===g.numberId,'Wrong outgoing number',409);
  const prior=db.prepare('SELECT * FROM number_socket_outbox WHERE account_id=? AND number_id=? AND idempotency_key=?').get(g.accountId,g.numberId,input.idempotencyKey);
  if(prior)return {kind:'unknown' as const}; // Never replay an attempted provider call.
  const socket=this.socket();if(!this.connected()||!socket||socket.ws&&socket.ws.readyState!==1)return {kind:'not_attempted' as const};
  const id='BA'+createHash('sha256').update([g.accountId,g.numberId,input.idempotencyKey].join('\0')).digest('hex').slice(0,30).toUpperCase();
  db.prepare("INSERT INTO number_socket_outbox VALUES(?,?,?,?,?,?,'attempted',NULL,?,?)")
   .run(g.accountId,g.numberId,input.idempotencyKey,id,r.auth_generation,encryptServerSecret(input.customerId),Date.now(),Date.now());
  try{
   this.permit();this.state.guard(g,this.session,this.epoch);
   const result=await socket.sendMessage(input.customerId,{text:input.text},{messageId:id});
   const synthetic=g.mode==='synthetic';ensure(!synthetic||process.env.BLACKARROW_DISPOSABLE_TEST==='1','Synthetic socket is unavailable',403);
   const correlated=result?.key?.id===id;
   db.prepare('UPDATE number_socket_outbox SET state=?,updated_at=? WHERE account_id=? AND number_id=? AND idempotency_key=?')
    .run(synthetic&&correlated?'captured':correlated?'submitted':'unknown',Date.now(),g.accountId,g.numberId,input.idempotencyKey);
   return {kind:synthetic&&correlated?'captured' as const:'unknown' as const,receipt:correlated?id:undefined};
  }catch{
   db.prepare("UPDATE number_socket_outbox SET state='unknown',updated_at=? WHERE account_id=? AND number_id=? AND idempotency_key=?").run(Date.now(),g.accountId,g.numberId,input.idempotencyKey);
   return {kind:'unknown' as const};
  }
 }
 receipt(event:any,pipeline:ConversationPipeline){
  this.permit();const g=this.grant,r=this.state.guard(g,this.session,this.epoch),db=this.state.store.db;
  for(const update of Array.isArray(event)?event:[]){
   const key=update?.key,status=update?.update?.status;
   if(key?.fromMe!==true||![3,4,5].includes(status)||typeof key.id!=='string')continue;
   const row=db.prepare('SELECT * FROM number_socket_outbox WHERE account_id=? AND number_id=? AND provider_id=? AND auth_generation=?').get(g.accountId,g.numberId,key.id,r.auth_generation);
   if(!row||!['submitted','unknown'].includes(String(row.state))||decryptServerSecret(row.recipient_cipher)!==key.remoteJid)continue;
   const job=db.prepare('SELECT j.id,j.state FROM conversation_jobs j JOIN conversation_deliveries d ON d.job_id=j.id WHERE j.account_id=? AND j.number_id=? AND d.idempotency_key=?').get(g.accountId,g.numberId,row.idempotency_key);
   if(job?.state!=='UNKNOWN')continue;
   pipeline.reconcileDelivery(g.accountId,String(job.id),g,{idempotencyKey:String(row.idempotency_key),outcome:'confirmed',receipt:key.id},()=>true);
   db.prepare("UPDATE number_socket_outbox SET state=?,receipt=?,updated_at=? WHERE account_id=? AND number_id=? AND provider_id=?").run(g.mode==='synthetic'?'captured':'delivered',key.id,Date.now(),g.accountId,g.numberId,key.id);
  }
 }
 async getMessage(key:any){
  this.permit();const g=this.grant;this.state.guard(g,this.session,this.epoch);
  const row=this.state.store.db.prepare('SELECT j.output_cipher,o.recipient_cipher FROM number_socket_outbox o JOIN conversation_deliveries d ON d.idempotency_key=o.idempotency_key JOIN conversation_jobs j ON j.id=d.job_id WHERE o.account_id=? AND o.number_id=? AND o.provider_id=? AND j.account_id=o.account_id AND j.number_id=o.number_id').get(g.accountId,g.numberId,String(key?.id||''));
  if(!row?.output_cipher||decryptServerSecret(row.recipient_cipher)!==key.remoteJid)return undefined;
  return {conversation:JSON.parse(decryptServerSecret(row.output_cipher)).reply};
 }
}
