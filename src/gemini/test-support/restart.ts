import fs from 'node:fs';
import assert from 'node:assert/strict';
import { createHash,randomBytes } from 'node:crypto';
import { CampaignStore } from '../../campaigns/store';
import { GeminiSettings } from '../settings-store';
assert.equal(process.env.BLACKARROW_DISPOSABLE_TEST,'1');
const custody=JSON.parse(fs.readFileSync('/state/custody.json','utf8'));
assert.equal(custody.email,'alpha@blackarrow.test');
process.env.BLACKARROW_SECRET_ENCRYPTION_KEY=custody.encryptionSecret;
const store=new CampaignStore('/state/blackarrow.sqlite'),settings=new GeminiSettings(store);
if(process.argv[2]==='before'){
  const key='AIza'+randomBytes(24).toString('base64url');
  settings.save('alpha',settings.status('alpha').revision,key);
  fs.writeFileSync('/state/restart-key.sha256',createHash('sha256').update(key).digest('hex'),{mode:0o600});
}else{
  assert.equal(createHash('sha256').update(settings.credential('alpha').key).digest('hex'),fs.readFileSync('/state/restart-key.sha256','utf8'));
  settings.remove('alpha',settings.status('alpha').revision);
  console.log(JSON.stringify({encrypted_key_survived_container_restart:true,removed_after_verification:true}));
}
assert.equal(store.db.prepare('PRAGMA integrity_check').get()!.integrity_check,'ok');
store.db.close();
