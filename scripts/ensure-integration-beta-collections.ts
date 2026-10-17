import { Client, Databases, Query } from "node-appwrite";
import dotenv from "dotenv";
import { INTEGRATION_BETA_COLLECTION_DEFINITIONS } from "../src/services/integration-beta-collections.ts";

dotenv.config();

/*
 * Explicit beta schema helper for BlackArrow integration/list/API/webhook collections.
 *
 * Safe usage:
 *   node --import tsx scripts/ensure-integration-beta-collections.ts --dry-run
 *   node --import tsx scripts/ensure-integration-beta-collections.ts --apply
 *
 * Defaults to DEV credentials. Add --live only when the owner intentionally wants
 * to inspect or apply against live. This script is add-only: it does not delete
 * or modify existing collections, attributes, indexes, or data.
 */

const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const target = args.has("--live") ? "LIVE" : "DEV";
const dryRun = !apply || args.has("--dry-run");

function env(name: string) {
  return String(process.env[name] || "").trim();
}

const endpoint = env("APPWRITE_ENDPOINT") || "https://blackarrow-source.offline.invalid/v1";
const projectId = target === "LIVE" ? env("APPWRITE_PROJECT_ID_LIVE") : env("APPWRITE_PROJECT_ID_DEV");
const apiKey = target === "LIVE" ? env("APPWRITE_API_KEY_LIVE") : env("APPWRITE_API_KEY_DEV");
const databaseId = target === "LIVE" ? (env("APPWRITE_DATABASE_ID_LIVE") || "main_db") : (env("APPWRITE_DATABASE_ID_DEV") || "main_db");

if (!projectId || !apiKey) {
  console.error(`Missing Appwrite ${target} credentials. No schema changes made.`);
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function ensureCollection(definition: any) {
  let exists = false;
  try {
    await databases.getCollection(databaseId, definition.id);
    exists = true;
  } catch (error: any) {
    if (Number(error?.code || 0) !== 404) throw error;
  }

  if (!exists) {
    console.log(`[collection] ${definition.id} missing`);
    if (!dryRun) {
      await databases.createCollection(databaseId, definition.id, definition.name, [], false);
      console.log(`  created ${definition.id}`);
    }
  } else {
    console.log(`[collection] ${definition.id} exists`);
  }
}

async function ensureAttributes(definition: any) {
  const existing = await databases.listAttributes(databaseId, definition.id, [Query.limit(200)]).catch(() => ({ attributes: [] as any[] }));
  const existingKeys = new Set((existing.attributes || []).map((attribute: any) => attribute.key));
  for (const attribute of definition.attributes) {
    if (existingKeys.has(attribute.key)) continue;
    console.log(`  [attribute] ${definition.id}.${attribute.key} missing (${attribute.type})`);
    if (dryRun) continue;
    try {
      if (attribute.type === "string") {
        await databases.createStringAttribute(databaseId, definition.id, attribute.key, attribute.size || 255, Boolean(attribute.required), attribute.default);
      } else if (attribute.type === "integer") {
        await databases.createIntegerAttribute(databaseId, definition.id, attribute.key, Boolean(attribute.required), undefined, undefined, attribute.default);
      } else if (attribute.type === "boolean") {
        await databases.createBooleanAttribute(databaseId, definition.id, attribute.key, Boolean(attribute.required), attribute.default);
      }
    } catch (error: any) {
      console.error(`    failed to create attribute ${attribute.key}: ${error?.message || error}`);
    }
  }
}

async function ensureIndexes(definition: any) {
  const existing = await databases.listIndexes(databaseId, definition.id).catch(() => ({ indexes: [] as any[] }));
  const existingKeys = new Set((existing.indexes || []).map((index: any) => index.key));
  for (const index of definition.indexes) {
    if (existingKeys.has(index.key)) continue;
    console.log(`  [index] ${definition.id}.${index.key} missing`);
    if (!dryRun) {
      try {
        await databases.createIndex(databaseId, definition.id, index.key, index.type, index.attributes, index.orders);
      } catch (error: any) {
        console.error(`    failed to create index ${index.key}: ${error?.message || error}`);
      }
    }
  }
}

async function main() {
  console.log(`--- Integration beta schema helper (${target}, ${dryRun ? "dry-run" : "apply"}) ---`);
  console.log("Add-only script. No collections, attributes, indexes, or data will be deleted.");
  for (const definition of INTEGRATION_BETA_COLLECTION_DEFINITIONS) {
    await ensureCollection(definition);
    await ensureAttributes(definition);
    await ensureIndexes(definition);
  }
  console.log("--- Done ---");
}

main().catch((error) => {
  console.error("Beta schema helper failed:", error?.message || error);
  process.exit(1);
});
