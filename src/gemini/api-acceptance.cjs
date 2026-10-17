/* Offline API acceptance on disposable storage. No Google endpoint is enabled. */
const http=require('node:http'),assert=require('node:assert/strict'),fs=require('node:fs');
const {randomUUID,randomBytes}=require('node:crypto');
assert.equal(process.env.BLACKARROW_DISPOSABLE_TEST,'1');
assert.equal(JSON.parse(fs.readFileSync('/state/custody.json')).email,'alpha@blackarrow.test');
assert.equal(process.env.BLACKARROW_GEMINI_EGRESS_SOCKET,undefined);
async function request(path,method='GET',body,cookie='',origin='http://localhost:3412'){
 const input=body===undefined?undefined:JSON.stringify(body);
 return new Promise((resolve,reject)=>{const req=http.request({socketPath:'/state/http.sock',path,method,headers:{Origin:origin,...(cookie?{Cookie:cookie}:{}),...(input?{'Content-Type':'application/json','Content-Length':Buffer.byteLength(input)}:{})}},res=>{
 let text='';res.on('data',c=>text+=c);res.on('end',()=>resolve({status:res.statusCode,data:JSON.parse(text),cookie:(res.headers['set-cookie']||[]).map(v=>v.split(';')[0]).join('; ')}));});req.setTimeout(20000,()=>req.destroy(Error('API timeout')));req.on('error',reject);req.end(input);});
}
(async()=>{
 const base='/api/account/ai/gemini';
 assert.equal((await request(base)).status,401);
 const login=async email=>{const r=await request('/api/auth/login','POST',{email,password:'DisposableTestOnly#2026'});assert.equal(r.status,200);return r.cookie;};
 const a=await login('alpha@blackarrow.test'),b=await login('beta@blackarrow.test');
 const call=async(path,method='GET',body,cookie=a,status=200)=>{const r=await request(path,method,body,cookie);assert.equal(r.status,status,JSON.stringify({path,status:r.status,error:r.data.error}));return r.data;};
 const first='AIza'+randomBytes(24).toString('base64url'),second='AQ.'+randomBytes(300).toString('base64url');
 let state=await call(base);assert.equal(state.configured,false);
 assert.equal((await request(base+'/save','POST',{apiKey:first,expectedRevision:0},a,'https://example.invalid')).status,403);
 await call(base+'/save','POST',{apiKey:'invalid',expectedRevision:0},a,422);
 state=await call(base+'/save','POST',{apiKey:first,expectedRevision:0});assert.equal(state.configured,true);assert.equal(state.masked,'••••••••');assert.equal(JSON.stringify(state).includes(first),false);
 assert.equal((await call(base,'GET',undefined,b)).configured,false);
 await call(base+'/remove','POST',{expectedRevision:1},b,409);
 await call(base+'/save','POST',{apiKey:second,expectedRevision:0},a,409);
 state=await call(base+'/save','POST',{apiKey:second,expectedRevision:1});assert.equal(state.revision,2);
 await call(base+'/save','POST',{apiKey:first,expectedRevision:2,accountId:'beta'},a,422);
 const campaign=(await call('/api/campaigns','POST',{name:'Disposable Gemini fixture',description:'',timezone:'UTC'})).campaign;
 const target='/api/campaigns/'+campaign.id+'/assistant/test';
 await call(target+'/status','GET',undefined,b,404);
 await call(target,'POST',{requestId:randomUUID(),message:'Offline test',language:'auto'},a,422);
 await call(base+'/remove','POST',{expectedRevision:2});assert.equal((await call(base)).configured,false);
 await call(base+'/test','POST',{requestId:randomUUID()},a,422);
 await call(target+'/clear','POST',{conversationId:randomUUID()},b,404);
 await call('/api/bots/create','POST',{},a,503);
 await call('/api/user/client-gemini/test','POST',{},a,503);
 const {DatabaseSync}=require('node:sqlite');const db=new DatabaseSync('/state/blackarrow.sqlite');
 db.exec('PRAGMA wal_checkpoint(TRUNCATE)');db.close();
 for(const name of fs.readdirSync('/state').filter(name=>name.startsWith('blackarrow.sqlite'))){const bytes=fs.readFileSync('/state/'+name);assert.equal(bytes.includes(Buffer.from(first)),false);assert.equal(bytes.includes(Buffer.from(second)),false);}
 console.log(JSON.stringify({actual_compiled_express_auth:true,key_save_replace_remove:true,plaintext_storage_and_api_disclosure:false,account_campaign_and_origin_isolation:true,missing_key_and_unpublished_errors:true,legacy_generation_and_whatsapp_disabled:true,external_google_calls:0},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
