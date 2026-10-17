type VoiceReplyBehavior = "text_only" | "text_preferred" | "preference" | "voice_only" | string;
type SavedCustomerPreference = "text_only" | "voice_only" | "" | string;
type IncomingMessageType = "text" | "voice" | "image" | "unknown";

const PLACEHOLDER_TEXTS = new Set([
  "voice message",
  "voice note",
  "audio message",
  "unreadable voice message",
]);

const DIRECT_SHORT_VOICE_REQUESTS = new Set([
  "audio",
  "audio please",
  "audio plz",
  "awaz",
  "awaaz",
  "recording",
  "voice",
  "voice please",
  "voice plz",
]);

const DIRECT_EXPLICIT_VOICE_PHRASES = [
  "voice mein jawab dein",
  "voice me jawab dein",
  "voice main jawab dein",
  "voice mein jawab den",
  "voice me jawab den",
  "voice mein reply dein",
  "voice note bhej dein",
  "voice note bhej den",
  "audio mein bata dein",
  "audio me bata dein",
  "audio mein bata den",
  "call nahi voice note",
  "call nahi voice message",
  "mujhe voice mein samjha dein",
  "mujhe voice me samjha dein",
  "awaz mein jawab dein",
  "awaz me jawab dein",
  "awaaz mein jawab dein",
  "awaaz me jawab dein",
  "voice message send karein",
  "voice message send kare",
  "send voice reply",
  "reply in voice",
  "send audio",
  "i can t read send voice",
  "i am driving send voice",
  "bolkar batao",
  "वॉइस में जवाब दें",
  "बोलकर बताओ",
  "وائس میں جواب دیں",
  "آواز میں جواب دیں",
];

const EXPLICIT_VOICE_REQUEST_PATTERNS = [
  /\bsend\s+(me\s+)?(a\s+)?voice\b/,
  /\bvoice\s+(note|message|reply)\b/,
  /\breply\s+in\s+voice\b/,
  /\bsend\s+(me\s+)?(an\s+)?audio\b/,
  /\baudio\s+(note|message|reply)\b/,
  /\bvoice\s+(mein|me|mai|main)\b/,
  /\baudio\s+(mein|me|mai|main)\b/,
  /\bawaz\s+(mein|me|mai|main)\b/,
  /\bawaaz\s+(mein|me|mai|main)\b/,
  /\brecording\s+(bhej|send|kar)\b/,
  /\bbol\s*(kar|ke)\b/,
  /\bbolke\b/,
  /\bsuna\s*do\b/,
  /\bsunao\b/,
];

const PRACTICAL_VOICE_NEED_PATTERNS = [
  /\b(can\s*t|cant|cannot)\s+(read|type|write)\b/,
  /\bunable\s+to\s+(read|type|write)\b/,
  /\bi\s*(am|m)?\s*busy\b/,
  /\bbusy\s+ho+n?\b/,
  /\bmasroof\b/,
  /\bdriv(ing|e)\b/,
  /\bdrive\s+kar\b/,
  /\bgaari\s+chala\b/,
  /\bgari\s+chala\b/,
  /\bscreen\s+(nahi|nahin)\s+(dekh|parh|read)\b/,
  /\btype\s+(nahi|nahin)\s+kar\b/,
  /\bparh\s+(nahi|nahin)\s+sakta\b/,
  /\bparh\s+(nahi|nahin)\s+sakti\b/,
  /\bparhna\s+(nahi|nahin)\s+ata\b/,
  /\bpadhna\s+(nahi|nahin)\s+ata\b/,
  /\banparh\b/,
  /\billiterate\b/,
];

function normalizeVoicePolicyText(value: any) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\[\](){}<>*_~`"'.,!?;:|\\/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveReplyMode(behavior: VoiceReplyBehavior, savedCustomerPreference?: SavedCustomerPreference) {
  if (behavior === "voice_only" || behavior === "text_only") return behavior;
  if (behavior === "preference") {
    const saved = String(savedCustomerPreference || "").trim();
    if (saved === "voice_only" || saved === "text_only") return saved;
  }
  return behavior;
}

function includesAnyPhrase(text: string, phrases: string[]) {
  return phrases.some((phrase) => text.includes(phrase));
}

const VOICE_ONLY_FILLER_TOKENS = new Set([
  "a",
  "an",
  "audio",
  "answer",
  "awaz",
  "awaaz",
  "bhej",
  "bhej dein",
  "bhej den",
  "call",
  "dein",
  "den",
  "in",
  "main",
  "me",
  "mein",
  "message",
  "msg",
  "note",
  "please",
  "plz",
  "recording",
  "reply",
  "send",
  "voice",
]);

export function detectVoiceReplySignals(value: any) {
  const text = normalizeVoicePolicyText(value);
  if (!text || PLACEHOLDER_TEXTS.has(text)) {
    return {
      normalizedText: text,
      explicitVoiceRequest: false,
      practicalVoiceReason: false,
      hasAnyVoiceNeed: false,
    };
  }
  const practicalVoiceReason = PRACTICAL_VOICE_NEED_PATTERNS.some((pattern) => pattern.test(text));
  const explicitVoiceRequest =
    DIRECT_SHORT_VOICE_REQUESTS.has(text) ||
    includesAnyPhrase(text, DIRECT_EXPLICIT_VOICE_PHRASES) ||
    EXPLICIT_VOICE_REQUEST_PATTERNS.some((pattern) => pattern.test(text));
  return {
    normalizedText: text,
    explicitVoiceRequest,
    practicalVoiceReason,
    hasAnyVoiceNeed: explicitVoiceRequest || practicalVoiceReason,
  };
}

export function isVoiceOutputOnlyRequest(value: any) {
  const signals = detectVoiceReplySignals(value);
  if (!signals.explicitVoiceRequest || !signals.normalizedText) return false;

  let remaining = ` ${signals.normalizedText} `;
  for (const phrase of DIRECT_EXPLICIT_VOICE_PHRASES) {
    remaining = remaining.replaceAll(` ${phrase} `, " ");
  }
  remaining = remaining
    .replace(/\bsend\s+(me\s+)?(a\s+)?voice\b/g, " ")
    .replace(/\bvoice\s+(note|message|reply)\b/g, " ")
    .replace(/\breply\s+in\s+voice\b/g, " ")
    .replace(/\bsend\s+(me\s+)?(an\s+)?audio\b/g, " ")
    .replace(/\baudio\s+(note|message|reply)\b/g, " ")
    .replace(/\bvoice\s+(mein|me|mai|main)\b/g, " ")
    .replace(/\baudio\s+(mein|me|mai|main)\b/g, " ")
    .replace(/\bawaz\s+(mein|me|mai|main)\b/g, " ")
    .replace(/\bawaaz\s+(mein|me|mai|main)\b/g, " ")
    .replace(/\brecording\s+(bhej|send|kar)\b/g, " ")
    .replace(/\bbol\s*(kar|ke)\b/g, " ")
    .replace(/\bbolke\b/g, " ")
    .replace(/\bsuna\s*do\b/g, " ")
    .replace(/\bsunao\b/g, " ")
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!remaining) return true;
  const tokens = remaining.split(" ").filter(Boolean);
  return tokens.length > 0 && tokens.every((token) => VOICE_ONLY_FILLER_TOKENS.has(token));
}

export function customerHasExplicitVoiceNeed(value: any) {
  return detectVoiceReplySignals(value).hasAnyVoiceNeed;
}

export function customerHasPracticalVoiceNeed(value: any) {
  return detectVoiceReplySignals(value).practicalVoiceReason;
}

export function customerClearlyRequestedVoice(value: any) {
  const signals = detectVoiceReplySignals(value);
  if (!signals.normalizedText) return false;
  if (DIRECT_SHORT_VOICE_REQUESTS.has(signals.normalizedText)) return false;
  return signals.explicitVoiceRequest;
}

function countNumericTokens(value: string) {
  return (value.match(/\b\d+(?:[.,:/-]\d+)*\b/g) || []).length;
}

export function shouldAlsoSendTextForReplyAccuracy(replyText: any, latestUserText: any) {
  const reply = String(replyText || "").trim();
  const user = normalizeVoicePolicyText(latestUserText);
  if (!reply) return false;

  const combined = `${reply}\n${user}`.toLowerCase();
  if (/\b(price|pricing|plan|plans|cost|rate|monthly|yearly|annual|discount|policy|refund|return|payment|cod|address|tracking|invoice|summary)\b/.test(combined)) {
    return true;
  }
  if (countNumericTokens(reply) >= 3) return true;
  if ((reply.match(/\n/g) || []).length >= 4) return true;
  if (/(^|\n)\s*[-*•]\s+/.test(reply) || /(^|\n)\s*\d+\.\s+/.test(reply)) return true;
  return reply.length >= 420;
}

export function buildVoiceReplyPlan(input: {
  behavior?: VoiceReplyBehavior;
  replyMode?: VoiceReplyBehavior;
  latestUserText?: any;
  customerTextOrTranscript?: any;
  isIncomingVoice?: boolean;
  incomingMessageType?: IncomingMessageType;
  savedCustomerPreference?: SavedCustomerPreference;
  voiceEnabled: boolean;
  explicitVoiceRequest?: boolean;
  practicalVoiceReason?: boolean;
  aiRequestedVoiceReply?: boolean;
  replyText?: any;
}) {
  const behavior = resolveReplyMode(input.replyMode || input.behavior || "text_preferred", input.savedCustomerPreference);
  const decisionText = input.customerTextOrTranscript ?? input.latestUserText ?? "";
  const signals = detectVoiceReplySignals(decisionText);
  const hasPracticalNeed = typeof input.practicalVoiceReason === "boolean"
    ? input.practicalVoiceReason
    : signals.practicalVoiceReason;
  const hasClearVoiceRequest = typeof input.explicitVoiceRequest === "boolean"
    ? input.explicitVoiceRequest
    : signals.explicitVoiceRequest;
  const incomingMessageType = input.incomingMessageType || (input.isIncomingVoice ? "voice" : "text");
  const isIncomingVoice = incomingMessageType === "voice";
  const aiRequestedVoiceReply = !!input.aiRequestedVoiceReply;
  const shouldAlsoSendText = shouldAlsoSendTextForReplyAccuracy(input.replyText, decisionText);

  if (!input.voiceEnabled) {
    return { sendVoice: false, sendText: true, reason: "voice simulation is disabled", shouldAlsoSendText };
  }
  if (behavior === "text_only") {
    return { sendVoice: false, sendText: true, reason: "reply behavior is text_only", shouldAlsoSendText: false };
  }
  if (behavior === "voice_only") {
    return { sendVoice: true, sendText: shouldAlsoSendText, reason: "reply behavior is voice_only", shouldAlsoSendText };
  }

  if (behavior === "text_preferred") {
    if (input.savedCustomerPreference === "text_only" && !hasPracticalNeed && !hasClearVoiceRequest) {
      return { sendVoice: false, sendText: true, reason: "customer requested text replies", shouldAlsoSendText: false };
    }
    const allowVoice = hasPracticalNeed || hasClearVoiceRequest || aiRequestedVoiceReply;
    return {
      sendVoice: allowVoice,
      sendText: !allowVoice || shouldAlsoSendText,
      reason: allowVoice
        ? (aiRequestedVoiceReply && !hasPracticalNeed && !hasClearVoiceRequest
          ? "ai confirmed an explicit customer voice request"
          : "customer clearly requested voice or needs accessibility support")
        : "reply behavior is text_preferred",
      shouldAlsoSendText,
    };
  }

  if (behavior === "preference") {
    if (input.savedCustomerPreference === "text_only" && !hasPracticalNeed && !hasClearVoiceRequest) {
      return { sendVoice: false, sendText: true, reason: "customer requested text replies", shouldAlsoSendText: false };
    }
    const allowVoice = isIncomingVoice || hasPracticalNeed || hasClearVoiceRequest || signals.hasAnyVoiceNeed || aiRequestedVoiceReply;
    return {
      sendVoice: allowVoice,
      sendText: !allowVoice || shouldAlsoSendText,
      reason: allowVoice
        ? (isIncomingVoice ? "customer sent voice" : "customer requested voice")
        : "reply behavior is preference",
      shouldAlsoSendText,
    };
  }

  return { sendVoice: false, sendText: true, reason: `reply behavior is ${behavior}`, shouldAlsoSendText: false };
}

export function shouldSendVoiceReply(input: {
  behavior?: VoiceReplyBehavior;
  replyMode?: VoiceReplyBehavior;
  latestUserText?: any;
  customerTextOrTranscript?: any;
  isIncomingVoice?: boolean;
  incomingMessageType?: IncomingMessageType;
  savedCustomerPreference?: SavedCustomerPreference;
  voiceEnabled: boolean;
  explicitVoiceRequest?: boolean;
  practicalVoiceReason?: boolean;
  aiRequestedVoiceReply?: boolean;
  replyText?: any;
}) {
  return buildVoiceReplyPlan(input).sendVoice;
}
