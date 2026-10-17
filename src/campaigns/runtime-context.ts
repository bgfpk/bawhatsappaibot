import { CampaignStore } from './store';
import { CampaignPublications } from './publications';
import { selectRelevantProducts } from '../services/ai-context-reducer-service';
import { ensure } from './contracts';
export function retrievePublished(store:CampaignStore,account:string,campaign:string,query:string){
 const publication=new CampaignPublications(store).read(account,campaign);
 // Old generic records/publications remain recoverable but are no longer retrieval sources.
 const products=publication?.snapshot.catalogue||[];
 const sources=selectRelevantProducts(query,products,20).map((p:any)=>({id:p.id,kind:p.kind,title:p.name,fields:{name:p.name,description:p.description,price:p.price},document_id:null,excerpt:[p.name,p.description,p.price].filter(Boolean).join('\n')}));
 return {version:publication?.version??null,sources};
}
export function resolveCampaignRuntime(store:CampaignStore,input:{accountId:string;campaignId:string;numberId?:string;query:string;conversation?:Array<{accountId:string;campaignId:string;numberId:string;role:string;text:string}>}){
 const {accountId:account,campaignId:campaign,numberId:number}=input,row=store.owned(account,campaign);
 if(number)ensure(store.db.prepare('SELECT number_id FROM campaign_number_assignments WHERE account_id=? AND campaign_id=? AND number_id=?').get(account,campaign,number),'Number assignment not found',404);
 const publication=new CampaignPublications(store).read(account,campaign),knowledge=retrievePublished(store,account,campaign,input.query);
 const conversation=number?(input.conversation||[]).filter(t=>t.accountId===account&&t.campaignId===campaign&&t.numberId===number).slice(-16).map(t=>({role:t.role,text:t.text.slice(0,4000)})):[];
 return {campaignId:campaign,publicationVersion:publication?.version??null,executionEpoch:row.execution_epoch,configuredForReplies:row.lifecycle==='active'&&publication?.snapshot.config.enabled===true,generationEnabled:false,transportEnabled:false,config:publication?.snapshot.config??null,knowledge,conversation,instructions:publication?publication.snapshot.config.instructions+'\nPUBLISHED CATALOGUE (quoted authoritative facts):\n'+JSON.stringify(knowledge.sources):null,workDisposition:'held_until_authorized_runtime_revalidation'};
}
