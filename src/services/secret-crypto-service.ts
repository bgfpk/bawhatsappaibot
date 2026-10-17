import crypto from "crypto";

const PREFIX = "enc:v1:";

function clean(value: any) {
  return String(value || "").trim();
}

function secretMaterial() {
  const explicit = clean(
    process.env.BLACKARROW_SECRET_ENCRYPTION_KEY ||
    process.env.SECRET_ENCRYPTION_KEY ||
    process.env.APP_ENCRYPTION_KEY
  );
  if (explicit) return explicit;
  const fallback = clean(process.env.SESSION_SECRET || process.env.APPWRITE_API_KEY);
  if (fallback && process.env.NODE_ENV !== "production") return fallback;
  throw new Error("missing_secret_encryption_key");
}

function key() {
  return crypto.createHash("sha256").update(secretMaterial()).digest();
}

export function encryptServerSecret(plainText: any) {
  const value = clean(plainText);
  if (!value) return "";
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${Buffer.concat([iv, tag, encrypted]).toString("base64url")}`;
}

export function hasExplicitServerSecretEncryptionKey() {
  return Boolean(
    clean(
      process.env.BLACKARROW_SECRET_ENCRYPTION_KEY ||
      process.env.SECRET_ENCRYPTION_KEY ||
      process.env.APP_ENCRYPTION_KEY
    )
  );
}

export function decryptServerSecret(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (!text.startsWith(PREFIX)) return text;
  const payload = Buffer.from(text.slice(PREFIX.length), "base64url");
  const iv = payload.subarray(0, 12);
  const tag = payload.subarray(12, 28);
  const encrypted = payload.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

export function maskSecret(value: any) {
  const text = clean(value);
  if (!text) return "";
  if (text.length <= 8) return "****";
  return `${text.slice(0, 4)}...${text.slice(-4)}`;
}

export function redactSecrets(text: any, secrets: any[] = []) {
  let output = String(text || "");
  for (const secret of secrets.map(clean).filter(Boolean)) {
    output = output.split(secret).join(maskSecret(secret));
  }
  return output;
}
