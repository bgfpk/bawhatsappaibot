import { logGeminiCacheTelemetry } from "./gemini-cache-service.ts";
import { withTimeout } from "./async-timeout.ts";
import { cleanTextForTts } from "./whatsapp-ai-response-style-service.ts";

type VoiceSelectionInput = { selectedVoice: string; effectiveGender: string };
type VoicePromptInput = { text: string; userConfig: any; effectiveGender: string };
type TtsRequestInput = {
  input: string;
  model: string;
  voice: string;
};
type TtsFetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

type TtsAttempt = {
  model: string;
  voice: string;
};

const TTS_RUNTIME_FAILURE_TTL_MS = 30 * 60 * 1000;
let verifiedTtsAttempt: TtsAttempt | null = null;
const failedTtsAttempts = new Map<string, number>();
const SUPPORTED_TTS_MODELS = [
  "gemini-3.1-flash-tts-preview",
  "gemini-2.5-flash-preview-tts",
] as const;
const GEMINI_INTERACTIONS_REST_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const GEMINI_GENERATE_CONTENT_REST_URL_PREFIX = "https://generativelanguage.googleapis.com/v1beta/models";
const MIN_TTS_AUDIO_BYTES = 8;
const SUPPORTED_TTS_VOICES = new Set([
  "Achird",
  "Algenib",
  "Algieba",
  "Aoede",
  "Autonoe",
  "Callirrhoe",
  "Charon",
  "Despina",
  "Enceladus",
  "Erinome",
  "Fenrir",
  "Iapetus",
  "Kore",
  "Laomedeia",
  "Leda",
  "Orus",
  "Puck",
  "Pulcherrima",
  "Rasalgethi",
  "Sadaltager",
  "Schedar",
  "Sulafat",
  "Vindemiatrix",
  "Zephyr",
]);

function getErrorText(error: any) {
  if (!error) return "";
  if (typeof error === "string") return error;
  if (error.message) return String(error.message);
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

function isRetryableTtsError(error: any) {
  const text = getErrorText(error).toLowerCase();
  return text.includes("internal") ||
    text.includes('"code":500') ||
    text.includes(" 500") ||
    text.includes("503") ||
    text.includes("429") ||
    text.includes("unavailable") ||
    text.includes("resource_exhausted");
}

function shouldTryNextTtsAttempt(error: any) {
  const text = getErrorText(error).toLowerCase();
  if (text.includes("api key") || text.includes("unauthorized") || text.includes("permission_denied")) {
    return false;
  }
  return isRetryableTtsError(error) ||
    text.includes("no audio") ||
    text.includes("no_audio") ||
    text.includes("returned no audio") ||
    text.includes("returned_no_audio") ||
    text.includes("invalid") ||
    text.includes('"code":400') ||
    text.includes("voice");
}

function sanitizeReasonToken(value: any, fallback: string) {
  const token = String(value || "")
    .trim()
    .replace(/[^a-zA-Z0-9._:-]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 120);
  return token || fallback;
}

function getSafeVoice(input: VoiceSelectionInput) {
  const selected = String(input.selectedVoice || "").trim();
  if (SUPPORTED_TTS_VOICES.has(selected)) return selected;
  return input.effectiveGender === "female" ? "Kore" : "Charon";
}

function buildAttemptKey(input: TtsAttempt) {
  return `${input.model}:${input.voice}`;
}

function markAttemptVerified(input: TtsAttempt) {
  verifiedTtsAttempt = input;
  failedTtsAttempts.delete(buildAttemptKey(input));
}

function markAttemptFailed(input: TtsAttempt) {
  failedTtsAttempts.set(buildAttemptKey(input), Date.now() + TTS_RUNTIME_FAILURE_TTL_MS);
}

function hasRecentAttemptFailure(input: TtsAttempt) {
  const expiresAt = Number(failedTtsAttempts.get(buildAttemptKey(input)) || 0);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    failedTtsAttempts.delete(buildAttemptKey(input));
    return false;
  }
  return true;
}

export function getSafeTtsFailureReason(error: any, fallback = "tts_failed") {
  return sanitizeReasonToken(
    error?.code ||
      error?.reason ||
      error?.status ||
      error?.message ||
      error?.name ||
      getErrorText(error),
    fallback,
  );
}

export function buildTtsPrompt(input: VoicePromptInput) {
  return cleanTextForTts(String(input.text || "").trim());
}

function buildAttempts(input: VoiceSelectionInput) {
  const selectedVoice = String(input.selectedVoice || "").trim();
  const firstVoice = SUPPORTED_TTS_VOICES.has(selectedVoice) ? selectedVoice : getSafeVoice(input);
  const preferredFallbackVoices = firstVoice === "Kore"
    ? ["Kore", "Puck", "Charon"]
    : [firstVoice, "Kore", "Puck", "Charon"];
  const fallbackVoice = preferredFallbackVoices.find((voice) => voice !== firstVoice) || getSafeVoice(input);
  const rawAttempts = [
    { model: SUPPORTED_TTS_MODELS[0], voice: firstVoice },
    { model: SUPPORTED_TTS_MODELS[1], voice: fallbackVoice },
  ].filter(Boolean) as TtsAttempt[];

  const seen = new Set<string>();
  return rawAttempts.filter(attempt => {
    const key = `${attempt.model}:${attempt.voice}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return !hasRecentAttemptFailure(attempt);
  });
}

export function buildGeminiTtsRequest(input: TtsRequestInput) {
  return {
    model: input.model,
    input: input.input,
    response_format: { type: "audio" },
    response_modalities: ["audio"],
    generation_config: {
      speech_config: [{ voice: input.voice }],
    },
  };
}

export function buildGeminiGenerateContentTtsRequest(input: TtsRequestInput) {
  return {
    contents: [
      {
        parts: [
          {
            text: input.input,
          },
        ],
      },
    ],
    generationConfig: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: {
            voiceName: input.voice,
          },
        },
      },
    },
  };
}

function isProbablyBase64(value: string) {
  const normalized = value.replace(/\s+/g, "");
  return Boolean(
    normalized
    && normalized.length % 4 === 0
    && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized)
  );
}

function decodeAudioCandidate(data: any, mimeType: any) {
  const normalizedData = typeof data === "string" ? data.replace(/\s+/g, "").trim() : "";
  if (!normalizedData || !isProbablyBase64(normalizedData)) return null;
  let buffer: Buffer;
  try {
    buffer = Buffer.from(normalizedData, "base64");
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length < MIN_TTS_AUDIO_BYTES) return null;
  return {
    mimeType: String(mimeType || "audio/unknown").trim() || "audio/unknown",
    data: normalizedData,
    buffer,
    bytes: buffer.length,
  };
}

function pushAudioCandidate(
  candidates: Array<{ data: string; mimeType: string }>,
  data: any,
  mimeType: any,
) {
  const normalizedData = typeof data === "string" ? data.replace(/\s+/g, "").trim() : "";
  if (!normalizedData) return;
  candidates.push({
    data: normalizedData,
    mimeType: String(mimeType || "audio/unknown").trim() || "audio/unknown",
  });
}

function collectGeminiTtsAudioCandidates(response: any) {
  const candidates: Array<{ data: string; mimeType: string }> = [];
  pushAudioCandidate(
    candidates,
    response?.output_audio?.data,
    response?.output_audio?.mime_type || response?.output_audio?.mimeType,
  );
  pushAudioCandidate(
    candidates,
    response?.outputAudio?.data,
    response?.outputAudio?.mime_type || response?.outputAudio?.mimeType,
  );
  if (Array.isArray(response?.output_audio)) {
    for (const item of response.output_audio) {
      pushAudioCandidate(candidates, item?.data, item?.mime_type || item?.mimeType);
    }
  }
  const outputs = Array.isArray(response?.outputs) ? response.outputs : [];
  for (const output of outputs) {
    pushAudioCandidate(
      candidates,
      output?.output_audio?.data,
      output?.output_audio?.mime_type || output?.output_audio?.mimeType,
    );
    pushAudioCandidate(
      candidates,
      output?.audio?.data,
      output?.audio?.mime_type || output?.audio?.mimeType,
    );
    if (String(output?.type || "").toLowerCase() === "audio") {
      pushAudioCandidate(candidates, output?.data, output?.mime_type || output?.mimeType);
    }
  }
  const steps = Array.isArray(response?.steps) ? response.steps : [];
  for (const step of steps) {
    pushAudioCandidate(
      candidates,
      step?.output_audio?.data,
      step?.output_audio?.mime_type || step?.output_audio?.mimeType,
    );
    pushAudioCandidate(
      candidates,
      step?.audio?.data,
      step?.audio?.mime_type || step?.audio?.mimeType,
    );
    pushAudioCandidate(
      candidates,
      step?.model_output?.output_audio?.data,
      step?.model_output?.output_audio?.mime_type || step?.model_output?.output_audio?.mimeType,
    );
  }
  pushAudioCandidate(
    candidates,
    response?.model_output?.output_audio?.data,
    response?.model_output?.output_audio?.mime_type || response?.model_output?.output_audio?.mimeType,
  );
  pushAudioCandidate(
    candidates,
    response?.modelOutput?.outputAudio?.data,
    response?.modelOutput?.outputAudio?.mime_type || response?.modelOutput?.outputAudio?.mimeType,
  );
  const responseCandidates = Array.isArray(response?.candidates) ? response.candidates : [];
  for (const candidate of responseCandidates) {
    const parts = Array.isArray(candidate?.content?.parts) ? candidate.content.parts : [];
    for (const part of parts) {
      pushAudioCandidate(
        candidates,
        part?.inlineData?.data,
        part?.inlineData?.mimeType || part?.inlineData?.mime_type,
      );
      pushAudioCandidate(
        candidates,
        part?.inline_data?.data,
        part?.inline_data?.mimeType || part?.inline_data?.mime_type,
      );
    }
  }
  return candidates;
}

function emitTtsResponseShapeLogs(input: {
  io?: any;
  prefix: string;
  status: number;
  response: any;
}) {
  const keys = Object.keys(input.response || {});
  const candidates = collectGeminiTtsAudioCandidates(input.response);
  const audio = extractGeminiTtsInlineAudio(input.response);
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `${input.prefix}_status status=${input.status}`,
  });
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `${input.prefix}_response_shape keys=${keys.length ? keys.join(",") : "none"}`,
  });
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `${input.prefix}_output_audio_present=${Boolean(input.response?.output_audio || input.response?.outputAudio)}`,
  });
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `${input.prefix}_steps_count=${Array.isArray(input.response?.steps) ? input.response.steps.length : 0}`,
  });
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `${input.prefix}_audio_candidates=${candidates.length}`,
  });
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `${input.prefix}_audio_bytes=${Number(audio?.bytes || 0)}`,
  });
}

function sanitizeGeminiTtsError(error: any, fallback = "tts_request_failed") {
  const reason = getSafeTtsFailureReason(error, fallback);
  const sanitized = new Error(reason);
  (sanitized as any).code = reason;
  return sanitized;
}

async function callGeminiTtsViaRest(input: {
  apiKey: string;
  request: ReturnType<typeof buildGeminiTtsRequest>;
  io?: any;
  fetchFn?: TtsFetchLike;
}) {
  const fetchFn = input.fetchFn || (globalThis.fetch as TtsFetchLike | undefined);
  if (typeof fetchFn !== "function") {
    const error: any = new Error("tts_rest_fetch_unavailable");
    error.code = "tts_rest_fetch_unavailable";
    throw error;
  }
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `tts_rest_interactions_request_started model=${input.request.model} voice=${String(input.request.generation_config?.speech_config?.[0]?.voice || "")}`,
  });
  const response = await fetchFn(GEMINI_INTERACTIONS_REST_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": input.apiKey,
    },
    body: JSON.stringify(input.request),
  });
  const responseText = await response.text();
  let parsed: any = {};
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = {};
  }
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `tts_rest_interactions_status status=${response.status}`,
  });
  if (!response.ok) {
    const safeReason = sanitizeReasonToken(
      parsed?.error?.status
        || parsed?.error?.message
        || parsed?.error?.code
        || `tts_rest_http_${response.status}`,
      `tts_rest_http_${response.status}`,
    );
    input.io?.emit?.("system-log", {
      type: "warning",
      msg: `tts_rest_interactions_http_failed status=${response.status} reason=${safeReason}`,
    });
    const error: any = new Error(
      safeReason
    );
    error.code = sanitizeReasonToken(parsed?.error?.status || `tts_rest_http_${response.status}`, `tts_rest_http_${response.status}`);
    throw error;
  }
  const audio = extractGeminiTtsInlineAudio(parsed);
  if (!audio?.bytes) {
    emitTtsResponseShapeLogs({
      io: input.io,
      prefix: "tts_rest_interactions",
      status: response.status,
      response: parsed,
    });
  }
  input.io?.emit?.("system-log", {
    type: audio?.bytes ? "success" : "warning",
    msg: `tts_rest_interactions_audio_received bytes=${Number(audio?.bytes || 0)}`,
  });
  return parsed;
}

export function extractGeminiTtsInlineAudio(response: any) {
  const candidates = collectGeminiTtsAudioCandidates(response);
  for (const candidate of candidates) {
    const audio = decodeAudioCandidate(candidate.data, candidate.mimeType);
    if (audio) {
      return audio;
    }
  }
  return null;
}

export function shouldConvertGeminiTtsAudioForWhatsApp(mimeType: any) {
  const value = String(mimeType || "").toLowerCase();
  if (!value) return true;
  if (value.includes("audio/ogg")) return false;
  return true;
}

function hasAudioData(response: any) {
  return Boolean(extractGeminiTtsInlineAudio(response)?.data);
}

export function validateGeminiTtsInlineAudioResponse(response: any) {
  const audio = extractGeminiTtsInlineAudio(response);
  if (!audio || audio.bytes <= 0) {
    return { success: false, bytes: 0, mime: "audio/unknown", reason: "tts_audio_missing" };
  }
  return {
    success: true,
    bytes: audio.bytes,
    mime: String(audio.mimeType || "audio/unknown"),
    reason: "",
  };
}

export function getVerifiedGeminiTtsRuntimeAttempt() {
  return verifiedTtsAttempt;
}

export function resetGeminiTtsRuntimeValidationState() {
  verifiedTtsAttempt = null;
  failedTtsAttempts.clear();
}

async function callGeminiTtsViaGenerateContentRest(input: {
  apiKey: string;
  request: ReturnType<typeof buildGeminiGenerateContentTtsRequest>;
  model: string;
  voice: string;
  io?: any;
  fetchFn?: TtsFetchLike;
}) {
  const fetchFn = input.fetchFn || (globalThis.fetch as TtsFetchLike | undefined);
  if (typeof fetchFn !== "function") {
    const error: any = new Error("tts_rest_fetch_unavailable");
    error.code = "tts_rest_fetch_unavailable";
    throw error;
  }
  input.io?.emit?.("system-log", {
    type: "info",
    msg: `tts_generate_content_request_started model=${input.model} voice=${input.voice}`,
  });
  const response = await fetchFn(
    `${GEMINI_GENERATE_CONTENT_REST_URL_PREFIX}/${encodeURIComponent(input.model)}:generateContent`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": input.apiKey,
      },
      body: JSON.stringify(input.request),
    },
  );
  const responseText = await response.text();
  let parsed: any = {};
  try {
    parsed = responseText ? JSON.parse(responseText) : {};
  } catch {
    parsed = {};
  }
  if (!response.ok) {
    const safeReason = sanitizeReasonToken(
      parsed?.error?.status
        || parsed?.error?.message
        || parsed?.error?.code
        || `tts_generate_content_http_${response.status}`,
      `tts_generate_content_http_${response.status}`,
    );
    input.io?.emit?.("system-log", {
      type: "warning",
      msg: `tts_generate_content_http_failed status=${response.status} reason=${safeReason}`,
    });
    const error: any = new Error(safeReason);
    error.code = safeReason;
    throw error;
  }
  const audio = extractGeminiTtsInlineAudio(parsed);
  input.io?.emit?.("system-log", {
    type: audio?.bytes ? "success" : "warning",
    msg: `tts_generate_content_audio_received bytes=${Number(audio?.bytes || 0)}`,
  });
  return parsed;
}

export async function generateTtsContentWithRetry(input: {
  localGenAI: any;
  text: string;
  userConfig: any;
  effectiveGender: string;
  selectedVoice: string;
  geminiApiKey?: string;
  fetchFn?: TtsFetchLike;
  io?: any;
}) {
  let lastError: any = null;
  const trimmedText = String(input.text || "").trim();
  if (!trimmedText) {
    const error: any = new Error("tts_empty_final_text");
    error.code = "tts_empty_final_text";
    throw error;
  }
  const prompt = buildTtsPrompt({ ...input, text: trimmedText });
  const attempts = buildAttempts(input);
  if (attempts.length === 0) {
    const error: any = new Error("no_verified_voice");
    error.code = "no_verified_voice";
    input.io?.emit?.("system-log", { type: "warning", msg: "tts_voice_runtime_disabled reason=no_verified_voice" });
    throw error;
  }

  const apiKey = String(input.geminiApiKey || "").trim();
  for (const [index, attempt] of attempts.entries()) {
    input.io?.emit?.("system-log", {
      type: "info",
      msg: `tts_model_voice_attempt model=${attempt.model} voice=${attempt.voice}`,
    });
    input.io?.emit?.("system-log", {
      type: "info",
      msg: `tts_voice_validation_started model=${attempt.model} voice=${attempt.voice}`,
    });
    try {
      const request = buildGeminiTtsRequest({
        input: prompt,
        model: attempt.model,
        voice: attempt.voice,
      });
      const useSdkInteractions = Boolean(
        input.localGenAI?.interactions
        && typeof input.localGenAI.interactions.create === "function"
      );
      const response = await withTimeout<any>(
        useSdkInteractions
          ? input.localGenAI.interactions.create(request)
          : (async () => {
              input.io?.emit?.("system-log", { type: "info", msg: "tts_interactions_sdk_unavailable_using_rest=true" });
              if (!apiKey) {
                const error: any = new Error("tts_rest_api_key_unavailable");
                error.code = "tts_rest_api_key_unavailable";
                throw error;
              }
              return callGeminiTtsViaRest({
                apiKey,
                request,
                io: input.io,
                fetchFn: input.fetchFn,
              });
            })(),
        45000,
        "TTS provider timed out after 45s"
      );
      const validation = validateGeminiTtsInlineAudioResponse(response);
      input.io?.emit?.("system-log", {
        type: validation.success ? "success" : "warning",
        msg: `tts_voice_validation_result success=${validation.success} bytes=${validation.bytes} mime=${validation.mime} reason=${validation.reason || "none"}`,
      });
      if (!validation.success || !hasAudioData(response)) {
        throw new Error(`TTS returned no audio for ${attempt.model}/${attempt.voice}`);
      }
      const audio = extractGeminiTtsInlineAudio(response);
      markAttemptVerified(attempt);
      input.io?.emit?.("system-log", {
        type: "success",
        msg: `tts_model_voice_success model=${attempt.model} voice=${attempt.voice} bytes=${audio?.bytes || 0} mime=${String(audio?.mimeType || "audio/unknown")}`,
      });
      logGeminiCacheTelemetry(response, input.io, "voice-tts");
      return response;
    } catch (error: any) {
      lastError = sanitizeGeminiTtsError(error, "tts_request_failed");
      const safeReason = getSafeTtsFailureReason(error, "tts_request_failed");
      markAttemptFailed(attempt);
      input.io?.emit?.("system-log", {
        type: "warning",
        msg: `tts_model_voice_failed model=${attempt.model} voice=${attempt.voice} reason=${safeReason}`,
      });
      if (index >= attempts.length - 1 || !shouldTryNextTtsAttempt(error)) break;
      const next = attempts[index + 1];
      input.io?.emit?.("system-log", {
        type: "warning",
        msg: `tts_model_voice_fallback_attempt model=${next.model} voice=${next.voice}`,
      });
    }
  }

  if (apiKey && lastError && shouldTryNextTtsAttempt(lastError)) {
    const finalVoice = attempts.find((attempt) => attempt.voice === "Kore")?.voice || "Kore";
    const finalModel = SUPPORTED_TTS_MODELS[1];
    input.io?.emit?.("system-log", {
      type: "warning",
      msg: `tts_generate_content_fallback_attempt model=${finalModel} voice=${finalVoice}`,
    });
    try {
      const request = buildGeminiGenerateContentTtsRequest({
        input: prompt,
        model: finalModel,
        voice: finalVoice,
      });
      const response = await withTimeout<any>(
        callGeminiTtsViaGenerateContentRest({
          apiKey,
          request,
          model: finalModel,
          voice: finalVoice,
          io: input.io,
          fetchFn: input.fetchFn,
        }),
        45000,
        "TTS provider timed out after 45s",
      );
      const validation = validateGeminiTtsInlineAudioResponse(response);
      input.io?.emit?.("system-log", {
        type: validation.success ? "success" : "warning",
        msg: `tts_voice_validation_result success=${validation.success} bytes=${validation.bytes} mime=${validation.mime} reason=${validation.reason || "none"}`,
      });
      if (!validation.success || !hasAudioData(response)) {
        throw new Error(`TTS returned no audio for ${finalModel}/${finalVoice}`);
      }
      const audio = extractGeminiTtsInlineAudio(response);
      markAttemptVerified({ model: finalModel, voice: finalVoice });
      input.io?.emit?.("system-log", {
        type: "success",
        msg: `tts_model_voice_success model=${finalModel} voice=${finalVoice} bytes=${audio?.bytes || 0} mime=${String(audio?.mimeType || "audio/unknown")}`,
      });
      logGeminiCacheTelemetry(response, input.io, "voice-tts");
      return response;
    } catch (error: any) {
      lastError = sanitizeGeminiTtsError(error, "tts_request_failed");
      input.io?.emit?.("system-log", {
        type: "warning",
        msg: `tts_model_voice_failed model=${finalModel} voice=${finalVoice} reason=${getSafeTtsFailureReason(error, "tts_request_failed")}`,
      });
    }
  }

  throw lastError;
}
