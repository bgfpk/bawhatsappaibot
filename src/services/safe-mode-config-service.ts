export const SAFE_MODE_ENABLED = true;
export const SAFE_MODE_DISABLE_TTS_OUTPUT = false;
export const SAFE_MODE_DISABLE_STARTUP_UNREPLIED_SWEEP = true;
export const SAFE_MODE_DISABLE_STARTUP_BASELINE_SCAN = true;
export const SAFE_MODE_DURABLE_MEDIA_CONTEXT_CACHE = true;
export const SAFE_MODE_MEDIA_FAILURE_TEXT_FALLBACK = true;
export const SAFE_MODE_MAX_QUALITY_REPAIR_ATTEMPTS = 1;

export function isSafeModeEnabled() {
  return SAFE_MODE_ENABLED === true;
}

export function isSafeModeDisableTtsOutputEnabled() {
  return isSafeModeEnabled() && Boolean(SAFE_MODE_DISABLE_TTS_OUTPUT);
}

export function isSafeModeDisableStartupUnrepliedSweepEnabled() {
  return isSafeModeEnabled() && SAFE_MODE_DISABLE_STARTUP_UNREPLIED_SWEEP === true;
}

export function isSafeModeDisableStartupBaselineScanEnabled() {
  return isSafeModeEnabled() && SAFE_MODE_DISABLE_STARTUP_BASELINE_SCAN === true;
}

export function isSafeModeDurableMediaContextCacheEnabled() {
  return isSafeModeEnabled() && SAFE_MODE_DURABLE_MEDIA_CONTEXT_CACHE === true;
}

export function isSafeModeMediaFailureTextFallbackEnabled() {
  return isSafeModeEnabled() && SAFE_MODE_MEDIA_FAILURE_TEXT_FALLBACK === true;
}

export function getSafeModeMaxQualityRepairAttempts() {
  return Math.max(1, Number(SAFE_MODE_MAX_QUALITY_REPAIR_ATTEMPTS || 1));
}
