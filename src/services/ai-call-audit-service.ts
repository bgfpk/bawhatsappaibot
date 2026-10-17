import { getGeminiCacheTelemetry } from "./gemini-cache-service.ts";

function clean(value: any) {
  return String(value || "").trim();
}

function maskCustomerJid(value: any) {
  const jid = clean(value);
  if (!jid) return "";
  const [local, domain] = jid.split("@");
  const maskedLocal = local.length <= 6 ? local : `${local.slice(0, 3)}...${local.slice(-2)}`;
  return domain ? `${maskedLocal}@${domain}` : maskedLocal;
}

export function buildAiCallAuditRecord(input: {
  provider?: any;
  result?: any;
  charged?: boolean;
  cacheBoostCharged?: boolean;
}) {
  const provider = input.provider || {};
  const cacheContext = provider.cacheTelemetryContext || {};
  const telemetry = getGeminiCacheTelemetry(input.result || {});
  return {
    purpose: clean(provider.purpose || "gemini_request"),
    accountId: clean(provider.accountId || provider.userId),
    botId: clean(provider.botId || provider.dataOwnerKey),
    customerJid: maskCustomerJid(provider.billingContext?.customerJid),
    billingGroupKey: clean(provider.billingContext?.billingGroupKey || provider.billingContext?.eventId || provider.billingContext?.messageId || provider.billingContext?.requestId),
    model: clean(provider.model),
    inputTokens: telemetry.inputTokens,
    outputTokens: telemetry.outputTokens,
    thoughtTokens: telemetry.thoughtTokens,
    totalTokens: telemetry.totalTokens,
    cacheBoostEnabled: Boolean(cacheContext.cacheBoostEnabled),
    cacheEligible: Boolean(cacheContext.cacheEligible),
    cacheAttempted: Boolean(cacheContext.cacheAttempted),
    cacheAttached: Boolean(cacheContext.cacheAttached),
    cacheHit: telemetry.cachedTokens > 0,
    cachedTokens: telemetry.cachedTokens,
    cacheMissReason: clean(telemetry.cachedTokens > 0 ? "" : cacheContext.cacheMissReason),
    wasCharged: Boolean(input.charged),
    cacheBoostCharged: Boolean(input.cacheBoostCharged),
    timestamp: Math.floor(Date.now() / 1000),
  };
}

export function recordAiCallAudit(input: {
  provider?: any;
  result?: any;
  charged?: boolean;
  cacheBoostCharged?: boolean;
}) {
  const record = buildAiCallAuditRecord(input);
  console.info(`[AiCallAudit] ${JSON.stringify(record)}`);
  return record;
}
