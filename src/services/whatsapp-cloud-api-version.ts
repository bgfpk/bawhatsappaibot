// src/services/whatsapp-cloud-api-version.ts
//
// Centralized server-side Graph API version and endpoint helper for WhatsApp Cloud API.
//
// Requirements:
//   - Server-side only
//   - Authoritative URL-builder location
//   - Validates version string format (^v\d+\.0$)
//   - When WHATSAPP_CLOUD_GRAPH_VERSION is absent/invalid, preserves "v20.0"
//     as an explicitly documented compatibility fallback (NOT claimed as current Meta version).
//   - Never customer-controlled, never exposed to frontend bundles.

export const CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION = "v20.0";
const GRAPH_API_BASE_URL = "https://graph.facebook.com";
const GRAPH_VERSION_REGEX = /^v\d+\.0$/;

/**
 * Resolves the configured Meta Graph API version from the server environment.
 * In development / tests, falls back to CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION.
 * In production (NODE_ENV === "production"), fails closed with 'graph_version_not_configured'.
 */
export function getCloudApiGraphVersion(envVersion?: string, isProductionOverride?: boolean): string {
  const isProd =
    typeof isProductionOverride === "boolean"
      ? isProductionOverride
      : typeof process !== "undefined" && process.env?.NODE_ENV === "production";

  const candidate = (
    envVersion ??
    (typeof process !== "undefined" ? process.env?.WHATSAPP_CLOUD_GRAPH_VERSION : undefined)
  )?.trim();

  if (candidate && GRAPH_VERSION_REGEX.test(candidate)) {
    return candidate;
  }

  if (isProd) {
    throw new Error(
      "graph_version_not_configured: In production, WHATSAPP_CLOUD_GRAPH_VERSION must be explicitly set to a valid v<number>.0 version"
    );
  }

  return CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION;
}

/**
 * Builds the authoritative WhatsApp Cloud API messages endpoint URL for a given phoneNumberId.
 * e.g. https://graph.facebook.com/v20.0/123456789/messages
 */
export function buildCloudApiMessagesUrl(phoneNumberId: string, versionOverride?: string): string {
  const cleanPhoneId = String(phoneNumberId || "").trim();
  if (!cleanPhoneId) {
    throw new Error("cloud_api_version: phoneNumberId must be a non-empty string");
  }
  const version = getCloudApiGraphVersion(versionOverride);
  return `${GRAPH_API_BASE_URL}/${version}/${cleanPhoneId}/messages`;
}

/**
 * Builds a generic Graph API URL for a sub-path under the resolved Graph API version.
 */
export function buildCloudApiGraphUrl(path: string, versionOverride?: string): string {
  const cleanPath = String(path || "").trim().replace(/^\/+/, "");
  if (!cleanPath) {
    throw new Error("cloud_api_version: path must be a non-empty string");
  }
  const version = getCloudApiGraphVersion(versionOverride);
  return `${GRAPH_API_BASE_URL}/${version}/${cleanPath}`;
}
