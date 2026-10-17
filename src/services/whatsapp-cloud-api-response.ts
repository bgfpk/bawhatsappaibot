// src/services/whatsapp-cloud-api-response.ts
//
// Real Meta Cloud API send response mapping and error classification.
//
// Authoritative success contract:
//   messages[0].id -> providerMessageId (wamid)
//
// If 2xx is received but messages[0].id is missing:
//   Treated as SEND FAILURE (no fabricated IDs, no false delivery evidence).

import type { OutgoingSendResult } from "./whatsapp-transport-types.ts";

export interface MetaStructuredError {
  message?: string;
  type?: string;
  code?: number;
  error_subcode?: number;
  fbtrace_id?: string;
  error_data?: any;
}

/**
 * Maps a Meta Graph API send response into a standardized OutgoingSendResult.
 */
export function mapCloudApiSendResponse(
  responseBody: unknown,
  httpStatus: number = 200,
): OutgoingSendResult {
  // If HTTP status is an error status (>= 400), classify it as failure
  if (httpStatus >= 400) {
    const errorInfo = classifyCloudApiHttpError(responseBody, httpStatus);
    return {
      success: false,
      errorCode: errorInfo.errorCode,
      errorMessage: errorInfo.errorMessage,
      retryable: errorInfo.retryable,
      rawProviderResponse: responseBody,
    };
  }

  // Parse success response
  if (responseBody && typeof responseBody === "object") {
    const body = responseBody as Record<string, any>;

    // If Meta returned a 200 with an { error: ... } block
    if (body.error) {
      const errorInfo = classifyCloudApiHttpError(body, httpStatus);
      return {
        success: false,
        errorCode: errorInfo.errorCode,
        errorMessage: errorInfo.errorMessage,
        retryable: errorInfo.retryable,
        rawProviderResponse: responseBody,
      };
    }

    // Check for messages array and messages[0].id
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const firstMsg = messages[0];
    const messageId = typeof firstMsg?.id === "string" ? firstMsg.id.trim() : "";

    if (messageId) {
      return {
        success: true,
        providerMessageId: messageId,
        receiptStatus: "sent",
        rawProviderResponse: responseBody,
      };
    }
  }

  // Response was 2xx but lacked a valid provider message ID
  return {
    success: false,
    errorCode: "missing_provider_message_id",
    errorMessage: "Cloud API response was missing messages[0].id",
    retryable: false,
    rawProviderResponse: responseBody,
  };
}

/**
 * Classifies HTTP status and Meta structured error payloads into standardized retryable/permanent codes.
 */
export function classifyCloudApiHttpError(
  errorPayload: unknown,
  httpStatus?: number,
): { errorCode: string; errorMessage: string; retryable: boolean } {
  let status = httpStatus;
  let metaError: MetaStructuredError | undefined;
  let isTimeout = false;

  if (errorPayload && typeof errorPayload === "object") {
    const p = errorPayload as any;
    if (p.error && typeof p.error === "object") {
      metaError = p.error;
    }
    if (p.rawPayload?.error && typeof p.rawPayload.error === "object") {
      metaError = p.rawPayload.error;
    }
    if (!status && typeof p.status === "number") {
      status = p.status;
    }
    if (p.isTimeout) {
      isTimeout = true;
    }
  }

  // Check timeout/abort first
  if (isTimeout) {
    return {
      errorCode: "network_transient_error",
      errorMessage: "Request timed out or was aborted",
      retryable: true,
    };
  }

  // Check numeric error code from Meta if present
  const code = (errorPayload as any)?.metaErrorCode ?? metaError?.code;
  const subcode = metaError?.error_subcode;

  // Rate limiting (Meta code 80007, 130429, 613, or HTTP 429)
  if (status === 429 || code === 80007 || code === 130429 || code === 613) {
    return {
      errorCode: "rate_limit_exceeded",
      errorMessage: metaError?.message || `Rate limit exceeded (HTTP ${status || 429})`,
      retryable: true,
    };
  }

  // Server errors (5xx, Meta temporary server errors 1, 2)
  if ((status && status >= 500 && status < 600) || code === 1 || code === 2) {
    return {
      errorCode: "meta_server_error",
      errorMessage: metaError?.message || `Meta server error (HTTP ${status || 500})`,
      retryable: true,
    };
  }

  // Auth / Permission errors (HTTP 401, 403, Meta OAuth code 190)
  if (status === 401 || status === 403 || code === 190 || code === 200) {
    return {
      errorCode: "meta_auth_error",
      errorMessage: metaError?.message || `Meta authentication/authorization failure (HTTP ${status || 401})`,
      retryable: false,
    };
  }

  // Bad Request / Invalid Parameter (HTTP 400, Meta codes 100, 131000)
  if (status === 400 || code === 100 || (code && code >= 131000 && code <= 131999)) {
    return {
      errorCode: "meta_bad_request",
      errorMessage: metaError?.message || `Invalid request parameter (HTTP 400${code ? ` code=${code}` : ""})`,
      retryable: false,
    };
  }

  // Resource not found (HTTP 404)
  if (status === 404) {
    return {
      errorCode: "meta_not_found",
      errorMessage: metaError?.message || "Resource not found on Meta Graph API (HTTP 404)",
      retryable: false,
    };
  }

  // Check error message for transient network indicators
  const rawMsg = String(metaError?.message || (errorPayload as any)?.message || errorPayload || "");
  const lowerMsg = rawMsg.toLowerCase();
  const isNetworkTransient =
    lowerMsg.includes("timeout") ||
    lowerMsg.includes("timed out") ||
    lowerMsg.includes("aborted") ||
    lowerMsg.includes("abort") ||
    lowerMsg.includes("econnreset") ||
    lowerMsg.includes("etimedout") ||
    lowerMsg.includes("fetch failed") ||
    lowerMsg.includes("network error");

  if (isNetworkTransient) {
    return {
      errorCode: "network_transient_error",
      errorMessage: rawMsg.slice(0, 120),
      retryable: true,
    };
  }

  return {
    errorCode: "meta_send_failed",
    errorMessage: rawMsg.slice(0, 120) || `Meta send failed with status ${status || "unknown"}`,
    retryable: false,
  };
}
