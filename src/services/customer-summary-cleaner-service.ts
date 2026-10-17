import { endsWithPartialWord, sentenceSafeTruncate } from "./summary-text-utils-service.ts";

const INTERNAL_PATTERNS = [
  /\bbot replies?\s+(permanently\s+)?stopp?ed\b/i,
  /\bbot replies?\s+stopp?ed\s+for\b/i,
  /\bsource\s*:\s*/i,
  /^\s*fallback summary\s*:?\s*$/i,
  /^\s*(ai|software)\s+summary\s*:?\s*$/i,
  /\bmanual send shortcode\b/i,
  /\bwelcome sequence\s+(skipped|sent|failed|pending)\b/i,
  /\bsequence\s+(skipped|sent|failed|pending)\b/i,
  /\bpending(_|\s)+ai(_|\s)+reply/i,
  /\bretry (queue|cleared|scheduled|paused|resumed|pending)\b/i,
  /\bcustomer language preference saved from\b/i,
  /\bdatabase\b/i,
  /\bwebhook\b/i,
  /\bmessage id\b/i,
  /\bpayment id\b/i,
  /\bwhatsapp id\b/i,
  /\btoken\b/i,
  /\bapi key\b/i,
];
const GENERIC_SOFTWARE_FALLBACK_PATTERNS = [
  /^customer asked for media\/check details\.?$/i,
  /^customer asked for product or service details\.?$/i,
  /^customer asked about price\/options\.?$/i,
  /^customer checked availability\.?$/i,
  /^customer discussed delivery details\.?$/i,
  /^customer discussed order confirmation\.?$/i,
  /^ai replied with sales\/support guidance\.?$/i,
  /^ai shared price or option details\.?$/i,
  /^ai replied\.?$/i,
];
const GENERIC_SOFTWARE_FALLBACK_ANYWHERE_PATTERNS = [
  /\bcustomer asked for media\/check details\b/i,
  /\bcustomer asked for product or service details\b/i,
  /\bcustomer asked about price\/options\b/i,
  /\bcustomer checked availability\b/i,
  /\bcustomer discussed delivery details\b/i,
  /\bcustomer discussed order confirmation\b/i,
  /\bai replied with sales\/support guidance\b/i,
  /\bai shared price or option details\b/i,
  /(^|\s+-\s+)ai replied\.?(?=\s+-\s+|$)/i,
  /\bblackarrow helps businesses with quick replies\b/i,
  /\bblackarrow helps businesses\b.*\b(quick replies|automated replies|save time)\b/i,
  /\bthis summary helps\b/i,
];
const NOISY_SUMMARY_LINE_PATTERNS = [
  /^[*-]?\s*(name|phone)\s*:/i,
  /^[*-]?\s*(product|service)\s*:\s*service request$/i,
  /^[*-]?\s*missing\s*:\s*service$/i,
  /^[*-]?\s*(lead|order)\s+draft is being updated\.?$/i,
  /^[*-]?\s*ask customer what they need\.?$/i,
  /^[*-]?\s*ask only for\s+service\.?$/i,
  /^[*-]?\s*ask only for\s+[a-z]{1,2}\.?$/i,
  /^[*-]?\s*help customer start setup or answer\s+[a-z]{1,3}\.?$/i,
  /^[*-]?\s*.*\bor answer\s+[a-z]{1,3}\.?$/i,
  /^[*-]?\s*delivery\s*:\s*(n\/a|na|not available|not provided|unknown)$/i,
  /^[*-]?\s*(customer|user)\s+said\s*:/i,
  /^[*-]?\s*(ai|assistant|bot)\s+said\s*:/i,
];

const SECTION_HEADING_RE = /^(conversation summary|message-by-message timeline|lead\/business details|instruction-following notes|current|timeline|pending \/ next step|future plan|notes|current status|conversation timeline|lead\/order details|next best action|private notes):$/i;
const USEFUL_PATTERNS = /\b(name|phone|language|product|service|interest|order|lead|state|stage|status|missing|field|question|ask|asked|objection|price|city|address|payment|delivery|next|action|customer|needs|wants|prefers|confirmed|confirmation|waiting|awaiting|pending|incomplete|refund|complaint|business|use case|daily inquiries|important|facts|messages|monthly|volume|students|parents|attendance|homework|school|broadcast|voice|text|plan|wallet|persona|preference|setup|troubleshoot|troubleshooting|error|browser|cookies?)\b/i;
const KNOWN_LABELS = [
  "business/use case",
  "daily inquiries",
  "order/lead state",
  "language preference",
  "do not ask again",
  "name",
  "phone",
  "status",
  "product",
  "service",
  "interest",
  "language",
  "location",
  "delivery",
  "payment",
  "price",
  "city",
  "address",
  "missing",
  "notes",
  "note",
  "plan",
];
const KNOWN_LABEL_PATTERN = KNOWN_LABELS
  .map((label) => label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+"))
  .join("|");
const LABELED_SEGMENT_RE = new RegExp(`\\b(${KNOWN_LABEL_PATTERN})\\s*:`, "i");
const SINGLETON_LABELS = new Set(["name", "phone", "business/use case", "daily inquiries", "order/lead state", "status", "interest", "language", "language preference", "product", "service", "plan"]);

export function normalizeCustomerSummaryText(summary: any) {
  return String(summary || "")
    .replace(/\r\n/g, "\n")
    .replace(/\bPending[ \t]*\/[ \t]*Next[ \t]*step[ \t]*:[ \t]*/gi, "\nPending / Next step:\n")
    .replace(/\bFuture[ \t]+plan[ \t]*:[ \t]*/gi, "\nFuture plan:\n")
    .replace(/\bCurrent[ \t]+Status[ \t]*:[ \t]*/gi, "\nCurrent Status:\n")
    .replace(/\bConversation[ \t]+Timeline[ \t]*:[ \t]*/gi, "\nConversation Timeline:\n")
    .replace(/\bLead[ \t]*\/[ \t]*Order[ \t]+Details[ \t]*:[ \t]*/gi, "\nLead/Order Details:\n")
    .replace(/\bNext[ \t]+Best[ \t]+Action[ \t]*:[ \t]*/gi, "\nNext Best Action:\n")
    .replace(/\bPrivate[ \t]+Notes[ \t]*:[ \t]*/gi, "\nPrivate Notes:\n")
    .replace(/(^|\n)\s*(Current|Timeline|Notes)[ \t]*:[ \t]*/gi, "\n$2:\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanLine(value: any, limit = 260) {
  return sentenceSafeTruncate(String(value || "")
    .replace(/\b(Current|Timeline|Future plan|Notes):\s*-\s*(?=\b(Current|Timeline|Future plan|Notes):)/gi, "$1:")
    .replace(/\b(Current Status|Conversation Timeline|Lead\/Order Details|Next Best Action|Private Notes):\s*-\s*(?=\b(Current Status|Conversation Timeline|Lead\/Order Details|Next Best Action|Private Notes):)/gi, "$1:")
    .replace(/\s+/g, " ")
    .trim(), limit);
}

function cleanFragment(value: any, limit = 500) {
  return cleanLine(value, limit)
    .replace(/^[*-]\s*/, "")
    .replace(/\s+-\s*$/, "")
    .trim();
}

function normalizeLine(value: any) {
  return cleanLine(value)
    .toLowerCase()
    .replace(/^[*-]\s*/, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function splitLabeledSummaryLine(value: string) {
  const raw = cleanLine(value, 800);
  if (!raw) return [];
  const labelPattern = new RegExp(LABELED_SEGMENT_RE.source, "gi");
  const labelMatches = raw.match(labelPattern) || [];
  if (labelMatches.length < 2) return [raw];
  const matches = Array.from(raw.matchAll(new RegExp(LABELED_SEGMENT_RE.source, "gi")));
  return matches.map((match, index) => {
    const start = match.index || 0;
    const end = index + 1 < matches.length ? (matches[index + 1].index || raw.length) : raw.length;
    return cleanFragment(raw.slice(start, end), 500);
  }).filter(Boolean);
}

export function splitEmbeddedSummaryFragments(value: any) {
  const raw = cleanLine(value, 800);
  if (!raw) return [];
  const labeledParts = splitLabeledSummaryLine(raw);
  return labeledParts
    .flatMap((part) => cleanLine(part, 800).split(/\s+-\s+/))
    .map((part) => cleanFragment(part, 500))
    .filter(Boolean);
}

export function isInternalSummaryNoise(value: any) {
  const line = cleanLine(value, 500);
  if (!line) return true;
  return INTERNAL_PATTERNS.some((pattern) => pattern.test(line)) ||
    NOISY_SUMMARY_LINE_PATTERNS.some((pattern) => pattern.test(line)) ||
    hasGenericSoftwareFallbackText(line) ||
    endsWithPartialWord(line);
}

export function isGenericSoftwareFallbackLine(value: any) {
  const line = cleanLine(value, 500).replace(/^[*-]\s*/, "");
  if (!line) return false;
  return GENERIC_SOFTWARE_FALLBACK_PATTERNS.some((pattern) => pattern.test(line));
}

export function hasGenericSoftwareFallbackText(value: any) {
  const line = cleanLine(value, 1000).replace(/^[*-]\s*/, "");
  if (!line) return false;
  return GENERIC_SOFTWARE_FALLBACK_ANYWHERE_PATTERNS.some((pattern) => pattern.test(line));
}

export function isCutoffSummaryFragment(value: any) {
  const line = cleanLine(value, 500).replace(/^[*-]\s*/, "");
  if (!line) return false;
  return NOISY_SUMMARY_LINE_PATTERNS.slice(5).some((pattern) => pattern.test(line)) || endsWithPartialWord(line);
}

export function hasSpecificCustomerSummaryLines(lines: any[] = []) {
  return lines.some((line) => {
    const cleaned = cleanLine(line, 500);
    if (!cleaned || SECTION_HEADING_RE.test(cleaned) || isInternalSummaryNoise(cleaned) || isGenericSoftwareFallbackLine(cleaned)) {
      return false;
    }
    return USEFUL_PATTERNS.test(cleaned);
  });
}

export function cleanCustomerBusinessSummary(summary: any, maxLength = 1200) {
  const seen = new Set<string>();
  const seenSingletonLabels = new Set<string>();
  const lines: string[] = [];
  for (const raw of normalizeCustomerSummaryText(summary).split("\n")) {
    for (const candidate of splitEmbeddedSummaryFragments(raw)) {
      const line = cleanLine(candidate);
      if (/^-+$/.test(line)) continue;
      const normalized = normalizeLine(line);
      if (!line || !normalized || seen.has(normalized) || isInternalSummaryNoise(line) || isGenericSoftwareFallbackLine(line)) continue;
      if (!SECTION_HEADING_RE.test(line) && !USEFUL_PATTERNS.test(line)) continue;
      const label = line.match(/^[*-]?\s*([a-z ]+)\s*:/i)?.[1]?.toLowerCase().trim() || "";
      if (label && SINGLETON_LABELS.has(label)) {
        if (seenSingletonLabels.has(label)) continue;
        seenSingletonLabels.add(label);
      }
      lines.push(line);
      seen.add(normalized);
    }
  }
  const pruned: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!SECTION_HEADING_RE.test(line)) {
      pruned.push(line);
      continue;
    }
    const nextContent = lines.slice(index + 1).find((candidate) => candidate.trim());
    if (!nextContent || SECTION_HEADING_RE.test(nextContent)) continue;
    pruned.push(line);
  }
  return sentenceSafeTruncate(pruned.join("\n").replace(/\n{3,}/g, "\n\n").trim(), maxLength, true);
}
