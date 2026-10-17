import test from "node:test";
import assert from "node:assert/strict";

import {
  buildSequenceProgressClearPatch,
  buildSequenceProgressPatch,
  getPendingSequenceItemIndexes,
  getSequenceProgressKey,
} from "./sequence-progress-service.ts";

test("sequence progress stores only failed item indexes for retry", () => {
  const progressKey = getSequenceProgressKey("sequence", "seq_sent_offer");
  const patch = buildSequenceProgressPatch({
    profile: {},
    progressKey,
    total: 3,
    source: "keyword_sequence",
    reason: "partial",
    results: [
      { sequenceIndex: 0, status: "sent", messageId: "m0" },
      { sequenceIndex: 1, status: "failed", reason: "relay" },
      { sequenceIndex: 2, status: "duplicate", messageId: "m2" },
    ],
  });

  assert.deepEqual(patch.sequenceDeliveryProgress[progressKey].deliveredIndexes, [0, 2]);
  assert.deepEqual(patch.sequenceDeliveryProgress[progressKey].pendingIndexes, [1]);
  assert.deepEqual(getPendingSequenceItemIndexes(patch, progressKey, 3), [1]);
});

test("sequence progress clear removes completed key", () => {
  const progressKey = getSequenceProgressKey("welcome");
  const patch = buildSequenceProgressClearPatch({
    sequenceDeliveryProgress: {
      [progressKey]: { pendingIndexes: [1] },
      other: { pendingIndexes: [0] },
    },
  }, progressKey);

  assert.equal(patch.sequenceDeliveryProgress[progressKey], undefined);
  assert.deepEqual(patch.sequenceDeliveryProgress.other.pendingIndexes, [0]);
});
