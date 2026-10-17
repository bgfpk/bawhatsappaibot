// src/services/whatsapp-cloud-api-http-client.ts
//
// Phase 4Q: Pure authenticated HTTP client helper for WhatsApp Cloud API.
//
// This module creates a minimal HTTP client compatible with the `httpClient`
// dependency slot in WhatsAppCloudApiTransportProvider. It does NOT:
//   - import bot-worker.ts or server.ts
//   - log the access token, Authorization header, or raw request body
//   - make real network requests in tests (fetchImpl is injected)
//   - decrypt tokens, bill, save messages, trigger AI, or change Baileys behaviour
//
// Not wired into bot-worker.ts yet. That is Phase 4R.

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Minimal fetch-compatible interface — subset of the global fetch signature
 * that this helper requires. Injected in tests; defaults to global fetch.
 */
export interface FetchImpl {
  (url: string, init?: FetchRequestInit): Promise<FetchResponse>;
}

export interface FetchRequestInit {
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  signal?: AbortSignal;
}

export interface FetchResponse {
  ok: boolean;
  status: number;
  statusText?: string;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

/**
 * Safe logger interface. Never receives secrets.
 */
export interface CloudApiHttpClientLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Options accepted by createWhatsAppCloudApiHttpClient.
 *
 * SECRET SAFETY: Only `accessToken` is sensitive. It is used exclusively
 * to set the Authorization header. It is NEVER logged, returned, or stored
 * outside the Authorization header construction.
 */
export interface WhatsAppCloudApiHttpClientOptions {
  /** Bearer token used for Authorization header. Never logged. */
  accessToken: string;

  /**
   * Injected fetch implementation. Uses global `fetch` when omitted.
   * Must be injected in tests to avoid real network calls.
   */
  fetchImpl?: FetchImpl;

  /** Optional safe diagnostic logger. Never receives token or request body. */
  logger?: CloudApiHttpClientLogger;

  /**
   * Request timeout in milliseconds.
   * When set and AbortController is available, aborts the fetch after this duration.
   * Defaults to no timeout.
   */
  timeoutMs?: number;
}

/**
 * The object returned by createWhatsAppCloudApiHttpClient.
 * Shape is compatible with WhatsAppCloudApiDependencies.httpClient.
 */
export interface WhatsAppCloudApiHttpClient {
  post(url: string, body: unknown, options?: unknown): Promise<unknown>;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

export class WhatsAppCloudApiHttpError extends Error {
  public readonly status: number;
  public readonly metaErrorCode?: number;
  public readonly metaErrorType?: string;
  public readonly isTimeout?: boolean;
  public readonly rawPayload?: any;

  constructor(
    message: string,
    details: {
      status: number;
      metaErrorCode?: number;
      metaErrorType?: string;
      isTimeout?: boolean;
      rawPayload?: any;
    }
  ) {
    super(message);
    this.name = "WhatsAppCloudApiHttpError";
    this.status = details.status;
    this.metaErrorCode = details.metaErrorCode;
    this.metaErrorType = details.metaErrorType;
    this.isTimeout = details.isTimeout;
    this.rawPayload = details.rawPayload;
  }
}

/**
 * Creates an authenticated HTTP client for the WhatsApp Cloud API.
 *
 * Usage (future wiring — not done yet):
 *
 *   const httpClient = createWhatsAppCloudApiHttpClient({
 *     accessToken: decryptedToken,    // from resolveCloudApiRuntimeConfig
 *     timeoutMs: 10_000,
 *   });
 *   const provider = new WhatsAppCloudApiTransportProvider({ httpClient, phoneNumberId });
 */
export function createWhatsAppCloudApiHttpClient(
  options: WhatsAppCloudApiHttpClientOptions,
): WhatsAppCloudApiHttpClient {
  const { logger, timeoutMs } = options;

  // Validate at construction time — fail fast, never make a request with an
  // empty token.
  const rawToken = String(options.accessToken || "").trim();
  if (!rawToken) {
    throw new Error(
      "whatsapp_cloud_api_http_client: accessToken must be a non-empty string",
    );
  }

  // Resolve the fetch implementation once at construction.
  const fetchFn: FetchImpl = options.fetchImpl ?? (globalThis as any).fetch;
  if (typeof fetchFn !== "function") {
    throw new Error(
      "whatsapp_cloud_api_http_client: fetch is not available. Inject a fetchImpl or run in an environment that provides global fetch.",
    );
  }

  return {
    async post(url: string, body: unknown, _options?: unknown): Promise<unknown> {
      // ------------------------------------------------------------------
      // Build request — token goes only into the header, never logged.
      // ------------------------------------------------------------------
      let bodyString: string;
      try {
        bodyString = JSON.stringify(body);
      } catch (err: any) {
        const msg = "whatsapp_cloud_api_http_client: failed to serialize request body to JSON";
        logger?.error(msg);
        throw new WhatsAppCloudApiHttpError(msg, { status: 0 });
      }

      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        // Token is placed here and ONLY here. Not in any log output.
        "Authorization": `Bearer ${rawToken}`,
      };

      // ------------------------------------------------------------------
      // Optional timeout via AbortController.
      // ------------------------------------------------------------------
      let signal: AbortSignal | undefined;
      let abortTimer: ReturnType<typeof setTimeout> | undefined;

      if (timeoutMs && timeoutMs > 0 && typeof AbortController !== "undefined") {
        const controller = new AbortController();
        signal = controller.signal;
        abortTimer = setTimeout(() => {
          controller.abort();
          logger?.warn(
            `whatsapp_cloud_api_http_client: request timed out after ${timeoutMs}ms — ${sanitiseUrl(url)}`,
          );
        }, timeoutMs);
      }

      // ------------------------------------------------------------------
      // Execute fetch — log only safe non-secret fields.
      // ------------------------------------------------------------------
      logger?.info(
        `whatsapp_cloud_api_http_client: POST ${sanitiseUrl(url)}`,
      );

      let response: FetchResponse;
      try {
        const init: FetchRequestInit = { method: "POST", headers, body: bodyString };
        if (signal) init.signal = signal;
        response = await fetchFn(url, init);
      } catch (err: any) {
        clearTimeout(abortTimer);
        const isAbort =
          err?.name === "AbortError" ||
          String(err?.message || "").toLowerCase().includes("aborted");
        const msg = isAbort
          ? `whatsapp_cloud_api_http_client: request aborted (timeout or cancel) — ${sanitiseUrl(url)}`
          : `whatsapp_cloud_api_http_client: fetch failed — ${sanitiseUrl(url)} — ${safeErrorMessage(err)}`;
        logger?.error(msg);
        throw new WhatsAppCloudApiHttpError(msg, {
          status: 0,
          isTimeout: isAbort,
        });
      } finally {
        clearTimeout(abortTimer);
      }

      // ------------------------------------------------------------------
      // Parse response — log only status, never response body verbatim.
      // ------------------------------------------------------------------
      logger?.info(
        `whatsapp_cloud_api_http_client: response status=${response.status} url=${sanitiseUrl(url)}`,
      );

      let parsed: unknown;
      try {
        parsed = await response.json();
      } catch {
        // Non-JSON body — treat as empty object for non-2xx or empty string.
        parsed = {};
      }

      if (!response.ok) {
        // Extract safe error info from the parsed body without logging raw content.
        const metaErrorObj = (parsed as any)?.error;
        const metaCode = typeof metaErrorObj?.code === "number" ? metaErrorObj.code : undefined;
        const metaType = typeof metaErrorObj?.type === "string" ? metaErrorObj.type : undefined;
        const errorCode = safeExtractErrorCode(parsed);
        const msg = `whatsapp_cloud_api_http_client: HTTP ${response.status} from Cloud API${errorCode ? ` (${errorCode})` : ""} — ${sanitiseUrl(url)}`;
        logger?.error(msg);
        throw new WhatsAppCloudApiHttpError(msg, {
          status: response.status,
          metaErrorCode: metaCode,
          metaErrorType: metaType,
          rawPayload: parsed,
        });
      }

      return parsed;
    },
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/**
 * Returns a URL string safe to log — strips query params that might carry
 * tokens (though Cloud API graph.facebook.com uses header auth, not query).
 * Preserves host + path only.
 */
function sanitiseUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.host}${u.pathname}`;
  } catch {
    // If URL parsing fails, return a static placeholder to avoid leaking it.
    return "[url]";
  }
}

/**
 * Returns a safe string from an Error without risking token leakage from
 * network-layer error messages (which could theoretically include URL fragments).
 */
function safeErrorMessage(err: unknown): string {
  const msg = String((err as any)?.message || err || "unknown_error");
  // Truncate to 120 chars to avoid accidentally logging large payloads.
  return msg.slice(0, 120);
}

/**
 * Extracts a safe, non-secret error code from a parsed Cloud API error body.
 * Cloud API error shape: { error: { code: number, message: string, type: string } }
 * We log only the numeric code and type, never the message (which could include
 * customer data or token fragments in some edge cases).
 */
function safeExtractErrorCode(parsed: unknown): string {
  try {
    const p = parsed as any;
    const err = p?.error;
    if (!err) return "";
    const parts: string[] = [];
    if (err.code) parts.push(`code=${err.code}`);
    if (err.type) parts.push(`type=${err.type}`);
    return parts.join(" ");
  } catch {
    return "";
  }
}
