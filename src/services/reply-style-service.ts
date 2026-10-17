import type { CustomerResponsePlan } from "./customer-response-planner-service.ts";
import {
  GLOBAL_WHATSAPP_RESPONSE_FORMAT_POLICY,
  CONCISE_WHATSAPP_REPLY_RULES,
  normalizeAiGeneratedWhatsAppReply,
} from "./whatsapp-ai-response-style-service.ts";

export { GLOBAL_WHATSAPP_RESPONSE_FORMAT_POLICY, CONCISE_WHATSAPP_REPLY_RULES };

function splitSentences(text: string) {
  return text.match(/[^.!?\u06d4]+[.!?\u06d4]+|[^.!?\u06d4]+$/g) || [text];
}

function isFillerSentence(sentence: string) {
  const lower = sentence.trim().toLowerCase();
  return [
    "thank you",
    "thanks for",
    "contacting us",
    "reaching out",
    "definitely help",
    "happy to help",
    "i can help",
  ].some(phrase => lower.includes(phrase));
}

function endsLikeCompleteThought(text: string) {
  const clean = String(text || "").trim();
  if (!clean) return false;
  return /[.!?\u06d4؟)!*"'”’~`]$/u.test(clean) ||
    /https?:\/\/\S+$/i.test(clean) ||
    /^(?:-\s+|\d+\.\s+|[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s+)/u.test(clean) ||
    /\b(\d+|[A-Za-z0-9_-]+|\$\d+|rs\.?\s*\d+|pkr\s*\d+|month|monthly|year|yearly|day|days|delivery|today|now|yes|no|ok|okay|sure|thanks|welcome|hai|hain|ho|hoga|hogi|gaya|gayi|diya|dein|karein|chahiye|milay|ga|gi|available)\b/i.test(clean);
}

function isShortHelpfulReplyWithoutTerminalPunctuation(text: string) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return false;
  return true;
}

function joinCompleteSentences(sentences: string[], maxChars: number) {
  let joined = "";
  for (const sentence of sentences) {
    const clean = sentence.trim();
    if (!clean) continue;
    const next = `${joined} ${clean}`.trim();
    if (joined && next.length > maxChars) break;
    joined = next;
    if (joined.length >= maxChars) break;
  }
  return joined.trim();
}

function stripUnsafeFormatting(text: string) {
  return text
    .replace(/```[\s\S]*?```/g, "")
    .replace(/<table[\s\S]*?<\/table>/gi, "")
    .replace(/<[^>\n]+>/g, "")
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      if (/^(?:[-*_]\s*){3,}$/u.test(trimmed)) return false;
      const pipeCount = (trimmed.match(/\|/g) || []).length;
      return pipeCount < 2 && !/^\s*\|?[\s:-]*\|[\s|:-]*$/.test(trimmed);
    })
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, ""))
    .join("\n");
}

export function stripMarkdownTextWrappers(text: any) {
  let next = String(text || "");
  const leftBoundary = String.raw`(^|[\s([{"'“‘>.,;:!?-])`;
  const rightBoundary = String.raw`(?=$|[\s)\]}"'”’<.,;:!?-])`;
  next = next.replace(new RegExp(`${leftBoundary}(\\*\\*|__)(?=\\S)([^\\n]*?\\S)\\2${rightBoundary}`, "g"), "$1$3");
  next = next.replace(new RegExp(`${leftBoundary}([*_])(?=\\S)([^*_\\n]*?\\S)\\2${rightBoundary}`, "g"), "$1$3");
  return next;
}

const INTERNAL_REASONING_PATTERNS = [
  /\bthe user (is asking|asked|wants|needs|is looking|provided)\b/i,
  /\bi need to\b/i,
  /\bi should\b/i,
  /\bi will (answer|respond|state|explain|ask|tell)\b/i,
  /\bwe need to\b/i,
  /\bbusiness training says\b/i,
  /\bi (cannot|can't) invent\b/i,
  /\bi (do not|don't) have enough information to invent\b/i,
  /\baccording to (the )?(system|prompt|instructions|business training)\b/i,
  /\binternal (reasoning|analysis|note|instruction)\b/i,
  /\btool (call|result|note)\b/i,
];

export function containsInternalReasoning(text: any) {
  const value = String(text || "").trim();
  if (!value) return false;
  return INTERNAL_REASONING_PATTERNS.some((pattern) => pattern.test(value));
}

function removeInternalReasoningLines(text: string) {
  return text
    .split("\n")
    .filter((line) => {
      const trimmed = line.trim();
      if (!trimmed) return true;
      return !containsInternalReasoning(trimmed);
    })
    .join("\n");
}

const WHATSAPP_BULLET_PREFIX_RE = /^(?:-\s+|[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s+)/u;

function isWhatsappBulletLine(value: string) {
  return WHATSAPP_BULLET_PREFIX_RE.test(String(value || "").trim());
}

function normalizeWhatsappLine(line: string) {
  if (/(https?:\/\/|www\.|\S+@\S+)/i.test(line)) {
    return line.replace(/[ \t]+/g, " ").trim();
  }
  return line
    .replace(/[ \t]+/g, " ")
    .replace(/^\s*\*\s+/, "- ")
    .replace(/^\s*-\s+/, "- ")
    .replace(/^\s*([\u2022\u2705\u2B50\u{1F7E2}\u{1F680}])\s*/u, "$1 ")
    .replace(/^(\d+)[).]\s+/, "$1. ")
    .replace(/^((?:[-]\s+|\d+\.\s+)?)([A-Z][A-Za-z0-9 /&()'-]{2,32}):\s*(.+)$/u, (_match, prefix, label, rest) => {
      const cleanLabel = String(label || "").replace(/^\*+|\*+$/g, "").trim();
      if (!cleanLabel || cleanLabel.length > 32) return `${prefix}${label}: ${rest}`;
      return `${prefix}*${cleanLabel}:* ${String(rest || "").trim()}`;
    })
    .replace(/^((?:-\s+|[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s+)?)(?!\*)([A-Z][A-Za-z0-9 /&()'-]{2,32})(\s+-\s+.+)$/u, (_match, prefix, title, detail) => {
      if (!/(\$|rs\.?|pkr|\bper\b|\bmonth\b|\bmonthly\b|\byear\b|\byearly\b|\bbest for\b|\bincludes\b|\badds\b|\bwith\b|\bwithout\b|\bsupport\b|\bservice\b|\bplan\b|\bpackage\b|\boption\b)/i.test(detail)) {
        return `${prefix}${title}${detail}`;
      }
      return `${prefix}*${title}*${detail}`;
    })
    .trim();
}

function splitBlobIntoReadableLines(text: string) {
  let next = text;
  next = next.replace(/(?<!\d)([.!?\u06d4])\s+((?:[A-Z][A-Za-z0-9 /&()'-]{2,32}|[A-Z][A-Za-z0-9 /&()'-]{2,32}\s+Plan):)/g, "$1\n$2");
  next = next.replace(/:\s+((?:[A-Z][A-Za-z0-9 /&()'-]{2,32}|[A-Z][A-Za-z0-9 /&()'-]{2,32}\s+Plan):)/g, ":\n$1");
  next = next.replace(/:\s+((?:[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s*)?(?:\*?[A-Z][A-Za-z0-9 /&()'-]{1,24}(?:\s+[A-Z][A-Za-z0-9 /&()'-]{1,24}){0,2}\*?)\s+-\s+(?:[$€£]\s*\d|Rs\.?\s*\d|PKR\s*\d))/gu, ":\n\n$1");
  next = next.replace(/([.!?]|(?:[$€£]|Rs\.?|PKR)\s*\d[^\n]{0,24})\s+((?:[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s*)?(?:\*?[A-Z][A-Za-z0-9 /&()'-]{1,24}(?:\s+[A-Z][A-Za-z0-9 /&()'-]{1,24}){0,2}\*?)\s+-\s+(?:[$€£]\s*\d|Rs\.?\s*\d|PKR\s*\d))/gu, "$1\n\n$2");
  return next;
}

function countNumberedListItems(text: string) {
  return (String(text || "").match(/(?:^|\n)\s*\d+\.\s+/g) || []).length;
}

export function containsBadListFormatting(text: any) {
  const value = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!value) return false;
  const numberedItems = (value.match(/\b\d+\.\s+/g) || []).length;
  if (/\b\d+\.\s*(?:Dr|Mr|Mrs|Ms|Prof)\s*\n+\s*[^\n]+/i.test(value)) return true;
  if (/(?:^|\n)\s*(?:Dr|Mr|Mrs|Ms|Prof)\.?\s*$/im.test(value)) return true;
  if (numberedItems >= 3 && /(?:^|\n)[^\n]*(?:\d+\.\s+\S[\s\S]{0,140}?\d+\.\s+\S)/.test(value)) return true;
  if (numberedItems >= 3 && value.length > 180 && !/\n{2,}/.test(value)) return true;
  return false;
}

function isStructuredReplyLine(line: string) {
  const value = String(line || "").trim();
  if (!value) return false;
  if (/^\d+\.\s+/.test(value) || isWhatsappBulletLine(value)) return true;
  if (/^\*[^*\n]{1,40}:\*\s*\S/.test(value)) return true;
  if (/^[A-Z][^.!?\n]{1,80}:$/.test(value)) return true;
  if (/^([A-Z][A-Za-z0-9 /&()'-]{1,40}):\s*\S/.test(value)) return true;
  return false;
}

function endsWithJoinableTitle(line: string) {
  return /\b(?:Dr|Mr|Mrs|Ms|Prof)\.$/i.test(String(line || "").trim());
}

function endsWithJoinableConnector(line: string) {
  return /\b(?:with|for|to|from|of|at|in|on|and|or|the|a|an|your|our|their|preferred)\s*$/i.test(String(line || "").trim());
}

function looksLikeContinuationLine(previous: string, next: string) {
  const prev = String(previous || "").trim();
  const current = String(next || "").trim();
  if (!prev || !current) return false;
  if (isStructuredReplyLine(prev) || isStructuredReplyLine(current)) return false;
  if (/(https?:\/\/|www\.|\S+@\S+)/i.test(prev) || /(https?:\/\/|www\.|\S+@\S+)/i.test(current)) return false;
  if (endsWithJoinableTitle(prev) || endsWithJoinableConnector(prev)) return true;
  if (/[.!?:\u06d4]$/.test(prev)) return false;
  if (/^(\d+\.|\*|-|•|[A-Z\u0600-\u06FF])/.test(current)) return false;
  if (/^[a-z0-9]/.test(current)) return true;
  return false;
}

function mergeBrokenReplyLines(text: string) {
  const rawLines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const merged: string[] = [];

  for (let index = 0; index < rawLines.length; index += 1) {
    const current = normalizeWhatsappLine(rawLines[index] || "");

    if (!current) {
      if (merged.length && merged[merged.length - 1] !== "") {
        merged.push("");
      }
      continue;
    }

    const previous = merged[merged.length - 1] || "";
    if (previous && previous !== "" && looksLikeContinuationLine(previous, current)) {
      merged[merged.length - 1] = `${previous} ${current}`.replace(/\s+/g, " ").trim();
      continue;
    }
    merged.push(current);
  }

  return merged.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function repairBrokenListTitleLines(text: string) {
  return String(text || "")
    .replace(/(^|\n)(\d+\.\s*)(Dr|Mr|Mrs|Ms|Prof)\.?\s*\n+\s*([^\n]+)/gi, (_match, prefix, item, title, name) => `${prefix}${item}${title}. ${name}`.replace("..", "."))
    .replace(/\b(Dr|Mr|Mrs|Ms|Prof)\.?\s*\n+\s*([^\n]+)/gi, (_match, title, name) => `${title}. ${name}`.replace("..", "."));
}

function expandCompressedNumberedLists(text: string) {
  const value = String(text || "");
  if ((value.match(/\b\d+\.\s+/g) || []).length < 3) return value;
  return value.replace(
    /([^\n])\s+(\d+\.\s+(?=(?:\*|Dr\.?|Mr\.?|Mrs\.?|Ms\.?|Prof\.?|[A-Z\u0600-\u06FF])))/g,
    "$1\n\n$2"
  );
}

function splitListItemTitleAndDetail(content: string) {
  const cleaned = stripMarkdownTextWrappers(String(content || "").trim()).replace(/\s+/g, " ").trim();
  if (!cleaned) return { title: "", detail: "" };
  const separated = cleaned.match(/^(.{2,90}?)(?:\s*(?:-|–|—|:|,)\s+)(.{2,220})$/u);
  if (separated) {
    return { title: separated[1].trim(), detail: separated[2].trim() };
  }
  const paren = cleaned.match(/^(.{2,90}?)\s*\((.{2,180})\)$/u);
  if (paren) {
    return { title: paren[1].trim(), detail: paren[2].trim() };
  }
  return { title: cleaned, detail: "" };
}

function formatNumberedListLayout(text: string) {
  const normalized = String(text || "").replace(/\r\n/g, "\n");
  if (countNumberedListItems(normalized) < 3) return normalized;
  const lines = normalized.split("\n");
  const formatted: string[] = [];
  const numberedIndexes = lines
    .map((line, index) => (/^\s*\d+\.\s+/.test(line) ? index : -1))
    .filter((index) => index >= 0);
  const longList = numberedIndexes.length >= 4;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const match = line.match(/^\s*(\d+)\.\s+(.+)$/);
    if (!match) {
      formatted.push(line);
      continue;
    }
    const rawContent = match[2].trim();
    const { title, detail } = splitListItemTitleAndDetail(rawContent);
    const targetTitle = title || rawContent;
    const safeTitle = targetTitle ? `*${targetTitle.replace(/^\*+|\*+$/g, "")}*` : "";
    formatted.push(`${match[1]}. ${safeTitle}`.trim());
    if (detail) {
      formatted.push(`   ${detail}`);
    }
    if (longList) {
      formatted.push("");
    }
  }

  return formatted.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function stripMarkdownTextWrappersPerLine(line: string) {
  if (
    /^\d+\.\s+\*[^*\n]{2,100}\*(?:\s|$)/.test(String(line || "").trim()) ||
    /^(?:-\s+|[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s+)\*[^*\n]{2,100}\*/u.test(String(line || "").trim()) ||
    /^\*[^*\n]{1,40}:\*\s*\S/.test(String(line || "").trim()) ||
    /^\*[A-Z][A-Za-z0-9 /&()'-]{1,40}\*(?:\s+-\s+|\s|$)/.test(String(line || "").trim()) ||
    /^(?!.*\*\*|\b__)(?=.*\*[^*\n]{1,100}\*)[^\n`]+$/.test(String(line || "").trim())
  ) {
    return String(line || "");
  }
  return stripMarkdownTextWrappers(line);
}

const CUSTOMER_SHORTCUT_REPLACEMENTS: Record<string, string> = {
  appt: "appointment",
  appts: "appointments",
  doc: "doctor",
  docs: "doctors",
  pls: "please",
  plz: "please",
  u: "you",
  ur: "your",
  info: "information",
  msg: "message",
  asap: "as soon as possible",
};

function preserveUrlsAndEmails(text: string) {
  const preserved: string[] = [];
  // Strip markdown wrappers directly around URLs before tokenizing
  const unwrapped = String(text || "").replace(/(\*{1,2}|_{1,2})((?:https?:\/\/|www\.)\S+?)\1/gi, "$2");
  const value = unwrapped.replace(/((?:https?:\/\/|www\.)\S+|\b\S+@\S+\b)/gi, (match) => {
    const token = `__PRESERVED_${preserved.length}__`;
    preserved.push(match);
    return token;
  });
  return {
    value,
    restore(input: string) {
      return String(input || "").replace(/__PRESERVED_(\d+)__/g, (_match, index) => preserved[Number(index)] || "");
    },
  };
}

function matchShortcutCasing(source: string, replacement: string) {
  if (source.toUpperCase() === source) return replacement.toUpperCase();
  if (source[0] && source[0] === source[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

function expandCommonCustomerShortcuts(text: string) {
  const preserved = preserveUrlsAndEmails(text);
  const replaced = preserved.value.replace(/\b(appt|appts|doc|docs|pls|plz|u|ur|info|msg|asap)\b/gi, (match) => {
    const replacement = CUSTOMER_SHORTCUT_REPLACEMENTS[match.toLowerCase()];
    return replacement ? matchShortcutCasing(match, replacement) : match;
  });
  return preserved.restore(replaced);
}

function classifyReplyStage(line: string) {
  const normalized = String(line || "").toLowerCase().replace(/\s+/g, " ").trim();
  if (!normalized) return "neutral";
  if (/\b(please share|may i know|what is|what's|which|kindly share|tell me|patient'?s gender|phone number)\b/.test(normalized)) return "ask_field";
  if (/\b(payment proof|payment screenshot|share screenshot|bank transfer|jazzcash|easypaisa|advance payment)\b/.test(normalized)) return "payment";
  if (/\b(your appointment details are|order confirmed|appointment confirmed|please confirm if everything is correct|summary)\b/.test(normalized)) return "summary";
  if (/\b(cancel|reschedule|change timing|change details)\b/.test(normalized)) return "edit";
  return "neutral";
}

function keepSafestSingleStageReply(text: string) {
  const paragraphs = String(text || "").replace(/\r\n/g, "\n").split(/\n{2,}/).map((item) => item.trim()).filter(Boolean);
  if (paragraphs.length < 2) return text;
  const stages = paragraphs.map(classifyReplyStage);
  const primaryStage = stages.find((stage) => stage !== "neutral") || "";
  if (!primaryStage) return text;
  const distinctStages = Array.from(new Set(stages.filter((stage) => stage !== "neutral")));
  if (distinctStages.length < 2) return text;

  const kept: string[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    const stage = stages[index];
    if (!kept.length || stage === "neutral" || stage === primaryStage) {
      kept.push(paragraphs[index]);
      continue;
    }
    break;
  }
  return kept.join("\n\n").trim() || text;
}

function shouldParagraphizeSentenceBlob(line: string, sentenceLines: string[]) {
  if (/^\d+\.\s+/.test(line) || isWhatsappBulletLine(line)) return false;
  if (sentenceLines.length < 2) return false;
  if (/(https?:\/\/|www\.)/i.test(line)) return false;
  if (line.length > 220) return true;

  const lastSentence = sentenceLines[sentenceLines.length - 1] || "";
  const endsWithQuestion = /[?؟]\s*$/.test(lastSentence);
  return sentenceLines.length >= 3 || (endsWithQuestion && line.length > 90);
}

function buildReadableParagraphs(line: string, sentenceLines: string[]) {
  if (/^\d+\.\s+/.test(line) || isWhatsappBulletLine(line)) return [line];
  if (sentenceLines.length < 2) return [line];
  if (/(https?:\/\/|www\.|\S+@\S+)/i.test(line)) return [line];

  const normalizedSentences = sentenceLines
    .map((sentence) => normalizeWhatsappLine(sentence))
    .filter(Boolean);
  if (normalizedSentences.length < 2) return [line];

  const singleParagraph = normalizedSentences.join(" ");
  const lastSentence = normalizedSentences[normalizedSentences.length - 1] || "";
  const endsWithQuestion = /[?؟]\s*$/.test(lastSentence);

  if (endsWithQuestion && normalizedSentences.length >= 2 && singleParagraph.length > 110) {
    const leadParagraph = normalizedSentences.slice(0, -1).join(" ").trim();
    if (leadParagraph.length >= 60) return [leadParagraph, lastSentence];
  }

  if (normalizedSentences.length >= 4 && singleParagraph.length > 260) {
    const midpoint = Math.ceil(normalizedSentences.length / 2);
    const firstParagraph = normalizedSentences.slice(0, midpoint).join(" ").trim();
    const secondParagraph = normalizedSentences.slice(midpoint).join(" ").trim();
    if (firstParagraph.length >= 60 && secondParagraph.length >= 40) {
      return [firstParagraph, secondParagraph];
    }
  }

  return [singleParagraph];
}

export function formatWhatsappReply(text: string) {
  const stripped = stripUnsafeFormatting(String(text || "").replace(/\r\n/g, "\n"));
  const expanded = expandCommonCustomerShortcuts(stripped);
  const listRepaired = formatNumberedListLayout(repairBrokenListTitleLines(expandCompressedNumberedLists(expanded)));
  const readable = mergeBrokenReplyLines(splitBlobIntoReadableLines(listRepaired))
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!readable) return "";

  const rawLines = readable.split("\n");
  const formattedLines: string[] = [];

  for (const rawLine of rawLines) {
    const line = normalizeWhatsappLine(rawLine);
    if (!line) {
      if (formattedLines.length && formattedLines[formattedLines.length - 1] !== "") {
        formattedLines.push("");
      }
      continue;
    }
    const hasUrlOrEmail = /(https?:\/\/|www\.|\S+@\S+)/i.test(line);
    const sentenceLines = hasUrlOrEmail
      ? [line]
      : splitSentences(line).map((sentence) => sentence.trim()).filter(Boolean);
    const paragraphs = (!hasUrlOrEmail && shouldParagraphizeSentenceBlob(line, sentenceLines))
      ? buildReadableParagraphs(line, sentenceLines)
      : [line];
    if (paragraphs.length > 1) {
      paragraphs.forEach((paragraph, index) => {
        if (index > 0) formattedLines.push("");
        formattedLines.push(paragraph);
      });
      continue;
    }
    formattedLines.push(paragraphs[0] || line);
  }

  const sectionedLines: string[] = [];
  const isDetailLine = (value: string) => /^(?:\d+\.\s+|-\s+|[\u2022\u2705\u2B50\u{1F7E2}\u{1F680}]\s+)?(?:\*[^*]{2,40}:\*|[A-Z][A-Za-z0-9 /&()'-]{1,40}:)\s*\S*/u.test(value);

  for (const line of formattedLines) {
    const previous = sectionedLines[sectionedLines.length - 1] || "";
    const previousContent = [...sectionedLines].reverse().find(Boolean) || "";
    if (line && line.endsWith(":") && previous && !previousContent.endsWith(":")) {
      sectionedLines.push("");
    } else if (line && isDetailLine(line) && previous && !isDetailLine(previousContent) && previousContent.endsWith(":")) {
      sectionedLines.push("");
    } else if (line && previous && !isDetailLine(line) && isDetailLine(previousContent)) {
      sectionedLines.push("");
    }
    sectionedLines.push(line);
  }

  const result = sectionedLines
    .join("\n")
    .split("\n")
    .map((line) => stripMarkdownTextWrappersPerLine(line))
    .join("\n");

  return normalizeAiGeneratedWhatsAppReply(result);
}

function countNonEmptyLines(text: string) {
  return String(text || "").replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean).length;
}

function trimReplyToCharBudget(text: string, maxChars: number) {
  const value = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!value || value.length <= maxChars) return value;
  const sentences = splitSentences(value.replace(/\n+/g, " "));
  const usefulSentences = sentences.filter(sentence => !isFillerSentence(sentence));
  const sentencePool = usefulSentences.length > 0 ? usefulSentences : sentences;
  return (joinCompleteSentences(sentencePool, maxChars) || value.slice(0, maxChars)).trim();
}

function trimReplyToLineBudget(text: string, maxNonEmptyLines: number) {
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let nonEmpty = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      if (nonEmpty >= maxNonEmptyLines) break;
      nonEmpty += 1;
      kept.push(trimmed);
      continue;
    }
    if (kept.length && kept[kept.length - 1] !== "") kept.push("");
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function trimReplyToSectionBudget(text: string, maxSections: number) {
  if (!maxSections || maxSections < 1) return String(text || "").trim();
  return String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((section) => section.trim())
    .filter(Boolean)
    .slice(0, maxSections)
    .join("\n\n")
    .trim();
}

function trimReplyToBulletBudget(text: string, maxBullets: number) {
  if (!maxBullets || maxBullets < 1) return String(text || "").trim();
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let bulletCount = 0;
  for (const line of lines) {
    const trimmed = line.trim();
    const isBullet = /^\d+\.\s+/.test(trimmed) || isWhatsappBulletLine(trimmed);
    if (isBullet) {
      if (bulletCount >= maxBullets) break;
      bulletCount += 1;
    }
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function isSetupScopeLine(line: string) {
  const plain = stripMarkdownTextWrappers(String(line || "")).toLowerCase();
  return /^\d+\.\s+/.test(String(line || "").trim())
    || /\b(setup|process|steps?|simple|create|scan|connect|install|configure|onboard|activate|book|booking|order|checkout|enroll|register|account|whatsapp|automatic|automatically|no coding needed|starts replying)\b/.test(plain);
}

function isPricingScopeLine(line: string) {
  const plain = stripMarkdownTextWrappers(String(line || "")).toLowerCase();
  return /(\$|rs\.?|pkr|\bprice\b|\bpricing\b|\bcost\b|\bcharges?\b|\bfee\b|\bmonthly\b|\byearly\b)/.test(plain);
}

function isScopeAvoidLine(line: string, responsePlan: CustomerResponsePlan) {
  const plain = stripMarkdownTextWrappers(String(line || "")).toLowerCase();
  if (responsePlan.scope === "setup_process") {
    return /(\$|rs\.?|pkr|\bprice\b|\bpricing\b|\bplan\b|\bpackage\b|\bcatalog\b|\bcomparison\b|\bavailable options\b|\bfull access\b)/.test(plain);
  }
  if (responsePlan.scope === "pricing_direct") {
    return /\b(setup|process|steps?|how it works|how does it work|onboard|connect|install)\b/.test(plain);
  }
  return false;
}

function isPreScopeNoiseLine(line: string, responsePlan: CustomerResponsePlan) {
  const plain = stripMarkdownTextWrappers(String(line || "")).toLowerCase();
  if (responsePlan.scope === "setup_process") {
    return /\b(here are|available)\b/.test(plain) && /\b(plans|packages|options|pricing|catalog)\b/.test(plain);
  }
  if (responsePlan.scope === "pricing_direct") {
    return /\b(setup|process|steps)\b/.test(plain) && !isPricingScopeLine(line);
  }
  return false;
}

function enforceScopedReplyFocus(text: string, responsePlan: CustomerResponsePlan | null | undefined) {
  if (!responsePlan) return String(text || "").trim();
  if (responsePlan.scope !== "setup_process" && responsePlan.scope !== "pricing_direct") return String(text || "").trim();
  const lines = String(text || "").replace(/\r\n/g, "\n").split("\n");
  const kept: string[] = [];
  let closingQuestion = "";
  let sawScopedContent = false;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (kept.length && kept[kept.length - 1] !== "") kept.push("");
      continue;
    }
    if (trimmed.endsWith("?")) {
      closingQuestion ||= trimmed;
      continue;
    }
    const scopedLine = responsePlan.scope === "setup_process"
      ? isSetupScopeLine(trimmed)
      : isPricingScopeLine(trimmed);
    if (scopedLine) {
      sawScopedContent = true;
      kept.push(trimmed);
      continue;
    }
    if (isScopeAvoidLine(trimmed, responsePlan)) continue;
    if (!sawScopedContent && isPreScopeNoiseLine(trimmed, responsePlan)) continue;
    if (!sawScopedContent && kept.length < 2) {
      kept.push(trimmed);
      continue;
    }
    if (sawScopedContent && kept.length < Math.max(3, responsePlan.maxBullets + 2)) {
      kept.push(trimmed);
    }
  }

  if (closingQuestion && responsePlan.shouldAskFollowup) kept.push("", closingQuestion);
  const focused = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return focused || String(text || "").trim();
}

function getPlanCharBudget(responsePlan: CustomerResponsePlan | null | undefined, maxChars: number) {
  if (!responsePlan) return maxChars;
  if (responsePlan.maxChars > 0) return Math.min(maxChars, responsePlan.maxChars);
  if (responsePlan.answerDepth === "short") return Math.min(maxChars, 450);
  if (responsePlan.answerDepth === "medium") return Math.min(maxChars, 800);
  return maxChars;
}

function getPlanLineBudget(responsePlan: CustomerResponsePlan | null | undefined) {
  if (!responsePlan) return 0;
  if (responsePlan.maxBullets > 0 && responsePlan.maxSections > 0) return responsePlan.maxBullets + responsePlan.maxSections + 1;
  if (responsePlan.answerDepth === "short") return 6;
  if (responsePlan.answerDepth === "medium") return 10;
  return 0;
}

export function makeWhatsappReplyConcise(text: string, maxChars = 1200, responsePlan?: CustomerResponsePlan | null) {
  const normalized = stripUnsafeFormatting(String(text || ""))
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return "";

  let candidate = normalized;
  const effectiveMaxChars = getPlanCharBudget(responsePlan, maxChars);
  if (candidate.length > effectiveMaxChars) candidate = trimReplyToCharBudget(candidate, effectiveMaxChars);
  const formatted = formatWhatsappReply(endsLikeCompleteThought(candidate) ? candidate : normalized);
  if (!formatted) return "";
  const scoped = enforceScopedReplyFocus(formatted, responsePlan);
  const sectionTrimmed = responsePlan?.maxSections && responsePlan?.formatStyle !== "whatsapp_steps"
    ? trimReplyToSectionBudget(scoped, responsePlan.maxSections)
    : scoped;
  const bulletTrimmed = responsePlan?.maxBullets ? trimReplyToBulletBudget(sectionTrimmed, responsePlan.maxBullets) : sectionTrimmed;
  const lineBudget = getPlanLineBudget(responsePlan);
  const lineTrimmed = lineBudget > 0 && countNonEmptyLines(bulletTrimmed) > lineBudget
    ? trimReplyToLineBudget(bulletTrimmed, lineBudget)
    : bulletTrimmed;
  return lineTrimmed.length > effectiveMaxChars ? trimReplyToCharBudget(lineTrimmed, effectiveMaxChars) : lineTrimmed;
}

export function sanitizeCustomerFacingReply(text: any, options?: { latestCustomerText?: string; responsePlan?: CustomerResponsePlan | null }) {
  let cleaned = String(text || "")
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/```[\s\S]*?```/g, "")
    .replace(/^\s*(thinking|think|reasoning|analysis|internal note|tool note)\s*[:：-][\s\S]*?(?:\n\s*\n|$)/i, "")
    .replace(/^\s*(thinking|reasoning|analysis)\s*\.\.\.\s*/i, "")
    .replace(/\n\s*(thinking|reasoning|analysis|internal note)\s*[:：-][\s\S]*$/i, "")
    .trim();

  const lines = cleaned.split("\n").filter((line) => {
    const lower = line.trim().toLowerCase();
    if (!lower) return true;
    return !/^(thinking|reasoning|analysis|internal note|tool note)\s*[:：-]?/.test(lower);
  });

  cleaned = removeInternalReasoningLines(lines.join("\n")).trim();
  if (containsInternalReasoning(cleaned)) return "";
  cleaned = expandCommonCustomerShortcuts(cleaned);
  cleaned = keepSafestSingleStageReply(cleaned);
  return makeWhatsappReplyConcise(cleaned, 1200, options?.responsePlan || null);
}

export function isCustomerVisibleToolMetaText(text: any) {
  const cleaned = String(text || "")
    .replace(/\r\n/g, "\n")
    .trim();
  if (!cleaned) return false;
  const normalized = cleaned
    .toLowerCase()
    .replace(/[\[\](){}<>*_~`"'.,!?;:|\\/+-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^\s*\[(voice note|sent media|media|tool result|tool call)\]/i.test(cleaned)) return true;
  if (/^(voice note|sent media|media|tool result|tool call)\b/.test(normalized) && normalized.length <= 160) return true;
  if (/\b(tool result|tool call|function call|internal note)\b/.test(normalized)) return true;
  if (normalized.length <= 180 && /\b(i ve|i have|we have|i just|we just)?\s*sent\s+(you\s+)?(a\s+)?voice\s+(note|message)\b/.test(normalized)) return true;
  if (normalized.length <= 180 && /\bvoice\s+(note|message)\s+(sent|delivered)\b/.test(normalized)) return true;
  return false;
}

const INCOMPLETE_TRAILING_WORDS = new Set([
  "and",
  "or",
  "but",
  "because",
  "with",
  "for",
  "to",
  "ke",
  "k",
  "ki",
  "ka",
  "ko",
  "aur",
  "ya",
  "lekin",
  "magar",
  "kyunke",
]);

function hasDanglingTrailingQuestionStarter(text: string) {
  const lines = text.replace(/\r\n/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
  const lastLine = lines[lines.length - 1] || "";
  const trimmed = lastLine.trim();
  if (!trimmed) return false;
  if (/[?؟.!۔!*~`)]$/u.test(trimmed)) return false;
  if (/https?:\/\/\S+$/i.test(trimmed)) return false;

  const normalized = trimmed
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s']/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return false;
  const strippedLead = normalized.replace(/^(?:(?:sure|ok|okay|yes|ji|hello|hi|dear|thanks|thank you|welcome)\s*,?\s*)+/i, "");
  const strippedWords = strippedLead.split(/\s+/);
  if (strippedWords.length <= 4 && /^(how|how can|would you like to|can you please|please share|do you want to|could you|may i|let me know if|would you|can you|which|what|where|when|why|please tell me which|tell me which)\b/i.test(strippedLead)) {
    return true;
  }
  return false;
}

export function isProbablyIncompleteCustomerReply(text: any) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return true;
  if (cleaned.endsWith("...")) return true;
  if (/(\.\.\.|[,;:،\/\\])$/.test(cleaned)) return true;
  if (hasDanglingTrailingQuestionStarter(cleaned)) return true;
  if (/\b(hope you'?|hope you'?re doing|interested in|looking for|wanted to|need help with|we can definitely|to help|regarding|about|because|kyunke|lekin|magar|which)$/i.test(cleaned)) return true;
  const doubleQuotes = (cleaned.match(/"/g) || []).length;
  if (doubleQuotes % 2 !== 0 && !/[.!?]$/.test(cleaned)) return true;
  const singleQuotes = (cleaned.match(/(?:^|\s)'[^'\n]*$/g) || []).length;
  if (singleQuotes > 0 && !/[.!?]$/.test(cleaned)) return true;
  const lastWord = cleaned.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").trim().split(/\s+/).pop() || "";
  if (INCOMPLETE_TRAILING_WORDS.has(lastWord)) return true;
  if (cleaned.length > 900 && !endsLikeCompleteThought(cleaned) && !/[?؟.!۔*)\s]$/.test(cleaned)) {
    return true;
  }
  return false;
}

export function isIncompleteOrderSummaryReply(text: any) {
  const cleaned = String(text || "").replace(/\r\n/g, "\n").trim();
  if (!cleaned) return false;
  const lower = cleaned.toLowerCase();
  const summaryHeader = /\b(order\s+(details?|summary)|final\s+summary|order\s+confirmation)\b/i.test(cleaned);
  if (!summaryHeader) return false;

  const signals = [
    /\b(name|customer)\b/i.test(cleaned),
    /\b(phone|contact|whatsapp|mobile|number)\b/i.test(cleaned),
    /\b(address|delivery|location|city)\b/i.test(cleaned),
    /\b(payment|cod|cash|paid|advance|total|amount|price|rs\.?|pkr|\$)\b/i.test(cleaned),
    /\b(quantity|qty|pieces?|items?)\b/i.test(cleaned),
  ].filter(Boolean).length;
  const contentLines = cleaned.split("\n").map((line) => line.trim()).filter(Boolean);
  if (contentLines.length <= 3 && signals < 3) return true;
  return signals < 3 && /\b(product|bike|cover|large|small|medium|size|color|colour)\b/i.test(lower);
}

export function buildCompleteReplyRepairPrompt(input: {
  latestCustomerText: string;
  incompleteReply: string;
  language: string;
  orderSummaryBlocked?: boolean;
}) {
  if (input.orderSummaryBlocked) {
    return `
The assistant draft below is an incomplete order summary. Do not send an order summary yet.
Using the conversation context, ask only for the single next missing order detail.
Reply in ${input.language || "the selected customer language"}.
Output only one customer-facing WhatsApp message.

Customer message:
${input.latestCustomerText || ""}

Assistant draft:
${input.incompleteReply || ""}
`.trim();
  }
  return `
Answer the latest customer message directly as one complete self-contained WhatsApp reply.
Keep the same customer language (${input.language || "customer language"}) and business facts.
Do not continue from the broken sentence fragment. Do not output internal analysis.

Customer message:
${input.latestCustomerText || ""}

Assistant draft:
${input.incompleteReply || ""}
`.trim();
}

export function buildReasoningBlockedFallback(_language: string, _latestCustomerText: any) {
  return "";
}
