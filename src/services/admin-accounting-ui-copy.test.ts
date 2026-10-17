import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("admin accounting UI separates cash revenue, usage consumption, and selected-range labels", () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), "src", "app", "ProtectedDashboardApplication.tsx"), "utf8");

  assert.match(appSource, /Platform Accounting/);
  assert.match(appSource, /Financial Summary/);
  assert.match(appSource, /Selected-range rows/);
  assert.doesNotMatch(appSource, />Revenue By Source</);
  assert.doesNotMatch(appSource, /\["Today gross revenue"/);
});

test("admin accounting UI explains manual legacy active accounts", () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), "src", "app", "ProtectedDashboardApplication.tsx"), "utf8");

  assert.match(appSource, /Manual\/legacy active accounts have access but no linked paid payment record/);
});

test("admin accounting UI explains provider cost is not one-to-one wallet revenue", () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), "src", "app", "ProtectedDashboardApplication.tsx"), "utf8");

  assert.match(appSource, /Provider AI\/Gemini cost is imported from Google Cloud/);
  assert.match(appSource, /failed or skipped no-send attempts/);
});
