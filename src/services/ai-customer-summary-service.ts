import { compactAiText } from "./ai-cost-control-service.ts";
import {
  cleanCustomerBusinessSummary,
  hasSpecificCustomerSummaryLines,
  isGenericSoftwareFallbackLine,
} from "./customer-summary-cleaner-service.ts";
import { mergeCustomerMemorySummary } from "./customer-memory-merge-service.ts";
import { buildCustomerStateSummary } from "./customer-state-extractor-service.ts";
import { cleanOrderFieldValue } from "./order-field-value-service.ts";
import type { GeminiProviderContext } from "./gemini-provider-service.ts";
import { sentenceSafeTruncate } from "./summary-text-utils-service.ts";
import { buildNormalizedSummaryProfileFacts, compactSummary, reduceRecentMessages } from "./ai-context-reducer-service.ts";
import { generateBackendText } from "./ai-text-provider-service.ts";

type AiCustomerSummaryInput = {
  existingSummary?: string;
  profile?: any;
  history?: Array<{ role?: string; text?: string; timestamp?: number }>;
  latestOrder?: any;
  state?: any;
  customFields?: any[];
  softwareSummary: string;
  providerContext?: GeminiProviderContext;
};

type GenerateJsonOptions = {
  maxOutputTokens?: number;
};

type AiCustomerSummaryDeps = {
  generateJson?: (prompt: string, systemInstruction: string, options?: GenerateJsonOptions) => Promise<any>;
  logger?: Pick<Console, "warn" | "error">;
};

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

export { renderAiCustomerSummaryJson } from './customer-summary-renderer.ts';
import { renderAiCustomerSummaryJson } from './customer-summary-renderer.ts';

function buildRequiredJsonShapeInstruction() {
  return `Required JSON shape:
{
  "currentStatus": [],
  "conversationTimeline": [],
  "leadOrderDetails": [],
  "nextBestAction": [],
  "privateNotes": [],
  "languagePreference": "",
  "doNotAskAgain": []
}`;
}

function buildAiSummarySystemInstruction(strictCompact = false) {
  return `
You generate compact CRM memory for a WhatsApp customer.
Return JSON only. Do not paste transcript. Do not invent missing fields.
Use only confirmed or high-confidence facts from profile, saved summary, order/lead state, and recent chat.
Do not include customer name or phone because those are already stored separately.
Never use filler values like ji, ok, yes, unknown city, or customer provided address as real fields.
Never output raw transcript labels such as "Customer said:" or "AI said:".
Never output generic BlackArrow marketing copy. Keep only facts about this customer.
Never chain multiple labels in one string. Put Business/use case, Interest, Daily inquiries, Order/lead state, Status, Language, Missing, Product, Service, Plan, Price, City, Address, and Notes into separate strings.
Use Current Status, Conversation Timeline, Lead/Order Details, Next Best Action, and Private Notes.
Timeline should be chronological, message-by-message where possible, and include both customer asks and bot/AI/human replies when useful.
For custom plan conversations, capture business type/use case, setup interest, missing qualification info, and whether signup/setup links were shared.
Prefer latest verified recent chat over old saved summary when the old summary conflicts with current messages.
Use at most 8 currentStatus items, 8 conversationTimeline items, 8 leadOrderDetails items, 4 nextBestAction items, and 5 privateNotes.
Every prose timeline, pending, or note item must be a complete sentence.
Do not mark an order confirmed unless structured order/lead state says it is confirmed/complete.
Preserve old important facts such as business/use case, clinic/doctors/appointments, language preference, and do-not-ask-again notes.
JSON fields: currentStatus, conversationTimeline, leadOrderDetails, nextBestAction, privateNotes, businessOrUseCase, productOrServiceInterest, orderLeadState, missingDetails, optionalMissingDetails, languagePreference, doNotAskAgain.
All list fields must be arrays of short strings.
${buildRequiredJsonShapeInstruction()}
${strictCompact ? "Return only compact JSON. No explanation. No markdown. Max 5 current status facts, max 6 timeline items, max 4 detail/action/note items." : ""}
`.trim();
}

function buildAiSummaryPrompt(input: AiCustomerSummaryInput, strictCompact = false) {
  const perLineLimit = strictCompact ? 140 : 180;
  const existingSummaryContext = compactSummary(stripGenericFallbackLines(input.existingSummary || "", 1000), strictCompact ? 700 : 1000);
  const softwareSummaryContext = compactSummary(stripGenericFallbackLines(input.softwareSummary || "", 700), strictCompact ? 450 : 650);
  const historyText = reduceRecentMessages(input.history || [], strictCompact ? 6 : 8)
    .map((item) => `${item.role === "user" ? "Customer" : "Bot"}: ${clean(item.text, perLineLimit)}`)
    .filter(Boolean)
    .join("\n");
  const profileFacts = buildNormalizedSummaryProfileFacts({
    profile: input.profile,
    latestOrder: input.latestOrder,
    state: input.state,
    customFields: input.customFields,
  });
  return `
Existing saved summary:
${compactAiText(existingSummaryContext, strictCompact ? 700 : 1000)}

Useful stable facts from software fallback summary only:
${compactAiText(softwareSummaryContext, strictCompact ? 500 : 900)}

Structured customer/order state:
${compactAiText(input.state ? buildCustomerStateSummary({
  businessContacts: [],
  cardExtractedPhones: [],
  missingCustomFields: [],
  customFields: {},
  ...input.state,
}) : "", strictCompact ? 600 : 800)}

Normalized profile facts:
${compactAiText(JSON.stringify(profileFacts), strictCompact ? 700 : 1000)}

Recent visible chat:
${compactAiText(historyText, strictCompact ? 900 : 1200)}

${strictCompact ? "Return only compact JSON. No explanation. No markdown. Max 5 current status facts, max 6 timeline items, max 4 detail/action/note items." : "Return only the JSON summary object."}
Never repeat generic fallback lines like "Customer asked for media/check details", "AI replied with sales/support guidance", or "AI shared price or option details" if more specific facts are available.
`.trim();
}

async function defaultGenerateJson(prompt: string, systemInstruction: string, options: GenerateJsonOptions = {}) {
  const providerContext = (options as any).providerContext as GeminiProviderContext | undefined;
  const response = await generateBackendText({
    purpose: providerContext?.purpose || "ai_customer_summary",
    accountId: providerContext?.accountId || providerContext?.userId,
    botId: providerContext?.botId || providerContext?.dataOwnerKey,
    customerJid: providerContext?.billingContext?.customerJid,
    stablePrompt: systemInstruction,
    latestCustomerMessage: prompt,
    maxTokens: options.maxOutputTokens || DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS,
    jsonMode: true,
  });
  const resolvedText = response?.text || "";
  if (response.requestStatus !== "success" || !resolvedText) {
    const error: any = new Error(response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked");
    error.code = response.fallbackReason || response.requestStatus || "deepinfra_unavailable_text_generation_blocked";
    throw error;
  }
  if (!String(resolvedText || "").trim().endsWith("}")) {
    throw new Error("truncated_ai_summary_json");
  }
  return resolvedText;
}

function shouldRetryAiSummary(error: any) {
  const reason = String(error?.code || error?.message || "").toLowerCase();
  return [
    "invalid_ai_summary_json",
    "empty_ai_summary",
    "empty_rendered_ai_summary",
    "truncated_ai_summary_json",
    "unexpected end of json input",
  ].some((token) => reason.includes(token));
}

export async function buildAiCustomerChatSummary(input: AiCustomerSummaryInput, deps: AiCustomerSummaryDeps = {}) {
  const generateJson = deps.generateJson || defaultGenerateJson;
  let rendered = "";
  let lastError: any = null;

  const attempts = SUMMARY_AI_RETRY_ON_BAD_JSON ? [false, true] : [false];
  for (const [attemptIndex, strictCompact] of attempts.entries()) {
    try {
      const raw = await generateJson(
        buildAiSummaryPrompt(input, strictCompact),
        buildAiSummarySystemInstruction(strictCompact),
        {
          maxOutputTokens: strictCompact ? RETRY_SUMMARY_MAX_OUTPUT_TOKENS : DEFAULT_SUMMARY_MAX_OUTPUT_TOKENS,
          ...(input.providerContext ? { providerContext: input.providerContext } : {}),
        } as any,
      );
      rendered = renderAiCustomerSummaryJson(raw);
      lastError = null;
      break;
    } catch (error: any) {
      lastError = error;
      if (SUMMARY_AI_RETRY_ON_BAD_JSON && attemptIndex === 0 && shouldRetryAiSummary(error)) {
        deps.logger?.warn?.(`[CustomerSummaryAI] retry reason=${error?.code || error?.message || "unknown"}`);
        continue;
      }
      throw error;
    }
  }

  if (!rendered) throw lastError || new Error("empty_rendered_ai_summary");
  return cleanCustomerBusinessSummary(
    mergeCustomerMemorySummary(input.existingSummary || "", rendered, {
      preferCandidate: true,
      dropGenericFallbackWhenCandidateSpecific: true,
    }),
    2500,
  );
}

export async function buildCustomerChatSummaryWithAiFallback(input: AiCustomerSummaryInput, deps: AiCustomerSummaryDeps = {}) {
  try {
    const summary = await buildAiCustomerChatSummary(input, deps);
    if (summary) return { summary, source: "ai" as const, reason: "" };
  } catch (error: any) {
    deps.logger?.warn?.(`[CustomerSummaryAI] fallback reason=${error?.code || error?.message || "unknown"}`);
  }
  return {
    summary: cleanCustomerBusinessSummary(
      mergeCustomerMemorySummary(input.existingSummary || "", input.softwareSummary || ""),
      2500,
    ),
    source: "software_fallback" as const,
    reason: "ai_summary_unavailable",
  };
}
