import { randomUUID } from 'node:crypto';
import { CampaignStore } from '../campaigns/store';
import { CampaignPublications } from '../campaigns/publications';
import { ensure } from '../campaigns/contracts';
import { NumberSessions } from '../numbers/sessions';
import type { AdapterGrant } from '../numbers/contracts';
import { encryptServerSecret } from '../services/secret-crypto-service';
import { ConversationMemory,memoryAllowed } from './memory';

export type InboundEvent={providerMessageId:string;sessionId:string;epoch:number;customerId:string;text:string};
export class ConversationJobs {
 readonly memory:ConversationMemory;
 constructor(readonly store:CampaignStore,readonly sessions:NumberSessions){this.memory=new ConversationMemory(store);}
 owned(account:string,id:string):any{
  const job=this.store.db.prepare('SELECT * FROM conversation_jobs WHERE account_id=? AND id=?').get(account,id);ensure(job,'Conversation job not found',404);return job;
 }
 allowsMemory(account:string,campaign:string){const pub=new CampaignPublications(this.store);return memoryAllowed(pub.read(account,campaign)?.snapshot.config,pub.draft(account,campaign));}
 session(grant:AdapterGrant,session:string,epoch:number){
  this.sessions.verify(grant,grant.accountId,grant.numberId);
  const number=this.sessions.numbers.owned(grant.accountId,grant.numberId);
  ensure(number.session_id===session&&number.session_epoch===epoch&&!number.session_ended_at&&number.connection_state==='connected'
   &&number.lease_until>Date.now()&&number.authorization_expires_at>Date.now()&&number.authorization_reference===grant.reference&&number.adapter_id===grant.adapterId,'Connection requires authorization or revalidation',409);
  return number;
 }
 ingest(grant:AdapterGrant,input:InboundEvent){
  ensure(input.text.trim().length>0&&input.text.length<=4000&&input.providerMessageId.length>0&&input.providerMessageId.length<=200,'Unsupported incoming message',422);
  this.sessions.verify(grant,grant.accountId,grant.numberId);this.memory.prune();
  const a=grant.accountId,n=grant.numberId,event=this.memory.token([a,n,input.providerMessageId]),digest=this.memory.token([input.customerId,input.text]);
  return this.store.transaction(()=>{
   const prior=this.store.db.prepare('SELECT id,digest FROM conversation_jobs WHERE account_id=? AND number_id=? AND event_key=?').get(a,n,event);
   if(prior){ensure(prior.digest===digest,'Incoming message identity conflict');return {id:String(prior.id),duplicate:true};}
   const number=this.session(grant,input.sessionId,input.epoch);ensure(number.campaign_id,'Assign this number before processing messages');
   const campaign=this.store.owned(a,number.campaign_id),pub=new CampaignPublications(this.store).read(a,campaign.id);
   ensure(campaign.lifecycle==='active'&&pub?.snapshot.config.enabled===true,'Campaign AI replies are paused or unpublished');
   const id=this.memory.id({account:a,campaign:campaign.id,number:n,customer:input.customerId}),allowed=this.allowsMemory(a,campaign.id);
   this.store.db.prepare('INSERT OR IGNORE INTO conversation_threads(account_id,campaign_id,number_id,id,memory_enabled,expires_at) VALUES(?,?,?,?,?,?)').run(a,campaign.id,n,id,+allowed,Date.now()+14*86400000);
   if(!allowed)this.store.db.prepare("UPDATE conversation_threads SET cipher='',memory_enabled=0,privacy_epoch=privacy_epoch+CASE WHEN memory_enabled=1 THEN 1 ELSE 0 END WHERE account_id=? AND id=?").run(a,id);
   // A prior explicit opt-out is sticky; publishing new defaults never re-enables it.
   this.store.db.prepare('UPDATE conversation_threads SET sequence=sequence+1 WHERE account_id=? AND id=?').run(a,id);
   const current=this.store.db.prepare('SELECT * FROM conversation_threads WHERE account_id=? AND id=?').get(a,id)!;
   this.store.db.prepare("UPDATE conversation_jobs SET state='SUPERSEDED',reason='newer_customer_message' WHERE account_id=? AND thread_id=? AND state IN('RECEIVED','AI_RETRY','GENERATING','SEND_PENDING')").run(a,id);
   this.store.db.prepare("UPDATE conversation_deliveries SET state='cancelled',updated_at=? WHERE state='queued' AND job_id IN(SELECT id FROM conversation_jobs WHERE account_id=? AND thread_id=? AND state='SUPERSEDED')").run(Date.now(),a,id);
   const job=randomUUID();
   this.store.db.prepare(`INSERT INTO conversation_jobs(id,account_id,campaign_id,number_id,thread_id,event_key,digest,sequence,privacy_epoch,session_id,number_epoch,campaign_epoch,publication_version,input_cipher,recipient_cipher,state,next_attempt_at,created_at,expires_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'RECEIVED',?,?,?)`).run(job,a,campaign.id,n,id,event,digest,current.sequence,current.privacy_epoch,input.sessionId,input.epoch,campaign.execution_epoch,pub.version,encryptServerSecret(input.text),encryptServerSecret(input.customerId),Date.now(),Date.now(),Date.now()+86400000);
   if(current.memory_enabled)this.memory.inbound(a,id,Number(current.sequence),input.text);
   return {id:job,duplicate:false};
  });
 }
 guard(job:any,grant:AdapterGrant){
  ensure(job.account_id===grant.accountId&&job.number_id===grant.numberId,'Job ownership mismatch',404);
  const number=this.session(grant,job.session_id,job.number_epoch),campaign=this.store.owned(job.account_id,job.campaign_id);
  const thread=this.store.db.prepare('SELECT * FROM conversation_threads WHERE account_id=? AND id=?').get(job.account_id,job.thread_id)!;
  ensure(number.campaign_id===job.campaign_id&&campaign.lifecycle==='active'&&campaign.execution_epoch===job.campaign_epoch&&campaign.published_version===job.publication_version,'Campaign routing or publication changed',409);
  ensure(thread.sequence===job.sequence&&thread.privacy_epoch===job.privacy_epoch&&job.expires_at>Date.now(),'Conversation was superseded, reset or expired',409);
  ensure(new CampaignPublications(this.store).read(job.account_id,job.campaign_id)?.snapshot.config.enabled===true,'Campaign AI replies are paused');
 }
 alert(job:any,category:string){this.store.db.prepare('INSERT INTO conversation_alerts(job_id,account_id,campaign_id,category,created_at) VALUES(?,?,?,?,?) ON CONFLICT(job_id) DO UPDATE SET category=excluded.category,resolved_at=NULL').run(job.id,job.account_id,job.campaign_id,category,Date.now());}
 recover(){
  this.memory.prune();
  return this.store.transaction(()=>{
   const interrupted=this.store.db.prepare("SELECT * FROM conversation_jobs WHERE state IN('GENERATING','SENDING') AND lease_until<=?").all(Date.now());
   for(const job of interrupted){
    this.store.db.prepare("UPDATE conversation_jobs SET state='UNKNOWN',reason=?,lease_token=NULL,lease_until=NULL WHERE id=?").run(job.state==='SENDING'?'delivery_receipt_required':'generation_completion_unknown',job.id);
    this.store.db.prepare("UPDATE conversation_deliveries SET state='unknown',updated_at=? WHERE job_id=? AND state='inflight'").run(Date.now(),job.id);
    this.alert(job,job.state==='SENDING'?'delivery_receipt_required':'generation_completion_unknown');
   }
   this.store.db.prepare("UPDATE conversation_jobs SET lease_token=NULL,lease_until=NULL WHERE state='SUPERSEDED' AND lease_until<=?").run(Date.now());
   return {interrupted:interrupted.length};
  });
 }
 claim(grant:AdapterGrant):any{
  this.recover();
  return this.store.transaction(()=>{
   const job=this.store.db.prepare(`SELECT j.* FROM conversation_jobs j WHERE j.account_id=? AND j.number_id=? AND j.state IN('RECEIVED','AI_RETRY') AND j.next_attempt_at<=?
    AND NOT EXISTS(SELECT 1 FROM conversation_jobs b WHERE b.account_id=j.account_id AND b.thread_id=j.thread_id AND ((b.lease_token IS NOT NULL AND b.lease_until>?) OR b.state IN('SENDING','UNKNOWN')))
    AND (SELECT count(*) FROM conversation_jobs b WHERE b.account_id=j.account_id AND b.lease_token IS NOT NULL AND b.lease_until>?)<2 ORDER BY j.created_at,j.sequence LIMIT 1`).get(grant.accountId,grant.numberId,Date.now(),Date.now(),Date.now());
   if(!job)return null;
   try{this.guard(job,grant);}catch{this.store.db.prepare("UPDATE conversation_jobs SET state='BLOCKED',reason='context_revalidation_required' WHERE id=?").run(job.id);this.alert(job,'context_revalidation_required');return null;}
   const lease=randomUUID();this.store.db.prepare("UPDATE conversation_jobs SET state='GENERATING',attempts=attempts+1,lease_token=?,lease_until=? WHERE id=?").run(lease,Date.now()+90000,job.id);
   return this.owned(grant.accountId,String(job.id));
  });
 }
}
