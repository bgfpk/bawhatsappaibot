import { FALLBACK_FLASH_MODEL, PRIMARY_FLASH_MODEL } from "./ai-cost-control-service.ts";

export function getFlashModelSequence(preferredModel: any) {
  return Array.from(new Set([
    String(preferredModel || PRIMARY_FLASH_MODEL).trim() || PRIMARY_FLASH_MODEL,
    FALLBACK_FLASH_MODEL,
    PRIMARY_FLASH_MODEL,
  ].filter(Boolean)));
}

export function formatAiProviderError(error: any) {
  if (!error) return "unknown error";
  if (typeof error === "string") return error;
  return error?.message || error?.status || error?.code || String(error);
}
