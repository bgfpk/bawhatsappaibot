import crypto from "crypto";
import * as dbService from "./db-service.ts";

export type GoogleBillingDateRange = {
  from: number;
  to: number;
};

export type GoogleProviderCostRow = {
  date: string;
  projectId: string;
  projectName: string;
  serviceDescription: string;
  skuDescription: string;
  cost: number;
  credits: number;
  currency: string;
  usageAmount: number;
  usageUnit: string;
  matchedCategory?: "ai_gemini" | "non_ai_google" | "unclassified_google";
  netCost?: number;
};

export type GoogleProviderCostSummary = {
  providerCostUnavailable?: boolean;
  unavailableReason?: string;
  providerCostSource: "google_cloud_billing_bigquery";
  providerCostStatus: "configured" | "imported" | "unavailable" | "error" | "cached";
  activeExportTable?: string;
  exportType?: "detailed" | "standard" | "unknown";
  selectedRangeRows?: number;
  reliabilityStatus?: "current" | "stale_or_backfilling" | "missing" | "incomplete_estimate" | "unavailable";
  standardTableStatus?: string;
  detailedTableStatus?: string;
  grossProviderCost: number | null;
  credits: number | null;
  netProviderCost: number | null;
  totalGoogleCloudCost: number | null;
  totalGoogleCloudCredits: number | null;
  totalGoogleCloudNetCost: number | null;
  aiGeminiProviderCost: number | null;
  otherGoogleCloudCost: number | null;
  unclassifiedGoogleCost: number | null;
  classifierWarning?: string;
  projectFilterWarning?: string;
  currency: string;
  diagnostics?: GoogleBillingDiagnostics;
  dailyRows: Array<{ date: string; grossProviderCost: number; credits: number; netProviderCost: number }>;
  serviceSkuBreakdown: Array<{
    projectId?: string;
    serviceDescription: string;
    skuDescription: string;
    grossProviderCost: number;
    credits: number;
    netProviderCost: number;
    matchedCategory?: string;
  }>;
  providerCostBreakdown: Array<{
    projectId: string;
    serviceDescription: string;
    skuDescription: string;
    grossProviderCost: number;
    credits: number;
    netProviderCost: number;
    matchedCategory: string;
  }>;
  importedAt?: number;
  cachedAt?: number;
  cacheKey?: string;
};

export type GoogleBillingDiagnostics = {
  rowCount: number;
  selectedRangeRows: number;
  minUsageStartTime: string;
  maxUsageStartTime: string;
  availableProjectIds: Array<{ projectId: string; cost: number }>;
  topRows: Array<{
    serviceDescription: string;
    skuDescription: string;
    projectId: string;
    grossProviderCost: number;
    credits: number;
    netProviderCost: number;
    currency: string;
    matchedCategory: string;
  }>;
  selectedRangeUnfilteredNetCost?: number;
};

type BigQueryClientLike = {
  query: (options: any) => Promise<[any[]]>;
};

type GoogleBillingDeps = {
  getSystemConfig: typeof dbService.getSystemConfig;
  setSystemConfig: typeof dbService.setSystemConfig;
  createBigQueryClient: (options: any) => Promise<BigQueryClientLike>;
  env: NodeJS.ProcessEnv;
  now: () => number;
};

const DEFAULT_SERVICE_FILTER = [
  "gemini",
  "generative language",
  "google ai",
  "vertex ai",
  "ai platform",
  "model",
  "token",
  "input token",
  "output token",
  "cached token",
  "generate content",
  "text output",
  "image input",
  "audio input",
  "embedding",
];

const googleBillingDeps: GoogleBillingDeps = {
  getSystemConfig: dbService.getSystemConfig,
  setSystemConfig: dbService.setSystemConfig,
  createBigQueryClient: async (options: any) => {
    const imported = await import("@google-cloud/bigquery");
    return new imported.BigQuery(options) as any;
  },
  env: process.env,
  now: () => Math.floor(Date.now() / 1000),
};

export function __setGoogleBillingImportTestDeps(overrides: Partial<GoogleBillingDeps>) {
  Object.assign(googleBillingDeps, overrides || {});
}

export function __resetGoogleBillingImportTestDeps() {
  Object.assign(googleBillingDeps, {
    getSystemConfig: dbService.getSystemConfig,
    setSystemConfig: dbService.setSystemConfig,
    createBigQueryClient: async (options: any) => {
      const imported = await import("@google-cloud/bigquery");
      return new imported.BigQuery(options) as any;
    },
    env: process.env,
    now: () => Math.floor(Date.now() / 1000),
  });
}

function clean(value: any, limit = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function money(value: any) {
  const raw = value && typeof value === "object" && "value" in value ? (value as any).value : value;
  const numeric = Number(raw || 0);
  return Number((Number.isFinite(numeric) ? numeric : 0).toFixed(6));
}

function numberValue(value: any) {
  const raw = value && typeof value === "object" && "value" in value ? (value as any).value : value;
  const numeric = Number(raw || 0);
  return Number.isFinite(numeric) ? numeric : 0;
}

function dateValue(value: any) {
  if (value && typeof value === "object" && "value" in value) return clean((value as any).value, 40);
  return clean(value, 40);
}

function dateFromSeconds(seconds: number) {
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function getConfig() {
  const env = googleBillingDeps.env;
  const projectId = clean(env.GOOGLE_BILLING_BIGQUERY_PROJECT_ID, 120);
  const dataset = clean(env.GOOGLE_BILLING_BIGQUERY_DATASET, 120);
  const table = clean(env.GOOGLE_BILLING_BIGQUERY_TABLE, 180);
  return {
    projectId,
    dataset,
    table,
    detailedTable: clean(env.GOOGLE_BILLING_BIGQUERY_DETAILED_TABLE, 180),
    standardTable: clean(env.GOOGLE_BILLING_BIGQUERY_STANDARD_TABLE, 180),
    location: clean(env.GOOGLE_BILLING_BIGQUERY_LOCATION, 60) || undefined,
    projectFilter: clean(env.GOOGLE_BILLING_PROJECT_FILTER, 120),
    serviceFilter: clean(env.GOOGLE_BILLING_SERVICE_FILTER, 500),
  };
}

function unavailable(reason: string): GoogleProviderCostSummary {
  return {
    providerCostUnavailable: true,
    unavailableReason: reason,
    providerCostSource: "google_cloud_billing_bigquery",
    providerCostStatus: reason === "not_configured" ? "unavailable" : "error",
    activeExportTable: "",
    exportType: "unknown",
    selectedRangeRows: 0,
    reliabilityStatus: "unavailable",
    grossProviderCost: null,
    credits: null,
    netProviderCost: null,
    totalGoogleCloudCost: null,
    totalGoogleCloudCredits: null,
    totalGoogleCloudNetCost: null,
    aiGeminiProviderCost: null,
    otherGoogleCloudCost: null,
    unclassifiedGoogleCost: null,
    currency: "USD",
    dailyRows: [],
    serviceSkuBreakdown: [],
    providerCostBreakdown: [],
    diagnostics: undefined,
  };
}

export function isGoogleBillingImportConfigured() {
  const config = getConfig();
  return Boolean(config.projectId && config.dataset && (config.table || config.detailedTable || config.standardTable));
}

function filters() {
  const config = getConfig();
  const terms = (config.serviceFilter
    ? config.serviceFilter.split(",")
    : DEFAULT_SERVICE_FILTER
  ).map((item) => clean(item).toLowerCase()).filter(Boolean);
  return terms.length ? terms : DEFAULT_SERVICE_FILTER;
}

export function isLikelyGoogleAiBillingRow(row: any) {
  const haystack = `${clean(row?.serviceDescription)} ${clean(row?.skuDescription)}`.toLowerCase();
  return filters().some((term) => haystack.includes(term));
}

export function classifyGoogleBillingRow(row: any): GoogleProviderCostRow["matchedCategory"] {
  if (isLikelyGoogleAiBillingRow(row)) return "ai_gemini";
  const haystack = `${clean(row?.serviceDescription)} ${clean(row?.skuDescription)}`.toLowerCase();
  if (/\b(logging|storage|bigquery|compute|cloud run|cloud sql|network|load balancing|artifact registry|secret manager|monitoring)\b/i.test(haystack)) {
    return "non_ai_google";
  }
  return "unclassified_google";
}

function cacheKey(range: GoogleBillingDateRange) {
  const from = dateFromSeconds(range.from);
  const to = dateFromSeconds(Math.max(range.from, range.to - 1));
  const hash = crypto.createHash("sha1").update(`${from}:${to}`).digest("hex").slice(0, 12);
  return `google_billing_provider_cost_${hash}`;
}

function tablePath(tableName = "") {
  const config = getConfig();
  const safe = (value: string) => value.replace(/`/g, "");
  return `\`${safe(config.projectId)}.${safe(config.dataset)}.${safe(tableName || config.table)}\``;
}

function inferBillingExportTables() {
  const config = getConfig();
  const explicit = clean(config.table);
  const detailed = clean(config.detailedTable || (/gcp_billing_export_resource_v1_/i.test(explicit) ? explicit : explicit.replace(/gcp_billing_export_v1_/i, "gcp_billing_export_resource_v1_")));
  const standard = clean(config.standardTable || (/gcp_billing_export_v1_/i.test(explicit) && !/resource/i.test(explicit) ? explicit : explicit.replace(/gcp_billing_export_resource_v1_/i, "gcp_billing_export_v1_")));
  return {
    detailed: detailed || explicit,
    standard: standard || explicit,
  };
}

function isMissingTableError(error: any) {
  const text = clean(`${error?.code || ""} ${error?.message || error?.status || ""}`, 500).toLowerCase();
  return /not found|notfound|404|does not exist|table .* was not found/.test(text);
}

async function readBillingTable(range: GoogleBillingDateRange, tableName: string, exportType: "detailed" | "standard") {
  try {
    const [rows, diagnostics] = await Promise.all([
      fetchGoogleProviderCostRowsFromTable(range, tableName),
      fetchGoogleBillingDiagnosticsFromTable(range, tableName).catch(() => null),
    ]);
    return { ok: true, tableName, exportType, rows, diagnostics, status: "available" };
  } catch (error: any) {
    return {
      ok: false,
      tableName,
      exportType,
      rows: [] as GoogleProviderCostRow[],
      diagnostics: null,
      status: isMissingTableError(error) ? "missing" : "error",
      error,
    };
  }
}

function buildQuery(range: GoogleBillingDateRange, tableName = "") {
  const config = getConfig();
  const projectFilters = config.projectFilter && config.projectFilter.toLowerCase() !== "all"
    ? config.projectFilter.split(",").map((item) => clean(item, 120)).filter(Boolean)
    : [];
  const projectFilter = projectFilters.length
    ? `AND (COALESCE(project.id, "") IN UNNEST(@projectFilters) OR COALESCE(project.name, "") IN UNNEST(@projectFilters))`
    : "";
  const params: Record<string, any> = {
    fromTime: Math.max(0, Math.floor(range.from)),
    toTime: Math.max(0, Math.floor(range.to)),
  };
  if (projectFilters.length) params.projectFilters = projectFilters;
  return {
    query: `
      SELECT
        DATE(usage_start_time) AS date,
        COALESCE(project.id, "") AS projectId,
        COALESCE(project.name, "") AS projectName,
        COALESCE(service.description, "") AS serviceDescription,
        COALESCE(sku.description, "") AS skuDescription,
        SUM(COALESCE(cost, 0)) AS cost,
        SUM((SELECT COALESCE(SUM(c.amount), 0) FROM UNNEST(credits) c)) AS credits,
        ANY_VALUE(currency) AS currency,
        SUM(COALESCE(usage.amount, 0)) AS usageAmount,
        ANY_VALUE(usage.unit) AS usageUnit
      FROM ${tablePath(tableName)}
      WHERE usage_start_time >= TIMESTAMP_SECONDS(@fromTime)
        AND usage_start_time < TIMESTAMP_SECONDS(@toTime)
        ${projectFilter}
      GROUP BY date, projectId, projectName, serviceDescription, skuDescription
      ORDER BY date ASC
    `,
    params,
    location: config.location,
  };
}

function buildDiagnosticsQuery(range: GoogleBillingDateRange, tableName = "") {
  const params: Record<string, any> = {
    fromTime: Math.max(0, Math.floor(range.from)),
    toTime: Math.max(0, Math.floor(range.to)),
  };
  return {
    query: `
      WITH range_rows AS (
        SELECT
          COALESCE(project.id, "") AS projectId,
          COALESCE(service.description, "") AS serviceDescription,
          COALESCE(sku.description, "") AS skuDescription,
          COALESCE(cost, 0) AS cost,
          (SELECT COALESCE(SUM(c.amount), 0) FROM UNNEST(credits) c) AS credits,
          currency
        FROM ${tablePath(tableName)}
        WHERE usage_start_time >= TIMESTAMP_SECONDS(@fromTime)
          AND usage_start_time < TIMESTAMP_SECONDS(@toTime)
      ),
      top_rows AS (
        SELECT
          serviceDescription,
          skuDescription,
          projectId,
          SUM(cost) AS cost,
          SUM(credits) AS credits,
          SUM(cost) + SUM(credits) AS netCost,
          ANY_VALUE(currency) AS currency
        FROM range_rows
        GROUP BY serviceDescription, skuDescription, projectId
        ORDER BY netCost DESC
        LIMIT 50
      ),
      projects AS (
        SELECT projectId, SUM(cost) AS cost
        FROM range_rows
        GROUP BY projectId
        ORDER BY cost DESC
        LIMIT 50
      )
      SELECT
        (SELECT COUNT(*) FROM ${tablePath(tableName)}) AS rowCount,
        (SELECT COUNT(*) FROM range_rows) AS selectedRangeRows,
        (SELECT MIN(usage_start_time) FROM ${tablePath(tableName)}) AS minUsageStartTime,
        (SELECT MAX(usage_start_time) FROM ${tablePath(tableName)}) AS maxUsageStartTime,
        (SELECT COALESCE(SUM(cost + credits), 0) FROM range_rows) AS selectedRangeUnfilteredNetCost,
        (SELECT ARRAY_AGG(STRUCT(projectId, cost)) FROM projects) AS availableProjects,
        (SELECT ARRAY_AGG(STRUCT(serviceDescription, skuDescription, projectId, cost, credits, netCost, currency)) FROM top_rows) AS topRows
    `,
    params,
    location: getConfig().location,
  };
}

export async function fetchGoogleProviderCostRows(range: GoogleBillingDateRange): Promise<GoogleProviderCostRow[]> {
  if (!isGoogleBillingImportConfigured()) return [];
  return fetchGoogleProviderCostRowsFromTable(range, getConfig().table);
}

async function fetchGoogleProviderCostRowsFromTable(range: GoogleBillingDateRange, tableName = ""): Promise<GoogleProviderCostRow[]> {
  if (!tableName) return [];
  const config = getConfig();
  const client = await googleBillingDeps.createBigQueryClient({
    projectId: config.projectId,
    location: config.location,
  });
  const [rows] = await client.query(buildQuery(range, tableName));
  return (rows || []).map((row: any) => {
    const parsed = {
    date: dateValue(row.date).slice(0, 10),
    projectId: clean(row.projectId, 120),
    projectName: clean(row.projectName, 160),
    serviceDescription: clean(row.serviceDescription),
    skuDescription: clean(row.skuDescription),
    cost: money(row.cost),
    credits: money(row.credits),
    currency: clean(row.currency, 10) || "USD",
    usageAmount: numberValue(row.usageAmount),
    usageUnit: clean(row.usageUnit, 40),
    } as GoogleProviderCostRow;
    parsed.netCost = money(Number(parsed.cost || 0) + Number(parsed.credits || 0));
    parsed.matchedCategory = classifyGoogleBillingRow(parsed);
    return parsed;
  });
}

export async function fetchGoogleBillingDiagnostics(range: GoogleBillingDateRange): Promise<GoogleBillingDiagnostics | null> {
  if (!isGoogleBillingImportConfigured()) return null;
  return fetchGoogleBillingDiagnosticsFromTable(range, getConfig().table);
}

async function fetchGoogleBillingDiagnosticsFromTable(range: GoogleBillingDateRange, tableName = ""): Promise<GoogleBillingDiagnostics | null> {
  if (!tableName) return null;
  const config = getConfig();
  const client = await googleBillingDeps.createBigQueryClient({
    projectId: config.projectId,
    location: config.location,
  });
  const [rows] = await client.query(buildDiagnosticsQuery(range, tableName));
  const row = rows?.[0] || {};
  const topRows = (row.topRows || []).map((item: any) => {
    const parsed = {
      serviceDescription: clean(item.serviceDescription),
      skuDescription: clean(item.skuDescription),
      projectId: clean(item.projectId, 120),
      grossProviderCost: money(item.cost),
      credits: money(Math.abs(numberValue(item.credits))),
      netProviderCost: money(numberValue(item.cost) + numberValue(item.credits)),
      currency: clean(item.currency, 10) || "USD",
      matchedCategory: classifyGoogleBillingRow({
        serviceDescription: item.serviceDescription,
        skuDescription: item.skuDescription,
      }) || "unclassified_google",
    };
    return parsed;
  });
  return {
    rowCount: Math.max(0, Math.floor(numberValue(row.rowCount))),
    selectedRangeRows: Math.max(0, Math.floor(numberValue(row.selectedRangeRows))),
    minUsageStartTime: dateValue(row.minUsageStartTime),
    maxUsageStartTime: dateValue(row.maxUsageStartTime),
    selectedRangeUnfilteredNetCost: money(row.selectedRangeUnfilteredNetCost),
    availableProjectIds: (row.availableProjects || []).map((item: any) => ({
      projectId: clean(item.projectId, 120) || "(empty)",
      cost: money(item.cost),
    })),
    topRows,
  };
}

export function summarizeGoogleProviderCostRows(rows: GoogleProviderCostRow[]): GoogleProviderCostSummary {
  const daily = new Map<string, any>();
  const services = new Map<string, any>();
  let currency = "USD";
  for (const row of rows) {
    currency = row.currency || currency;
    const creditAmount = Math.abs(Number(row.credits || 0));
    const net = money(Number(row.cost || 0) + Number(row.credits || 0));
    const matchedCategory = row.matchedCategory || classifyGoogleBillingRow(row);
    const day = daily.get(row.date) || { date: row.date, grossProviderCost: 0, credits: 0, netProviderCost: 0 };
    if (matchedCategory === "ai_gemini") {
      day.grossProviderCost = money(day.grossProviderCost + row.cost);
      day.credits = money(day.credits + creditAmount);
      day.netProviderCost = money(day.netProviderCost + net);
    }
    daily.set(row.date, day);
    const key = `${row.projectId}|${row.serviceDescription}|${row.skuDescription}|${matchedCategory}`;
    const item = services.get(key) || { projectId: row.projectId, serviceDescription: row.serviceDescription, skuDescription: row.skuDescription, grossProviderCost: 0, credits: 0, netProviderCost: 0, matchedCategory };
    item.grossProviderCost = money(item.grossProviderCost + row.cost);
    item.credits = money(item.credits + creditAmount);
    item.netProviderCost = money(item.netProviderCost + net);
    item.matchedCategory = matchedCategory;
    services.set(key, item);
  }
  const aiRows = rows.filter((row) => (row.matchedCategory || classifyGoogleBillingRow(row)) === "ai_gemini");
  const otherRows = rows.filter((row) => (row.matchedCategory || classifyGoogleBillingRow(row)) === "non_ai_google");
  const unclassifiedRows = rows.filter((row) => (row.matchedCategory || classifyGoogleBillingRow(row)) === "unclassified_google");
  const grossProviderCost = money(aiRows.reduce((sum, row) => sum + Number(row.cost || 0), 0));
  const credits = money(aiRows.reduce((sum, row) => sum + Math.abs(Number(row.credits || 0)), 0));
  const netProviderCost = money(aiRows.reduce((sum, row) => sum + Number(row.cost || 0) + Number(row.credits || 0), 0));
  const totalGoogleCloudCost = money(rows.reduce((sum, row) => sum + Number(row.cost || 0), 0));
  const totalGoogleCloudCredits = money(rows.reduce((sum, row) => sum + Math.abs(Number(row.credits || 0)), 0));
  const totalGoogleCloudNetCost = money(rows.reduce((sum, row) => sum + Number(row.cost || 0) + Number(row.credits || 0), 0));
  const otherGoogleCloudCost = money(otherRows.reduce((sum, row) => sum + Number(row.cost || 0) + Number(row.credits || 0), 0));
  const unclassifiedGoogleCost = money(unclassifiedRows.reduce((sum, row) => sum + Number(row.cost || 0) + Number(row.credits || 0), 0));
  const providerCostBreakdown = Array.from(services.values()).sort((a, b) => b.netProviderCost - a.netProviderCost);
  return {
    providerCostSource: "google_cloud_billing_bigquery",
    providerCostStatus: "imported",
    activeExportTable: "",
    exportType: "unknown",
    selectedRangeRows: rows.length,
    reliabilityStatus: rows.length > 0 ? "current" : "incomplete_estimate",
    grossProviderCost,
    credits,
    netProviderCost,
    totalGoogleCloudCost,
    totalGoogleCloudCredits,
    totalGoogleCloudNetCost,
    aiGeminiProviderCost: netProviderCost,
    otherGoogleCloudCost,
    unclassifiedGoogleCost,
    classifierWarning: totalGoogleCloudNetCost > 0 && netProviderCost === 0
      ? "Google billing rows imported, but AI/Gemini classifier matched 0 rows. Review service/SKU mappings."
      : "",
    currency,
    dailyRows: Array.from(daily.values()).sort((a, b) => a.date.localeCompare(b.date)),
    serviceSkuBreakdown: providerCostBreakdown,
    providerCostBreakdown,
    importedAt: googleBillingDeps.now(),
  };
}

export async function summarizeGoogleProviderCosts(range: GoogleBillingDateRange) {
  return summarizeGoogleProviderCostRows(await fetchGoogleProviderCostRows(range));
}

export async function cacheGoogleProviderCostSummary(range: GoogleBillingDateRange, summary?: GoogleProviderCostSummary) {
  const key = cacheKey(range);
  const payload = { ...(summary || await summarizeGoogleProviderCosts(range)), cachedAt: googleBillingDeps.now(), cacheKey: key };
  await googleBillingDeps.setSystemConfig(key, JSON.stringify(payload));
  return payload;
}

export async function getCachedGoogleProviderCostSummary(range: GoogleBillingDateRange): Promise<GoogleProviderCostSummary | null> {
  const raw = await googleBillingDeps.getSystemConfig(cacheKey(range));
  if (!raw) return null;
  try {
    const parsed = JSON.parse(String(raw));
    return { ...parsed, providerCostStatus: "cached" };
  } catch {
    return null;
  }
}

export async function getProviderCostSummary(range: GoogleBillingDateRange): Promise<GoogleProviderCostSummary> {
  if (!isGoogleBillingImportConfigured()) return unavailable("not_configured");
  try {
    const tables = inferBillingExportTables();
    const [detailedRead, standardRead] = await Promise.all([
      tables.detailed ? readBillingTable(range, tables.detailed, "detailed") : Promise.resolve(null),
      tables.standard && tables.standard !== tables.detailed ? readBillingTable(range, tables.standard, "standard") : Promise.resolve(null),
    ]);
    const detailedRows = detailedRead?.ok ? detailedRead.rows : [];
    const standardRows = standardRead?.ok ? standardRead.rows : [];
    const detailedRangeRows = Number(detailedRead?.diagnostics?.selectedRangeRows ?? detailedRows.length ?? 0);
    const standardRangeRows = Number(standardRead?.diagnostics?.selectedRangeRows ?? standardRows.length ?? 0);
    const selected = detailedRangeRows > 0
      ? detailedRead
      : standardRangeRows > 0
        ? standardRead
        : (detailedRead || standardRead);
    if ((detailedRead && !detailedRead.ok && detailedRead.status === "error") || (standardRead && !standardRead.ok && standardRead.status === "error")) {
      throw (detailedRead && !detailedRead.ok && detailedRead.error) || (standardRead && !standardRead.ok && standardRead.error) || new Error("query_failed");
    }
    if (!selected?.ok && !detailedRead?.ok && !standardRead?.ok) {
      const missingStandard = standardRead?.status === "missing" ? "Standard export table not created yet" : "";
      const missingDetailed = detailedRead?.status === "missing" ? "Detailed export table not created yet" : "";
      return unavailable([missingDetailed, missingStandard].filter(Boolean).join("; ") || "query_failed");
    }
    const selectedRows = selected?.ok ? selected.rows : [];
    const summary = summarizeGoogleProviderCostRows(selectedRows);
    const diagnostics = selected?.diagnostics || null;
    const config = getConfig();
    const projectFilterActive = Boolean(config.projectFilter && config.projectFilter.toLowerCase() !== "all");
    const projectFilterWarning = projectFilterActive &&
      Number(summary.totalGoogleCloudNetCost || 0) <= 0 &&
      Number(diagnostics?.selectedRangeUnfilteredNetCost || 0) > 0
      ? "Billing rows exist, but selected project filter excluded them."
      : "";
    const standardTableStatus = standardRead
      ? (standardRead.status === "missing" ? "Standard export table not created yet" : standardRead.status)
      : (tables.standard === tables.detailed ? "same_as_configured_table" : "not_configured");
    const detailedTableStatus = detailedRead
      ? (detailedRead.status === "missing" ? "Detailed export table not created yet" : detailedRead.status)
      : "not_configured";
    const selectedRangeRows = Number(diagnostics?.selectedRangeRows ?? selectedRows.length ?? 0);
    const reliabilityStatus = selectedRangeRows > 0
      ? "current"
      : Number(diagnostics?.rowCount || 0) > 0
        ? "stale_or_backfilling"
        : "incomplete_estimate";
    return await cacheGoogleProviderCostSummary(range, {
      ...summary,
      providerCostUnavailable: selectedRangeRows <= 0,
      unavailableReason: selectedRangeRows <= 0 ? "selected_range_has_no_provider_rows" : "",
      activeExportTable: selected?.tableName || "",
      exportType: selected?.exportType || "unknown",
      selectedRangeRows,
      reliabilityStatus,
      standardTableStatus,
      detailedTableStatus,
      providerCostStatus: selectedRangeRows > 0 ? "imported" : "configured",
      diagnostics: diagnostics || undefined,
      projectFilterWarning,
    });
  } catch (error: any) {
    const cached = await getCachedGoogleProviderCostSummary(range).catch(() => null);
    if (cached) return { ...cached, providerCostStatus: "cached", unavailableReason: clean(error?.message, 120) || "query_failed" };
    return unavailable(clean(error?.message, 120) || "query_failed");
  }
}
