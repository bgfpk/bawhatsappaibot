import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';
import { applyCampaignMigrations, saveDraftHistory } from './migrations';
import { emptyAssistant, ensure, metadataInput, now } from './contracts';

export class CampaignStore {
  readonly db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec('PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;');
    applyCampaignMigrations(this.db);
    this.transaction(() => {
      const interrupted = this.db.prepare("SELECT DISTINCT account_id,campaign_id FROM campaign_documents WHERE state='processing'").all();
      this.db.prepare("UPDATE campaign_documents SET state='failed',error_code='PROCESSING_INTERRUPTED',updated_at=? WHERE state='processing'").run(now());
      for (const scope of interrupted) this.bump(String(scope.account_id),String(scope.campaign_id),'document_processing_interrupted');
    });
  }
  transaction<T>(work: () => T): T {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = work(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  owned(account: string, id: string, write = false): any {
    const row = this.db.prepare('SELECT * FROM campaign_workspaces WHERE account_id=? AND id=?').get(account, id);
    ensure(row, 'Campaign not found', 404);
    if (write) ensure(['active','paused'].includes(String(row.lifecycle)), 'Restore this campaign before editing');
    return row;
  }
  check(account: string, id: string, revision: number, write = true) {
    const row = this.owned(account, id, write);
    ensure(row.revision === revision, 'This campaign changed. Reload before saving.');
    return row;
  }
  audit(account: string, id: string, action: string, metadata: object = {}) {
    this.db.prepare('INSERT INTO campaign_audit(account_id,campaign_id,action,metadata,created_at) VALUES(?,?,?,?,?)')
      .run(account, id, action, JSON.stringify(metadata), now());
  }
  bump(account: string, id: string, action: string, metadata: object = {}) {
    this.db.prepare('UPDATE campaign_workspaces SET revision=revision+1,updated_at=? WHERE account_id=? AND id=?').run(now(),account,id);
    this.audit(account,id,action,metadata);
    saveDraftHistory(this.db,account,id);
  }
  summary(row: any) {
    const { account_id, execution_epoch, work_hold, ...safe } = row;
    return { ...safe, number_count: Number(this.db.prepare('SELECT count(*) n FROM campaign_number_assignments WHERE account_id=? AND campaign_id=?')
      .get(account_id,row.id)!.n) };
  }
  list(account: string, search = '', state = '', deleted = false) {
    return this.db.prepare(`SELECT * FROM campaign_workspaces WHERE account_id=? AND
      ${deleted ? "lifecycle='pending_deletion'" : "lifecycle<>'pending_deletion'"} AND (?='' OR lifecycle=?)
      AND instr(lower(name),lower(?))>0 ORDER BY updated_at DESC,id LIMIT 200`)
      .all(account,state,state,search.slice(0,120)).map(row => this.summary(row));
  }
  create(account: string, input: unknown) {
    const value = metadataInput.parse(input), id = randomUUID(), timestamp = now();
    return this.transaction(() => {
      this.db.prepare('INSERT OR IGNORE INTO campaign_accounts VALUES(?)').run(account);
      this.db.prepare('INSERT INTO campaign_workspaces(account_id,id,name,description,timezone,created_at,updated_at) VALUES(?,?,?,?,?,?,?)')
        .run(account,id,value.name,value.description,'Asia/Karachi',timestamp,timestamp);
      this.db.prepare('INSERT INTO campaign_drafts VALUES(?,?,?)').run(account,id,JSON.stringify(emptyAssistant));
      this.audit(account,id,'created');
      saveDraftHistory(this.db,account,id);
      return this.summary(this.owned(account,id));
    });
  }
  edit(account: string, id: string, revision: number, input: unknown) {
    const value = metadataInput.parse(input);
    return this.transaction(() => {
      this.check(account,id,revision);
      this.db.prepare('UPDATE campaign_workspaces SET name=?,description=? WHERE account_id=? AND id=?')
        .run(value.name,value.description,account,id);
      this.bump(account,id,'metadata_saved'); return this.summary(this.owned(account,id));
    });
  }
  lifecycle(account: string, id: string, revision: number, action: string, confirmation = '') {
    return this.transaction(() => {
      const row = this.check(account,id,revision,false);
      const transitions: Record<string, Record<string,string>> = { active: {pause:'paused',archive:'archived',delete:'pending_deletion'},
        paused: {resume:'active',archive:'archived',delete:'pending_deletion'}, archived: {restore:'paused',delete:'pending_deletion'},
        pending_deletion: {cancel_removal:'paused'} };
      const target = transitions[row.lifecycle]?.[action];
      ensure(target, 'This lifecycle action is unavailable');
      if (action === 'delete') ensure(confirmation === row.name, 'Type the campaign name to confirm deletion',422);
      if (action === 'cancel_removal') ensure(Date.parse(row.recover_until) > Date.now(), 'The recovery window has expired');
      const deleted = action === 'delete' ? now() : null;
      const until = deleted ? new Date(Date.now()+30*86400000).toISOString() : null;
      this.db.prepare('UPDATE campaign_workspaces SET lifecycle=?,deleted_at=?,recover_until=?,execution_epoch=execution_epoch+1,work_hold=1 WHERE account_id=? AND id=?')
        .run(target,deleted,until,account,id);
      this.bump(account,id,action,{ futureWork: 'held_for_explicit_revalidation', assignments: 'retained_no_transfer' });
      return this.summary(this.owned(account,id));
    });
  }
  numbers(account: string, campaign?: string) {
    if (campaign) this.owned(account,campaign);
    return this.db.prepare(`SELECT n.id,n.status,a.campaign_id FROM campaign_number_registry n
      LEFT JOIN campaign_number_assignments a ON a.account_id=n.account_id AND a.number_id=n.id
      WHERE n.account_id=? AND (?='' OR a.campaign_id=?)`).all(account,campaign||'',campaign||'');
  }
  assignNumber(account: string, campaign: string, number: string) {
    return this.transaction(() => {
      this.owned(account,campaign,true);
      ensure(this.db.prepare('SELECT id FROM campaign_number_registry WHERE account_id=? AND id=? AND status<>?')
        .get(account,number,'removed'), 'Number not found',404);
      ensure(!this.db.prepare('SELECT campaign_id FROM campaign_number_assignments WHERE account_id=? AND number_id=?').get(account,number),
        'Number already assigned; explicit transfer approval is required');
      this.db.prepare('INSERT INTO campaign_number_assignments VALUES(?,?,?,?)').run(account,number,campaign,now());
      this.bump(account,campaign,'number_assigned');
    });
  }
  close() { this.db.close(); }
}
let singleton: CampaignStore;
export function campaignStore() {
  if (process.env.BLACKARROW_STAGE !== '1') throw Error('Independent staging required');
  return singleton ??= new CampaignStore('/state/blackarrow.sqlite');
}
