import { randomUUID } from 'node:crypto';
import { CampaignStore } from '../campaigns/store';
import { ensure } from '../campaigns/contracts';
import { NumberSessions } from '../numbers/sessions';
import type { AdapterGrant } from '../numbers/contracts';
import { encryptServerSecret,decryptServerSecret } from '../services/secret-crypto-service';
import { buildRetryDelayMs,AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS } from '../services/ai-retry-schedule-service';
import { GeminiSettings } from '../gemini/settings-store';
import { safeGeminiError } from '../gemini/errors';
import { ConversationJobs } from './jobs';
import { CampaignConversationGenerator,NonSendingAdapter,type ConversationGenerator,type DeliveryAdapter } from './generation';

export class ConversationPipeline {
 readonly jobs:ConversationJobs;
 constructor(readonly store:CampaignStore,readonly sessions:NumberSessions,readonly generator:ConversationGenerator=new CampaignConversationGenerator(store),readonly transport:DeliveryAdapter=new NonSendingAdapter(),readonly liveDeliveryApproved:(g:AdapterGrant)=>boolean=()=>false){this.jobs=new ConversationJobs(store,sessions);}
 ingest(...args:Parameters<ConversationJobs['ingest']>){return this.jobs.ingest(...args);}
 recover(){return this.jobs.recover();}
 async processNext(grant:AdapterGrant){
  const job=this.jobs.claim(grant);if(!job)return null;
  const current=()=>{
   const row=this.jobs.owned(grant.accountId,job.id);ensure(row.state==='GENERATING'&&row.lease_token===job.lease_token,'Generation was superseded or interrupted');
   this.jobs.guard(row,grant);return row;
  };
  try{
   const question=decryptServerSecret(job.input_cipher),thread=this.store.db.prepare('SELECT memory_enabled FROM conversation_threads WHERE account_id=? AND id=?').get(job.account_id,job.thread_id)!;
   const allowed=Boolean(thread.memory_enabled)&&this.jobs.allowsMemory(job.account_id,job.campaign_id);
   const context=this.jobs.memory.context(job.account_id,job.thread_id,job.sequence,question,allowed);
   const result=await this.generator.generate(grant,{account:job.account_id,campaign:job.campaign_id,question,...context,repair:job.reason?.startsWith('quality:')?job.reason.slice(8):undefined},()=>{current();});
   this.store.transaction(()=>{
    current();
    this.store.db.prepare("UPDATE conversation_jobs SET output_cipher=?,key_revision=?,state='SEND_PENDING',reason=NULL,lease_token=NULL,lease_until=NULL WHERE id=?")
     .run(encryptServerSecret(JSON.stringify(result)),result.keyRevision,job.id);
    this.store.db.prepare("INSERT INTO conversation_deliveries(job_id,idempotency_key,state,updated_at) VALUES(?,?,'queued',?)").run(job.id,'black-arrow:'+job.id,Date.now());
   });
  }catch(error){
   const latest=this.jobs.owned(grant.accountId,job.id);
   if(latest.state==='GENERATING'&&latest.lease_token===job.lease_token){
    const safe=safeGeminiError(error),retry=['unavailable','rate_limit','quality'].includes(safe.category)&&job.attempts<AI_REPLY_RETRY_ADMIN_ALERT_ATTEMPTS;
    const ambiguous=['timeout','network'].includes(safe.category),state=retry?'AI_RETRY':ambiguous?'UNKNOWN':safe.category==='changed'?'BLOCKED':'FAILED';
    const reason=safe.category==='quality'?'quality:'+safe.message:safe.category;
    this.store.db.prepare('UPDATE conversation_jobs SET state=?,reason=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=?')
     .run(state,reason,Date.now()+Math.min(1800000,Math.max(buildRetryDelayMs(job.attempts-1),(safe.retryAfter||0)*1000)),job.id);
    this.jobs.alert(job,retry?'temporary_generation_failure':ambiguous?'generation_completion_unknown':safe.category);
   }
  }finally{this.store.db.prepare('UPDATE conversation_jobs SET lease_token=NULL,lease_until=NULL WHERE id=? AND lease_token=?').run(job.id,job.lease_token);}
  const result=this.jobs.owned(grant.accountId,job.id);return {id:result.id,state:result.state};
 }
 async deliver(account:string,id:string,grant:AdapterGrant){
  const job=this.jobs.owned(account,id);
  if(['SENT','CAPTURED','UNKNOWN','SUPERSEDED','FAILED','BLOCKED'].includes(job.state))return {id,state:job.state,duplicate:true};
  ensure(job.state==='SEND_PENDING','Reply is not ready for delivery');
  ensure(job.next_attempt_at<=Date.now(),'Delivery retry is not due yet');
  try{this.jobs.guard(job,grant);}catch(error){this.store.db.prepare("UPDATE conversation_jobs SET state='BLOCKED',reason='context_revalidation_required' WHERE id=? AND state='SEND_PENDING'").run(id);this.jobs.alert(job,'context_revalidation_required');throw error;}
  ensure(this.transport.mode==='non-sending'?grant.mode==='synthetic'&&process.env.BLACKARROW_DISPOSABLE_TEST==='1':this.liveDeliveryApproved(grant),'Live customer delivery is not approved',403);
  const reply=JSON.parse(decryptServerSecret(job.output_cipher));new GeminiSettings(this.store).guard(account,job.key_revision);
  const lease=randomUUID();
  const delivery=this.store.transaction(()=>{
   this.jobs.guard(this.jobs.owned(account,id),grant);
   const claimed=this.store.db.prepare("UPDATE conversation_jobs SET state='SENDING',delivery_attempts=delivery_attempts+1,lease_token=?,lease_until=? WHERE id=? AND state='SEND_PENDING'").run(lease,Date.now()+90000,id);ensure(claimed.changes===1,'Delivery was already claimed');
   const row=this.store.db.prepare("SELECT * FROM conversation_deliveries WHERE job_id=? AND state='queued'").get(id);ensure(row,'Delivery is already claimed or needs receipt reconciliation');
   this.store.db.prepare("UPDATE conversation_deliveries SET state='inflight',updated_at=? WHERE job_id=?").run(Date.now(),id);return row;
  });
  try{
   const result=await this.transport.deliver({idempotencyKey:String(delivery.idempotency_key),text:reply.reply,numberId:job.number_id,customerToken:job.thread_id,customerId:decryptServerSecret(job.recipient_cipher)});
   // A non-sending adapter can never claim a customer message was sent.
   ensure(this.transport.mode!=='non-sending'||result.kind!=='confirmed','Invalid non-sending transport result');
   this.store.transaction(()=>{
    const latest=this.jobs.owned(account,id);ensure(latest.state==='SENDING'&&latest.lease_token===lease,'Delivery requires reconciliation');
    if(result.kind==='not_attempted'){
     const retry=latest.delivery_attempts<3;
     this.store.db.prepare('UPDATE conversation_jobs SET state=?,reason=?,next_attempt_at=?,lease_token=NULL,lease_until=NULL WHERE id=?').run(retry?'SEND_PENDING':'FAILED','transport_verified_not_attempted',Date.now()+Math.min(1800000,Math.max(buildRetryDelayMs(latest.delivery_attempts-1),(result.retryAfter||0)*1000)),id);
     this.store.db.prepare('UPDATE conversation_deliveries SET state=?,updated_at=? WHERE job_id=?').run(retry?'queued':'cancelled',Date.now(),id);
     this.jobs.alert(job,retry?'temporary_delivery_failure':'delivery_failed');return;
    }
    const state=result.kind==='confirmed'?'SENT':result.kind==='captured'?'CAPTURED':'UNKNOWN';
    this.store.db.prepare('UPDATE conversation_jobs SET state=?,lease_token=NULL,lease_until=NULL,reason=? WHERE id=?').run(state,state==='UNKNOWN'?'delivery_receipt_required':null,id);
    this.store.db.prepare('UPDATE conversation_deliveries SET state=?,receipt=?,updated_at=? WHERE job_id=?').run(result.kind,result.receipt?.slice(0,200)||null,Date.now(),id);
    if(state==='UNKNOWN')this.jobs.alert(job,'delivery_receipt_required');
    else{
     const thread=this.store.db.prepare('SELECT * FROM conversation_threads WHERE account_id=? AND id=?').get(account,job.thread_id)!;
     let memoryFailed=false;
     if(thread.memory_enabled&&thread.privacy_epoch===job.privacy_epoch&&this.jobs.allowsMemory(account,job.campaign_id)){try{this.jobs.memory.reply(account,job.thread_id,job.sequence,reply.reply,reply.memory,reply.profile);}catch{memoryFailed=true;}}
     else this.store.db.prepare("UPDATE conversation_jobs SET input_cipher='',recipient_cipher='',output_cipher='' WHERE id=?").run(id);
     this.store.db.prepare('UPDATE conversation_alerts SET resolved_at=? WHERE job_id=?').run(Date.now(),id);
     if(memoryFailed)this.jobs.alert(job,'memory_update_failed');
    }
   });
  }catch{
   // An exception after handing a reply to transport is an unknown outcome;
   // never automatically send it again or regenerate its text.
   this.store.db.prepare("UPDATE conversation_jobs SET state='UNKNOWN',reason='delivery_receipt_required',lease_token=NULL,lease_until=NULL WHERE id=? AND state='SENDING'").run(id);
   this.store.db.prepare("UPDATE conversation_deliveries SET state='unknown',updated_at=? WHERE job_id=? AND state='inflight'").run(Date.now(),id);
   this.jobs.alert(job,'delivery_receipt_required');
  }
  return {id,state:this.jobs.owned(account,id).state};
 }
 revalidatePending(account:string,id:string,grant:AdapterGrant,sessionId:string,epoch:number){
  return this.store.transaction(()=>{
   const job=this.jobs.owned(account,id);ensure((['RECEIVED','AI_RETRY','SEND_PENDING'].includes(job.state)||job.state==='BLOCKED'&&job.reason==='context_revalidation_required')&&!job.lease_token&&job.input_cipher,'This job needs outcome reconciliation rather than retry');
   const candidate={...job,session_id:sessionId,number_epoch:epoch};this.jobs.guard(candidate,grant);
   if(job.state==='SEND_PENDING')new GeminiSettings(this.store).guard(account,job.key_revision);
   const state=job.state==='BLOCKED'?(job.output_cipher?'SEND_PENDING':job.attempts>0?'AI_RETRY':'RECEIVED'):job.state;
   this.store.db.prepare('UPDATE conversation_jobs SET session_id=?,number_epoch=?,state=? WHERE account_id=? AND id=?').run(sessionId,epoch,state,account,id);
   return {revalidated:true,id};
  });
 }
 reconcileDelivery(account:string,id:string,grant:AdapterGrant,proof:{idempotencyKey:string;outcome:'confirmed'|'not_sent';receipt:string},verify:(g:AdapterGrant,p:typeof proof)=>boolean=()=>false){
  this.sessions.verify(grant,account,grant.numberId);ensure(verify(grant,proof),'A verified provider receipt is required',403);
  return this.store.transaction(()=>{
   const job=this.jobs.owned(account,id),delivery=this.store.db.prepare('SELECT * FROM conversation_deliveries WHERE job_id=?').get(id);
   ensure(job.number_id===grant.numberId&&job.state==='UNKNOWN'&&delivery?.state==='unknown'&&delivery.idempotency_key===proof.idempotencyKey,'Receipt does not match the uncertain delivery');
   const state=proof.outcome==='not_sent'?'SUPERSEDED':grant.mode==='synthetic'?'CAPTURED':'SENT';
   this.store.db.prepare('UPDATE conversation_jobs SET state=?,reason=?,lease_token=NULL,lease_until=NULL WHERE id=?').run(state,proof.outcome==='not_sent'?'verified_not_sent_no_automatic_replay':'verified_receipt',id);
   this.store.db.prepare('UPDATE conversation_deliveries SET state=?,receipt=?,updated_at=? WHERE job_id=?').run(proof.outcome==='not_sent'?'cancelled':grant.mode==='synthetic'?'captured':'confirmed',proof.receipt.slice(0,200),Date.now(),id);
   this.store.db.prepare('UPDATE conversation_alerts SET resolved_at=? WHERE job_id=?').run(Date.now(),id);return {id,state};
  });
 }
}
