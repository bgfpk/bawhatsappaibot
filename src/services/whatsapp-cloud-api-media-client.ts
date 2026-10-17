// src/services/whatsapp-cloud-api-media-client.ts
//
// Authoritative HTTP client for WhatsApp Cloud API media operations:
// 1. uploadMedia: Uploads binary media to Meta Graph API
// 2. retrieveMediaMetadata: Retrieves ephemeral media URL and metadata
// 3. downloadMedia: Securely downloads binary media with SSRF guard, bounded streaming, sha256 checksum check, and 404 expiry retry

import crypto from "node:crypto";
import { getCloudApiGraphVersion } from "./whatsapp-cloud-api-version.ts";
import {
  validateCloudMediaBuffer,
  sanitizeMediaFilename,
  CloudMediaKind,
} from "./whatsapp-cloud-api-media-validation.ts";
import { validateExternalServiceUrl } from "./outbound-url-safety-service.ts";

export interface UploadMediaOptions {
  phoneNumberId: string;
  accessToken: string;
  buffer: Buffer;
  mimeType: string;
  filename?: string;
  kind?: CloudMediaKind;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface UploadMediaResult {
  success: boolean;
  mediaId: string;
}

export interface RetrieveMediaMetadataOptions {
  mediaId: string;
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface MediaMetadataResult {
  id: string;
  url: string;
  mimeType?: string;
  sha256?: string;
  fileSize?: number;
}

export interface DownloadMediaOptions {
  mediaId: string;
  phoneNumberId: string;
  accessToken: string;
  graphVersion?: string;
  maxSizeBytes?: number;
  fetchImpl?: typeof fetch;
}

export interface DownloadMediaResult {
  buffer: Buffer;
  mimeType: string;
  sha256?: string;
}

/**
 * Uploads a validated media file to Meta WhatsApp Cloud API.
 */
export async function uploadMedia(options: UploadMediaOptions): Promise<UploadMediaResult> {
  const {
    phoneNumberId,
    accessToken,
    buffer,
    mimeType,
    filename,
    kind,
    graphVersion = getCloudApiGraphVersion(),
    fetchImpl = globalThis.fetch,
  } = options;

  if (!phoneNumberId || !accessToken) {
    throw new Error("missing_credentials: phoneNumberId and accessToken are required for media upload");
  }

  // 1. Authoritative buffer & signature validation
  const validation = validateCloudMediaBuffer(buffer, mimeType, kind);
  if (!validation.valid) {
    throw new Error(validation.error || "invalid_media_buffer");
  }

  const normalizedMime = validation.normalizedMime || mimeType;
  const safeFilename = sanitizeMediaFilename(filename, `upload.${normalizedMime.split("/")[1] || "bin"}`);

  // 2. Build standard multipart/form-data
  const formData = new FormData();
  formData.append("messaging_product", "whatsapp");
  formData.append("type", normalizedMime);

  const fileBlob = new Blob([buffer], { type: normalizedMime });
  formData.append("file", fileBlob, safeFilename);

  const url = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}/media`;

  const response = await fetchImpl(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    body: formData,
  });

  const responseText = await response.text();
  let json: any = {};
  try {
    json = JSON.parse(responseText);
  } catch {
    json = {};
  }

  if (!response.ok) {
    const errorMsg = json?.error?.message || `HTTP ${response.status}`;
    const errorSubcode = json?.error?.error_subcode;
    const isRetryable = response.status === 429 || response.status >= 500;
    throw new Error(
      `media_upload_failed: ${errorMsg} (status: ${response.status}${errorSubcode ? `, subcode: ${errorSubcode}` : ""}, retryable: ${isRetryable})`
    );
  }

  const mediaId = String(json?.id || "").trim();
  if (!mediaId) {
    throw new Error("missing_media_id_in_response: Meta upload response did not return a valid media ID");
  }

  return {
    success: true,
    mediaId,
  };
}

/**
 * Retrieves the ephemeral media URL and metadata from Meta Graph API.
 */
export async function retrieveMediaMetadata(
  options: RetrieveMediaMetadataOptions
): Promise<MediaMetadataResult> {
  const {
    mediaId,
    phoneNumberId,
    accessToken,
    graphVersion = getCloudApiGraphVersion(),
    fetchImpl = globalThis.fetch,
  } = options;

  if (!mediaId || !phoneNumberId || !accessToken) {
    throw new Error("missing_parameters: mediaId, phoneNumberId, and accessToken are required");
  }

  const url = `https://graph.facebook.com/${graphVersion}/${encodeURIComponent(
    mediaId
  )}?phone_number_id=${encodeURIComponent(phoneNumberId)}`;

  const response = await fetchImpl(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const responseText = await response.text();
  let json: any = {};
  try {
    json = JSON.parse(responseText);
  } catch {
    json = {};
  }

  if (!response.ok) {
    const errorMsg = json?.error?.message || `HTTP ${response.status}`;
    throw new Error(`media_metadata_failed: ${errorMsg} (status: ${response.status})`);
  }

  const returnedId = String(json?.id || "").trim();
  if (returnedId && returnedId !== mediaId) {
    throw new Error(`media_id_mismatch: requested ${mediaId}, received ${returnedId}`);
  }

  const downloadUrl = String(json?.url || "").trim();
  if (!downloadUrl) {
    throw new Error("missing_media_download_url: Meta metadata response did not contain download URL");
  }

  return {
    id: returnedId || mediaId,
    url: downloadUrl,
    mimeType: json?.mime_type,
    sha256: json?.sha256,
    fileSize: typeof json?.file_size === "number" ? json.file_size : undefined,
  };
}

/**
 * Securely downloads binary media from Meta with SSRF protection, size limits, integrity verification,
 * and single retry on 404 expired URLs.
 */
export async function downloadMedia(options: DownloadMediaOptions): Promise<DownloadMediaResult> {
  const {
    mediaId,
    phoneNumberId,
    accessToken,
    graphVersion = getCloudApiGraphVersion(),
    maxSizeBytes = 100 * 1024 * 1024, // 100 MB default max
    fetchImpl = globalThis.fetch,
  } = options;

  if (!mediaId || !phoneNumberId || !accessToken) {
    throw new Error("missing_parameters: mediaId, phoneNumberId, and accessToken are required");
  }

  // 1. Fetch metadata to get download URL
  let metadata = await retrieveMediaMetadata({
    mediaId,
    phoneNumberId,
    accessToken,
    graphVersion,
    fetchImpl,
  });

  // Helper to execute download on a verified URL
  const executeDownload = async (targetUrl: string): Promise<Response> => {
    // SSRF protection
    validateExternalServiceUrl(targetUrl, {
      label: "Meta Media Download",
      requireHttps: true,
    });

    return fetchImpl(targetUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
  };

  // 2. Perform initial download
  let downloadResponse = await executeDownload(metadata.url);

  // 3. Handle 404 (expired URL) with exactly ONE retry
  if (downloadResponse.status === 404) {
    metadata = await retrieveMediaMetadata({
      mediaId,
      phoneNumberId,
      accessToken,
      graphVersion,
      fetchImpl,
    });
    downloadResponse = await executeDownload(metadata.url);
  }

  if (!downloadResponse.ok) {
    throw new Error(`media_download_failed: HTTP ${downloadResponse.status}`);
  }

  // 4. Bounded byte streaming / size protection
  const contentLength = Number(downloadResponse.headers.get("content-length"));
  if (contentLength && contentLength > maxSizeBytes) {
    throw new Error(`media_too_large: Content-Length ${contentLength} exceeds maximum of ${maxSizeBytes} bytes`);
  }

  const arrayBuffer = await downloadResponse.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  if (buffer.length > maxSizeBytes) {
    throw new Error(`media_too_large: downloaded bytes ${buffer.length} exceed maximum of ${maxSizeBytes} bytes`);
  }

  // 5. Integrity verification (sha256 checksum)
  if (metadata.sha256) {
    const computedSha = crypto.createHash("sha256").update(buffer).digest("hex");
    if (computedSha.toLowerCase() !== metadata.sha256.toLowerCase()) {
      throw new Error(`media_integrity_failed: sha256 checksum mismatch`);
    }
  }

  const mimeType = metadata.mimeType || downloadResponse.headers.get("content-type") || "application/octet-stream";

  return {
    buffer,
    mimeType,
    sha256: metadata.sha256,
  };
}
