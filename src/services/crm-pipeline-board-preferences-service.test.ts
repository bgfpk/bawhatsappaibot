import test from "node:test";
import assert from "node:assert/strict";
import {
  filterCrmPipelineStages,
  normalizeCrmPipelineBoardPreferences,
  resetCrmPipelineBoardPreferences,
  sortCrmPipelineLeadsByActivity,
} from "./crm-pipeline-board-preferences-service.ts";

test("pipeline preferences filter hidden stages and preserve stage order", () => {
  const columns = [{ id: "lost" }, { id: "new" }, { id: "payment" }, { id: "quotation" }];
  const visible = filterCrmPipelineStages(columns, normalizeCrmPipelineBoardPreferences({ visibleStages: ["payment", "new"] }));
  assert.deepEqual(visible.map((column) => column.id), ["new", "payment"]);
});

test("pipeline column width is clamped to usable bounds", () => {
  assert.equal(normalizeCrmPipelineBoardPreferences({ columnWidth: 100 }).columnWidth, 220);
  assert.equal(normalizeCrmPipelineBoardPreferences({ columnWidth: 999 }).columnWidth, 380);
  assert.equal(normalizeCrmPipelineBoardPreferences({ columnWidth: 300 }).columnWidth, 300);
});

test("reset preferences shows every default pipeline stage", () => {
  assert.deepEqual(resetCrmPipelineBoardPreferences().visibleStages, ["new", "contacted", "quotation", "negotiation", "payment", "won", "lost"]);
});

test("pipeline cards sort by latest real activity first", () => {
  const rows = sortCrmPipelineLeadsByActivity([
    { id: "old", latestActivityAt: 10 },
    { id: "new", latestActivityAt: 30 },
    { id: "fallback", latestActivityAt: 0, updatedAt: 20 },
  ]);
  assert.deepEqual(rows.map((row: any) => row.id), ["new", "old", "fallback"]);
});
