import assert from "node:assert/strict";
import test from "node:test";
import { normalizeCloudApiRecipient } from "./whatsapp-cloud-api-recipient.ts";

test("CloudApiRecipient: normalizes valid customer JIDs to plain digits", () => {
  const result = normalizeCloudApiRecipient("contact-e4ed32210a80@example.invalid");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.to, "195545134641");
  }
});

test("CloudApiRecipient: normalizes phone numbers with leading plus or formatting", () => {
  const r1 = normalizeCloudApiRecipient("+144225232320");
  assert.equal(r1.ok, true);
  if (r1.ok) assert.equal(r1.to, "195545134641");

  const r2 = normalizeCloudApiRecipient("+92 300 1234567");
  assert.equal(r2.ok, true);
  if (r2.ok) assert.equal(r2.to, "195545134641");

  const r3 = normalizeCloudApiRecipient("92-300-1234567");
  assert.equal(r3.ok, true);
  if (r3.ok) assert.equal(r3.to, "195545134641");

  const r4 = normalizeCloudApiRecipient("14168283117645");
  assert.equal(r4.ok, true);
  if (r4.ok) assert.equal(r4.to, "195545134641");
});

test("CloudApiRecipient: normalizes plain phone digits", () => {
  const result = normalizeCloudApiRecipient("195545134641");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.to, "195545134641");
  }
});

test("CloudApiRecipient: rejects group JIDs (@g.us)", () => {
  const result = normalizeCloudApiRecipient("contact-885de4b1d789@example.invalid");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "group_jid_not_supported_on_cloud_api");
  }
});

test("CloudApiRecipient: rejects broadcast JIDs (@broadcast)", () => {
  const result = normalizeCloudApiRecipient("status@broadcast");
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "broadcast_jid_not_supported_on_cloud_api");
  }
});

test("CloudApiRecipient: rejects empty, null, or undefined values", () => {
  assert.equal(normalizeCloudApiRecipient("").ok, false);
  assert.equal(normalizeCloudApiRecipient("   ").ok, false);
  assert.equal(normalizeCloudApiRecipient(null).ok, false);
  assert.equal(normalizeCloudApiRecipient(undefined).ok, false);
});

test("CloudApiRecipient: rejects malformed and non-digit inputs", () => {
  const r1 = normalizeCloudApiRecipient("contact-26e46082e92c@example.invalid");
  assert.equal(r1.ok, false);

  const r2 = normalizeCloudApiRecipient("invalid-user");
  assert.equal(r2.ok, false);

  const r3 = normalizeCloudApiRecipient("123"); // Too short
  assert.equal(r3.ok, false);

  const r4 = normalizeCloudApiRecipient("12345678901234567890"); // Too long (>15 digits)
  assert.equal(r4.ok, false);
});
