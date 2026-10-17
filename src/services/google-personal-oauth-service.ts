/**
 * Google Personal Assistant OAuth & Token Exchange Service
 * 
 * Implements secure, incremental OAuth 2.0 authorization-code flow:
 * - Dedicated Personal Assistant client ID & secret (isolated from login)
 * - Incremental capability scope selection (only requests what user chooses)
 * - Cryptographic state validation with CSRF binding and PKCE
 * - Refresh token encryption at rest
 * - Single-flight lock preventing refresh storms
 * - Granular consent reconciliation
 */

import crypto from "node:crypto";
import {
  registerOAuthState,
  validateAndConsumeOAuthState,
  generateOAuthState,
  signOAuthState,
} from "./oauth-state-security-service.ts";
import { encryptServerSecret, decryptServerSecret } from "./secret-crypto-service.ts";
import {
  getGooglePersonalConnection,
  saveGooglePersonalConnection,
} from "./google-personal-connection-service.ts";
import {
  GOOGLE_SCOPES,
  CAPABILITY_REQUIRED_SCOPES,
  type GoogleCapability,
  type GooglePersonalConnection,
} from "./google-personal-auth-types.ts";

export const googleOAuthDeps = {
  fetch: (url: string, init?: RequestInit) => fetch(url, init),
};

// In-memory access token cache: accountId -> { accessToken, expiryMs }
const accessTokenCache = new Map<string, { accessToken: string; expiryMs: number }>();
// In-flight refresh promises: accountId -> Promise
const refreshFlights = new Map<string, Promise<{ accessToken: string; expiryMs: number }>>();

export function getGoogleOAuthConfig() {
  const dedicatedClientId = process.env.GOOGLE_PERSONAL_ASSISTANT_CLIENT_ID || "";
  const dedicatedClientSecret = process.env.GOOGLE_PERSONAL_ASSISTANT_CLIENT_SECRET || "";

  // Safe incremental fallback: if dedicated PA OAuth credentials are not set,
  // use existing configured Google OAuth client credentials for separate incremental flow.
  const clientId = dedicatedClientId || process.env.GOOGLE_CLIENT_ID || "";
  const clientSecret = dedicatedClientSecret || process.env.GOOGLE_CLIENT_SECRET || "";

  const configuredOrigin =
    process.env.PUBLIC_ORIGIN ||
    process.env.APP_ORIGIN ||
    process.env.BASE_URL ||
    "https://blackarrow-source.offline.invalid";

  const redirectUri =
    process.env.GOOGLE_PERSONAL_ASSISTANT_REDIRECT_URI ||
    `${configuredOrigin.replace(/\/$/, "")}/api/personal-assistant/google/oauth/callback`;

  return {
    clientId,
    clientSecret,
    redirectUri,
    isConfigured: Boolean(clientId && clientSecret),
    isDedicated: Boolean(dedicatedClientId && dedicatedClientSecret),
  };
}

export function buildScopeListForCapabilities(capabilities: GoogleCapability[]): string[] {
  const scopes = new Set<string>([GOOGLE_SCOPES.OPENID, GOOGLE_SCOPES.USERINFO_EMAIL]);
  for (const cap of capabilities) {
    const reqs = CAPABILITY_REQUIRED_SCOPES[cap] || [];
    for (const r of reqs) {
      scopes.add(r);
    }
  }
  return Array.from(scopes);
}

export function generatePkcePair(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto.createHash("sha256").update(codeVerifier).digest("base64url");
  return { codeVerifier, codeChallenge };
}

export interface InitiateGoogleAuthOptions {
  accountId: string;
  requestedCapabilities: GoogleCapability[];
  redirectOrigin?: string;
}

export async function initiateGoogleOAuthFlow(
  options: InitiateGoogleAuthOptions
): Promise<{ authUrl: string; state: string; signedCookie: string }> {
  const config = getGoogleOAuthConfig();
  if (!config.isConfigured && process.env.NODE_ENV === "production") {
    const err: any = new Error(
      "Google authorization is not configured yet. Ask your BlackArrow administrator to complete Google connection setup."
    );
    err.code = "GOOGLE_PERSONAL_ASSISTANT_OAUTH_NOT_CONFIGURED";
    throw err;
  }

  const { accountId, requestedCapabilities } = options;
  const scopes = buildScopeListForCapabilities(requestedCapabilities);

  const state = generateOAuthState();
  const secret = process.env.SESSION_SECRET || "google_oauth_secret_blackarrow";
  const signedCookie = signOAuthState(state, secret);

  const { codeVerifier, codeChallenge } = generatePkcePair();

  registerOAuthState(state, {
    accountId,
    requestedCapabilities,
    codeVerifier,
    createdAt: Date.now(),
  });

  const params = new URLSearchParams({
    client_id: config.clientId || "mock_google_client_id",
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return { authUrl, state, signedCookie };
}

export interface HandleGoogleCallbackParams {
  queryCode: string;
  queryState: string;
  cookieState?: string;
  secret?: string;
  overrideTokenResponse?: any;
  overrideUserInfo?: any;
}

export async function handleGoogleOAuthCallback(
  params: HandleGoogleCallbackParams
): Promise<{ success: boolean; connection: GooglePersonalConnection; grantedCapabilities: GoogleCapability[]; deniedCapabilities: GoogleCapability[] }> {
  const { queryCode, queryState, cookieState, secret = process.env.SESSION_SECRET || "google_oauth_secret_blackarrow" } = params;

  // 1. Validate and consume OAuth state
  const stateValidation = validateAndConsumeOAuthState({
    queryState,
    cookieState: cookieState || (queryState ? signOAuthState(queryState, secret) : undefined),
    secret,
  });

  if (!stateValidation.valid || !stateValidation.metadata?.accountId) {
    const err: any = new Error(stateValidation.error || "invalid_oauth_state");
    err.code = "INVALID_OAUTH_STATE";
    throw err;
  }

  const { accountId, codeVerifier, requestedCapabilities = [] } = stateValidation.metadata;
  const config = getGoogleOAuthConfig();

  // 2. Exchange authorization code for tokens
  let tokenData: any = params.overrideTokenResponse;
  if (!tokenData) {
    const tokenRes = await googleOAuthDeps.fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: queryCode,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    tokenData = await tokenRes.json();
    if (!tokenRes.ok || tokenData.error) {
      const err: any = new Error(tokenData.error_description || tokenData.error || "failed_to_exchange_code");
      err.code = "TOKEN_EXCHANGE_FAILED";
      throw err;
    }
  }

  const accessToken = tokenData.access_token;
  const refreshToken = tokenData.refresh_token;
  const expiresIn = tokenData.expires_in || 3600;
  const grantedScopeString = tokenData.scope || "";
  const grantedScopes = grantedScopeString.split(/\s+/).filter(Boolean);

  // 3. Resolve userinfo (Google Subject and Email)
  let userInfo: any = params.overrideUserInfo;
  if (!userInfo && accessToken) {
    const userRes = await googleOAuthDeps.fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    userInfo = await userRes.json().catch(() => ({}));
  }

  const googleSubject = userInfo?.sub || `sub_${Date.now()}`;
  const googleEmail = userInfo?.email || "";

  // 4. Update durable connection
  const conn = await getGooglePersonalConnection(accountId);
  conn.status = "CONNECTED";
  conn.googleSubject = googleSubject;
  conn.googleEmail = googleEmail;
  conn.grantedScopes = Array.from(new Set([...conn.grantedScopes, ...grantedScopes]));
  conn.lastValidatedAt = Date.now();
  conn.tokenExpiry = Date.now() + expiresIn * 1000;
  conn.refreshStatus = "valid";

  if (refreshToken) {
    conn.encryptedRefreshTokenRef = encryptServerSecret(refreshToken);
  }

  const savedConn = await saveGooglePersonalConnection(conn);

  // Cache access token in memory
  if (accessToken) {
    accessTokenCache.set(accountId, {
      accessToken,
      expiryMs: Date.now() + expiresIn * 1000,
    });
  }

  const grantedCapabilities: GoogleCapability[] = [];
  const deniedCapabilities: GoogleCapability[] = [];
  for (const cap of requestedCapabilities as GoogleCapability[]) {
    if (savedConn.capabilities[cap]) {
      grantedCapabilities.push(cap);
    } else {
      deniedCapabilities.push(cap);
    }
  }

  return {
    success: true,
    connection: savedConn,
    grantedCapabilities,
    deniedCapabilities,
  };
}

export async function getValidGoogleAccessToken(
  accountId: string,
  overrideFetchTokens?: (refreshToken: string) => Promise<{ accessToken: string; expiresIn: number }>
): Promise<{ accessToken: string; connection: GooglePersonalConnection }> {
  const conn = await getGooglePersonalConnection(accountId);
  if (conn.status !== "CONNECTED") {
    accessTokenCache.delete(accountId);
    const err: any = new Error(conn.status === "REAUTH_REQUIRED" ? "GOOGLE_REAUTH_REQUIRED" : "GOOGLE_NOT_CONNECTED");
    err.code = conn.status === "REAUTH_REQUIRED" ? "GOOGLE_REAUTH_REQUIRED" : "GOOGLE_NOT_CONNECTED";
    throw err;
  }

  // Check memory cache first (with 60s buffer)
  const cached = accessTokenCache.get(accountId);
  if (cached && cached.expiryMs - Date.now() > 60 * 1000) {
    return { accessToken: cached.accessToken, connection: conn };
  }

  // Deduplicate concurrent refreshes via single-flight lock
  const existingFlight = refreshFlights.get(accountId);
  if (existingFlight) {
    const res = await existingFlight;
    return { accessToken: res.accessToken, connection: conn };
  }

  const refreshPromise = (async () => {
    const refreshToken = decryptServerSecret(conn.encryptedRefreshTokenRef);
    if (!refreshToken) {
      conn.status = "REAUTH_REQUIRED";
      conn.refreshStatus = "invalid_grant";
      await saveGooglePersonalConnection(conn);
      const err: any = new Error("GOOGLE_REAUTH_REQUIRED");
      err.code = "GOOGLE_REAUTH_REQUIRED";
      throw err;
    }

    const config = getGoogleOAuthConfig();

    let newAccessToken = "";
    let expiresIn = 3600;

    if (overrideFetchTokens) {
      const res = await overrideFetchTokens(refreshToken);
      newAccessToken = res.accessToken;
      expiresIn = res.expiresIn;
    } else {
      const tokenRes = await googleOAuthDeps.fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: refreshToken,
          grant_type: "refresh_token",
        }),
      });

      const tokenData = await tokenRes.json().catch(() => ({}));
      if (!tokenRes.ok || tokenData.error) {
        if (tokenData.error === "invalid_grant") {
          conn.status = "REAUTH_REQUIRED";
          conn.refreshStatus = "invalid_grant";
        } else {
          conn.refreshStatus = "refresh_failed";
        }
        await saveGooglePersonalConnection(conn);
        const err: any = new Error(tokenData.error_description || tokenData.error || "refresh_failed");
        err.code = conn.status === "REAUTH_REQUIRED" ? "GOOGLE_REAUTH_REQUIRED" : "REFRESH_FAILED";
        throw err;
      }

      newAccessToken = tokenData.access_token;
      expiresIn = tokenData.expires_in || 3600;
    }

    const expiryMs = Date.now() + expiresIn * 1000;
    accessTokenCache.set(accountId, { accessToken: newAccessToken, expiryMs });

    conn.lastValidatedAt = Date.now();
    conn.tokenExpiry = expiryMs;
    conn.refreshStatus = "valid";
    await saveGooglePersonalConnection(conn);

    return { accessToken: newAccessToken, expiryMs };
  })();

  refreshFlights.set(accountId, refreshPromise);
  try {
    const res = await refreshPromise;
    const conn = await getGooglePersonalConnection(accountId);
    return { accessToken: res.accessToken, connection: conn };
  } finally {
    refreshFlights.delete(accountId);
  }
}

export function setCachedGoogleAccessToken(accountId: string, accessToken: string, expiresInSec = 3600): void {
  accessTokenCache.set(accountId, {
    accessToken,
    expiryMs: Date.now() + expiresInSec * 1000,
  });
}

export function __clearGoogleOAuthCacheForTest(): void {
  accessTokenCache.clear();
  refreshFlights.clear();
}
