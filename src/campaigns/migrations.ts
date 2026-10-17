import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ensure, now } from './contracts';
export function applyCampaignMigrations(db:DatabaseSync) {
  const directory=path.join(process.cwd(),'src/campaigns/migrations');
  db.exec('CREATE TABLE IF NOT EXISTS campaign_schema_migrations(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TEXT NOT NULL)');
  db.exec('BEGIN IMMEDIATE');
  try {
    for(const name of fs.readdirSync(directory).filter(name=>/^\d{3}_.*\.sql$/.test(name)).sort()) {
      const version=Number(name.slice(0,3)),sql=fs.readFileSync(path.join(directory,name),'utf8');
      const checksum=createHash('sha256').update(sql).digest('hex');
      const existing=db.prepare('SELECT checksum FROM campaign_schema_migrations WHERE version=?').get(version);
      if(existing)ensure(existing.checksum===checksum,'Campaign migration checksum differs');
      else{db.exec(sql);db.prepare('INSERT INTO campaign_schema_migrations VALUES(?,?,?)').run(version,checksum,now());}
    }
    db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
}
export function saveDraftHistory(db:DatabaseSync,account:string,campaign:string) {
  const row=db.prepare('SELECT revision FROM campaign_workspaces WHERE account_id=? AND id=?').get(account,campaign)!;
  const snapshot={config:JSON.parse(String(db.prepare('SELECT config FROM campaign_drafts WHERE account_id=? AND campaign_id=?').get(account,campaign)!.config)),
    knowledge:db.prepare('SELECT id,kind,title,fields,text_content,enabled,revision,document_id,removed_at FROM campaign_knowledge WHERE account_id=? AND campaign_id=? ORDER BY id').all(account,campaign),
    documents:db.prepare('SELECT id,name,digest,state,error_code FROM campaign_documents WHERE account_id=? AND campaign_id=? ORDER BY id').all(account,campaign)};
  db.prepare('INSERT INTO campaign_revision_history VALUES(?,?,?,?,?)').run(account,campaign,row.revision,JSON.stringify(snapshot),now());
}
