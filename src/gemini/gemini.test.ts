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
import { CampaignKnowledge } from '../campaigns/knowledge/repository';
import { CampaignCatalogue } from '../catalogue/repository';
import { emptyAssistant } from '../campaigns/contracts';
import { GeminiService } from './service';
import { GeminiProvider,type Generation } from './provider';
import { campaignPrompt } from './prompt';
import { safeGeminiError } from './errors';
import { isGeminiAllowedForPurpose } from '../services/ai-provider-policy-service';
import { validGeminiKey } from './key-validation';

process.env.BLACKARROW_STAGE='1';
process.env.BLACKARROW_SECRET_ENCRYPTION_KEY=randomBytes(48).toString('hex');
const key=()=> 'AIza'+randomBytes(24).toString('base64url');
const offline:Generation={text:'OFFLINE FIXTURE - not a genuine AI response',model:'gemini-test-fixture',usage:{input:3,output:4,total:7,thoughts:0},providerResponseId:'offline-only'};
class OfflineProvider extends GeminiProvider {
  seen:any[]=[];pause:Promise<void>|undefined;
  async selectModel(_key:string,guard:()=>void){guard();return 'gemini-test-fixture';}
  async generate(k:string,m:string,s:string,c:any[],guard:()=>void,onAttempt:()=>void) {
    guard();onAttempt();this.seen.push({key:k,system:s,contents:c});await this.pause;guard();return offline;
  }
}
function fixture() {
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'blackarrow-gemini-'));
  const filename=path.join(directory,'test.sqlite'),store=new CampaignStore(filename),provider=new OfflineProvider();
  const campaign=store.create('alpha',{name:'Disposable campaign',description:'',timezone:'UTC'});
  const pub=new CampaignPublications(store);
  let s=pub.save('alpha',campaign.id,campaign.revision,{...emptyAssistant,identity:'Fixture identity',instructions:'PUBLISHED ALPHA ONLY'});
  s=pub.publish('alpha',campaign.id,s.campaign.revision);
  const service=new GeminiService(store,provider);
  return {store,provider,service,campaign,pub,filename,cleanup(){store.db.close();fs.rmSync(directory,{recursive:true,force:true});}};
}
test('encrypted account key save/replace/remove, ownership and durable custody',()=>{
  const f=fixture();try {
    const a=key(),b='AQ.'+randomBytes(300).toString('base64url');assert.equal(f.service.settings.status('alpha').configured,false);
    assert.equal(validGeminiKey(b),true);assert.equal(validGeminiKey('Bearer '+b),false);assert.equal(validGeminiKey(b+'\r\nInjected: header'),false);
    const saved=f.service.settings.save('alpha',0,a);assert.equal(saved.masked,'••••••••');assert.equal(saved.usable,false);
    assert.equal(f.service.settings.status('beta').configured,false);
    assert.throws(()=>f.service.settings.remove('beta',1));
    assert.throws(()=>f.service.settings.save('alpha',0,b));
    assert.equal(f.service.settings.credential('alpha').key,a);
    f.service.settings.save('alpha',1,b);
    assert.equal(f.service.settings.credential('alpha').key,b);
    f.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');assert.equal(fs.readFileSync(f.filename).includes(Buffer.from(a)),false);assert.equal(fs.readFileSync(f.filename).includes(Buffer.from(b)),false);
    const reopened=new CampaignStore(f.filename),second=new GeminiService(reopened);
    assert.equal(second.settings.credential('alpha').key,b);reopened.db.close();
    f.service.settings.remove('alpha',2);assert.throws(()=>f.service.settings.credential('alpha'));
    assert.throws(()=>f.service.settings.guard('alpha',2));
    assert.equal(JSON.stringify(f.service.settings.status('alpha')).includes(b),false);
  }finally{f.cleanup();}
});
test('published context, scoped temporary follow-up, clear, new publication and idempotency',async()=>{
  const f=fixture();try {
    f.service.settings.save('alpha',0,key());
    const second=f.store.create('alpha',{name:'Other campaign',description:'',timezone:'UTC'});
    const k=new CampaignCatalogue(f.store),rev=()=>f.store.owned('alpha',f.campaign.id).revision;
    k.save('alpha',f.campaign.id,rev(),{kind:'product',name:'Private fixture',description:'ONLY ALPHA PUBLISHED FACT',price:''});
    f.pub.publish('alpha',f.campaign.id,rev());
    f.pub.save('alpha',f.campaign.id,rev(),{...emptyAssistant,identity:'Draft identity',instructions:'DRAFT MUST NEVER APPEAR'});
    const id=randomUUID();const reply=await f.service.send('alpha',f.campaign.id,'session-a',{requestId:id,message:'اردو میں بتائیں',language:'Urdu'});
    assert.match(f.provider.seen[0].system,/PUBLISHED ALPHA ONLY/);assert.doesNotMatch(f.provider.seen[0].system,/DRAFT MUST NEVER/);
    assert.match(JSON.stringify(f.provider.seen[0].contents),/ONLY ALPHA PUBLISHED FACT/);
    await assert.rejects(f.service.send('alpha',f.campaign.id,'session-a',{requestId:id,message:'Repeat',language:'auto'}),/already submitted/);
    assert.equal(f.provider.seen.length,1);
    assert.equal(f.store.db.prepare('SELECT status FROM gemini_request_audit WHERE id=?').get(id)!.status,'success');
    await assert.rejects(f.service.send('beta',f.campaign.id,'session-a',{requestId:randomUUID(),message:'Foreign',language:'auto'}),/not found/);
    assert.throws(()=>f.service.conversations.read('alpha',second.id,'session-a',reply.publicationVersion,reply.conversationId));
    assert.throws(()=>f.service.conversations.read('alpha',f.campaign.id,'session-b',reply.publicationVersion,reply.conversationId));
    await f.service.send('alpha',f.campaign.id,'session-a',{requestId:randomUUID(),message:'Follow up',language:'auto',conversationId:reply.conversationId});
    assert.match(JSON.stringify(f.provider.seen[1].contents),/اردو/);
    f.pub.publish('alpha',f.campaign.id,rev());
    await f.service.send('alpha',f.campaign.id,'session-a',{requestId:randomUUID(),message:'New revision',language:'auto',conversationId:reply.conversationId});
    assert.match(f.provider.seen[2].system,/DRAFT MUST NEVER APPEAR/);
    assert.equal(f.provider.seen[2].contents.length,1);
    f.service.conversations.clear('alpha',f.campaign.id,'session-a',reply.conversationId);
    assert.throws(()=>f.service.conversations.read('alpha',f.campaign.id,'session-a',reply.publicationVersion,reply.conversationId));
  }finally{f.cleanup();}
});
test('key removal during a request fences response and retry; bounded concurrency',async()=>{
  const f=fixture();try {
    f.service.settings.save('alpha',0,key());let finish!:()=>void;f.provider.pause=new Promise(resolve=>{finish=resolve;});
    const pending=f.service.send('alpha',f.campaign.id,'session',{requestId:randomUUID(),message:'Hello',language:'auto'});
    await new Promise(resolve=>setTimeout(resolve,5));
    await assert.rejects(f.service.testConnection('alpha',randomUUID()),/already running/);
    f.service.settings.remove('alpha',1);finish();await assert.rejects(pending,/changed or was removed/);
    assert.equal(f.provider.seen.length,1);
  }finally{f.cleanup();}
});
test('SDK actually generates through protocol transport; bounded retries and safe errors (offline)',async()=>{
  let count=0,mode=503,seen:any;
  const server=http.createServer((req,res)=>{let body='';req.on('data',chunk=>body+=chunk);req.on('end',()=>{
    if(req.method==='GET') {res.setHeader('content-type','application/json');res.end(JSON.stringify({models:[{name:'models/gemini-verified-flash-lite',supportedGenerationMethods:['generateContent']},{name:'models/gemini-audio',supportedGenerationMethods:['generateContent']}]}));return;}
    seen={url:req.url,body:JSON.parse(body),key:req.headers['x-goog-api-key']};count++;
    res.setHeader('content-type','application/json');
    if(mode!==200&&(mode!==503||count===1)){res.statusCode=mode;res.end(JSON.stringify({error:{code:mode,message:mode===403?'API_KEY_INVALID secret must not leak':'temporary unavailable'}}));return;}
    res.end(JSON.stringify({candidates:[{content:{role:'model',parts:[{text:'OFFLINE SDK TRANSPORT FIXTURE'}]},finishReason:'STOP'}],usageMetadata:{promptTokenCount:2,candidatesTokenCount:3,totalTokenCount:5},responseId:'offline-protocol'}));
  });});
  await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
  class ProtocolProvider extends GeminiProvider {async client(k:string){return new GoogleGenAI({apiKey:k,vertexai:false,httpOptions:{baseUrl:'http://127.0.0.1:'+(server.address() as any).port,timeout:2000}});}}
  try {
    const provider=new ProtocolProvider(),k=key();let attempts=0;
    assert.equal(await provider.selectModel(k,()=>{}),'gemini-verified-flash-lite');
    const result=await provider.generate(k,'gemini-offline','Published fixture',[{role:'user',parts:[{text:'Offline only'}]}],()=>{},()=>attempts++);
    assert.equal(count,2);assert.equal(attempts,2);assert.equal(result.usage.total,5);assert.equal(seen.key,k);
    assert.match(seen.url,/generateContent/);assert.equal(seen.body.systemInstruction.parts[0].text,'Published fixture');
    mode=403;count=0;await assert.rejects(provider.generate(k,'gemini-offline','',[{role:'user',parts:[{text:'offline'}]}],()=>{},()=>{}),e=>safeGeminiError(e).category==='credentials');assert.equal(count,1);
    mode=429;count=0;await assert.rejects(provider.generate(k,'gemini-offline','',[{role:'user',parts:[{text:'offline'}]}],()=>{},()=>{}));assert.equal(count,1);
    assert.equal(isGeminiAllowedForPurpose({purpose:'customer_ai_reply',modality:'text'}),false);
    assert.equal(isGeminiAllowedForPurpose({purpose:'owner_campaign_test',ownerInitiated:true,modality:'text'}),true);
    assert.doesNotMatch(safeGeminiError({status:403,message:'API_KEY_INVALID secret must not leak'}).message,/secret must not leak/);
  }finally{server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
