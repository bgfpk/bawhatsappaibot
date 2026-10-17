// src/services/whatsapp-cloud-api-media-validation.ts
//
// Authoritative media validation for WhatsApp Cloud API.
// Validates MIME types, size limits, file magic signatures, and sanitizes filenames.

export type CloudMediaKind = "image" | "audio" | "voice" | "document" | "sticker" | "video";

export interface MediaLimitRule {
  allowedMimes: string[];
  maxSizeBytes: number;
}

export const CLOUD_MEDIA_LIMITS: Record<CloudMediaKind, MediaLimitRule> = {
  image: {
    allowedMimes: ["image/jpeg", "image/png", "image/jpg"],
    maxSizeBytes: 5 * 1024 * 1024, // 5 MB
  },
  audio: {
    allowedMimes: [
      "audio/aac",
      "audio/mp4",
      "audio/mpeg",
      "audio/amr",
      "audio/ogg",
      "audio/ogg; codecs=opus",
    ],
    maxSizeBytes: 16 * 1024 * 1024, // 16 MB
  },
  voice: {
    allowedMimes: ["audio/ogg", "audio/ogg; codecs=opus"],
    maxSizeBytes: 16 * 1024 * 1024, // 16 MB
  },
  document: {
    allowedMimes: [
      "text/plain",
      "application/pdf",
      "application/vnd.ms-powerpoint",
      "application/msword",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ],
    maxSizeBytes: 100 * 1024 * 1024, // 100 MB
  },
  sticker: {
    allowedMimes: ["image/webp"],
    maxSizeBytes: 100 * 1024, // 100 KB
  },
  video: {
    allowedMimes: ["video/mp4", "video/3gpp"],
    maxSizeBytes: 16 * 1024 * 1024, // 16 MB
  },
};

/**
 * Normalizes a MIME type string (strips whitespace and standardizes lower-case base type).
 */
export function normalizeMimeType(mime?: string): string {
  if (!mime || typeof mime !== "string") return "";
  const cleaned = mime.trim().toLowerCase();
  // If it has parameters like codecs=opus, preserve codec info for ogg, else take base
  if (cleaned.startsWith("audio/ogg") && cleaned.includes("opus")) {
    return "audio/ogg; codecs=opus";
  }
  return cleaned.split(";")[0].trim();
}

/**
 * Validates file magic byte signature for common/high-risk binary formats.
 * Returns true if the buffer matches the expected format signature, or true if signature check is not applicable.
 */
export function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  if (!buffer || buffer.length === 0) return false;

  const normalized = normalizeMimeType(mimeType);

  if (normalized === "image/jpeg" || normalized === "image/jpg") {
    if (buffer.length < 3) return false;
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  if (normalized === "image/png") {
    if (buffer.length < 8) return false;
    return (
      buffer[0] === 0x89 &&
      buffer[1] === 0x50 &&
      buffer[2] === 0x4e &&
      buffer[3] === 0x47 &&
      buffer[4] === 0x0d &&
      buffer[5] === 0x0a &&
      buffer[6] === 0x1a &&
      buffer[7] === 0x0a
    );
  }

  if (normalized === "application/pdf") {
    if (buffer.length < 5) return false;
    // Starts with '%PDF-'
    return buffer.toString("utf8", 0, 5) === "%PDF-";
  }

  if (normalized === "image/webp") {
    if (buffer.length < 12) return false;
    // 'RIFF' at 0..4 and 'WEBP' at 8..12
    const riff = buffer.toString("ascii", 0, 4);
    const webp = buffer.toString("ascii", 8, 12);
    return riff === "RIFF" && webp === "WEBP";
  }

  if (normalized === "audio/ogg" || normalized === "audio/ogg; codecs=opus") {
    if (buffer.length < 4) return false;
    // 'OggS' at 0..4
    return buffer.toString("ascii", 0, 4) === "OggS";
  }

  // Other types (plain text, generic office documents) do not have strict simple magic bytes
  return true;
}

/**
 * Sanitizes a filename to prevent path traversal and shell escapes.
 */
export function sanitizeMediaFilename(filename?: string, defaultName: string = "file"): string {
  if (!filename || typeof filename !== "string") return defaultName;

  // Strip path traversal and path separators
  let safe = filename.replace(/^.*[/\\]/, "").trim();

  // Replace invalid / dangerous characters
  safe = safe.replace(/[^a-zA-Z0-9._-]/g, "_");

  if (!safe || safe === "." || safe === "..") {
    return defaultName;
  }

  // Bound length to 200 chars
  if (safe.length > 200) {
    const extMatch = safe.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : "";
    safe = safe.slice(0, 200 - ext.length) + ext;
  }

  return safe;
}

export interface MediaValidationResult {
  valid: boolean;
  kind?: CloudMediaKind;
  normalizedMime?: string;
  error?: string;
}

/**
 * Validates media buffer, kind, size, and signature for WhatsApp Cloud API upload.
 */
export function validateCloudMediaBuffer(
  buffer: Buffer,
  mimeType: string,
  kind?: CloudMediaKind
): MediaValidationResult {
  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return { valid: false, error: "empty_media_buffer: media buffer is empty or missing" };
  }

  const normalized = normalizeMimeType(mimeType);
  if (!normalized) {
    return { valid: false, error: "missing_mime_type" };
  }

  // Infer kind if not supplied
  let targetKind = kind;
  if (!targetKind) {
    if (normalized.startsWith("image/webp")) targetKind = "sticker";
    else if (normalized.startsWith("image/")) targetKind = "image";
    else if (normalized.startsWith("audio/")) targetKind = "audio";
    else if (normalized.startsWith("video/")) targetKind = "video";
    else targetKind = "document";
  }

  const rule = CLOUD_MEDIA_LIMITS[targetKind];
  if (!rule) {
    return { valid: false, error: `unsupported_media_kind: ${targetKind}` };
  }

  // Check allowed MIME
  const isAllowedMime = rule.allowedMimes.some((m) => normalizeMimeType(m) === normalized);
  if (!isAllowedMime) {
    return {
      valid: false,
      error: `unsupported_media_type: MIME ${normalized} is not allowed for ${targetKind}`,
    };
  }

  // Check max size
  if (buffer.length > rule.maxSizeBytes) {
    return {
      valid: false,
      error: `media_too_large: file size ${buffer.length} exceeds limit of ${rule.maxSizeBytes} bytes for ${targetKind}`,
    };
  }

  // Check file signature
  const signatureOk = validateFileSignature(buffer, normalized);
  if (!signatureOk) {
    return {
      valid: false,
      error: `media_signature_mismatch: binary signature does not match claimed MIME ${normalized}`,
    };
  }

  return {
    valid: true,
    kind: targetKind,
    normalizedMime: normalized,
  };
}
