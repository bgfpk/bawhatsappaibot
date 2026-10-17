const TARGET_SEPARATOR = "::stock::";

type BackInStockTarget = {
  productId: string;
  productName: string;
  baseProductId: string;
  variationName?: string;
  optionName?: string;
};

const toNumber = (value: any) => Number.isFinite(Number(value)) ? Number(value) : 0;

function text(value: any) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function optionStock(option: any) {
  return typeof option === "string" ? 0 : Math.max(0, toNumber(option?.stock));
}

function optionName(option: any) {
  return typeof option === "string" ? option : String(option?.name || "");
}

function productBaseId(product: any) {
  return String(product?.$id || product?.id || product?.sku || "").trim();
}

function optionLabel(variation: any, option: any) {
  return [variation?.name, optionName(option)].filter(Boolean).join(" ").trim();
}

function displayName(product: any, variationName?: string, option?: string) {
  const suffix = [variationName, option].filter(Boolean).join(" ");
  return `${product?.name || "requested product"}${suffix ? ` - ${suffix}` : ""}`;
}

function encodePart(value: any) {
  return encodeURIComponent(String(value || "").trim());
}

function decodePart(value: any) {
  try {
    return decodeURIComponent(String(value || ""));
  } catch {
    return String(value || "");
  }
}

export function productHasAnyStock(product: any) {
  const variations = Array.isArray(product?.variations) ? product.variations : [];
  if (variations.length > 0) {
    return variations.some((variation: any) =>
      (variation?.options || []).some((option: any) => optionStock(option) > 0)
    );
  }
  return toNumber(product?.stock) > 0;
}

export function buildBackInStockTarget(product: any, variationName?: string, option?: string): BackInStockTarget | null {
  const baseProductId = productBaseId(product);
  if (!baseProductId) return null;
  const cleanVariation = String(variationName || "").trim();
  const cleanOption = String(option || "").trim();
  const productId = cleanVariation || cleanOption
    ? [baseProductId, encodePart(cleanVariation), encodePart(cleanOption)].join(TARGET_SEPARATOR)
    : baseProductId;
  return {
    productId,
    productName: displayName(product, cleanVariation, cleanOption),
    baseProductId,
    ...(cleanVariation ? { variationName: cleanVariation } : {}),
    ...(cleanOption ? { optionName: cleanOption } : {}),
  };
}

export function parseBackInStockTargetId(productId: any) {
  const parts = String(productId || "").split(TARGET_SEPARATOR);
  return {
    baseProductId: parts[0] || "",
    variationName: parts[1] ? decodePart(parts[1]) : "",
    optionName: parts[2] ? decodePart(parts[2]) : "",
  };
}

function findProduct(products: any[], baseProductId: string) {
  return (products || []).find((product: any) => {
    const id = productBaseId(product);
    return id === baseProductId || product?.$id === baseProductId || product?.id === baseProductId || product?.sku === baseProductId;
  });
}

function findOption(product: any, variationName?: string, targetOptionName?: string) {
  const variationText = text(variationName);
  const optionText = text(targetOptionName);
  for (const variation of product?.variations || []) {
    if (variationText && text(variation?.name) !== variationText) continue;
    for (const option of variation?.options || []) {
      if (optionText && text(optionName(option)) !== optionText) continue;
      return { variation, option };
    }
  }
  return null;
}

export function resolveBackInStockTarget(products: any[], requestProductId: any, fallbackName?: string) {
  const target = parseBackInStockTargetId(requestProductId);
  const product = findProduct(products, target.baseProductId || String(requestProductId || ""));
  if (!product) return null;

  if (target.variationName || target.optionName) {
    const match = findOption(product, target.variationName, target.optionName);
    const available = match ? optionStock(match.option) > 0 : productHasAnyStock(product);
    return {
      product,
      available,
      productName: match ? displayName(product, match.variation?.name, optionName(match.option)) : (fallbackName || displayName(product, target.variationName, target.optionName)),
    };
  }

  return {
    product,
    available: productHasAnyStock(product),
    productName: fallbackName || displayName(product),
  };
}

function getProductSearchText(product: any) {
  const variationText = (product?.variations || []).flatMap((variation: any) =>
    (variation?.options || []).map((option: any) => [variation?.name, optionName(option), option?.sku].filter(Boolean).join(" "))
  ).join(" ");
  return [product?.name, product?.sku, product?.description, variationText].filter(Boolean).join(" ");
}

function scoreText(haystack: string, needle: string) {
  const cleanHaystack = text(haystack);
  const cleanNeedle = text(needle);
  if (!cleanHaystack || !cleanNeedle) return 0;
  if (cleanNeedle.includes(cleanHaystack)) return 80;
  const tokens = cleanHaystack.split(" ").filter((token) => token.length > 2);
  const needleTokens = new Set(cleanNeedle.split(" ").filter((token) => token.length > 2));
  return tokens.reduce((score, token) => score + (needleTokens.has(token) ? 8 : 0), 0);
}

export function findUnavailableBackInStockTarget(products: any[] = [], lookupText: string): BackInStockTarget | null {
  let best: { score: number; target: BackInStockTarget } | null = null;
  const lookup = text(lookupText);

  for (const product of products || []) {
    const baseScore = scoreText(getProductSearchText(product), lookupText);

    for (const variation of product?.variations || []) {
      for (const option of variation?.options || []) {
        const cleanOptionName = text(optionName(option));
        const optionMentioned = Boolean(cleanOptionName && lookup.includes(cleanOptionName));
        const optionScore = baseScore + scoreText(optionLabel(variation, option), lookupText) + (optionMentioned ? 60 : 0);
        if (optionScore >= 40 && optionStock(option) <= 0) {
          const target = buildBackInStockTarget(product, variation?.name, optionName(option));
          if (target && (!best || optionScore > best.score)) best = { score: optionScore, target };
        }
      }
    }

    if (baseScore >= 24 && !productHasAnyStock(product)) {
      const target = buildBackInStockTarget(product);
      if (target && (!best || baseScore > best.score)) best = { score: baseScore, target };
    }
  }

  return best?.target || null;
}
