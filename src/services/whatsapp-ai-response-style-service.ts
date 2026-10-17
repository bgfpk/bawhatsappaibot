/**
 * Central WhatsApp AI Response Style Policy & Output Normalizer
 *
 * Provides platform-wide formatting rules, prompt assembly policy,
 * and deterministic output normalization for AI-generated WhatsApp replies.
 */

export const GLOBAL_WHATSAPP_RESPONSE_FORMAT_POLICY = `
WHATSAPP FORMATTING & READABILITY RULES (PLATFORM POLICY):
- Never produce a dense wall of text. Mobile readers need clean visual structure.
- Always separate distinct ideas, distinct answers, sections, and questions with a natural blank line (two newlines).
- Keep normal paragraphs short: 1-3 concise sentences.
- When listing items, features, options, or differences, use clear bullet points starting with a dash or bullet (- Item: details).
- When providing sequential instructions, steps, or troubleshooting procedures, use numbered lines (1. Step one\\n2. Step two\\n3. Step three). Never combine ordered steps into a comma-separated sentence.
- When discussing prices: clearly separate item names and prices on their own lines or in bullet points (e.g. *Starter*\\n$9/month, or - *Starter*: $9/month). Distinguish monthly, annual, and usage fees. Do not bury prices inside a paragraph. Do not dump the entire catalog unless requested.
- When the customer asks multiple distinct questions, answer each question separately with a blank line between answers.
- Use single-asterisk WhatsApp bold (*text*) sparingly for important titles, plan/product names, prices, statuses, or labels.
- Do NOT use Markdown headings (#, ##, ###), markdown tables, HTML, or code fences.
- Do NOT overuse emojis. Use 0-3 emojis naturally only when helpful.
- Simple short answers must remain simple short answers. Do NOT add unnecessary headings, bullets, or lists to a 1-sentence response.
- In sales/lead conversations: answer the specific inquiry first, give relevant supporting details, and ask 1-2 useful follow-up questions to continue naturally.
- Language consistency: Generate all text and labels in the customer's active language (English, Urdu, Roman Urdu, Arabic, etc.). Never insert English labels into non-English conversations.
- Output only the final customer-facing message without internal thoughts or tool metadata.
`.trim();

export const CONCISE_WHATSAPP_REPLY_RULES = GLOBAL_WHATSAPP_RESPONSE_FORMAT_POLICY;

/**
 * Converts markdown table text to clean WhatsApp lines/bullets.
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
      // Check if separator line e.g. |---|---|
      if (cells.every((c) => /^:?-+:?$/.test(c))) {
        inTable = true;
        continue;
      }
      if (!inTable) {
        // This is header line
        headers = cells;
        inTable = true;
      } else {
        // Data row
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
 * Deterministic safe output normalizer for WhatsApp text.
 * Converts markdown formatting to WhatsApp native formatting (*bold*),
 * handles headings, tables, code blocks, URLs, and multi-language text.
 */
export function formatWhatsAppResponse(text: any): string {
  if (!text) return "";
  let value = String(text);

  // 1. Normalize line endings (CRLF / CR -> LF)
  value = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // 2. Protect URLs, emails, and phone numbers from regex mangling
  const protectedTokens: string[] = [];
  const protect = (match: string) => {
    const placeholder = `@@@PROTECTEDTOKEN${protectedTokens.length}@@@`;
    protectedTokens.push(match);
    return placeholder;
  };

  // Protect URLs
  value = value.replace(/https?:\/\/[^\s<>)"]+/gi, protect);
  // Protect email addresses
  value = value.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, protect);
  // Protect phone numbers with country code (+92 3xx xxx xxxx)
  value = value.replace(/(?:\+?\d{1,3}[-.\s]?)?\(?\d{2,4}\)?[-.\s]?\d{3,4}[-.\s]?\d{3,4}/g, (match) => {
    // Only protect if it looks like a valid phone number (>= 8 digits)
    const digits = match.replace(/\D/g, "");
    if (digits.length >= 8 && digits.length <= 15) {
      return protect(match);
    }
    return match;
  });

  // 3. Convert markdown tables
  value = convertMarkdownTables(value);

  // 4. Strip code fences while preserving text content
  value = value.replace(/```[a-zA-Z]*\n?([\s\S]*?)```/g, "$1");
  value = value.replace(/`([^`\n]+)`/g, "$1");

  // 5. Remove HTML tags, converting <br> to newline
  value = value.replace(/<br\s*\/?>/gi, "\n");
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

  // 8. Normalize markdown bold/triple-star/double-star/unclosed-bold:
  // Normalize triple-asterisk or quad-asterisk: ***Title*** -> *Title*
  value = value.replace(/\*{3,}([^*\n]+)\*{3,}/g, "*$1*");
  // Normalize standard double-asterisk: **Title** -> *Title*
  value = value.replace(/\*\*([^*\n]+)\*\*/g, "*$1*");
  // Normalize double-underscore: __Title__ -> *Title*
  value = value.replace(/__([^_\n]+)__/g, "*$1*");

  // Normalize unclosed markdown bold at start of heading/line (e.g. "📊 **Business Performance & Sales" -> "📊 *Business Performance & Sales*")
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

  // Replace any remaining double-asterisk pairs or stray **
  value = value.replace(/\*\*/g, "*");
  value = value.replace(/__/g, "_");

  // 9. Normalize bullets: convert '* ' at start of line to '• ' (or '- ' to '• ')
  value = value.replace(/^(\s*)\*\s+/gm, "$1• ");

  // 10. Clean up trailing spaces per line
  value = value
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""))
    .join("\n");

  // 11. Cap excessive blank lines (3+ consecutive newlines -> 2 newlines)
  value = value.replace(/\n{3,}/g, "\n\n");

  // 12. Restore protected tokens
  for (let i = 0; i < protectedTokens.length; i++) {
    const placeholder = `@@@PROTECTEDTOKEN${i}@@@`;
    value = value.replace(placeholder, protectedTokens[i]);
  }

  return value.trim();
}

export const normalizeAiGeneratedWhatsAppReply = formatWhatsAppResponse;

/**
 * Prepares text for text-to-speech synthesis by stripping visual formatting symbols
 * without altering spoken wording, punctuation flow, or language.
 */
export function cleanTextForTts(text: any): string {
  if (!text) return "";
  let value = String(text);

  // Normalize line breaks
  value = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

  // Strip code blocks and HTML
  value = value
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<[^>\n]+>/g, "");

  // Strip markdown headers (# )
  value = value.replace(/^#{1,6}\s+/gm, "");

  // Strip bold/italic/strikethrough markers (*text* -> text, _text_ -> text, ~text~ -> text)
  value = value.replace(/[*_~`]+/g, "");

  // Convert bullet points (- item, • item) to plain line content for clean speech
  value = value.replace(/^[\s]*[-•*]\s+/gm, "");

  // Convert numbered lists (1. item) to natural pause (1, item)
  value = value.replace(/^(\s*\d+)\.\s+/gm, "$1, ");

  // Clean URLs for speech: replace https://domain.com/path with domain
  value = value.replace(/https?:\/\/(?:www\.)?([a-zA-Z0-9.-]+)(?:\/\S*)?/gi, "$1");

  // Collapse excess inline whitespace
  value = value.replace(/[ \t]+/g, " ");
  value = value.replace(/\n{3,}/g, "\n\n");

  return value.trim();
}
