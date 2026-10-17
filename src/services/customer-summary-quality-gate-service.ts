import {
  cleanCustomerBusinessSummary,
  hasGenericSoftwareFallbackText,
  hasSpecificCustomerSummaryLines,
  isCutoffSummaryFragment,
  isGenericSoftwareFallbackLine,
  isInternalSummaryNoise,
  normalizeCustomerSummaryText,
  splitEmbeddedSummaryFragments,
} from "./customer-summary-cleaner-service.ts";
import { endsLikeCompleteSentence, endsWithPartialWord } from "./summary-text-utils-service.ts";

const MAX_SUMMARY_LENGTH = 3500;
const HEADING_RE = /^(conversation summary|message-by-message timeline|lead\/business details|instruction-following notes|current|timeline|pending \/ next step|notes|current status|conversation timeline|lead\/order details|next best action|private notes):$/i;
const KNOWN_LABELS = [
  "business/use case",
  "daily inquiries",
  "order/lead state",
  "language preference",
  "do not ask again",
  "name",
  "phone",
  "status",
  "interest",
  "language",
  "missing",
  "product",
  "service",
  "plan",
  "price",
  "city",
  "address",
  "notes",
  "note",
];
const KNOWN_LABEL_PATTERN = KNOWN_LABELS
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
  .join("|");
const INLINE_CHAIN_RE = new RegExp(`\\b(?:${KNOWN_LABEL_PATTERN})\\s*:[^\\n]*\\b(?:${KNOWN_LABEL_PATTERN})\\s*:`, "i");
const SECTION_LIMITS: Record<string, number> = {
  current: 8,
  timeline: 5,
  "pending / next step": 4,
  notes: 4,
  "current status": 8,
  "conversation timeline": 8,
  "lead/order details": 8,
  "next best action": 4,
  "private notes": 5,
  "conversation summary": 8,
  "message-by-message timeline": 8,
  "lead/business details": 8,
  "instruction-following notes": 5,
};
const SINGLETON_LABELS = new Set(["name", "phone", "business/use case", "interest", "order/lead state", "status", "language", "language preference", "product", "service", "plan"]);
const VAGUE_MISSING_RE = /^(missing|ask only for)\s*:\s*(service|details?|info(?:rmation)?|field|question|unknown|n\/a|na)?\.?$/i;
const RAW_TRANSCRIPT_RE = /\b(customer|user|ai|assistant|bot)\s+said\s*:/i;
const REPEATED_CUSTOMER_SAID_RE = /\bcustomer\s+said\s*:[\s\S]*\bcustomer\s+said\s*:/i;
const LOWERCASE_STATUS_PARAGRAPH_RE = /^status\s*:\s*(human review|inquiry|pending|collecting details)\s+customer\s+/i;
const VOICE_PLACEHOLDER_RE = /^voice note received,\s*transcript unavailable\.?$/i;

function clean(value: any) {
  return String(value || "").trim();
}

function normalize(value: any) {
  return clean(value)
    .toLowerCase()
    .replace(/^[*-]\s*/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function labelOf(value: any) {
  return clean(value).match(new RegExp(`^[*-]?\\s*(${KNOWN_LABEL_PATTERN})\\s*:`, "i"))?.[1]?.toLowerCase().replace(/\s+/g, " ").trim() || "";
}

function hasIncompleteProseEnding(line: string) {
  const cleanLine = clean(line).replace(/^[*-]\s*/, "");
  if (!cleanLine || labelOf(cleanLine)) return false;
  if (cleanLine.length < 55) return false;
  return !endsLikeCompleteSentence(cleanLine);
}

function contentLines(summary: string) {
  return normalizeCustomerSummaryText(summary)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

function formatSummaryBullets(summary: string) {
  const sections: Array<{ title: string; rows: string[] }> = [];
  const sectionIndex = new Map<string, number>();
  const sectionSeen = new Map<string, Set<string>>();
  const singletonSeen = new Map<string, Set<string>>();
  let currentKey = "";

  function ensureSection(title: string) {
    const key = title.toLowerCase().replace(/:$/, "");
    let index = sectionIndex.get(key);
    if (index == null) {
      index = sections.length;
      sectionIndex.set(key, index);
      sections.push({ title: title.replace(/:$/, ":"), rows: [] });
      sectionSeen.set(key, new Set());
      singletonSeen.set(key, new Set());
    }
    currentKey = key;
    return sections[index];
  }

  for (const raw of contentLines(summary)) {
    if (HEADING_RE.test(raw)) {
      ensureSection(raw);
      continue;
    }
    const section = ensureSection(currentKey ? `${currentKey}:` : "Current:");
    const limit = SECTION_LIMITS[currentKey] || 6;
    if (section.rows.length >= limit) continue;
    const line = raw.replace(/^[*-]\s*/, "").trim();
    const key = normalize(line);
    if (!line || !key) continue;
    const seen = sectionSeen.get(currentKey) || new Set<string>();
    if (seen.has(key)) continue;
    const label = labelOf(line);
    if (currentKey === "current" && label && SINGLETON_LABELS.has(label)) {
      const currentSingletons = singletonSeen.get(currentKey) || new Set<string>();
      if (currentSingletons.has(label)) continue;
      currentSingletons.add(label);
      singletonSeen.set(currentKey, currentSingletons);
    }
    section.rows.push(line);
    seen.add(key);
    sectionSeen.set(currentKey, seen);
  }
  return sections
    .filter((section) => section.rows.length)
    .map((section) => `${section.title}\n${section.rows.map((row) => `- ${row}`).join("\n")}`)
    .join("\n\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionCounts(lines: string[]) {
  const counts = new Map<string, number>();
  for (const line of lines) {
    if (!HEADING_RE.test(line)) continue;
    const key = line.toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}

function rawPollutionReasons(summary: any) {
  const reasons: string[] = [];
  let currentSection = "";
  let missingCount = 0;
  for (const raw of contentLines(clean(summary))) {
    if (HEADING_RE.test(raw)) {
      currentSection = raw.toLowerCase().replace(/:$/, "");
      continue;
    }
    const withoutBullet = raw.replace(/^[*-]\s*/, "").trim();
    if (INLINE_CHAIN_RE.test(withoutBullet)) reasons.push("inline_chained_fields");
    if (RAW_TRANSCRIPT_RE.test(withoutBullet)) reasons.push("raw_transcript_line");
    if (REPEATED_CUSTOMER_SAID_RE.test(withoutBullet)) reasons.push("customer_said_chain");
    if (hasGenericSoftwareFallbackText(withoutBullet)) reasons.push("generic_fallback_text");
    if (isCutoffSummaryFragment(withoutBullet)) reasons.push("cutoff_fragment");
    if (endsWithPartialWord(withoutBullet)) reasons.push("mid_word_ending");
    if (hasIncompleteProseEnding(withoutBullet)) reasons.push("incomplete_sentence_ending");
    if (LOWERCASE_STATUS_PARAGRAPH_RE.test(withoutBullet)) reasons.push("mixed_status_paragraph");
    if (VOICE_PLACEHOLDER_RE.test(withoutBullet)) reasons.push("voice_transcript_missing");
    if (labelOf(withoutBullet) === "missing") {
      missingCount += 1;
      if (VAGUE_MISSING_RE.test(withoutBullet)) reasons.push("vague_missing_field");
    }
    if ((currentSection === "timeline" || currentSection === "pending / next step") && /\s+-\s+/.test(withoutBullet)) {
      reasons.push(`embedded_bullet_chain:${currentSection}`);
    }
    for (const fragment of splitEmbeddedSummaryFragments(withoutBullet)) {
      if (isGenericSoftwareFallbackLine(fragment) || hasGenericSoftwareFallbackText(fragment)) reasons.push("generic_fallback_text");
      if (isCutoffSummaryFragment(fragment)) reasons.push("cutoff_fragment");
      if (RAW_TRANSCRIPT_RE.test(fragment)) reasons.push("raw_transcript_line");
      if (endsWithPartialWord(fragment)) reasons.push("mid_word_ending");
    }
  }
  if (missingCount > 4) reasons.push("too_many_missing_fields");
  return Array.from(new Set(reasons));
}

export function isPollutedCustomerSummaryInput(summary: any) {
  const text = clean(summary);
  if (!text) return false;
  return rawPollutionReasons(text).length > 0 ||
    contentLines(text).some((line) => isGenericSoftwareFallbackLine(line) || isInternalSummaryNoise(line) || isCutoffSummaryFragment(line));
}

export function runCustomerSummaryQualityGate(summary: any) {
  const rawReasons = rawPollutionReasons(summary).filter((reason) => reason !== "inline_chained_fields");
  const cleaned = formatSummaryBullets(cleanCustomerBusinessSummary(summary, MAX_SUMMARY_LENGTH));
  const lines = contentLines(cleaned);
  const reasons: string[] = [...rawReasons];

  if (!cleaned) reasons.push("empty_summary");
  if (!hasSpecificCustomerSummaryLines(lines)) reasons.push("no_specific_customer_facts");

  for (const [section, count] of sectionCounts(lines)) {
    if (count > 1) reasons.push(`duplicate_section:${section.replace(/:$/, "")}`);
  }

  const singletonLabels = new Set<string>();
  const pendingLines = new Set<string>();
  let currentSection = "";
  for (const line of lines) {
    if (HEADING_RE.test(line)) {
      currentSection = line.toLowerCase().replace(/:$/, "");
      continue;
    }
    if (INLINE_CHAIN_RE.test(line)) reasons.push("inline_chained_fields");
    if (isGenericSoftwareFallbackLine(line)) reasons.push("generic_fallback_line");
    if (hasGenericSoftwareFallbackText(line)) reasons.push("generic_fallback_text");
    if (isInternalSummaryNoise(line)) reasons.push("draft_or_internal_noise");
    if (isCutoffSummaryFragment(line)) reasons.push("cutoff_fragment");

    if (endsWithPartialWord(line)) reasons.push("mid_word_ending");
    if (hasIncompleteProseEnding(line)) reasons.push("incomplete_sentence_ending");
    if (RAW_TRANSCRIPT_RE.test(line)) reasons.push("raw_transcript_line");
    if (LOWERCASE_STATUS_PARAGRAPH_RE.test(line)) reasons.push("mixed_status_paragraph");
    if (VOICE_PLACEHOLDER_RE.test(line.replace(/^[*-]\s*/, ""))) reasons.push("voice_transcript_missing");

    const label = labelOf(line);
    if (label && SINGLETON_LABELS.has(label)) {
      const labelKey = `${currentSection || "current"}:${label}`;
      if (singletonLabels.has(labelKey)) reasons.push(`duplicate_field:${label}`);
      singletonLabels.add(labelKey);
    }

    if (currentSection === "pending / next step") {
      const key = normalize(line);
      if (pendingLines.has(key)) reasons.push("repeated_pending_line");
      pendingLines.add(key);
    }
    if (label === "missing" && VAGUE_MISSING_RE.test(line)) reasons.push("vague_missing_field");
  }

  return {
    accepted: reasons.length === 0,
    summary: reasons.length === 0 ? cleaned : "",
    cleaned,
    reasons: Array.from(new Set(reasons)),
  };
}

export function shouldAdvanceSummaryRefreshMarker(input: {
  gateAccepted: boolean;
  preservedExisting?: boolean;
}) {
  return input.gateAccepted && !input.preservedExisting;
}
