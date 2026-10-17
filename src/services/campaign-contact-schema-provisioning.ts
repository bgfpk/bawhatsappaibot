/**
 * Campaign & Contact Lists Appwrite Schema Provisioning Specification
 *
 * Defines canonical schema definitions, attribute types, and query indexes
 * for Contact Lists, CSV Imports, Contacts, Suppressions, Campaigns, Recipients, and Events.
 *
 * Repeatable, idempotent, and non-destructive.
 */

import { COLLECTIONS, DATABASE_ID, databases } from "../config/appwrite-client.ts";

export interface CollectionAttributeDef {
  key: string;
  type: "string" | "integer" | "boolean" | "float";
  size?: number;
  required: boolean;
  default?: any;
  array?: boolean;
}

export interface CollectionIndexDef {
  key: string;
  type: "key" | "unique" | "fulltext";
  attributes: string[];
  orders?: ("ASC" | "DESC")[];
}

export interface CollectionSchemaDef {
  collectionId: string;
  name: string;
  attributes: CollectionAttributeDef[];
  indexes: CollectionIndexDef[];
}

export const CAMPAIGN_AND_CONTACTS_SCHEMA: Record<string, CollectionSchemaDef> = {
  CONTACT_LISTS: {
    collectionId: COLLECTIONS.CONTACT_LISTS,
    name: "Contact Lists",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 255, required: true },
      { key: "description", type: "string", size: 1000, required: false },
      { key: "status", type: "string", size: 32, required: true, default: "ACTIVE" },
      { key: "sourceImportId", type: "string", size: 64, required: false },
      { key: "totalRows", type: "integer", required: true, default: 0 },
      { key: "uniqueContacts", type: "integer", required: true, default: 0 },
      { key: "validContacts", type: "integer", required: true, default: 0 },
      { key: "invalidContacts", type: "integer", required: true, default: 0 },
      { key: "notOnWhatsAppContacts", type: "integer", required: true, default: 0 },
      { key: "suppressedContacts", type: "integer", required: true, default: 0 },
      { key: "readyContacts", type: "integer", required: true, default: 0 },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_contact_lists_account", type: "key", attributes: ["accountId"] },
      { key: "idx_contact_lists_account_status", type: "key", attributes: ["accountId", "status"] },
    ],
  },
  CONTACT_LIST_IMPORTS: {
    collectionId: COLLECTIONS.CONTACT_LIST_IMPORTS,
    name: "Contact List Imports",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "listId", type: "string", size: 64, required: true },
      { key: "fileName", type: "string", size: 255, required: true },
      { key: "fileSize", type: "integer", required: true, default: 0 },
      { key: "fileStorageId", type: "string", size: 64, required: false },
      { key: "storageBucketId", type: "string", size: 64, required: false },
      { key: "mimeType", type: "string", size: 64, required: false },
      { key: "hash", type: "string", size: 64, required: false },
      { key: "columnMapping", type: "string", size: 4000, required: false },
      { key: "totalRows", type: "integer", required: true, default: 0 },
      { key: "importedRows", type: "integer", required: true, default: 0 },
      { key: "status", type: "string", size: 32, required: true, default: "PENDING" },
      { key: "errorReason", type: "string", size: 1000, required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_imports_account_list", type: "key", attributes: ["accountId", "listId"] },
    ],
  },
  CONTACT_LIST_CONTACTS: {
    collectionId: COLLECTIONS.CONTACT_LIST_CONTACTS,
    name: "Contact List Contacts",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "listId", type: "string", size: 64, required: true },
      { key: "importId", type: "string", size: 64, required: true },
      { key: "rowNumber", type: "integer", required: true },
      { key: "originalName", type: "string", size: 255, required: false },
      { key: "originalPhone", type: "string", size: 64, required: true },
      { key: "originalAiInstructions", type: "string", size: 4000, required: false },
      { key: "originalFixedMessage", type: "string", size: 4000, required: false },
      { key: "normalizedPhone", type: "string", size: 32, required: true },
      { key: "canonicalWhatsAppJid", type: "string", size: 64, required: false },
      { key: "validationStatus", type: "string", size: 32, required: true, default: "PENDING" },
      { key: "validationReason", type: "string", size: 500, required: false },
      { key: "validatedAt", type: "integer", required: false },
      { key: "validationInstanceId", type: "string", size: 64, required: false },
      { key: "duplicateOf", type: "string", size: 64, required: false },
      { key: "isDuplicate", type: "boolean", required: true, default: false },
      { key: "suppressionStatus", type: "string", size: 32, required: true, default: "NONE" },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_contacts_account_list", type: "key", attributes: ["accountId", "listId"] },
      { key: "idx_contacts_list_phone", type: "key", attributes: ["listId", "normalizedPhone"] },
      { key: "idx_contacts_list_validation", type: "key", attributes: ["listId", "validationStatus"] },
    ],
  },
  CONTACT_SUPPRESSIONS: {
    collectionId: COLLECTIONS.CONTACT_SUPPRESSIONS,
    name: "Contact Suppressions",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "normalizedPhone", type: "string", size: 32, required: true },
      { key: "canonicalWhatsAppJid", type: "string", size: 64, required: false },
      { key: "reason", type: "string", size: 255, required: false, default: "manual_suppression" },
      { key: "suppressedAt", type: "integer", required: true },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_suppression_account_phone", type: "unique", attributes: ["accountId", "normalizedPhone"] },
    ],
  },
  CAMPAIGNS: {
    collectionId: COLLECTIONS.CAMPAIGNS,
    name: "Campaigns",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 255, required: true },
      { key: "contactListId", type: "string", size: 64, required: true },
      { key: "sendingInstanceId", type: "string", size: 64, required: true },
      { key: "messageMode", type: "string", size: 32, required: true, default: "FIXED" },
      { key: "campaignInstructions", type: "string", size: 4000, required: false },
      { key: "campaignFixedMessage", type: "string", size: 4000, required: false },
      { key: "timingMode", type: "string", size: 32, required: true, default: "FIXED_DELAY" },
      { key: "fixedDelaySeconds", type: "integer", required: false, default: 30 },
      { key: "randomMinSeconds", type: "integer", required: false, default: 30 },
      { key: "randomMaxSeconds", type: "integer", required: false, default: 90 },
      { key: "timezone", type: "string", size: 64, required: true, default: "UTC" },
      { key: "sendingWindowStart", type: "string", size: 16, required: false },
      { key: "sendingWindowEnd", type: "string", size: 16, required: false },
      { key: "startAt", type: "integer", required: false },
      { key: "status", type: "string", size: 32, required: true, default: "DRAFT" },
      { key: "totalRecipients", type: "integer", required: true, default: 0 },
      { key: "sentCount", type: "integer", required: true, default: 0 },
      { key: "failedCount", type: "integer", required: true, default: 0 },
      { key: "skippedCount", type: "integer", required: true, default: 0 },
      { key: "revision", type: "integer", required: true, default: 1 },
      { key: "consentAcknowledged", type: "boolean", required: true, default: false },
      { key: "consentAcknowledgedAt", type: "integer", required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
      { key: "startedAt", type: "integer", required: false },
      { key: "completedAt", type: "integer", required: false },
    ],
    indexes: [
      { key: "idx_campaigns_account_status", type: "key", attributes: ["accountId", "status"] },
      { key: "idx_campaigns_account_list", type: "key", attributes: ["accountId", "contactListId"] },
      { key: "idx_campaigns_instance", type: "key", attributes: ["sendingInstanceId"] },
    ],
  },
  CAMPAIGN_RECIPIENTS: {
    collectionId: COLLECTIONS.CAMPAIGN_RECIPIENTS,
    name: "Campaign Recipients",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "campaignId", type: "string", size: 64, required: true },
      { key: "campaignRevision", type: "integer", required: true, default: 1 },
      { key: "contactId", type: "string", size: 64, required: true },
      { key: "name", type: "string", size: 255, required: false },
      { key: "normalizedPhone", type: "string", size: 32, required: true },
      { key: "canonicalWhatsAppJid", type: "string", size: 64, required: true },
      { key: "rowAiInstructions", type: "string", size: 4000, required: false },
      { key: "rowFixedMessage", type: "string", size: 4000, required: false },
      { key: "generatedMessageText", type: "string", size: 4000, required: false },
      { key: "logicalCampaignTurnId", type: "string", size: 64, required: true },
      { key: "status", type: "string", size: 32, required: true, default: "PENDING" },
      { key: "statusReason", type: "string", size: 500, required: false },
      { key: "chosenDelaySeconds", type: "integer", required: true, default: 0 },
      { key: "scheduledAt", type: "integer", required: true },
      { key: "lockedByWorker", type: "string", size: 64, required: false },
      { key: "lockExpiresAt", type: "integer", required: false },
      { key: "attemptCount", type: "integer", required: true, default: 0 },
      { key: "sendingInstanceId", type: "string", size: 64, required: false },
      { key: "sentAt", type: "integer", required: false },
      { key: "messageId", type: "string", size: 128, required: false },
      { key: "receiptPayload", type: "string", size: 4000, required: false },
      { key: "createdAt", type: "integer", required: true },
      { key: "updatedAt", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_recipients_campaign_status", type: "key", attributes: ["campaignId", "status"] },
      { key: "idx_recipients_due_scheduled", type: "key", attributes: ["status", "scheduledAt"] },
      { key: "idx_recipients_account_campaign", type: "key", attributes: ["accountId", "campaignId"] },
    ],
  },
  CAMPAIGN_EVENTS: {
    collectionId: COLLECTIONS.CAMPAIGN_EVENTS,
    name: "Campaign Events",
    attributes: [
      { key: "accountId", type: "string", size: 64, required: true },
      { key: "campaignId", type: "string", size: 64, required: true },
      { key: "recipientId", type: "string", size: 64, required: false },
      { key: "eventType", type: "string", size: 32, required: true },
      { key: "details", type: "string", size: 4000, required: false },
      { key: "timestamp", type: "integer", required: true },
    ],
    indexes: [
      { key: "idx_events_campaign_time", type: "key", attributes: ["campaignId", "timestamp"] },
      { key: "idx_events_account_time", type: "key", attributes: ["accountId", "timestamp"] },
    ],
  },
};

/**
 * Returns summary of all provisionable collections, attributes and indexes
 */
export function getCampaignAndContactSchemaSummary() {
  return {
    databaseId: DATABASE_ID,
    collections: Object.values(CAMPAIGN_AND_CONTACTS_SCHEMA).map((col) => ({
      collectionId: col.collectionId,
      name: col.name,
      attributeCount: col.attributes.length,
      indexCount: col.indexes.length,
      attributes: col.attributes.map((a) => `${a.key} (${a.type}${a.size ? `[${a.size}]` : ""}${a.required ? ", required" : ""})`),
      indexes: col.indexes.map((idx) => `${idx.key} [${idx.type}]: ${idx.attributes.join(", ")}`),
    })),
  };
}

/**
 * Ensures all Campaign & Contacts collections, attributes and indexes exist idempotently.
 */
export async function ensureCampaignAndContactsSchema(): Promise<{ created: string[]; existing: string[]; errors: string[] }> {
  const summary = {
    created: [] as string[],
    existing: [] as string[],
    errors: [] as string[],
  };

  for (const [key, def] of Object.entries(CAMPAIGN_AND_CONTACTS_SCHEMA)) {
    try {
      try {
        await databases.getCollection(DATABASE_ID, def.collectionId);
        summary.existing.push(def.name);
      } catch (err: any) {
        if (err?.code === 404 || String(err?.message || "").includes("not found")) {
          await databases.createCollection(DATABASE_ID, def.collectionId, def.name);
          summary.created.push(def.name);
        } else {
          throw err;
        }
      }

      // Provision attributes idempotently
      for (const attr of def.attributes) {
        try {
          if (attr.type === "string") {
            await databases.createStringAttribute(DATABASE_ID, def.collectionId, attr.key, attr.size || 255, attr.required, attr.default, attr.array);
          } else if (attr.type === "integer") {
            await databases.createIntegerAttribute(DATABASE_ID, def.collectionId, attr.key, attr.required, undefined, undefined, attr.default, attr.array);
          } else if (attr.type === "boolean") {
            await databases.createBooleanAttribute(DATABASE_ID, def.collectionId, attr.key, attr.required, attr.default, attr.array);
          } else if (attr.type === "float") {
            await databases.createFloatAttribute(DATABASE_ID, def.collectionId, attr.key, attr.required, undefined, undefined, attr.default, attr.array);
          }
        } catch (attrErr: any) {
          // Attribute already exists or pending
        }
      }

      // Provision indexes idempotently
      for (const idx of def.indexes) {
        try {
          await databases.createIndex(DATABASE_ID, def.collectionId, idx.key, idx.type as any, idx.attributes, idx.orders as any);
        } catch (idxErr: any) {
          // Index already exists or pending
        }
      }
    } catch (e: any) {
      summary.errors.push(`${def.name}: ${e?.message || e}`);
    }
  }

  return summary;
}
