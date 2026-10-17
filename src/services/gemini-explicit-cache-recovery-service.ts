import {
  activateExplicitCacheCooldown,
  isExplicitCacheInvalidArgumentError,
} from "./gemini-explicit-cache-cooldown-service.ts";

type RetryInput<T> = {
  botId: string;
  model: string;
  useExplicitCache: boolean;
  execute: (useExplicitCache: boolean) => Promise<T>;
  io?: any;
  logger?: Pick<Console, "warn">;
};

export async function runWithExplicitCacheRecovery<T>(input: RetryInput<T>) {
  try {
    return await input.execute(input.useExplicitCache);
  } catch (error: any) {
    if (!input.useExplicitCache || !isExplicitCacheInvalidArgumentError(error)) {
      throw error;
    }

    activateExplicitCacheCooldown({ botId: input.botId, model: input.model });
    const msg = "Explicit cache failed, retrying normal full prompt";
    input.logger?.warn?.(`[AI-Process] ${msg}.`);
    input.io?.emit?.("system-log", { type: "warning", msg });
    return input.execute(false);
  }
}
