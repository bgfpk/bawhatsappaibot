import { createHash,randomUUID } from 'node:crypto';
import { CampaignStore } from '../campaigns/store';
import { ensure,now } from '../campaigns/contracts';
import { encryptServerSecret } from '../services/secret-crypto-service';
import { createNumber,numberName } from './contracts';

export class NumberRepository {
  constructor(readonly store:CampaignStore) {
    store.transaction(()=>{
      const interrupted=store.db.prepare("SELECT account_id,number_id FROM number_connection_sessions WHERE state IN('connected','pending') AND ended_at IS NULL").all();
      for(const row of interrupted){this.fence(String(row.account_id),String(row.number_id),'process_restart_revalidation_required');
        store.db.prepare("UPDATE number_connection_sessions SET state='unavailable' WHERE account_id=? AND number_id=? AND reason='process_restart_revalidation_required'").run(row.account_id,row.number_id);}
    });
  }
  owned(account:string,id:string,revision?:number,allowRemoved=false):any {
    const row=this.store.db.prepare(`SELECT p.*,a.campaign_id,c.name campaign_name,
      s.id session_id,s.state connection_state,s.epoch connection_epoch,s.ended_at session_ended_at,s.reason connection_reason,
      s.adapter_id,s.authorization_reference,s.synthetic,s.authorization_expires_at,s.lease_until
      FROM number_profiles p LEFT JOIN campaign_number_assignments a ON a.account_id=p.account_id AND a.number_id=p.number_id
      LEFT JOIN campaign_workspaces c ON c.account_id=a.account_id AND c.id=a.campaign_id
      LEFT JOIN number_connection_sessions s ON s.rowid=(SELECT rowid FROM number_connection_sessions
        WHERE account_id=p.account_id AND number_id=p.number_id ORDER BY rowid DESC LIMIT 1)
      WHERE p.account_id=? AND p.number_id=?`).get(account,id) as any;
    ensure(row&&(!row.removed_at||allowRemoved),'Number not found',404);
    if(revision!==undefined)ensure(row.revision===revision,'This number changed. Reload before saving.');
    return row;
  }
  safe(row:any) {
    const expired=['connected','pending'].includes(row.connection_state)&&(!row.authorization_expires_at||row.authorization_expires_at<=Date.now()||!row.lease_until||row.lease_until<=Date.now());
    const engine=this.store.db.prepare('SELECT phase,session_id FROM number_engine_state WHERE account_id=? AND number_id=?').get(row.account_id,row.number_id);
    const live=Boolean(!row.synthetic&&!expired&&row.connection_state==='connected'&&!row.session_ended_at&&engine?.phase==='connected'&&engine.session_id===row.session_id);
    return {id:row.number_id,name:row.name,maskedIdentity:row.masked_identity,revision:row.revision,
      campaignId:row.campaign_id??null,campaignName:row.campaign_name??null,
      status:row.removed_at?'revoked':(row.synthetic&&row.connection_state==='connected')||expired?'unavailable':row.connection_state??'disconnected',reason:expired?'connection_revalidation_required':row.connection_reason??null,
      session:row.session_id?{id:row.session_id,epoch:row.connection_epoch,synthetic:Boolean(row.synthetic)}:null,
      removedAt:row.removed_at,recoverUntil:row.recover_until,qrAvailable:false,liveTransport:live};
  }
  list(account:string,campaign?:string,removed=false) {
    if(campaign)this.store.owned(account,campaign);
    return this.store.db.prepare(`SELECT number_id FROM number_profiles p WHERE account_id=? AND ${removed?'removed_at IS NOT NULL':'removed_at IS NULL'}
      AND (?='' OR EXISTS(SELECT 1 FROM campaign_number_assignments a WHERE a.account_id=p.account_id AND a.number_id=p.number_id AND a.campaign_id=?))
      ORDER BY name COLLATE NOCASE,number_id LIMIT 200`).all(account,campaign||'',campaign||'').map(r=>this.safe(this.owned(account,String(r.number_id),undefined,true)));
  }
  audit(account:string,id:string,action:string,metadata:object={}) {
    this.store.db.prepare('INSERT INTO number_management_audit(account_id,number_id,action,metadata,created_at) VALUES(?,?,?,?,?)').run(account,id,action,JSON.stringify(metadata),now());
  }
  fence(account:string,id:string,reason:string) {
    this.store.db.prepare("UPDATE number_connection_sessions SET state='revoked',reason=?,ended_at=?,updated_at=? WHERE account_id=? AND number_id=? AND ended_at IS NULL").run(reason,now(),now(),account,id);
    this.store.db.prepare("UPDATE number_message_guards SET state=CASE WHEN state='uncertain' THEN state ELSE 'held' END,reason=? WHERE account_id=? AND number_id=? AND state<>'confirmed'").run(reason,account,id);
    this.store.db.prepare('UPDATE number_profiles SET revision=revision+1,session_epoch=session_epoch+1,updated_at=? WHERE account_id=? AND number_id=?').run(now(),account,id);
  }
  private touch(account:string,campaign:string|null) {
    if(!campaign)return;
    this.store.db.prepare('UPDATE campaign_workspaces SET execution_epoch=execution_epoch+1,work_hold=1 WHERE account_id=? AND id=?').run(account,campaign);
    this.store.bump(account,campaign,'number_assignment_changed',{work:'held_for_revalidation'});
  }
  private assignment(account:string,id:string,from:string|null,to:string|null,reason:string) {
    this.fence(account,id,reason);
    this.store.db.prepare('DELETE FROM campaign_number_assignments WHERE account_id=? AND number_id=?').run(account,id);
    if(to)this.store.db.prepare('INSERT INTO campaign_number_assignments VALUES(?,?,?,?)').run(account,id,to,now());
    this.store.db.prepare('INSERT INTO number_assignment_history(account_id,number_id,from_campaign,to_campaign,epoch,reason,created_at) VALUES(?,?,?,?,?,?,?)')
      .run(account,id,from,to,this.owned(account,id,undefined,true).session_epoch,reason,now());
    this.touch(account,from);if(to!==from)this.touch(account,to);
  }
  create(account:string,input:unknown) {
    const v=createNumber.parse(input),id=randomUUID();
    return this.store.transaction(()=>{
      const creationDigest=createHash('sha256').update(JSON.stringify(v)).digest('hex');
      const previous=this.store.db.prepare('SELECT number_id,creation_digest FROM number_profiles WHERE account_id=? AND creation_key=?').get(account,v.requestId);
      if(previous){ensure(previous.creation_digest===creationDigest,'This creation request was reused with different details.');return this.safe(this.owned(account,String(previous.number_id),undefined,true));}
      if(v.campaignId)this.store.owned(account,v.campaignId,true);
      const digest=v.phone?createHash('sha256').update(account+'\0'+v.phone).digest('hex'):null;
      ensure(!digest||!this.store.db.prepare('SELECT number_id FROM number_profiles WHERE account_id=? AND identity_digest=? AND removed_at IS NULL').get(account,digest),'This number already has a saved record.');
      this.store.db.prepare('INSERT OR IGNORE INTO campaign_accounts VALUES(?)').run(account);
      this.store.db.prepare("INSERT INTO campaign_number_registry VALUES(?,?,'disconnected')").run(account,id);
      this.store.db.prepare('INSERT INTO number_profiles(account_id,number_id,name,encrypted_identity,identity_digest,masked_identity,creation_key,creation_digest,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(account,id,v.name,v.phone?encryptServerSecret(v.phone):'',digest,v.phone?'••••'+v.phone.slice(-4):'',v.requestId,creationDigest,now(),now());
      this.audit(account,id,'created');
      if(v.campaignId)this.assignment(account,id,null,v.campaignId,'assigned');
      return this.safe(this.owned(account,id));
    });
  }
  rename(account:string,id:string,revision:number,name:string) {
    const value=numberName.parse(name);
    return this.store.transaction(()=>{this.owned(account,id,revision);
      this.store.db.prepare('UPDATE number_profiles SET name=?,revision=revision+1,updated_at=? WHERE account_id=? AND number_id=?').run(value,now(),account,id);
      this.audit(account,id,'renamed');return this.safe(this.owned(account,id));});
  }
  assign(account:string,id:string,revision:number,from:string|null,to:string|null,confirmation:string) {
    return this.store.transaction(()=>{
      const row=this.owned(account,id,revision);ensure((row.campaign_id??null)===from,'Assignment changed. Reload before moving this number.');
      ensure(from!==to,'Select a different campaign or unassign this number.',422);
      if(to)this.store.owned(account,to,true);
      ensure(confirmation===row.name,'Confirm the number name before changing its campaign.',422);
      this.assignment(account,id,from,to,to?'assigned_or_reassigned':'unassigned');
      this.audit(account,id,'assignment_changed',{from,to,oldSession:'revoked',work:'held'});return this.safe(this.owned(account,id));
    });
  }
  remove(account:string,id:string,revision:number,confirmation:string) {
    return this.store.transaction(()=>{
      const row=this.owned(account,id,revision);ensure(confirmation===row.name,'Type the number name to confirm removal.',422);
      this.assignment(account,id,row.campaign_id??null,null,'number_removed');
      this.store.db.prepare('UPDATE number_profiles SET removed_at=?,recover_until=? WHERE account_id=? AND number_id=?')
        .run(now(),new Date(Date.now()+30*86400000).toISOString(),account,id);
      this.store.db.prepare("UPDATE campaign_number_registry SET status='removed' WHERE account_id=? AND id=?").run(account,id);
      this.audit(account,id,'removed');return this.safe(this.owned(account,id,undefined,true));
    });
  }
  restore(account:string,id:string,revision:number) {
    return this.store.transaction(()=>{
      const row=this.owned(account,id,revision,true);ensure(row.removed_at&&Date.parse(row.recover_until)>Date.now(),'This number is outside its recovery window.');
      ensure(!row.identity_digest||!this.store.db.prepare('SELECT number_id FROM number_profiles WHERE account_id=? AND identity_digest=? AND removed_at IS NULL').get(account,row.identity_digest),'A current record already uses this number.');
      this.fence(account,id,'restored_disconnected');
      this.store.db.prepare('UPDATE number_profiles SET removed_at=NULL,recover_until=NULL WHERE account_id=? AND number_id=?').run(account,id);
      this.store.db.prepare("UPDATE campaign_number_registry SET status='disconnected' WHERE account_id=? AND id=?").run(account,id);
      const current=this.owned(account,id);
      this.store.db.prepare("INSERT INTO number_connection_sessions(account_id,number_id,id,epoch,state,reason,created_at,updated_at) VALUES(?,?,?,?,'disconnected','restored_unassigned',?,?)")
        .run(account,id,randomUUID(),current.session_epoch,now(),now());
      this.audit(account,id,'restored_unassigned');return this.safe(this.owned(account,id));
    });
  }
}
