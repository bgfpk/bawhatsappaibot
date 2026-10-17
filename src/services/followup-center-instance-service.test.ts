import test from "node:test";
import assert from "node:assert/strict";

import { chooseFollowupCenterInstance, getBotStableId } from "./followup-center-instance-service.ts";

test("Follow-up Center restores saved bot when available", () => {
  const chosen = chooseFollowupCenterInstance([
    { id: "bot_a", name: "A" },
    { id: "bot_b", name: "B" },
  ], "bot_b", "");

  assert.equal(getBotStableId(chosen), "bot_b");
});

test("Follow-up Center falls back to first active connected bot", () => {
  const chosen = chooseFollowupCenterInstance([
    { id: "bot_a", is_active: 0 },
    { id: "bot_b", is_active: 1, jid: "contact-4e899668752d@example.invalid" },
  ], "", "");

  assert.equal(getBotStableId(chosen), "bot_b");
});

test("Follow-up Center keeps current selected bot when valid", () => {
  const chosen = chooseFollowupCenterInstance([
    { id: "bot_a", name: "A" },
    { id: "bot_b", name: "B" },
  ], "bot_a", "bot_b");

  assert.equal(getBotStableId(chosen), "bot_b");
});
