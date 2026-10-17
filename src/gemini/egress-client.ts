import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { GeminiError } from './errors';

let bridge:Promise<string>|undefined;
// The SDK uses loopback HTTP inside a network=none container. The only upstream
// is this private Unix socket; the gateway validates every operation and TLS peer.
export function geminiBaseUrl():Promise<string> {
  if(bridge)return bridge;
  bridge=new Promise((resolve,reject)=>{
    const socketPath=process.env.BLACKARROW_GEMINI_EGRESS_SOCKET;
    if(process.env.BLACKARROW_STAGE!=='1'||socketPath!=='/egress/gemini.sock') {
      reject(new GeminiError('egress','Restricted Gemini connectivity is unavailable.',503));return;
    }
    const server=http.createServer((req,res)=>{
      if(!/^(GET|POST)$/.test(req.method||'')||!req.url?.startsWith('/v1beta/models')) {res.writeHead(403).end();return;}
      const upstream=http.request({socketPath,path:req.url,method:req.method,headers:{
        'content-type':'application/json',...(req.headers['content-length']?{'content-length':req.headers['content-length']}:{}),
        'x-goog-api-key':String(req.headers['x-goog-api-key']||'')
      }},reply=>{
        res.writeHead(reply.statusCode||502,{'content-type':'application/json',...(reply.headers['retry-after']?{'retry-after':reply.headers['retry-after']}:{})});
        reply.pipe(res);
      });
      upstream.setTimeout(35000,()=>upstream.destroy());
      upstream.on('error',()=>{if(!res.headersSent)res.writeHead(503,{'content-type':'application/json'});res.end('{"error":{"code":503,"message":"Restricted Gemini gateway unavailable"}}');});
      req.on('aborted',()=>upstream.destroy());res.on('close',()=>{if(!res.writableFinished)upstream.destroy();});
      req.pipe(upstream);
    });
    server.maxConnections=4;server.requestTimeout=40000;server.on('error',reject);
    server.listen(0,'127.0.0.1',()=>{server.unref();resolve('http://127.0.0.1:'+(server.address() as AddressInfo).port);});
  });
  bridge.catch(()=>{bridge=undefined;});return bridge;
}
