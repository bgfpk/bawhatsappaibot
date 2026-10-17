import { randomUUID } from 'node:crypto';
import { ensure } from '../campaigns/contracts';
import type { AdapterGrant } from '../numbers/contracts';
import { CampaignConversationGenerator } from '../conversation/generation';
import { ConversationPipeline } from '../conversation/pipeline';
import { GeminiProvider } from '../gemini/provider';
import { buildRetryDelayMs } from '../services/ai-retry-schedule-service';
import { ConnectionState } from './state';
import { encryptedAuth } from './auth';
import { SocketDelivery } from './delivery';
import { incomingMessages } from './incoming';
import type { ConnectionFactory,SocketHandle } from './baileys';
/** Adapted bot-worker notify orchestration. No CRM, orders, startup sweeps or canned replies. */
export class NumberConnectionWorker {
 readonly delivery:SocketDelivery;readonly pipeline:ConversationPipeline;
 handle?:SocketHandle;open=false;closed=false;sequence=0;queue=Promise.resolve();pumping?:Promise<void>;
 private heartbeatAt=0;
 constructor(readonly state:ConnectionState,readonly grant:AdapterGrant,readonly session:string,readonly epoch:number,readonly factory:ConnectionFactory,readonly permit:()=>void,readonly exited:(reason:string)=>void,provider?:GeminiProvider){
  this.delivery=new SocketDelivery(state,grant,session,epoch,()=>this.handle?.socket,()=>this.open,this.permit);
  this.pipeline=new ConversationPipeline(state.store,state.sessions,new CampaignConversationGenerator(state.store,provider,()=>{this.permit();return true;}),this.delivery,()=>{this.permit();return true;});
 }
 private enqueue(work:()=>Promise<void>|void){
  this.queue=this.queue.then(async()=>{if(this.closed)return;this.permit();this.state.guard(this.grant,this.session,this.epoch);await work();}).catch(()=>{if(!this.closed)this.close('session_revalidation_required');});
 }
 async start(){
  this.permit();ensure((this.grant.mode==='synthetic')===(this.factory.mode==='synthetic'),'Transport and grant mode mismatch',403);
  const auth=encryptedAuth(this.state,this.grant,this.session,this.epoch,await this.factory.codec());await auth.saveCreds();this.permit();
  this.handle=await this.factory.open({permit:this.permit,auth:auth.state,saveCreds:auth.saveCreds,connection:event=>{
   if(event.connection==='close')this.open=false;
   this.enqueue(async()=>{
    if(event.localError){this.close('auth_persistence_failed');return;}
    if(event.qr){this.state.qr(this.grant,this.session,this.epoch,String(event.qr));return;}
    if(event.connection==='connecting'){this.state.phase(this.grant,this.session,this.epoch,'connecting');return;}
    if(event.connection==='open'){
     ensure(this.handle?.socket.user?.id,'Transport has not verified its own identity',409);
     this.state.identity(this.grant,this.session,this.epoch,this.handle!.socket.user!.id);this.open=true;
     this.event('connected');this.state.phase(this.grant,this.session,this.epoch,'connected');
     const jobs=this.state.store.db.prepare("SELECT id FROM conversation_jobs WHERE account_id=? AND number_id=? AND state IN('RECEIVED','AI_RETRY','SEND_PENDING','BLOCKED') AND lease_token IS NULL ORDER BY created_at LIMIT 100").all(this.grant.accountId,this.grant.numberId);
     for(const job of jobs){try{this.pipeline.revalidatePending(this.grant.accountId,String(job.id),this.grant,this.session,this.epoch);}catch{/* Changed campaign/publication remains held. */}}
     this.pump();return;
    }
    if(event.connection==='close'){
     const code=event.lastDisconnect?.error?.output?.statusCode;
     if(code===401){this.state.clear(this.grant.accountId,this.grant.numberId,'repairing','pairing_revoked',true);this.close('pairing_revoked');return;}
     this.event('disconnected');this.state.phase(this.grant,this.session,this.epoch,'repairing','connection_closed');
     const r=this.state.row(this.grant.accountId,this.grant.numberId),count=Math.min(8,r.retry_count+1);
     this.state.store.db.prepare('UPDATE number_engine_state SET retry_count=?,retry_at=? WHERE account_id=? AND number_id=?').run(count,Date.now()+buildRetryDelayMs(count-1),this.grant.accountId,this.grant.numberId);
     this.close('connection_closed');
    }
   });
  },getMessage:key=>this.delivery.getMessage(key)});
  this.handle.socket.ev.on('messages.upsert',this.incoming);this.handle.socket.ev.on('messages.update',this.receipts);
 }
 private event(state:'connected'|'disconnected'|'pending'){
  this.state.sessions.event(this.grant,{id:randomUUID(),sessionId:this.session,epoch:this.epoch,sequence:++this.sequence,state});this.heartbeatAt=Date.now();
 }
 private incoming=(event:any)=>this.enqueue(async()=>{
  if(!this.open)return;
  const messages=await incomingMessages(event,async jid=>{
   // Device aliases normalize locally. LID resolution is accepted only from the authenticated socket repository.
   const normalized=jid.replace(/:\d+@/,'@'),socket=this.handle?.socket as any;
   if(normalized.endsWith('@lid')&&socket?.signalRepository?.lidMapping?.getPNForLID){const pn=await socket.signalRepository.lidMapping.getPNForLID(normalized);if(/^\d+@s\.whatsapp\.net$/.test(pn||''))return pn;}
   return normalized;
  });
  for(const message of messages){this.pipeline.ingest(this.grant,{...message,sessionId:this.session,epoch:this.epoch});}
  this.pump();
 });
 private receipts=(event:any)=>this.enqueue(()=>this.delivery.receipt(event,this.pipeline));
 pump(){
  if(this.pumping||this.closed||!this.open)return;
  this.pumping=(async()=>{
   for(let i=0;i<5&&this.open&&!this.closed;i++){
    this.permit();this.state.guard(this.grant,this.session,this.epoch);
    const generated=await this.pipeline.processNext(this.grant);
    const pending=this.state.store.db.prepare("SELECT id FROM conversation_jobs WHERE account_id=? AND number_id=? AND state='SEND_PENDING' AND next_attempt_at<=? ORDER BY created_at LIMIT 1").get(this.grant.accountId,this.grant.numberId,Date.now());
    if(pending)await this.pipeline.deliver(this.grant.accountId,String(pending.id),this.grant);
    if(!generated&&!pending)break;
   }
  })().catch(()=>{if(!this.closed)this.close('worker_revalidation_required');}).finally(()=>{this.pumping=undefined;});
 }
 tick(){
  if(this.closed)return;try{
   this.permit();this.state.guard(this.grant,this.session,this.epoch);
   if(Date.now()-this.heartbeatAt>15000){this.state.sessions.heartbeat(this.grant,this.session,this.epoch);this.heartbeatAt=Date.now();}
   this.pump();
  }catch{this.close('lease_or_authorization_expired');}
 }
 async idle(){await this.queue;await this.pumping;await this.queue;}
 close(reason:string){
  if(this.closed)return;
  try{this.state.guard(this.grant,this.session,this.epoch);const n=this.state.sessions.numbers.owned(this.grant.accountId,this.grant.numberId);if(['pending','connected'].includes(n.connection_state))this.event('disconnected');}catch{/* A newer session already fenced this socket. */}
  this.closed=true;this.open=false;
  if(this.handle){this.handle.socket.ev.off('messages.upsert',this.incoming);this.handle.socket.ev.off('messages.update',this.receipts);this.handle.dispose();}
  this.exited(reason);
 }
}
