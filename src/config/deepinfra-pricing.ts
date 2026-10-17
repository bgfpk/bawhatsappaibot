export const DEEPINFRA_PRICING_CONFIG = {
  model: "deepseek-ai/DeepSeek-V4-Flash",
  inputPricePerMillion: 0.09,
  cachedInputPricePerMillion: 0.018,
  outputPricePerMillion: 0.18,
  effectiveDate: "2026-07-12",
  sourceLabel: "DeepInfra Dashboard / Official Pricing",
  estimated: true,
};

export function estimateDeepInfraCost(inputTokens: number, cachedTokens: number, outputTokens: number) {
  // DeepInfra reports prompt_tokens as TOTAL prompt tokens, including cached tokens.
  // So uncached input tokens = promptTokens - cachedTokens
  const uncachedTokens = Math.max(0, (inputTokens || 0) - (cachedTokens || 0));
  const validCachedTokens = Math.max(0, cachedTokens || 0);
  const validOutputTokens = Math.max(0, outputTokens || 0);

  const uncachedCost = (uncachedTokens / 1_000_000) * DEEPINFRA_PRICING_CONFIG.inputPricePerMillion;
  const cachedCost = (validCachedTokens / 1_000_000) * DEEPINFRA_PRICING_CONFIG.cachedInputPricePerMillion;
  const outputCost = (validOutputTokens / 1_000_000) * DEEPINFRA_PRICING_CONFIG.outputPricePerMillion;

  return uncachedCost + cachedCost + outputCost;
}
