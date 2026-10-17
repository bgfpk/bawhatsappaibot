// src/services/whatsapp-cloud-api-platform-preflight.ts
//
// Platform configuration preflight checks and customer-safe error sanitization
// for Meta WhatsApp Cloud API.
//
// Guarantees:
// - Verifies presence and format of required configuration variables without printing values
// - In production (NODE_ENV === "production"), checks strict requirements
// - Centralizes customer-safe error sanitization (never returns raw stacks, tokens, or URLs)

export interface PlatformPreflightResult {
  ready: boolean;
  status: "ready" | "not_ready";
  missing: string[];
  details: {
    graphVersionConfigured: boolean;
    appIdConfigured: boolean;
    appSecretConfigured: boolean;
    embeddedSignupConfigIdConfigured: boolean;
    redirectUriConfigured: boolean;
    webhookVerifyTokenConfigured: boolean;
    encryptionKeyConfigured: boolean;
    runtimeEnabled: boolean;
  };
}

export interface SanitizedCloudError {
  code: string;
  message: string;
  retryable: boolean;
  needsReconnect?: boolean;
}

const GRAPH_VERSION_REGEX = /^v\d+\.0$/;

/**
 * Evaluates the readiness of the Meta Cloud API platform environment.
 * NEVER logs or exposes secrets or configuration values.
 */
export function checkCloudPlatformPreflight(
  env: Record<string, string | undefined> = process.env,
  isProductionOverride?: boolean
): PlatformPreflightResult {
  const isProd =
    typeof isProductionOverride === "boolean"
      ? isProductionOverride
      : env.NODE_ENV === "production";

  const graphVersion = env.WHATSAPP_CLOUD_GRAPH_VERSION?.trim();
  const appId = env.WHATSAPP_CLOUD_META_APP_ID?.trim();
  const appSecret = env.WHATSAPP_CLOUD_META_APP_SECRET?.trim();
  const configId = env.WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID?.trim();
  const redirectUri = env.WHATSAPP_CLOUD_EMBEDDED_SIGNUP_REDIRECT_URI?.trim();
  const verifyToken = env.WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN?.trim();
  const encKey = (
    env.BLACKARROW_SECRET_ENCRYPTION_KEY ||
    env.SECRET_ENCRYPTION_KEY ||
    env.APP_ENCRYPTION_KEY
  )?.trim();
  const runtimeEnabled = env.WHATSAPP_CLOUD_API_RUNTIME_ENABLED === "true";

  const graphVersionValid = Boolean(graphVersion && GRAPH_VERSION_REGEX.test(graphVersion));
  const missing: string[] = [];

  if (isProd) {
    if (!graphVersionValid) missing.push("WHATSAPP_CLOUD_GRAPH_VERSION");
    if (!appId) missing.push("WHATSAPP_CLOUD_META_APP_ID");
    if (!appSecret) missing.push("WHATSAPP_CLOUD_META_APP_SECRET");
    if (!configId) missing.push("WHATSAPP_CLOUD_EMBEDDED_SIGNUP_CONFIG_ID");
    if (!redirectUri) missing.push("WHATSAPP_CLOUD_EMBEDDED_SIGNUP_REDIRECT_URI");
    if (!verifyToken) missing.push("WHATSAPP_CLOUD_WEBHOOK_VERIFY_TOKEN");
    if (!encKey) missing.push("APP_ENCRYPTION_KEY");
  }

  const ready = missing.length === 0;

  return {
    ready,
    status: ready ? "ready" : "not_ready",
    missing,
    details: {
      graphVersionConfigured: graphVersionValid,
      appIdConfigured: Boolean(appId),
      appSecretConfigured: Boolean(appSecret),
      embeddedSignupConfigIdConfigured: Boolean(configId),
      redirectUriConfigured: Boolean(redirectUri),
      webhookVerifyTokenConfigured: Boolean(verifyToken),
      encryptionKeyConfigured: Boolean(encKey),
      runtimeEnabled,
    },
  };
}

/**
 * Sanitizes any raw exception, Graph error, or network failure into a safe customer-facing response.
 * Strips raw stacks, access tokens, auth headers, PINs, and media URLs.
 */
export function sanitizeCloudApiError(err: any): SanitizedCloudError {
  if (!err) {
    return {
      code: "unknown_error",
      message: "An unexpected error occurred. Please try again.",
      retryable: false,
    };
  }

  const rawMessage = String(err?.message || err || "").toLowerCase();

  // 1. Authentication / Token issues
  if (
    rawMessage.includes("190") ||
    rawMessage.includes("session expired") ||
    rawMessage.includes("invalid oauth") ||
    rawMessage.includes("reauth_required") ||
    rawMessage.includes("token_decryption_failed")
  ) {
    return {
      code: "reauth_required",
      message: "WhatsApp connection credentials expired or invalid. Please reconnect.",
      retryable: false,
      needsReconnect: true,
    };
  }

  // 2. Rate Limits
  if (rawMessage.includes("429") || rawMessage.includes("rate limit") || rawMessage.includes("rate_limit")) {
    return {
      code: "rate_limited",
      message: "WhatsApp messaging rate limit reached. Please wait a moment.",
      retryable: true,
    };
  }

  // 3. Service Window closed / Template required
  if (rawMessage.includes("cloud_template_required") || rawMessage.includes("window_expired")) {
    return {
      code: "cloud_template_required",
      message: "Customer service window is closed (24 hours elapsed). An approved template is required.",
      retryable: false,
    };
  }

  // 4. Template not approved
  if (rawMessage.includes("template_not_approved")) {
    return {
      code: "template_not_approved",
      message: "Selected WhatsApp template is not approved by Meta.",
      retryable: false,
    };
  }

  // 5. Network timeouts / Ambiguous sends
  if (rawMessage.includes("ambiguous_send_result") || rawMessage.includes("timeout") || rawMessage.includes("econnreset")) {
    return {
      code: "ambiguous_send_result",
      message: "Message dispatch timed out. Result is pending verification.",
      retryable: false,
    };
  }

  // 6. Server errors
  if (rawMessage.includes("500") || rawMessage.includes("502") || rawMessage.includes("503")) {
    return {
      code: "meta_server_error",
      message: "WhatsApp service temporarily unavailable. Please retry shortly.",
      retryable: true,
    };
  }

  // 7. Graph version not configured
  if (rawMessage.includes("graph_version_not_configured")) {
    return {
      code: "graph_version_not_configured",
      message: "Platform Graph API version is not configured.",
      retryable: false,
    };
  }

  // Default safe generic error
  return {
    code: "cloud_api_error",
    message: "WhatsApp operation could not be completed.",
    retryable: false,
  };
}
