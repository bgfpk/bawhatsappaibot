// src/services/whatsapp-cloud-api-webhook-dedup.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  getCloudWebhookDedupKey,
  createCloudWebhookDeduper,
  summarizeCloudWebhookDedupResult,
} from "./whatsapp-cloud-api-webhook-dedup.ts";

test("getCloudWebhookDedupKey generates unique keys for message events", () => {
  const envelope: any = {
    eventType: "message",
    event: {
      message: {
        id: "msg_123",
      },
    },
  };
  const key = getCloudWebhookDedupKey(envelope);
  assert.equal(key, "whatsapp_cloud_api:message:msg_123");
});

test("getCloudWebhookDedupKey generates unique keys for status events", () => {
  const envelope: any = {
    eventType: "status",
    event: {
      status: {
        id: "status_456",
        status: "read",
      },
    },
  };
  const key = getCloudWebhookDedupKey(envelope);
  assert.equal(key, "whatsapp_cloud_api:status:status_456:read");
});

test("getCloudWebhookDedupKey returns null safely for malformed input", () => {
  assert.equal(getCloudWebhookDedupKey(null as any), null);
  assert.equal(getCloudWebhookDedupKey({} as any), null);
  assert.equal(getCloudWebhookDedupKey({ eventType: "message" } as any), null);
});

test("CloudWebhookDeduper correctly accepts first key and flags duplicate for repeated key", () => {
  const deduper = createCloudWebhookDeduper();
  const key = "test_event_key";

  const firstCheck = deduper.checkAndRecord(key);
  assert.ok(firstCheck.success);
  assert.equal(firstCheck.isDuplicate, false);

  const secondCheck = deduper.checkAndRecord(key);
  assert.ok(secondCheck.success);
  assert.equal(secondCheck.isDuplicate, true);

  const invalidCheck = deduper.checkAndRecord(null);
  assert.equal(invalidCheck.success, false);
});

test("CloudWebhookDeduper evicts oldest keys under bounded maxSize limit", () => {
  const deduper = createCloudWebhookDeduper({ maxSize: 3 });

  deduper.checkAndRecord("key_1");
  deduper.checkAndRecord("key_2");
  deduper.checkAndRecord("key_3");
  assert.equal(deduper.getSize(), 3);

  // Inserting fourth key evicts the oldest ("key_1")
  deduper.checkAndRecord("key_4");
  assert.equal(deduper.getSize(), 3);

  // key_1 is now gone and can be re-recorded as new
  const checkKey1 = deduper.checkAndRecord("key_1");
  assert.equal(checkKey1.isDuplicate, false);
});

test("summarizeCloudWebhookDedupResult formats output safely without secrets", () => {
  const resultObj = { success: true, isDuplicate: true };
  const summary = summarizeCloudWebhookDedupResult(resultObj);
  assert.deepEqual(summary, { success: true, isDuplicate: true, reason: undefined });
  
  const nilSummary = summarizeCloudWebhookDedupResult(null);
  assert.deepEqual(nilSummary, { status: "unsupported" });
});
