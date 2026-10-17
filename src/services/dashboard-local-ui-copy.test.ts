import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const appSource = readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
const instanceCardSource = readFileSync(new URL("../instance-hub/InstanceCard.tsx", import.meta.url), "utf8");

test("dashboard business text fields do not enforce arbitrary user-content character limit caps", () => {
  assert.equal(appSource.includes("AI_PROMPT_MAX_CHARS"), false);
  assert.equal(appSource.includes("AI_LEARNED_MAX_CHARS"), false);
});

test("accounting cache coverage formats large numbers compactly with exact title", () => {
  assert.match(appSource, /const formatCompactCount =/);
  assert.match(appSource, /title=\{Number\(row\.cachedTokens \|\| 0\)\.toLocaleString\(\)\}>\{formatCompactCount\(row\.cachedTokens\)\}/);
  assert.match(appSource, /title=\{Number\(row\.inputTokens \|\| 0\)\.toLocaleString\(\)\}>\{formatCompactCount\(row\.inputTokens\)\}/);
});

test("instance card shows copyable Instance ID", () => {
  assert.match(instanceCardSource, /ID: \{instanceId\.substring\(0, 16\)\}.../);
  assert.match(instanceCardSource, /title="Copy Instance ID"/);
});
