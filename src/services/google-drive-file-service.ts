/**
 * Google Drive Selected-File Service (Free-Only V1)
 * 
 * Strict V1 Limitations:
 * - Operates under drive.file scope ONLY (no broad Drive search)
 * - Explicit owner-selected file validation against Google API
 * - Strict 25 MB max file size limit
 * - Safe supported MIME types (text, PDF, images, Google Docs exported to text)
 * - Ephemeral processing (no permanent shadow Drive storage)
 */

import { getValidGoogleAccessToken } from "./google-personal-oauth-service.ts";
import {
  evaluateGoogleFreeUsage,
  recordGoogleUsageSuccess,
} from "./google-free-usage-guard.ts";
import type { SelectedDriveFile } from "./google-personal-auth-types.ts";

export const googleDriveDeps = {
  fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

export const MAX_DRIVE_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB

// Server-side registry of owner-selected Drive files: `${accountId}:${fileId}` -> SelectedDriveFile
const selectedDriveFilesStore = new Map<string, SelectedDriveFile>();

export function registerSelectedDriveFile(file: SelectedDriveFile): void {
  const key = `${file.accountId}:${file.fileId}`;
  selectedDriveFilesStore.set(key, {
    ...file,
    selectedAt: file.selectedAt || Date.now(),
    validatedAt: file.validatedAt || Date.now(),
  });
}

export function getSelectedDriveFile(accountId: string, fileId: string): SelectedDriveFile | null {
  return selectedDriveFilesStore.get(`${accountId}:${fileId}`) || null;
}

export function listSelectedDriveFiles(accountId: string): SelectedDriveFile[] {
  const files: SelectedDriveFile[] = [];
  for (const [key, val] of selectedDriveFilesStore.entries()) {
    if (key.startsWith(`${accountId}:`)) {
      files.push(val);
    }
  }
  return files;
}

export async function validateDriveFileAccess(
  accountId: string,
  fileId: string,
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>
): Promise<SelectedDriveFile> {
  const cleanId = String(fileId || "").trim();
  if (!cleanId) {
    const err: any = new Error("Invalid Drive file ID.");
    err.code = "INVALID_DRIVE_FILE_ID";
    throw err;
  }

  // 1. Obtain valid access token
  const { accessToken, connection } = await getValidGoogleAccessToken(accountId);
  if (!connection.capabilities.driveSelectedFiles) {
    const err: any = new Error("GOOGLE_DRIVE_FILE_NOT_GRANTED");
    err.code = "GOOGLE_SCOPE_NOT_GRANTED";
    throw err;
  }

  // 2. Query Google Drive API for file metadata
  const fetchFn = overrideFetch || googleDriveDeps.fetch;
  const res = await fetchFn(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(cleanId)}?fields=id,name,mimeType,size`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const err: any = new Error(data.error?.message || "DRIVE_FILE_VALIDATION_FAILED");
    err.code = "DRIVE_FILE_NOT_AUTHORIZED";
    throw err;
  }

  const sizeBytes = Number(data.size || 0);
  if (sizeBytes > MAX_DRIVE_FILE_SIZE_BYTES) {
    const err: any = new Error(`File exceeds maximum permitted size of 25 MB (${sizeBytes} bytes).`);
    err.code = "GOOGLE_FILE_TOO_LARGE";
    throw err;
  }

  const selectedFile: SelectedDriveFile = {
    fileId: data.id,
    accountId,
    name: data.name || "Untitled File",
    mimeType: data.mimeType || "application/octet-stream",
    sizeBytes,
    selectedAt: Date.now(),
    validatedAt: Date.now(),
  };

  registerSelectedDriveFile(selectedFile);
  return selectedFile;
}

export interface ReadDriveFileResult {
  fileId: string;
  name: string;
  mimeType: string;
  content: string; // text content or base64
  isExportedDoc: boolean;
}

export async function readSelectedDriveFileContent(
  accountId: string,
  fileId: string,
  now = Date.now(),
  overrideFetch?: (url: string, init?: RequestInit) => Promise<any>
): Promise<ReadDriveFileResult> {
  const selected = getSelectedDriveFile(accountId, fileId);
  if (!selected) {
    const err: any = new Error("File has not been selected or authorized by owner.");
    err.code = "DRIVE_FILE_NOT_AUTHORIZED";
    throw err;
  }

  // 1. Free-only usage guard check
  const guard = await evaluateGoogleFreeUsage({
    accountId,
    service: "drive",
    method: "download",
    egressBytes: selected.sizeBytes,
    now,
  });

  if (guard.decision !== "ALLOW") {
    const err: any = new Error(guard.reasonMessage);
    err.code = guard.reasonCode;
    throw err;
  }

  const { accessToken } = await getValidGoogleAccessToken(accountId);
  const fetchFn = overrideFetch || googleDriveDeps.fetch;

  let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
  let isExportedDoc = false;

  if (selected.mimeType === "application/vnd.google-apps.document") {
    // Export Google Docs to plain text
    downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
    isExportedDoc = true;
  }

  const res = await fetchFn(downloadUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err: any = new Error("Failed to read Drive file content.");
    err.code = "DRIVE_READ_FAILED";
    throw err;
  }

  const textContent = await res.text();

  // 2. Record usage on success
  await recordGoogleUsageSuccess({
    accountId,
    service: "drive",
    method: "download",
    egressBytes: selected.sizeBytes || textContent.length,
    now,
  });

  return {
    fileId,
    name: selected.name,
    mimeType: selected.mimeType,
    content: textContent,
    isExportedDoc,
  };
}

export function removeSelectedDriveFile(accountId: string, fileId: string): boolean {
  const cleanId = String(fileId || "").trim();
  const key = `${accountId}:${cleanId}`;
  return selectedDriveFilesStore.delete(key);
}

export function __clearSelectedDriveFilesForTest(): void {
  selectedDriveFilesStore.clear();
}
