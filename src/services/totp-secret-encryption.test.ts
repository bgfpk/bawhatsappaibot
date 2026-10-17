import test from "node:test";
import assert from "node:assert/strict";
import { encryptServerSecret, decryptServerSecret } from "./secret-crypto-service.ts";

process.env.BLACKARROW_SECRET_ENCRYPTION_KEY = "test-encryption-key-32-chars-long-abc";

test("TOTP secret encryption: AES-256-GCM encryption at rest and backwards compatibility", () => {
  const plaintextSecret = "JBSWY3DPEHPK3PXP";

  // 1. Encrypt
  const encrypted = encryptServerSecret(plaintextSecret);
  assert.equal(encrypted.startsWith("enc:v1:"), true, "Encrypted payload must have version prefix");
  assert.notEqual(encrypted, plaintextSecret, "Encrypted secret cannot be equal to plaintext");

  // 2. Decrypt
  const decrypted = decryptServerSecret(encrypted);
  assert.equal(decrypted, plaintextSecret, "Decrypted secret matches original plaintext");

  // 3. Backwards compatibility for legacy plaintext secrets
  const legacySecret = "KVKFKRCPNZQUYMLX";
  const legacyDecrypted = decryptServerSecret(legacySecret);
  assert.equal(legacyDecrypted, legacySecret, "Plaintext legacy secret is passed through safely");

  // 4. Empty values
  assert.equal(encryptServerSecret(""), "");
  assert.equal(decryptServerSecret(""), "");
});
