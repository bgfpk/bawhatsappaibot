import { ID, Query } from "node-appwrite";
import { DATABASE_ID, databases } from "./db-service.ts";

type ListDocuments = typeof databases.listDocuments;
type CreateDocument = typeof databases.createDocument;
type UpdateDocument = typeof databases.updateDocument;

let testDeps: {
  listDocuments?: ListDocuments;
  createDocument?: CreateDocument;
  updateDocument?: UpdateDocument;
} = {};

function listDocuments() {
  return testDeps.listDocuments || databases.listDocuments.bind(databases);
}

function createDocument() {
  return testDeps.createDocument || databases.createDocument.bind(databases);
}

function updateDocument() {
  return testDeps.updateDocument || databases.updateDocument.bind(databases);
}

export function isBetaCollectionUnavailable(error: any) {
  const code = Number(error?.code || 0);
  const message = String(error?.message || "").toLowerCase();
  return code === 404 || (code === 400 && /collection|attribute|index|unknown attribute|not found/.test(message));
}

function stripAppwriteMeta(row: any) {
  const { $id, $createdAt, $updatedAt, $permissions, $collectionId, $databaseId, ...rest } = row || {};
  return { id: rest.id || $id, ...rest };
}

function cleanDocumentId(value: any) {
  const text = String(value || "").replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 36);
  return text || ID.unique();
}

export async function listBetaCollectionRows(collectionId: string, accountId: string, options: {
  limit?: number;
  orderDesc?: string;
  queries?: string[];
} = {}) {
  try {
    const queries = [
      Query.equal("accountId", accountId),
      ...(options.orderDesc ? [Query.orderDesc(options.orderDesc)] : []),
      Query.limit(options.limit || 100),
      ...(options.queries || []),
    ];
    const response = await listDocuments()(DATABASE_ID, collectionId, queries);
    return { available: true, rows: (response.documents || []).map(stripAppwriteMeta) };
  } catch (error) {
    if (isBetaCollectionUnavailable(error)) return { available: false, rows: [] };
    throw error;
  }
}

export async function writeBetaCollectionRow(collectionId: string, row: any) {
  const docId = cleanDocumentId(row?.id);
  const { id, ...data } = row || {};
  try {
    await createDocument()(DATABASE_ID, collectionId, docId, data);
    return { available: true, written: true, id: docId };
  } catch (error: any) {
    if (!isBetaCollectionUnavailable(error) && Number(error?.code || 0) === 409) {
      await updateDocument()(DATABASE_ID, collectionId, docId, data);
      return { available: true, written: true, id: docId };
    }
    if (isBetaCollectionUnavailable(error)) return { available: false, written: false, id: docId };
    throw error;
  }
}

export function mergeRowsById<T extends { id?: string }>(collectionRows: T[] = [], fallbackRows: T[] = []) {
  const seen = new Set<string>();
  const merged: T[] = [];
  for (const row of [...collectionRows, ...fallbackRows]) {
    const key = String(row?.id || "");
    if (key && seen.has(key)) continue;
    if (key) seen.add(key);
    merged.push(row);
  }
  return merged;
}

export function safeJsonString(value: any, maxLength = 5000) {
  const text = JSON.stringify(value ?? null);
  return text.slice(0, maxLength);
}

export function parseJsonString(value: any, fallback: any) {
  if (!value) return fallback;
  try {
    return JSON.parse(String(value));
  } catch {
    return fallback;
  }
}

export function __setIntegrationBetaCollectionTestDeps(deps: typeof testDeps) {
  testDeps = deps || {};
}

export function __resetIntegrationBetaCollectionTestDeps() {
  testDeps = {};
}
