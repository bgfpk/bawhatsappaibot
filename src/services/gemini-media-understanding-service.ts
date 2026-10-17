import { createHash } from "node:crypto";

import { createGeminiClient, type GeminiProviderContext } from "./gemini-provider-service.ts";
import { withLowThinkingConfig, isUnsupportedThinkingConfigError, stripThinkingConfig } from "./ai-generation-config-service.ts";

export const GEMINI_MEDIA_MODEL = "models/gemini-2.5-flash";
const HIGH_THOUGHT_TOKEN_WARNING_THRESHOLD = 120;
const GEMINI_MEDIA_COST_RATES_USD = {
  inputPerMillionTokens: 0.3,
  outputPerMillionTokens: 2.5,
  thoughtPerMillionTokens: 2.5,
} as const;

type MediaPart =
  | { kind: "image"; buffer: Buffer; mimeType: string }
  | { kind: "audio"; buffer: Buffer; mimeType: string };

type GeminiMediaResult = {
  text: string;
  model: string;
  provider: string;
  requestStatus: "success" | "failed";
  raw: any;
  usageMetadata?: any;
  finishReason?: string;
  partial?: boolean;
  estimatedCostUsd?: number;
  dedupeKey?: string;
  thinkingMode?: "off" | "unsupported";
};

const geminiMediaDeps = {
  createClient: createGeminiClient,
  logInfo: (message: string) => console.info(message),
  logWarn: (message: string) => console.warn(message),
};

const inflightGeminiMediaRequests = new Map<string, Promise<GeminiMediaResult>>();
const settledGeminiMediaResults = new Map<string, { result: GeminiMediaResult; timestamp: number }>();
const MEDIA_RESULT_TTL_MS = 5 * 60 * 1000;

export function __setGeminiMediaUnderstandingTestDeps(overrides: Partial<typeof geminiMediaDeps>) {
  Object.assign(geminiMediaDeps, overrides || {});
}

export function __resetGeminiMediaUnderstandingTestDeps() {
  Object.assign(geminiMediaDeps, {
    createClient: createGeminiClient,
    logInfo: (message: string) => console.info(message),
    logWarn: (message: string) => console.warn(message),
  });
}

export function __clearGeminiMediaUnderstandingCacheForTests() {
  inflightGeminiMediaRequests.clear();
  settledGeminiMediaResults.clear();
}

function clean(value: any, max = 12000) {
  return String(value ?? "").trim().slice(0, max);
}

function cleanupExpiredSettledResults() {
  const now = Date.now();
  for (const [key, entry] of settledGeminiMediaResults.entries()) {
    if ((now - entry.timestamp) > MEDIA_RESULT_TTL_MS) {
      settledGeminiMediaResults.delete(key);
    }
  }
}

function hashText(value: any, length = 16) {
  return createHash("sha1").update(clean(value, 8000)).digest("hex").slice(0, length);
}

function hashBuffer(buffer: Buffer, length = 16) {
  return createHash("sha1").update(buffer).digest("hex").slice(0, length);
}

function normalizeUsageMetadata(response: any) {
  return response?.usageMetadata || response?.usage_metadata || {};
}

function estimateGeminiMediaCostUsd(usage: any) {
  const inputTokens = Math.max(0, Number(usage?.promptTokenCount || usage?.prompt_token_count || usage?.totalInputTokenCount || 0));
  const outputTokens = Math.max(0, Number(usage?.candidatesTokenCount || usage?.candidates_token_count || 0));
  const thoughtTokens = Math.max(0, Number(usage?.thoughtsTokenCount || usage?.thoughts_token_count || 0));
  const inputCost = (inputTokens / 1_000_000) * GEMINI_MEDIA_COST_RATES_USD.inputPerMillionTokens;
  const outputThoughtCost = ((outputTokens + thoughtTokens) / 1_000_000) * GEMINI_MEDIA_COST_RATES_USD.outputPerMillionTokens;
  const totalEstimated = Number((inputCost + outputThoughtCost).toFixed(6));
  return {
    inputTokens,
    outputTokens,
    thoughtTokens,
    totalTokens: Math.max(0, Number(usage?.totalTokenCount || usage?.total_token_count || (inputTokens + outputTokens + thoughtTokens))),
    inputCost,
    outputThoughtCost,
    totalEstimated,
  };
}

function logGeminiMediaUsage(input: {
  purpose: string;
  response: any;
  model: string;
  dedupeKey: string;
}) {
  const usage = normalizeUsageMetadata(input.response);
  const estimate = estimateGeminiMediaCostUsd(usage);
  geminiMediaDeps.logInfo(
    `gemini_media_usage purpose=${clean(input.purpose, 80)} inputTokens=${estimate.inputTokens} outputTokens=${estimate.outputTokens} thoughtTokens=${estimate.thoughtTokens} totalTokens=${estimate.totalTokens}`
  );
  geminiMediaDeps.logInfo(
    `gemini_media_cost_estimate purpose=${clean(input.purpose, 80)} model=${clean(input.model, 80)} inputCost=${estimate.inputCost.toFixed(6)} outputThoughtCost=${estimate.outputThoughtCost.toFixed(6)} totalEstimated=${estimate.totalEstimated.toFixed(6)} dedupeKey=${clean(input.dedupeKey, 48)}`
  );
  if (estimate.thoughtTokens >= HIGH_THOUGHT_TOKEN_WARNING_THRESHOLD) {
    geminiMediaDeps.logWarn(
      `gemini_media_cost_guard warning=high_thought_tokens purpose=${clean(input.purpose, 80)} thoughtTokens=${estimate.thoughtTokens}`
    );
  }
  return { usageMetadata: usage, estimatedCostUsd: estimate.totalEstimated };
}

function buildGeminiMediaDedupeKey(input: {
  purpose: string;
  instruction: string;
  media: MediaPart;
  responseMimeType?: string;
  maxOutputTokens?: number;
  providerContext?: GeminiProviderContext;
}) {
  const billingContext = input.providerContext?.billingContext || {};
  const instanceId = clean(input.providerContext?.botId || input.providerContext?.dataOwnerKey || input.providerContext?.accountId || input.providerContext?.userId || "unknown", 60);
  const customerJid = clean(billingContext.customerJid || (input.providerContext as any)?.customerJid || "unknown", 80);
  const messageId = clean(billingContext.messageId || billingContext.eventId || billingContext.requestId || "unknown", 80);
  const mediaHash = hashBuffer(input.media.buffer, 20);
  const configHash = hashText(JSON.stringify({
    mimeType: input.media.mimeType,
    responseMimeType: input.responseMimeType || "application/json",
    maxOutputTokens: Math.max(1, Number(input.maxOutputTokens || 400)),
    instruction: clean(input.instruction, 4000),
  }), 20);
  return `gemini_media:${instanceId}:${customerJid}:${messageId}:${mediaHash}:${clean(input.purpose, 80)}:${configHash}`;
}

export function buildGeminiMediaRequest(input: {
  purpose: string;
  instruction: string;
  media: MediaPart;
  responseMimeType?: string;
  maxOutputTokens?: number;
}) {
  const config = withLowThinkingConfig({
    responseMimeType: input.responseMimeType || "application/json",
    maxOutputTokens: Math.max(1, Number(input.maxOutputTokens || 400)),
  }, input.purpose);

  return {
    model: GEMINI_MEDIA_MODEL,
    contents: [{
      role: "user",
      parts: [
        { text: clean(input.instruction, 4000) },
        {
          inlineData: {
            mimeType: clean(input.media.mimeType || (input.media.kind === "image" ? "image/jpeg" : "audio/ogg"), 120) || (input.media.kind === "image" ? "image/jpeg" : "audio/ogg"),
            data: input.media.buffer.toString("base64"),
          },
        },
      ],
    }],
    config,
  };
}

function extractText(response: any) {
  const direct = clean(typeof response?.text === "function" ? response.text() : response?.text, 20000);
  if (direct) return direct;
  const parts = response?.candidates?.[0]?.content?.parts || [];
  return clean(parts.map((part: any) => clean(part?.text, 8000)).filter(Boolean).join(" "), 20000);
}

export async function generateGeminiMediaUnderstanding(input: {
  purpose: string;
  instruction: string;
  media: MediaPart;
  responseMimeType?: string;
  maxOutputTokens?: number;
  providerContext?: GeminiProviderContext;
}) {
  cleanupExpiredSettledResults();
  const request = buildGeminiMediaRequest(input);
  const dedupeKey = buildGeminiMediaDedupeKey(input);
  const cached = settledGeminiMediaResults.get(dedupeKey)?.result;
  if (cached) {
    geminiMediaDeps.logInfo(`gemini_media_dedupe_hit purpose=${clean(input.purpose, 80)} messageId=${clean(input.providerContext?.billingContext?.messageId || input.providerContext?.billingContext?.eventId || "unknown", 24)}`);
    geminiMediaDeps.logInfo(`gemini_media_duplicate_skipped purpose=${clean(input.purpose, 80)} messageId=${clean(input.providerContext?.billingContext?.messageId || input.providerContext?.billingContext?.eventId || "unknown", 24)}`);
    return { ...cached, dedupeKey };
  }
  const existing = inflightGeminiMediaRequests.get(dedupeKey);
  if (existing) {
    geminiMediaDeps.logInfo(`gemini_media_dedupe_hit purpose=${clean(input.purpose, 80)} messageId=${clean(input.providerContext?.billingContext?.messageId || input.providerContext?.billingContext?.eventId || "unknown", 24)}`);
    geminiMediaDeps.logInfo(`gemini_media_duplicate_skipped purpose=${clean(input.purpose, 80)} messageId=${clean(input.providerContext?.billingContext?.messageId || input.providerContext?.billingContext?.eventId || "unknown", 24)}`);
    return existing;
  }

  const task = (async () => {
    const provider = await geminiMediaDeps.createClient({
      ...(input.providerContext || {}),
      purpose: input.purpose,
    });
    const providerName = provider.provider || "platform_gemini";
    const execute = async (activeRequest: any, thinkingMode: "off" | "unsupported"): Promise<GeminiMediaResult> => {
      geminiMediaDeps.logInfo(
        `gemini_media_config purpose=${clean(input.purpose, 80)} model=gemini-2.5-flash thinking=${thinkingMode} maxOutputTokens=${Number(activeRequest?.config?.maxOutputTokens || 0)}`
      );
      const response = await provider.ai.models.generateContent(activeRequest);
      const finishReason = clean(response?.candidates?.[0]?.finishReason, 40);
      const usage = logGeminiMediaUsage({
        purpose: input.purpose,
        response,
        model: GEMINI_MEDIA_MODEL,
        dedupeKey,
      });
      return {
        text: extractText(response),
        model: GEMINI_MEDIA_MODEL,
        provider: providerName,
        requestStatus: "success",
        raw: response,
        usageMetadata: usage.usageMetadata,
        finishReason,
        partial: finishReason === "MAX_TOKENS",
        estimatedCostUsd: usage.estimatedCostUsd,
        dedupeKey,
        thinkingMode,
      };
    };

    try {
      const result = await execute(request, "off");
      settledGeminiMediaResults.set(dedupeKey, { result, timestamp: Date.now() });
      return result;
    } catch (error: any) {
      if (isUnsupportedThinkingConfigError(error)) {
        geminiMediaDeps.logInfo(`gemini_media_retry_changed_payload reason=unsupported_thinking_config`);
        const retried = {
          ...request,
          config: stripThinkingConfig(request.config),
        };
        const result = await execute(retried, "unsupported");
        settledGeminiMediaResults.set(dedupeKey, { result, timestamp: Date.now() });
        return result;
      }
      const failedResult: GeminiMediaResult = {
        text: "",
        model: GEMINI_MEDIA_MODEL,
        provider: providerName,
        requestStatus: "failed",
        raw: null,
        dedupeKey,
      };
      settledGeminiMediaResults.set(dedupeKey, { result: failedResult, timestamp: Date.now() });
      return failedResult;
    } finally {
      inflightGeminiMediaRequests.delete(dedupeKey);
    }
  })();

  inflightGeminiMediaRequests.set(dedupeKey, task);
  return task;
}
