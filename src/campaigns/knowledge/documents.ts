import { createHash, randomUUID } from 'node:crypto';
import { CampaignStore } from '../store';
import { ensure, now } from '../contracts';
import { normalize, unsafe } from './content';
import { extractDocument } from './extractor';

let extractionRunning = false;
export class CampaignDocuments {
  constructor(readonly store: CampaignStore) {}
  async upload(account: string, campaign: string, revision: number, input: {name:string;base64:string}) {
    this.store.owned(account,campaign,true);
    ensure(!extractionRunning,'Another document is processing. Try again shortly.');
    const {name,base64} = input, format = name.split('.').pop()?.toLowerCase() || '';
    ensure(['pdf','docx','txt','md','csv'].includes(format) && name.length<=160 && !/[\\/\x00-\x1f]/.test(name), 'Unsupported document name or type',422);
    ensure(base64.length<=2796204 && /^[A-Za-z0-9+/]*={0,2}$/.test(base64),'Invalid document data',422);
    const bytes = Buffer.from(base64,'base64');
    ensure(bytes.length>0 && bytes.length<=2097152 && bytes.toString('base64')===base64,'Choose a file no larger than 2 MB',422);
    const digest = createHash('sha256').update(bytes).digest('hex'), id = randomUUID(), timestamp = now();
    const duplicate = this.store.transaction(() => {
      this.store.check(account,campaign,revision);
      const same = this.store.db.prepare("SELECT id FROM campaign_documents WHERE account_id=? AND campaign_id=? AND digest=? AND state<>'removed'").get(account,campaign,digest);
      if (same) return String(same.id);
      const capacity = this.store.db.prepare('SELECT count(*) n,COALESCE(sum(length(bytes)),0) size FROM campaign_documents WHERE account_id=? AND campaign_id=?').get(account,campaign)!;
      ensure(Number(capacity.n)<20 && Number(capacity.size)+bytes.length<=20971520,'Campaign document storage limit reached',422);
      this.store.db.prepare("INSERT INTO campaign_documents(account_id,campaign_id,id,name,format,digest,bytes,state,created_at,updated_at) VALUES(?,?,?,?,?,?,?,'processing',?,?)")
        .run(account,campaign,id,name,format,digest,bytes,timestamp,timestamp);
      this.store.bump(account,campaign,'document_uploaded'); return null;
    });
    if (duplicate) return {id:duplicate,duplicate:true};
    extractionRunning = true;
    try { return await this.process(account,campaign,id,format,bytes); }
    finally { extractionRunning = false; }
  }
  private async process(account: string, campaign: string, id: string, format: string, bytes: Buffer) {
    let text = '', error: string|null = null;
    try { text = normalize(await extractDocument(format,bytes)); ensure(!unsafe(text),'UNSAFE_DOCUMENT',422); }
    catch (failure: any) { error = /^[A-Z_]{3,50}$/.test(failure.message) ? failure.message : 'EXTRACTION_FAILED'; }
    return this.store.transaction(() => {
      this.store.owned(account,campaign);
      const row = this.store.db.prepare('SELECT state,name FROM campaign_documents WHERE account_id=? AND campaign_id=? AND id=?').get(account,campaign,id)!;
      if (row.state !== 'processing') return {id,state:row.state};
      this.store.db.prepare('UPDATE campaign_documents SET state=?,extracted=?,error_code=?,updated_at=? WHERE account_id=? AND campaign_id=? AND id=?')
        .run(error?'failed':'ready',error?'':text,error,now(),account,campaign,id);
      if (!error) this.store.db.prepare('INSERT INTO campaign_knowledge(account_id,campaign_id,id,kind,title,fields,text_content,enabled,document_id,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(account,campaign,randomUUID(),'document',row.name,JSON.stringify({body:text}),text,1,id,now());
      this.store.bump(account,campaign,error?'document_failed':'document_ready');
      return {id,state:error?'failed':'ready',error_code:error};
    });
  }
  detail(account: string, campaign: string, id: string) {
    this.store.owned(account,campaign);
    const row = this.store.db.prepare("SELECT id,name,format,state,error_code,extracted,digest FROM campaign_documents WHERE account_id=? AND campaign_id=? AND id=? AND state<>'removed'").get(account,campaign,id);
    ensure(row,'Document not found',404); return row;
  }
  remove(account: string, campaign: string, revision: number, id: string) {
    return this.store.transaction(() => {
      this.store.check(account,campaign,revision);
      this.detail(account,campaign,id);
      this.store.db.prepare("UPDATE campaign_documents SET state='removed',updated_at=? WHERE account_id=? AND campaign_id=? AND id=?").run(now(),account,campaign,id);
      this.store.db.prepare('UPDATE campaign_knowledge SET removed_at=?,revision=revision+1,updated_at=? WHERE account_id=? AND campaign_id=? AND document_id=?').run(now(),now(),account,campaign,id);
      this.store.bump(account,campaign,'document_removed'); return {removed:true};
    });
  }
}
