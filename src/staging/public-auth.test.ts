import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { randomUUID } from 'node:crypto';

test('public authentication retains verified production identity, session-bound CSRF and fails closed',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'blackarrow-auth-'));
 const socket=process.platform==='win32'?'\\\\.\\pipe\\blackarrow-'+randomUUID():path.join(dir,'auth.sock');
 process.env.BLACKARROW_PUBLIC='1';process.env.BLACKARROW_DISPOSABLE_TEST='1';process.env.BLACKARROW_AUTH_TEST_SOCKET=socket;
 const actor={id:randomUUID(),email:'owner@blackarrow.test',role:'admin',passwordChangeRequired:false};let fail=false,calls=0;
 const legacy=http.createServer((req,res)=>{calls++;res.setHeader('Content-Type','application/json');if(fail){res.writeHead(503).end('{}');return;}
  if(req.url==='/api/auth/me'){if(req.headers.cookie!=='valid=session'){res.writeHead(401).end('{}');return;}res.end(JSON.stringify({user:actor}));return;}
  if(req.url==='/api/auth/csrf'){res.end(JSON.stringify({csrf:'bound-session-csrf'}));return;}res.writeHead(404).end('{}');
 });
 await new Promise<void>(r=>legacy.listen(socket,r));
 const {productionAccount}=await import('./public-auth');const app=express();app.all('/probe',async(req,res)=>{const u=await productionAccount(req,res);if(u)res.json({id:u.$id,email:u.email});});
 const server=app.listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));const url='http://127.0.0.1:'+(server.address()as any).port+'/probe';
 try{
  assert.equal((await fetch(url,{headers:{'x-user-id':actor.id}})).status,401);
  let r=await fetch(url,{headers:{cookie:'valid=session'}});assert.deepEqual(await r.json(),{id:actor.id,email:actor.email});
  const prior=calls;r=await fetch(url,{method:'POST',headers:{cookie:'valid=session',origin:'https://other.test','x-blackarrow-csrf':'bound-session-csrf'}});assert.equal(r.status,403);assert.equal(calls,prior);
  r=await fetch(url,{method:'POST',headers:{cookie:'valid=session',origin:'https://app.blackgoldfertilizer.com','x-blackarrow-csrf':'forged'}});assert.equal(r.status,403);
  r=await fetch(url,{method:'POST',headers:{cookie:'valid=session',origin:'https://app.blackgoldfertilizer.com','x-blackarrow-csrf':'bound-session-csrf'}});assert.equal(r.status,200);
  actor.passwordChangeRequired=true;assert.equal((await fetch(url,{headers:{cookie:'valid=session'}})).status,403);actor.passwordChangeRequired=false;
  fail=true;assert.equal((await fetch(url,{headers:{cookie:'valid=session'}})).status,503);
 }finally{server.closeAllConnections();await new Promise<void>(r=>server.close(()=>r()));await new Promise<void>(r=>legacy.close(()=>r()));fs.rmSync(dir,{recursive:true,force:true});}
});
