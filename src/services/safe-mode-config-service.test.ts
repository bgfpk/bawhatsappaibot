import test from "node:test";
import assert from "node:assert/strict";

import {
  SAFE_MODE_ENABLED,
  SAFE_MODE_DISABLE_TTS_OUTPUT,
  SAFE_MODE_DISABLE_STARTUP_UNREPLIED_SWEEP,
  SAFE_MODE_DISABLE_STARTUP_BASELINE_SCAN,
  SAFE_MODE_DURABLE_MEDIA_CONTEXT_CACHE,
  SAFE_MODE_MEDIA_FAILURE_TEXT_FALLBACK,
  getSafeModeMaxQualityRepairAttempts,
  isSafeModeDisableStartupBaselineScanEnabled,
  isSafeModeDisableStartupUnrepliedSweepEnabled,
  isSafeModeDisableTtsOutputEnabled,
  isSafeModeDurableMediaContextCacheEnabled,
  isSafeModeEnabled,
  isSafeModeMediaFailureTextFallbackEnabled,
} from "./safe-mode-config-service.ts";

test("Safe Mode flags are enabled in code without relying on env", () => {
  assert.equal(SAFE_MODE_ENABLED, true);
  assert.equal(SAFE_MODE_DISABLE_TTS_OUTPUT, false);
  assert.equal(SAFE_MODE_DISABLE_STARTUP_UNREPLIED_SWEEP, true);
  assert.equal(SAFE_MODE_DISABLE_STARTUP_BASELINE_SCAN, true);
  assert.equal(SAFE_MODE_DURABLE_MEDIA_CONTEXT_CACHE, true);
  assert.equal(SAFE_MODE_MEDIA_FAILURE_TEXT_FALLBACK, true);
});

test("Safe Mode helper accessors expose the expected gates", () => {
  assert.equal(isSafeModeEnabled(), true);
  assert.equal(isSafeModeDisableTtsOutputEnabled(), false);
  assert.equal(isSafeModeDisableStartupUnrepliedSweepEnabled(), true);
  assert.equal(isSafeModeDisableStartupBaselineScanEnabled(), true);
  assert.equal(isSafeModeDurableMediaContextCacheEnabled(), true);
  assert.equal(isSafeModeMediaFailureTextFallbackEnabled(), true);
  assert.equal(getSafeModeMaxQualityRepairAttempts(), 1);
});
