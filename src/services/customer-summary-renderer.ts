// Pure renderer extracted from the transferred summary service; no provider/database imports.
import { cleanCustomerBusinessSummary,hasSpecificCustomerSummaryLines,isGenericSoftwareFallbackLine } from './customer-summary-cleaner-service.ts';
import { sentenceSafeTruncate } from './summary-text-utils-service.ts';
import { cleanOrderFieldValue } from './order-field-value-service.ts';
const SUMMARY_SECTIONS = ["Current Status", "Conversation Timeline", "Lead/Order Details", "Next Best Action", "Private Notes"] as const;
const MAX_LINES_PER_SECTION = 10;
const DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS = 900;
const RETRY_SUMMARY_MAX_OUTPUT_TOKENS = 700;
const REQUIRED_ARRAY_FIELDS = ["currentFacts", "timeline", "pendingNextStep", "notes", "doNotAskAgain"] as const;
const GENERIC_FILLER_RE = /^\s*(ji|jee|ok|okay|yes|no|haan|han|hmm)\s*$/i;
const SUMMARY_AI_RETRY_ON_BAD_JSON = String(process.env.GEMINI_SUMMARY_AI_RETRY_ON_BAD_JSON || "true").toLowerCase() === "true";

function clean(value: any, limit = 260) {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return sentenceSafeTruncate(String(value).replace(/\s+/g, " ").trim(), limit);
  }
  return "";
}

function normalize(value: any) {
  return clean(value, 500).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function parseAiJson(value: any) {
  if (value && typeof value === "object") return value;
  const text = String(value || "").trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  if (!text) throw new Error("empty_ai_summary");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("invalid_ai_summary_json");
  return JSON.parse(text.slice(start, end + 1));
}

function humanizeKey(value: string) {
  return value
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\w/, (char) => char.toUpperCase());
}

function collectUsefulStrings(value: any, depth = 0): string[] {
  if (depth > 2 || value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const text = clean(value, 260);
    return text ? [text] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectUsefulStrings(item, depth + 1));
  }
  if (typeof value === "object") {
    const preferredKeys = ["text", "summary", "value", "label", "name", "title", "description", "reason", "detail", "status", "interest", "language"];
    const preferredValues = preferredKeys.flatMap((key) => collectUsefulStrings(value?.[key], depth + 1));
    if (preferredValues.length > 0) return preferredValues;

    return Object.entries(value)
      .flatMap(([key, candidate]) => {
        if (candidate == null || typeof candidate === "object") return [];
        const text = clean(candidate, 180);
        if (!text) return [];
        return [`${humanizeKey(key)}: ${text}`];
      })
      .slice(0, 6);
  }
  return [];
}

function uniqueLines(values: any[], limit = MAX_LINES_PER_SECTION) {
  const lines: string[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    const candidates = collectUsefulStrings(value);
    for (const candidate of candidates) {
      const key = normalize(candidate);
      if (!candidate || !key || seen.has(key)) continue;
      seen.add(key);
      lines.push(candidate);
      if (lines.length >= limit) return lines;
    }
  }
  return lines;
}

function list(value: any, limit = MAX_LINES_PER_SECTION) {
  return uniqueLines(Array.isArray(value) ? value : [value], limit);
}

function pickFirstLine(value: any, limit = 220) {
  return list(value, 1).map((item) => clean(item, limit))[0] || "";
}

function joinUsefulValues(value: any, limit = 3) {
  return list(value, limit).join(", ");
}

function normalizeAiSummaryShape(summary: any) {
  const parsed = summary && typeof summary === "object" ? summary : {};
  const normalized = {
    currentFacts: list(parsed.currentStatus || parsed.currentFacts, 6),
    timeline: list(parsed.conversationTimeline || parsed.timeline, 8),
    pendingNextStep: list(parsed.nextBestAction || parsed.pendingNextStep, 4),
    notes: list(parsed.privateNotes || parsed.notes, 5),
    languagePreference: pickFirstLine(parsed.languagePreference, 80),
    doNotAskAgain: list(parsed.doNotAskAgain, 4),
    customerIdentity: parsed.customerIdentity,
    businessOrUseCase: parsed.businessOrUseCase,
    productOrServiceInterest: parsed.productOrServiceInterest,
    leadOrderDetails: list(parsed.leadOrderDetails, 8),
    orderLeadState: parsed.orderLeadState,
    missingDetails: list(parsed.missingDetails, 6),
    optionalMissingDetails: list(parsed.optionalMissingDetails, 4),
  } as Record<string, any>;

  for (const field of REQUIRED_ARRAY_FIELDS) {
    normalized[field] = Array.isArray(normalized[field]) ? normalized[field] : [];
  }

  return normalized;
}

function isUnsafeSummaryLine(value: any) {
  const line = clean(value, 500);
  if (!line) return true;
  const [, possibleValue = ""] = line.split(/:\s*/, 2);
  if (possibleValue && !cleanOrderFieldValue(possibleValue)) return true;
  if (/^(customer|user|bot|ai|assistant)\s*:/i.test(line)) return true;
  if (/^(name|phone)\s*:/i.test(line)) return true;
  if (/\b(unknown city|unknown address|customer provided address|no\/a|n\/a|null|undefined)\b/i.test(line)) return true;
  if (GENERIC_FILLER_RE.test(line)) return true;
  if (/\blanguage preference\s*:\s*hindi\b/i.test(line)) return true;
  if (/^(current|timeline|pending \/ next step|future plan|notes|current status|conversation timeline|lead\/order details|next best action|private notes)\s*:?$/i.test(line)) return true;
  if (/\[object object\]/i.test(line)) return true;
  return false;
}

function sanitizeLine(value: any) {
  let line = clean(value);
  line = line.replace(/^(?:[*-]\s*)+/, "").trim();
  line = line.replace(/\b(Current|Timeline|Pending \/ Next step|Future plan|Notes|Current Status|Conversation Timeline|Lead\/Order Details|Next Best Action|Private Notes):\s*/gi, "").trim();
  line = cleanOrderFieldValue(line) || line;
  return isUnsafeSummaryLine(line) ? "" : line;
}

function addUnique(target: string[], values: any[], limit = MAX_LINES_PER_SECTION) {
  const seen = new Set(target.map(normalize).filter(Boolean));
  for (const value of values) {
    const line = sanitizeLine(value);
    const key = normalize(line);
    if (!line || !key || seen.has(key)) continue;
    target.push(line);
    seen.add(key);
    if (target.length >= limit) break;
  }
}

function pruneEmptySections(summary: string) {
  const lines = String(summary || "").split("\n");
  const result: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isHeading = /^(Current|Timeline|Pending \/ Next step|Notes|Current Status|Conversation Timeline|Lead\/Order Details|Next Best Action|Private Notes):$/i.test(line.trim());
    if (isHeading) {
      const nextContent = lines.slice(index + 1).find((candidate) => candidate.trim());
      if (!nextContent || /^(Current|Timeline|Pending \/ Next step|Notes|Current Status|Conversation Timeline|Lead\/Order Details|Next Best Action|Private Notes):$/i.test(nextContent.trim())) continue;
    }
    result.push(line);
  }
  return result.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stableContextLines(summary: any) {
  return [
    joinUsefulValues(summary?.businessOrUseCase, 3) ? `Business/use case: ${joinUsefulValues(summary.businessOrUseCase, 3)}` : "",
    joinUsefulValues(summary?.productOrServiceInterest, 3) ? `Interest: ${joinUsefulValues(summary.productOrServiceInterest, 3)}` : "",
    pickFirstLine(summary?.languagePreference, 80) ? `Language preference: ${pickFirstLine(summary.languagePreference, 80)}` : "",
  ].filter(Boolean);
}

function stripGenericFallbackLines(summary: any, limit = 1200) {
  const cleaned = cleanCustomerBusinessSummary(summary, Math.max(limit * 2, 1200));
  if (!cleaned) return "";
  const lines = cleaned.split("\n");
  const filtered = lines.filter((line) => !isGenericSoftwareFallbackLine(line));
  return sentenceSafeTruncate(pruneEmptySections(filtered.join("\n")), limit);
}

export function renderAiCustomerSummaryJson(value: any) {
  const summary = normalizeAiSummaryShape(parseAiJson(value));
  const current: string[] = [];
  const timeline: string[] = [];
  const details: string[] = [];
  const nextAction: string[] = [];
  const notes: string[] = [];

  addUnique(current, summary.currentFacts, 8);
  addUnique(current, stableContextLines(summary), 8);
  addUnique(timeline, summary.timeline, 8);
  if (hasSpecificCustomerSummaryLines(timeline)) {
    const specificTimeline = timeline.filter((line) => !isGenericSoftwareFallbackLine(line));
    timeline.splice(0, timeline.length, ...specificTimeline);
  }
  addUnique(details, summary.leadOrderDetails, 8);
  addUnique(details, list(summary.orderLeadState, 2).map((item) => `Order/lead state: ${item}`), 8);
  addUnique(details, summary.missingDetails.map((item) => `Required missing: ${clean(item)}`), 8);
  addUnique(details, summary.optionalMissingDetails.map((item) => `Optional missing: ${clean(item)}`), 8);
  addUnique(nextAction, summary.pendingNextStep, 4);
  addUnique(notes, summary.notes, 5);
  addUnique(notes, summary.doNotAskAgain.map((item) => `Do not ask again: ${clean(item)}`), 4);

  const sections = {
    "Current Status": current,
    "Conversation Timeline": timeline,
    "Lead/Order Details": details,
    "Next Best Action": nextAction,
    "Private Notes": notes,
  };

  const rendered = SUMMARY_SECTIONS.map((section) => {
    const rows = sections[section].filter(Boolean);
    return rows.length ? `${section}:\n${rows.map((row) => `- ${row}`).join("\n")}` : "";
  }).filter(Boolean).join("\n\n");

  const cleaned = pruneEmptySections(cleanCustomerBusinessSummary(rendered, 2500));
  if (!cleaned) throw new Error("empty_rendered_ai_summary");
  return cleaned;
}
