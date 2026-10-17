import { createHash } from 'node:crypto';
import { CampaignStore } from './store';
import { assistantInput, ensure, now } from './contracts';

export class CampaignPublications {
  constructor(readonly store: CampaignStore) {}
  draft(account: string, id: string): any {
    this.store.owned(account,id);
    return JSON.parse(String(this.store.db.prepare('SELECT config FROM campaign_drafts WHERE account_id=? AND campaign_id=?').get(account,id)!.config));
  }
  snapshot(account: string, id: string) {
    return {config:this.draft(account,id),catalogue:this.store.db.prepare('SELECT id,kind,name,description,price,revision FROM campaign_catalogue WHERE account_id=? AND campaign_id=? AND archived_at IS NULL ORDER BY id').all(account,id),knowledge:[],documents:[]};
  }
  read(account: string, id: string, version?: number): any {
    const row = this.store.owned(account,id), selected = version ?? row.published_version;
    if (!selected) return null;
    const pub = this.store.db.prepare('SELECT * FROM campaign_publications WHERE account_id=? AND campaign_id=? AND version=?').get(account,id,selected) as any;
    ensure(pub,'Published revision not found',404);
    return {...pub,snapshot:JSON.parse(pub.snapshot)};
  }
  state(account: string, id: string) {
    const campaign = this.store.owned(account,id), published = this.read(account,id);
    return { campaign:this.store.summary(campaign), draft:this.draft(account,id), published:published ?
      { version:published.version,created_at:published.created_at,config:published.snapshot.config } : null,
      publicationState: !published ? 'Draft' : JSON.stringify(this.snapshot(account,id))===JSON.stringify(published.snapshot) ? 'Published' : 'Pending changes' };
  }
  save(account: string, id: string, revision: number, input: unknown) {
    const config = assistantInput.parse(input);
    return this.store.transaction(() => {
      this.store.check(account,id,revision);
      // Retain hidden legacy/privacy choices without exposing obsolete inputs.
      const retained={...this.draft(account,id),...config};
      this.store.db.prepare('UPDATE campaign_drafts SET config=? WHERE account_id=? AND campaign_id=?').run(JSON.stringify(retained),account,id);
      this.store.bump(account,id,'instructions_draft_saved'); return this.state(account,id);
    });
  }
  private append(account: string, id: string, snapshot: any, restoredFrom: number|null) {
    const current = this.store.owned(account,id);
    const version = Number(this.store.db.prepare('SELECT COALESCE(MAX(version),0)+1 v FROM campaign_publications WHERE account_id=? AND campaign_id=?').get(account,id)!.v);
    this.store.db.prepare('INSERT INTO campaign_publications VALUES(?,?,?,?,?,?,?)')
      .run(account,id,version,JSON.stringify(snapshot),current.revision,restoredFrom,now());
    this.store.db.prepare('UPDATE campaign_workspaces SET published_version=?,execution_epoch=execution_epoch+1,work_hold=1 WHERE account_id=? AND id=?').run(version,account,id);
    this.store.bump(account,id,restoredFrom ? 'publication_rolled_back' : 'published',{version,restoredFrom});
    return this.state(account,id);
  }
  publish(account: string, id: string, revision: number) {
    return this.store.transaction(() => {
      this.store.check(account,id,revision);
      const snapshot = this.snapshot(account,id);
      ensure(snapshot.config.instructions,'Save AI instructions before publishing',422);
      return this.append(account,id,snapshot,null);
    });
  }
  rollback(account: string, id: string, revision: number, version: number) {
    return this.store.transaction(() => {
      this.store.check(account,id,revision);
      return this.append(account,id,this.read(account,id,version).snapshot,version);
    });
  }
  history(account: string, id: string) {
    this.store.owned(account,id);
    return this.store.db.prepare('SELECT version,created_at,restored_from,source_revision FROM campaign_publications WHERE account_id=? AND campaign_id=? ORDER BY version DESC').all(account,id);
  }
}
