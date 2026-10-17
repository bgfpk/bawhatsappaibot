import { CampaignStore } from '../campaigns/store';
import { NumberSessions } from '../numbers/sessions';
import { ensure } from '../campaigns/contracts';
import { ConversationPipeline } from './pipeline';
const instances=new WeakMap<CampaignStore,ConversationPipeline>();
// Private adapter port in the deployed runtime. All live verifiers/activation
// gates remain closed; maintenance performs only local recovery and retention.
export function installConversationRuntime(store:CampaignStore,sessions:NumberSessions){
 const existing=instances.get(store);if(existing)return existing;
 const pipeline=new ConversationPipeline(store,sessions);pipeline.recover();instances.set(store,pipeline);
 const maintenance=setInterval(()=>{try{pipeline.recover();}catch{console.error('[Black Arrow] Conversation recovery maintenance failed');}},60000);
 maintenance.unref();return pipeline;
}
export function conversationRuntime(store:CampaignStore){const pipeline=instances.get(store);ensure(pipeline,'Conversation runtime is unavailable',503);return pipeline;}
