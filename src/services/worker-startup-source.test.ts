import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

test("worker loads latest database config on boot", () => {
  const source = readFileSync(resolve(root, "bot-worker.ts"), "utf8");
  assert.match(source, /hydrateBotConfigFromDatabase/);
  assert.match(source, /await hydrateBotConfigFromDatabase\(\)/);
});

test("safe mode gates startup unreplied sweep and keeps lazy baseline logging concise", () => {
  const source = readFileSync(resolve(root, "bot-worker.ts"), "utf8");
  assert.match(source, /startup_unreplied_sweep_skipped_safe_mode=true/);
  assert.match(source, /!isSafeModeDisableStartupUnrepliedSweepEnabled\(\)\)\s*\{\s*setInterval\(checkUnrepliedMessages, MISSED_MESSAGE_CHECK_INTERVAL_MS\)/s);
  assert.match(source, /message_batch_baseline_lazy_started/);
  assert.match(source, /message_batch_baseline_lazy_applied/);
  assert.match(source, /message_batch_baseline_lazy_skipped/);
});

test("server starts active linked worker restore without dashboard socket", () => {
  const source = readFileSync(resolve(root, "server.ts"), "utf8");
  assert.match(source, /startActiveLinkedWorkerWatchdog\(\)/);
  assert.match(source, /startup_restore/);
  assert.match(source, /watchdog_restore/);
});
