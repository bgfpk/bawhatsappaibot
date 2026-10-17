import { randomUUID } from 'node:crypto';
import { ensure,now } from '../campaigns/contracts';
import type { AdapterGrant } from './contracts';
import { NumberSessions } from './sessions';

// Durable boundaries for future inbound -> Gemini -> delivery. This module
// never calls an AI provider, opens a socket, pairs a number or sends a message.
export class NumberMessageGuards {
  constructor(readonly sessions:NumberSessions) {}
  record(grant:AdapterGrant,input:{direction:'inbound'|'outbound';providerMessageId:string;sessionId:string;epoch:number;digest:string}) {
    const {numbers}=this.sessions,a=grant.accountId,n=grant.numberId;this.sessions.verify(grant,a,n);
    ensure(input.providerMessageId.length>0&&input.providerMessageId.length<=200&&/^[a-f0-9]{64}$/.test(input.digest),'Invalid message identity',422);
    return numbers.store.transaction(()=>{
      const prior=numbers.store.db.prepare('SELECT * FROM number_message_guards WHERE account_id=? AND number_id=? AND direction=? AND provider_message_id=?')
        .get(a,n,input.direction,input.providerMessageId);
      if(prior){ensure(prior.digest===input.digest,'Message identity conflict');return {id:prior.id,duplicate:true,state:prior.state};}
      const row=numbers.owned(a,n);
      ensure(row.session_id===input.sessionId&&row.session_epoch===input.epoch&&!row.session_ended_at&&row.connection_state==='connected'
        &&row.authorization_reference===grant.reference&&row.adapter_id===grant.adapterId&&row.lease_until>Date.now(),'Message belongs to an unavailable or stale session');
      ensure(row.campaign_id,'Assign this number to a campaign before processing messages');
      const campaign=numbers.store.owned(a,row.campaign_id);
      const reason=campaign.lifecycle!=='active'?'campaign_not_active':!campaign.published_version?'campaign_unpublished':'live_processing_not_authorized';
      const id=randomUUID();
      numbers.store.db.prepare(`INSERT INTO number_message_guards(account_id,number_id,id,direction,provider_message_id,campaign_id,session_id,epoch,publication_version,campaign_epoch,digest,state,reason,created_at)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,'held',?,?)`)
        .run(a,n,id,input.direction,input.providerMessageId,row.campaign_id,input.sessionId,input.epoch,campaign.published_version??null,campaign.execution_epoch,input.digest,reason,now());
      return {id,duplicate:false,state:'held'};
    });
  }
  uncertain(account:string,id:string) {
    const {numbers}=this.sessions;numbers.owned(account,id);
    // On recovery, an ambiguous delivery stays uncertain and can never be
    // treated as an automatically retryable outbound send.
    numbers.store.db.prepare("UPDATE number_message_guards SET state='uncertain',reason='receipt_reconciliation_required' WHERE account_id=? AND number_id=? AND direction='outbound' AND state='held'").run(account,id);
  }
}
