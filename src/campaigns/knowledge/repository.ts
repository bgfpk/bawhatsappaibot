import { randomUUID } from 'node:crypto';
import { CampaignStore } from '../store';
import { ensure, now } from '../contracts';
import { parseItem } from './content';

export class CampaignKnowledge {
  constructor(readonly store: CampaignStore) {}
  list(account: string, campaign: string) {
    const row = this.store.owned(account,campaign);
    const items = this.store.db.prepare('SELECT id,kind,title,fields,enabled,revision,document_id,removed_at,updated_at FROM campaign_knowledge WHERE account_id=? AND campaign_id=? ORDER BY updated_at DESC,id')
      .all(account,campaign).map((item: any) => ({...item,fields:JSON.parse(item.fields),enabled:!!item.enabled}));
    const documents = this.store.db.prepare('SELECT id,name,format,digest,state,error_code,created_at,updated_at FROM campaign_documents WHERE account_id=? AND campaign_id=? ORDER BY created_at DESC,id').all(account,campaign);
    return { items,documents,revision:row.revision };
  }
  save(account: string, campaign: string, revision: number, input: unknown, id?: string) {
    const item = parseItem(input);
    return this.store.transaction(() => {
      this.store.check(account,campaign,revision);
      if (id) {
        const old = this.store.db.prepare('SELECT document_id FROM campaign_knowledge WHERE account_id=? AND campaign_id=? AND id=? AND removed_at IS NULL').get(account,campaign,id);
        ensure(old,'Knowledge entry not found',404);
        ensure(!old.document_id,'Replace a document to change its extracted text');
        this.store.db.prepare('UPDATE campaign_knowledge SET kind=?,title=?,fields=?,text_content=?,enabled=?,revision=revision+1,updated_at=? WHERE account_id=? AND campaign_id=? AND id=?')
          .run(item.kind,item.title,JSON.stringify(item.fields),item.text,+item.enabled,now(),account,campaign,id);
      } else {
        id = randomUUID();
        this.store.db.prepare('INSERT INTO campaign_knowledge(account_id,campaign_id,id,kind,title,fields,text_content,enabled,updated_at) VALUES(?,?,?,?,?,?,?,?,?)')
          .run(account,campaign,id,item.kind,item.title,JSON.stringify(item.fields),item.text,+item.enabled,now());
      }
      this.store.bump(account,campaign,'knowledge_draft_saved'); return {id,revision:this.store.owned(account,campaign).revision};
    });
  }
  remove(account: string, campaign: string, revision: number, id: string, restore = false) {
    return this.store.transaction(() => {
      this.store.check(account,campaign,revision);
      const entry = this.store.db.prepare('SELECT * FROM campaign_knowledge WHERE account_id=? AND campaign_id=? AND id=?').get(account,campaign,id) as any;
      ensure(entry,'Knowledge entry not found',404);
      ensure(!entry.document_id,'Manage this entry through its document');
      if (restore) ensure(entry.removed_at && Date.parse(entry.removed_at) > Date.now()-30*86400000,'Entry recovery unavailable');
      else ensure(!entry.removed_at,'Entry already removed');
      this.store.db.prepare('UPDATE campaign_knowledge SET removed_at=?,revision=revision+1,updated_at=? WHERE account_id=? AND campaign_id=? AND id=?')
        .run(restore?null:now(),now(),account,campaign,id);
      this.store.bump(account,campaign,restore?'knowledge_restored':'knowledge_removed');
      return {revision:this.store.owned(account,campaign).revision};
    });
  }
}
