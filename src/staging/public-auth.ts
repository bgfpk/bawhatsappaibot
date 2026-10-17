import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import type { Express } from 'express';
import { stageDocuments } from './document-store';
import { allowedOrigin, isPublicConversion } from './origin';

export type AuthReply = {status:number; body:any; cookies:string[]};
export function authRequest(req:any, path:string, method='GET', body?:unknown, cookie?:string):Promise<AuthReply> {
  return new Promise((resolve,reject)=>{
    const data=body===undefined?undefined:JSON.stringify(body);
    const headers:Record<string,string>={cookie:cookie??String(req.headers.cookie||''),'x-blackarrow-csrf':String(req.get('x-blackarrow-csrf')||'')};
    if(data){headers['content-type']='application/json';headers['content-length']=String(Buffer.byteLength(data));}
    const call=http.request({socketPath:process.env.BLACKARROW_DISPOSABLE_TEST==='1'?(process.env.BLACKARROW_AUTH_TEST_SOCKET||'/auth/auth.sock'):'/auth/auth.sock',path,method,headers,timeout:10000},response=>{
      let text='';response.on('data',chunk=>{text+=chunk;if(text.length>32768)call.destroy(new Error('Invalid authentication response'));});
      response.on('end',()=>{try{resolve({status:response.statusCode||503,body:JSON.parse(text),cookies:response.headers['set-cookie']||[]});}catch{reject(new Error('Authentication unavailable'));}});
    });
    call.on('timeout',()=>call.destroy(new Error('Authentication timeout')));call.on('error',reject);call.end(data);
  });
}
function equal(a:string,b:string){return !!a&&Buffer.byteLength(a)===Buffer.byteLength(b)&&timingSafeEqual(Buffer.from(a),Buffer.from(b));}
export async function productionAccount(req:any,res:any) {
  try {
    if(!['GET','HEAD','OPTIONS'].includes(req.method)&&!allowedOrigin(req.get('origin'))) {res.status(403).json({error:'A same-origin request is required'});return;}
    const r=await authRequest(req,'/api/auth/me');
    if(r.status!==200||!r.body.user?.id){res.status(r.status===401?401:503).json({error:r.status===401?'Authentication required':'Authentication unavailable'});return;}
    const user=r.body.user;
    if(user.passwordChangeRequired){res.status(403).json({error:'PASSWORD_CHANGE_REQUIRED'});return;}
    if(!['GET','HEAD','OPTIONS'].includes(req.method)) {
      const csrf=await authRequest(req,'/api/auth/csrf');
      if(csrf.status!==200||!equal(String(req.get('x-blackarrow-csrf')||''),String(csrf.body.csrf||''))){res.status(403).json({error:'Request verification failed'});return;}
    }
    return {...user,$id:user.id,name:user.email};
  }catch{res.status(503).json({error:'Authentication unavailable'});}
}
export function installPublicAuth(app:Express){
  if(!isPublicConversion)return;
  app.get('/api/release',(_req,res)=>res.json({public:true,sha:process.env.BLACKARROW_RELEASE_SHA||'uncommitted'}));
  app.get('/api/auth/csrf',async(req,res)=>{try{const r=await authRequest(req,'/api/auth/csrf');if(r.cookies.length)res.setHeader('Set-Cookie',r.cookies);res.status(r.status).json(r.body);}catch{res.status(503).json({error:'Authentication unavailable'});}});
  for(const [local,remote]of [['login','password/login'],['logout','logout'],['password/change','password/change']])app.post('/api/auth/'+local,async(req,res)=>{
    if(!allowedOrigin(req.get('origin')))return res.status(403).json({error:'A same-origin request is required'});
    try{
      const body=local==='login'?{email:req.body?.email,password:req.body?.password}:req.body;
      const r=await authRequest(req,'/api/auth/'+remote,'POST',body);
      if(r.cookies.length)res.setHeader('Set-Cookie',r.cookies);
      if(local==='login'&&r.status===200){
        const cookie=r.cookies.map(c=>c.split(';')[0]).join('; '),who=await authRequest(req,'/api/auth/me','GET',undefined,cookie);
        if(who.status!==200)return res.status(503).json({error:'Unable to verify signed-in account'});
        return res.json({user:{...who.body.user,name:who.body.user.email}});
      }
      res.status(r.status).json(r.body);
    }catch{res.status(503).json({error:'Authentication unavailable'});}
  });
  app.get('/api/auth/session',async(req,res)=>{try{const r=await authRequest(req,'/api/auth/me');res.status(r.status).json(r.body.user?{user:{...r.body.user,name:r.body.user.email}}:r.body);}catch{res.status(503).json({error:'Authentication unavailable'});}});
  app.get('/api/user/preferences',async(req,res)=>{const u=await productionAccount(req,res);if(!u)return;try{const p=await stageDocuments().getDocument('blackarrow_stage','user_preferences',u.id);res.json({showGetStarted:p.showGetStarted===true});}catch{res.json({showGetStarted:false});}});
  app.patch('/api/user/preferences',async(req,res)=>{const u=await productionAccount(req,res);if(!u)return;if(typeof req.body?.showGetStarted!=='boolean')return res.status(422).json({error:'Invalid preference'});const d=stageDocuments();try{await d.getDocument('blackarrow_stage','user_preferences',u.id);await d.updateDocument('blackarrow_stage','user_preferences',u.id,{showGetStarted:req.body.showGetStarted});}catch{await d.createDocument('blackarrow_stage','user_preferences',u.id,{showGetStarted:req.body.showGetStarted});}res.json({showGetStarted:req.body.showGetStarted});});
}
