import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { INTEGRATION_BETA_COLLECTIONS } from "./integration-beta-collections.ts";
import {
  buildBackfillDocumentId,
  buildLowRiskBackfillCandidates,
  executeLowRiskBackfillOperations,
  isAppwriteSafeDocumentId,
  LOW_RISK_BACKFILL_TARGETS,
  maskForBackfillOutput,
  planLowRiskBackfillOperations,
  redactSensitiveText,
} from "./integration-beta-low-risk-backfill.ts";

describe("integration beta low-risk backfill helpers", () => {
  it("does not write during dry-run execution", async () => {
    const operations: any[] = [{
      collectionId: INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS,
      accountId: "acct_1",
      fallbackPath: "integrationFoundation.apiRequestLogs",
      originalId: "api_log_1",
      documentId: "api_log_1",
      dedupeKey: "api_log_1",
      action: "create",
      data: { accountId: "acct_1" },
    }];
    let writes = 0;
    const result = await executeLowRiskBackfillOperations(operations, {
      create: async () => { writes += 1; },
      update: async () => { writes += 1; },
    }, false);

    assert.equal(writes, 0);
    assert.equal(result.wouldCreateRows, 1);
    assert.equal(result.createdRows, 0);
  });

  it("preserves Appwrite-safe IDs and hashes unsafe IDs deterministically", () => {
    assert.equal(isAppwriteSafeDocumentId("safe_id-1.ok"), true);
    assert.equal(isAppwriteSafeDocumentId("not safe"), false);
    assert.equal(isAppwriteSafeDocumentId("x".repeat(37)), false);

    assert.equal(buildBackfillDocumentId("api_request_logs", "acct_1", { id: "safe_id-1.ok" }), "safe_id-1.ok");
    const first = buildBackfillDocumentId("api_request_logs", "acct_1", { id: "not safe and far too long ".repeat(3) }, "same");
    const second = buildBackfillDocumentId("api_request_logs", "acct_1", { id: "not safe and far too long ".repeat(3) }, "same");

    assert.equal(first, second);
    assert.match(first, /^bf_[a-f0-9]{33}$/);
    assert.equal(first.length, 36);
  });

  it("plans idempotent creates and updates without duplicate fallback rows", () => {
    const candidates = buildLowRiskBackfillCandidates("acct_1", {
      apiRequestLogs: [
        { id: "api_log_1", keyId: "key_1", path: "/one", method: "GET", status: 200, createdAt: 10 },
        { id: "api_log_1", keyId: "key_1", path: "/one", method: "GET", status: 200, createdAt: 10 },
      ],
      externalObjectLinks: [
        { id: "link_1", accountId: "acct_1", provider: "woocommerce", objectType: "product", externalId: "99", blackarrowId: "prod_99" },
        { id: "link_2", accountId: "acct_1", provider: "woocommerce", objectType: "product", externalId: "99", blackarrowId: "prod_99" },
      ],
    });
    const plan = planLowRiskBackfillOperations(candidates, {
      [INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS]: [{ documentId: "api_log_1", data: { accountId: "acct_1" } }],
    });

    assert.equal(plan.operations.length, 2);
    assert.equal(plan.operations.find((operation) => operation.collectionId === INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS)?.action, "update");
    assert.equal(plan.operations.find((operation) => operation.collectionId === INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS)?.action, "create");
    assert.equal(plan.duplicateIds, 2);
    assert.equal(plan.skippedRows, 2);
  });

  it("redacts sensitive values from mapped rows and output masks", () => {
    const candidates = buildLowRiskBackfillCandidates("acct_1", {
      apiRequestLogs: [{ id: "api_log_2", keyId: "key_1", path: "/status?api_key=bai_live_secret", method: "GET", reason: "bad whsec_test", status: 401 }],
      webhookEvents: [{ id: "evt_1", type: "test.ping", data: { token: "raw-token", nested: { consumerSecret: "cs_raw" } } }],
    });
    const apiLog = candidates.find((candidate) => candidate.collectionId === INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS);
    const event = candidates.find((candidate) => candidate.collectionId === INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS);

    assert.equal(String(apiLog?.data.path).includes("bai_live_secret"), false);
    assert.equal(String(apiLog?.data.reason).includes("whsec_test"), false);
    assert.equal(String(event?.data.dataJson).includes("raw-token"), false);
    assert.equal(redactSensitiveText("token=bai_live_secret").includes("bai_live_secret"), false);
    assert.deepEqual(maskForBackfillOutput({ apiKey: "bai_live_secret", ok: "yes" }), { apiKey: "[redacted]", ok: "yes" });
  });

  it("includes only approved low-risk collections", () => {
    assert.deepEqual([...LOW_RISK_BACKFILL_TARGETS].sort(), [
      INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS,
      INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS,
      INTEGRATION_BETA_COLLECTIONS.INTEGRATION_SYNC_JOBS,
      INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES,
      INTEGRATION_BETA_COLLECTIONS.WEBHOOK_EVENTS,
    ].sort());

    const blocked = [
      INTEGRATION_BETA_COLLECTIONS.API_KEYS,
      INTEGRATION_BETA_COLLECTIONS.INTEGRATION_CONNECTIONS,
      INTEGRATION_BETA_COLLECTIONS.WEBHOOK_ENDPOINTS,
      INTEGRATION_BETA_COLLECTIONS.SAVED_RECIPIENT_LISTS,
      INTEGRATION_BETA_COLLECTIONS.SCHEDULED_UPDATE_RECIPIENT_JOBS,
      INTEGRATION_BETA_COLLECTIONS.API_MESSAGE_REQUESTS,
    ];
    assert.equal(blocked.some((collectionId) => (LOW_RISK_BACKFILL_TARGETS as readonly string[]).includes(collectionId)), false);
  });
});
