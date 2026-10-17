import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFollowupAttemptKey,
  buildFollowupDeliveryPatch,
  hasOutboundAfter,
  hasRecentIncompleteAiFollowupSkip,
  hasSuccessfulFollowupAttempt,
} from "./followup-delivery-evidence.ts";

test("normal bot replies after customer inbound are not successful follow-up attempts", () => {
  const profile = {};
  const attemptKey = buildFollowupAttemptKey({
    followupId: "campaign_1",
    customerJid: "contact-4e899668752d@example.invalid",
    customerLastMessageAt: 100,
  });
  const messages = [{ role: "model", text: "Thanks, how can I help?", timestamp: 120 }];

  assert.equal(hasOutboundAfter(messages, 100), true);
  assert.equal(hasSuccessfulFollowupAttempt(profile, "campaign_1", attemptKey), false);
});

test("same campaign customer and last inbound attempt key prevents duplicate follow-up", () => {
  const attemptKey = buildFollowupAttemptKey({
    followupId: "campaign_1",
    customerJid: "contact-4e899668752d@example.invalid",
    customerLastMessageAt: 100,
  });
  const profile = {
    followupDeliveries: {
      campaign_1: { status: "sent", attemptKey },
    },
  };

  assert.equal(hasSuccessfulFollowupAttempt(profile, "campaign_1", attemptKey), true);
});

test("ai_incomplete_output skip applies retry cooldown", () => {
  const nowSeconds = 2_000_000;
  const patch = buildFollowupDeliveryPatch({}, {
    followupId: "f1",
    status: "skipped",
    reason: "ai_incomplete_output",
    attemptKey: buildFollowupAttemptKey({
      followupId: "f1",
      customerJid: "contact-6c9bc40fc084@example.invalid",
      customerLastMessageAt: 1_999_000,
    }),
  });
  patch.followupDeliveries.f1.lastAttemptAt = nowSeconds - 60;

  assert.equal(hasRecentIncompleteAiFollowupSkip(patch, "f1", nowSeconds), true);
  assert.equal(hasRecentIncompleteAiFollowupSkip(patch, "f1", nowSeconds + 7 * 60 * 60), false);

  patch.followupDeliveries.f1.reason = "incomplete_output";
  assert.equal(hasRecentIncompleteAiFollowupSkip(patch, "f1", nowSeconds), true);
});
