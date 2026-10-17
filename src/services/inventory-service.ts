import * as dbService from './db-service.ts';

type StockResult = {
  ok: boolean;
  product?: any;
  variationName?: string;
  optionName?: string;
  available: number;
  requested: number;
  alternatives: string[];
  message?: string;
  ambiguous?: boolean;
};

const text = (value: any) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
const toNumber = (value: any) => Number.isFinite(Number(value)) ? Number(value) : 0;
const GENERIC_OPTION_WORDS = new Set(["option", "color", "colour", "size"]);

function optionLabel(variation: any, option: any) {
  const name = typeof option === "string" ? option : option?.name;
  return [variation?.name, name].filter(Boolean).join(" ");
}

function optionStock(option: any) {
  return typeof option === "string" ? 0 : Math.max(0, toNumber(option?.stock));
}

function buyableOptionLabel(product: any, variation: any, option: any) {
  const optionName = typeof option === "string" ? option : option?.name;
  const variationName = String(variation?.name || "");
  const suffix = /^(color|colour|size|option)$/i.test(variationName)
    ? optionName
    : optionLabel(variation, option);
  return `${product.name}${suffix ? ` - ${suffix}` : ""}`.trim();
}

function scoreProductForQuery(product: any, query: string) {
  const q = text(query);
  if (!q) return 0;
  const searchable = text([
    product.name,
    product.sku,
    product.description,
    ...(product.variations || []).flatMap((variation: any) =>
      (variation.options || []).map((option: any) => optionLabel(variation, option))
    )
  ].join(" "));
  const tokens = q.split(" ").filter(token => token.length > 2);
  return tokens.reduce((score, token) => score + (searchable.includes(token) ? 1 : 0), 0);
}

export function formatProductCatalogForAI(products: any[] = [], options: { query?: string; maxProducts?: number; maxVariationOptions?: number } = {}) {
  const maxProducts = Math.max(1, Number(options.maxProducts || 30));
  const maxVariationOptions = Math.max(3, Number(options.maxVariationOptions || 24));
  let catalogProducts = products;
  let omittedCount = 0;

  if (products.length > maxProducts) {
    const scored = products
      .map(product => ({ product, score: scoreProductForQuery(product, options.query || "") }))
      .sort((a, b) => b.score - a.score);
    const hasRelevantMatches = scored.some(item => item.score > 0);
    catalogProducts = (hasRelevantMatches ? scored.filter(item => item.score > 0) : scored)
      .slice(0, maxProducts)
      .map(item => item.product);
    omittedCount = Math.max(0, products.length - catalogProducts.length);
  }

  const formatted = catalogProducts.map(product => {
    const variations = Array.isArray(product.variations) ? product.variations : [];
    const variationLines = variations.flatMap((variation: any) =>
      (variation.options || []).map((option: any) => {
        const name = optionLabel(variation, option);
        const stock = optionStock(option);
        const price = toNumber(option?.price || product.base_price);
        return `- ${name}: ${stock > 0 ? `${stock} in stock` : "out of stock"}${price ? `, price ${price}` : ""}`;
      })
    ).slice(0, maxVariationOptions);
    return [
      `Item: ${product.name}`,
      product.description ? `Description: ${product.description}` : "",
      `Price: ${toNumber(product.base_price)}`,
      `Total stock: ${Math.max(0, toNumber(product.stock))}`,
      variationLines.length ? `Variations:\n${variationLines.join("\n")}` : ""
    ].filter(Boolean).join("\n");
  }).join("\n\n");

  return omittedCount > 0
    ? `${formatted}\n\nCatalog trimmed for cost: ${omittedCount} other products are not shown unless the customer asks for them by name.`
    : formatted;
}

function findProduct(products: any[], query: string) {
  const q = text(query);
  return products.find(product => {
    const name = text(product.name);
    const sku = text(product.sku);
    return q === name || q.includes(name) || name.includes(q) || (!!sku && (q === sku || q.includes(sku)));
  });
}

function findVariationOption(product: any, query: string) {
  const q = text(query);
  const queryTokens = q.split(" ").filter(word => word.length > 2 && !GENERIC_OPTION_WORDS.has(word));
  for (const variation of product.variations || []) {
    for (const option of variation.options || []) {
      const name = text(optionLabel(variation, option));
      const sku = text(typeof option === "string" ? "" : option.sku);
      const nameTokens = name.split(" ").filter(word => word.length > 2 && !GENERIC_OPTION_WORDS.has(word));
      const exactOrContained = name && (q.includes(name) || name.includes(q));
      const tokenMatch = nameTokens.length > 0 && nameTokens.every(token => queryTokens.includes(token));
      if (exactOrContained || tokenMatch) {
        return { variation, option };
      }
      if (sku && q.includes(sku)) return { variation, option };
    }
  }
  return null;
}

export function checkOrderStock(products: any[], orderData: any): StockResult {
  const requested = Math.max(1, toNumber(orderData.quantity || orderData.qty || orderData.items || 1));
  const query = [orderData.productName, orderData.product_name, orderData.orderDetail, orderData.variant, orderData.variation, orderData.stockVariationName, orderData.stockOptionName, JSON.stringify(orderData.customFields || {})].join(" ");
  const product = findProduct(products, query);
  if (!product) return { ok: false, available: 0, requested, alternatives: [], ambiguous: true, message: "Product was not found in catalog." };

  const optionMatch = findVariationOption(product, query);
  if (optionMatch) {
    const available = optionStock(optionMatch.option);
    return {
      ok: available >= requested,
      product,
      variationName: optionMatch.variation?.name,
      optionName: typeof optionMatch.option === "string" ? optionMatch.option : optionMatch.option?.name,
      available,
      requested,
      alternatives: listAlternatives(products),
      message: available >= requested ? undefined : `${product.name} ${optionLabel(optionMatch.variation, optionMatch.option)} is not available.`
    };
  }

  if (Array.isArray(product.variations) && product.variations.length > 0 && text(orderData.variation || orderData.variant || orderData.orderDetail)) {
    return {
      ok: false,
      product,
      available: 0,
      requested,
      alternatives: [],
      ambiguous: true,
      message: "Product option could not be matched confidently."
    };
  }

  const available = Math.max(0, toNumber(product.stock));
  return {
    ok: available >= requested,
    product,
    available,
    requested,
    alternatives: listAlternatives(products, product.$id || product.id),
    message: available >= requested ? undefined : `${product.name} is not available.`
  };
}

export function listAlternatives(products: any[] = [], excludeId?: string) {
  const alternatives: string[] = [];
  for (const product of products) {
    if ((product.$id || product.id) === excludeId) continue;
    const variations = Array.isArray(product.variations) ? product.variations : [];
    if (variations.length > 0) {
      for (const variation of variations) {
        for (const option of variation.options || []) {
          if (optionStock(option) > 0) {
            alternatives.push(buyableOptionLabel(product, variation, option));
          }
          if (alternatives.length >= 5) return alternatives;
        }
      }
    } else if (toNumber(product.stock) > 0) {
      alternatives.push(product.name);
    }
    if (alternatives.length >= 5) return alternatives;
  }
  return alternatives;
}

function buildUpdatedProduct(product: any, orderData: any, quantity: number, mode: "reserve" | "release") {
  const delta = mode === "reserve" ? -quantity : quantity;
  const query = [orderData.productName, orderData.product_name, orderData.orderDetail, orderData.variant, orderData.variation, orderData.stockVariationName, orderData.stockOptionName, JSON.stringify(orderData.customFields || {})].join(" ");
  const variations = JSON.parse(JSON.stringify(product.variations || []));
  const optionMatch = findVariationOption({ ...product, variations }, query);
  if (optionMatch && typeof optionMatch.option !== "string") {
    optionMatch.option.stock = Math.max(0, toNumber(optionMatch.option.stock) + delta);
  }
  const nextStock = variations.length && optionMatch
    ? variations.reduce((sum: number, variation: any) => sum + (variation.options || []).reduce((s: number, option: any) => s + optionStock(option), 0), 0)
    : Math.max(0, toNumber(product.stock) + delta);
  return { stock: nextStock, variations };
}

export async function reserveOrderStock(userId: string, orderData: any): Promise<StockResult> {
  const products = await dbService.listProducts(userId);
  const result = checkOrderStock(products, orderData);
  if (!result.ok || !result.product) return result;
  const quantity = result.requested;
  const updated = buildUpdatedProduct(result.product, orderData, quantity, "reserve");
  await dbService.saveProduct(userId, { ...result.product, ...updated, id: result.product.$id || result.product.id });
  return result;
}

export async function releaseOrderStock(userId: string, orderData: any) {
  if (!userId || orderData.stockReleasedAt) return false;
  const products = await dbService.listProducts(userId);
  const archivedProduct = orderData.stockProductId
    ? products.find((product: any) => (product.$id || product.id) === orderData.stockProductId)
    : null;
  const result = archivedProduct
    ? { product: archivedProduct }
    : checkOrderStock(products, orderData);
  if (!result.product) return false;
  const quantity = Math.max(1, toNumber(orderData.quantity || orderData.qty || orderData.items || 1));
  const updated = buildUpdatedProduct(result.product, orderData, quantity, "release");
  await dbService.saveProduct(userId, { ...result.product, ...updated, id: result.product.$id || result.product.id });
  return true;
}

export function isReturnOrCancelStatus(status: any) {
  const value = text(status);
  return value.includes("cancel") || value.includes("return") || value.includes("returned");
}
