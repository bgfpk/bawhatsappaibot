import { getSystemConfig, setSystemConfig } from "./db-service.ts";

export type DeepInfraUsageCostUnit = "cents";

export type DeepInfraUsageItem = {
  modelName: string;
  task: string;
  units: number;
  rawRate: number;
  rateUsd: number;
  rawCost: number;
  costUsd: number;
  pricingType: string;
};

export type DeepInfraUsageMonth = {
  period: string;
  rawTotalCost: number;
  totalCostUsd: number;
  invoiceId: string;
  items: DeepInfraUsageItem[];
};

export type DeepInfraBillingUsage = {
  rawTotalCost: number | null;
  rawCostUnit: DeepInfraUsageCostUnit | null;
  totalCostUsd: number | null;
  currency: "USD";
  costNormalizationSource: string;
  costNormalizationVerified: boolean;
  months: DeepInfraUsageMonth[];
  status: "current" | "cached" | "unavailable" | "error";
  importedAt: number;
  source: string;
  selectedPeriod: { from: string; to?: string };
};

type BillingDeps = {
  fetchImpl: typeof fetch;
  getSystemConfig: typeof getSystemConfig;
  setSystemConfig: typeof setSystemConfig;
  now: () => number;
};

const CACHE_KEY_PREFIX = "deepinfra_billing_usage_cache";
const CACHE_TTL_MS = 2 * 60 * 60 * 1000;
const BILLING_URL = "https://api.deepinfra.com/payment/usage";
const VERIFIED_COST_UNIT: DeepInfraUsageCostUnit = "cents";
const NORMALIZATION_SOURCE = "deepinfra_usage_item_rate_times_units_and_dashboard_reconciliation";

const deps: BillingDeps = { fetchImpl: fetch, getSystemConfig, setSystemConfig, now: Date.now };

export function __setDeepInfraBillingTestDeps(overrides: Partial<BillingDeps>) {
  Object.assign(deps, overrides);
}

export function __resetDeepInfraBillingTestDeps() {
  Object.assign(deps, { fetchImpl: fetch, getSystemConfig, setSystemConfig, now: Date.now });
}

function finiteNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDeepInfraUsageCost(rawCost: unknown, unit: string | null | undefined): number | null {
  const value = finiteNumberOrNull(rawCost);
  if (value === null || unit !== VERIFIED_COST_UNIT) return null;
  return Number((value / 100).toFixed(9));
}

function cacheKey(period: { from: string; to?: string }) {
  return `${CACHE_KEY_PREFIX}:${encodeURIComponent(period.from)}:${encodeURIComponent(period.to || "")}`;
}

function parseUsage(payload: any): Pick<DeepInfraBillingUsage, "months" | "rawTotalCost" | "totalCostUsd"> | null {
  if (!payload || typeof payload !== "object" || !Array.isArray(payload.months)) return null;
  const months: DeepInfraUsageMonth[] = [];
  for (const month of payload.months) {
    const rawTotalCost = finiteNumberOrNull(month?.total_cost);
    const totalCostUsd = normalizeDeepInfraUsageCost(rawTotalCost, VERIFIED_COST_UNIT);
    if (rawTotalCost === null || totalCostUsd === null) return null;
    const items: DeepInfraUsageItem[] = [];
    for (const item of Array.isArray(month?.items) ? month.items : []) {
      const rawRate = finiteNumberOrNull(item?.rate);
      const rawCost = finiteNumberOrNull(item?.cost);
      const rateUsd = normalizeDeepInfraUsageCost(rawRate, VERIFIED_COST_UNIT);
      const costUsd = normalizeDeepInfraUsageCost(rawCost, VERIFIED_COST_UNIT);
      if (rawRate === null || rawCost === null || rateUsd === null || costUsd === null) return null;
      items.push({
        modelName: String(item?.model?.model_name ?? item?.model_name ?? ""),
        task: String(item?.model?.task ?? item?.task ?? ""),
        units: Number(item?.units || 0),
        rawRate,
        rateUsd,
        rawCost,
        costUsd,
        pricingType: String(item?.pricing_type ?? ""),
      });
    }
    months.push({ period: String(month?.period ?? month?.month ?? ""), rawTotalCost, totalCostUsd, invoiceId: String(month?.invoice_id ?? ""), items });
  }
  const rawTotalCost = finiteNumberOrNull(payload.total_cost) ?? months.reduce((sum, month) => sum + month.rawTotalCost, 0);
  return { months, rawTotalCost, totalCostUsd: normalizeDeepInfraUsageCost(rawTotalCost, VERIFIED_COST_UNIT) };
}

async function readCached(key: string): Promise<DeepInfraBillingUsage | null> {
  try {
    const value = await deps.getSystemConfig(key);
    return value ? JSON.parse(value) : null;
  } catch {
    return null;
  }
}

function unavailable(now: number, source: string, selectedPeriod: { from: string; to?: string }): DeepInfraBillingUsage {
  return {
    rawTotalCost: null,
    rawCostUnit: null,
    totalCostUsd: null,
    currency: "USD",
    costNormalizationSource: "unverified_or_unavailable",
    costNormalizationVerified: false,
    months: [],
    status: source === "missing_api_key" ? "unavailable" : "error",
    importedAt: now,
    source,
    selectedPeriod,
  };
}

export async function fetchDeepInfraUsage(forceRefresh = false, period: { from?: string; to?: string } = {}): Promise<DeepInfraBillingUsage> {
  const now = deps.now();
  const selectedPeriod = { from: String(period.from || "current-1"), ...(period.to ? { to: String(period.to) } : {}) };
  const key = cacheKey(selectedPeriod);
  const cached = await readCached(key);
  if (!forceRefresh && cached && now - Number(cached.importedAt || 0) < CACHE_TTL_MS) return { ...cached, status: "cached" };

  const apiKey = String(process.env.DEEPINFRA_API_KEY || "").trim();
  if (!apiKey) return unavailable(now, "missing_api_key", selectedPeriod);

  const url = new URL(BILLING_URL);
  url.searchParams.set("from", selectedPeriod.from);
  if (selectedPeriod.to) url.searchParams.set("to", selectedPeriod.to);
  try {
    const response = await deps.fetchImpl(url, { method: "GET", headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return cached ? { ...cached, status: "cached", source: `cached_after_http_${response.status}` } : unavailable(now, `http_${response.status}`, selectedPeriod);
    let payload: any;
    try { payload = await response.json(); } catch { return cached ? { ...cached, status: "cached", source: "cached_after_malformed_json" } : unavailable(now, "malformed_json", selectedPeriod); }
    const parsed = parseUsage(payload);
    if (!parsed || parsed.totalCostUsd === null) return cached ? { ...cached, status: "cached", source: "cached_after_invalid_cost" } : unavailable(now, "invalid_cost", selectedPeriod);
    const result: DeepInfraBillingUsage = {
      ...parsed,
      rawCostUnit: VERIFIED_COST_UNIT,
      currency: "USD",
      costNormalizationSource: NORMALIZATION_SOURCE,
      costNormalizationVerified: true,
      status: "current",
      importedAt: now,
      source: "deepinfra_payment_usage",
      selectedPeriod,
    };
    await deps.setSystemConfig(key, JSON.stringify(result));
    return result;
  } catch (error: any) {
    const reason = error?.name === "TimeoutError" || error?.name === "AbortError" ? "timeout" : "network_error";
    return cached ? { ...cached, status: "cached", source: `cached_after_${reason}` } : unavailable(now, reason, selectedPeriod);
  }
}
