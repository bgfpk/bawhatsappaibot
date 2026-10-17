import { EventEmitter } from 'node:events';
import { ensure } from '../campaigns/contracts';
import { openWhatsAppSocket,type SessionSocket } from './socket';
import type { ConnectionFactory } from './baileys';
/** Disposable protocol fixture. This module is not registered by the deployed runtime. */
export function syntheticSocketFactory(){
 ensure(process.env.BLACKARROW_DISPOSABLE_TEST==='1','Disposable storage is required',403);
 const sockets:Array<SessionSocket&{ev:EventEmitter;calls:any[];failure:boolean;auth:any;disposed:boolean}>=[];
 const factory:ConnectionFactory={mode:'synthetic',async codec(){const sdk=await import('@whiskeysockets/baileys');return {replacer:sdk.BufferJSON.replacer,reviver:sdk.BufferJSON.reviver,init:sdk.initAuthCreds,appState:v=>sdk.proto.Message.AppStateSyncKeyData.fromObject(v)};},async open(input){
  input.permit();const id=input.auth.creds.me?.id||String(15550001000+sockets.length)+'@s.whatsapp.net';
  await input.saveCreds({registered:true,me:{id}});
  const ev=new EventEmitter(),socket={ev,calls:[]as any[],failure:false,auth:input.auth,disposed:false,user:{id},ws:{readyState:1},
   async sendMessage(jid:string,body:any,options:any){this.calls.push({jid,body,options});if(this.failure)throw Error('Synthetic completion unknown');return {key:{id:options.messageId,remoteJid:jid}};},
   end(){this.disposed=true;this.ws.readyState=3;}};
  sockets.push(socket);
  return openWhatsAppSocket({permit:input.permit,makeSocket:()=>socket,options:{auth:input.auth,getMessage:input.getMessage},saveCreds:input.saveCreds,connection:input.connection});
 }};
 return {factory,sockets};
}
