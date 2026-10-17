import test from "node:test";
import assert from "node:assert/strict";

import {
  buildFollowupDeleteConfirmation,
  removeFollowupCampaignAt,
  updateFollowupCampaignAt,
} from "./followup-campaign-editor-service.ts";

test("delete campaign removes it from the saved list", () => {
  const next = removeFollowupCampaignAt([
    { id: "a", name: "One" },
    { id: "b", name: "Two" },
  ], 0);

  assert.deepEqual(next, [{ id: "b", name: "Two" }]);
});

test("toggle patch updates active state and keeps campaign type normalized", () => {
  const next = updateFollowupCampaignAt([
    { id: "a", campaign_type: "", is_active: 1 },
  ], 0, { is_active: 0, campaign_type: "legacy" });

  assert.equal(next[0].is_active, 0);
  assert.equal(next[0].campaign_type, "fixed_message");
});

test("delete confirmation uses campaign name when available", () => {
  assert.match(buildFollowupDeleteConfirmation({ name: "Dormant Leads" }, 0), /Dormant Leads/);
});
