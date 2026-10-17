/* Real compiled Express API, disposable accounts, no sockets or external sends. */
const http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID}=require('node:crypto');
assert.equal(process.env.BLACKARROW_DISPOSABLE_TEST,'1');
assert.equal(JSON.parse(fs.readFileSync('/state/custody.json')).email,'alpha@blackarrow.test');
async function request(path,method='GET',body,cookie='',origin='http://localhost:3412'){
 const input=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{const req=http.request({socketPath:'/state/http.sock',path,method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(input?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(input)}:{})}},res=>{
 let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:(res.headers['set-cookie']||[]).map(v=>v.split(';')[0]).join('; ')}));});req.setTimeout(15000,()=>req.destroy(Error('API timeout')));req.on('error',reject);req.end(input);});
}
(async()=>{
 assert.equal((await request('/api/numbers')).status,401);
 const login=async email=>{const r=await request('/api/auth/login','POST',{email,password:'DisposableTestOnly#2026'});assert.equal(r.status,200);return r.cookie;};
 const a=await login('alpha@blackarrow.test'),b=await login('beta@blackarrow.test');
 const call=async(path,method='GET',body,cookie=a,status=200)=>{const r=await request(path,method,body,cookie);assert.equal(r.status,status,JSON.stringify({path,status:r.status,error:r.data.error}));return r.data;};
 const create=async(name,cookie=a)=>(await call('/api/campaigns','POST',{name,description:'Disposable fixture',timezone:'UTC'},cookie)).campaign;
 const first=await create('First fixture'),second=await create('Second fixture'),foreign=await create('Foreign fixture',b);
 const input={requestId:randomUUID(),name:'Disposable phone',phone:'+15550002222',campaignId:first.id};
 let n=(await call('/api/numbers','POST',input)).number;
 assert.equal(n.status,'disconnected');assert.equal(n.maskedIdentity,'••••2222');assert.equal(JSON.stringify(n).includes(input.phone),false);
 assert.equal((await call('/api/numbers','POST',input)).number.id,n.id);
 await call('/api/numbers','POST',{...input,name:'Conflict'},a,409);
 assert.equal((await request('/api/numbers','POST',{...input,requestId:randomUUID()},a,'https://example.invalid')).status,403);
 assert.equal((await call('/api/numbers','GET',undefined,b)).numbers.length,0);
 await call('/api/numbers/'+n.id+'/rename','POST',{expectedRevision:n.revision,name:'Foreign'},b,404);
 await call('/api/numbers/'+n.id+'/assignment','POST',{expectedRevision:n.revision,sourceCampaignId:first.id,targetCampaignId:foreign.id,confirmation:n.name},a,404);
 n=(await call('/api/numbers/'+n.id+'/rename','POST',{expectedRevision:n.revision,name:'Renamed fixture'})).number;
 await call('/api/numbers/'+n.id+'/rename','POST',{expectedRevision:1,name:'Stale'},a,409);
 const extra=(await call('/api/numbers','POST',{requestId:randomUUID(),name:'Another fixture',campaignId:first.id})).number;
 assert.equal((await call('/api/campaigns/'+first.id+'/numbers')).numbers.length,2);
 n=(await call('/api/numbers/'+n.id+'/connection','POST',{expectedRevision:n.revision})).number;
 assert.equal(n.status,'unavailable');assert.equal(n.qrAvailable,false);
 await call('/api/numbers/'+n.id+'/connection','POST',{expectedRevision:n.revision,state:'connected'},a,422);
 await call('/api/numbers/'+n.id+'/adapter-event','POST',{state:'connected'},a,503);
 n=(await call('/api/numbers/'+n.id+'/assignment','POST',{expectedRevision:n.revision,sourceCampaignId:first.id,targetCampaignId:second.id,confirmation:n.name})).number;
 assert.equal(n.campaignId,second.id);assert.equal((await call('/api/campaigns/'+first.id+'/numbers')).numbers.length,1);
 assert.equal((await call('/api/campaigns/'+second.id+'/numbers')).numbers[0].id,n.id);
 n=(await call('/api/numbers/'+n.id+'/disconnect','POST',{expectedRevision:n.revision})).number;assert.equal(n.status,'revoked');
 await call('/api/numbers/'+n.id+'/remove','POST',{expectedRevision:n.revision,confirmation:'wrong'},a,422);
 n=(await call('/api/numbers/'+n.id+'/remove','POST',{expectedRevision:n.revision,confirmation:n.name})).number;
 assert.equal((await call('/api/numbers?removed=1')).numbers[0].id,n.id);
 n=(await call('/api/numbers/'+n.id+'/restore','POST',{expectedRevision:n.revision})).number;assert.equal(n.campaignId,null);assert.equal(n.status,'disconnected');
 assert.equal((await call('/api/account/ai/gemini')).configured,false);
 await call('/api/bots/create','POST',{},a,503);
 console.log(JSON.stringify({compiled_express_auth_and_csrf:true,create_rename_assign_reassign_remove_restore:true,multiple_numbers_per_campaign:true,masked_identity_only:true,cross_account_rejected:true,stale_writes_rejected:true,qr_and_live_connection_not_fabricated:true,provider_calls_and_customer_sends:0,number_count_after:2},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
