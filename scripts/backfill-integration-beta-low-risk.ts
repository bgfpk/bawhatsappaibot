import { Client, Databases, Query } from "node-appwrite";
import dotenv from "dotenv";
import {
  buildLowRiskBackfillCandidates,
  LOW_RISK_BACKFILL_TARGETS,
  maskForBackfillOutput,
  planLowRiskBackfillOperations,
  type BackfillCandidate,
  type ExistingBackfillRow,
  type LowRiskBackfillCollection,
} from "../src/services/integration-beta-low-risk-backfill.ts";

dotenv.config();

/*
 * Low-risk integration beta collection backfill.
 *
 * Safe usage:
 *   node --import tsx scripts/backfill-integration-beta-low-risk.ts --dry-run
 *   node --import tsx scripts/backfill-integration-beta-low-risk.ts --apply
 *
 * Defaults to DEV and dry-run. LIVE writes require:
 *   --live --apply --confirm-live-backfill
 *
 * Add-only/upsert only. This script never deletes fallback user_extra storage
 * and intentionally excludes API keys, connection secrets, webhook endpoints,
 * saved recipient lists, campaigns, runs, recipient jobs, and billing/send data.
 */

const args = new Set(process.argv.slice(2));
const target = args.has("--live") ? "LIVE" : "DEV";
const apply = args.has("--apply") && !args.has("--dry-run");
const confirmedLive = args.has("--confirm-live-backfill");

if (target === "LIVE" && apply && !confirmedLive) {
  console.error("Refusing LIVE apply without --confirm-live-backfill. No changes made.");
  process.exit(1);
}

function env(name: string) {
  return String(process.env[name] || "").trim();
}

const endpoint = env("APPWRITE_ENDPOINT") || "https://blackarrow-source.offline.invalid/v1";
const projectId = target === "LIVE" ? env("APPWRITE_PROJECT_ID_LIVE") : env("APPWRITE_PROJECT_ID_DEV");
const apiKey = target === "LIVE" ? env("APPWRITE_API_KEY_LIVE") : env("APPWRITE_API_KEY_DEV");
const databaseId = target === "LIVE" ? (env("APPWRITE_DATABASE_ID_LIVE") || "main_db") : (env("APPWRITE_DATABASE_ID_DEV") || "main_db");
const systemConfigsCollection = env("APPWRITE_SYSTEM_CONFIGS_COLLECTION") || "system_configs";
const usersCollection = env("APPWRITE_USERS_COLLECTION") || "users";

if (!projectId || !apiKey) {
  console.error(`Missing Appwrite ${target} credentials. No changes made.`);
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

type Summary = {
  target: string;
  mode: "dry-run" | "apply";
  scannedAccounts: number;
  plannedRows: number;
  wouldCreateRows: number;
  wouldUpdateRows: number;
  createdRows: number;
  updatedRows: number;
  skippedRows: number;
  duplicateIds: number;
  errors: number;
  collections: Record<string, { planned: number; wouldCreate: number; wouldUpdate: number; created: number; updated: number; errors: number }>;
};

function userExtraConfigDocId(userId: string) {
  return `user_extra_${String(userId || "").replace(/[^a-zA-Z0-9_]/g, "_").substring(0, 24)}`;
}

function parseJsonObject(raw: any) {
  try {
    const parsed = JSON.parse(String(raw || "{}"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function listAllDocuments(collectionId: string, queries: string[] = []) {
  const documents: any[] = [];
  const pageSize = 100;
  for (let offset = 0; offset < 10000; offset += pageSize) {
    const response = await databases.listDocuments(databaseId, collectionId, [...queries, Query.limit(pageSize), Query.offset(offset)]);
    documents.push(...(response.documents || []));
    if ((response.documents || []).length < pageSize) break;
  }
  return documents;
}

async function buildUserExtraAccountMap() {
  const users = await listAllDocuments(usersCollection).catch(() => []);
  const map = new Map<string, string>();
  for (const user of users) {
    const userId = String(user.$id || user.id || "");
    if (userId) map.set(userExtraConfigDocId(userId), userId);
  }
  return map;
}

function accountIdFromStore(doc: any, accountMap: Map<string, string>, store: any) {
  const docId = String(doc.$id || doc.id || "");
  const mapped = accountMap.get(docId);
  if (mapped) return mapped;
  const foundation = store?.integrationFoundation || {};
  const rowGroups = [
    foundation.apiRequestLogs,
    foundation.webhookEvents,
    foundation.webhookDeliveries,
    foundation.integrationSyncJobs,
    foundation.externalObjectLinks,
  ];
  for (const group of rowGroups) {
    const row = Array.isArray(group) ? group.find((item) => item?.accountId) : null;
    if (row?.accountId) return String(row.accountId);
  }
  return docId.startsWith("user_extra_") ? docId.slice("user_extra_".length) : "";
}

async function loadFallbackCandidates() {
  const accountMap = await buildUserExtraAccountMap();
  const systemConfigs = await listAllDocuments(systemConfigsCollection);
  const candidates: BackfillCandidate[] = [];
  let scannedAccounts = 0;

  for (const doc of systemConfigs) {
    const docId = String(doc.$id || doc.id || "");
    if (!docId.startsWith("user_extra_")) continue;
    const store = parseJsonObject(doc.value);
    const foundation = store.integrationFoundation;
    if (!foundation || typeof foundation !== "object") continue;
    const accountId = accountIdFromStore(doc, accountMap, store);
    if (!accountId) continue;
    scannedAccounts += 1;
    candidates.push(...buildLowRiskBackfillCandidates(accountId, foundation));
  }

  return { candidates, scannedAccounts };
}

async function loadExistingRows(candidates: BackfillCandidate[]) {
  const groups = new Map<string, { collectionId: LowRiskBackfillCollection; accountId: string }>();
  for (const item of candidates) {
    groups.set(`${item.collectionId}:${item.accountId}`, { collectionId: item.collectionId, accountId: item.accountId });
  }

  const existingRows: Record<string, ExistingBackfillRow[]> = {};
  for (const group of groups.values()) {
    const rows = await listAllDocuments(group.collectionId, [Query.equal("accountId", group.accountId)]).catch(() => []);
    existingRows[group.collectionId] = [
      ...(existingRows[group.collectionId] || []),
      ...rows.map((row: any) => {
        const { $id, $createdAt, $updatedAt, $permissions, $collectionId, $databaseId, ...data } = row || {};
        return { documentId: String($id || data.id || ""), data };
      }),
    ];
  }
  return existingRows;
}

function emptySummary(): Summary {
  const collections: Summary["collections"] = {};
  for (const collectionId of LOW_RISK_BACKFILL_TARGETS) {
    collections[collectionId] = { planned: 0, wouldCreate: 0, wouldUpdate: 0, created: 0, updated: 0, errors: 0 };
  }
  return {
    target,
    mode: apply ? "apply" : "dry-run",
    scannedAccounts: 0,
    plannedRows: 0,
    wouldCreateRows: 0,
    wouldUpdateRows: 0,
    createdRows: 0,
    updatedRows: 0,
    skippedRows: 0,
    duplicateIds: 0,
    errors: 0,
    collections,
  };
}

async function main() {
  console.log(`--- Integration beta low-risk backfill (${target}, ${apply ? "apply" : "dry-run"}) ---`);
  console.log("Scope: api_request_logs, webhook_events, webhook_deliveries, integration_sync_jobs, external_object_links.");
  console.log("No fallback cleanup, no secrets, no API keys, no saved lists/campaigns/runs/jobs.");

  const summary = emptySummary();
  const { candidates, scannedAccounts } = await loadFallbackCandidates();
  summary.scannedAccounts = scannedAccounts;

  const existingRows = await loadExistingRows(candidates);
  const plan = planLowRiskBackfillOperations(candidates, existingRows);
  summary.plannedRows = plan.operations.length;
  summary.skippedRows = plan.skippedRows;
  summary.duplicateIds = plan.duplicateIds;

  for (const operation of plan.operations) {
    const collection = summary.collections[operation.collectionId];
    collection.planned += 1;
    if (operation.action === "create") {
      summary.wouldCreateRows += 1;
      collection.wouldCreate += 1;
    } else {
      summary.wouldUpdateRows += 1;
      collection.wouldUpdate += 1;
    }
  }

  if (apply) {
    for (const operation of plan.operations) {
      try {
        if (operation.action === "create") {
          await databases.createDocument(databaseId, operation.collectionId, operation.documentId, operation.data);
          summary.createdRows += 1;
          summary.collections[operation.collectionId].created += 1;
        } else {
          await databases.updateDocument(databaseId, operation.collectionId, operation.documentId, operation.data);
          summary.updatedRows += 1;
          summary.collections[operation.collectionId].updated += 1;
        }
      } catch (error: any) {
        summary.errors += 1;
        summary.collections[operation.collectionId].errors += 1;
        console.error(`[error] ${operation.collectionId} ${operation.action} failed:`, maskForBackfillOutput(error?.message || "unknown error"));
      }
    }
  }

  console.log(JSON.stringify(summary, null, 2));
  console.log("--- Done ---");
}

main().catch((error) => {
  console.error("Low-risk backfill failed:", maskForBackfillOutput(error?.message || error));
  process.exit(1);
});
