import {
  BACKGROUND_AI_MODEL,
  CHEAP_FLASH_LITE_MODEL,
  CUSTOMER_AI_MODEL,
  PRIMARY_FLASH_MODEL,
} from "./ai-cost-control-service.ts";
import {
  getCheapGeminiModelAvailabilityStatus,
  markCheapGeminiModelTemporarilyUnavailable,
} from "./gemini-model-availability-service.ts";

export type AiModelRoutePurpose =
  | "default_reply"
  | "summary"
  | "learning"
  | "followup"
  | "extraction"
  | "hidden_memory"
  | "classification"
  | "helper";

const SAFE_CHEAP_PURPOSES = new Set<AiModelRoutePurpose>([
  "summary",
  "learning",
  "followup",
  "extraction",
  "hidden_memory",
  "classification",
  "helper",
]);

function envModel(name: string, fallback: string) {
  return String(process.env[name] || fallback).trim() || fallback;
}

export async function resolveAiModelForPurpose(purpose: AiModelRoutePurpose) {
  const defaultReplyModel = envModel("BLACKARROW_DEFAULT_REPLY_MODEL", CUSTOMER_AI_MODEL || PRIMARY_FLASH_MODEL);
  if (!SAFE_CHEAP_PURPOSES.has(purpose)) {
    return { model: defaultReplyModel, route: "default_reply" as const, cheapAvailable: false };
  }

  const cheapModelByPurpose = purpose === "summary"
    ? envModel("BLACKARROW_SUMMARY_MODEL", BACKGROUND_AI_MODEL || CHEAP_FLASH_LITE_MODEL)
    : purpose === "learning"
      ? envModel("BLACKARROW_LEARNING_MODEL", BACKGROUND_AI_MODEL || CHEAP_FLASH_LITE_MODEL)
      : purpose === "followup"
        ? envModel("BLACKARROW_FOLLOWUP_MODEL", BACKGROUND_AI_MODEL || CHEAP_FLASH_LITE_MODEL)
        : purpose === "extraction"
          ? envModel("BLACKARROW_EXTRACTION_MODEL", BACKGROUND_AI_MODEL || CHEAP_FLASH_LITE_MODEL)
          : envModel("BLACKARROW_CHEAP_TASK_MODEL", BACKGROUND_AI_MODEL || CHEAP_FLASH_LITE_MODEL);
  const status = await getCheapGeminiModelAvailabilityStatus().catch(() => null);
  if (status?.cheapModelAvailable) {
    return {
      model: cheapModelByPurpose || status.cheapModelName || CHEAP_FLASH_LITE_MODEL,
      route: "cheap_helper" as const,
      cheapAvailable: true,
    };
  }
  return {
    model: defaultReplyModel,
    route: "cheap_unavailable_fallback" as const,
    cheapAvailable: false,
  };
}

export function isCheapModelUnavailableError(error: any) {
  const text = String(`${error?.code || ""} ${error?.status || ""} ${error?.message || ""}`).toLowerCase();
  return /not found|not_found|permission|permission_denied|forbidden|403|404|unavailable|disabled|rate|quota|resource_exhausted/.test(text);
}

export async function markCheapModelFailed(error: any) {
  await markCheapGeminiModelTemporarilyUnavailable(error).catch(() => {});
}
