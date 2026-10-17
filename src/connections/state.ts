import { CampaignStore } from '../campaigns/store';
import { ensure } from '../campaigns/contracts';
import { NumberSessions } from '../numbers/sessions';
import type { AdapterGrant } from '../numbers/contracts';
import { encryptServerSecret,decryptServerSecret } from '../services/secret-crypto-service';
import { createHmac } from 'node:crypto';
export type Phase='unpaired'|'connecting'|'qr_required'|'connected'|'disconnected'|'repairing';
export class ConnectionState {
 constructor(readonly store:CampaignStore,readonly sessions:NumberSessions){}
 row(account:string,number:string):any {
  this.sessions.numbers.owned(account,number);
  this.store.db.prepare('INSERT OR IGNORE INTO number_engine_state(account_id,number_id,updated_at) VALUES(?,?,?)').run(account,number,Date.now());
  return this.store.db.prepare('SELECT * FROM number_engine_state WHERE account_id=? AND number_id=?').get(account,number);
 }
 guard(grant:AdapterGrant,sessionId:string,epoch:number){
  this.sessions.verify(grant,grant.accountId,grant.numberId);
  const n=this.sessions.numbers.owned(grant.accountId,grant.numberId),r=this.row(grant.accountId,grant.numberId);
  ensure(!n.removed_at&&n.session_id===sessionId&&n.session_epoch===epoch&&!n.session_ended_at&&n.authorization_reference===grant.reference&&n.adapter_id===grant.adapterId&&n.lease_until>Date.now()&&n.authorization_expires_at>Date.now(),'Connection session is stale or expired',409);
  ensure(r.session_id===sessionId&&r.epoch===epoch,'Connection worker was superseded',409);return r;
 }
 bind(grant:AdapterGrant,sessionId:string,epoch:number){
  this.row(grant.accountId,grant.numberId);
  this.store.db.prepare("UPDATE number_engine_state SET session_id=?,epoch=?,phase='connecting',desired=1,synthetic=?,qr_cipher='',qr_expires_at=NULL,reason=NULL,updated_at=? WHERE account_id=? AND number_id=?")
   .run(sessionId,epoch,+(grant.mode==='synthetic'),Date.now(),grant.accountId,grant.numberId);
 }
 phase(grant:AdapterGrant,session:string,epoch:number,phase:Phase,reason:string|null=null){
  this.guard(grant,session,epoch);
  this.store.db.prepare("UPDATE number_engine_state SET phase=?,qr_cipher='',qr_expires_at=NULL,reason=?,retry_count=CASE WHEN ?='connected' THEN 0 ELSE retry_count END,retry_at=CASE WHEN ?='connected' THEN 0 ELSE retry_at END,updated_at=? WHERE account_id=? AND number_id=?")
   .run(phase,reason,phase,phase,Date.now(),grant.accountId,grant.numberId);
 }
 qr(grant:AdapterGrant,session:string,epoch:number,value:string){
  this.guard(grant,session,epoch);ensure(value.length>0&&value.length<=16384,'Invalid pairing event',422);
  this.store.db.prepare("UPDATE number_engine_state SET phase='qr_required',qr_cipher=?,qr_expires_at=?,updated_at=? WHERE account_id=? AND number_id=?")
   .run(encryptServerSecret(JSON.stringify({account:grant.accountId,number:grant.numberId,session,value})),Math.min(Date.now()+60000,grant.expiresAt),Date.now(),grant.accountId,grant.numberId);
 }
 clear(account:string,number:string,phase:Phase,reason:string,reset=false){
  this.row(account,number);
  this.store.db.prepare("UPDATE number_engine_state SET phase=?,desired=0,session_id=NULL,epoch=NULL,qr_cipher='',qr_expires_at=NULL,auth_generation=auth_generation+?,reason=?,updated_at=? WHERE account_id=? AND number_id=?")
   .run(phase,+reset,reason,Date.now(),account,number);
  if(reset){this.store.db.prepare('UPDATE number_engine_state SET paired=0 WHERE account_id=? AND number_id=?').run(account,number);this.store.db.prepare('UPDATE number_engine_identity SET active=0 WHERE account_id=? AND number_id=?').run(account,number);}
 }
 identity(grant:AdapterGrant,session:string,epoch:number,self:string){
  const normalized=String(self||'').replace(/:\d+@/,'@');ensure(/^\d{7,15}@s\.whatsapp\.net$/.test(normalized),'Transport identity was not verified',409);
  const n=this.sessions.numbers.owned(grant.accountId,grant.numberId);
  if(n.encrypted_identity)ensure(decryptServerSecret(n.encrypted_identity).replace(/\D/g,'')===normalized.split('@')[0],'Paired identity does not match this number record',409);
  const secret=process.env.BLACKARROW_SECRET_ENCRYPTION_KEY;ensure(secret,'Encryption custody is required',503);
  const digest=createHmac('sha256',secret).update('whatsapp-identity:'+normalized).digest('hex');
  this.store.transaction(()=>{const r=this.guard(grant,session,epoch),prior=this.store.db.prepare('SELECT * FROM number_engine_identity WHERE identity_digest=? AND active=1').get(digest);
   ensure(!prior||prior.account_id===grant.accountId&&prior.number_id===grant.numberId,'This paired identity is unavailable',409);
   this.store.db.prepare('INSERT INTO number_engine_identity VALUES(?,?,?,?,1) ON CONFLICT(account_id,number_id,generation) DO UPDATE SET identity_digest=excluded.identity_digest,active=1').run(grant.accountId,grant.numberId,r.auth_generation,digest);
   this.store.db.prepare('UPDATE number_engine_state SET paired=1 WHERE account_id=? AND number_id=?').run(grant.accountId,grant.numberId);
  });
 }
 recover(){
  this.store.db.prepare("UPDATE number_engine_state SET phase=CASE WHEN phase='unpaired' THEN phase ELSE 'repairing' END,qr_cipher='',qr_expires_at=NULL,reason='restart_revalidation_required',updated_at=? WHERE phase IN('connecting','qr_required','connected')").run(Date.now());
 }
 view(account:string,number:string){
  const r=this.row(account,number),n=this.sessions.numbers.owned(account,number),valid=n.connection_state==='connected'&&n.lease_until>Date.now()&&n.authorization_expires_at>Date.now()&&!n.session_ended_at&&r.session_id===n.session_id;
  let phase:Phase=r.phase;const expired=r.qr_expires_at&&r.qr_expires_at<=Date.now();
  if(expired)phase='repairing';if(phase==='connected'&&!valid)phase='disconnected';if(r.synthetic)phase='unpaired';
  let qr:string|null=null;
  if(!r.synthetic&&phase==='qr_required'&&!expired&&r.qr_cipher){const v=JSON.parse(decryptServerSecret(r.qr_cipher));ensure(v.account===account&&v.number===number&&v.session===r.session_id,'Invalid pairing scope',409);qr=v.value;}
  return {phase,qr,qrExpiresAt:qr?r.qr_expires_at:null,synthetic:Boolean(r.synthetic),live:!r.synthetic&&phase==='connected'&&valid,reason:r.reason,retryAt:r.retry_at||null,authGeneration:r.auth_generation};
 }
}
