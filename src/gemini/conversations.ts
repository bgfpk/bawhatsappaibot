import { randomUUID } from 'node:crypto';
import { GeminiError } from './errors';
export type Turn={role:'user'|'model';text:string};
type Conversation={account:string;campaign:string;session:string;version:number;expires:number;turns:Turn[];profile:any};
export class TestConversations {
  private entries=new Map<string,Conversation>();
  private prune(){for(const [id,c]of this.entries)if(c.expires<Date.now())this.entries.delete(id);}
  read(account:string,campaign:string,session:string,version:number,id?:string) {
    this.prune();
    if(id) {
      const c=this.entries.get(id);
      if(!c||c.account!==account||c.campaign!==campaign||c.session!==session)
        throw new GeminiError('conversation','Test conversation unavailable. Clear it and start again.',404);
      if(c.version!==version){c.turns=[];c.profile={};c.version=version;}
      return {id,turns:[...c.turns],profile:{...c.profile}};
    }
    if([...this.entries.values()].filter(c=>c.account===account).length>=20||this.entries.size>=200)
      throw new GeminiError('busy','Clear an earlier test conversation and try again.',429);
    const next=randomUUID();this.entries.set(next,{account,campaign,session,version,expires:Date.now()+30*60000,turns:[],profile:{}});
    return {id:next,turns:[],profile:{}};
  }
  append(id:string,question:string,reply:string,profile:any={}) {
    const c=this.entries.get(id);if(!c)throw new GeminiError('conversation','Conversation was cleared. Start a new test.',409);
    c.turns=[...c.turns,{role:'user' as const,text:question},{role:'model' as const,text:reply}].slice(-12);
    c.expires=Date.now()+30*60000;
    c.profile=profile;
  }
  clear(account:string,campaign:string,session:string,id:string) {
    const c=this.entries.get(id);
    if(!c||c.account!==account||c.campaign!==campaign||c.session!==session)
      throw new GeminiError('conversation','Test conversation not found.',404);
    this.entries.delete(id);
  }
}
