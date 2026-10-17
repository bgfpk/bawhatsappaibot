import { randomUUID,createHash } from 'node:crypto';
import { ensure,now } from '../campaigns/contracts';
import { normalizeBaileysConnectionStatus } from '../services/baileys-transport-normalizer';
import { NumberRepository } from './repository';
import { denyLiveAdapters,type AdapterGrant,type GrantVerifier,type ConnectionState } from './contracts';

export class NumberSessions {
  constructor(readonly numbers:NumberRepository,readonly verifier:GrantVerifier=denyLiveAdapters) {}
  heartbeat(grant:AdapterGrant,session:string,epoch:number){
    this.verify(grant,grant.accountId,grant.numberId);
    const n=this.numbers.owned(grant.accountId,grant.numberId);
    ensure(n.session_id===session&&n.session_epoch===epoch&&!n.session_ended_at&&n.lease_until>Date.now()&&n.authorization_reference===grant.reference&&n.adapter_id===grant.adapterId,'Stale connection heartbeat',409);
    this.numbers.store.db.prepare('UPDATE number_connection_sessions SET lease_until=?,updated_at=? WHERE account_id=? AND number_id=? AND id=?')
      .run(Math.min(grant.expiresAt,Date.now()+60000),now(),grant.accountId,grant.numberId,session);
  }
  verify(grant:AdapterGrant,account:string,number:string) {
    ensure(grant.accountId===account&&grant.numberId===number&&grant.expiresAt>Date.now()
      &&this.verifier(grant)&&(grant.mode!=='synthetic'||process.env.BLACKARROW_DISPOSABLE_TEST==='1'),
      'A verified platform authorization and explicit owner transport approval are required.',403);
  }
  request(account:string,id:string,revision:number) {
    return this.numbers.store.transaction(()=>{
      this.numbers.owned(account,id,revision);this.numbers.fence(account,id,'new_connection_request');
      const row=this.numbers.owned(account,id),session=randomUUID();
      this.numbers.store.db.prepare(`INSERT INTO number_connection_sessions(account_id,number_id,id,epoch,state,reason,created_at,updated_at)
        VALUES(?,?,?,?,'unavailable','platform_authorization_required',?,?)`).run(account,id,session,row.session_epoch,now(),now());
      this.numbers.audit(account,id,'qr_connection_requested',{result:'unavailable',qrProduced:false});
      return this.numbers.safe(this.numbers.owned(account,id));
    });
  }
  disconnect(account:string,id:string,revision:number) {
    return this.numbers.store.transaction(()=>{
      this.numbers.owned(account,id,revision);this.numbers.fence(account,id,'owner_disconnected');
      const row=this.numbers.owned(account,id);
      this.numbers.store.db.prepare(`INSERT INTO number_connection_sessions(account_id,number_id,id,epoch,state,reason,created_at,updated_at,ended_at)
        VALUES(?,?,?,?,'revoked','owner_disconnected',?,?,?)`).run(account,id,randomUUID(),row.session_epoch,now(),now(),now());
      this.numbers.audit(account,id,'disconnected');return this.numbers.safe(this.numbers.owned(account,id));
    });
  }
  // Trusted adapter port only: no HTTP route accepts a grant, socket, QR or mock event.
  begin(grant:AdapterGrant,revision:number) {
    const a=grant.accountId,n=grant.numberId;this.verify(grant,a,n);
    return this.numbers.store.transaction(()=>{
      this.numbers.owned(a,n,revision);this.numbers.fence(a,n,'authorized_session_started');
      const row=this.numbers.owned(a,n),id=randomUUID();
      this.numbers.store.db.prepare(`INSERT INTO number_connection_sessions(account_id,number_id,id,epoch,state,adapter_id,authorization_reference,synthetic,authorization_expires_at,lease_until,created_at,updated_at)
        VALUES(?,?,?,?,'pending',?,?,?,?,?,?,?)`).run(a,n,id,row.session_epoch,grant.adapterId,grant.reference,grant.mode==='synthetic'?1:0,grant.expiresAt,Math.min(grant.expiresAt,Date.now()+60000),now(),now());
      this.numbers.audit(a,n,'adapter_session_started',{synthetic:grant.mode==='synthetic'});
      return this.numbers.safe(this.numbers.owned(a,n));
    });
  }
  event(grant:AdapterGrant,input:{id:string;sessionId:string;epoch:number;sequence:number;state:ConnectionState}) {
    const a=grant.accountId,n=grant.numberId;this.verify(grant,a,n);
    ensure(['disconnected','pending','unavailable','connected','revoked'].includes(input.state)&&Number.isSafeInteger(input.sequence)&&input.sequence>0,'Invalid connection event',422);
    const digest=createHash('sha256').update(JSON.stringify(input)).digest('hex');
    return this.numbers.store.transaction(()=>{
      const prior=this.numbers.store.db.prepare('SELECT digest FROM number_adapter_events WHERE account_id=? AND number_id=? AND event_id=?').get(a,n,input.id);
      if(prior){ensure(prior.digest===digest,'Connection event identity conflict');return {duplicate:true};}
      const row=this.numbers.owned(a,n);
      ensure(row.session_id===input.sessionId&&row.session_epoch===input.epoch&&!row.session_ended_at&&row.authorization_reference===grant.reference&&row.adapter_id===grant.adapterId,'Stale or revoked connection session');
      const session=this.numbers.store.db.prepare('SELECT event_sequence FROM number_connection_sessions WHERE account_id=? AND number_id=? AND id=?').get(a,n,input.sessionId)!;
      ensure(input.sequence>Number(session.event_sequence),'Out-of-order connection event');
      this.numbers.store.db.prepare('INSERT INTO number_adapter_events VALUES(?,?,?,?,?,?,?,?)').run(a,n,input.id,input.sessionId,input.sequence,digest,input.state,now());
      this.numbers.store.db.prepare('UPDATE number_connection_sessions SET state=?,event_sequence=?,updated_at=?,ended_at=?,lease_until=? WHERE account_id=? AND number_id=? AND id=?')
        .run(input.state,input.sequence,now(),input.state==='revoked'?now():null,Math.min(grant.expiresAt,Date.now()+60000),a,n,input.sessionId);
      this.numbers.store.db.prepare('UPDATE number_profiles SET revision=revision+1,updated_at=? WHERE account_id=? AND number_id=?').run(now(),a,n);
      this.numbers.audit(a,n,'adapter_connection_event',{state:input.state,synthetic:grant.mode==='synthetic'});return {duplicate:false};
    });
  }
  baileysEvent(grant:AdapterGrant,event:{id:string;sessionId:string;epoch:number;sequence:number;connection:string}) {
    const normalized=normalizeBaileysConnectionStatus(event.connection);
    const state:ConnectionState=normalized==='connected'?'connected':normalized==='connecting'?'pending':normalized==='disconnected'?'disconnected':'unavailable';
    return this.event(grant,{id:event.id,sessionId:event.sessionId,epoch:event.epoch,sequence:event.sequence,state});
  }
}
