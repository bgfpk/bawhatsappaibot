import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createHash,randomBytes,randomUUID } from 'node:crypto';
import { CampaignStore } from '../campaigns/store';
import { CampaignPublications } from '../campaigns/publications';
import { emptyAssistant } from '../campaigns/contracts';
import { NumberRepository } from './repository';
import { NumberSessions } from './sessions';
import { NumberMessageGuards } from './message-guards';
import type { AdapterGrant } from './contracts';

process.env.BLACKARROW_STAGE='1';process.env.BLACKARROW_DISPOSABLE_TEST='1';
process.env.BLACKARROW_SECRET_ENCRYPTION_KEY=randomBytes(48).toString('hex');
const digest=(text:string)=>createHash('sha256').update(text).digest('hex');
function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blackarrow-numbers-')),file=path.join(dir,'fixture.sqlite'),store=new CampaignStore(file),numbers=new NumberRepository(store);
 const campaign=(account:string,name:string)=>{let c=store.create(account,{name,description:'',timezone:'UTC'});const p=new CampaignPublications(store);let s=p.save(account,c.id,c.revision,{...emptyAssistant,identity:name,instructions:'Published '+name,enabled:true});s=p.publish(account,c.id,s.campaign.revision);return s.campaign;};
 const a=campaign('alpha','First'),b=campaign('alpha','Second'),foreign=campaign('beta','Foreign');
 const add=(campaignId:string|null=a.id)=>numbers.create('alpha',{requestId:randomUUID(),name:'Disposable number',phone:'+15550001111',campaignId});
 return {dir,file,store,numbers,a,b,foreign,add,cleanup(){store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}
test('durable records, encrypted identities, multiple numbers, CAS and creation idempotency',()=>{
 const f=fixture();try{
  const input={requestId:randomUUID(),name:'First phone',phone:'+15550001111',campaignId:f.a.id};
  const first=f.numbers.create('alpha',input);assert.equal(first.status,'disconnected');assert.equal(first.maskedIdentity,'••••1111');
  assert.equal(f.numbers.create('alpha',input).id,first.id);assert.throws(()=>f.numbers.create('alpha',{...input,name:'Conflict'}));
  f.numbers.create('alpha',{requestId:randomUUID(),name:'Second phone',campaignId:f.a.id});assert.equal(f.numbers.list('alpha',f.a.id).length,2);
  assert.equal(f.numbers.list('beta').length,0);assert.throws(()=>f.numbers.rename('beta',first.id,first.revision,'Foreign'));
  assert.throws(()=>f.numbers.assign('alpha',first.id,first.revision,f.a.id,f.foreign.id,first.name));
  assert.throws(()=>f.numbers.rename('alpha',first.id,first.revision-1,'Stale'));
  f.numbers.rename('alpha',first.id,first.revision,'Renamed');
  f.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');assert.equal(fs.readFileSync(f.file).includes(Buffer.from(input.phone)),false);
  assert.equal(JSON.stringify(f.numbers.list('alpha')).includes(input.phone),false);
 }finally{f.cleanup();}
});
test('default connection path is unavailable; removal and restoration retain private records safely',()=>{
 const f=fixture();try{
  let n=f.add(),sessions=new NumberSessions(f.numbers);
  n=sessions.request('alpha',n.id,n.revision);assert.equal(n.status,'unavailable');assert.equal(n.qrAvailable,false);assert.equal(n.liveTransport,false);
  assert.throws(()=>sessions.begin({adapterId:'fake',reference:'none',accountId:'alpha',numberId:n.id,mode:'verified',expiresAt:Date.now()+1000},n.revision));
  assert.throws(()=>f.numbers.remove('alpha',n.id,n.revision,'Wrong name'));
  n=f.numbers.remove('alpha',n.id,n.revision,n.name);assert.equal(f.numbers.list('alpha').length,0);assert.equal(f.numbers.list('alpha',undefined,true).length,1);
  n=f.numbers.restore('alpha',n.id,n.revision);assert.equal(n.status,'disconnected');assert.equal(n.campaignId,null);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM number_assignment_history WHERE number_id=?').get(n.id)!.n,2);
  n=sessions.disconnect('alpha',n.id,n.revision);assert.equal(n.status,'revoked');
 }finally{f.cleanup();}
});
test('synthetic adapter events, fencing, ordering and durable duplicate/uncertain delivery guards',()=>{
 const f=fixture();try{
  let n=f.add();const grant:AdapterGrant={adapterId:'offline-fixture',reference:randomUUID(),accountId:'alpha',numberId:n.id,mode:'synthetic',expiresAt:Date.now()+120000};
  const sessions=new NumberSessions(f.numbers,g=>g.reference===grant.reference),ledger=new NumberMessageGuards(sessions);
  n=sessions.begin(grant,n.revision);assert.equal(n.status,'pending');
  f.store.db.prepare('UPDATE number_connection_sessions SET lease_until=0 WHERE id=?').run(n.session.id);
  assert.equal(f.numbers.safe(f.numbers.owned('alpha',n.id)).status,'unavailable');
  f.store.db.prepare('UPDATE number_connection_sessions SET lease_until=? WHERE id=?').run(Date.now()+60000,n.session.id);
  const event={id:randomUUID(),sessionId:n.session.id,epoch:n.session.epoch,sequence:1,state:'connected' as const};
  assert.equal(sessions.event(grant,event).duplicate,false);assert.equal(sessions.event(grant,event).duplicate,true);
  assert.throws(()=>sessions.event(grant,{...event,state:'disconnected'}));
  assert.throws(()=>sessions.event(grant,{...event,id:randomUUID(),sequence:1}));
  const input={direction:'inbound' as const,providerMessageId:'offline-message',sessionId:n.session.id,epoch:n.session.epoch,digest:digest('offline')};
  assert.equal(ledger.record(grant,input).state,'held');assert.equal(ledger.record(grant,input).duplicate,true);
  assert.throws(()=>ledger.record(grant,{...input,digest:digest('conflict')}));
  ledger.record(grant,{...input,direction:'outbound',providerMessageId:'offline-reply'});ledger.uncertain('alpha',n.id);
  n=f.numbers.safe(f.numbers.owned('alpha',n.id));
  n=f.numbers.assign('alpha',n.id,n.revision,f.a.id,f.b.id,n.name);assert.equal(n.campaignId,f.b.id);assert.equal(n.status,'revoked');
  assert.equal(f.store.db.prepare("SELECT state FROM number_message_guards WHERE direction='outbound'").get()!.state,'uncertain');
  assert.throws(()=>sessions.event(grant,{...event,id:randomUUID(),sequence:2}));
  assert.throws(()=>ledger.record(grant,{...input,providerMessageId:'stale-session'}));
  assert.equal(f.numbers.list('alpha',f.a.id).length,0);assert.equal(f.numbers.list('alpha',f.b.id).length,1);
 }finally{f.cleanup();}
});
test('restart preserves identity and assignments while holding previously connected sessions',()=>{
 const f=fixture();try{
  let n=f.add();const grant:AdapterGrant={adapterId:'offline',reference:randomUUID(),accountId:'alpha',numberId:n.id,mode:'synthetic',expiresAt:Date.now()+120000};
  const sessions=new NumberSessions(f.numbers,()=>true);n=sessions.begin(grant,n.revision);
  sessions.baileysEvent(grant,{id:randomUUID(),sessionId:n.session.id,epoch:n.session.epoch,sequence:1,connection:'open'});
  assert.equal(f.numbers.safe(f.numbers.owned('alpha',n.id)).status,'unavailable');
  const reopened=new CampaignStore(f.file),numbers=new NumberRepository(reopened);
  const restored=numbers.safe(numbers.owned('alpha',n.id));assert.equal(restored.name,n.name);assert.equal(restored.campaignId,f.a.id);assert.equal(restored.status,'unavailable');
  assert.ok(restored.revision>n.revision);
  assert.equal(new NumberSessions(numbers).disconnect('alpha',restored.id,restored.revision).status,'revoked');
  reopened.close();
 }finally{f.cleanup();}
});
