import { ensure } from '../campaigns/contracts';
import { openWhatsAppSocket,type SessionSocket } from './socket';
import type { AuthCodec } from './auth';
export type SocketHandle={socket:SessionSocket;dispose:()=>void};
export interface ConnectionFactory {
 mode:'synthetic'|'verified';
 codec():Promise<AuthCodec>;
 open(input:{permit:()=>void;auth:any;saveCreds:(value:any)=>Promise<void>;connection:(event:any)=>void;getMessage:(key:any)=>Promise<any>}):Promise<SocketHandle>;
}
/** Uses the real transferred socket setup, with independent injected auth.
 * A Baileys install is not platform authorization. No default factory is activated. */
export function baileysConnectionFactory(network?:{agent:any;fetchAgent:any}):ConnectionFactory {
 return {mode:'verified',async codec(){
  const sdk=await import('@whiskeysockets/baileys');
  return {replacer:sdk.BufferJSON.replacer,reviver:sdk.BufferJSON.reviver,init:sdk.initAuthCreds,appState:v=>sdk.proto.Message.AppStateSyncKeyData.fromObject(v)};
 },async open(input){
  input.permit();ensure(network?.agent&&network.fetchAgent,'An approved transport network boundary is required',503);
  const sdk=await import('@whiskeysockets/baileys');input.permit();
  const {version}=await sdk.fetchLatestBaileysVersion({dispatcher:network.fetchAgent}as any);input.permit();
  const logger:any={level:'silent',child(){return this;},trace(){},debug(){},info(){},warn(){},error(){}};
  return openWhatsAppSocket({permit:input.permit,makeSocket:sdk.default as any,saveCreds:input.saveCreds,connection:input.connection,
   options:{version,browser:sdk.Browsers.ubuntu('Desktop'),auth:{creds:input.auth.creds,keys:sdk.makeCacheableSignalKeyStore(input.auth.keys,logger)},
    agent:network.agent,fetchAgent:network.fetchAgent,options:{dispatcher:network.fetchAgent},logger,printQRInTerminal:false,markOnlineOnConnect:false,syncFullHistory:false,
    connectTimeoutMs:90000,defaultQueryTimeoutMs:30000,keepAliveIntervalMs:20000,retryRequestDelayMs:8000,getMessage:input.getMessage}});
 }};
}
