/* Only run against a disposable test container, never the owner's staging state. */
const http=require('node:http');
const assert=require('node:assert/strict');
const fs=require('node:fs');
assert.equal(process.env.BLACKARROW_DISPOSABLE_TEST,'1');
assert.equal(JSON.parse(fs.readFileSync('/state/custody.json')).email,'alpha@blackarrow.test');
async function request(path,method='GET',body,cookie='',origin='http://localhost:3412'){
  const input=body===undefined?undefined:JSON.stringify(body);
  return new Promise((resolve,reject)=>{
    const req=http.request({socketPath:'/state/http.sock',path,method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(input?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(input)}:{})}},res=>{
      let data='';res.on('data',chunk=>data+=chunk);res.on('end',()=>{let result;try{result=JSON.parse(data);}catch{result={};}resolve({status:res.statusCode,data:result,cookie:(res.headers['set-cookie']||[]).map(v=>v.split(';')[0]).join('; ')});});
    });req.setTimeout(15000,()=>req.destroy(Error('API timeout')));req.on('error',reject);req.end(input);
  });
}
(async()=>{
  const evidence={};
  assert.equal((await request('/api/campaigns')).status,401);
  const login=async email=>{const r=await request('/api/auth/login','POST',{email,password:'DisposableTestOnly#2026'});assert.equal(r.status,200);return r.cookie;};
  const a=await login('alpha@blackarrow.test'),b=await login('beta@blackarrow.test');
  const call=async(path,method='GET',body,cookie=a,status=200)=>{const r=await request(path,method,body,cookie);assert.equal(r.status,status,JSON.stringify({path,response:r}));return r.data;};
  assert.equal((await call('/api/campaigns')).campaigns.length,0);
  const create=async(name,cookie)=> (await call('/api/campaigns','POST',{name,description:'Disposable API fixture',timezone:'UTC'},cookie)).campaign;
  const one=await create('Disposable alpha one',a),two=await create('Disposable alpha two',a),foreign=await create('Disposable beta',b);
  const base='/api/campaigns/'+one.id, second='/api/campaigns/'+two.id;
  const revision=async()=> (await call(base)).campaign.revision;
  await call('/api/campaigns/'+foreign.id,'GET',undefined,a,404);
  await call(base,'GET',undefined,b,404);
  await call(base,'PATCH',{expectedRevision:await revision(),metadata:{name:'Disposable alpha edited',description:'',timezone:'UTC'}});
  const config={identity:'Disposable assistant',description:'Fixture',objective:'Test publication only',instructions:'Synthetic instructions first',style:'friendly',languages:['English','Urdu'],enabled:true};
  await call(base+'/assistant','PATCH',{expectedRevision:await revision(),config});
  const note={kind:'note',fields:{title:'Synthetic alpha source',body:'Private alpha-only fact from disposable storage'},enabled:true};
  const item=await call(base+'/knowledge/items','POST',{expectedRevision:await revision(),item:note});
  await call(second+'/knowledge/items/'+item.id,'PATCH',{expectedRevision:(await call(second)).campaign.revision,item:note},a,404);
  await call(base+'/publish','POST',{expectedRevision:await revision()});
  assert.equal((await call(second+'/knowledge/retrieve?query=alpha')).sources.length,0);
  assert.equal((await call(base+'/knowledge/retrieve?query=alpha')).sources[0].title,'Synthetic alpha source');
  await call(base+'/assistant','PATCH',{expectedRevision:await revision(),config:{...config,instructions:'Synthetic instructions second'}});
  let state=await call(base+'/assistant');assert.equal(state.published.config.instructions,config.instructions);assert.equal(state.publicationState,'Pending changes');
  await call(base+'/publish','POST',{expectedRevision:await revision()});
  await call(base+'/rollback','POST',{expectedRevision:await revision(),version:1});
  assert.equal((await call(base+'/assistant')).published.config.instructions,config.instructions);
  await call(base+'/publish','POST',{expectedRevision:1},a,409);
  const document=await call(base+'/knowledge/documents','POST',{expectedRevision:await revision(),name:'synthetic.txt',base64:Buffer.from('Disposable document source for alpha').toString('base64')});
  assert.equal(document.state,'ready');
  await call(second+'/knowledge/documents/'+document.id,'GET',undefined,a,404);
  await call(base+'/knowledge/documents/'+document.id,'GET',undefined,b,404);
  await call(base+'/knowledge/documents','POST',{expectedRevision:await revision(),name:'bad.exe',base64:'eA=='},a,422);
  await call(base+'/publish','POST',{expectedRevision:await revision()});
  const sources=await call(base+'/knowledge/retrieve?query=document');assert.equal(sources.sources[0].document_id,document.id);
  await call(base+'/knowledge/items/'+item.id+'/remove','POST',{expectedRevision:await revision()});
  await call(base+'/knowledge/items/'+item.id+'/restore','POST',{expectedRevision:await revision()});
  for(const action of ['pause','resume','archive','restore']) await call(base+'/lifecycle','POST',{expectedRevision:await revision(),action});
  assert.equal((await call(base)).campaign.lifecycle,'paused');
  await call(base+'/lifecycle','POST',{expectedRevision:await revision(),action:'delete',confirmation:'Disposable alpha edited'});
  assert.equal((await call('/api/recently-deleted')).campaigns.length,1);
  await call(base+'/lifecycle','POST',{expectedRevision:await revision(),action:'cancel_removal'});
  assert.equal((await call(base)).campaign.lifecycle,'paused');
  await call('/api/bots/create','POST',{},a,503);
  await call('/api/user/client-gemini/test','POST',{},a,503);
  assert.equal((await request(base+'/publish','POST',{expectedRevision:await revision()},a,'https://example.invalid')).status,403);
  evidence.real_copied_authentication=true;evidence.owner_and_campaign_isolation=true;evidence.lifecycle_and_recovery=true;
  evidence.draft_publish_rollback=true;evidence.private_document_scope=true;evidence.disabled_ai_and_messaging=true;
  evidence.optimistic_revision_conflict_rejected=true;evidence.fixture_campaign_id=one.id;
  console.log(JSON.stringify(evidence,null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
