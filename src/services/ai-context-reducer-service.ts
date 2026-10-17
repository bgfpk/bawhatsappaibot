import { sentenceSafeTruncate } from "./summary-text-utils-service.ts";

function clean(value: any, limit = 600) {
  return sentenceSafeTruncate(String(value || "").replace(/\s+/g, " ").trim(), limit);
}

function normalize(value: any) {
  return clean(value, 1000).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value: any) {
  return new Set(normalize(value).split(" ").filter((token) => token.length >= 3));
}

function uniqueLines(text: any) {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of String(text || "").replace(/\r\n/g, "\n").split(/\n+/)) {
    const line = clean(raw, 500);
    const key = normalize(line);
    if (!line || !key || seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}

function relevanceScore(queryTokens: Set<string>, text: any) {
  const candidate = tokenize(text);
  let score = 0;
  for (const token of queryTokens) {
    if (candidate.has(token)) score += 3;
  }
  return score + Math.min(candidate.size, 40) / 100;
}

export function reduceRecentMessages(messages: any[] = [], maxMessages = 8) {
  const visible = (Array.isArray(messages) ? messages : [])
    .map((message) => ({
      ...message,
      text: clean(message?.text || message?.message || message?.content || "", 500),
    }))
    .filter((message) => message.text);
  return visible.slice(-Math.max(1, maxMessages));
}

export function compactSummary(summary: any, maxChars = 1000) {
  return sentenceSafeTruncate(uniqueLines(summary).join("\n"), maxChars);
}

export function compactBusinessInstructions(text: any, maxChars = 1200) {
  const lines = uniqueLines(text)
    .filter((line) => !/^(hi|hello|thanks|thank you|please note)[:\s-]*$/i.test(line));
  return sentenceSafeTruncate(lines.join("\n"), maxChars);
}

export function selectRelevantProducts(query: any, products: any[] = [], max = 5) {
  const queryTokens = tokenize(query);
  const scored = (Array.isArray(products) ? products : []).map((product, index) => {
    const text = [
      product?.name,
      product?.sku,
      product?.description,
      product?.category,
      product?.base_price,
      product?.stock,
    ].filter(Boolean).join(" ");
    return { product, index, score: relevanceScore(queryTokens, text) };
  });
  return scored
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, max))
    .map((item) => item.product);
}

export function selectRelevantLearnedNotes(query: any, notes: any, max = 5) {
  const lines = uniqueLines(notes);
  const queryTokens = tokenize(query);
  return lines
    .map((line, index) => ({ line, index, score: relevanceScore(queryTokens, line) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, Math.max(1, max))
    .map((item) => item.line)
    .join("\n");
}

export function buildNormalizedSummaryProfileFacts(input: {
  profile?: any;
  latestOrder?: any;
  state?: any;
  customFields?: any[];
}) {
  const profile = input.profile || {};
  const latestOrder = input.latestOrder || {};
  const state = input.state || {};
  const missingFields = [
    ...(Array.isArray(latestOrder?.missingFields) ? latestOrder.missingFields : []),
    ...(Array.isArray(state?.missingFields) ? state.missingFields : []),
    ...(Array.isArray(state?.missingCustomFields) ? state.missingCustomFields : []),
  ].map((item) => clean(item, 80)).filter(Boolean);
  return {
    name: clean(profile.customerName || profile.name || profile.deliveryName, 120),
    phone: clean(profile.customerPhone || profile.phone || profile.phoneNumber, 80),
    language: clean(profile.languagePreference || profile.preferredLanguage || profile.selectedLanguage, 80),
    latestLeadOrOrder: {
      status: clean(latestOrder.recordStatus || latestOrder.orderStatus || latestOrder.status || state.recordStatus, 120),
      productOrService: clean(latestOrder.productName || latestOrder.serviceName || state.product || state.service, 160),
      total: clean(latestOrder.priceText || latestOrder.totalPrice || latestOrder.codAmount, 80),
      city: clean(latestOrder.cityName || latestOrder.city || latestOrder.location, 120),
      address: clean(latestOrder.deliveryAddress || latestOrder.orderAddress || latestOrder.address, 180),
    },
    missingFields: Array.from(new Set(missingFields)).slice(0, 8),
    configuredFields: (Array.isArray(input.customFields) ? input.customFields : [])
      .map((field) => clean(field?.name || field?.label || field, 80))
      .filter(Boolean)
      .slice(0, 8),
  };
}
