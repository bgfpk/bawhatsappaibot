import { DatabaseSync } from 'node:sqlite';
import { randomUUID } from 'node:crypto';

const fail = (message: string, code: number) => Object.assign(new Error(message), { code });
const copy = (value: any) => JSON.parse(JSON.stringify(value));

/** Durable, deliberately bounded Appwrite document interface for independent staging.
 * Unsupported query operators fail closed; this is not an Appwrite server replacement.
 */
export class StageDocumentStore {
  private db: DatabaseSync;
  constructor(filename: string) {
    this.db = new DatabaseSync(filename);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS documents (
        database_id TEXT NOT NULL, collection_id TEXT NOT NULL, id TEXT NOT NULL,
        body TEXT NOT NULL, PRIMARY KEY(database_id, collection_id, id));`);
  }
  private scope(database: string, collection: string) {
    if (database !== 'blackarrow_stage' || !/^[a-zA-Z0-9_-]{1,100}$/.test(collection)) {
      throw fail('Invalid staging document scope', 403);
    }
  }
  health() { return this.db.prepare('SELECT 1 AS ok').get()?.ok === 1; }
  close() { this.db.close(); }
  async getDocument(database: string, collection: string, id: string): Promise<any> {
    this.scope(database, collection);
    const row = this.db.prepare('SELECT body FROM documents WHERE database_id=? AND collection_id=? AND id=?')
      .get(database, collection, id) as any;
    if (!row) throw fail('Document not found', 404);
    return JSON.parse(row.body);
  }
  async createDocument(database: string, collection: string, id: string, data: any, permissions: string[] = []) {
    this.scope(database, collection);
    const now = new Date().toISOString();
    const value = { ...copy(data), $id: id === 'unique()' ? randomUUID() : id,
      $createdAt: now, $updatedAt: now, $permissions: permissions };
    try {
      this.db.prepare('INSERT INTO documents VALUES(?,?,?,?)').run(database, collection, value.$id, JSON.stringify(value));
    } catch (error: any) {
      if (error.message.includes('UNIQUE constraint')) throw fail('Document already exists', 409);
      throw error;
    }
    return value;
  }
  async updateDocument(database: string, collection: string, id: string, data: any) {
    this.scope(database, collection);
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const row = this.db.prepare('SELECT body FROM documents WHERE database_id=? AND collection_id=? AND id=?')
        .get(database, collection, id) as any;
      if (!row) throw fail('Document not found', 404);
      const old = JSON.parse(row.body);
      const value = { ...old, ...copy(data), $id: old.$id, $createdAt: old.$createdAt, $updatedAt: new Date().toISOString() };
      this.db.prepare('UPDATE documents SET body=? WHERE database_id=? AND collection_id=? AND id=?')
        .run(JSON.stringify(value), database, collection, id);
      this.db.exec('COMMIT');
      return value;
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  async deleteDocument(database: string, collection: string, id: string) {
    this.scope(database, collection);
    await this.getDocument(database, collection, id);
    this.db.prepare('DELETE FROM documents WHERE database_id=? AND collection_id=? AND id=?').run(database, collection, id);
    return {};
  }
  async listDocuments(database: string, collection: string, queries: string[] = []) {
    this.scope(database, collection);
    let documents = this.db.prepare('SELECT body FROM documents WHERE database_id=? AND collection_id=? ORDER BY id')
      .all(database, collection).map((row: any) => JSON.parse(row.body));
    let limit = 25, offset = 0;
    for (const text of queries) {
      const query = JSON.parse(text);
      const values = query.values || [];
      switch (query.method) {
        case 'equal': documents = documents.filter(doc => values.includes(doc[query.attribute])); break;
        case 'limit': limit = Math.max(0, Math.min(5000, Number(values[0]))); break;
        case 'offset': offset = Math.max(0, Number(values[0])); break;
        case 'orderAsc': case 'orderDesc': {
          const direction = query.method === 'orderAsc' ? 1 : -1;
          documents.sort((a, b) => a[query.attribute] === b[query.attribute] ? 0 :
            (a[query.attribute] < b[query.attribute] ? -direction : direction)); break;
        }
        default: throw fail('Query operator unavailable in staging', 503);
      }
    }
    return { total: documents.length, documents: documents.slice(offset, offset + limit) };
  }
}

let singleton: StageDocumentStore | undefined;
export function stageDocuments() {
  if (process.env.BLACKARROW_STAGE !== '1') throw new Error('Staging adapter requires explicit isolation mode');
  return singleton ??= new StageDocumentStore('/state/blackarrow.sqlite');
}
export const unavailableStageService: any = new Proxy({}, {
  get: () => async () => { throw fail('Service unavailable in Conversion 02', 503); },
});
