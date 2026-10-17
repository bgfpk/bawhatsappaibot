import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  __customerUpdateListCampaignTestUtils,
  CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS,
  CUSTOMER_UPDATE_LIST_COLLECTIONS,
} from "./customer-update-list-campaign-service.ts";
import { __publicApiKeyTestUtils } from "./public-api-key-service.ts";

describe("customer update recipient list campaign helpers", () => {
  it("parses pasted recipients with valid, duplicate, and invalid statuses", () => {
    const rows = __customerUpdateListCampaignTestUtils.parseRecipientText(`
      +923001234567
      923001234567
      bad-number
      contact-dcb9484baef9@example.invalid
    `);

    assert.equal(rows.length, 4);
    assert.equal(rows.filter((row: any) => row.status === "valid").length, 2);
    assert.equal(rows.filter((row: any) => row.status === "duplicate").length, 1);
    assert.equal(rows.filter((row: any) => row.status === "invalid").length, 1);
    assert.equal(rows[0].jid, "contact-e4ed32210a80@example.invalid");
  });

  it("counts and caps pasted recipients without crashing on oversized input", () => {
    const tooMany = Array.from({ length: CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SAVED_LIST_IMPORT_RECIPIENTS + 5 }, (_, index) => `92300${String(index).padStart(7, "0")}`).join("\n");

    assert.equal(__customerUpdateListCampaignTestUtils.countRecipientEntries(tooMany), CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SAVED_LIST_IMPORT_RECIPIENTS + 5);
    assert.equal(__customerUpdateListCampaignTestUtils.parseRecipientText(tooMany).length, CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_SAVED_LIST_IMPORT_RECIPIENTS);
    assert.throws(() => __customerUpdateListCampaignTestUtils.ensureQueuedJobCapacity({
      jobs: Array.from({ length: CUSTOMER_UPDATE_MESSAGE_SAFETY_LIMITS.MAX_QUEUED_JOBS_PER_ACCOUNT_WINDOW }, () => ({
        status: "queued",
        createdAt: 1710000000,
      })),
    }, 1, 1710000001), /Too many message jobs/);
  });

  it("calculates run/job status stats", () => {
    const stats = __customerUpdateListCampaignTestUtils.calculateRunStats([
      { status: "pending" },
      { status: "queued" },
      { status: "sending" },
      { status: "sent" },
      { status: "failed" },
      { status: "skipped" },
      { status: "cancelled" },
    ]);

    assert.equal(stats.totalCount, 7);
    assert.equal(stats.pendingCount, 1);
    assert.equal(stats.queuedCount, 1);
    assert.equal(stats.sendingCount, 1);
    assert.equal(stats.sentCount, 1);
    assert.equal(stats.failedCount, 1);
    assert.equal(stats.skippedCount, 1);
    assert.equal(stats.cancelledCount, 1);
  });

  it("keeps recurring campaign occurrences as separate run times", () => {
    const base = 1710000000;

    assert.equal(__customerUpdateListCampaignTestUtils.repeatNextRunAt(base, "daily"), base + 86400);
    assert.equal(__customerUpdateListCampaignTestUtils.repeatNextRunAt(base, "weekly"), base + 7 * 86400);
    assert.equal(__customerUpdateListCampaignTestUtils.repeatNextRunAt(base, "monthly"), base + 30 * 86400);
  });

  it("materializes due recurring runs, advances nextRunAt, and avoids duplicate occurrences", async () => {
    const base = 1710000000;
    const store: any = {
      lists: [{ id: "list_1", accountId: "acct_1", name: "VIPs" }],
      members: [{
        id: "member_1",
        accountId: "acct_1",
        listId: "list_1",
        phoneRaw: "+144225232320",
        normalizedPhone: "195545134641",
        jid: "contact-e4ed32210a80@example.invalid",
        status: "valid",
      }],
      campaigns: [{
        id: "camp_1",
        accountId: "acct_1",
        botId: "bot_1",
        listId: "list_1",
        messageText: "Hello",
        repeatRule: "daily",
        nextRunAt: base,
        status: "running",
        runCount: 0,
      }],
      runs: [],
      jobs: [],
    };

    const first = await __customerUpdateListCampaignTestUtils.materializeDueRecurringRuns("acct_1", store, base + 1);
    assert.equal(first.runs.length, 1);
    assert.equal(first.runs[0].runAt, base);
    assert.equal(first.campaigns[0].nextRunAt, base + 86400);
    assert.equal(first.campaigns[0].runCount, 1);
    assert.equal(first.lists.length, 1);

    const stalled = {
      ...first,
      campaigns: [{ ...first.campaigns[0], nextRunAt: base }],
    };
    const advancedOnly = await __customerUpdateListCampaignTestUtils.materializeDueRecurringRuns("acct_1", stalled, base + 1);
    assert.equal(advancedOnly.runs.length, 1);
    assert.equal(advancedOnly.campaigns[0].nextRunAt, base + 86400);

    const second = await __customerUpdateListCampaignTestUtils.materializeDueRecurringRuns("acct_1", advancedOnly, base + 86400 + 1);
    assert.equal(second.runs.length, 2);
    assert.deepEqual(second.runs.map((run: any) => run.runAt).sort((a: number, b: number) => a - b), [base, base + 86400]);
    assert.equal(second.campaigns[0].nextRunAt, base + 2 * 86400);
    assert.equal(second.jobs.length, 2);
  });

  it("skips duplicate recipients inside the same run", async () => {
    const base = 1710000000;
    const store: any = {
      lists: [{ id: "list_1", accountId: "acct_1", name: "VIPs" }],
      members: [
        {
          id: "member_1",
          accountId: "acct_1",
          listId: "list_1",
          phoneRaw: "+144225232320",
          normalizedPhone: "195545134641",
          jid: "contact-e4ed32210a80@example.invalid",
          status: "valid",
        },
        {
          id: "member_2",
          accountId: "acct_1",
          listId: "list_1",
          phoneRaw: "195545134641",
          normalizedPhone: "195545134641",
          jid: "contact-e4ed32210a80@example.invalid",
          status: "valid",
        },
      ],
      campaigns: [{
        id: "camp_1",
        accountId: "acct_1",
        botId: "bot_1",
        botJid: "",
        listId: "list_1",
        messageText: "Hello",
        repeatRule: "daily",
        nextRunAt: base,
        status: "running",
        runCount: 0,
      }],
      runs: [],
      jobs: [],
    };

    const materialized = await __customerUpdateListCampaignTestUtils.materializeDueRecurringRuns("acct_1", store, base + 1);

    assert.equal(materialized.jobs.filter((job: any) => job.status === "queued").length, 1);
    assert.equal(materialized.jobs.filter((job: any) => job.status === "skipped").length, 1);
    assert.equal(materialized.jobs.find((job: any) => job.status === "skipped")?.lastError, "duplicate_recipient_in_run");
  });

  it("recovers stale sending jobs conservatively without retrying fresh or evidenced sends", () => {
    const timeout = __customerUpdateListCampaignTestUtils.STALE_SENDING_JOB_TIMEOUT_SECONDS;
    const maxAttempts = __customerUpdateListCampaignTestUtils.MAX_RECIPIENT_JOB_ATTEMPTS;
    const timestamp = 1710000000;
    const baseJob = {
      accountId: "acct_1",
      campaignId: "camp_1",
      runId: "run_1",
      botId: "bot_1",
      jid: "contact-e4ed32210a80@example.invalid",
      messageText: "Hello",
      status: "sending",
      attemptCount: 1,
      updatedAt: timestamp - timeout - 10,
      whatsAppMessageId: "",
      sentAt: 0,
      lastError: "",
    };
    const store: any = {
      campaigns: [{ id: "camp_1", accountId: "acct_1", repeatRule: "", status: "running" }],
      runs: [{ id: "run_1", campaignId: "camp_1", runAt: timestamp - 100, status: "running", completedAt: 0 }],
      jobs: [
        { ...baseJob, id: "fresh", updatedAt: timestamp - timeout + 10 },
        { ...baseJob, id: "stale" },
        { ...baseJob, id: "evidenced", whatsAppMessageId: "wamid_1" },
        { ...baseJob, id: "maxed", attemptCount: maxAttempts },
      ],
    };

    const recovered = __customerUpdateListCampaignTestUtils.recoverStaleSendingJobs(store, timestamp);
    const byId = new Map(recovered.jobs.map((job: any) => [job.id, job]));

    assert.equal((byId.get("fresh") as any).status, "sending");
    assert.equal((byId.get("stale") as any).status, "queued");
    assert.equal((byId.get("stale") as any).attemptCount, 1);
    assert.equal((byId.get("stale") as any).lastError, "stale_sending_recovered_no_send_evidence");
    assert.equal((byId.get("evidenced") as any).status, "sending");
    assert.equal((byId.get("maxed") as any).status, "failed");
    assert.equal((byId.get("maxed") as any).lastError, "stale_sending_recovery_max_attempts");
  });

  it("identifies blocked, opted-out, and paused profiles as skipped recipients", () => {
    assert.equal(__customerUpdateListCampaignTestUtils.profileBlocksListMessage({ botReplyPausedPermanent: true }), "customer_permanently_stopped");
    assert.equal(__customerUpdateListCampaignTestUtils.profileBlocksListMessage({ aiPaused: true }), "manual_review_required");
    assert.equal(__customerUpdateListCampaignTestUtils.profileBlocksListMessage({ marketingOptOut: true }), "customer_opted_out");
    assert.equal(__customerUpdateListCampaignTestUtils.profileBlocksListMessage({}), "");
  });

  it("declares production collection names for migration", () => {
    assert.equal(CUSTOMER_UPDATE_LIST_COLLECTIONS.SAVED_RECIPIENT_LISTS, "saved_recipient_lists");
    assert.equal(CUSTOMER_UPDATE_LIST_COLLECTIONS.SCHEDULED_UPDATE_RECIPIENT_JOBS, "scheduled_update_recipient_jobs");
    assert.equal(CUSTOMER_UPDATE_LIST_COLLECTIONS.API_MESSAGE_REQUESTS, "api_message_requests");
  });

  it("checks public API message scopes", () => {
    assert.equal(__publicApiKeyTestUtils.hasRequiredApiScope(["write:messages"], "write:messages"), true);
    assert.equal(__publicApiKeyTestUtils.hasRequiredApiScope(["read:account"], "write:messages"), false);
    assert.equal(__publicApiKeyTestUtils.hasRequiredApiScope(["write:messages"], ["read:messages", "write:messages"]), true);
  });
});
