import { isStaging, stageDocuments, unavailableStageService } from '../staging/registry';
import { Client, Databases, Storage, Users, ID, Query } from 'node-appwrite';
export { Query };
import dotenv from 'dotenv';
import { getAppStatus } from '../utils/app-status-util.ts';

dotenv.config();

export const PROD_PROJECT_ID = 'REDACTED_OFFLINE_bce7e3b541';
export const PROD_DATABASE_ID = 'REDACTED_OFFLINE_1a15e5c484';

/**
 * Detects whether the current Node process is running within an automated test runner.
 */
export function isAutomatedTestEnvironment(): boolean {
  if (process.env.NODE_ENV === 'test') return true;
  if (process.env.BLACKARROW_ISOLATED_TEST === '1') return true;
  if (process.execArgv.some(arg => arg.includes('--test'))) return true;
  if (process.argv.some(arg => arg.includes('--test') || arg.includes('.test.') || arg.endsWith('.test.ts') || arg.endsWith('.test.js') || arg.endsWith('.test.mjs'))) return true;
  return false;
}

/**
 * Strict fail-closed guard: automated tests are prohibited from targeting production Appwrite.
 */
export function assertNotProductionInTest(targetProjectId?: string, targetDatabaseId?: string): void {
  if (isAutomatedTestEnvironment()) {
    const liveProj = process.env.APPWRITE_PROJECT_ID_LIVE || PROD_PROJECT_ID;
    const liveDb = process.env.APPWRITE_DATABASE_ID_LIVE || PROD_DATABASE_ID;

    if (
      (targetDatabaseId && (targetDatabaseId === liveDb || targetDatabaseId === PROD_DATABASE_ID)) ||
      (targetProjectId && (targetProjectId === liveProj || targetProjectId === PROD_PROJECT_ID))
    ) {
      throw new Error(
        `[FAIL_CLOSED_TEST_GUARD] Automated tests are strictly prohibited from targeting production Appwrite (Project: ${targetProjectId || liveProj}, Database: ${targetDatabaseId || liveDb}). Tests must use mock/in-memory abstraction, dedicated test database, or isolated test backend.`
      );
    }
  }
}

/**
 * In-memory Mock Appwrite Databases abstraction for safe, isolated, high-speed automated testing.
 */
export class MockAppwriteDatabases {
  private collections = new Map<string, Map<string, any>>();
  private meta = new Map<string, any>();

  private getCollectionStore(collectionId: string) {
    if (!this.collections.has(collectionId)) {
      this.collections.set(collectionId, new Map());
    }
    return this.collections.get(collectionId)!;
  }

  async getDocument(databaseId: string, collectionId: string, documentId: string) {
    assertNotProductionInTest(undefined, databaseId);
    const store = this.getCollectionStore(collectionId);
    const doc = store.get(documentId);
    if (!doc) {
      const err: any = new Error(`Document with the requested ID could not be found.`);
      err.code = 404;
      err.status = 404;
      throw err;
    }
    return JSON.parse(JSON.stringify(doc));
  }

  async createDocument(databaseId: string, collectionId: string, documentId: string, data: any, permissions?: string[]) {
    assertNotProductionInTest(undefined, databaseId);
    const store = this.getCollectionStore(collectionId);
    if (store.has(documentId)) {
      const err: any = new Error(`Document with the requested ID already exists.`);
      err.code = 409;
      err.status = 409;
      throw err;
    }
    const now = Date.now();
    const doc = {
      $id: documentId,
      $createdAt: new Date(now).toISOString(),
      $updatedAt: new Date(now).toISOString(),
      $permissions: permissions || [],
      ...data
    };
    store.set(documentId, JSON.parse(JSON.stringify(doc)));
    return JSON.parse(JSON.stringify(doc));
  }

  async updateDocument(databaseId: string, collectionId: string, documentId: string, data: any, permissions?: string[]) {
    assertNotProductionInTest(undefined, databaseId);
    const store = this.getCollectionStore(collectionId);
    const existing = store.get(documentId);
    if (!existing) {
      const err: any = new Error(`Document with the requested ID could not be found.`);
      err.code = 404;
      err.status = 404;
      throw err;
    }
    const updated = {
      ...existing,
      ...data,
      $updatedAt: new Date().toISOString(),
      ...(permissions ? { $permissions: permissions } : {})
    };
    store.set(documentId, JSON.parse(JSON.stringify(updated)));
    return JSON.parse(JSON.stringify(updated));
  }

  async deleteDocument(databaseId: string, collectionId: string, documentId: string) {
    assertNotProductionInTest(undefined, databaseId);
    const store = this.getCollectionStore(collectionId);
    store.delete(documentId);
    return {};
  }

  async listDocuments(databaseId: string, collectionId: string, queries: any[] = []) {
    assertNotProductionInTest(undefined, databaseId);
    const store = this.getCollectionStore(collectionId);
    let items = Array.from(store.values()).map(d => JSON.parse(JSON.stringify(d)));

    let limit = 25;
    let offset = 0;
    let orderField: string | null = null;
    let orderDirection: 'ASC' | 'DESC' = 'ASC';

    for (const q of queries) {
      let parsed = q;
      if (typeof q === 'string') {
        try {
          parsed = JSON.parse(q);
        } catch {
          continue;
        }
      }
      if (!parsed || !parsed.method) continue;

      if (parsed.method === 'equal') {
        const attr = parsed.attribute;
        const val = parsed.values[0];
        items = items.filter(it => it[attr] === val);
      } else if (parsed.method === 'limit') {
        limit = Number(parsed.values[0]) || limit;
      } else if (parsed.method === 'offset') {
        offset = Number(parsed.values[0]) || offset;
      } else if (parsed.method === 'orderDesc') {
        orderField = parsed.attribute;
        orderDirection = 'DESC';
      } else if (parsed.method === 'orderAsc') {
        orderField = parsed.attribute;
        orderDirection = 'ASC';
      }
    }

    if (orderField) {
      items.sort((a, b) => {
        const valA = a[orderField!];
        const valB = b[orderField!];
        if (valA === undefined && valB === undefined) return 0;
        if (valA === undefined) return 1;
        if (valB === undefined) return -1;
        if (valA < valB) return orderDirection === 'ASC' ? -1 : 1;
        if (valA > valB) return orderDirection === 'ASC' ? 1 : -1;
        return 0;
      });
    }

    const total = items.length;
    const paginated = items.slice(offset, offset + limit);
    return { total, documents: paginated };
  }

  async getCollection(databaseId: string, collectionId: string) {
    assertNotProductionInTest(undefined, databaseId);
    return this.meta.get(collectionId) || { $id: collectionId, name: collectionId, attributes: [], indexes: [] };
  }

  async createCollection(databaseId: string, collectionId: string, name: string) {
    assertNotProductionInTest(undefined, databaseId);
    const m = { $id: collectionId, name, attributes: [], indexes: [] };
    this.meta.set(collectionId, m);
    return m;
  }

  async createStringAttribute(databaseId: string, collectionId: string, key: string, size: number, required: boolean, def?: any, array?: boolean) {
    assertNotProductionInTest(undefined, databaseId);
    return { key, type: 'string', size, required, default: def, array };
  }

  async createIntegerAttribute(databaseId: string, collectionId: string, key: string, required: boolean, min?: number, max?: number, def?: any, array?: boolean) {
    assertNotProductionInTest(undefined, databaseId);
    return { key, type: 'integer', required, default: def, array };
  }

  async createBooleanAttribute(databaseId: string, collectionId: string, key: string, required: boolean, def?: any, array?: boolean) {
    assertNotProductionInTest(undefined, databaseId);
    return { key, type: 'boolean', required, default: def, array };
  }

  async createFloatAttribute(databaseId: string, collectionId: string, key: string, required: boolean, min?: number, max?: number, def?: any, array?: boolean) {
    assertNotProductionInTest(undefined, databaseId);
    return { key, type: 'float', required, default: def, array };
  }

  async createIndex(databaseId: string, collectionId: string, key: string, type: string, attributes: string[], orders?: string[]) {
    assertNotProductionInTest(undefined, databaseId);
    return { key, type, attributes, orders };
  }

  clear() {
    this.collections.clear();
    this.meta.clear();
  }
}

/**
 * In-memory Mock Appwrite Storage abstraction for safe testing.
 */
export class MockAppwriteStorage {
  private files = new Map<string, { bucketId: string; fileId: string; buffer: Buffer; name?: string }>();

  async getBucket(bucketId: string) {
    return { $id: bucketId, name: bucketId };
  }

  async createBucket(params: any) {
    return { $id: params.bucketId, name: params.name };
  }

  async createFile(params: any) {
    const { bucketId, fileId, file } = params;
    const buf = Buffer.isBuffer(file) ? file : Buffer.from(file);
    this.files.set(`${bucketId}_${fileId}`, { bucketId, fileId, buffer: buf });
    return { $id: fileId, sizeOriginal: buf.length };
  }

  async getFileDownload(bucketId: string, fileId: string) {
    const f = this.files.get(`${bucketId}_${fileId}`);
    if (!f) {
      const err: any = new Error('File not found');
      err.code = 404;
      throw err;
    }
    return f.buffer;
  }

  async deleteFile(bucketId: string, fileId: string) {
    this.files.delete(`${bucketId}_${fileId}`);
    return {};
  }

  clear() {
    this.files.clear();
  }
}

function getConfig() {
  if (isStaging) return { projectId: 'blackarrow_stage', apiKey: '', databaseId: 'blackarrow_stage', mode: 'ISOLATED_STAGING' };
  const isTest = isAutomatedTestEnvironment();
  if (isTest) {
    return {
      projectId: process.env.APPWRITE_PROJECT_ID_TEST || 'isolated_test_project',
      apiKey: process.env.APPWRITE_API_KEY_TEST || 'isolated_test_key',
      databaseId: process.env.APPWRITE_DATABASE_ID_TEST || 'isolated_test_db',
      mode: 'TEST_ISOLATED'
    };
  }

  const isProd = process.env.NODE_ENV === 'production';
  return {
    projectId: isProd ? (process.env.APPWRITE_PROJECT_ID_LIVE || '') : (process.env.APPWRITE_PROJECT_ID_DEV || ''),
    apiKey: isProd ? (process.env.APPWRITE_API_KEY_LIVE || '') : (process.env.APPWRITE_API_KEY_DEV || ''),
    databaseId: isProd ? (process.env.APPWRITE_DATABASE_ID_LIVE || 'main_db') : (process.env.APPWRITE_DATABASE_ID_DEV || 'main_db'),
    mode: isProd ? 'PRODUCTION' : 'DEVELOPMENT'
  };
}

let config = getConfig();

export let client = new Client()
  .setEndpoint(process.env.APPWRITE_ENDPOINT || 'https://blackarrow-source.offline.invalid/v1')
  .setProject(config.projectId)
  .setKey(config.apiKey);

export let databases: any;
export let storage: any;
export let users: any;

if (isStaging) {
  databases = stageDocuments(); storage = unavailableStageService; users = unavailableStageService;
} else if (isAutomatedTestEnvironment() && process.env.APPWRITE_FORCE_REAL_DEV_BACKEND !== 'true') {
  databases = new MockAppwriteDatabases();
  storage = new MockAppwriteStorage();
  users = {
    async get() { return { $id: 'test_user' }; }
  };
} else {
  databases = new Databases(client);
  storage = new Storage(client);
  users = new Users(client);
}

export let DATABASE_ID = config.databaseId;

export function refreshDatabaseId() {
  if (isStaging) { DATABASE_ID = 'blackarrow_stage'; return; }
  if (isAutomatedTestEnvironment()) {
    DATABASE_ID = process.env.APPWRITE_DATABASE_ID_TEST || 'isolated_test_db';
    assertNotProductionInTest(config.projectId, DATABASE_ID);
    return;
  }
  const isProd = process.env.NODE_ENV === 'production';
  if (isProd) {
    client.setProject(process.env.APPWRITE_PROJECT_ID_LIVE || '');
    client.setKey(process.env.APPWRITE_API_KEY_LIVE || '');
    DATABASE_ID = process.env.APPWRITE_DATABASE_ID_LIVE || 'main_db';
  } else {
    client.setProject(process.env.APPWRITE_PROJECT_ID_DEV || '');
    client.setKey(process.env.APPWRITE_API_KEY_DEV || '');
    DATABASE_ID = process.env.APPWRITE_DATABASE_ID_DEV || 'main_db';
  }
}

// Initial refresh
refreshDatabaseId();

export const COLLECTIONS = {
  USERS: process.env.APPWRITE_USERS_COLLECTION || 'users',
  USER_CONFIGS: process.env.APPWRITE_USER_CONFIGS_COLLECTION || 'user_configs',
  BOTS: process.env.APPWRITE_BOTS_COLLECTION || 'bots',
  PRODUCTS: process.env.APPWRITE_PRODUCTS_COLLECTION || 'products',
  CUSTOMERS: process.env.APPWRITE_CUSTOMERS_COLLECTION || 'customers',
  MESSAGES: process.env.APPWRITE_MESSAGES_COLLECTION || 'messages',
  ORDERS: process.env.APPWRITE_ORDERS_COLLECTION || 'orders',
  WALLET_TRANSACTIONS: process.env.APPWRITE_WALLET_TRANSACTIONS_COLLECTION || 'wallet_transactions',
  LOGIN_TOKENS: process.env.APPWRITE_LOGIN_TOKENS_COLLECTION || 'login_tokens',
  USER_SUBSCRIPTIONS: process.env.APPWRITE_USER_SUBSCRIPTIONS_COLLECTION || 'user_subscriptions',
  GLOBAL_SETTINGS: process.env.APPWRITE_GLOBAL_SETTINGS_COLLECTION || 'global_settings',
  SYSTEM_CONFIGS: process.env.APPWRITE_SYSTEM_CONFIGS_COLLECTION || 'system_configs',
  SYSTEM_PROXIES: process.env.APPWRITE_SYSTEM_PROXIES_COLLECTION || 'system_proxies',
  USAGE_ANALYTICS: process.env.APPWRITE_USAGE_ANALYTICS_COLLECTION || 'usage_analytics',
  CONTACT_LISTS: process.env.APPWRITE_CONTACT_LISTS_COLLECTION || 'contact_lists',
  CONTACT_LIST_IMPORTS: process.env.APPWRITE_CONTACT_LIST_IMPORTS_COLLECTION || 'contact_list_imports',
  CONTACT_LIST_CONTACTS: process.env.APPWRITE_CONTACT_LIST_CONTACTS_COLLECTION || 'contact_list_contacts',
  CAMPAIGNS: process.env.APPWRITE_CAMPAIGNS_COLLECTION || 'campaigns',
  CAMPAIGN_RECIPIENTS: process.env.APPWRITE_CAMPAIGN_RECIPIENTS_COLLECTION || 'campaign_recipients',
  CAMPAIGN_EVENTS: process.env.APPWRITE_CAMPAIGN_EVENTS_COLLECTION || 'campaign_events',
  CONTACT_SUPPRESSIONS: process.env.APPWRITE_CONTACT_SUPPRESSIONS_COLLECTION || 'contact_suppressions',
  WORKSPACES: process.env.APPWRITE_WORKSPACES_COLLECTION || 'workspaces',
  WORKSPACE_BINDINGS: process.env.APPWRITE_WORKSPACE_BINDINGS_COLLECTION || 'workspace_bindings',
  WORKSPACE_PARTICIPANTS: process.env.APPWRITE_WORKSPACE_PARTICIPANTS_COLLECTION || 'workspace_participants',
  WORKSPACE_MESSAGES: process.env.APPWRITE_WORKSPACE_MESSAGES_COLLECTION || 'workspace_messages',
  WORKSPACE_FILES: process.env.APPWRITE_WORKSPACE_FILES_COLLECTION || 'workspace_files',
  WORKSPACE_MEMORY: process.env.APPWRITE_WORKSPACE_MEMORY_COLLECTION || 'workspace_memory',
  WORKSPACE_SUMMARIES: process.env.APPWRITE_WORKSPACE_SUMMARIES_COLLECTION || 'workspace_summaries',
  WORKSPACE_TASKS: process.env.APPWRITE_WORKSPACE_TASKS_COLLECTION || 'workspace_tasks',
  WORKSPACE_REMINDERS: process.env.APPWRITE_WORKSPACE_REMINDERS_COLLECTION || 'workspace_reminders',
  WORKSPACE_EVENTS: process.env.APPWRITE_WORKSPACE_EVENTS_COLLECTION || 'workspace_events',
  WORKSPACE_RECORDS: process.env.APPWRITE_WORKSPACE_RECORDS_COLLECTION || 'workspace_records',
};

export const BUCKETS = {
  CONTACT_IMPORT_FILES: process.env.APPWRITE_CONTACT_IMPORT_FILES_BUCKET || 'contact_import_files',
  WORKSPACE_FILES: process.env.APPWRITE_WORKSPACE_FILES_BUCKET || 'workspace_files',
};
