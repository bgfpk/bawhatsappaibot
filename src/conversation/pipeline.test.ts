import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes,randomUUID } from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import { CampaignStore } from '../campaigns/store';
import { CampaignPublications } from '../campaigns/publications';
import { CampaignKnowledge } from '../campaigns/knowledge/repository';
import { CampaignCatalogue } from '../catalogue/repository';
import { GeminiProvider } from '../gemini/provider';
import { GeminiSettings } from '../gemini/settings-store';
import { NumberRepository } from '../numbers/repository';
import { NumberSessions } from '../numbers/sessions';
import type { AdapterGrant } from '../numbers/contracts';
import { CampaignConversationGenerator,NonSendingAdapter } from './generation';
import { ConversationPipeline } from './pipeline';
import { automaticLanguage } from './language';
import { installConversationRuntime,conversationRuntime } from './runtime';
import { decryptServerSecret } from '../services/secret-crypto-service';

process.env.BLACKARROW_STAGE='1';process.env.BLACKARROW_DISPOSABLE_TEST='1';
process.env.BLACKARROW_SECRET_ENCRYPTION_KEY=randomBytes(48).toString('hex');
async function fixture(){
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'blackarrow-pipeline-')),file=path.join(directory,'test.sqlite'),store=new CampaignStore(file),pub=new CampaignPublications(store),catalogue=new CampaignCatalogue(store);
 const campaign=store.create('alpha',{name:'Synthetic campaign',description:''}),rev=()=>store.owned('alpha',campaign.id).revision;
 pub.save('alpha',campaign.id,rev(),{instructions:'ALPHA_PUBLISHED_INSTRUCTIONS',enabled:true});
 new CampaignKnowledge(store).save('alpha',campaign.id,rev(),{kind:'note',enabled:true,fields:{title:'Legacy preserved',body:'LEGACY_MUST_NOT_RETRIEVE'}});
 const product=catalogue.save('alpha',campaign.id,rev(),{kind:'service',name:'Synthetic service',description:'Published fixture only',price:'PKR 123'});
 const numbers=new NumberRepository(store);let number=numbers.create('alpha',{requestId:randomUUID(),name:'Synthetic number',campaignId:campaign.id});
 pub.publish('alpha',campaign.id,rev());
 const sessions=new NumberSessions(numbers,g=>g.adapterId==='synthetic-offline');
 const grant:AdapterGrant={adapterId:'synthetic-offline',reference:randomUUID(),accountId:'alpha',numberId:number.id,mode:'synthetic',expiresAt:Date.now()+3600000};
 number=sessions.begin(grant,number.revision);sessions.event(grant,{id:randomUUID(),sessionId:number.session!.id,epoch:number.session!.epoch,sequence:1,state:'connected'});
 const settings=new GeminiSettings(store);settings.save('alpha',0,'AIza'+randomBytes(24).toString('base64url'));settings.tested('alpha',1,'gemini-offline-fixture');
 let mode=200,reply='OFFLINE PIPELINE FIXTURE RESPONSE',update:any={currentFacts:['Customer name: Ayesha'],doNotAskAgain:['Customer name']},gate:Promise<void>|undefined;
 const requests:any[]=[];
 const server=http.createServer((req,res)=>{let body='';req.on('data',c=>body+=c);req.on('end',async()=>{
  requests.push(JSON.parse(body));await gate;res.setHeader('content-type','application/json');
  if(mode!==200){res.statusCode=mode;res.end(JSON.stringify({error:{code:mode,message:'Synthetic provider failure'}}));return;}
  res.end(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:JSON.stringify({reply,customerMemoryUpdate:update})}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:3,totalTokenCount:5},responseId:'offline-only'}));
 });});
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 class ProtocolProvider extends GeminiProvider{async client(key:string){return new GoogleGenAI({apiKey:key,vertexai:false,httpOptions:{baseUrl:'http://127.0.0.1:'+(server.address() as any).port,timeout:3000}});}}
 const generator=new CampaignConversationGenerator(store,new ProtocolProvider(),g=>g.mode==='synthetic');
 class Capture extends NonSendingAdapter{calls=0;throws=false;async deliver(input:{idempotencyKey:string}){this.calls++;if(this.throws)throw Error('Synthetic unknown transport outcome');return super.deliver(input);}}
 const capture=new Capture(),pipeline=new ConversationPipeline(store,sessions,generator,capture);
 const inbound=(text:string,customer='customer-one',id=randomUUID())=>({providerMessageId:id,sessionId:number.session!.id,epoch:number.session!.epoch,customerId:customer,text});
 return {store,pub,catalogue,campaign,product,number,grant,sessions,requests,capture,generator,pipeline,rev,inbound,file,
  mode(value:number){mode=value;},reply(value:string,memory:any={}){reply=value;update=memory;},gate(value?:Promise<void>){gate=value;},
  async cleanup(){server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));try{store.close();}catch{}fs.rmSync(directory,{recursive:true,force:true});}};
}
test('automatic first-turn English, Urdu, Roman Urdu and explicit switches preserve neutral acknowledgements',()=>{
 assert.equal(automaticLanguage({},'یہ سروس کتنے کی ہے؟').language,'urdu');
 assert.equal(automaticLanguage({},'Mujhe yeh service chahiye hai').language,'roman_urdu');
 const roman=automaticLanguage({},'Please reply in Roman Urdu');assert.equal(roman.language,'roman_urdu');
 assert.equal(automaticLanguage(roman.profile,'Please reply in English').language,'english');
 assert.equal(automaticLanguage(roman.profile,'Reply in Urdu script').language,'urdu');
 assert.equal(automaticLanguage(roman.profile,'OK').language,'roman_urdu');
});
test('deployed runtime registers the pipeline with closed live gates and local-only startup recovery',async()=>{
 const f=await fixture();try{
  const runtime=installConversationRuntime(f.store,f.sessions);assert.equal(conversationRuntime(f.store),runtime);
  assert.equal(runtime.generator instanceof CampaignConversationGenerator,true);assert.equal(runtime.transport.mode,'non-sending');
  const input=f.inbound('Default runtime must not spend');runtime.ingest(f.grant,input);assert.equal((await runtime.processNext(f.grant))!.state,'BLOCKED');
  assert.equal(f.requests.length,0);assert.equal(f.capture.calls,0);
 }finally{await f.cleanup();}
});
test('real SDK processing uses only the published campaign catalogue; durable encrypted memory and one non-sending job',async()=>{
 const f=await fixture();try{
  const event=f.inbound('My name is Ayesha. Tell me about the service'),job=f.pipeline.ingest(f.grant,event);
  assert.equal(f.pipeline.ingest(f.grant,event).id,job.id);assert.throws(()=>f.pipeline.ingest(f.grant,{...event,text:'conflicting body'}));
  assert.equal((await f.pipeline.processNext(f.grant))!.state,'SEND_PENDING');
  const prompt=JSON.stringify(f.requests[0]);assert.match(prompt,/ALPHA_PUBLISHED_INSTRUCTIONS/);assert.match(prompt,/PKR 123/);assert.doesNotMatch(prompt,/LEGACY_MUST_NOT_RETRIEVE/);
  assert.equal(f.store.db.prepare('SELECT count(*) n FROM campaign_knowledge').get()!.n,1);
  assert.equal((await f.pipeline.deliver('alpha',job.id,f.grant)).state,'CAPTURED');
  assert.equal((await f.pipeline.deliver('alpha',job.id,f.grant)).duplicate,true);assert.equal(f.capture.calls,1);
  const row=f.pipeline.jobs.owned('alpha',job.id),memory=f.pipeline.jobs.memory.read('alpha',row.thread_id);assert.match(memory.summary,/Ayesha/);
  f.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');assert.equal(fs.readFileSync(f.file).includes(Buffer.from(event.text)),false);assert.equal(fs.readFileSync(f.file).includes(Buffer.from(memory.summary)),false);
  f.reply('OFFLINE SECOND RESPONSE',{});f.pipeline.ingest(f.grant,f.inbound('Tell me more'));await f.pipeline.processNext(f.grant);assert.match(JSON.stringify(f.requests[1]),/Ayesha/);
  f.pipeline.ingest(f.grant,f.inbound('Different customer question','customer-two'));await f.pipeline.processNext(f.grant);assert.doesNotMatch(JSON.stringify(f.requests[2]),/Ayesha/);
  assert.equal(f.pipeline.jobs.memory.read('beta',row.thread_id).summary,'');
  const other=f.store.create('alpha',{name:'Other campaign',description:''});assert.notEqual(f.pipeline.jobs.memory.id({account:'alpha',campaign:other.id,number:f.number.id,customer:'customer-one'}),row.thread_id);
  f.pub.save('alpha',other.id,f.store.owned('alpha',other.id).revision,{instructions:'OTHER_CAMPAIGN_ONLY',enabled:true});f.pub.publish('alpha',other.id,f.store.owned('alpha',other.id).revision);
  let moved=f.sessions.numbers.safe(f.sessions.numbers.owned('alpha',f.number.id));moved=f.sessions.numbers.assign('alpha',moved.id,moved.revision,f.campaign.id,other.id,moved.name);
  const grant={...f.grant,reference:randomUUID()};moved=f.sessions.begin(grant,moved.revision);f.sessions.event(grant,{id:randomUUID(),sessionId:moved.session!.id,epoch:moved.session!.epoch,sequence:1,state:'connected'});
  f.pipeline.ingest(grant,{...f.inbound('Other campaign question'),sessionId:moved.session!.id,epoch:moved.session!.epoch});await f.pipeline.processNext(grant);
  assert.match(JSON.stringify(f.requests[3]),/OTHER_CAMPAIGN_ONLY/);assert.doesNotMatch(JSON.stringify(f.requests[3]),/Ayesha|ALPHA_PUBLISHED_INSTRUCTIONS|PKR 123/);
  assert.throws(()=>f.pipeline.ingest({...grant,accountId:'beta'},f.inbound('Foreign account')));
 }finally{await f.cleanup();}
});
test('catalogue drafts, archive, immutable publication and privacy opt-out remain isolated and preserved',async()=>{
 const f=await fixture();try{
  f.catalogue.save('alpha',f.campaign.id,f.rev(),{kind:'service',name:'DRAFT_ONLY_SERVICE',description:'',price:'PKR 999'});
  const job=f.pipeline.ingest(f.grant,f.inbound('Ask about catalogue'));await f.pipeline.processNext(f.grant);
  assert.doesNotMatch(JSON.stringify(f.requests[0]),/DRAFT_ONLY_SERVICE|999/);
  f.catalogue.archive('alpha',f.campaign.id,f.rev(),f.product.id);f.pub.publish('alpha',f.campaign.id,f.rev());
  await assert.rejects(f.pipeline.deliver('alpha',job.id,f.grant),/changed/);assert.equal(f.capture.calls,0);
  assert.equal(f.catalogue.list('alpha',f.campaign.id).items.length,2);assert.throws(()=>f.catalogue.list('beta',f.campaign.id));
  f.store.db.prepare("UPDATE campaign_drafts SET config=json_set(config,'$.memoryEnabled',json('false')) WHERE account_id=? AND campaign_id=?").run('alpha',f.campaign.id);
  f.pub.save('alpha',f.campaign.id,f.rev(),{instructions:'NEW_PUBLICATION',enabled:true});assert.equal(f.pub.draft('alpha',f.campaign.id).memoryEnabled,false);
  f.pub.publish('alpha',f.campaign.id,f.rev());f.pipeline.ingest(f.grant,f.inbound('Privacy-sensitive context','private-customer'));const result=await f.pipeline.processNext(f.grant);await f.pipeline.deliver('alpha',result!.id,f.grant);
  const privateJob=f.pipeline.jobs.owned('alpha',result!.id);assert.equal(privateJob.input_cipher,'');assert.equal(privateJob.output_cipher,'');assert.equal(f.pipeline.jobs.memory.read('alpha',privateJob.thread_id).summary,'');
  f.pipeline.jobs.memory.reset('alpha',f.campaign.id);assert.equal(f.store.db.prepare("SELECT count(*) n FROM conversation_threads WHERE cipher<>''").get()!.n,0);
 }finally{await f.cleanup();}
});
test('bounded provider retries survive worker replacement; supersession and unknown delivery never duplicate',async()=>{
 const f=await fixture();try{
  f.mode(503);const job=f.pipeline.ingest(f.grant,f.inbound('Synthetic failure question'));
  assert.equal((await f.pipeline.processNext(f.grant))!.state,'AI_RETRY');assert.equal(f.requests.length,1);assert.equal(await f.pipeline.processNext(f.grant),null);
  const restarted=new ConversationPipeline(f.store,f.sessions,f.generator,f.capture);f.mode(200);
  f.store.db.prepare('UPDATE conversation_jobs SET next_attempt_at=0 WHERE id=?').run(job.id);await restarted.processNext(f.grant);assert.equal(f.requests.length,2);
  f.capture.throws=true;assert.equal((await restarted.deliver('alpha',job.id,f.grant)).state,'UNKNOWN');await restarted.deliver('alpha',job.id,f.grant);assert.equal(f.capture.calls,1);
  assert.equal(f.store.db.prepare('SELECT category FROM conversation_alerts WHERE job_id=?').get(job.id)!.category,'delivery_receipt_required');
  f.pipeline.ingest(f.grant,f.inbound('Newer message must wait for receipt'));assert.equal(await restarted.processNext(f.grant),null);
  const key=f.store.db.prepare('SELECT idempotency_key FROM conversation_deliveries WHERE job_id=?').get(job.id)!.idempotency_key as string;
  assert.throws(()=>restarted.reconcileDelivery('alpha',job.id,f.grant,{idempotencyKey:key,outcome:'not_sent',receipt:'offline-only'}));
  restarted.reconcileDelivery('alpha',job.id,f.grant,{idempotencyKey:key,outcome:'not_sent',receipt:'offline-only'},()=>true);
  const first=f.pipeline.ingest(f.grant,f.inbound('Older text','other-customer')),newest=f.pipeline.ingest(f.grant,f.inbound('Newer text','other-customer'));
  assert.equal(f.pipeline.jobs.owned('alpha',first.id).state,'SUPERSEDED');await restarted.processNext(f.grant);await restarted.processNext(f.grant);assert.equal(f.pipeline.jobs.owned('alpha',newest.id).state,'SEND_PENDING');
 }finally{await f.cleanup();}
});
test('in-flight supersession, interrupted generation and reset fence stale work without automatic paid retry',async()=>{
 const f=await fixture();try{
  let release!:()=>void;f.gate(new Promise<void>(resolve=>{release=resolve;}));
  const first=f.pipeline.ingest(f.grant,f.inbound('Older in-flight question')),processing=f.pipeline.processNext(f.grant);
  while(!f.requests.length)await new Promise(resolve=>setTimeout(resolve,5));
  const next=f.pipeline.ingest(f.grant,f.inbound('Newer in-flight question'));assert.equal(await f.pipeline.processNext(f.grant),null);release();await processing;
  assert.equal(f.pipeline.jobs.owned('alpha',first.id).state,'SUPERSEDED');assert.equal(f.capture.calls,0);
  f.gate();await f.pipeline.processNext(f.grant);assert.equal(f.pipeline.jobs.owned('alpha',next.id).state,'SEND_PENDING');
  f.pipeline.jobs.memory.reset('alpha',f.campaign.id);assert.equal(f.pipeline.jobs.owned('alpha',next.id).state,'SUPERSEDED');
  const interrupted=f.pipeline.ingest(f.grant,f.inbound('Interrupted fixture','third-customer'));
  f.store.db.prepare("UPDATE conversation_jobs SET state='GENERATING',lease_until=0,lease_token='interrupted' WHERE id=?").run(interrupted.id);
  assert.equal(f.pipeline.recover().interrupted,1);assert.equal(f.pipeline.jobs.owned('alpha',interrupted.id).state,'UNKNOWN');assert.equal(await f.pipeline.processNext(f.grant),null);
 }finally{await f.cleanup();}
});
test('quality failures exhaust bounded retries; revoked number and default activation prevent provider or send calls',async()=>{
 const f=await fixture();try{
  const defaultGenerator=new CampaignConversationGenerator(f.store);await assert.rejects(defaultGenerator.generate(f.grant,{account:'alpha',campaign:f.campaign.id,question:'No live call',language:'english',history:[],summary:'',profile:{}},()=>{}),/activation/);
  f.reply('The price is PKR 987654321');const job=f.pipeline.ingest(f.grant,f.inbound('What is the price?'));
  for(let i=0;i<3;i++){await f.pipeline.processNext(f.grant);f.store.db.prepare('UPDATE conversation_jobs SET next_attempt_at=0 WHERE id=?').run(job.id);}
  assert.equal(f.requests.length,3);assert.equal(f.pipeline.jobs.owned('alpha',job.id).state,'FAILED');assert.equal(await f.pipeline.processNext(f.grant),null);assert.equal(f.capture.calls,0);
  const stale=f.pipeline.ingest(f.grant,f.inbound('Revoke before processing','fourth-customer'));
  const number=f.sessions.numbers.safe(f.sessions.numbers.owned('alpha',f.number.id));f.sessions.disconnect('alpha',number.id,number.revision);
  assert.equal(await f.pipeline.processNext(f.grant),null);assert.equal(f.pipeline.jobs.owned('alpha',stale.id).state,'BLOCKED');assert.equal(f.requests.length,3);
 }finally{await f.cleanup();}
});
test('SQLite restart retains memory and retry state; only an authorized revalidated session resumes known-safe work',async()=>{
 const f=await fixture();let reopened:CampaignStore|undefined;try{
  let job=f.pipeline.ingest(f.grant,f.inbound('My name is Ayesha. Show the service'));
  await f.pipeline.processNext(f.grant);await f.pipeline.deliver('alpha',job.id,f.grant);
  f.mode(503);job=f.pipeline.ingest(f.grant,f.inbound('Please explain the service'));await f.pipeline.processNext(f.grant);
  const thread=f.pipeline.jobs.owned('alpha',job.id).thread_id;f.store.close();reopened=new CampaignStore(f.file);
  const numbers=new NumberRepository(reopened),sessions=new NumberSessions(numbers,g=>g.adapterId==='synthetic-offline');
  const engine=new ConversationPipeline(reopened,sessions,new CampaignConversationGenerator(reopened,f.generator.provider,g=>g.mode==='synthetic'),f.capture);
  assert.match(engine.jobs.memory.read('alpha',thread).summary,/Ayesha/);
  assert.equal(engine.jobs.owned('alpha',job.id).state,'AI_RETRY');
  let number=numbers.safe(numbers.owned('alpha',f.number.id));assert.equal(number.status,'unavailable');
  const grant={...f.grant,reference:randomUUID()};number=sessions.begin(grant,number.revision);sessions.event(grant,{id:randomUUID(),sessionId:number.session!.id,epoch:number.session!.epoch,sequence:1,state:'connected'});
  engine.revalidatePending('alpha',job.id,grant,number.session!.id,number.session!.epoch);f.mode(200);
  reopened.db.prepare('UPDATE conversation_jobs SET next_attempt_at=0 WHERE id=?').run(job.id);await engine.processNext(grant);
  assert.equal((await engine.deliver('alpha',job.id,grant)).state,'CAPTURED');assert.equal(f.requests.length,3);assert.match(JSON.stringify(f.requests[2]),/Ayesha/);
 }finally{reopened?.close();await f.cleanup();}
});
test('verified not-attempted delivery retries persist the existing reply without a second generation',async()=>{
 const f=await fixture();try{
  let attempts=0;const adapter={mode:'non-sending' as const,async deliver(){attempts++;return {kind:attempts===1?'not_attempted' as const:'captured' as const};}};
  const engine=new ConversationPipeline(f.store,f.sessions,f.generator,adapter),job=engine.ingest(f.grant,f.inbound('Synthetic retry delivery'));
  await engine.processNext(f.grant);assert.equal((await engine.deliver('alpha',job.id,f.grant)).state,'SEND_PENDING');
  await assert.rejects(engine.deliver('alpha',job.id,f.grant),/not due/);assert.equal(attempts,1);
  f.store.db.prepare('UPDATE conversation_jobs SET next_attempt_at=0 WHERE id=?').run(job.id);
  assert.equal((await new ConversationPipeline(f.store,f.sessions,f.generator,adapter).deliver('alpha',job.id,f.grant)).state,'CAPTURED');
  assert.equal(attempts,2);assert.equal(f.requests.length,1);
 }finally{await f.cleanup();}
});
