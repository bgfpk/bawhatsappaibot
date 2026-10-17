import { summarizeClientGeminiCacheTelemetry } from "./client-gemini-cache-telemetry-service.ts";

type UsageRow = {
  type?: string;
  amount?: number;
  cost?: number;
};

function rowAmount(row: UsageRow) {
  return Math.max(0, Number(row?.amount || 0)) || 1;
}

function rowCost(row: UsageRow) {
  return Math.max(0, Number(row?.cost || 0));
}

function emptyStats() {
  return {
    customGeminiCycles: 0,
    customGeminiRequests: 0,
    customGeminiCost: 0,
    cacheBoostCharges: 0,
    cacheBoostCost: 0,
  };
}

export function summarizeClientGeminiUsageStats(rows: UsageRow[] = []) {
  const stats = emptyStats();
  for (const row of rows) {
    const type = String(row?.type || "").toLowerCase();
    if (type === "client_gemini_message_cycle" || type === "client_gemini_api_request") {
      stats.customGeminiCycles += rowAmount(row);
      stats.customGeminiRequests = stats.customGeminiCycles;
      stats.customGeminiCost = Number((stats.customGeminiCost + rowCost(row)).toFixed(6));
    }
    if (type === "client_gemini_explicit_cache_boost") {
      stats.cacheBoostCharges += rowAmount(row);
      stats.cacheBoostCost = Number((stats.cacheBoostCost + rowCost(row)).toFixed(6));
    }
  }
  return stats;
}

export function buildClientGeminiUsageSummary(input: {
  todayRows?: UsageRow[];
  sevenDayRows?: UsageRow[];
  totalRows?: UsageRow[];
  todayTelemetryRows?: any[];
  sevenDayTelemetryRows?: any[];
  totalTelemetryRows?: any[];
  cacheBoostEnabled?: boolean;
}) {
  return {
    cacheBoostEnabled: Boolean(input.cacheBoostEnabled),
    today: summarizeClientGeminiUsageStats(input.todayRows || []),
    last7Days: summarizeClientGeminiUsageStats(input.sevenDayRows || []),
    total: summarizeClientGeminiUsageStats(input.totalRows || []),
    cacheBoostStats: {
      today: summarizeClientGeminiCacheTelemetry(input.todayTelemetryRows || []),
      last7Days: summarizeClientGeminiCacheTelemetry(input.sevenDayTelemetryRows || []),
      total: summarizeClientGeminiCacheTelemetry(input.totalTelemetryRows || []),
    },
  };
}
