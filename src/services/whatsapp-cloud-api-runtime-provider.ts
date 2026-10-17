// src/services/whatsapp-cloud-api-runtime-provider.ts
//
// Phase 4R: Pure Cloud API runtime provider builder.
//
// Wires a resolved CloudApiRuntimeConfigResult into a ready-to-use
// WhatsAppCloudApiTransportProvider backed by an authenticated HTTP client.
//
// This module does NOT:
//   - call provider.start() or any send method
//   - import bot-worker.ts or server.ts
//   - accept, store, or log secrets
//   - make real network requests
//   - decrypt tokens (the caller supplies the already-resolved config)
//   - wire into the worker runtime (that is Phase 4S)

import type { CloudApiRuntimeConfigResult } from "./whatsapp-cloud-api-runtime-config.ts";
import { createWhatsAppCloudApiHttpClient } from "./whatsapp-cloud-api-http-client.ts";
import type { FetchImpl } from "./whatsapp-cloud-api-http-client.ts";
import { WhatsAppCloudApiTransportProvider } from "./whatsapp-cloud-api-transport-provider.ts";
import type { WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

/**
 * Safe logger interface. Never receives secrets.
 */
export interface RuntimeProviderLogger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

/**
 * Options for createWhatsAppCloudApiRuntimeProvider.
 *
 * SECRET SAFETY: This function accepts a CloudApiRuntimeConfigResult which
 * may contain an accessToken. That token is passed directly to the HTTP
 * client constructor and never logged, returned, or stored beyond that call.
 */
export interface CloudApiRuntimeProviderOptions {
  /**
   * Already-resolved runtime config from resolveCloudApiRuntimeConfig().
   * The builder reads runtimeEnabled, phoneNumberId, and accessToken from it.
   */
  runtimeConfig: CloudApiRuntimeConfigResult;

  /**
   * Injected fetch implementation for HTTP requests.
   * Must be injected in tests. Falls back to globalThis.fetch when omitted.
   */
  fetchImpl?: FetchImpl;

  /** Optional safe diagnostic logger. Never receives secrets. */
  logger?: RuntimeProviderLogger;

  /**
   * HTTP request timeout in milliseconds passed to the HTTP client.
   * Defaults to no timeout.
   */
  timeoutMs?: number;
}

/** Returned when runtime config is not ready to drive Cloud API sending. */
export interface CloudApiRuntimeProviderDisabled {
  enabled: false;
  provider: null;
  reason: string;
}

/** Returned when a fully wired provider was created. */
export interface CloudApiRuntimeProviderReady {
  enabled: true;
  provider: WhatsAppTransportProvider;
  phoneNumberId: string;
}

export type CloudApiRuntimeProviderResult =
  | CloudApiRuntimeProviderDisabled
  | CloudApiRuntimeProviderReady;

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

/**
 * Builds a fully wired WhatsAppCloudApiTransportProvider from an already-
 * resolved runtime config, or returns a safe disabled result if the config
 * is not ready.
 *
 * Usage (future wiring — not done yet):
 *
 *   const runtimeConfig = await resolveCloudApiRuntimeConfig(providerConfig, { decryptSecret });
 *   const result = createWhatsAppCloudApiRuntimeProvider({
 *     runtimeConfig,
 *     fetchImpl,          // injected in tests; real fetch in production
 *     timeoutMs: 10_000,
 *   });
 *   if (result.enabled) {
 *     // result.provider is ready to be passed to the tracked sender
 *   }
 */
export function createWhatsAppCloudApiRuntimeProvider(
  options: CloudApiRuntimeProviderOptions,
): CloudApiRuntimeProviderResult {
  const { runtimeConfig, logger, fetchImpl, timeoutMs } = options;

  // ------------------------------------------------------------------
  // Guard 1: runtimeEnabled flag must be true.
  // ------------------------------------------------------------------
  if (!runtimeConfig.runtimeEnabled) {
    const reason = runtimeConfig.reason || "runtime_not_enabled";
    logger?.info(
      `cloud_api_runtime_provider: disabled — ${reason}`,
    );
    return { enabled: false, provider: null, reason };
  }

  // ------------------------------------------------------------------
  // Guard 2: phoneNumberId must be present.
  // ------------------------------------------------------------------
  const phoneNumberId = String(runtimeConfig.phoneNumberId || "").trim();
  if (!phoneNumberId) {
    logger?.warn(
      "cloud_api_runtime_provider: disabled — phoneNumberId missing from runtime config",
    );
    return {
      enabled: false,
      provider: null,
      reason: "missing_phone_number_id",
    };
  }

  // ------------------------------------------------------------------
  // Guard 3: accessToken must be present (resolved by caller, never logged).
  // ------------------------------------------------------------------
  const accessToken = String(runtimeConfig.accessToken || "").trim();
  if (!accessToken) {
    logger?.warn(
      "cloud_api_runtime_provider: disabled — accessToken missing from runtime config",
    );
    return {
      enabled: false,
      provider: null,
      reason: "missing_access_token",
    };
  }

  // ------------------------------------------------------------------
  // Build HTTP client — token is passed once here and never touched again.
  // ------------------------------------------------------------------
  let httpClient;
  try {
    httpClient = createWhatsAppCloudApiHttpClient({
      accessToken, // never logged — consumed by createWhatsAppCloudApiHttpClient
      fetchImpl,
      logger,
      timeoutMs,
    });
  } catch (err: any) {
    const reason = err?.message || "http_client_creation_failed";
    logger?.error(
      `cloud_api_runtime_provider: failed to create HTTP client — ${reason}`,
    );
    return { enabled: false, provider: null, reason };
  }

  // ------------------------------------------------------------------
  // Build provider — phoneNumberId is safe to log.
  // ------------------------------------------------------------------
  const provider = new WhatsAppCloudApiTransportProvider({
    phoneNumberId,
    httpClient,
    logger: logger
      ? {
          info: (msg: string) => logger.info(msg),
          warn: (msg: string) => logger.warn(msg),
          error: (msg: string) => logger.error(msg),
          debug: (_msg: string) => {},
        }
      : undefined,
  });

  logger?.info(
    `cloud_api_runtime_provider: ready — phoneNumberId=${phoneNumberId} hasToken=true`,
  );

  return { enabled: true, provider, phoneNumberId };
}

// ---------------------------------------------------------------------------
// Safe summary helper (for logging/status reporting — never exposes secrets)
// ---------------------------------------------------------------------------

/**
 * Returns a log-safe summary of the builder result.
 * Never includes accessToken, Authorization header, or any raw secret.
 */
export function summarizeCloudApiRuntimeProviderResult(
  result: CloudApiRuntimeProviderResult,
): Record<string, unknown> {
  if (!result.enabled) {
    const disabled = result as CloudApiRuntimeProviderDisabled;
    return {
      enabled: false,
      reason: disabled.reason,
      provider: null,
    };
  }
  const ready = result as CloudApiRuntimeProviderReady;
  return {
    enabled: true,
    phoneNumberId: ready.phoneNumberId,
    providerClass: ready.provider?.constructor?.name ?? "WhatsAppCloudApiTransportProvider",
  };
}
