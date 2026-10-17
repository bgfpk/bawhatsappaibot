import test from "node:test";
import assert from "node:assert/strict";

import {
  buildWelcomeSequenceProfilePatch,
  buildWelcomeSequenceTimelineLine,
} from "./welcome-sequence-status-service.ts";

test("welcome timeline summarizes sent and recovered welcome status", () => {
  assert.equal(buildWelcomeSequenceTimelineLine({ lastWelcomeSequenceStatus: "sent" }), "Welcome sequence sent.");
  assert.equal(
    buildWelcomeSequenceTimelineLine({ lastWelcomeSequenceStatus: "sent", lastWelcomeSequenceSource: "welcome_recovery" }),
    "Welcome sequence recovered and sent."
  );
});

test("welcome timeline summarizes skipped reason briefly", () => {
  assert.equal(
    buildWelcomeSequenceTimelineLine({ lastWelcomeSequenceStatus: "skipped", lastWelcomeSequenceReason: "wallet balance too low" }),
    "Welcome sequence skipped: wallet balance too low."
  );
});

test("welcome profile patch records compact fields", () => {
  const patch = buildWelcomeSequenceProfilePatch({ status: "failed", reason: "relay failed", source: "automatic_welcome", timestamp: 100 });
  assert.equal(patch.lastWelcomeSequenceStatus, "failed");
  assert.equal(patch.lastWelcomeSequenceReason, "relay failed");
  assert.equal(patch.lastWelcomeSequenceSource, "automatic_welcome");
  assert.equal(patch.lastWelcomeSequenceAt, 100);
});
