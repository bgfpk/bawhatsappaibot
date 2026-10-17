import { CampaignStore } from '../campaigns/store';
import { now, ensure } from '../campaigns/contracts';
import { GeminiSettings } from './settings-store';
import { GeminiProvider, type Generation } from './provider';
import { GeminiControls } from './controls';
import { TestConversations } from './conversations';
import { campaignPrompt } from './prompt';
import { safeGeminiError } from './errors';
import { automaticLanguage } from '../conversation/language';
import { memoryAllowed } from '../conversation/memory';
import { CampaignPublications } from '../campaigns/publications';

export class GeminiService {
  readonly settings:GeminiSettings;readonly controls=new GeminiControls();readonly conversations=new TestConversations();
  constructor(readonly store:CampaignStore,readonly provider=new GeminiProvider()) {
    this.settings=new GeminiSettings(store);
    store.db.prepare("UPDATE gemini_request_audit SET status='interrupted',error_category='restart' WHERE status='pending'").run();
  }
  private start(account:string,id:string,operation:string,campaign?:string) {
    this.store.db.prepare('INSERT OR IGNORE INTO campaign_accounts VALUES(?)').run(account);
    ensure(!this.store.db.prepare('SELECT id FROM gemini_request_audit WHERE account_id=? AND id=?').get(account,id),
      'This test request was already submitted. Send a new message to retry.',409);
    this.store.db.prepare('INSERT INTO gemini_request_audit(account_id,id,campaign_id,operation,status,created_at) VALUES(?,?,?,?,?,?)')
      .run(account,id,campaign??null,operation,'pending',now());
  }
  private finish(account:string,id:string,attempts:number,result?:Generation,category?:string) {
    this.store.db.prepare(`UPDATE gemini_request_audit SET status=?,model=?,usage=?,error_category=?,attempts=?,provider_response_id=? WHERE account_id=? AND id=?`)
      .run(result?'success':'failed',result?.model??null,result?JSON.stringify(result.usage):null,category??null,attempts,result?.providerResponseId?.slice(0,200)??null,account,id);
  }
  async testConnection(account:string,id:string) {
    const release=this.controls.enter(account);let attempts=0,revision:number|undefined,started=false;
    try {
      const credential=this.settings.credential(account);revision=credential.revision;
      this.start(account,id,'connection');
      started=true;
      const guard=()=>this.settings.guard(account,credential.revision);
      const model=await this.provider.selectModel(credential.key,guard);
      const result=await this.provider.generate(credential.key,model,'Reply briefly to this connection test. Do not include any secrets.',
        [{role:'user',parts:[{text:'Confirm that this Google Gemini connection is responding.'}]}],guard,()=>attempts++);
      this.settings.tested(account,credential.revision,model);this.finish(account,id,attempts,result);
      return {...this.settings.status(account),test:{...result,requestId:id}};
    }catch(error) {
      const safe=safeGeminiError(error);
      if(started&&revision!==undefined){try{this.settings.tested(account,revision,null,safe.category);}catch{}}
      if(started)this.finish(account,id,attempts,undefined,safe.category);throw safe;
    }finally{release();}
  }
  async send(account:string,campaign:string,session:string,input:{requestId:string;message:string;conversationId?:string;language?:string}) {
    this.store.owned(account,campaign);
    const release=this.controls.enter(account);let attempts=0,started=false,createdConversation:string|undefined;
    try {
      const credential=this.settings.credential(account);
      const initial=campaignPrompt(this.store,account,campaign,input.message,automaticLanguage({},input.message).language,[]);
      const conversation=this.conversations.read(account,campaign,session,initial.version,input.conversationId);
      if(!input.conversationId)createdConversation=conversation.id;
      const publication=new CampaignPublications(this.store),remember=memoryAllowed(publication.read(account,campaign)?.snapshot.config,publication.draft(account,campaign));
      const automatic=automaticLanguage(remember?conversation.profile:{},input.message);
      const prompt=campaignPrompt(this.store,account,campaign,input.message,automatic.language,remember?conversation.turns:[]);
      this.start(account,input.requestId,'assistant',campaign);
      started=true;
      const guard=()=>{
        this.settings.guard(account,credential.revision);
        const row=this.store.owned(account,campaign);
        ensure(row.execution_epoch===prompt.epoch&&row.published_version===prompt.version&&['active','paused'].includes(row.lifecycle),
          'Campaign publication or lifecycle changed. Start a new test.',409);
        // Clearing a test while it is in flight also prevents additional attempts.
        this.conversations.read(account,campaign,session,prompt.version,conversation.id);
      };
      const model=credential.model||await this.provider.selectModel(credential.key,guard);
      const result=await this.provider.generate(credential.key,model,prompt.system,prompt.contents,guard,()=>attempts++);
      guard();if(remember)this.conversations.append(conversation.id,input.message,result.text,automatic.profile);
      this.settings.tested(account,credential.revision,model);this.finish(account,input.requestId,attempts,result);
      return {...result,requestId:input.requestId,conversationId:conversation.id,publicationVersion:prompt.version,sources:prompt.sources,contextTruncated:prompt.truncated};
    }catch(error) {
      if(createdConversation){try{this.conversations.clear(account,campaign,session,createdConversation);}catch{}}
      const safe=safeGeminiError(error);if(started)this.finish(account,input.requestId,attempts,undefined,safe.category);throw safe;
    }
    finally{release();}
  }
}
