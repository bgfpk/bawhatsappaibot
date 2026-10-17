const SENTENCE_END_RE = /[.!?؟۔][)"'\]]?$/;

function clean(value: any, preserveLineBreaks = false) {
  const text = String(value || "");
  if (preserveLineBreaks) {
    return text
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  return text.replace(/\s+/g, " ").trim();
}

export function sentenceSafeTruncate(value: any, limit = 1200, preserveLineBreaks = false) {
  const text = clean(value, preserveLineBreaks);
  if (!Number.isFinite(limit) || limit <= 0) return "";
  if (text.length <= limit) return text;

  const clipped = text.slice(0, limit).trim();
  const minimumUsefulLength = Math.max(24, Math.floor(limit * 0.55));
  const sentenceMatch = Array.from(clipped.matchAll(/[.!?؟۔][)"'\]]?/g)).pop();
  if (sentenceMatch && typeof sentenceMatch.index === "number") {
    const end = sentenceMatch.index + sentenceMatch[0].length;
    if (end >= minimumUsefulLength) return clipped.slice(0, end).trim();
  }

  const boundary = Math.max(
    clipped.lastIndexOf(";"),
    clipped.lastIndexOf(","),
    clipped.lastIndexOf(" "),
  );
  if (boundary >= minimumUsefulLength) return clipped.slice(0, boundary).trim();
  return clipped.replace(/\S+$/, "").trim();
}

export function endsLikeCompleteSentence(value: any) {
  const text = clean(value).replace(/^[*-]\s*/, "");
  if (!text) return false;
  if (SENTENCE_END_RE.test(text)) return true;
  if (/^[\w /-]+\s*:\s*[^:]+$/i.test(text)) return true;
  if (/^\d+(?:[.,]\d+)?(?:\s*(?:rs|pkr|usd|\$|%|orders?|messages?|notes?|month|year))?$/i.test(text)) return true;
  return false;
}

export function endsWithPartialWord(value: any) {
  const text = clean(value).replace(/^[*-]\s*/, "");
  if (!text || endsLikeCompleteSentence(text)) return false;
  const words = text.split(/\s+/);
  const last = words[words.length - 1] || "";
  if (last.length <= 2) return true;
  if (/^(abou|answe|servi|detai|questio|inquir|custome|summar|addres|delive|pricin|setu)$/i.test(last)) return true;
  return false;
}
