function clean(value: any) {
  return String(value || "").trim();
}

const LOW_THINKING_PURPOSE_RE = /(summary|manual_learning|learning|extract|classification|order_lead|smart_followup|customer_update|wait_check|nudge|reply|understanding|transcription|vision|image|audio|ocr)/i;

export function buildThinkingConfigForPurpose(purpose: any) {
  if (!LOW_THINKING_PURPOSE_RE.test(clean(purpose))) return {};
  return { thinkingConfig: { thinkingBudget: 0 } };
}

export function withLowThinkingConfig(config: any = {}, purpose?: any) {
  if (config?.thinkingConfig || config?.thinking_config) return config;
  return {
    ...config,
    ...buildThinkingConfigForPurpose(purpose),
  };
}

export function stripThinkingConfig(config: any = {}) {
  const { thinkingConfig, thinking_config, ...rest } = config || {};
  void thinkingConfig;
  void thinking_config;
  return rest;
}

export function isUnsupportedThinkingConfigError(error: any) {
  const text = clean(`${error?.code || ""} ${error?.status || ""} ${error?.message || ""}`).toLowerCase();
  return Boolean(text && /thinking(config|_config| budget)|unknown field|invalid argument|unsupported/i.test(text));
}
