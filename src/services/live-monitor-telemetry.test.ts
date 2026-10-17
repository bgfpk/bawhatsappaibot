import test from "node:test";
import assert from "node:assert/strict";

function maskCustomerJid(jid: string): string {
  if (!jid) return "Unknown";
  const raw = jid.replace(/@.*$/, "");
  if (raw.length <= 4) return raw;
  return raw.slice(0, 3) + "***" + raw.slice(-3);
}

function redactOperationalLogSecrets(text: string): string {
  if (!text) return "";
  return text
    .replace(/(bearer\s+)[a-zA-Z0-9_\-\.]{10,}/gi, "$1[REDACTED]")
    .replace(/(api[_-]?key[:=]\s*)[a-zA-Z0-9_\-\.]{10,}/gi, "$1[REDACTED]")
    .replace(/(password[:=]\s*)[^\s,]+/gi, "$1[REDACTED]");
}

test("maskCustomerJid masks middle characters of phone JID safely", () => {
  assert.equal(maskCustomerJid("contact-e4ed32210a80@example.invalid"), "923***567");
  assert.equal(maskCustomerJid("contact-461717085d92@example.invalid"), "155***567");
  assert.equal(maskCustomerJid(""), "Unknown");
});

test("redactOperationalLogSecrets masks bearer tokens and API keys", () => {
  const rawLog = "Worker connecting with Bearer secret_live_token_123456789 and apiKey=AIzaSyA1234567890abcdef";
  const sanitized = redactOperationalLogSecrets(rawLog);
  assert.equal(sanitized.includes("secret_live_token"), false);
  assert.equal(sanitized.includes("AIzaSyA1234567890abcdef"), false);
  assert.match(sanitized, /\[REDACTED\]/);
});
