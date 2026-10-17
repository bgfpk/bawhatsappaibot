import crypto from "crypto";

export const OAUTH_PASSWORD_SENTINEL = "oauth";
const PASSWORD_HASH_PREFIX = "scrypt";
const SCRYPT_KEYLEN = 64;

function toBase64(value: Buffer) {
  return value.toString("base64");
}

function fromBase64(value: string) {
  return Buffer.from(value, "base64");
}

export function isOAuthPasswordValue(value: any) {
  return String(value || "").trim().toLowerCase() === OAUTH_PASSWORD_SENTINEL;
}

export function isStoredPasswordHash(value: any) {
  const raw = String(value || "").trim();
  return raw.startsWith(`${PASSWORD_HASH_PREFIX}:`);
}

export function hashPassword(rawPassword: string) {
  const password = String(rawPassword || "");
  if (!password) throw new Error("Password is required");
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `${PASSWORD_HASH_PREFIX}:${toBase64(salt)}:${toBase64(derived)}`;
}

export function verifyPasswordAgainstHash(rawPassword: string, storedHash: string) {
  const value = String(storedHash || "").trim();
  if (!isStoredPasswordHash(value)) return false;

  const [, saltBase64, hashBase64] = value.split(":");
  if (!saltBase64 || !hashBase64) return false;

  const salt = fromBase64(saltBase64);
  const expected = fromBase64(hashBase64);
  const actual = crypto.scryptSync(String(rawPassword || ""), salt, expected.length);

  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

export function shouldMigratePlaintextPassword(value: any) {
  const raw = String(value || "");
  if (!raw) return false;
  if (isOAuthPasswordValue(raw)) return false;
  return !isStoredPasswordHash(raw);
}

