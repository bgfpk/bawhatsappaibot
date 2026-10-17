import test from "node:test";
import assert from "node:assert/strict";

import {
  getFollowupCampaignCost,
  getFollowupCampaignTypeLabel,
  normalizeFollowupCampaignType,
} from "./followup-campaign-type-service.ts";

test("old or missing follow-up campaign type defaults to fixed_message", () => {
  assert.equal(normalizeFollowupCampaignType(undefined), "fixed_message");
  assert.equal(normalizeFollowupCampaignType(""), "fixed_message");
  assert.equal(normalizeFollowupCampaignType("legacy"), "fixed_message");
  assert.equal(getFollowupCampaignTypeLabel(undefined), "Fixed Message");
  assert.equal(getFollowupCampaignCost(undefined), 0.001);
});

test("AI smart follow-up campaign type uses successful-send pricing", () => {
  assert.equal(normalizeFollowupCampaignType("ai_smart_followup"), "ai_smart_followup");
  assert.equal(getFollowupCampaignTypeLabel("ai_smart_followup"), "AI Smart Follow-up");
  assert.equal(getFollowupCampaignCost("ai_smart_followup"), 0.003);
});
