import test from "node:test";
import assert from "node:assert/strict";

import { deliverMarketingFollowup } from "./marketing-followup-delivery-service.ts";

test("skipped incomplete or stale followup does not mark sent or charge", async () => {
  const records: any[] = [];
  const reports: any[] = [];
  const result = await deliverMarketingFollowup({
    item: {
      botId: "bot-1",
      botJid: "contact-ee7c1e411a7c@example.invalid",
      followupId: "followup-1",
      customerId: "contact-2658838c5e39@example.invalid",
      attemptKey: "attempt-1",
      lastMessageAt: 1710000200,
    },
    ownerUserId: "user-1",
    sendThroughWorker: async () => ({
      skipped: true,
      status: "skipped",
      reason: "customer_replied_after_trigger",
      chargeAmount: 0,
    }),
    recordDelivery: async (botJid, customerJid, input) => {
      records.push({ botJid, customerJid, ...input });
    },
    appendReport: (entry) => reports.push(entry),
  });

  assert.equal(result.status, "skipped");
  assert.equal(records.some((record) => record.status === "sent"), false);
  assert.equal(records.some((record) => record.status === "skipped"), true);
  assert.equal(reports.some((report) => report.status === "sent"), false);
  assert.equal(reports.find((report) => report.status === "skipped")?.costCharged, 0);
});

test("delivery report is still written when profile record update fails", async () => {
  const reports: any[] = [];
  const result = await deliverMarketingFollowup({
    item: {
      botId: "bot-1",
      botJid: "contact-ee7c1e411a7c@example.invalid",
      followupId: "followup-1",
      customerId: "contact-2658838c5e39@example.invalid",
      attemptKey: "attempt-1",
    },
    ownerUserId: "user-1",
    sendThroughWorker: async () => ({
      status: "sent",
      sentMessageId: "sent-1",
      chargeAmount: 0.001,
    }),
    recordDelivery: async () => {
      throw new Error("profile write failed");
    },
    appendReport: (entry) => reports.push(entry),
  });

  assert.equal(result.status, "sent");
  assert.equal(reports.find((report) => report.status === "sent")?.sentMessageId, "sent-1");
  assert.equal(reports.find((report) => report.status === "sent")?.costCharged, 0.001);
});
