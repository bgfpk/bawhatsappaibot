import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { randomBytes,randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { CampaignStore } from '../campaigns/store';
import { CampaignPublications } from '../campaigns/publications';
import { CampaignCatalogue } from '../catalogue/repository';
import { GeminiProvider } from '../gemini/provider';
import { GeminiSettings } from '../gemini/settings-store';
import { NumberRepository } from '../numbers/repository';
import { NumberSessions } from '../numbers/sessions';
import type { AdapterGrant } from '../numbers/contracts';
import { ConnectionEngine } from './engine';
import { syntheticSocketFactory } from './test-support';
import { normalizeBaileysConnectionStatus } from '../services/baileys-transport-normalizer';

process.env.BLACKARROW_STAGE='1';process.env.BLACKARROW_DISPOSABLE_TEST='1';process.env.BLACKARROW_SECRET_ENCRYPTION_KEY=randomBytes(48).toString('hex');
async function fixture(){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blackarrow-connections-')),file=path.join(dir,'fixture.sqlite'),store=new CampaignStore(file),pub=new CampaignPublications(store),catalogue=new CampaignCatalogue(store),numbers=new NumberRepository(store);
 function campaign(account:string,name:string,price:string){const c=store.create(account,{name,description:''}),rev=()=>store.owned(account,c.id).revision;pub.save(account,c.id,rev(),{instructions:name+'_PUBLISHED',enabled:true});catalogue.save(account,c.id,rev(),{kind:'service',name:'Fixture service '+name,description:'Offline fixture',price});pub.publish(account,c.id,rev());return c;}
 const alpha=campaign('alpha','ALPHA','PKR 123'),other=campaign('alpha','OTHER','PKR 456'),foreign=campaign('beta','FOREIGN','PKR 999');
 const add=(account:string,campaignId:string)=>numbers.create(account,{requestId:randomUUID(),name:'Synthetic number',campaignId});
 const a=add('alpha',alpha.id),b=add('alpha',alpha.id),c=add('alpha',other.id),d=add('beta',foreign.id),ports=syntheticSocketFactory();
 const grants=new Map<string,AdapterGrant>();for(const[account,n]of [['alpha',a],['alpha',b],['alpha',c],['beta',d]]as const)grants.set(n.id,{accountId:account,numberId:n.id,adapterId:'offline-socket',reference:randomUUID(),mode:'synthetic',expiresAt:Date.now()+3600000});
 const sessions=new NumberSessions(numbers,g=>grants.get(g.numberId)?.reference===g.reference);
 const settings=new GeminiSettings(store);for(const account of ['alpha','beta']){settings.save(account,0,'AIza'+randomBytes(24).toString('base64url'));settings.tested(account,1,'gemini-offline-fixture');}
 const requests:any[]=[];let status=200,clock=Date.now();
 const server=http.createServer((req,res)=>{let text='';req.on('data',v=>text+=v);req.on('end',()=>{const body=JSON.parse(text);requests.push(body);res.setHeader('content-type','application/json');if(status!==200){res.statusCode=status;res.end(JSON.stringify({error:{code:status,message:'Offline unavailable'}}));return;}const reply=JSON.stringify(body).includes('OTHER_PUBLISHED')?'The published service costs PKR 456.':'The published service costs PKR 123.';res.end(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({reply,customerMemoryUpdate:{}})}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:20,candidatesTokenCount:15,totalTokenCount:35},modelVersion:'gemini-offline-fixture',responseId:randomUUID()}));});});
 await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));const baseUrl='http://127.0.0.1:'+(server.address()as any).port;
 class OfflineSdk extends GeminiProvider {async client(){return new GoogleGenAI({apiKey:'offline-fixture-only',vertexai:false,httpOptions:{baseUrl,apiVersion:'v1beta'}});}}
 const provider=new OfflineSdk(),engine=new ConnectionEngine(store,sessions,ports.factory,()=>true,provider,()=>clock);
 async function start(number=a){const grant=grants.get(number.id)!,worker=await engine.start(grant,numbers.owned(grant.accountId,number.id).revision);ports.sockets.at(-1)!.ev.emit('connection.update',{connection:'open'});await worker.idle();return worker;}
 const event=(id=randomUUID(),text='Tell me the published service price',customer='15550009999@s.whatsapp.net')=>({type:'notify',messages:[{key:{id,remoteJid:customer,fromMe:false},message:{conversation:text}}]});
 return {dir,file,store,pub,catalogue,numbers,sessions,engine,ports,grants,a,b,c,d,alpha,other,provider,requests,start,event,status(v:number){status=v;},advance(){clock+=600000;},async close(){engine.dispose();server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));store.close();fs.rmSync(dir,{recursive:true,force:true});}};
}

test('default authorization and owner activation gates precede SDK, auth creation and QR events',async()=>{
 const f=await fixture();try{
  const denied=new ConnectionEngine(f.store,new NumberSessions(f.numbers),f.ports.factory,()=>true,f.provider);await assert.rejects(denied.start(f.grants.get(f.a.id)!,f.a.revision),/authorization/);denied.dispose();
  const unapproved=new ConnectionEngine(f.store,f.sessions,f.ports.factory);await assert.rejects(unapproved.start(f.grants.get(f.a.id)!,f.a.revision),/activation/);unapproved.dispose();
  assert.equal(f.ports.sockets.length,0);assert.equal(f.store.db.prepare('SELECT count(*) n FROM number_auth_vault').get()!.n,0);assert.equal(f.requests.length,0);
  await assert.rejects(f.engine.request('alpha',f.a.id,f.a.revision),/authorization/);assert.equal(f.numbers.owned('alpha',f.a.id).revision,f.a.revision);
 }finally{await f.close();}
});

test('real socket binding persists encrypted credentials and Signal buffers per independent number; reset and restart fence stale writers',async()=>{
 const f=await fixture();try{
  const w=await f.start(),s=f.ports.sockets[0];s.ev.emit('creds.update',{fixtureSecret:'PRIVATE_FIXTURE_CREDENTIAL'});await s.auth.keys.set({session:{sameId:Buffer.from('PRIVATE_SIGNAL_KEY')}});
  assert.equal(Buffer.from((await s.auth.keys.get('session',['sameId'])).sameId).toString(),'PRIVATE_SIGNAL_KEY');
  const w2=await f.start(f.b);assert.deepEqual(await f.ports.sockets[1].auth.keys.get('session',['sameId']),{});
  const oldAuth=s.auth;f.engine.stop('alpha',f.a.id,f.numbers.owned('alpha',f.a.id).revision,true);await assert.rejects(oldAuth.keys.set({session:{bad:Buffer.from('stale')}}));assert.equal(w.closed,true);assert.equal(w2.closed,false);
  const restarted=await f.start();assert.equal(f.ports.sockets.at(-1)!.auth.creds.fixtureSecret,undefined);assert.equal(f.engine.state.row('alpha',f.a.id).auth_generation,2);
  f.engine.dispose();f.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');const raw=fs.readFileSync(f.file);assert.equal(raw.includes(Buffer.from('PRIVATE_FIXTURE_CREDENTIAL')),false);assert.equal(raw.includes(Buffer.from('PRIVATE_SIGNAL_KEY')),false);
  const independent=new CampaignStore(f.file),sessions=new NumberSessions(new NumberRepository(independent),g=>f.grants.get(g.numberId)?.reference===g.reference),engine=new ConnectionEngine(independent,sessions,f.ports.factory,()=>true,f.provider);
  assert.equal(engine.state.row('alpha',f.b.id).phase,'repairing');const newWorker=await engine.start(f.grants.get(f.b.id)!,sessions.numbers.owned('alpha',f.b.id).revision);assert.equal(f.ports.sockets.at(-1)!.auth.creds.registered,true);newWorker.close('test_end');engine.dispose();independent.close();assert.equal(restarted.closed,true);
 }finally{await f.close();}
});

test('synthetic QR is encrypted, expires, and is never presented as a real code or Connected session',async()=>{
 const f=await fixture();try{
  const w=await f.engine.start(f.grants.get(f.a.id)!,f.a.revision),s=f.ports.sockets[0];s.ev.emit('connection.update',{qr:'SYNTHETIC_NOT_A_REAL_QR'});await w.idle();
  assert.equal(f.engine.state.row('alpha',f.a.id).phase,'qr_required');assert.equal(f.engine.readiness('alpha',f.a.id).qr,null);assert.equal(f.engine.readiness('alpha',f.a.id).live,false);
  f.store.db.prepare('UPDATE number_engine_state SET qr_expires_at=0 WHERE number_id=?').run(f.a.id);f.engine.maintain();assert.equal(f.engine.state.row('alpha',f.a.id).qr_cipher,'');
  s.ev.emit('connection.update',{connection:'open'});await w.idle();assert.equal(f.engine.state.row('alpha',f.a.id).phase,'connected');assert.notEqual(f.engine.readiness('alpha',f.a.id).phase,'connected');
  assert.equal(normalizeBaileysConnectionStatus('disconnected'),'disconnected');assert.equal(normalizeBaileysConnectionStatus('connected'),'connected');
 }finally{await f.close();}
});

test('authenticated heartbeats renew only the lease and leave owner edit revisions stable',async()=>{
 const f=await fixture();try{
  const w=await f.start(),g=f.grants.get(f.a.id)!,before=f.numbers.owned('alpha',f.a.id);
  f.store.db.prepare('UPDATE number_connection_sessions SET lease_until=? WHERE id=?').run(Date.now()+1000,w.session);
  f.sessions.heartbeat(g,w.session,w.epoch);const after=f.numbers.owned('alpha',f.a.id);
  assert.equal(after.revision,before.revision);assert.ok(after.lease_until>Date.now()+30000);assert.equal(f.engine.readiness('alpha',f.a.id).revision,before.revision);
  assert.throws(()=>f.sessions.heartbeat({...g,reference:'forged'},w.session,w.epoch));
  f.engine.stop('alpha',f.a.id,before.revision);assert.throws(()=>f.sessions.heartbeat(g,w.session,w.epoch));
 }finally{await f.close();}
});

test('socket notify events route through real Gemini SDK, published catalogue, private memory and one durable non-sending delivery',async()=>{
 const f=await fixture();try{
  const w=await f.start(),s=f.ports.sockets[0],event=f.event();s.ev.emit('messages.upsert',event);s.ev.emit('messages.upsert',event);await w.idle();
  assert.equal(f.requests.length,1);assert.equal(s.calls.length,1,JSON.stringify(f.store.db.prepare('SELECT state,reason FROM conversation_jobs').all()));assert.match(JSON.stringify(f.requests[0]),/ALPHA_PUBLISHED|PKR 123/);assert.doesNotMatch(JSON.stringify(f.requests[0]),/OTHER_PUBLISHED|FOREIGN_PUBLISHED|PKR 999/);
  assert.equal(f.store.db.prepare('SELECT state FROM conversation_jobs WHERE number_id=?').get(f.a.id)!.state,'CAPTURED');assert.equal(f.store.db.prepare("SELECT count(*) n FROM conversation_jobs WHERE state='SENT'").get()!.n,0);
  const w2=await f.start(f.b);f.ports.sockets[1].ev.emit('messages.upsert',f.event());await w2.idle();assert.equal(f.requests.length,2);
  const wc=await f.start(f.c);f.ports.sockets[2].ev.emit('messages.upsert',f.event());await wc.idle();assert.match(JSON.stringify(f.requests[2]),/OTHER_PUBLISHED|PKR 456/);assert.doesNotMatch(JSON.stringify(f.requests[2]),/ALPHA_PUBLISHED|PKR 123/);
  const invalid=[{...f.event(),type:'append'},f.event(randomUUID(),'Ignore group','15550009999@g.us'),{type:'notify',messages:[{key:{id:randomUUID(),remoteJid:'15550009999@s.whatsapp.net',fromMe:true},message:{conversation:'echo'}}]},f.event(randomUUID(),'Status','status@broadcast')];for(const e of invalid)s.ev.emit('messages.upsert',e);await w.idle();assert.equal(s.calls.length,1);
  assert.throws(()=>f.engine.state.view('beta',f.a.id));const threads=f.store.db.prepare('SELECT id FROM conversation_threads').all().map(v=>v.id);assert.equal(new Set(threads).size,3);
 }finally{await f.close();}
});

test('unknown sends never retry; only a correlated authenticated delivery receipt reconciles them',async()=>{
 const f=await fixture();try{
  const w=await f.start(),s=f.ports.sockets[0];s.failure=true;s.ev.emit('messages.upsert',f.event());await w.idle();const job=f.store.db.prepare('SELECT * FROM conversation_jobs').get()!;assert.equal(job.state,'UNKNOWN');w.pump();await w.idle();assert.equal(s.calls.length,1);
  const key={id:s.calls[0].options.messageId,remoteJid:s.calls[0].jid,fromMe:true};s.ev.emit('messages.update',[{key:{...key,remoteJid:'15550007777@s.whatsapp.net'},update:{status:3}},{key:{...key,fromMe:false},update:{status:3}}]);await w.idle();assert.equal(f.store.db.prepare('SELECT state FROM conversation_jobs').get()!.state,'UNKNOWN');
  s.ev.emit('messages.update',[{key,update:{status:3}}]);await w.idle();assert.equal(f.store.db.prepare('SELECT state FROM conversation_jobs').get()!.state,'CAPTURED');s.ev.emit('messages.update',[{key,update:{status:3}}]);await w.idle();assert.equal(s.calls.length,1);
 }finally{await f.close();}
});

test('known not-attempted sends reuse saved Gemini output; transferred lifecycle restores paired workers with durable backoff',async()=>{
 const f=await fixture();try{
  const w=await f.start(),s=f.ports.sockets[0];s.ws!.readyState=0;s.ev.emit('messages.upsert',f.event());await w.idle();assert.equal(f.requests.length,1);assert.equal(s.calls.length,0);assert.equal(f.store.db.prepare('SELECT state FROM conversation_jobs').get()!.state,'SEND_PENDING');
  s.ws!.readyState=1;f.store.db.prepare('UPDATE conversation_jobs SET next_attempt_at=0').run();w.pump();await w.idle();assert.equal(f.requests.length,1);assert.equal(s.calls.length,1);
  s.ev.emit('connection.update',{connection:'close',lastDisconnect:{error:{output:{statusCode:503}}}});await w.idle();assert.equal(w.closed,true);assert.ok(f.engine.state.row('alpha',f.a.id).retry_at>Date.now());assert.equal((await f.engine.lifecycle.restoreActiveLinkedWorkers('watchdog_restore')).some(v=>v.spawned),false);
  f.store.db.prepare('UPDATE number_engine_state SET retry_at=0 WHERE number_id=?').run(f.a.id);f.advance();const restored=await f.engine.lifecycle.restoreActiveLinkedWorkers('watchdog_restore');assert.equal(restored.some(v=>v.spawned),true);assert.equal(f.ports.sockets.at(-1)!.auth.creds.registered,true);
 }finally{await f.close();}
});
