import { generateGeminiMediaUnderstanding, GEMINI_MEDIA_MODEL } from "./gemini-media-understanding-service.ts";
import { convertAudioBufferForGemini, isGeminiAudioConversionAvailable, normalizeGeminiAudioMimeType, shouldRetryGeminiAudioWithConversion } from "./gemini-audio-preprocess-service.ts";
import { isUsableVoiceTranscript } from "./voice-note-history-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";

type MediaProviderContext = GeminiProviderContext & { customerJid?: string };

type MediaProviderFn = typeof generateGeminiMediaUnderstanding;

export type MediaUnderstandingResult = {
  kind: "image" | "audio";
  useful: boolean;
  provider: string;
  model: string;
  requestStatus: string;
  retryable: boolean;
  reason: string;
  confidence: number;
  detectedType: string;
  contextText: string;
  transcriptText: string;
  usedProvider: boolean;
  containsCustomerOrderData?: boolean;
  sourceTag?: string;
  summaryText?: string;
  visibleText?: string;
  language?: string;
};

type AudioConversionFn = typeof convertAudioBufferForGemini;

function clean(value: any, max = 8000) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

function parseJson(text: string) {
  const trimmed = clean(text, 12000);
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    return {};
  }
}

function extractLooseStringField(text: string, key: string) {
  const match = String(text || "").match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)`, "i"));
  return clean(match?.[1] || "", 5000);
}

function extractLooseNumberField(text: string, key: string) {
  const match = String(text || "").match(new RegExp(`"${key}"\\s*:\\s*([0-9.]+)`, "i"));
  const numeric = Number(match?.[1] || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function asBoolean(value: any) {
  if (typeof value === "boolean") return value;
  const normalized = clean(value, 40).toLowerCase();
  if (!normalized) return false;
  return ["true", "yes", "1"].includes(normalized);
}

function clampConfidence(value: any) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(0, Math.min(1, num)) : 0;
}

function looksGeneric(text: string) {
  const value = clean(text, 600).toLowerCase();
  if (!value) return true;
  return [
    "unable to determine",
    "cannot determine",
    "can't determine",
    "not enough detail",
    "not clear enough",
    "unclear image",
    "unclear audio",
    "generic response",
    "no readable text",
    "unknown",
    "n/a",
  ].some((token) => value.includes(token));
}

function extractLooseArrayField(text: string, key: string) {
  const match = String(text || "").match(new RegExp(`"${key}"\\s*:\\s*\\[([^\\]]*)\\]`, "i"));
  if (!match?.[1]) return [];
  return match[1]
    .split(",")
    .map((item) => clean(item.replace(/^["'\s]+|["'\s]+$/g, ""), 240))
    .filter(Boolean)
    .slice(0, 6);
}

function hasMeaningfulVisibleText(value: string) {
  const text = clean(value, 700);
  if (!text || looksGeneric(text)) return false;
  if (text.length >= 8) return true;
  return /[\p{L}\p{N}]{4,}/u.test(text);
}

function buildImageContextText(input: {
  summary: string;
  visibleText: string;
  productName: string;
  brandName: string;
  packagingDetails: string;
  claims: string[];
  ingredients: string[];
}) {
  const parts = [
    input.summary,
    input.productName ? `Product: ${input.productName}` : "",
    input.brandName ? `Brand: ${input.brandName}` : "",
    input.visibleText ? `Visible text: ${input.visibleText}` : "",
    input.packagingDetails ? `Packaging: ${input.packagingDetails}` : "",
    input.claims.length ? `Claims: ${input.claims.join(", ")}` : "",
    input.ingredients.length ? `Ingredients: ${input.ingredients.join(", ")}` : "",
  ].filter(Boolean);
  return clean(parts.join(". "), 1800);
}

export function buildMediaReplyContextAttachment(result: MediaUnderstandingResult) {
  if (!result.useful || !result.contextText) return "";
  const label = result.kind === "image" ? "Latest image understanding" : "Latest audio understanding";
  return `[${label}] ${clean(result.contextText, 2000)}`;
}

export async function understandLatestCustomerImage(input: {
  imageBuffer: Buffer;
  mimeType?: string;
  caption?: string;
  latestCustomerText?: string;
  providerContext?: MediaProviderContext;
  visionGenerate?: MediaProviderFn;
}) {
  console.info(`image_understanding_started provider=gemini model=gemini-2.5-flash bytes=${Number(input.imageBuffer?.length || 0)}`);
  if (!input.imageBuffer?.length) {
    console.info("image_understanding_result useful=false confidence=0 chars=0");
    return {
      kind: "image",
      useful: false,
      provider: "gemini",
      model: GEMINI_MEDIA_MODEL,
      requestStatus: "invalid_response",
      retryable: true,
      reason: "missing_image_buffer",
      confidence: 0,
      detectedType: "missing_buffer",
      contextText: "",
      transcriptText: "",
      usedProvider: false,
    } satisfies MediaUnderstandingResult;
  }

  const response = await (input.visionGenerate || generateGeminiMediaUnderstanding)({
    purpose: input.providerContext?.purpose || "customer_image_understanding",
    providerContext: input.providerContext,
    instruction: [
      "Understand only the latest customer-shared WhatsApp image.",
      "Do not use CRM, dashboard, website, or earlier chat knowledge.",
      "Return JSON only: useful, detectedType, conciseSummary, visibleText, productName, brandName, packagingDetails, claims, ingredients, language, confidence, containsCustomerOrderData.",
      input.latestCustomerText ? `Latest customer message: ${clean(input.latestCustomerText, 500)}` : "",
      input.caption ? `Image caption: ${clean(input.caption, 300)}` : "",
      "If this looks like a product, package, or label, extract any readable brand name, product name, ingredients, claims, benefits, packaging details, and visible text.",
      "If some text is unreadable, still return any partial useful detail that is clearly visible.",
      "No guessing. Keep the result concise.",
    ].filter(Boolean).join("\n"),
    media: {
      kind: "image",
      buffer: input.imageBuffer,
      mimeType: input.mimeType || "image/jpeg",
    },
    responseMimeType: "application/json",
    maxOutputTokens: 220,
  });

  const parsed = parseJson(response.text || "");
  const summary = clean(parsed.conciseSummary || parsed.summary || extractLooseStringField(response.text || "", "conciseSummary") || extractLooseStringField(response.text || "", "summary"), 1200);
  const visibleText = clean(parsed.visibleText || parsed.keyText || extractLooseStringField(response.text || "", "visibleText") || extractLooseStringField(response.text || "", "keyText"), 700);
  const productName = clean(parsed.productName || extractLooseStringField(response.text || "", "productName"), 300);
  const brandName = clean(parsed.brandName || extractLooseStringField(response.text || "", "brandName"), 240);
  const packagingDetails = clean(parsed.packagingDetails || extractLooseStringField(response.text || "", "packagingDetails"), 400);
  const claims = Array.isArray(parsed.claims)
    ? parsed.claims.map((value: any) => clean(value, 200)).filter(Boolean).slice(0, 6)
    : extractLooseArrayField(response.text || "", "claims");
  const ingredients = Array.isArray(parsed.ingredients)
    ? parsed.ingredients.map((value: any) => clean(value, 200)).filter(Boolean).slice(0, 6)
    : extractLooseArrayField(response.text || "", "ingredients");
  const detectedType = clean(parsed.detectedType || parsed.source || extractLooseStringField(response.text || "", "detectedType") || "image", 80) || "image";
  const confidence = clampConfidence(parsed.confidence || extractLooseNumberField(response.text || "", "confidence"));
  const containsCustomerOrderData = typeof parsed.containsCustomerOrderData === "boolean"
    ? parsed.containsCustomerOrderData
    : undefined;
  const contextText = buildImageContextText({
    summary,
    visibleText,
    productName,
    brandName,
    packagingDetails,
    claims,
    ingredients,
  });
  const usefulSignals = [
    summary.length >= 18 && !looksGeneric(summary),
    hasMeaningfulVisibleText(visibleText),
    hasMeaningfulVisibleText(productName),
    hasMeaningfulVisibleText(brandName),
    hasMeaningfulVisibleText(packagingDetails),
    claims.some(hasMeaningfulVisibleText),
    ingredients.some(hasMeaningfulVisibleText),
  ];
  const useful = response.requestStatus === "success" && usefulSignals.some(Boolean) && !looksGeneric(contextText);
  console.info(`image_understanding_result useful=${useful} confidence=${confidence || 0} chars=${contextText.length}`);

  return {
    kind: "image",
    useful,
    provider: response.provider,
    model: response.model,
    requestStatus: response.requestStatus,
    retryable: !useful,
    reason: useful ? "" : (response.requestStatus === "failed" ? "image_provider_failed" : contextText ? "generic_image_understanding" : "empty_image_understanding"),
    confidence,
    detectedType,
    contextText,
    transcriptText: "",
    usedProvider: true,
    containsCustomerOrderData,
    summaryText: summary,
    visibleText,
    language: clean(parsed.language, 24),
  } satisfies MediaUnderstandingResult;
}

export async function understandLatestCustomerAudio(input: {
  audioBuffer?: Buffer;
  mimeType?: string;
  caption?: string;
  transcript?: string;
  durationSeconds?: number;
  latestCustomerText?: string;
  providerContext?: MediaProviderContext;
  audioGenerate?: MediaProviderFn;
  audioConvert?: AudioConversionFn;
}) {
  const normalizedMimeType = normalizeGeminiAudioMimeType(input.mimeType || "audio/ogg");
  console.info(`audio_understanding_started provider=gemini model=gemini-2.5-flash bytes=${Number(input.audioBuffer?.length || 0)} mime=${normalizedMimeType}`);
  const directTranscript = [input.transcript, input.caption].map((value) => clean(value, 4000)).find(isUsableVoiceTranscript) || "";
  if (!input.audioBuffer?.length && directTranscript) {
    console.info(`audio_understanding_result useful=true transcriptChars=${directTranscript.length} language=unknown confidence=1`);
    return {
      kind: "audio",
      useful: true,
      provider: "message_transcript",
      model: "",
      requestStatus: "success",
      retryable: false,
      reason: "",
      confidence: 1,
      detectedType: "voice_transcript",
      contextText: `Transcript: ${directTranscript}`,
      transcriptText: directTranscript,
      usedProvider: false,
    } satisfies MediaUnderstandingResult;
  }

  if (!input.audioBuffer?.length) {
    console.info(`audio_understanding_result useful=false transcriptChars=0 language=unknown confidence=0`);
    return {
      kind: "audio",
      useful: false,
      provider: "gemini",
      model: GEMINI_MEDIA_MODEL,
      requestStatus: "invalid_response",
      retryable: true,
      reason: "missing_audio_buffer",
      confidence: 0,
      detectedType: "missing_buffer",
      contextText: "",
      transcriptText: "",
      usedProvider: false,
    } satisfies MediaUnderstandingResult;
  }

  const generateAudio = input.audioGenerate || generateGeminiMediaUnderstanding;
  const maxAudioOutputTokens = Math.min(360, input.durationSeconds && input.durationSeconds > 60
    ? 320
    : input.durationSeconds && input.durationSeconds > 20
      ? 260
      : 220);
  const instruction = [
    "Transcribe only the latest WhatsApp voice note and return JSON only: useful, transcript, summary, language, confidence.",
    "Do not use CRM, earlier chat history, tools, or business prompts.",
    input.latestCustomerText ? `Latest customer text context: ${clean(input.latestCustomerText, 300)}` : "",
  ].filter(Boolean).join("\n");

  const parseAudioResponse = (response: any) => {
    const parsed = parseJson(response.text || "");
    const partial = Boolean(response?.partial || response?.finishReason === "MAX_TOKENS");
    const transcript = clean(parsed.transcript || parsed.text || extractLooseStringField(response.text || "", "transcript"), 5000);
    const conciseSummary = clean(parsed.conciseSummary || parsed.summary || extractLooseStringField(response.text || "", "summary"), 1200);
    const language = clean(parsed.language || extractLooseStringField(response.text || "", "language") || "unknown", 24) || "unknown";
    const confidence = clampConfidence(parsed.confidence || extractLooseNumberField(response.text || "", "confidence"));
    const transcriptUseful = isUsableVoiceTranscript(transcript) && !looksGeneric(transcript);
    const summaryUseful = conciseSummary.length >= 16 && !looksGeneric(conciseSummary);
    const useful = response.requestStatus === "success" && (transcriptUseful || summaryUseful);
    const salvaged = partial && useful;
    const contextText = [
      transcriptUseful ? `Transcript: ${transcript}` : "",
      summaryUseful ? `Summary: ${conciseSummary}` : "",
    ].filter(Boolean).join(". ");
    return {
      transcript,
      conciseSummary,
      language,
      confidence,
      useful,
      contextText,
      salvaged,
      reason: useful
        ? ""
        : (response.requestStatus === "failed"
          ? "audio_provider_failed"
          : (transcript || conciseSummary ? "generic_audio_understanding" : "empty_audio_understanding")),
      provider: response.provider,
      model: response.model,
      requestStatus: response.requestStatus,
    };
  };

  const requestAudioUnderstanding = async (buffer: Buffer, mimeType: string) => {
    return generateAudio({
      purpose: input.providerContext?.purpose || "customer_audio_understanding",
      providerContext: input.providerContext,
      instruction,
      media: {
        kind: "audio",
        buffer,
        mimeType,
      },
      responseMimeType: "application/json",
      maxOutputTokens: maxAudioOutputTokens,
    });
  };

  let requestBuffer = input.audioBuffer;
  let requestMimeType = normalizedMimeType;
  const shouldPreconvertOgg = shouldRetryGeminiAudioWithConversion(normalizedMimeType) && (isGeminiAudioConversionAvailable() || Boolean(input.audioConvert));
  if (shouldPreconvertOgg) {
    const audioConvert = input.audioConvert || convertAudioBufferForGemini;
    console.info(`audio_preconvert_started fromMime=${normalizedMimeType} toMime=audio/wav`);
    try {
      const converted = await audioConvert({
        buffer: input.audioBuffer,
        mimeType: normalizedMimeType,
      });
      requestBuffer = converted.buffer;
      requestMimeType = converted.mimeType;
      console.info(`audio_preconvert_result success=true bytes=${Number(converted.buffer?.length || 0)}`);
      console.info("gemini_audio_original_skipped reason=preconverted_whatsapp_ogg");
      console.info("gemini_media_retry_changed_payload reason=preconverted_audio_wav");
    } catch {
      console.info("audio_preconvert_result success=false bytes=0");
    }
  }

  const response = await requestAudioUnderstanding(requestBuffer, requestMimeType);
  const parsedResult = parseAudioResponse(response);
  console.info(`audio_understanding_result useful=${parsedResult.useful} transcriptChars=${parsedResult.transcript.length} language=${parsedResult.language} confidence=${parsedResult.confidence || 0}`);

  return {
    kind: "audio",
    useful: parsedResult.useful,
    provider: parsedResult.provider,
    model: parsedResult.model,
    requestStatus: parsedResult.requestStatus,
    retryable: !parsedResult.useful,
    reason: parsedResult.reason,
    confidence: parsedResult.confidence,
    detectedType: parsedResult.salvaged ? "partial_json_salvaged" : "voice_transcript",
    contextText: parsedResult.contextText,
    transcriptText: parsedResult.transcript,
    usedProvider: true,
    sourceTag: parsedResult.salvaged ? "partial_json_salvaged" : "",
    summaryText: parsedResult.conciseSummary,
    language: parsedResult.language,
  } satisfies MediaUnderstandingResult;
}
