import crypto from "crypto";

const OAUTH_STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export type StoredOAuthState = {
  state: string;
  createdAt: number;
  expiresAt: number;
  metadata?: Record<string, any>;
};

const oauthStateStore = new Map<string, StoredOAuthState>();

function clean(value: any) {
  return String(value || "").trim();
}

export function generateCryptoAuthId(prefix = "usr"): string {
  return `${prefix}_${crypto.randomBytes(12).toString("hex")}`;
}

export function generateOAuthState(): string {
  return crypto.randomBytes(32).toString("base64url");
}

export function signOAuthState(state: string, secret: string): string {
  const cleanState = clean(state);
  const cleanSecret = clean(secret);
  const signature = crypto.createHmac("sha256", cleanSecret).update(cleanState).digest("base64url");
  return `${cleanState}.${signature}`;
}

export function verifyOAuthStateCookie(cookieVal: any, expectedState: string, secret: string): boolean {
  const text = clean(cookieVal);
  if (!text || !text.includes(".")) return false;
  const [cookieState, signature] = text.split(".");
  if (!cookieState || !signature || cookieState !== expectedState) return false;

  const expectedSig = crypto.createHmac("sha256", clean(secret)).update(cookieState).digest("base64url");
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expectedSig);

  if (actualBuf.length !== expectedBuf.length) return false;
  return crypto.timingSafeEqual(actualBuf, expectedBuf);
}

export function registerOAuthState(state: string, metadata?: Record<string, any>): StoredOAuthState {
  const cleanState = clean(state);
  const now = Date.now();
  const entry: StoredOAuthState = {
    state: cleanState,
    createdAt: now,
    expiresAt: now + OAUTH_STATE_TTL_MS,
    metadata,
  };
  oauthStateStore.set(cleanState, entry);
  return entry;
}

export function validateAndConsumeOAuthState(input: {
  queryState?: any;
  cookieState?: any;
  secret: string;
  nowMs?: number;
}): { valid: boolean; metadata?: Record<string, any>; error?: string } {
  const queryState = clean(input.queryState);
  const cookieState = clean(input.cookieState);
  const secret = clean(input.secret);
  const now = input.nowMs || Date.now();

  if (!queryState) {
    return { valid: false, error: "missing_state" };
  }

  const stored = oauthStateStore.get(queryState);
  if (!stored) {
    return { valid: false, error: "unknown_or_expired_state" };
  }

  if (stored.expiresAt < now) {
    oauthStateStore.delete(queryState);
    return { valid: false, error: "expired_state" };
  }

  // Mandatory browser cookie binding check BEFORE consuming state
  if (!cookieState) {
    return { valid: false, error: "missing_cookie" };
  }

  if (!secret) {
    return { valid: false, error: "missing_secret" };
  }

  const isCookieValid = verifyOAuthStateCookie(cookieState, queryState, secret);
  if (!isCookieValid) {
    return { valid: false, error: "browser_binding_mismatch" };
  }

  // ONLY NOW consume/delete state after full validation
  oauthStateStore.delete(queryState);

  return { valid: true, metadata: stored.metadata };
}

export function clearExpiredOAuthStates(nowMs?: number): number {
  const now = nowMs || Date.now();
  let deleted = 0;
  for (const [state, entry] of oauthStateStore.entries()) {
    if (entry.expiresAt < now) {
      oauthStateStore.delete(state);
      deleted++;
    }
  }
  return deleted;
}

export const __oauthStateTestUtils = {
  oauthStateStore,
};
