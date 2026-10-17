import { CampaignStore } from '../campaigns/store';
import { ensure } from '../campaigns/contracts';
import { NumberSessions } from '../numbers/sessions';
import type { AdapterGrant } from '../numbers/contracts';
import { GeminiProvider } from '../gemini/provider';
import { createBotWorkerLifecycleManager } from '../services/bot-worker-lifecycle-service';
import { ConnectionState } from './state';
import { NumberConnectionWorker } from './worker';
import { baileysConnectionFactory,type ConnectionFactory } from './baileys';
export class ConnectionEngine {
 readonly state:ConnectionState;readonly workers=new Map<string,NumberConnectionWorker>();readonly grants=new Map<string,AdapterGrant>();readonly spawning=new Set<string>();
 readonly lifecycle:ReturnType<typeof createBotWorkerLifecycleManager>;timer?:ReturnType<typeof setInterval>;
 constructor(readonly store:CampaignStore,readonly sessions:NumberSessions,readonly factory:ConnectionFactory=baileysConnectionFactory(),readonly activated:(g:AdapterGrant)=>boolean=()=>false,readonly provider?:GeminiProvider,lifecycleClock?:()=>number){
  this.state=new ConnectionState(store,sessions);this.state.recover();
  this.lifecycle=createBotWorkerLifecycleManager({listBots:async()=>this.records(),getBotById:async id=>this.records().find(r=>r.id===id),isEligible:r=>this.eligible(r),
   spawnWorker:async(id)=>{const g=this.grants.get(id);ensure(g,'Authorization is required',403);await this.start(g,this.sessions.numbers.owned(g.accountId,g.numberId).revision);},
   isWorkerActive:id=>this.workers.has(id),isWorkerSpawning:id=>this.spawning.has(id),nowMs:lifecycleClock,logger:{log(){},warn(){},error(){}}});
 }
 permit(grant:AdapterGrant){
  this.sessions.verify(grant,grant.accountId,grant.numberId);
  ensure(this.activated(grant),'Separate owner activation approval is required',403);
  ensure(this.factory.mode===(grant.mode==='synthetic'?'synthetic':'verified'),'Transport authorization mode mismatch',403);
  ensure(grant.mode!=='synthetic'||process.env.BLACKARROW_DISPOSABLE_TEST==='1','Synthetic sessions require disposable storage',403);
 }
 private records(){return this.store.db.prepare('SELECT account_id,account_id user_id,number_id id,desired,paired,phase,retry_at FROM number_engine_state').all()as any[];}
 private eligible(row:any){
  if(!row?.desired||!row.paired||row.retry_at>Date.now()||!['repairing','disconnected','connected'].includes(row.phase))return false;
  const g=this.grants.get(row.id);if(!g||g.accountId!==row.account_id)return false;
  try{this.permit(g);const n=this.sessions.numbers.owned(g.accountId,g.numberId),r=this.state.row(g.accountId,g.numberId);return !n.removed_at&&!!n.campaign_id&&!n.session_ended_at&&r.epoch===n.session_epoch&&r.session_id===n.session_id;}catch{return false;}
 }
 async start(grant:AdapterGrant,revision:number){
  this.permit(grant);const key=grant.numberId;ensure(!this.workers.has(key)&&!this.spawning.has(key),'A number worker is already active',409);
  const number=this.sessions.numbers.owned(grant.accountId,key,revision);ensure(number.campaign_id,'Assign a campaign before pairing',422);
  const r=this.state.row(grant.accountId,key);ensure(r.retry_at<=Date.now(),'Connection recovery is backing off',409);
  this.spawning.add(key);this.grants.set(key,grant);
  try{
   const bound=this.sessions.begin(grant,revision),session=bound.session!.id,epoch=bound.session!.epoch;this.state.bind(grant,session,epoch);
   const worker=new NumberConnectionWorker(this.state,grant,session,epoch,this.factory,()=>this.permit(grant),reason=>{
    this.workers.delete(key);
    try{const current=this.state.row(grant.accountId,key);
    if(current.session_id===session&&current.epoch===epoch&&current.desired&&['connected','connecting','qr_required'].includes(current.phase))this.state.store.db.prepare("UPDATE number_engine_state SET phase='repairing',qr_cipher='',qr_expires_at=NULL,reason=? WHERE account_id=? AND number_id=?").run(reason,grant.accountId,key);}catch{/* Removed records remain fenced. */}
    void this.lifecycle.handleWorkerExit(key);
   },this.provider);
   this.workers.set(key,worker);await worker.start();this.lifecycle.noteWorkerSpawned(key);this.lifecycle.clearIntentionalStop(key);return worker;
  }catch(error){const w=this.workers.get(key);w?.close('socket_start_failed');this.workers.delete(key);throw error;}finally{this.spawning.delete(key);}
 }
 stop(account:string,number:string,revision:number,reset=false){
  this.sessions.numbers.owned(account,number,revision);this.lifecycle.markIntentionalStop(number,'owner_disconnected');
  this.state.clear(account,number,reset?'repairing':'disconnected',reset?'owner_pairing_reset':'owner_disconnected',reset);
  this.workers.get(number)?.close('owner_disconnected');this.grants.delete(number);
  return this.sessions.disconnect(account,number,revision);
 }
 registerAuthorization(grant:AdapterGrant){this.permit(grant);this.grants.set(grant.numberId,grant);}
 async request(account:string,number:string,revision:number){
  this.sessions.numbers.owned(account,number,revision);const grant=this.grants.get(number);ensure(grant&&grant.accountId===account&&grant.mode==='verified','Verified platform authorization and separate owner activation approval are required.',403);
  if(!this.workers.has(number))await this.start(grant,revision);return this.readiness(account,number);
 }
 readiness(account:string,number:string){
  const status=this.state.view(account,number);
  let eligible=false;const g=this.grants.get(number);if(g?.accountId===account&&g.mode==='verified'){try{this.permit(g);eligible=true;}catch{}}
  return {...status,revision:this.sessions.numbers.owned(account,number).revision,phase:!eligible&&status.phase==='connected'?'disconnected':status.phase,live:status.live&&eligible,qr:eligible?status.qr:null,qrExpiresAt:eligible?status.qrExpiresAt:null,connectionEligible:eligible,activationRequired:!eligible,blocker:eligible?null:'Verified platform authorization, an eligible transport and separate owner activation approval are required.'};
 }
 maintain(){
  this.store.db.prepare("UPDATE number_engine_state SET qr_cipher='',qr_expires_at=NULL,phase='repairing',reason='qr_expired' WHERE qr_expires_at<=?").run(Date.now());
  for(const worker of this.workers.values())worker.tick();
  void this.lifecycle.restoreActiveLinkedWorkers('watchdog_restore').catch(()=>{});
 }
 runMaintenance(){if(!this.timer){this.timer=setInterval(()=>{try{this.maintain();}catch{console.error('[Black Arrow] Connection maintenance failed');}},5000);this.timer.unref();}}
 dispose(){if(this.timer)clearInterval(this.timer);for(const id of this.grants.keys())this.lifecycle.markIntentionalStop(id);for(const w of this.workers.values())w.close('runtime_stopped');this.workers.clear();this.grants.clear();}
}
const engines=new WeakMap<CampaignStore,ConnectionEngine>();
export function installConnectionEngine(store:CampaignStore,sessions:NumberSessions){let engine=engines.get(store);if(!engine){engine=new ConnectionEngine(store,sessions);engine.runMaintenance();engines.set(store,engine);}return engine;}
