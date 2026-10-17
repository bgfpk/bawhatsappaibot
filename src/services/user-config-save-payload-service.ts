const DHL_WRITE_FIELDS = [
  "dhl_api_key",
  "dhl_service",
  "dhl_requester_country_code",
  "dhl_origin_country_code",
  "dhl_language",
  "dhl_enabled",
] as const;

const ACCOUNT_FIELD_MAPPERS: Record<string, (input: any, existing: any) => any> = {
  postexApiKey: (input) => input.postexApiKey || null,
  postex_api_key: (input) => input.postex_api_key || null,
  leopardsApiKey: (input) => input.leopardsApiKey || null,
  leopards_api_key: (input) => input.leopards_api_key || null,
  leopardsApiPassword: (input) => input.leopardsApiPassword || null,
  leopards_api_password: (input) => input.leopards_api_password || null,
  dhlApiKey: (input, existing) => input.dhlApiKey === "__masked_secret__" ? (existing?.dhl_api_key || null) : (input.dhlApiKey || null),
  dhl_api_key: (input, existing) => input.dhl_api_key === "__masked_secret__" ? (existing?.dhl_api_key || null) : (input.dhl_api_key || null),
  dhlService: (input) => input.dhlService || null,
  dhl_service: (input) => input.dhl_service || null,
  dhlRequesterCountryCode: (input) => input.dhlRequesterCountryCode || null,
  dhl_requester_country_code: (input) => input.dhl_requester_country_code || null,
  dhlOriginCountryCode: (input) => input.dhlOriginCountryCode || null,
  dhl_origin_country_code: (input) => input.dhl_origin_country_code || null,
  dhlLanguage: (input) => input.dhlLanguage || null,
  dhl_language: (input) => input.dhl_language || null,
  dhlEnabled: (input) => input.dhlEnabled === true || input.dhlEnabled === 1 ? 1 : 0,
  dhl_enabled: (input) => input.dhl_enabled === true || input.dhl_enabled === 1 ? 1 : 0,
  adminNumber: (input) => input.adminNumber ?? null,
  admin_number: (input) => input.admin_number ?? null,
  proxyUrl: (input) => input.proxyUrl ?? null,
  proxy_url: (input) => input.proxy_url ?? null,
  useDedicatedProxy: (input) => input.useDedicatedProxy === true || input.useDedicatedProxy === 1 ? 1 : 0,
  use_dedicated_proxy: (input) => input.use_dedicated_proxy === true || input.use_dedicated_proxy === 1 ? 1 : 0,
  system_alerts_enabled: (input) => input.system_alerts_enabled === false || input.system_alerts_enabled === 0 ? 0 : 1,
  billing_alerts_enabled: (input) => input.billing_alerts_enabled === false || input.billing_alerts_enabled === 0 ? 0 : 1,
  proxy_alerts_enabled: (input) => input.proxy_alerts_enabled === false || input.proxy_alerts_enabled === 0 ? 0 : 1,
  order_alerts_enabled: (input) => input.order_alerts_enabled === false || input.order_alerts_enabled === 0 ? 0 : 1,
  businessTimezone: (input) => input.businessTimezone || null,
  business_timezone: (input) => input.business_timezone || null,
  delayedReadReceiptsEnabled: (input) => input.delayedReadReceiptsEnabled === true || input.delayedReadReceiptsEnabled === 1 || input.delayedReadReceiptsEnabled === "true" || input.delayedReadReceiptsEnabled === "1" ? 1 : 0,
  delayed_read_receipts_enabled: (input) => input.delayed_read_receipts_enabled === true || input.delayed_read_receipts_enabled === 1 || input.delayed_read_receipts_enabled === "true" || input.delayed_read_receipts_enabled === "1" ? 1 : 0,
  readReceiptDelaySeconds: (input) => {
    const val = Number(input.readReceiptDelaySeconds);
    return Number.isFinite(val) && val >= 0 ? Math.floor(val) : 10;
  },
  read_receipt_delay_seconds: (input) => {
    const val = Number(input.read_receipt_delay_seconds);
    return Number.isFinite(val) && val >= 0 ? Math.floor(val) : 10;
  },
};

const ACCOUNT_FIELD_TARGETS: Record<string, string> = {
  postexApiKey: "postex_api_key",
  postex_api_key: "postex_api_key",
  leopardsApiKey: "leopards_api_key",
  leopards_api_key: "leopards_api_key",
  leopardsApiPassword: "leopards_api_password",
  leopards_api_password: "leopards_api_password",
  dhlApiKey: "dhl_api_key",
  dhl_api_key: "dhl_api_key",
  dhlService: "dhl_service",
  dhl_service: "dhl_service",
  dhlRequesterCountryCode: "dhl_requester_country_code",
  dhl_requester_country_code: "dhl_requester_country_code",
  dhlOriginCountryCode: "dhl_origin_country_code",
  dhl_origin_country_code: "dhl_origin_country_code",
  dhlLanguage: "dhl_language",
  dhl_language: "dhl_language",
  dhlEnabled: "dhl_enabled",
  dhl_enabled: "dhl_enabled",
  adminNumber: "admin_number",
  admin_number: "admin_number",
  proxyUrl: "proxy_url",
  proxy_url: "proxy_url",
  useDedicatedProxy: "use_dedicated_proxy",
  use_dedicated_proxy: "use_dedicated_proxy",
  system_alerts_enabled: "system_alerts_enabled",
  billing_alerts_enabled: "billing_alerts_enabled",
  proxy_alerts_enabled: "proxy_alerts_enabled",
  order_alerts_enabled: "order_alerts_enabled",
  businessTimezone: "business_timezone",
  business_timezone: "business_timezone",
  delayedReadReceiptsEnabled: "delayed_read_receipts_enabled",
  delayed_read_receipts_enabled: "delayed_read_receipts_enabled",
  readReceiptDelaySeconds: "read_receipt_delay_seconds",
  read_receipt_delay_seconds: "read_receipt_delay_seconds",
};

export function buildUserConfigWritePayload(input: any, existing: any = {}) {
  const data: Record<string, any> = {};
  for (const [sourceKey, targetKey] of Object.entries(ACCOUNT_FIELD_TARGETS)) {
    if (!(sourceKey in (input || {}))) continue;
    data[targetKey] = ACCOUNT_FIELD_MAPPERS[sourceKey](input, existing);
  }
  if (Object.keys(data).length > 0) {
    data.updated_at = Math.floor(Date.now() / 1000);
  }
  return data;
}

export function stripDhlFieldsFromUserConfigPayload(data: Record<string, any>) {
  const next = { ...(data || {}) };
  for (const key of DHL_WRITE_FIELDS) delete next[key];
  return next;
}

export function isUnsupportedDhlUserConfigError(error: any) {
  const message = String(error?.message || "");
  return error?.code === 400 && /unknown attribute:\s*"dhl_/i.test(message);
}

export function isUnsupportedDelayedReadConfigError(error: any) {
  const message = String(error?.message || "");
  return error?.code === 400 && /unknown attribute:\s*"(?:delayed_read_receipts_enabled|read_receipt_delay_seconds)"/i.test(message);
}

export function stripDelayedReadFieldsFromUserConfigPayload(data: Record<string, any>) {
  const next = { ...(data || {}) };
  delete next.delayed_read_receipts_enabled;
  delete next.read_receipt_delay_seconds;
  return next;
}
