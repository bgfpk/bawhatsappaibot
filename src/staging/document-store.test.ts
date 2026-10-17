import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Query } from 'node-appwrite';
import { StageDocumentStore } from './document-store';

test('durable document data survives reopen and enforces scope/query boundaries', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'blackarrow-stage-'));
  let store = new StageDocumentStore(join(directory, 'documents.sqlite'));
  try {
    await store.createDocument('blackarrow_stage', 'preferences', 'owner-one', { user_id: 'one', visible: false });
    await store.createDocument('blackarrow_stage', 'preferences', 'owner-two', { user_id: 'two', visible: false });
    await store.updateDocument('blackarrow_stage', 'preferences', 'owner-one', { visible: true, $id: 'forged' });
    store.close(); store = new StageDocumentStore(join(directory, 'documents.sqlite'));
    assert.equal((await store.getDocument('blackarrow_stage', 'preferences', 'owner-one')).visible, true);
    const owned = await store.listDocuments('blackarrow_stage', 'preferences', [Query.equal('user_id', 'one')]);
    assert.equal(owned.total, 1); assert.equal(owned.documents[0].$id, 'owner-one');
    await assert.rejects(store.getDocument('other_database', 'preferences', 'owner-one'), { code: 403 });
    await assert.rejects(store.listDocuments('blackarrow_stage', 'preferences', [Query.search('user_id', 'one')]), { code: 503 });
    await assert.rejects(store.createDocument('blackarrow_stage', 'preferences', 'owner-one', {}), { code: 409 });
    assert.equal((await store.getDocument('blackarrow_stage', 'preferences', 'owner-two')).visible, false);
  } finally { store.close(); rmSync(directory, { recursive: true }); }
});
