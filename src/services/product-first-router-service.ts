import { selectRelevantProducts } from "./ai-context-reducer-service.ts";

function clean(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value: any) {
  return clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").replace(/\s+/g, " ").trim();
}

function tokens(value: any) {
  return normalize(value).split(" ").filter((token) => token.length >= 3);
}

function productText(product: any) {
  return [
    product?.name,
    product?.sku,
    product?.category,
    product?.description,
    ...(Array.isArray(product?.variations) ? product.variations.flatMap((variation: any) => [
      variation?.name,
      ...(Array.isArray(variation?.options) ? variation.options.map((option: any) => typeof option === "string" ? option : `${option?.name || ""} ${option?.sku || ""}`) : []),
    ]) : []),
  ].filter(Boolean).join(" ");
}

export function rankProductsForRouter(query: any, products: any[] = [], max = 5) {
  const queryTokens = tokens(query);
  return selectRelevantProducts(query, products, Math.max(1, max)).map((product) => {
    const haystack = normalize(productText(product));
    const name = normalize(product?.name);
    const sku = normalize(product?.sku);
    const exactName = Boolean(name && (normalize(query) === name || normalize(query).includes(name)));
    const exactSku = Boolean(sku && normalize(query).includes(sku));
    const matched = queryTokens.filter((token) => haystack.includes(token));
    const score = (exactName ? 80 : 0) + (exactSku ? 80 : 0) + matched.length * 12;
    return { product, score, matchedTokens: matched };
  }).sort((a, b) => b.score - a.score).slice(0, Math.max(1, max));
}

function formatPrice(product: any) {
  const price = Number(product?.base_price || product?.price || 0);
  return price > 0 ? `${price} PKR` : "";
}

function formatStock(product: any) {
  const stock = Number(product?.stock || 0);
  if (stock > 0) return `${stock} in stock`;
  return "stock not confirmed";
}

export function buildProductFirstReply(input: {
  text: any;
  products?: any[];
  maxProducts?: number;
}) {
  const ranked = rankProductsForRouter(input.text, input.products || [], input.maxProducts || 5);
  const best = ranked[0];
  if (!best || best.score < 24) {
    return { matched: false as const, reason: "weak_product_match", topProducts: ranked.map((item) => item.product) };
  }
  const product = best.product;
  const name = clean(product?.name) || "This item";
  const price = formatPrice(product);
  const stock = formatStock(product);
  const lines = [
    `${name}${price ? ` is ${price}` : ""}.`,
    `Availability: ${stock}.`,
    "Which option or quantity do you need?",
  ];
  return {
    matched: true as const,
    reason: "strong_product_match",
    product,
    topProducts: ranked.map((item) => item.product),
    text: lines.filter(Boolean).join("\n"),
  };
}

export function findStrongMediaTemplate(input: {
  text: any;
  templates?: any[];
}) {
  const queryTokens = tokens(input.text).filter((token) => !["send", "show", "photo", "image", "pic", "picture", "video", "catalog", "details"].includes(token));
  if (queryTokens.length === 0) return null;
  let best: any = null;
  let bestScore = 0;
  for (const template of input.templates || []) {
    const caption = normalize(template?.caption || template?.searchText || "");
    if (!caption) continue;
    const matches = queryTokens.filter((token) => caption.includes(token)).length;
    const score = matches * 20 + (queryTokens.every((token) => caption.includes(token)) ? 40 : 0);
    if (score > bestScore) {
      best = template;
      bestScore = score;
    }
  }
  return bestScore >= 40 ? best : null;
}
