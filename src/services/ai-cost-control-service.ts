import { sentenceSafeTruncate } from "./summary-text-utils-service.ts";

export const PRIMARY_FLASH_MODEL = "gemini-2.5-flash";
export const CHEAP_FLASH_LITE_MODEL = "gemini-2.5-flash-lite";
export const FALLBACK_FLASH_MODEL = "gemini-3-flash-preview";
export const LOCKED_FLASH_MODEL = PRIMARY_FLASH_MODEL;
export const DEFAULT_TEXT_PROVIDER = process.env.BLACKARROW_TEXT_PROVIDER || "deepinfra";
export const CUSTOMER_AI_MODEL = process.env.BLACKARROW_DEFAULT_REPLY_MODEL || PRIMARY_FLASH_MODEL;
export const BACKGROUND_AI_MODEL = process.env.BLACKARROW_CHEAP_TASK_MODEL || CHEAP_FLASH_LITE_MODEL;

export const CUSTOMER_REPLY_MAX_OUTPUT_TOKENS = Math.max(700, Number(process.env.GEMINI_CUSTOMER_REPLY_MAX_OUTPUT_TOKENS || 900));
export const TOOL_FOLLOWUP_MAX_OUTPUT_TOKENS = Math.max(500, Number(process.env.GEMINI_TOOL_FOLLOWUP_MAX_OUTPUT_TOKENS || 700));
export const CUSTOMER_AI_TIMEOUT_MS = Math.max(15000, Number(process.env.GEMINI_CUSTOMER_TIMEOUT_MS || 35000));
export const CUSTOMER_TIMEOUT_FALLBACK_MS = Math.max(10000, Number(process.env.GEMINI_CUSTOMER_FALLBACK_TIMEOUT_MS || 18000));
export const CUSTOMER_TIMEOUT_FALLBACK_MODEL = FALLBACK_FLASH_MODEL;
export const CUSTOMER_HISTORY_LIMIT = Math.max(6, Number(process.env.GEMINI_CUSTOMER_HISTORY_LIMIT || 8));
export const CUSTOMER_DB_HISTORY_LIMIT = Math.max(4, Number(process.env.GEMINI_CUSTOMER_DB_HISTORY_LIMIT || 8));
export const SUMMARY_MIN_NEW_MESSAGES = Math.max(1, Number(process.env.GEMINI_SUMMARY_MIN_NEW_MESSAGES || 2));
export const SUMMARY_COOLDOWN_SECONDS = Math.max(60, Number(process.env.GEMINI_SUMMARY_COOLDOWN_SECONDS || 2 * 60));
export const MANUAL_LEARNING_COOLDOWN_SECONDS = Math.max(300, Number(process.env.GEMINI_MANUAL_LEARNING_COOLDOWN_SECONDS || 30 * 60));

export function compactAiText(value: any, limit = 1200) {
  return sentenceSafeTruncate(String(value || "").replace(/\s+/g, " ").trim(), limit);
}
