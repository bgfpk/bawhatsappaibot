import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { CampaignStore } from '../campaigns/store';
import { ensure,now } from '../campaigns/contracts';
import { normalize,unsafe } from '../campaigns/knowledge/content';

const input=z.object({kind:z.enum(['product','service']),name:z.string().trim().min(1).max(120),
  description:z.string().trim().max(3000),price:z.string().trim().max(120).default('')}).strict();
export class CampaignCatalogue {
  constructor(readonly store:CampaignStore){}
  list(account:string,campaign:string){
    const c=this.store.owned(account,campaign);
    return {items:this.store.db.prepare('SELECT id,kind,name,description,price,revision,archived_at FROM campaign_catalogue WHERE account_id=? AND campaign_id=? ORDER BY name COLLATE NOCASE,id').all(account,campaign),revision:c.revision};
  }
  save(account:string,campaign:string,revision:number,value:unknown,id?:string){
    const v=input.parse(value);
    for(const key of ['name','description','price'] as const){v[key]=normalize(v[key]);ensure(!unsafe(v[key]),'Remove instructions or executable content from catalogue facts.',422);}
    return this.store.transaction(()=>{
      this.store.check(account,campaign,revision);
      if(id){
        ensure(this.store.db.prepare('SELECT id FROM campaign_catalogue WHERE account_id=? AND campaign_id=? AND id=? AND archived_at IS NULL').get(account,campaign,id),'Product or service not found',404);
        this.store.db.prepare('UPDATE campaign_catalogue SET kind=?,name=?,description=?,price=?,revision=revision+1,updated_at=? WHERE account_id=? AND campaign_id=? AND id=?')
          .run(v.kind,v.name,v.description,v.price,now(),account,campaign,id);
      }else{
        id=randomUUID();this.store.db.prepare('INSERT INTO campaign_catalogue(account_id,campaign_id,id,kind,name,description,price,updated_at) VALUES(?,?,?,?,?,?,?,?)')
          .run(account,campaign,id,v.kind,v.name,v.description,v.price,now());
      }
      this.store.bump(account,campaign,'catalogue_draft_saved');return {id,...this.list(account,campaign)};
    });
  }
  archive(account:string,campaign:string,revision:number,id:string,restore=false){
    return this.store.transaction(()=>{
      this.store.check(account,campaign,revision);
      const item=this.store.db.prepare('SELECT * FROM campaign_catalogue WHERE account_id=? AND campaign_id=? AND id=?').get(account,campaign,id);
      ensure(item,'Product or service not found',404);ensure(Boolean(item.archived_at)===restore,'This catalogue item changed. Reload before editing.');
      this.store.db.prepare('UPDATE campaign_catalogue SET archived_at=?,revision=revision+1,updated_at=? WHERE account_id=? AND campaign_id=? AND id=?').run(restore?null:now(),now(),account,campaign,id);
      this.store.bump(account,campaign,restore?'catalogue_restored':'catalogue_archived');return this.list(account,campaign);
    });
  }
}
