// Disposable acceptance storage only; never run against the staging owner.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { stageDocuments } from '../../staging/document-store';
import { hashPassword } from '../../services/password-security';
assert.equal(process.env.BLACKARROW_DISPOSABLE_TEST,'1');
assert.equal(JSON.parse(fs.readFileSync('/state/custody.json','utf8')).email,'alpha@blackarrow.test');
const db=stageDocuments();
assert.equal((await db.listDocuments('blackarrow_stage','users')).total,0);
for(const id of ['alpha','beta'])await db.createDocument('blackarrow_stage','users',id,{
  email:id+'@blackarrow.test',name:'Disposable '+id,password_hash:hashPassword('DisposableTestOnly#2026'),role:'user',created_at:Math.floor(Date.now()/1000)});
db.close();console.log('Disposable accounts prepared.');
