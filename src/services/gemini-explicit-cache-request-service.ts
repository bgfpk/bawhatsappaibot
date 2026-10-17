import { buildExplicitCacheRequestConfig } from "./gemini-explicit-cache-service.ts";

function trimBlock(value: any) {
  return String(value || "").trim();
}

export function buildExplicitCacheDynamicContextContent(dynamicContext: string) {
  const clean = trimBlock(dynamicContext);
  if (!clean) return null;
  return {
    role: "user",
    parts: [{
      text: [
        "Runtime customer/business context for this reply.",
        "Follow this together with the cached system instruction and tool policy.",
        "",
        clean,
      ].join("\n"),
    }],
  };
}

export function buildCustomerBotModelRequest(input: {
  modelName: string;
  primaryModel: string;
  contents: any[];
  systemInstruction: string;
  dynamicSystemInstruction: string;
  tools?: any;
  toolConfig?: any;
  cachedContentName?: string;
  maxOutputTokens?: number;
  useExplicitCache?: boolean;
}) {
  const shouldUseExplicitCache = Boolean(
    input.useExplicitCache &&
    input.cachedContentName &&
    input.modelName === input.primaryModel,
  );
  const runtimeContextContent = shouldUseExplicitCache
    ? buildExplicitCacheDynamicContextContent(input.dynamicSystemInstruction)
    : null;

  return {
    contents: runtimeContextContent ? [runtimeContextContent, ...(input.contents || [])] : (input.contents || []),
    config: buildExplicitCacheRequestConfig({
      systemInstruction: shouldUseExplicitCache ? "" : input.systemInstruction,
      tools: input.tools,
      toolConfig: input.toolConfig,
      cachedContentName: shouldUseExplicitCache ? input.cachedContentName : "",
      baseConfig: typeof input.maxOutputTokens === "number"
        ? { maxOutputTokens: input.maxOutputTokens }
        : {},
    }),
    usedExplicitCache: shouldUseExplicitCache,
  };
}
