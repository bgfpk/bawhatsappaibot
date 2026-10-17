import { upsertCustomerSummaryMetadataLine } from "./customer-summary-metadata-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function normalizeText(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const MALE_VOICES = new Set([
  "Charon", "Fenrir", "Orus", "Puck", "Iapetus", "Enceladus",
  "Algieba", "Rasalgethi", "Algenib", "Schedar", "Achird", "Sadaltager",
]);

const FEMALE_VOICES = new Set([
  "Aoede", "Kore", "Leda", "Zephyr", "Autonoe", "Callirrhoe",
  "Despina", "Erinome", "Laomedeia", "Pulcherrima", "Vindemiatrix", "Sulafat",
]);

function normalizeGender(value: any) {
  const text = normalizeText(value);
  if (text === "male" || text === "masculine") return "male";
  if (text === "female" || text === "feminine") return "female";
  return "";
}

export function getVoiceGender(voice: any) {
  const selected = clean(voice);
  if (MALE_VOICES.has(selected)) return "male";
  if (FEMALE_VOICES.has(selected)) return "female";
  return "";
}

export function getDefaultVoiceForGender(gender: any) {
  return normalizeGender(gender) === "female" ? "Aoede" : "Charon";
}

function detectGenderRequest(text: any) {
  const normalized = normalizeText(text);
  if (!normalized) return { personaGender: "", voiceGender: "" };

  const hasVoiceContext = /\b(voice|audio|awaz|awaaz|sound|bol|bolo|bolna|speak|speaking|recording)\b/.test(normalized);
  const hasPersonaStyleContext = /\b(style|tone|persona|lehja|lahja|tarz|andaz|feminine|masculine)\b/.test(normalized);
  const hasReplyPersonaContext = !hasVoiceContext && /\b(assistant|agent|bot|reply|baat|talk|chat)\b/.test(normalized);
  const hasFemale = /\b(female|feminine|woman|girl|ladies|larki|lerki|ladki|khatoon|aurat|zanana)\b/.test(normalized);
  const hasMale = /\b(male|masculine|man|boy|larka|lerka|ladka|mard|mardana)\b/.test(normalized);
  const personaRequested = hasPersonaStyleContext || hasReplyPersonaContext;

  if (!hasVoiceContext && !personaRequested) return { personaGender: "", voiceGender: "" };
  if (hasFemale && !hasMale) {
    return { personaGender: personaRequested ? "female" : "", voiceGender: hasVoiceContext ? "female" : "" };
  }
  if (hasMale && !hasFemale) {
    return { personaGender: personaRequested ? "male" : "", voiceGender: hasVoiceContext ? "male" : "" };
  }
  return { personaGender: "", voiceGender: "" };
}

function upsertPersonaSummary(summary: any, personaGender: string, voiceGender: string) {
  return upsertCustomerSummaryMetadataLine(
    summary,
    "Persona/voice preference",
    `persona=${personaGender || "instance_default"}, voice=${voiceGender || "instance_default"}`
  );
}

export function resolveCustomerPersonaVoicePreference(input: {
  profile?: any;
  userConfig?: any;
  latestText?: any;
}) {
  const profile = input.profile || {};
  const instancePersona = normalizeGender(input.userConfig?.bot_gender) || "female";
  const instanceVoice = clean(input.userConfig?.bot_voice) || getDefaultVoiceForGender(instancePersona);
  const instanceVoiceGender = getVoiceGender(instanceVoice) || instancePersona;
  const requested = detectGenderRequest(input.latestText);

  const storedPersona = normalizeGender(profile.customerPersonaPreference || profile.personaPreference);
  const storedVoiceGender = normalizeGender(profile.customerVoicePreference || profile.voicePreference);

  const nextPersona = requested.personaGender || storedPersona || instancePersona;
  const nextVoiceGender = requested.voiceGender || requested.personaGender || storedVoiceGender || nextPersona || instanceVoiceGender;
  const selectedVoice = getVoiceGender(instanceVoice) === nextVoiceGender
    ? instanceVoice
    : getDefaultVoiceForGender(nextVoiceGender);

  const patch: any = {};
  if (requested.personaGender && requested.personaGender !== storedPersona) {
    patch.customerPersonaPreference = requested.personaGender;
  }
  if ((requested.voiceGender || requested.personaGender) && nextVoiceGender !== storedVoiceGender) {
    patch.customerVoicePreference = nextVoiceGender;
  }
  if (Object.keys(patch).length > 0) {
    patch.chatSummary = upsertPersonaSummary(profile.chatSummary, nextPersona, nextVoiceGender);
  }

  return {
    personaGender: nextPersona,
    voiceGender: nextVoiceGender,
    selectedVoice,
    patch: Object.keys(patch).length > 0 ? patch : null,
    changed: Object.keys(patch).length > 0,
  };
}
