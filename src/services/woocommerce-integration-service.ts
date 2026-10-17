import * as dbService from "./db-service.ts";
import { decryptServerSecret, encryptServerSecret, maskSecret, redactSecrets } from "./secret-crypto-service.ts";
import {
  cleanString,
  loadIntegrationStore,
  nowSeconds,
  prependLog,
  safeId,
  updateIntegrationStore,
  withoutSecrets,
  type IntegrationFoundationStore,
} from "./integration-foundation-store.ts";
import { assertSafeExternalServiceUrl, validateExternalServiceUrl } from "./outbound-url-safety-service.ts";
import { INTEGRATION_BETA_COLLECTIONS } from "./integration-beta-collections.ts";
import { listBetaCollectionRows, mergeRowsById, safeJsonString, parseJsonString, writeBetaCollectionRow } from "./integration-beta-collection-store.ts";
import { recordWooCommerceCrmProductMapping } from "./crm-foundation-service.ts";

const MASKED_SECRET = "__masked_secret__";
const MAX_PREVIEW_PRODUCTS = 50;
const MAX_VARIATION_PRODUCTS = 12;
const MAX_VARIATIONS_PER_PRODUCT = 25;

function stripHtml(value: any) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export function normalizeWooStoreUrl(value: any) {
  const text = cleanString(value, 300).replace(/\/+$/, "");
  const url = validateExternalServiceUrl(text, { label: "WooCommerce store", requireHttps: true, allowLocalDevelopment: true, maxLength: 300 });
  return url.origin + url.pathname.replace(/\/+$/, "");
}

function authHeaders(consumerKey: string, consumerSecret: string) {
  return {
    Authorization: `Basic ${Buffer.from(`${consumerKey}:${consumerSecret}`).toString("base64")}`,
    Accept: "application/json",
    "User-Agent": "BlackArrow-WooCommerce-Integration/1.0",
  };
}

function buildWooApiUrl(storeUrl: string, path: string, params: Record<string, any> = {}) {
  const url = new URL(`${storeUrl}/wp-json/wc/v3/${path.replace(/^\/+/, "")}`);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, String(value));
  }
  return url.toString();
}

function mapWooType(product: any) {
  if (product?.virtual || product?.downloadable || product?.type === "virtual") return "digital";
  return "physical";
}

function mapWooProduct(product: any, variations: any[] = []) {
  const categories = (product.categories || []).map((item: any) => item?.name).filter(Boolean);
  const tags = (product.tags || []).map((item: any) => item?.name).filter(Boolean);
  const images = (product.images || []).map((item: any) => item?.src).filter(Boolean);
  const attributes = (product.attributes || []).map((item: any) => ({
    name: item.name,
    options: item.options || [],
    variation: Boolean(item.variation),
  }));
  return {
    id: String(product.id),
    wooProductId: String(product.id),
    name: cleanString(product.name, 180),
    description: stripHtml(product.short_description || product.description).slice(0, 5000),
    price: Number(product.regular_price || product.price || 0),
    salePrice: product.sale_price ? Number(product.sale_price || 0) : null,
    sku: cleanString(product.sku, 120),
    stockStatus: cleanString(product.stock_status || (product.in_stock ? "instock" : ""), 40),
    stockQuantity: product.stock_quantity ?? null,
    categories,
    tags,
    images,
    attributes,
    type: mapWooType(product),
    wooType: product.type || "",
    variations: variations.map((variation) => ({
      wooVariationId: String(variation.id),
      sku: cleanString(variation.sku, 120),
      price: Number(variation.regular_price || variation.price || 0),
      salePrice: variation.sale_price ? Number(variation.sale_price || 0) : null,
      stockStatus: cleanString(variation.stock_status || (variation.in_stock ? "instock" : ""), 40),
      stockQuantity: variation.stock_quantity ?? null,
      attributes: (variation.attributes || []).map((item: any) => ({ name: item.name, option: item.option })),
    })),
  };
}

function publicConnection(connection: any = {}) {
  return withoutSecrets({
    provider: "woocommerce",
    storeUrl: connection.storeUrl || "",
    enabled: Boolean(connection.enabled && connection.encryptedConsumerKey && connection.encryptedConsumerSecret),
    hasCredentials: Boolean(connection.encryptedConsumerKey && connection.encryptedConsumerSecret),
    maskedConsumerKey: connection.maskedConsumerKey || "",
    status: connection.status || "not_connected",
    lastTestAt: connection.lastTestAt || 0,
    lastSyncAt: connection.lastSyncAt || 0,
    lastError: connection.lastError || "",
  });
}

function syncJobToCollectionRow(userId: string, job: any) {
  return {
    id: job.id,
    accountId: userId,
    provider: cleanString(job.provider, 40),
    objectType: cleanString(job.objectType, 40),
    status: cleanString(job.status, 40),
    overwrite: job.overwrite === true,
    requested: Number(job.requested || 0),
    created: Number(job.created || 0),
    updated: Number(job.updated || 0),
    skipped: Number(job.skipped || 0),
    errorsJson: safeJsonString(job.errors || [], 5000),
    createdAt: Number(job.createdAt || nowSeconds()),
  };
}

function syncJobFromCollectionRow(row: any) {
  return { ...row, errors: parseJsonString(row.errorsJson, []) };
}

function externalObjectLinkToCollectionRow(link: any) {
  return {
    id: link.id,
    accountId: link.accountId,
    provider: cleanString(link.provider, 40),
    objectType: cleanString(link.objectType, 40),
    externalId: cleanString(link.externalId, 180),
    blackarrowId: cleanString(link.blackarrowId, 180),
    sku: cleanString(link.sku, 140),
    syncMode: cleanString(link.syncMode, 60),
    lastSyncedAt: Number(link.lastSyncedAt || 0),
  };
}

async function listWooCommerceSyncJobs(userId: string, fallbackRows: any[] = []) {
  const collection = await listBetaCollectionRows(INTEGRATION_BETA_COLLECTIONS.INTEGRATION_SYNC_JOBS, userId, { limit: 100, orderDesc: "createdAt" });
  return mergeRowsById(collection.rows.map(syncJobFromCollectionRow), fallbackRows).slice(0, 100);
}

async function listExternalObjectLinks(userId: string, fallbackRows: any[] = []) {
  const collection = await listBetaCollectionRows(INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS, userId, { limit: 500 });
  return mergeRowsById(collection.rows, fallbackRows).slice(0, 500);
}

async function getConnectionSecrets(userId: string) {
  const store = await loadIntegrationStore(userId);
  const connection = store.wooCommerce?.connection || {};
  if (!connection?.storeUrl || !connection?.encryptedConsumerKey || !connection?.encryptedConsumerSecret) {
    throw new Error("WooCommerce connection is not configured.");
  }
  return {
    store,
    connection,
    storeUrl: connection.storeUrl,
    consumerKey: decryptServerSecret(connection.encryptedConsumerKey),
    consumerSecret: decryptServerSecret(connection.encryptedConsumerSecret),
  };
}

export async function getWooCommerceStatus(userId: string) {
  const store = await loadIntegrationStore(userId);
  const syncJobs = await listWooCommerceSyncJobs(userId, store.integrationSyncJobs || []);
  const externalObjectLinks = await listExternalObjectLinks(userId, store.externalObjectLinks || []);
  return {
    connection: publicConnection(store.wooCommerce?.connection),
    syncJobs,
    externalObjectLinks: externalObjectLinks.filter((link) => link.provider === "woocommerce").slice(0, 100),
  };
}

export async function saveWooCommerceConnection(userId: string, input: any) {
  const storeUrl = normalizeWooStoreUrl(input?.storeUrl);
  await assertSafeExternalServiceUrl(storeUrl, { label: "WooCommerce store", requireHttps: true, allowLocalDevelopment: true, maxLength: 300 });
  const existing = await loadIntegrationStore(userId);
  const current = existing.wooCommerce?.connection || {};
  const consumerKey = cleanString(input?.consumerKey, 300);
  const consumerSecret = cleanString(input?.consumerSecret, 300);
  if (!consumerKey && !current.encryptedConsumerKey) throw new Error("WooCommerce consumer key is required.");
  if (!consumerSecret && !current.encryptedConsumerSecret) throw new Error("WooCommerce consumer secret is required.");

  const connection = {
    ...current,
    provider: "woocommerce",
    storeUrl,
    encryptedConsumerKey: consumerKey && consumerKey !== MASKED_SECRET ? encryptServerSecret(consumerKey) : current.encryptedConsumerKey,
    encryptedConsumerSecret: consumerSecret && consumerSecret !== MASKED_SECRET ? encryptServerSecret(consumerSecret) : current.encryptedConsumerSecret,
    maskedConsumerKey: consumerKey && consumerKey !== MASKED_SECRET ? maskSecret(consumerKey) : current.maskedConsumerKey,
    enabled: true,
    status: "saved",
    lastError: "",
    updatedAt: nowSeconds(),
  };

  const next = await updateIntegrationStore(userId, (store) => ({
    ...store,
    wooCommerce: { ...(store.wooCommerce || {}), connection },
  }));
  return publicConnection(next.wooCommerce?.connection);
}

export async function removeWooCommerceConnection(userId: string) {
  const next = await updateIntegrationStore(userId, (store) => ({
    ...store,
    wooCommerce: { ...(store.wooCommerce || {}), connection: { provider: "woocommerce", enabled: false, status: "not_connected", removedAt: nowSeconds() } },
  }));
  return publicConnection(next.wooCommerce?.connection);
}

export async function testWooCommerceConnection(userId: string) {
  const { storeUrl, consumerKey, consumerSecret } = await getConnectionSecrets(userId);
  let status = "connected";
  let lastError = "";
  try {
    await assertSafeExternalServiceUrl(storeUrl, { label: "WooCommerce store", requireHttps: true, allowLocalDevelopment: true, maxLength: 300 });
    const res = await fetch(buildWooApiUrl(storeUrl, "products", { per_page: 1, page: 1 }), {
      headers: authHeaders(consumerKey, consumerSecret),
      redirect: "error",
    });
    if (!res.ok) throw new Error(`WooCommerce test failed with HTTP ${res.status}`);
  } catch (error: any) {
    status = "error";
    lastError = redactSecrets(error?.message || "WooCommerce connection test failed.", [consumerKey, consumerSecret]);
  }
  const next = await updateIntegrationStore(userId, (store) => ({
    ...store,
    wooCommerce: {
      ...(store.wooCommerce || {}),
      connection: {
        ...(store.wooCommerce?.connection || {}),
        status,
        lastError,
        lastTestAt: nowSeconds(),
      },
    },
  }));
  if (status === "error") throw new Error(lastError);
  return publicConnection(next.wooCommerce?.connection);
}

async function fetchWooJson(storeUrl: string, consumerKey: string, consumerSecret: string, path: string, params: any) {
  await assertSafeExternalServiceUrl(storeUrl, { label: "WooCommerce store", requireHttps: true, allowLocalDevelopment: true, maxLength: 300 });
  const res = await fetch(buildWooApiUrl(storeUrl, path, params), {
    headers: authHeaders(consumerKey, consumerSecret),
    redirect: "error",
  });
  if (!res.ok) throw new Error(`WooCommerce request failed with HTTP ${res.status}`);
  return res.json();
}

export async function previewWooCommerceProducts(userId: string, input: any = {}) {
  const { storeUrl, consumerKey, consumerSecret } = await getConnectionSecrets(userId);
  const limit = Math.min(MAX_PREVIEW_PRODUCTS, Math.max(1, Number(input.limit || 20)));
  const page = Math.max(1, Number(input.page || 1));
  const products = await fetchWooJson(storeUrl, consumerKey, consumerSecret, "products", {
    per_page: limit,
    page,
    status: input.status || "any",
  });
  const mapped = [];
  for (const product of Array.isArray(products) ? products : []) {
    let variations: any[] = [];
    if (product.type === "variable" && mapped.length < MAX_VARIATION_PRODUCTS) {
      variations = await fetchWooJson(storeUrl, consumerKey, consumerSecret, `products/${product.id}/variations`, {
        per_page: MAX_VARIATIONS_PER_PRODUCT,
        page: 1,
      }).catch(() => []);
    }
    mapped.push(mapWooProduct(product, variations));
  }
  return { products: mapped, page, limit };
}

export function buildBlackArrowProductFromPreview(preview: any, existingProduct: any = null, overwrite = false) {
  const metadata = {
    source: "woocommerce",
    externalProductId: String(preview.wooProductId || preview.id || ""),
    externalVariationId: "",
    categories: preview.categories || [],
    tags: preview.tags || [],
    images: preview.images || [],
    attributes: preview.attributes || [],
    stockStatus: preview.stockStatus || "",
    wooType: preview.wooType || "",
    lastSyncedAt: nowSeconds(),
    syncMode: overwrite ? "overwrite" : "manual_no_overwrite",
  };
  if (existingProduct && !overwrite) {
    return {
      ...existingProduct,
      metadata: { ...(existingProduct.metadata || {}), ...metadata },
    };
  }
  return {
    ...(existingProduct || {}),
    id: existingProduct?.id,
    name: preview.name,
    description: preview.description,
    base_price: Number(preview.salePrice ?? preview.price ?? 0),
    cost_price: Number(existingProduct?.cost_price || 0),
    sku: preview.sku || existingProduct?.sku || "",
    stock: Number(preview.stockQuantity ?? existingProduct?.stock ?? 0) || 0,
    type: preview.type || "physical",
    variations: (preview.variations || []).map((variation: any) => ({
      name: variation.attributes?.map((item: any) => item.option).filter(Boolean).join(" / ") || `Variation ${variation.wooVariationId}`,
      options: [],
      sku: variation.sku,
      price: Number(variation.salePrice ?? variation.price ?? 0),
      stock: Number(variation.stockQuantity || 0),
    })),
    metadata,
  };
}

function findExistingWooProduct(products: any[], links: any[], preview: any) {
  const externalId = String(preview.wooProductId || preview.id || "");
  const link = links.find((item) => item.provider === "woocommerce" && item.objectType === "product" && String(item.externalId) === externalId);
  if (link?.blackarrowId) {
    const byLink = products.find((product) => String(product.id || product.$id) === String(link.blackarrowId));
    if (byLink) return byLink;
  }
  if (preview.sku) {
    return products.find((product) => String(product.sku || "").trim().toLowerCase() === String(preview.sku).trim().toLowerCase());
  }
  return null;
}

export function buildExternalObjectLinkFromPreview(preview: any, blackarrowId: string, userId: string, existingLink: any = null, overwrite = false) {
  return {
    id: existingLink?.id || safeId("link"),
    provider: "woocommerce",
    objectType: "product",
    externalId: String(preview.wooProductId || preview.id || ""),
    blackarrowId,
    accountId: userId,
    sku: preview.sku || "",
    lastSyncedAt: nowSeconds(),
    syncMode: overwrite ? "overwrite" : "manual_no_overwrite",
  };
}

export async function syncWooCommerceProducts(userId: string, input: any) {
  const selected = Array.isArray(input?.products) ? input.products : [];
  if (selected.length === 0) throw new Error("Select at least one WooCommerce product to sync.");
  const overwrite = input?.overwrite === true;
  const store = await loadIntegrationStore(userId);
  const existingProducts = await dbService.listProducts(userId);
  const existingLinks = store.externalObjectLinks || [];
  const job = {
    id: safeId("sync"),
    provider: "woocommerce",
    objectType: "product",
    status: "completed",
    createdAt: nowSeconds(),
    overwrite,
    requested: selected.length,
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [] as string[],
  };

  const nextLinks = [...existingLinks];
  for (const preview of selected) {
    const externalId = String(preview.wooProductId || preview.id || "");
    if (!externalId) {
      job.skipped++;
      continue;
    }
    const existing = findExistingWooProduct(existingProducts, nextLinks, preview);
    if (existing && !overwrite) {
      const patched = buildBlackArrowProductFromPreview(preview, existing, false);
      await dbService.saveProduct(userId, patched);
      job.skipped++;
    } else {
      const productToSave = buildBlackArrowProductFromPreview(preview, existing, overwrite);
      await dbService.saveProduct(userId, productToSave);
      if (existing) job.updated++;
      else job.created++;
    }
    const latestProducts = await dbService.listProducts(userId).catch(() => existingProducts);
    const saved = findExistingWooProduct(latestProducts, nextLinks, preview) || latestProducts.find((product: any) => product.sku && product.sku === preview.sku);
    const blackarrowId = String(saved?.id || saved?.$id || existing?.id || existing?.$id || "");
    const linkIndex = nextLinks.findIndex((item) => item.provider === "woocommerce" && item.objectType === "product" && String(item.externalId) === externalId);
    const link = buildExternalObjectLinkFromPreview(preview, blackarrowId, userId, linkIndex >= 0 ? nextLinks[linkIndex] : null, overwrite);
    if (linkIndex >= 0) nextLinks[linkIndex] = link;
    else nextLinks.unshift(link);
  }

  const linkWrites = await Promise.all(nextLinks.map((link) => writeBetaCollectionRow(INTEGRATION_BETA_COLLECTIONS.EXTERNAL_OBJECT_LINKS, externalObjectLinkToCollectionRow(link)).catch(() => ({ available: false }))));
  const jobWrite = await writeBetaCollectionRow(INTEGRATION_BETA_COLLECTIONS.INTEGRATION_SYNC_JOBS, syncJobToCollectionRow(userId, job)).catch(() => ({ available: false }));
  const linksWritten = linkWrites.length > 0 && linkWrites.every((result) => result.available);
  await updateIntegrationStore(userId, (current) => ({
    ...current,
    wooCommerce: {
      ...(current.wooCommerce || {}),
      connection: {
        ...(current.wooCommerce?.connection || {}),
        lastSyncAt: nowSeconds(),
        status: current.wooCommerce?.connection?.status || "connected",
      },
    },
    externalObjectLinks: linksWritten ? current.externalObjectLinks : nextLinks.slice(0, 500),
    integrationSyncJobs: jobWrite.available ? current.integrationSyncJobs : prependLog(current.integrationSyncJobs, job, 50),
  }));
  await recordWooCommerceCrmProductMapping(userId, job, selected).catch(() => {});
  return job;
}
