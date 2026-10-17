import { formatAiProviderError } from "./gemini-flash-fallback-service.ts";
import { isTransientAiProviderError } from "./transient-ai-error-service.ts";
import { isAiTimeoutError } from "./ai-timeout-fallback-service.ts";

type RetryDeps = {
  sleep: (ms: number) => Promise<void>;
};

const retryDeps: RetryDeps = {
  sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
};

export type ModelAttemptDecision = {
  retrySameModel: boolean;
  moveToNextModel: boolean;
  reason: string;
};

export function getPerModelAttemptDelayMs(attemptNumber: number) {
  if (attemptNumber <= 1) return 0;
  if (attemptNumber === 2) return 2000;
  return 3000;
}

export function decideModelAttemptRetry(input: {
  error?: any;
  emptyResponse?: boolean;
  attemptNumber: number;
  maxAttemptsPerModel: number;
}) {
  const attemptNumber = Math.max(1, Number(input.attemptNumber || 1));
  const maxAttemptsPerModel = Math.max(1, Number(input.maxAttemptsPerModel || 3));
  const reason = input.emptyResponse
    ? "empty response"
    : formatAiProviderError(input.error);
  const retryable = Boolean(
    input.emptyResponse ||
    isTransientAiProviderError(input.error) ||
    isAiTimeoutError(input.error) ||
    /network|econnreset|socket hang up|fetch failed|temporarily/i.test(String(reason || "")),
  );
  const retrySameModel = retryable && attemptNumber < maxAttemptsPerModel;
  return {
    retrySameModel,
    moveToNextModel: !retrySameModel,
    reason,
  } satisfies ModelAttemptDecision;
}

export async function runModelFallbackSequence<T>(input: {
  models: string[];
  maxAttemptsPerModel?: number;
  attemptRequest: (model: string, context: { modelIndex: number; attemptNumber: number }) => Promise<T>;
  validateResponse?: (response: T, context: { model: string; attemptNumber: number; modelIndex: number }) => { ok: boolean; reason?: string };
  io?: any;
  logger?: Pick<Console, "log" | "warn">;
}) {
  const models = Array.from(new Set((input.models || []).filter(Boolean)));
  const maxAttemptsPerModel = Math.max(1, Number(input.maxAttemptsPerModel || 3));
  let lastError: any = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex];
    for (let attemptNumber = 1; attemptNumber <= maxAttemptsPerModel; attemptNumber++) {
      input.io?.emit?.("system-log", { type: "info", msg: `AI model ${model} attempt ${attemptNumber}/${maxAttemptsPerModel}` });
      input.logger?.log?.(`[AI-Process] AI model ${model} attempt ${attemptNumber}/${maxAttemptsPerModel}`);
      try {
        const response = await input.attemptRequest(model, { modelIndex, attemptNumber });
        const validation = input.validateResponse?.(response, { model, attemptNumber, modelIndex }) || { ok: true };
        if (validation.ok) {
          if (modelIndex > 0) {
            input.io?.emit?.("system-log", { type: "success", msg: `AI replied with fallback model ${model}.` });
          }
          return response;
        }

        const decision = decideModelAttemptRetry({
          emptyResponse: true,
          attemptNumber,
          maxAttemptsPerModel,
          error: validation.reason || `AI returned empty customer output from ${model}`,
        });
        lastError = new Error(validation.reason || `AI returned empty customer output from ${model}`);
        if (decision.retrySameModel) {
          const delayMs = getPerModelAttemptDelayMs(attemptNumber + 1);
          input.io?.emit?.("system-log", {
            type: "warning",
            msg: `AI model ${model} retrying after ${Math.round(delayMs / 1000)}s because ${decision.reason}`,
          });
          input.logger?.warn?.(`[AI-Process] AI model ${model} retrying after ${Math.round(delayMs / 1000)}s because ${decision.reason}`);
          await retryDeps.sleep(delayMs);
          continue;
        }
        break;
      } catch (error: any) {
        lastError = error;
        const decision = decideModelAttemptRetry({
          error,
          attemptNumber,
          maxAttemptsPerModel,
        });
        if (decision.retrySameModel) {
          const delayMs = getPerModelAttemptDelayMs(attemptNumber + 1);
          input.io?.emit?.("system-log", {
            type: "warning",
            msg: `AI model ${model} retrying after ${Math.round(delayMs / 1000)}s because ${decision.reason}`,
          });
          input.logger?.warn?.(`[AI-Process] AI model ${model} retrying after ${Math.round(delayMs / 1000)}s because ${decision.reason}`);
          await retryDeps.sleep(delayMs);
          continue;
        }
        break;
      }
    }

    const nextModel = models[modelIndex + 1];
    if (nextModel) {
      const msg = `Moving to fallback model ${nextModel} after ${maxAttemptsPerModel} failed attempts`;
      input.io?.emit?.("system-log", { type: "warning", msg });
      input.logger?.warn?.(`[AI-Process] ${msg}.`);
    }
  }

  throw lastError;
}

export function __setAiProviderRetryPolicyTestDeps(overrides: Partial<RetryDeps>) {
  Object.assign(retryDeps, overrides || {});
}

export function __resetAiProviderRetryPolicyTestDeps() {
  Object.assign(retryDeps, {
    sleep: (ms: number) => new Promise((resolve) => setTimeout(resolve, ms)),
  });
}
