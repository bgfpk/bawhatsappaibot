import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import {
  __resetIntegrationBetaCollectionTestDeps,
  __setIntegrationBetaCollectionTestDeps,
  listBetaCollectionRows,
  mergeRowsById,
  writeBetaCollectionRow,
} from "./integration-beta-collection-store.ts";
import { INTEGRATION_BETA_COLLECTION_DEFINITIONS, INTEGRATION_BETA_COLLECTIONS } from "./integration-beta-collections.ts";
import { __publicApiKeyTestUtils, recordApiRequestLog } from "./public-api-key-service.ts";

afterEach(() => {
  __resetIntegrationBetaCollectionTestDeps();
});

describe("integration beta collection foundation", () => {
  it("exports expected beta collection definitions and indexes", () => {
    const ids = new Set(INTEGRATION_BETA_COLLECTION_DEFINITIONS.map((definition) => definition.id));
    assert.equal(ids.has(INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS), true);
    assert.equal(ids.has(INTEGRATION_BETA_COLLECTIONS.WEBHOOK_DELIVERIES), true);
    assert.equal(ids.has(INTEGRATION_BETA_COLLECTIONS.SCHEDULED_UPDATE_RECIPIENT_JOBS), true);

    const apiLogs = INTEGRATION_BETA_COLLECTION_DEFINITIONS.find((definition) => definition.id === INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS);
    assert.equal(apiLogs?.attributes.some((attribute) => attribute.key === "accountId" && attribute.required), true);
    assert.equal(apiLogs?.indexes.some((index) => index.key === "account_created"), true);
  });

  it("returns unavailable instead of throwing when a beta collection is missing", async () => {
    __setIntegrationBetaCollectionTestDeps({
      listDocuments: (async () => {
        const error: any = new Error("Collection not found");
        error.code = 404;
        throw error;
      }) as any,
      createDocument: (async () => {
        const error: any = new Error("Collection not found");
        error.code = 404;
        throw error;
      }) as any,
    });

    const listed = await listBetaCollectionRows(INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS, "acct_1");
    const written = await writeBetaCollectionRow(INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS, { id: "log_1", accountId: "acct_1" });

    assert.equal(listed.available, false);
    assert.deepEqual(listed.rows, []);
    assert.equal(written.available, false);
    assert.equal(written.written, false);
  });

  it("writes low-risk log rows to collection when available", async () => {
    const writes: any[] = [];
    __setIntegrationBetaCollectionTestDeps({
      createDocument: (async (_databaseId: string, collectionId: string, documentId: string, data: any) => {
        writes.push({ collectionId, documentId, data });
        return { $id: documentId, ...data };
      }) as any,
    });

    await recordApiRequestLog("acct_1", {
      id: "api_log_1",
      keyId: "key_1",
      path: "/api/public/v1/account/status?api_key=bai_live_secret",
      method: "GET",
      status: 200,
      reason: "ok bai_live_secret",
    });

    assert.equal(writes.length, 1);
    assert.equal(writes[0].collectionId, INTEGRATION_BETA_COLLECTIONS.API_REQUEST_LOGS);
    assert.equal(writes[0].data.accountId, "acct_1");
    assert.equal(String(writes[0].data.path).includes("bai_live_secret"), false);
    assert.equal(String(writes[0].data.reason).includes("bai_live_secret"), false);
  });

  it("dedupes collection and fallback rows by id", () => {
    const rows = mergeRowsById(
      [{ id: "same", source: "collection" }, { id: "collection_only" }],
      [{ id: "same", source: "fallback" }, { id: "fallback_only" }],
    );

    assert.deepEqual(rows.map((row: any) => row.id), ["same", "collection_only", "fallback_only"]);
    assert.equal((rows[0] as any).source, "collection");
  });

  it("redacts API-key-looking values from public log text", () => {
    const redacted = __publicApiKeyTestUtils.redactPublicLogText("bad bai_live_abc123SECRET consumer_secret=cs_raw");

    assert.equal(redacted.includes("bai_live_abc123SECRET"), false);
    assert.equal(redacted.includes("cs_raw"), false);
  });
});
