const KEYWORD_LABEL_RE = /^(keywords?|triggers?|intent keywords?|send when|when to send)\s*[:：-]\s*/i;

function splitKeywordText(value: any) {
  return String(value || "")
    .split(/[,;|\n\u060C\u066B\u061B]+/)
    .map(item => item.replace(KEYWORD_LABEL_RE, "").trim())
    .filter(Boolean);
}

function normalizeForUnique(value: any) {
  return String(value || "")
    .toLowerCase()
    .replace(/[\u200B-\u200D\uFEFF]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isUsableKeyword(value: any) {
  const normalized = normalizeForUnique(value);
  if (!normalized) return false;
  if (/^\d+$/.test(normalized)) return normalized.length >= 2;
  return normalized.length >= 2;
}

export function getSequenceIntentKeywords(config: any) {
  const rawCandidates = [
    config?.trigger_keywords,
    config?.triggers,
    config?.keywords,
  ];
  const triggerList: string[] = [];
  for (const c of rawCandidates) {
    if (Array.isArray(c)) {
      triggerList.push(c.join("\n"));
    } else if (typeof c === "string") {
      triggerList.push(c);
    }
  }
  const rawTriggerKeywords = triggerList.join("\n");
  const rawInstructions = String(config?.instructions || "");
  const rawKeywords = [
    ...splitKeywordText(rawTriggerKeywords),
    ...splitKeywordText(rawInstructions),
  ];

  const seen = new Set<string>();
  const keywords: string[] = [];
  for (const keyword of rawKeywords) {
    const normalized = normalizeForUnique(keyword);
    if (!isUsableKeyword(keyword) || seen.has(normalized)) continue;
    seen.add(normalized);
    keywords.push(keyword);
  }
  return keywords;
}
