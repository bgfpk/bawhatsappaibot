import test from "node:test";
import assert from "node:assert/strict";

import { validateFollowupCampaignStillSendable } from "./followup-campaign-revalidation-service.ts";

test("deleted follow-up campaign is not sendable", () => {
  const result = validateFollowupCampaignStillSendable({
    bot: { config_settings: JSON.stringify({ followups_json: JSON.stringify([]) }) },
    followupId: "campaign-1",
    campaignType: "fixed_message",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "skipped_deleted_campaign");
});

test("inactive follow-up campaign is not sendable", () => {
  const result = validateFollowupCampaignStillSendable({
    bot: {
      config_settings: JSON.stringify({
        followups_json: JSON.stringify([{ id: "campaign-1", is_active: false, campaign_type: "fixed_message" }]),
      }),
    },
    followupId: "campaign-1",
    campaignType: "fixed_message",
  });

  assert.equal(result.ok, false);
  assert.equal(result.reason, "skipped_inactive_campaign");
});

test("active matching follow-up campaign is sendable", () => {
  const result = validateFollowupCampaignStillSendable({
    bot: {
      config_settings: JSON.stringify({
        followups_json: JSON.stringify([{ id: "campaign-1", is_active: true, campaign_type: "ai_smart_followup" }]),
      }),
    },
    followupId: "campaign-1",
    campaignType: "ai_smart_followup",
  });

  assert.equal(result.ok, true);
});
