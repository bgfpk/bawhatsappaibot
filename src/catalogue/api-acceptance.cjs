/* Actual compiled Express API; separate disposable accounts, no external calls. */
const http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs');
assert.equal(process.env.BLACKARROW_DISPOSABLE_TEST,'1');assert.equal(JSON.parse(fs.readFileSync('/state/custody.json')).email,'alpha@blackarrow.test');
async function request(path,method='GET',body,cookie='',origin='http://localhost:3412'){
 const input=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{const req=http.request({socketPath:'/state/http.sock',path,method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(input?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(input)}:{})}},res=>{
  let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:(res.headers['set-cookie']||[]).map(v=>v.split(';')[0]).join('; ')}));});req.setTimeout(15000,()=>req.destroy(Error('API timeout')));req.on('error',reject);req.end(input);});
}
(async()=>{
 assert.equal((await request('/api/campaigns')).status,401);
 const login=async email=>{const r=await request('/api/auth/login','POST',{email,password:'DisposableTestOnly#2026'});assert.equal(r.status,200);return r.cookie;};
 const a=await login('alpha@blackarrow.test'),b=await login('beta@blackarrow.test');
 const call=async(path,method='GET',body,cookie=a,status=200)=>{const r=await request(path,method,body,cookie);assert.equal(r.status,status,JSON.stringify({path,status:r.status,error:r.data.error}));return r.data;};
 const campaign=(await call('/api/campaigns','POST',{name:'Disposable catalogue fixture',description:'Fixture only'})).campaign;
 assert.equal(campaign.timezone,'Asia/Karachi');const base='/api/campaigns/'+campaign.id;
 const state=()=>call(base);const revision=async()=>(await state()).campaign.revision;
 await call(base+'/assistant','PATCH',{expectedRevision:await revision(),config:{instructions:'PUBLISHED API INSTRUCTIONS',enabled:true}});
 const item={kind:'service',name:'Disposable service',description:'Synthetic description',price:'PKR 450'};
 let saved=await call(base+'/catalogue','POST',{expectedRevision:await revision(),item});const id=saved.id;
 await call(base+'/catalogue','GET',undefined,b,404);
 await call(base+'/catalogue/'+id,'PATCH',{expectedRevision:saved.revision-1,item},a,409);
 assert.equal((await request(base+'/catalogue','POST',{expectedRevision:await revision(),item},a,'https://example.invalid')).status,403);
 await call(base+'/catalogue/'+id,'PATCH',{expectedRevision:await revision(),item:{...item,description:'Edited fixture'}});
 await call(base+'/publish','POST',{expectedRevision:await revision()});
 let published=await call(base+'/knowledge/retrieve?query=service');assert.equal(published.sources[0].fields.price,'PKR 450');assert.equal(published.sources[0].fields.description,'Edited fixture');
 await call(base+'/catalogue/'+id,'PATCH',{expectedRevision:await revision(),item:{...item,price:'PKR 999'}});
 assert.equal((await call(base+'/knowledge/retrieve?query=service')).sources[0].fields.price,'PKR 450');
 await call(base+'/assistant','PATCH',{expectedRevision:await revision(),config:{instructions:'DRAFT API INSTRUCTIONS',enabled:true}});
 assert.equal((await state()).published.config.instructions,'PUBLISHED API INSTRUCTIONS');
 await call(base+'/catalogue/'+id+'/archive','POST',{expectedRevision:await revision()});await call(base+'/publish','POST',{expectedRevision:await revision()});
 assert.equal((await call(base+'/knowledge/retrieve')).sources.length,0);assert.equal((await call(base+'/catalogue')).items.length,1);
 await call(base+'/catalogue/'+id+'/restore','POST',{expectedRevision:await revision()});await call(base+'/publish','POST',{expectedRevision:await revision()});
 assert.equal((await call(base+'/knowledge/retrieve')).sources[0].fields.price,'PKR 999');
 assert.equal((await call(base+'/assistant/alerts')).alerts.length,0);await call(base+'/assistant/alerts','GET',undefined,b,404);
 await call(base+'/assistant/memory/reset','POST',{confirmation:'wrong'},a,422);
 await call(base+'/assistant/memory/reset','POST',{confirmation:'RESET SAVED CONTEXT'});
 await call(base+'/assistant/inbound','POST',{},a,503);
 assert.equal((await call('/api/account/ai/gemini')).configured,false);
 console.log(JSON.stringify({compiled_auth_origin_and_ownership:true,catalogue_create_edit_archive_restore:true,published_draft_separation:true,simple_instruction_publication:true,internal_timezone:true,alerts_and_reset_authorization:true,no_inbound_or_sending_endpoint:true,google_calls:0,customer_sends:0},null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
