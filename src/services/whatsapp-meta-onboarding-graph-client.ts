// src/services/whatsapp-meta-onboarding-graph-client.ts
//
// Server-only Graph API client for Meta Embedded Signup onboarding operations:
// - Authorization code exchange
// - WABA phone number validation
// - WABA webhook subscription
// - Phone number registration with 6-digit PIN

import { buildCloudApiGraphUrl, getCloudApiGraphVersion } from "./whatsapp-cloud-api-version.ts";
import { classifyCloudApiHttpError } from "./whatsapp-cloud-api-response.ts";

export interface ExchangeCodeOptions {
  appId: string;
  appSecret: string;
  redirectUri?: string;
  code: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface WabaPhoneRecord {
  id: string;
  display_phone_number: string;
  verified_name?: string;
  quality_rating?: string;
}

export interface GetWabaPhoneNumbersOptions {
  wabaId: string;
  accessToken: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface SubscribeWabaOptions {
  wabaId: string;
  accessToken: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export interface RegisterPhoneOptions {
  phoneNumberId: string;
  pin: string;
  accessToken: string;
  graphVersion?: string;
  fetchImpl?: typeof fetch;
}

export class MetaGraphOnboardingError extends Error {
  readonly status: number;
  readonly errorCode: string;
  readonly metaErrorCode?: number;
  readonly isTimeout: boolean;

  constructor(message: string, status: number, errorCode: string, metaErrorCode?: number, isTimeout: boolean = false) {
    super(message);
    this.name = "MetaGraphOnboardingError";
    this.status = status;
    this.errorCode = errorCode;
    this.metaErrorCode = metaErrorCode;
    this.isTimeout = isTimeout;
  }
}

function clean(value: any): string {
  return String(value ?? "").trim();
}

/**
 * Exchanges a short-lived authorization code for an integration access token.
 */
export async function exchangeAuthorizationCode(
  options: ExchangeCodeOptions
): Promise<{ accessToken: string; tokenType?: string; expiresIn?: number }> {
  const appId = clean(options.appId);
  const appSecret = clean(options.appSecret);
  const code = clean(options.code);
  const redirectUri = clean(options.redirectUri);
  const fetchFn = options.fetchImpl || fetch;

  if (!appId || !appSecret || !code) {
    throw new MetaGraphOnboardingError("Missing required parameters for token exchange", 400, "missing_param");
  }

  const url = new URL(buildCloudApiGraphUrl("oauth/access_token", options.graphVersion));
  url.searchParams.set("client_id", appId);
  url.searchParams.set("client_secret", appSecret);
  url.searchParams.set("code", code);
  if (redirectUri) {
    url.searchParams.set("redirect_uri", redirectUri);
  }

  let response: Response;
  try {
    response = await fetchFn(url.toString(), {
      method: "GET",
      headers: { Accept: "application/json" },
    });
  } catch (err: any) {
    throw new MetaGraphOnboardingError("Network error during code exchange", 0, "network_error", undefined, true);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.access_token) {
    const classified = classifyCloudApiHttpError(data, response.status);
    throw new MetaGraphOnboardingError(
      classified.errorMessage || "Failed to exchange authorization code",
      response.status,
      classified.errorCode,
      data?.error?.code
    );
  }

  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    expiresIn: data.expires_in,
  };
}

/**
 * Fetches the authoritative list of phone numbers belonging to a WABA.
 */
export async function getWabaPhoneNumbers(
  options: GetWabaPhoneNumbersOptions
): Promise<WabaPhoneRecord[]> {
  const wabaId = clean(options.wabaId);
  const accessToken = clean(options.accessToken);
  const fetchFn = options.fetchImpl || fetch;

  if (!wabaId || !accessToken) {
    throw new MetaGraphOnboardingError("Missing wabaId or accessToken", 400, "missing_param");
  }

  const url = buildCloudApiGraphUrl(`${wabaId}/phone_numbers`, options.graphVersion);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (err: any) {
    throw new MetaGraphOnboardingError("Network error fetching WABA phone numbers", 0, "network_error", undefined, true);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !Array.isArray(data?.data)) {
    const classified = classifyCloudApiHttpError(data, response.status);
    throw new MetaGraphOnboardingError(
      classified.errorMessage || "Failed to fetch WABA phone numbers",
      response.status,
      classified.errorCode,
      data?.error?.code
    );
  }

  return data.data.map((item: any) => ({
    id: String(item.id || ""),
    display_phone_number: String(item.display_phone_number || ""),
    verified_name: item.verified_name ? String(item.verified_name) : undefined,
    quality_rating: item.quality_rating ? String(item.quality_rating) : undefined,
  }));
}

/**
 * Subscribes the BlackArrow app to the customer's WABA for webhook events.
 */
export async function subscribeWabaApp(
  options: SubscribeWabaOptions
): Promise<{ success: boolean }> {
  const wabaId = clean(options.wabaId);
  const accessToken = clean(options.accessToken);
  const fetchFn = options.fetchImpl || fetch;

  if (!wabaId || !accessToken) {
    throw new MetaGraphOnboardingError("Missing wabaId or accessToken", 400, "missing_param");
  }

  const url = buildCloudApiGraphUrl(`${wabaId}/subscribed_apps`, options.graphVersion);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    });
  } catch (err: any) {
    throw new MetaGraphOnboardingError("Network error subscribing WABA app", 0, "network_error", undefined, true);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success !== true) {
    const classified = classifyCloudApiHttpError(data, response.status);
    throw new MetaGraphOnboardingError(
      classified.errorMessage || "Failed to subscribe WABA to webhook",
      response.status,
      classified.errorCode,
      data?.error?.code
    );
  }

  return { success: true };
}

/**
 * Registers a phone number with a customer-selected 6-digit PIN.
 */
export async function registerPhoneNumber(
  options: RegisterPhoneOptions
): Promise<{ success: boolean }> {
  const phoneNumberId = clean(options.phoneNumberId);
  const pin = clean(options.pin);
  const accessToken = clean(options.accessToken);
  const fetchFn = options.fetchImpl || fetch;

  if (!phoneNumberId || !accessToken) {
    throw new MetaGraphOnboardingError("Missing phoneNumberId or accessToken", 400, "missing_param");
  }

  // Validate exact 6-digit PIN before making external request
  if (!/^\d{6}$/.test(pin)) {
    throw new MetaGraphOnboardingError("PIN must be exactly 6 digits", 400, "invalid_pin");
  }

  const url = buildCloudApiGraphUrl(`${phoneNumberId}/register`, options.graphVersion);

  let response: Response;
  try {
    response = await fetchFn(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        pin,
      }),
    });
  } catch (err: any) {
    throw new MetaGraphOnboardingError("Network error during phone registration", 0, "network_error", undefined, true);
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data?.success !== true) {
    const classified = classifyCloudApiHttpError(data, response.status);
    throw new MetaGraphOnboardingError(
      classified.errorMessage || "Failed to register phone number",
      response.status,
      classified.errorCode,
      data?.error?.code
    );
  }

  return { success: true };
}
