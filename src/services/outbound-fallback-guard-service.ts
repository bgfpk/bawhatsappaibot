const BANNED_FALLBACK_PATTERNS = [
  /main\s+aap\s+ko\s+sahi\s+guide/i,
  /main\s+detail\s+ek\s+defa|main\s+detail\s+ek\s+dafa/i,
  /i\s+want\s+to\s+guide\s+you\s+correctly/i,
  /please\s+share\s+the\s+main\s+detail\s+once/i,
  /please\s+confirm\s+the\s+main\s+detail\s+once/i,
  /product,\s*order,\s*(ya|or)\s*delivery\s+ki\s+specific\s+detail/i,
  /specific\s+(product|order|delivery)\s+detail.*check/i,
  /share\s+the\s+specific\s+product,\s*order,\s*or\s*delivery\s+detail/i,
];

export function containsBannedGenericFallback(value: any) {
  const text = String(value || "");
  return BANNED_FALLBACK_PATTERNS.some((pattern) => pattern.test(text));
}

export function replaceBannedGenericFallback(text: any, _language?: string, _latestCustomerText?: any) {
  if (!containsBannedGenericFallback(text)) return String(text || "").trim();
  return "";
}
