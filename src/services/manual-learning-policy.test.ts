import test from "node:test";
import assert from "node:assert/strict";

import { shouldAnalyzeManualReply } from "./manual-learning-policy.ts";

test("manual learning skips short non-reusable admin replies", () => {
  for (const text of ["ok", "yes", "thanks", "price", "send", "done"]) {
    assert.equal(shouldAnalyzeManualReply({ text, kind: "text" }), false, text);
  }
});

test("manual learning runs for reusable policy/training replies", () => {
  assert.equal(shouldAnalyzeManualReply({
    kind: "text",
    text: "Always explain that delivery takes 2 to 3 working days, and never promise same-day delivery unless admin confirms stock first.",
  }), true);
});

test("manual learning respects cooldown for ordinary long replies", () => {
  assert.equal(shouldAnalyzeManualReply({
    kind: "text",
    text: "Customer asked a detailed question about setup and I explained the account process in a normal manual reply.",
    profile: { manualLearningAnalyzedAt: 1000 },
    nowSeconds: 1005,
  }), false);
});
