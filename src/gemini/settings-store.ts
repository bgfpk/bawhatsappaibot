import { CampaignStore } from '../campaigns/store';
import { now, ensure } from '../campaigns/contracts';
import { encryptServerSecret, decryptServerSecret, hasExplicitServerSecretEncryptionKey } from '../services/secret-crypto-service';
import { GeminiError } from './errors';
import { validGeminiKey } from './key-validation';

export class GeminiSettings {
  constructor(readonly store:CampaignStore) {}
  row(account:string):any {return this.store.db.prepare('SELECT * FROM account_gemini_settings WHERE account_id=?').get(account);}
  status(account:string) {
    const r=this.row(account);
    return {configured:Boolean(r?.encrypted_key),masked:r?.encrypted_key?'••••••••':null,revision:r?.revision??0,
      usable:Boolean(r?.encrypted_key&&r?.verified_at&&r.test_status==='success'),model:r?.model??null,
      verifiedAt:r?.verified_at??null,lastTestAt:r?.last_test_at??null,testStatus:r?.test_status??'untested',errorCategory:r?.error_category??null};
  }
  save(account:string,expectedRevision:number,apiKey:string) {
    if(!validGeminiKey(apiKey))throw new GeminiError('validation','Paste the complete Google AI Studio API key only, without quotes, spaces or an environment-variable label.',422);
    ensure(hasExplicitServerSecretEncryptionKey(),'Independent server encryption is unavailable',503);
    const encrypted=encryptServerSecret(apiKey);
    return this.store.transaction(()=>{
      const r=this.row(account);ensure((r?.revision??0)===expectedRevision,'Key settings changed. Reload before saving.');
      this.store.db.prepare('INSERT OR IGNORE INTO campaign_accounts VALUES(?)').run(account);
      this.store.db.prepare(`INSERT INTO account_gemini_settings(account_id,encrypted_key,revision,updated_at) VALUES(?,?,1,?)
        ON CONFLICT(account_id) DO UPDATE SET encrypted_key=excluded.encrypted_key,revision=account_gemini_settings.revision+1,
        model=NULL,verified_at=NULL,last_test_at=NULL,test_status='untested',error_category=NULL,updated_at=excluded.updated_at`).run(account,encrypted,now());
      return this.status(account);
    });
  }
  remove(account:string,expectedRevision:number) {
    return this.store.transaction(()=>{
      const r=this.row(account);ensure(r&&r.revision===expectedRevision,'Key settings changed. Reload before removing.');
      this.store.db.prepare(`UPDATE account_gemini_settings SET encrypted_key='',revision=revision+1,model=NULL,
        verified_at=NULL,last_test_at=NULL,test_status='untested',error_category=NULL,updated_at=? WHERE account_id=?`).run(now(),account);
      return this.status(account);
    });
  }
  credential(account:string) {
    const r=this.row(account);
    if(!r?.encrypted_key)throw new GeminiError('missing_key','Save your Google Gemini key in Account Settings → AI Integration first.',422);
    ensure(String(r.encrypted_key).startsWith('enc:v1:'),'Saved key requires secure replacement',503);
    try{return {key:decryptServerSecret(r.encrypted_key),revision:Number(r.revision),model:r.model as string|null};}
    catch {throw new GeminiError('encryption','Cannot unlock the saved key. Restore the independent application secret or replace the key.',503);}
  }
  guard(account:string,revision:number) {
    const r=this.row(account);
    if(!r?.encrypted_key||r.revision!==revision)throw new GeminiError('key_changed','The Gemini key changed or was removed. Start a new test.',409);
  }
  tested(account:string,revision:number,model:string|null,category?:string) {
    this.guard(account,revision);
    this.store.db.prepare(`UPDATE account_gemini_settings SET model=?,verified_at=?,last_test_at=?,test_status=?,error_category=? WHERE account_id=? AND revision=?`)
      .run(model,category?null:now(),now(),category?'failed':'success',category??null,account,revision);
  }
}
