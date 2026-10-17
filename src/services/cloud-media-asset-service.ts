// src/services/cloud-media-asset-service.ts
//
// Tenant-isolated media asset library service for WhatsApp Cloud API instances.
// Stores and retrieves media assets without requiring a WhatsApp group or Baileys sync group.

import crypto from "node:crypto";
import { CloudMediaKind, sanitizeMediaFilename } from "./whatsapp-cloud-api-media-validation.ts";

export interface CloudMediaAsset {
  id: string;
  userId: string;
  botId: string;
  name: string;
  mediaKind: CloudMediaKind;
  mimeType: string;
  fileSizeBytes: number;
  fileName?: string;
  caption?: string;
  mediaId?: string; // Cached Meta media ID if pre-uploaded
  createdAt: number;
  updatedAt: number;
  metadata?: Record<string, any>;
}

export interface SaveCloudMediaAssetInput {
  userId: string;
  botId: string;
  name: string;
  mediaKind: CloudMediaKind;
  mimeType: string;
  fileSizeBytes: number;
  fileName?: string;
  caption?: string;
  mediaId?: string;
  metadata?: Record<string, any>;
}

/** In-memory store fallback for environments without direct SQL connection */
const inMemoryAssetStore = new Map<string, CloudMediaAsset>();

function makeStoreKey(userId: string, botId: string, assetId: string): string {
  return `${userId}:${botId}:${assetId}`;
}

/**
 * Saves or updates a Cloud media asset scoped strictly to userId and botId.
 */
export async function saveCloudMediaAsset(
  input: SaveCloudMediaAssetInput,
  db?: any
): Promise<CloudMediaAsset> {
  const { userId, botId, name, mediaKind, mimeType, fileSizeBytes, fileName, caption, mediaId, metadata } = input;

  if (!userId || !botId) {
    throw new Error("missing_tenant_context: userId and botId are required");
  }

  const assetId = `cma_${crypto.randomBytes(12).toString("hex")}`;
  const now = Date.now();
  const safeName = (name || "Media Asset").trim().slice(0, 100);
  const safeFile = sanitizeMediaFilename(fileName, `file_${assetId}`);

  const asset: CloudMediaAsset = {
    id: assetId,
    userId,
    botId,
    name: safeName,
    mediaKind,
    mimeType,
    fileSizeBytes: Math.max(0, Number(fileSizeBytes) || 0),
    fileName: safeFile,
    caption: (caption || "").slice(0, 1024),
    mediaId,
    createdAt: now,
    updatedAt: now,
    metadata: metadata || {},
  };

  if (db && typeof db.query === "function") {
    try {
      await db.query(
        `INSERT INTO cloud_media_assets (id, user_id, bot_id, name, media_kind, mime_type, file_size_bytes, file_name, caption, media_id, created_at, updated_at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           caption = EXCLUDED.caption,
           media_id = EXCLUDED.media_id,
           updated_at = EXCLUDED.updated_at`,
        [
          asset.id,
          asset.userId,
          asset.botId,
          asset.name,
          asset.mediaKind,
          asset.mimeType,
          asset.fileSizeBytes,
          asset.fileName,
          asset.caption,
          asset.mediaId || null,
          asset.createdAt,
          asset.updatedAt,
          JSON.stringify(asset.metadata),
        ]
      );
    } catch {
      // Fallback to in-memory store
      inMemoryAssetStore.set(makeStoreKey(userId, botId, asset.id), asset);
    }
  } else {
    inMemoryAssetStore.set(makeStoreKey(userId, botId, asset.id), asset);
  }

  return asset;
}

/**
 * Lists all Cloud media assets belonging strictly to the specified userId and botId.
 */
export async function listCloudMediaAssets(
  userId: string,
  botId: string,
  db?: any
): Promise<CloudMediaAsset[]> {
  if (!userId || !botId) return [];

  if (db && typeof db.query === "function") {
    try {
      const res = await db.query(
        `SELECT id, user_id AS "userId", bot_id AS "botId", name, media_kind AS "mediaKind", mime_type AS "mimeType",
                file_size_bytes AS "fileSizeBytes", file_name AS "fileName", caption, media_id AS "mediaId",
                created_at AS "createdAt", updated_at AS "updatedAt", metadata
         FROM cloud_media_assets
         WHERE user_id = $1 AND bot_id = $2
         ORDER BY created_at DESC`,
        [userId, botId]
      );
      if (res && Array.isArray(res.rows)) {
        return res.rows;
      }
    } catch {
      // fallback to memory
    }
  }

  const prefix = `${userId}:${botId}:`;
  const results: CloudMediaAsset[] = [];
  for (const [key, val] of inMemoryAssetStore.entries()) {
    if (key.startsWith(prefix)) {
      results.push(val);
    }
  }
  return results.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Deletes a Cloud media asset strictly scoped to userId and botId.
 */
export async function deleteCloudMediaAsset(
  userId: string,
  botId: string,
  assetId: string,
  db?: any
): Promise<boolean> {
  if (!userId || !botId || !assetId) return false;

  if (db && typeof db.query === "function") {
    try {
      const res = await db.query(
        `DELETE FROM cloud_media_assets WHERE id = $1 AND user_id = $2 AND bot_id = $3`,
        [assetId, userId, botId]
      );
      return (res?.rowCount || 0) > 0;
    } catch {
      // fallback
    }
  }

  const key = makeStoreKey(userId, botId, assetId);
  return inMemoryAssetStore.delete(key);
}
