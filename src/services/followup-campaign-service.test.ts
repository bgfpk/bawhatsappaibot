import test from "node:test";
import assert from "node:assert/strict";

import {
  isFollowupActive,
  isFollowupSchedulerEnabled,
  isWithinFollowupWindow,
  normalizeFollowupWindowHours,
} from "./followup-campaign-service.ts";

test("follow-up delay is eligible only inside configured upper window", () => {
  const now = (2 * 60 * 60) + (30 * 60);
  const lastMessageAt = 0;

  assert.equal(isWithinFollowupWindow(lastMessageAt, now, 2, 1), true);
});

test("follow-up delay outside upper window is skipped", () => {
  const now = 10 * 60 * 60;
  const lastMessageAt = 0;

  assert.equal(isWithinFollowupWindow(lastMessageAt, now, 2, 1), false);
});

test("follow-up delay does not become eligible before inactive delay", () => {
  const now = 30 * 60;
  const lastMessageAt = 0;

  assert.equal(isWithinFollowupWindow(lastMessageAt, now, 1, 6), false);
});

test("follow-up past window remains capped for UI/config hygiene", () => {
  assert.equal(normalizeFollowupWindowHours(24, 1), 6);
});

test("missing is_active defaults inactive for safety", () => {
  assert.equal(isFollowupActive(undefined), false);
  assert.equal(isFollowupActive(1), true);
});

test("follow-up scheduler kill switch disables sends", () => {
  assert.equal(isFollowupSchedulerEnabled({ FOLLOWUP_SCHEDULER_ENABLED: "false" }), false);
  assert.equal(isFollowupSchedulerEnabled({ FOLLOWUP_SCHEDULER_ENABLED: "true" }), true);
  assert.equal(isFollowupSchedulerEnabled({}), true);
});
