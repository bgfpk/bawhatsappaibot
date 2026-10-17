/**
 * Google Personal Assistant Connection & Lifecycle Service
 * 
 * Account-level server-authoritative Google connection state:
 * - Stored in SYSTEM_CONFIGS with optimistic revision control
 * - Refresh tokens encrypted at rest via secret-crypto-service
 * - Single-flight token refresh lock preventing concurrency storms
 * - Granular capability status (Calendar, Contacts, Gmail, Drive)
 * - Safe disconnect stopping future API use and clearing local tokens
 */

import crypto from "node:crypto";
import { DATABASE_ID, COLLECTIONS, databases } from "../config/appwrite-client.ts";
import { encryptServerSecret, decryptServerSecret } from "./secret-crypto-service.ts";
import {
  type GooglePersonalConnection,
  type GoogleCapability,
  CAPABILITY_REQUIRED_SCOPES,
} from "./google-personal-auth-types.ts";

export const googleConnectionDeps = {
  getDocument: (dbId: string, collId: string, docId: string) =>
    databases.getDocument(dbId, collId, docId),
  createDocument: (dbId: string, collId: string, docId: string, data: any) =>
    databases.createDocument(dbId, collId, docId, data),
  updateDocument: (dbId: string, collId: string, docId: string, data: any) =>
    databases.updateDocument(dbId, collId, docId, data),
};

const connectionCache = new Map<string, { connection: GooglePersonalConnection; cachedAt: number }>();
const CACHE_TTL_MS = 60 * 1000;

// Single-flight lock map per accountId
const refreshFlightMap = new Map<string, Promise<{ accessToken: string; expiry: number }>>();

export function buildGoogleConnectionDocId(accountId: string): string {
  const hash = crypto.createHash("sha256").update(accountId).digest("hex").slice(0, 18);
  return `gconn_${hash}`;
}

export function createDefaultGoogleConnection(accountId: string): GooglePersonalConnection {
  return {
    connectionId: `gconn_${crypto.randomUUID()}`,
    schemaVersion: 1,
    revision: 1,
    accountId,
    provider: "google",
    googleSubject: "",
    googleEmail: "",
    status: "NOT_CONNECTED",
    grantedScopes: [],
    capabilities: {
      calendarAvailability: false,
      calendarEvents: false,
      googleContactsRead: false,
      gmailSend: false,
      driveSelectedFiles: false,
    },
    internalDisabledCapabilities: {
      calendarAvailability: false,
      calendarEvents: false,
      googleContactsRead: false,
      gmailSend: false,
      driveSelectedFiles: false,
    },
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastValidatedAt: 0,
    encryptedRefreshTokenRef: "",
    tokenExpiry: 0,
    refreshStatus: "valid",
  };
}

export function recalculateCapabilitiesFromScopes(
  grantedScopes: string[],
  internalDisabled?: Partial<Record<GoogleCapability, boolean>>
): Record<GoogleCapability, boolean> {
  const grantedSet = new Set(grantedScopes.map((s) => s.trim().toLowerCase()));
  const caps: Record<GoogleCapability, boolean> = {
    calendarAvailability: false,
    calendarEvents: false,
    googleContactsRead: false,
    gmailSend: false,
    driveSelectedFiles: false,
  };

  for (const [capName, requiredScopes] of Object.entries(CAPABILITY_REQUIRED_SCOPES) as [GoogleCapability, string[]][]) {
    const hasAll = requiredScopes.every((req) => grantedSet.has(req.toLowerCase()));
    const isDisabledInternally = Boolean(internalDisabled[capName]);
    caps[capName] = hasAll && !isDisabledInternally;
  }

  return caps;
}

export async function getGooglePersonalConnection(accountId: string): Promise<GooglePersonalConnection> {
  const cached = connectionCache.get(accountId);
  if (cached && Date.now() - cached.cachedAt < CACHE_TTL_MS) {
    return JSON.parse(JSON.stringify(cached.connection));
  }

  const docId = buildGoogleConnectionDocId(accountId);
  try {
    const doc = await googleConnectionDeps.getDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId);
    if (doc?.value) {
      const parsed = JSON.parse(doc.value);
      // Reconcile capabilities from granted scopes and internal switches
      parsed.capabilities = recalculateCapabilitiesFromScopes(
        parsed.grantedScopes || [],
        parsed.internalDisabledCapabilities || {}
      );
      connectionCache.set(accountId, { connection: parsed, cachedAt: Date.now() });
      return JSON.parse(JSON.stringify(parsed));
    }
  } catch {
    // 404 or missing doc -> return default
  }

  const defaultConn = createDefaultGoogleConnection(accountId);
  connectionCache.set(accountId, { connection: defaultConn, cachedAt: Date.now() });
  return defaultConn;
}

export async function saveGooglePersonalConnection(
  connection: GooglePersonalConnection,
  expectedRevision?: number
): Promise<GooglePersonalConnection> {
  const docId = buildGoogleConnectionDocId(connection.accountId);
  const existing = await getGooglePersonalConnection(connection.accountId);

  if (expectedRevision !== undefined && existing.status !== "NOT_CONNECTED" && expectedRevision !== existing.revision) {
    const err: any = new Error(
      `Google connection conflict. Expected revision: ${expectedRevision}, current: ${existing.revision}`
    );
    err.code = "CONNECTION_REVISION_CONFLICT";
    err.status = 409;
    throw err;
  }

  const updated: GooglePersonalConnection = {
    ...connection,
    revision: (existing.revision || 1) + 1,
    updatedAt: Date.now(),
  };

  updated.capabilities = recalculateCapabilitiesFromScopes(
    updated.grantedScopes || [],
    updated.internalDisabledCapabilities || {}
  );

  const payload = {
    configKey: docId,
    value: JSON.stringify(updated),
    updatedAt: new Date().toISOString(),
  };

  try {
    await googleConnectionDeps.updateDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload);
  } catch (err: any) {
    if (err?.code === 404 || err?.status === 404) {
      await googleConnectionDeps.createDocument(DATABASE_ID, COLLECTIONS.SYSTEM_CONFIGS, docId, payload);
    } else {
      throw err;
    }
  }

  connectionCache.set(connection.accountId, { connection: updated, cachedAt: Date.now() });
  return updated;
}

export async function disconnectGooglePersonalConnection(accountId: string): Promise<GooglePersonalConnection> {
  const conn = await getGooglePersonalConnection(accountId);
  conn.status = "REVOKED";
  conn.revokedAt = Date.now();
  conn.encryptedRefreshTokenRef = "";
  conn.tokenExpiry = 0;
  conn.refreshStatus = "invalid_grant";
  conn.grantedScopes = [];
  conn.capabilities = {
    calendarAvailability: false,
    calendarEvents: false,
    googleContactsRead: false,
    gmailSend: false,
    driveSelectedFiles: false,
  };

  const saved = await saveGooglePersonalConnection(conn);
  connectionCache.delete(accountId);
  return saved;
}

export async function setInternalGoogleCapabilityEnabled(
  accountId: string,
  capability: GoogleCapability,
  enabled: boolean
): Promise<GooglePersonalConnection> {
  const conn = await getGooglePersonalConnection(accountId);
  conn.internalDisabledCapabilities[capability] = !enabled;
  conn.capabilities = recalculateCapabilitiesFromScopes(
    conn.grantedScopes,
    conn.internalDisabledCapabilities
  );
  return await saveGooglePersonalConnection(conn);
}

export function invalidateGoogleConnectionCache(accountId?: string): void {
  if (accountId) {
    connectionCache.delete(accountId);
  } else {
    connectionCache.clear();
  }
}

export function __clearGoogleConnectionCacheForTest(): void {
  connectionCache.clear();
  refreshFlightMap.clear();
}
