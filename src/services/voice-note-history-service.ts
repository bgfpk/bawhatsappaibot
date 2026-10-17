import { sentenceSafeTruncate } from "./summary-text-utils-service.ts";

const MAX_VOICE_NOTE_HISTORY_CHARS = 600;
const PLACEHOLDER_RE = /^(?:\[?audio\]?|\[?voice message\]?|voice message|voice note|media)$/i;

function clean(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isUsableVoiceTranscript(value: any) {
  const text = clean(value);
  if (!text || text.length < 3) return false;
  if (PLACEHOLDER_RE.test(text)) return false;
  return /[\p{L}\p{N}]{3,}/u.test(text);
}

export function buildVoiceNoteHistoryText(input: {
  transcript?: any;
  text?: any;
  caption?: any;
  fallbackUnavailableText?: string;
}) {
  const transcript = [input.transcript, input.text, input.caption].find(isUsableVoiceTranscript);
  if (transcript) {
    return `Voice note: ${sentenceSafeTruncate(clean(transcript), MAX_VOICE_NOTE_HISTORY_CHARS)}`;
  }
  return input.fallbackUnavailableText || "Voice note received, transcript unavailable";
}

export function isVoiceTranscriptUnavailableText(value: any) {
  return /^voice note received,\s*transcript unavailable\.?$/i.test(clean(value));
}

export function isVoiceNoteMeaningText(value: any) {
  const text = clean(value);
  return /^voice note:\s+/i.test(text) && isUsableVoiceTranscript(text.replace(/^voice note:\s*/i, ""));
}
