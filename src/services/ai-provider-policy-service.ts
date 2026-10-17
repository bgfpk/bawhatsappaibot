export type AiProviderModality = "text" | "image" | "audio_input" | "tts" | "mixed";
export type GeminiPurposeClassification =
  | "owner_test_allowed"
  | "authorized_customer_reply_allowed"
  | "tts_allowed"
  | "image_understanding_allowed"
  | "audio_understanding_allowed"
  | "blocked_text_generation"
  | "blocked_image_recognition_if_deepinfra_available"
  | "blocked_audio_understanding_if_non_gemini_available"
  | "blocked_unknown";

export type AiProviderPolicyInput = {
  ownerInitiated?: boolean;
  transportAuthorized?: boolean;
  ownerActivationApproved?: boolean;
  purpose?: string;
  modality?: AiProviderModality;
  hasImage?: boolean;
  hasAudio?: boolean;
  hasMedia?: boolean;
  isTts?: boolean;
  isImageRecognition?: boolean;
  isVoiceUnderstanding?: boolean;
  deepInfraVisionAvailable?: boolean;
  nonGeminiAudioAvailable?: boolean;
};

const GEMINI_TEXT_BLOCKED_REASON = "GEMINI_TEXT_REPLY_BLOCKED_DEEPINFRA_REQUIRED";
const DEEPINFRA_BLOCKED_REASON = "deepinfra_unavailable_text_generation_blocked";
export const GEMINI_CUSTOMER_REPLY_CONTEXT_BLOCKED = "GEMINI_CUSTOMER_REPLY_CONTEXT_BLOCKED";
export const GEMINI_CLIENT_TEXT_CACHE_PATH_BLOCKED = "GEMINI_CLIENT_TEXT_CACHE_PATH_BLOCKED";
export const GEMINI_TTS_ALLOWED_FINAL_TEXT_ONLY = "gemini_tts_allowed_final_text_only";

function clean(value: any, max = 160) {
  return String(value || "").trim().slice(0, max);
}

function truthyEnv(value: any, defaultValue: boolean) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return defaultValue;
  return ["1", "true", "yes", "on"].includes(normalized);
}

function resolveModality(input: AiProviderPolicyInput): AiProviderModality {
  if (input.modality) return input.modality;
  if (input.isTts) return "tts";
  if (input.isVoiceUnderstanding || input.hasAudio) return input.hasImage ? "mixed" : "audio_input";
  if (input.isImageRecognition || input.hasImage) return input.hasAudio ? "mixed" : "image";
  if (input.hasMedia) return "mixed";
  return "text";
}

function envTextProvider() {
  return clean(process.env.BLACKARROW_TEXT_PROVIDER || "deepinfra", 40).toLowerCase() || "deepinfra";
}

export function isTextOnlyModality(input: AiProviderPolicyInput) {
  return resolveModality(input) === "text";
}

export function shouldBlockGeminiText() {
  return truthyEnv(process.env.BLACKARROW_BLOCK_GEMINI_TEXT, true);
}

export function allowGeminiImage() {
  return true;
}

export function allowGeminiVoiceUnderstanding() {
  return true;
}

export function allowGeminiTts() {
  return truthyEnv(process.env.BLACKARROW_ALLOW_GEMINI_TTS, true);
}

export function hasNonGeminiAudioUnderstandingProvider() {
  return false;
}

export function classifyGeminiPurpose(input: AiProviderPolicyInput): GeminiPurposeClassification {
  const modality = resolveModality(input);
  if(process.env.BLACKARROW_STAGE==='1'&&input.purpose==='authorized_customer_reply'&&modality==='text'
    &&input.transportAuthorized===true&&input.ownerActivationApproved===true)return 'authorized_customer_reply_allowed';
  if (process.env.BLACKARROW_STAGE === '1' && input.ownerInitiated === true
    && input.purpose === 'owner_campaign_test' && modality === 'text') return 'owner_test_allowed';
  if (modality === "tts") return "tts_allowed";
  if (modality === "text") return "blocked_text_generation";
  if (modality === "image") {
    return allowGeminiImage()
      ? "image_understanding_allowed"
      : input.deepInfraVisionAvailable === false
        ? "blocked_unknown"
        : "blocked_image_recognition_if_deepinfra_available";
  }
  if (modality === "audio_input") {
    const nonGeminiAudioAvailable = typeof input.nonGeminiAudioAvailable === "boolean"
      ? input.nonGeminiAudioAvailable
      : hasNonGeminiAudioUnderstandingProvider();
    if (allowGeminiVoiceUnderstanding() && !nonGeminiAudioAvailable) return "audio_understanding_allowed";
    return nonGeminiAudioAvailable
      ? "blocked_audio_understanding_if_non_gemini_available"
      : "blocked_unknown";
  }
  return "blocked_unknown";
}

export function isGeminiAllowedForPurpose(input: AiProviderPolicyInput) {
  const classification = classifyGeminiPurpose(input);
  if (classification === "owner_test_allowed") return true;
  if (classification === 'authorized_customer_reply_allowed') return true;
  if (classification === "tts_allowed") return allowGeminiTts();
  if (classification === "image_understanding_allowed") return allowGeminiImage();
  if (classification === "audio_understanding_allowed") return allowGeminiVoiceUnderstanding();
  return false;
}

export function isDeepInfraRequiredForPurpose(input: AiProviderPolicyInput) {
  return envTextProvider() === "deepinfra" && isTextOnlyModality(input);
}

export function getGeminiTextBlockedReason() {
  return GEMINI_TEXT_BLOCKED_REASON;
}

export function getDeepInfraTextBlockedReason() {
  return DEEPINFRA_BLOCKED_REASON;
}

export function assertGeminiAllowedForPurpose(input: AiProviderPolicyInput) {
  if (isGeminiAllowedForPurpose(input)) return;
  const classification = classifyGeminiPurpose(input);
  const errorCode = classification === "blocked_text_generation"
    ? GEMINI_TEXT_BLOCKED_REASON
    : classification;
  const error: any = new Error(errorCode);
  error.code = errorCode;
  error.reason = errorCode;
  error.purpose = clean(input.purpose || "unknown_purpose", 120);
  error.modality = resolveModality(input);
  error.classification = classification;
  throw error;
}
