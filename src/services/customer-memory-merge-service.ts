import {
  cleanCustomerBusinessSummary,
  hasSpecificCustomerSummaryLines,
  isGenericSoftwareFallbackLine,
  isInternalSummaryNoise,
  normalizeCustomerSummaryText,
} from "./customer-summary-cleaner-service.ts";
import { isPollutedCustomerSummaryInput } from "./customer-summary-quality-gate-service.ts";
import { sentenceSafeTruncate } from "./summary-text-utils-service.ts";

const SECTION_ORDER = ["Current Status", "Conversation Timeline", "Lead/Order Details", "Next Best Action", "Private Notes"];
const SECTION_ALIASES: Record<string, string> = {
  "current": "Current Status",
  "current status": "Current Status",
  "timeline": "Conversation Timeline",
  "conversation timeline": "Conversation Timeline",
  "lead/order details": "Lead/Order Details",
  "lead order details": "Lead/Order Details",
  "pending / next step": "Next Best Action",
  "future plan": "Next Best Action",
  "next best action": "Next Best Action",
  "notes": "Private Notes",
  "private notes": "Private Notes",
};
const MAX_SUMMARY_LENGTH = 2500;

function clean(value: any, limit = 500) {
  return sentenceSafeTruncate(String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim(), limit, true);
}

function cleanLine(value: any, limit = 260) {
  return sentenceSafeTruncate(String(value || "").replace(/\s+/g, " ").trim(), limit);
}

function normalizeLine(value: any) {
  return cleanLine(value)
    .toLowerCase()
    .replace(/^[*-]\s*/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function collectSummaryLines(value: any, depth = 0): string[] {
  if (depth > 2 || value == null) return [];
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    const line = cleanLine(value);
    return line ? [line] : [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) => collectSummaryLines(item, depth + 1));
  }
  if (typeof value === "object") {
    const preferredKeys = ["text", "summary", "value", "label", "description", "detail", "status", "interest", "language"];
    const preferred = preferredKeys.flatMap((key) => collectSummaryLines(value?.[key], depth + 1));
    if (preferred.length > 0) return preferred;
  }
  return [];
}

function normalizeStoredSummaryText(summary: any) {
  if (summary && typeof summary === "object" && !Array.isArray(summary)) {
    const rendered = formatCustomerMemorySummary({
      current: collectSummaryLines(summary.currentStatus || summary.currentFacts || summary.current),
      timeline: collectSummaryLines(summary.conversationTimeline || summary.timeline),
      details: collectSummaryLines(summary.leadOrderDetails || summary.orderLeadDetails || summary.details || summary.orderLeadState),
      pending: collectSummaryLines(summary.nextBestAction || summary.pendingNextStep || summary.pending),
      notes: [
        ...collectSummaryLines(summary.privateNotes || summary.notes),
        ...collectSummaryLines(summary.doNotAskAgain).map((line) => `Do not ask again: ${line}`),
      ],
    });
    if (rendered) return rendered;
  }
  return clean(summary, MAX_SUMMARY_LENGTH);
}

function parseSections(summary: any) {
  const sections: Record<string, string[]> = {};
  for (const title of SECTION_ORDER) sections[title] = [];

  let current = "Current Status";
  for (const rawLine of normalizeCustomerSummaryText(normalizeStoredSummaryText(summary)).split("\n")) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = line.replace(/[:#*]/g, "").trim().toLowerCase();
    const matched = SECTION_ALIASES[heading];
    if (matched) {
      current = matched;
      continue;
    }
    let cleanedLine = line.replace(/^[*-]\s*/, "").trim();
    cleanedLine = cleanedLine.replace(/\b(Current|Timeline|Pending \/ Next step|Future plan|Notes|Current Status|Conversation Timeline|Lead\/Order Details|Next Best Action|Private Notes):\s*/gi, "").trim();
    if (!isInternalSummaryNoise(cleanedLine)) {
      const target = sections[current] || (sections[current] = []);
      target.push(cleanedLine);
    }
  }
  return sections;
}

function addUnique(target: string[], source: string[], limit: number) {
  const seen = new Set(target.map(normalizeLine).filter(Boolean));
  for (const line of source) {
    const normalized = normalizeLine(line);
    if (!normalized || seen.has(normalized)) continue;
    target.push(cleanLine(line, 260));
    seen.add(normalized);
    if (target.length >= limit) break;
  }
}

function extractStableFactLines(text: any, durableOnly = false) {
  const sections = parseSections(cleanCustomerBusinessSummary(text));
  return sections["Current Status"].filter((line) => {
    const normalized = normalizeLine(line);
    if (durableOnly) {
      return /\b(business|clinic|doctor|appointment|use case|important|facts|messages|monthly|voice|text|language|urdu|roman urdu)\b/.test(normalized);
    }
    return /\b(business|clinic|doctor|appointment|use case|important|facts|messages|monthly|product|service|interest|status|language|urdu|roman urdu|pricing|wallet|plan|volume|text|voice|city|address|payment|next step)\b/.test(normalized);
  });
}

export function formatCustomerMemorySummary(input: {
  current?: string[];
  timeline?: string[];
  pending?: string[];
  notes?: string[];
  details?: string[];
}) {
  const sections = {
    "Current Status": Array.isArray(input.current) ? input.current : [],
    "Conversation Timeline": Array.isArray(input.timeline) ? input.timeline : [],
    "Lead/Order Details": Array.isArray(input.details) ? input.details : [],
    "Next Best Action": Array.isArray(input.pending) ? input.pending : [],
    "Private Notes": Array.isArray(input.notes) ? input.notes : [],
  };

  return SECTION_ORDER.map((title) => {
    const rows = (sections as any)[title].map((line: string) => cleanLine(line, 260)).filter(Boolean);
    return rows.length ? `${title}:\n${rows.map((line: string) => `- ${line}`).join("\n")}` : "";
  }).filter(Boolean).join("\n\n").slice(0, MAX_SUMMARY_LENGTH);
}

type MergeCustomerMemorySummaryOptions = {
  preferCandidate?: boolean;
  dropGenericFallbackWhenCandidateSpecific?: boolean;
};

export function mergeCustomerMemorySummary(
  existingSummary: any,
  candidateSummary: any,
  options: MergeCustomerMemorySummaryOptions = {},
) {
  const normalizedExistingSummary = normalizeStoredSummaryText(existingSummary);
  const normalizedCandidateSummary = normalizeStoredSummaryText(candidateSummary);
  const existingIsPolluted = isPollutedCustomerSummaryInput(normalizedExistingSummary);
  const existing = existingIsPolluted
    ? parseSections("")
    : parseSections(cleanCustomerBusinessSummary(normalizedExistingSummary));
  const candidate = parseSections(cleanCustomerBusinessSummary(normalizedCandidateSummary));
  const candidateTimelineSpecific = hasSpecificCustomerSummaryLines(candidate["Conversation Timeline"]);
  const existingTimeline = options.dropGenericFallbackWhenCandidateSpecific && candidateTimelineSpecific
    ? existing["Conversation Timeline"].filter((line) => !isGenericSoftwareFallbackLine(line))
    : existing["Conversation Timeline"];
  const sanitizedCandidateTimeline = candidate["Conversation Timeline"].filter((line) => !isGenericSoftwareFallbackLine(line));
  const sanitizedExistingTimeline = existingTimeline.filter((line) => !isGenericSoftwareFallbackLine(line));
  const orderedCurrentSources = options.preferCandidate
    ? [candidate["Current Status"], existing["Current Status"]]
    : [existing["Current Status"], candidate["Current Status"]];
  const orderedTimelineSources = options.preferCandidate
    ? [sanitizedCandidateTimeline, sanitizedExistingTimeline]
    : [sanitizedExistingTimeline, sanitizedCandidateTimeline];
  const existingStableFacts = extractStableFactLines(normalizedExistingSummary, existingIsPolluted);
  const candidateStableFacts = extractStableFactLines(normalizedCandidateSummary);
  const orderedStableFactSources = options.preferCandidate
    ? [candidateStableFacts, existingStableFacts]
    : [existingStableFacts, candidateStableFacts];

  const merged = parseSections("");
  for (const source of orderedCurrentSources) addUnique(merged["Current Status"], source, 8);
  for (const source of orderedStableFactSources) addUnique(merged["Current Status"], source, 8);

  for (const source of orderedTimelineSources) addUnique(merged["Conversation Timeline"], source, 8);

  addUnique(merged["Lead/Order Details"], candidate["Lead/Order Details"], 8);
  addUnique(merged["Lead/Order Details"], existing["Lead/Order Details"], 8);

  addUnique(merged["Next Best Action"], candidate["Next Best Action"], 4);
  addUnique(merged["Next Best Action"], existing["Next Best Action"], 4);

  addUnique(merged["Private Notes"], existing["Private Notes"], 5);
  addUnique(merged["Private Notes"], candidate["Private Notes"], 5);

  return cleanCustomerBusinessSummary(formatCustomerMemorySummary({
    current: merged["Current Status"],
    timeline: merged["Conversation Timeline"],
    details: merged["Lead/Order Details"],
    pending: merged["Next Best Action"],
    notes: merged["Private Notes"],
  }));
}

export function buildMemoryPromptRules() {
  return `
Customer memory rules:
- Use saved Customer summary and Customer profile before asking questions.
- Do not ask for business type, use case, product, model, color, phone, name, city, address, or payment if already known in saved memory/profile/order state.
- If customer summary says business is clinic/doctors/appointments, continue from that context and never ask business type again.
- If summary says Urdu/Roman Urdu, reply in Urdu/Roman Urdu and do not switch to Hindi.
- Treat image/card/ID extraction as possible context. Use it to fill missing fields only when high confidence or customer confirms it.
- If image has an address but delivery is not confirmed, ask: "Should I use the address shown in the image for delivery?"
- If multiple names/phones appear, ask one short clarification.
`.trim();
}
