import { normalizeBaileysIncomingMessage } from '../services/baileys-transport-normalizer';
/** Extracted notify/fromMe/group/status filtering from transferred bot-worker.ts.
 * Only a trusted socket may resolve an LID to its verified phone identity. */
export function isIncomingNotification(event:any){return event?.type==='notify'&&Array.isArray(event.messages);}
export async function incomingMessages(event:any,resolve:(jid:string)=>Promise<string>){
 if(!isIncomingNotification(event))return [];
 const result:Array<{providerMessageId:string;customerId:string;text:string}>=[];
 for(const raw of event.messages.slice(0,100)){
  if(raw?.key?.fromMe||raw?.messageStubType||raw?.message?.protocolMessage)continue;
  const m=normalizeBaileysIncomingMessage(raw);
  if(m.isGroup||m.messageType!=='text'||!m.text?.trim()||!m.messageId||m.text.length>4000)continue;
  const jid=String(m.chatId||'');if(!/^\d+(?::\d+)?@(s\.whatsapp\.net|lid|hosted\.lid)$/.test(jid))continue;
  const customerId=await resolve(jid);if(!/^\d+@(s\.whatsapp\.net|lid|hosted\.lid)$/.test(customerId))continue;
  result.push({providerMessageId:m.messageId,customerId,text:m.text});
 }
 return result;
}
