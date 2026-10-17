// src/services/whatsapp-meta-onboarding-config.ts
//
// Centralized server-side configuration resolution for Meta Embedded Signup and Official WhatsApp API.
// Manages environment aliases safely and provides a strictly redacted public config for the client.

import { getCloudApiGraphVersion } from "./whatsapp-cloud-api-version.ts";

export interface MetaPlatformConfig {
  appId: string;
  appSecret: string;
  configId: string;
  graphVersion: string;
  redirectUri: string;
  webhookVerifyToken: string;
  isComplete: boolean;
  missingFields: string[];
}

export interface MetaOnboardingPublicConfig {
  available: boolean;
  appId: string;
  configId: string;
  graphVersion: string;
  redirectUri?: string;
  missing: string[];
}

function clean(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Resolves the server-side authoritative Meta platform configuration from environment.
 * Supports standard aliases to avoid duplicate secret systems.
 */
export function resolveMetaPlatformConfig(env: Record<string, string | undefined> = process.env): MetaPlatformConfig {
  const appId =
    clean(env.WHATSAPP_CLOUD_META_APP_ID) ||
    clean(env.META_APP_ID) ||
    clean(env.WHATSAPP_APP_ID);

  const appSecret =
    clean(env.WHATSAPP_CLOUD_META_APP_SECRET) ||
    clean(env.META_APP_SECRET) ||
    clean(env.WHATSAPP_CLOUD_APP_SECRET) ||
    clean(env.WHATSAPP_APP_SECRET);

  const configId =
    clean(env.WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID) ||
    clean(env.META_EMBEDDED_SIGNUP_CONFIG_ID) ||
    clean(env.WHATSAPP_EMBEDDED_SIGNUP_CONFIG_ID);

  const redirectUri =
    clean(env.WHATSAPP_CLOUD_EMBEDDED_SIGNUP_REDIRECT_URI) ||
    clean(env.META_REDIRECT_URI) ||
    "";

  const webhookVerifyToken =
    clean(env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN) ||
    clean(env.WHATSAPP_VERIFY_TOKEN) ||
    clean(env.META_WEBHOOK_VERIFY_TOKEN) ||
    "";

  const graphVersion = getCloudApiGraphVersion(env.WHATSAPP_CLOUD_GRAPH_VERSION);

  const missingFields: string[] = [];
  if (!appId) missingFields.push("appId");
  if (!appSecret) missingFields.push("appSecret");
  if (!configId) missingFields.push("configId");

  const isComplete = missingFields.length === 0;

  return {
    appId,
    appSecret,
    configId,
    graphVersion,
    redirectUri,
    webhookVerifyToken,
    isComplete,
    missingFields,
  };
}

/**
 * Returns a strictly sanitized, browser-safe configuration for client-side Embedded Signup initialization.
 * NEVER returns secrets (appSecret, webhookVerifyToken, tokens, or PINs).
 */
export function getMetaOnboardingPublicConfig(env: Record<string, string | undefined> = process.env): MetaOnboardingPublicConfig {
  const config = resolveMetaPlatformConfig(env);

  return {
    available: config.isComplete,
    appId: config.appId,
    configId: config.configId,
    graphVersion: config.graphVersion,
    redirectUri: config.redirectUri || undefined,
    missing: config.missingFields,
  };
}
