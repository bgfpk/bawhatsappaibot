import test from "node:test";
import assert from "node:assert/strict";

function resolveSessionSecretHelper(env: {
  AUTH_SESSION_SECRET?: string;
  SESSION_SECRET?: string;
  NODE_ENV?: string;
  APPWRITE_API_KEY_DEV?: string;
  APPWRITE_API_KEY_LIVE?: string;
}): string {
  if (env.NODE_ENV === "production") {
    const prodSecret = String(env.AUTH_SESSION_SECRET || "").trim();
    if (!prodSecret) {
      throw new Error("[Security Configuration Error] Missing AUTH_SESSION_SECRET in production environment. Refusing to boot with insecure derived session key.");
    }
    return prodSecret;
  }
  const explicit = String(env.AUTH_SESSION_SECRET || env.SESSION_SECRET || "").trim();
  if (explicit) return explicit;
  return `${env.APPWRITE_API_KEY_DEV || ""}:${env.APPWRITE_API_KEY_LIVE || ""}:blackarrow-local-session`;
}

test("Production environment with missing AUTH_SESSION_SECRET throws startup error even if SESSION_SECRET is set", () => {
  assert.throws(
    () => {
      resolveSessionSecretHelper({
        NODE_ENV: "production",
        AUTH_SESSION_SECRET: "",
        SESSION_SECRET: "legacy-session-secret-that-must-be-rejected-in-prod",
      });
    },
    /Missing AUTH_SESSION_SECRET in production environment/,
    "Must throw in production if AUTH_SESSION_SECRET is missing, even when SESSION_SECRET is set"
  );
});

test("Production environment with neither secret throws clear startup error", () => {
  assert.throws(
    () => {
      resolveSessionSecretHelper({
        NODE_ENV: "production",
        AUTH_SESSION_SECRET: "",
        SESSION_SECRET: "",
      });
    },
    /Missing AUTH_SESSION_SECRET in production environment/,
    "Must throw in production if both secrets are missing"
  );
});

test("Production environment with explicit AUTH_SESSION_SECRET succeeds", () => {
  const secret = resolveSessionSecretHelper({
    NODE_ENV: "production",
    AUTH_SESSION_SECRET: "strong-prod-session-secret-12345",
    SESSION_SECRET: "ignored-legacy-secret",
  });
  assert.equal(secret, "strong-prod-session-secret-12345");
});

test("Non-production environment uses fallback gracefully when no explicit secrets provided", () => {
  const fallback = resolveSessionSecretHelper({
    NODE_ENV: "development",
    APPWRITE_API_KEY_DEV: "dev-key",
  });
  assert.ok(fallback.includes("blackarrow-local-session"));
});

test("Non-production environment can use SESSION_SECRET", () => {
  const devSecret = resolveSessionSecretHelper({
    NODE_ENV: "development",
    SESSION_SECRET: "dev-session-secret-999",
  });
  assert.equal(devSecret, "dev-session-secret-999");
});
