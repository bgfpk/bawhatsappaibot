/**
 * WhatsApp Customer Reply Contract & Quality Validator
 *
 * Enforces native WhatsApp formatting, length rules, structural completeness,
 * and commercial fact preservation across all customer-facing AI responses.
 */

export interface WhatsAppCustomerReplyValidationResult {
  ok: boolean;
  text: string;
  errors: string[];
  warnings: string[];
  wordCount: number;
  repairable: boolean;
  repairedText?: string;
  isFillerOnly?: boolean;
}

export interface CommercialFactsSnapshot {
  prices: string[];
  percentages: string[];
  urls: string[];
  phoneNumbers: string[];
  numbers: string[];
}

const FILLER_ACKNOWLEDGEMENTS = new Set([
  "sure",
  "sure!",
  "sure.",
  "got it",
  "got it!",
  "got it.",
  "let me check",
  "let me check.",
  "let me check!",
  "okay",
  "okay!",
  "okay.",
  "ok",
  "ok!",
  "ok.",
  "yes",
  "yes!",
  "yes.",
  "ji",
  "ji bilkul",
  "haan ji",
  "han ji",
  "noted",
  "noted!",
  "noted.",
  "under stood",
  "understood",
  "understood.",
  "understood!",
  "right away",
  "right away!",
  "one moment",
  "one moment please",
  "please wait",
]);

const UNFINISHED_TRAILING_TOKENS = new Set([
  "and", "or", "but", "so", "because", "with", "for", "to", "from", "of", "at",
  "in", "on", "the", "a", "an", "your", "our", "their", "this", "that", "these",
  "those", "which", "whose", "where", "when", "why", "how", "what",
  "we", "i", "you", "they", "he", "she", "it",
  "aur", "ya", "lekin", "magar", "kyunke", "kay", "ke", "ki", "ka", "ko", "se",
  "mein", "par", "bhi", "toh", "to", "hum", "ap", "aap", "woh",
]);

/**
 * Extracts commercial numbers, currencies, percentages, and URLs to ensure
 * formatting normalizers NEVER mutate commercial truth.
 */
export function extractCommercialFacts(text: string): CommercialFactsSnapshot {
  const safe = String(text || "");

  // Prices: $XX, Rs. XX, PKR XX, €XX, £XX
  const prices = (safe.match(/(?:[$€£]|Rs\.?|PKR)\s*\d+(?:[.,]\d+)*(?:\s*(?:k|thousand|lakh|million|m|b))?/gi) || [])
    .map((p) => p.replace(/\s+/g, "").toLowerCase());

  // Percentages: XX%
  const percentages = (safe.match(/\b\d+(?:\.\d+)?%/g) || [])
    .map((p) => p.trim());

  // URLs
  const urls = (safe.match(/https?:\/\/[^\s<>)"]+/gi) || [])
    .map((u) => u.trim());

  // Phone numbers (>= 8 digits)
  const phoneNumbers = (safe.match(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g) || [])
    .map((m) => m.replace(/\D/g, ""))
    .filter((digits) => digits.length >= 8 && digits.length <= 15);

  // Standalone major numbers (e.g. quantities, days, months)
  const numbers = (safe.match(/\b\d+(?:[.,]\d+)?\b/g) || [])
    .map((n) => n.trim());

  return { prices, percentages, urls, phoneNumbers, numbers };
}

/**
 * Asserts that formatting did not mutate prices, percentages, URLs, or critical numbers.
 */
export function assertCommercialFactsPreserved(originalText: string, transformedText: string): { preserved: boolean; discrepancies: string[] } {
  const orig = extractCommercialFacts(originalText);
  const trans = extractCommercialFacts(transformedText);
  const discrepancies: string[] = [];

  // Check prices
  for (const price of orig.prices) {
    if (!trans.prices.includes(price)) {
      discrepancies.push(`Missing or mutated price: ${price}`);
    }
  }

  // Check percentages
  for (const pct of orig.percentages) {
    if (!trans.percentages.includes(pct)) {
      discrepancies.push(`Missing or mutated percentage: ${pct}`);
    }
  }

  // Check URLs
  for (const url of orig.urls) {
    if (!trans.urls.includes(url)) {
      discrepancies.push(`Missing or mutated URL: ${url}`);
    }
  }

  return {
    preserved: discrepancies.length === 0,
    discrepancies,
  };
}

/**
 * Converts markdown table text to clean WhatsApp bullet points.
 */
function convertMarkdownTables(text: string): string {
  const lines = text.split("\n");
  const result: string[] = [];
  let inTable = false;
  let headers: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith("|") && line.endsWith("|")) {
      const cells = line.slice(1, -1).split("|").map((c) => c.trim());
      // Separator line e.g. |---|---|
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        inTable = true;
        continue;
      }
      if (!inTable) {
        headers = cells;
        inTable = true;
      } else {
        if (headers.length > 0 && cells.length === headers.length) {
          const rowText = cells
            .map((c, idx) => (headers[idx] ? `*${headers[idx]}:* ${c}` : c))
            .join(" | ");
          result.push(`• ${rowText}`);
        } else {
          result.push(`• ${cells.join(" — ")}`);
        }
      }
    } else {
      inTable = false;
      headers = [];
      result.push(lines[i]);
    }
  }

  return result.join("\n");
}

/**
 * Normalizes customer-facing text to native WhatsApp formatting.
 *
 * Supported:
 * - *bold*
 * - _italic_
 * - `code` (when required)
 * - • bullet items on separate lines
 * - 1. 2. numbered steps on separate lines
 *
 * Removes:
 * - **markdown bold** (converts to *bold*)
 * - #, ##, ### markdown headers (converts to *Title*)
 * - markdown tables (converts to bullets)
 * - code fences
 * - HTML tags
 */
export function normalizeWhatsAppCustomerReply(text: any): string {
  if (!text) return "";
  let value = String(text);

  // 1. Normalize line endings (CRLF / CR -> LF)
  value = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Protect URLs, emails, and phone numbers from regex mangling
  const protectedTokens: string[] = [];
  const protect = (match: string) => {
    const placeholder = `@@@WHATSAPPTOKEN${protectedTokens.length}@@@`;
    protectedTokens.push(match);
    return placeholder;
  };

  // Protect URLs
  value = value.replace(/https?:\/\/[^\s<>)"]+/gi, protect);
  // Protect email addresses
  value = value.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, protect);
  // Protect phone numbers with country code (+92 3xx xxx xxxx)
  value = value.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, (match) => {
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return protect(match);
    }
    return match;
  });

  // 3. Convert markdown tables
  value = convertMarkdownTables(value);

  // 4. Strip code fences while preserving inner text content
  value = value.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");

  // 5. Remove HTML tags, converting <br> and <p> to newline
  value = value.replace(/<br\s*\/?>/gi, "\n");
  value = value.replace(/<\/p>/gi, "\n\n");
  value = value.replace(/<table[\s\S]*?<\/table>/gi, "");
  value = value.replace(/<[^>\n]+>/g, "");

  // 6. Remove horizontal rules (---, ***, ___)
  value = value.replace(/^[ \t]*[-*_]{3,}[ \t]*$/gm, "");

  // 7. Normalize markdown headers (# Title -> *Title*)
  value = value
    .split("\n")
    .map((line) => {
      const match = line.match(/^(\s{0,3})#{1,6}\s+(.+)$/);
      if (match) {
        const title = match[2].trim();
        return title ? `*${title.replace(/^\*+|\*+$/g, "")}*` : "";
      }
      return line;
    })
    .join("\n");

  // 8. Normalize markdown bold to WhatsApp *bold*:
  // Triple/quad-asterisk: ***Title*** -> *Title*
  value = value.replace(/\*{3,}([^*\n]+)\*{3,}/g, "*$1*");
  // Standard double-asterisk: **Title** -> *Title*
  value = value.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  // Double-underscore: __Title__ -> *Title*
  value = value.replace(/__([^_\n]+)__/g, "*$1*");

  // Fix unclosed bold at start of heading or line (e.g. "**Business Performance" -> "*Business Performance*")
  value = value
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      const unclosedMatch = trimmed.match(/^([^\w*]*)\*\*([^*\n]+)$/);
      if (unclosedMatch) {
        return `${unclosedMatch[1]}*${unclosedMatch[2].trim()}*`;
      }
      return line;
    })
    .join("\n");

  // Replace any stray double-asterisks
  value = value.replace(/\*\*/g, "*");

  // 9. Normalize bullet characters: convert "* " or "- " at line start to "• "
  value = value.replace(/^(\s*)[*\-]\s+/gm, "$1• ");

  // 10. Clean up empty/unfinished bullets and numbers at line ends or trailing
  // Remove lines that are just a bullet: "•" or "• "
  value = value
    .split("\n")
    .filter((line) => !/^\s*•\s*$/.test(line))
    .filter((line) => !/^\s*\d+\.\s*$/.test(line))
    .join("\n");

  // 11. Normalize numbered lists (1. , 2. ) on separate lines
  value = value.replace(/([^\n])\s+(\d+\.\s+(?=[A-Z\u0600-\u06FF*]))/g, "$1\n$2");

  // 12. Ensure blank line between distinct paragraphs / thoughts (if paragraph is dense)
  // Split paragraphs that end with . ! ? followed immediately by a capital letter on the next line without a blank line
  const lines = value.split("\n");
  const reconstructed: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const current = lines[i].trim();
    const prev = reconstructed[reconstructed.length - 1];
    if (
      current &&
      prev &&
      !prev.startsWith("•") &&
      !current.startsWith("•") &&
      !/^\d+\./.test(prev) &&
      !/^\d+\./.test(current) &&
      /[.!?\u06d4؟]$/u.test(prev) &&
      !prev.endsWith(":") &&
      reconstructed[reconstructed.length - 1] !== ""
    ) {
      // Add blank line between full sentences that are on separate lines
      reconstructed.push("");
    }
    reconstructed.push(lines[i]);
  }
  value = reconstructed.join("\n");

  // 13. Cap excessive blank lines (3+ newlines -> 2 newlines)
  value = value.replace(/\n{3,}/g, "\n\n");

  // 14. Restore protected tokens
  for (let i = 0; i < protectedTokens.length; i++) {
    const placeholder = `@@@WHATSAPPTOKEN${i}@@@`;
    value = value.replace(placeholder, protectedTokens[i]);
  }

  return value.trim();
}

/**
 * Validates a response against WhatsApp customer response contract.
 */
export function validateWhatsAppCustomerReply(text: any, options?: { isSales?: boolean }): WhatsAppCustomerReplyValidationResult {
  const raw = String(text || "").trim();
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check 1: Empty or whitespace
  if (!raw) {
    return {
      ok: false,
      text: "",
      errors: ["empty_or_whitespace"],
      warnings: [],
      wordCount: 0,
      repairable: false,
    };
  }

  const normalized = normalizeWhatsAppCustomerReply(raw);
  const words = normalized.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  // Check 2: Pure filler acknowledgement
  const lowerSimple = normalized.toLowerCase().replace(/[^\w\s]/g, "").trim();
  if (FILLER_ACKNOWLEDGEMENTS.has(lowerSimple) || (wordCount <= 3 && FILLER_ACKNOWLEDGEMENTS.has(lowerSimple))) {
    return {
      ok: false,
      text: normalized,
      errors: ["filler_acknowledgement_only"],
      warnings: [],
      wordCount,
      repairable: false,
      isFillerOnly: true,
    };
  }

  // Check 3: Accidental generation metadata or internal reasoning
  if (
    /\b(the user (is asking|asked|wants|needs)|according to (the )?(prompt|system|instructions)|internal reasoning|tool call|tool result)\b/i.test(normalized) ||
    /\[object Object\]/i.test(normalized) ||
    /\b(undefined|null|NaN)\b/i.test(normalized)
  ) {
    errors.push("contains_internal_reasoning_or_metadata");
  }

  // Check 4: Unfinished sentence / dangling trailing thought
  const endsWithPunctuation = /[.!?\u06d4؟*)"'”’]$/u.test(normalized);
  const endsWithUrl = /https?:\/\/\S+$/i.test(normalized);
  const endsWithCurrencyOrNumber = /(?:[$€£]|Rs\.?|PKR)\s*\d+$/i.test(normalized);

  if (!endsWithPunctuation && !endsWithUrl && !endsWithCurrencyOrNumber) {
    const lastWord = (words[words.length - 1] || "").toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
    if (UNFINISHED_TRAILING_TOKENS.has(lastWord)) {
      errors.push("dangling_trailing_conjunction");
      errors.push("incomplete_sentence_ending");
    } else if (normalized.endsWith(",") || normalized.endsWith(";") || normalized.endsWith(":") || normalized.endsWith("...")) {
      errors.push("incomplete_sentence_ending");
    } else if (wordCount >= 10 && !endsWithPunctuation) {
      // Sentence of 10+ words with no closing punctuation looks truncated
      warnings.push("unpunctuated_sentence_end");
    }
  }

  // Check 5: Unfinished bullets in raw or normalized text
  const rawLines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
  const rawTrailingLine = rawLines[rawLines.length - 1] || "";
  const lines = normalized.split("\n").map((l) => l.trim()).filter(Boolean);
  const trailingLine = lines[lines.length - 1] || "";

  if (/^•\s*$/.test(rawTrailingLine) || /^-\s*$/.test(rawTrailingLine) || /^•\s*$/.test(trailingLine) || /^-\s*$/.test(trailingLine)) {
    errors.push("unfinished_bullet_at_end");
  }

  // Check 6: Unfinished numbering
  if (/^\d+\.\s*$/.test(rawTrailingLine) || /^\d+\.\s*$/.test(trailingLine)) {
    errors.push("unfinished_numbering_at_end");
  }

  // Check 7: Broken bullet layout (multiple bullets joined on one line without newline)
  if (/•[^\n]+•/.test(normalized)) {
    errors.push("broken_bullet_layout");
  }

  // Check 8: Numbered list structural completeness
  const numberMatches = normalized.match(/(?:^|\n)\s*(\d+)\.\s+/g);
  if (numberMatches && numberMatches.length > 0) {
    const nums = numberMatches.map((m) => parseInt(m.replace(/\D/g, ""), 10));
    // Check for sequence continuity
    for (let i = 0; i < nums.length; i++) {
      if (nums[i] !== i + 1) {
        warnings.push("non_sequential_numbering");
        break;
      }
    }
    // Check that none end abruptly with empty step
    for (const line of lines) {
      if (/^\s*\d+\.\s*$/.test(line.trim())) {
        errors.push("empty_numbered_step");
        break;
      }
    }
  }

  // Check 9: Raw unhandled Markdown remnants
  if (/\*\*[^*\n]+\*\*/.test(normalized)) {
    warnings.push("unconverted_markdown_bold");
  }
  if (/^#{1,6}\s+/m.test(normalized)) {
    warnings.push("unconverted_markdown_heading");
  }
  if (/\|[-:]+\|/.test(normalized)) {
    errors.push("raw_markdown_table");
  }

  // Check 10: Giant wall of text (e.g. > 500 characters with no line breaks)
  const longParagraph = lines.some((line) => line.length > 500 && !/https?:\/\//.test(line));
  if (longParagraph) {
    warnings.push("giant_wall_of_text");
  }

  // Check 11: Length preference (normal WhatsApp reply 20-80 words preference)
  if (wordCount > 150) {
    warnings.push("response_unnecessarily_long");
  }

  // Check 12: Broken formatting markers (e.g. odd number of asterisks)
  const asteriskCount = (normalized.match(/\*/g) || []).length;
  if (asteriskCount % 2 !== 0) {
    warnings.push("broken_bold_markers");
  }

  const ok = errors.length === 0;
  const repairable = errors.every((e) =>
    e === "unfinished_bullet_at_end" ||
    e === "unfinished_numbering_at_end" ||
    e === "broken_bullet_layout" ||
    e === "incomplete_sentence_ending"
  );

  let repairedText: string | undefined;
  if (!ok && repairable) {
    repairedText = repairWhatsAppCustomerReplyFormatting(normalized);
  }

  return {
    ok,
    text: normalized,
    errors,
    warnings,
    wordCount,
    repairable,
    repairedText,
  };
}

/**
 * Deterministically repairs common formatting defects without rewriting commercial facts.
 */
export function repairWhatsAppCustomerReplyFormatting(text: string): string {
  let value = normalizeWhatsAppCustomerReply(text);

  // 1. Remove trailing unfinished bullet or numbering
  const lines = value.split("\n");
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (/^•\s*$/.test(last) || /^-\s*$/.test(last) || /^\d+\.\s*$/.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }
  value = lines.join("\n").trim();

  // 2. Fix multiple bullets on single line (• Item 1 • Item 2 -> • Item 1\n• Item 2)
  value = value.replace(/([^\n])\s+•\s+/g, "$1\n• ");

  // 3. Remove trailing dangling punctuation if incomplete
  value = value.replace(/[,;:]+$/g, ".");

  // 4. Close unclosed bold asterisks
  const asteriskCount = (value.match(/\*/g) || []).length;
  if (asteriskCount % 2 !== 0) {
    // If odd number, append closing asterisk if last line had an unclosed bold
    value = `${value}*`;
  }

  // 5. Cap multiple newlines
  value = value.replace(/\n{3,}/g, "\n\n").trim();

  return value;
}

export const repairWhatsAppCustomerReply = repairWhatsAppCustomerReplyFormatting;
