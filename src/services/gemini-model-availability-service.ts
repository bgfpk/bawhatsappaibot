import { GoogleGenAI } from "@google/genai";
import * as dbService from "./db-service.ts";
import { getGoogleGenAIClientOptions } from "./gemini-cache-service.ts";

const CHEAP_MODEL_NAME = "gemini-2.5-flash-lite";
const STATUS_KEY = "gemini_cheap_model_availability";

type ModelAvailabilityDeps = {
  createClient: (options: any) => any;
  getClientOptions: typeof getGoogleGenAIClientOptions;
  getSystemConfig: typeof dbService.getSystemConfig;
  setSystemConfig: typeof dbService.setSystemConfig;
  now: () => number;
};

const deps: ModelAvailabilityDeps = {
  createClient: (options) => new GoogleGenAI(options),
  getClientOptions: getGoogleGenAIClientOptions,
  getSystemConfig: dbService.getSystemConfig,
  setSystemConfig: dbService.setSystemConfig,
  now: () => Math.floor(Date.now() / 1000),
};

export function __setGeminiModelAvailabilityTestDeps(overrides: Partial<ModelAvailabilityDeps>) {
  Object.assign(deps, overrides || {});
}

export function __resetGeminiModelAvailabilityTestDeps() {
  Object.assign(deps, {
    createClient: (options: any) => new GoogleGenAI(options),
    getClientOptions: getGoogleGenAIClientOptions,
    getSystemConfig: dbService.getSystemConfig,
    setSystemConfig: dbService.setSystemConfig,
    now: () => Math.floor(Date.now() / 1000),
  });
}

function clean(value: any, limit = 180) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

export async function getCheapGeminiModelAvailabilityStatus() {
  const raw = await deps.getSystemConfig(STATUS_KEY).catch(() => "");
  if (!raw) {
    return {
      cheapModelAvailable: false,
      cheapModelName: CHEAP_MODEL_NAME,
      lastCheckedAt: 0,
      lastErrorSafe: "not_checked",
    };
  }
  try {
    const parsed = JSON.parse(String(raw));
    return {
      cheapModelAvailable: parsed.cheapModelAvailable === true,
      cheapModelName: clean(parsed.cheapModelName) || CHEAP_MODEL_NAME,
      lastCheckedAt: Number(parsed.lastCheckedAt || 0),
      lastErrorSafe: clean(parsed.lastErrorSafe),
    };
  } catch {
    return {
      cheapModelAvailable: false,
      cheapModelName: CHEAP_MODEL_NAME,
      lastCheckedAt: 0,
      lastErrorSafe: "invalid_cached_status",
    };
  }
}

export async function checkCheapGeminiModelAvailability() {
  const options = deps.getClientOptions();
  if (!options) {
    const status = {
      cheapModelAvailable: false,
      cheapModelName: CHEAP_MODEL_NAME,
      lastCheckedAt: deps.now(),
      lastErrorSafe: "platform_gemini_not_configured",
    };
    await deps.setSystemConfig(STATUS_KEY, JSON.stringify(status)).catch(() => {});
    return status;
  }

  try {
    const client = deps.createClient(options);
    await client.models.generateContent({
      model: CHEAP_MODEL_NAME,
      contents: [{ role: "user", parts: [{ text: "Reply with ok." }] }],
      config: { maxOutputTokens: 4 },
    });
    const status = {
      cheapModelAvailable: true,
      cheapModelName: CHEAP_MODEL_NAME,
      lastCheckedAt: deps.now(),
      lastErrorSafe: "",
    };
    await deps.setSystemConfig(STATUS_KEY, JSON.stringify(status));
    return status;
  } catch (error: any) {
    const status = {
      cheapModelAvailable: false,
      cheapModelName: CHEAP_MODEL_NAME,
      lastCheckedAt: deps.now(),
      lastErrorSafe: clean(error?.code || error?.status || error?.message || "model_check_failed"),
    };
    await deps.setSystemConfig(STATUS_KEY, JSON.stringify(status)).catch(() => {});
    return status;
  }
}

export async function markCheapGeminiModelTemporarilyUnavailable(error: any) {
  const status = {
    cheapModelAvailable: false,
    cheapModelName: CHEAP_MODEL_NAME,
    lastCheckedAt: deps.now(),
    lastErrorSafe: clean(error?.code || error?.status || error?.message || "cheap_model_runtime_failed"),
  };
  await deps.setSystemConfig(STATUS_KEY, JSON.stringify(status)).catch(() => {});
  return status;
}
