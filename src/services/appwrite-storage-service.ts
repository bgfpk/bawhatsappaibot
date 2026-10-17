import crypto from "node:crypto";
import { storage, BUCKETS } from "../config/appwrite-client.ts";
import { InputFile } from "node-appwrite/file";

export interface StorageBucketConfig {
  bucketId: string;
  name: string;
  permissions: string[];
  fileSecurity: boolean;
  enabled: boolean;
  maximumFileSize: number;
  allowedFileExtensions: string[];
}

export const CONTACT_IMPORT_BUCKET_CONFIG: StorageBucketConfig = {
  bucketId: BUCKETS.CONTACT_IMPORT_FILES,
  name: "Contact Import Files",
  permissions: [], // Private bucket: server SDK / authorized server routes only
  fileSecurity: true, // File-level security enabled
  enabled: true,
  maximumFileSize: 25000000, // 25MB (within Appwrite 30,000,000 limit)
  allowedFileExtensions: ["csv", "txt"],
};

export const WORKSPACE_FILES_BUCKET_CONFIG: StorageBucketConfig = {
  bucketId: BUCKETS.WORKSPACE_FILES,
  name: "Workspace Files",
  permissions: [], // Private bucket: server SDK / authorized server routes only
  fileSecurity: true, // File-level security enabled
  enabled: true,
  maximumFileSize: 30000000, // 30MB (Appwrite limit is 30,000,000 bytes)
  allowedFileExtensions: [
    // Voice / Audio
    "ogg", "oga", "mp3", "wav", "m4a", "aac", "opus",
    // Images
    "jpg", "jpeg", "png", "webp", "gif",
    // Documents / PDF
    "pdf", "doc", "docx", "txt", "rtf", "csv", "xlsx", "xls",
    // Video
    "mp4", "mov", "webm", "avi", "mkv", "3gp",
  ],
};

export interface StorageAdapter {
  getBucket(bucketId: string): Promise<any>;
  createBucket(config: StorageBucketConfig): Promise<any>;
  createFile(bucketId: string, fileId: string, file: any, permissions?: string[]): Promise<{ $id: string; sizeOriginal?: number; name?: string }>;
  getFileDownload(bucketId: string, fileId: string): Promise<Buffer | ArrayBuffer>;
  deleteFile(bucketId: string, fileId: string): Promise<boolean>;
}

/**
 * Standard Appwrite Storage Adapter using node-appwrite Storage SDK
 */
class DefaultAppwriteStorageAdapter implements StorageAdapter {
  async getBucket(bucketId: string): Promise<any> {
    return await storage.getBucket(bucketId);
  }

  async createBucket(config: StorageBucketConfig): Promise<any> {
    return await storage.createBucket({
      bucketId: config.bucketId,
      name: config.name,
      permissions: config.permissions,
      fileSecurity: config.fileSecurity,
      enabled: config.enabled,
      maximumFileSize: config.maximumFileSize,
      allowedFileExtensions: config.allowedFileExtensions,
    });
  }

  async createFile(bucketId: string, fileId: string, file: any, permissions: string[] = []): Promise<{ $id: string; sizeOriginal?: number; name?: string }> {
    return await storage.createFile({
      bucketId,
      fileId,
      file,
      permissions,
    });
  }

  async getFileDownload(bucketId: string, fileId: string): Promise<Buffer> {
    const ab = await storage.getFileDownload(bucketId, fileId);
    return Buffer.isBuffer(ab) ? ab : Buffer.from(ab as ArrayBuffer);
  }

  async deleteFile(bucketId: string, fileId: string): Promise<boolean> {
    try {
      await storage.deleteFile(bucketId, fileId);
      return true;
    } catch (err: any) {
      if (err?.code === 404 || String(err?.message || "").includes("not found")) {
        return false;
      }
      throw err;
    }
  }
}

/**
 * In-memory Mock Storage Adapter for tests, simulating out-of-process Appwrite Storage.
 * Retains stored files even when service-level in-memory state is wiped.
 */
export class MockStorageAdapter implements StorageAdapter {
  public buckets = new Map<string, StorageBucketConfig>();
  public files = new Map<string, { bucketId: string; fileId: string; buffer: Buffer; name: string; permissions: string[] }>();
  public failNextUpload = false;
  public failNextDownload = false;
  public failBucketCreation = false;

  async getBucket(bucketId: string): Promise<any> {
    const b = this.buckets.get(bucketId);
    if (!b) {
      const err: any = new Error(`Bucket with requested ID could not be found.`);
      err.code = 404;
      throw err;
    }
    return { $id: b.bucketId, ...b };
  }

  async createBucket(config: StorageBucketConfig): Promise<any> {
    if (this.failBucketCreation) {
      throw new Error("Failed to create bucket: server error");
    }
    if (this.buckets.has(config.bucketId)) {
      const err: any = new Error(`Bucket already exists`);
      err.code = 409;
      throw err;
    }
    this.buckets.set(config.bucketId, { ...config });
    return { $id: config.bucketId, ...config };
  }

  async createFile(bucketId: string, fileId: string, file: any, permissions: string[] = []): Promise<{ $id: string; sizeOriginal: number; name: string }> {
    if (this.failNextUpload) {
      this.failNextUpload = false;
      throw new Error("Appwrite Storage upload failed: storage quota or network error");
    }

    let buffer: Buffer;
    let name = "file";
    if (file && Buffer.isBuffer(file)) {
      buffer = file;
    } else if (file && typeof file.arrayBuffer === "function") {
      name = file.name || "file";
      const ab = await file.arrayBuffer();
      buffer = Buffer.from(ab);
    } else if (file && typeof file === "object" && file.name) {
      name = file.name;
      buffer = Buffer.isBuffer(file.buffer) ? file.buffer : Buffer.from(file.source || file.parts || "");
    } else if (typeof file === "string") {
      buffer = Buffer.from(file, "utf8");
    } else {
      buffer = Buffer.from(String(file || ""), "utf8");
    }

    const key = `${bucketId}:${fileId}`;
    if (this.files.has(key)) {
      const err: any = new Error(`File ${fileId} already exists in bucket ${bucketId}`);
      err.code = 409;
      throw err;
    }
    this.files.set(key, { bucketId, fileId, buffer, name, permissions });
    return { $id: fileId, sizeOriginal: buffer.length, name };
  }

  async getFileDownload(bucketId: string, fileId: string): Promise<Buffer> {
    if (this.failNextDownload) {
      this.failNextDownload = false;
      throw new Error("Appwrite Storage download failed: connection timeout");
    }

    const key = `${bucketId}:${fileId}`;
    const file = this.files.get(key);
    if (!file) {
      const err: any = new Error(`File ${fileId} not found in bucket ${bucketId}`);
      err.code = 404;
      throw err;
    }
    return file.buffer;
  }

  async deleteFile(bucketId: string, fileId: string): Promise<boolean> {
    const key = `${bucketId}:${fileId}`;
    return this.files.delete(key);
  }
}

const isTestEnv =
  process.env.NODE_ENV === "test" ||
  process.argv.some((a) => a.includes("--test") || a.includes("test") || a.includes("vitest"));

let activeStorageAdapter: StorageAdapter = isTestEnv
  ? new MockStorageAdapter()
  : new DefaultAppwriteStorageAdapter();

export function getStorageAdapter(): StorageAdapter {
  return activeStorageAdapter;
}

export function setStorageAdapterForTest(adapter: StorageAdapter | null): void {
  activeStorageAdapter = adapter || new DefaultAppwriteStorageAdapter();
}

/**
 * Ensures required private Appwrite Storage buckets exist idempotently.
 * Called before PM2 reload in deploy script.
 */
export async function ensureAppwriteStorageBuckets(customAdapter?: StorageAdapter): Promise<{
  created: string[];
  existing: string[];
  errors: string[];
}> {
  const adapter = customAdapter || getStorageAdapter();
  const summary = {
    created: [] as string[],
    existing: [] as string[],
    errors: [] as string[],
  };

  const configs: StorageBucketConfig[] = [
    CONTACT_IMPORT_BUCKET_CONFIG,
    WORKSPACE_FILES_BUCKET_CONFIG,
  ];

  for (const cfg of configs) {
    try {
      try {
        await adapter.getBucket(cfg.bucketId);
        summary.existing.push(cfg.bucketId);
      } catch (err: any) {
        if (err?.code === 404 || String(err?.message || "").includes("not found")) {
          await adapter.createBucket(cfg);
          summary.created.push(cfg.bucketId);
        } else {
          throw err;
        }
      }
    } catch (e: any) {
      summary.errors.push(`${cfg.bucketId}: ${e?.message || e}`);
    }
  }

  return summary;
}

/**
 * Derives an authoritative, collision-safe, tenant-scoped storage file ID for contact imports.
 * Incorporates accountId, importId, and content hash (<= 36 chars, Appwrite compatible).
 */
export function deriveContactImportStorageFileId(accountId: string, importId: string, contentHash: string): string {
  const cleanAccount = accountId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const scope = crypto.createHash("sha256").update(`${accountId}:${importId}:${contentHash}`).digest("hex").slice(0, 20);
  return `cimp_${cleanAccount}_${scope}`.slice(0, 36);
}

/**
 * Derives an authoritative, collision-safe, tenant-and-workspace-scoped storage file ID for workspace media.
 * Incorporates accountId, workspaceId, and content hash (<= 36 chars, Appwrite compatible).
 * Ensures two different tenants/workspaces uploading identical binary content never share or collide
 * on the same Appwrite storage file ID, while still enabling dedupe within the same workspace.
 */
export function deriveWorkspaceStorageFileId(accountId: string, workspaceId: string, contentHash: string): string {
  const cleanAccount = accountId.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8);
  const scope = crypto.createHash("sha256").update(`${accountId}:${workspaceId}:${contentHash}`).digest("hex").slice(0, 20);
  return `wsf_${cleanAccount}_${scope}`.slice(0, 36);
}

/**
 * Generate a bounded, Appwrite-compatible unique file ID (max 36 chars, alphanumeric, period, hyphen, underscore).
 */
export function generateStorageFileId(prefix: string, entropy?: string): string {
  const cleanPrefix = prefix.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 10);
  const hashPart = entropy
    ? crypto.createHash("sha256").update(entropy).digest("hex").slice(0, 18)
    : crypto.randomBytes(9).toString("hex");
  const timePart = Date.now().toString(36);
  const fileId = `${cleanPrefix}_${timePart}_${hashPart}`.slice(0, 36);
  return fileId;
}

/**
 * Persist an imported contact CSV to private Appwrite Storage.
 */
export async function uploadContactImportFile(params: {
  accountId: string;
  importId: string;
  fileName: string;
  content: string | Buffer;
  fileStorageId?: string;
}): Promise<{
  storageBucketId: string;
  storageFileId: string;
  size: number;
  hash: string;
}> {
  const adapter = getStorageAdapter();
  const bucketId = BUCKETS.CONTACT_IMPORT_FILES;
  const buffer = Buffer.isBuffer(params.content) ? params.content : Buffer.from(params.content, "utf8");
  const size = buffer.length;
  const hash = crypto.createHash("sha256").update(buffer).digest("hex");

  // Authoritative tenant-safe file ID: <= 36 characters
  const storageFileId = params.fileStorageId && params.fileStorageId.length <= 36 && /^[a-zA-Z0-9._-]+$/.test(params.fileStorageId)
    ? params.fileStorageId
    : deriveContactImportStorageFileId(params.accountId, params.importId, hash);

  // Create Appwrite InputFile or buffer
  const cleanFileName = (params.fileName || "contacts.csv").replace(/[^\w.-]/g, "_").slice(0, 200);
  let filePayload: any;
  try {
    filePayload = InputFile.fromBuffer(buffer, cleanFileName);
  } catch {
    filePayload = buffer;
  }

  try {
    await adapter.createFile(bucketId, storageFileId, filePayload, []);
  } catch (err: any) {
    if (err?.code === 409 || String(err?.message || "").toLowerCase().includes("already exists")) {
      // Safe deduplication: identical file already stored in this tenant import scope
    } else {
      throw err;
    }
  }

  return {
    storageBucketId: bucketId,
    storageFileId,
    size,
    hash,
  };
}

/**
 * Retrieve raw imported CSV from private Appwrite Storage.
 */
export async function downloadContactImportFile(
  bucketId: string,
  storageFileId: string
): Promise<Buffer> {
  const adapter = getStorageAdapter();
  const targetBucket = bucketId || BUCKETS.CONTACT_IMPORT_FILES;
  const res = await adapter.getFileDownload(targetBucket, storageFileId);
  return Buffer.isBuffer(res) ? res : Buffer.from(res as ArrayBuffer);
}

/**
 * Delete imported CSV from private Appwrite Storage.
 */
export async function deleteContactImportFile(
  storageFileId: string,
  bucketId?: string
): Promise<boolean> {
  const adapter = getStorageAdapter();
  const targetBucket = bucketId || BUCKETS.CONTACT_IMPORT_FILES;
  return await adapter.deleteFile(targetBucket, storageFileId);
}

/**
 * Persist raw multimodal Workspace media (voice, image, doc, video) to private Appwrite Storage.
 */
export async function uploadWorkspaceFile(params: {
  accountId: string;
  workspaceId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  fileStorageId?: string;
}): Promise<{
  storageBucketId: string;
  storageFileId: string;
  size: number;
  hash: string;
}> {
  const adapter = getStorageAdapter();
  const bucketId = BUCKETS.WORKSPACE_FILES;
  const size = params.buffer.length;
  const hash = crypto.createHash("sha256").update(params.buffer).digest("hex");

  // Authoritative tenant-and-workspace-safe file ID based on hash: <= 36 chars
  const storageFileId = params.fileStorageId && params.fileStorageId.length <= 36 && /^[a-zA-Z0-9._-]+$/.test(params.fileStorageId)
    ? params.fileStorageId
    : deriveWorkspaceStorageFileId(params.accountId, params.workspaceId, hash);

  const cleanFileName = (params.fileName || "media").replace(/[^\w.-]/g, "_").slice(0, 200);
  let filePayload: any;
  try {
    filePayload = InputFile.fromBuffer(params.buffer, cleanFileName);
  } catch {
    filePayload = params.buffer;
  }

  try {
    await adapter.createFile(bucketId, storageFileId, filePayload, []);
  } catch (err: any) {
    if (err?.code === 409 || String(err?.message || "").toLowerCase().includes("already exists")) {
      // Safe deduplication: identical file already stored in this workspace scope
    } else {
      throw err;
    }
  }

  return {
    storageBucketId: bucketId,
    storageFileId,
    size,
    hash,
  };
}

/**
 * Retrieve raw Workspace media from private Appwrite Storage.
 */
export async function downloadWorkspaceFile(
  bucketId: string,
  storageFileId: string
): Promise<Buffer> {
  const adapter = getStorageAdapter();
  const targetBucket = bucketId || BUCKETS.WORKSPACE_FILES;
  const res = await adapter.getFileDownload(targetBucket, storageFileId);
  return Buffer.isBuffer(res) ? res : Buffer.from(res as ArrayBuffer);
}

/**
 * Delete raw Workspace media from private Appwrite Storage.
 */
export async function deleteWorkspaceFile(
  storageFileId: string,
  bucketId?: string
): Promise<boolean> {
  const adapter = getStorageAdapter();
  const targetBucket = bucketId || BUCKETS.WORKSPACE_FILES;
  return await adapter.deleteFile(targetBucket, storageFileId);
}
