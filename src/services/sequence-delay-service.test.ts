import test from "node:test";
import assert from "node:assert/strict";

import {
  getRandomSequenceDelayMs,
  SEQUENCE_DELAY_MAX_MS,
  SEQUENCE_DELAY_MIN_MS,
} from "./sequence-delay-service.ts";

test("sequence delay helper stays within the safe fast pacing range", () => {
  const originalRandom = Math.random;
  try {
    Math.random = () => 0;
    assert.equal(getRandomSequenceDelayMs(), SEQUENCE_DELAY_MIN_MS);

    Math.random = () => 0.999999;
    const nearMax = getRandomSequenceDelayMs();
    assert.ok(nearMax >= SEQUENCE_DELAY_MIN_MS);
    assert.ok(nearMax <= SEQUENCE_DELAY_MAX_MS);
    assert.ok(SEQUENCE_DELAY_MAX_MS <= 350);
  } finally {
    Math.random = originalRandom;
  }
});
