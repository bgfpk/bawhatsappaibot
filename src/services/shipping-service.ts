import * as dbService from "./db-service.ts";

const POSTEX_BASE_URL = "https://api.postex.pk/services/integration/api/order";
const DHL_TRACKING_BASE_URL = "https://api-eu.dhl.com/track/shipments";
const DHL_REQUEST_TIMEOUT_MS = 10000;
const DHL_CACHE_TTL_MS = 2 * 60 * 1000;
const DHL_MIN_REQUEST_GAP_MS = 1200;

type DhlTrackingConfig = {
  dhl_api_key?: string;
  dhl_service?: string;
  dhl_requester_country_code?: string;
  dhl_origin_country_code?: string;
  dhl_language?: string;
};

type DhlTrackingResult = {
  courier: "dhl";
  tracking_id: string;
  provider_name: string;
  service: string;
  current_status: string;
  status_code: string;
  status_category: string;
  latest_event_description: string;
  latest_event_time: string | null;
  latest_location: string;
  estimated_delivery: string | null;
  delivered_at: string | null;
  is_delivered: boolean;
  is_exception: boolean;
  customerPhone?: string;
  customerName?: string;
  orderRefNumber?: string;
  events: any[];
  raw_provider_response: any;
};

const dhlTrackingCache = new Map<string, { expiresAt: number; result: DhlTrackingResult }>();
const dhlThrottleState = new Map<string, number>();

export function toNumber(value: any) {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(String(value).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function normalizePostexPhone(phone: any) {
  let clean = String(phone || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("0092")) clean = clean.slice(2);
  if (clean.startsWith("92") && clean.length === 12) clean = "0" + clean.slice(2);
  if (clean.startsWith("3") && clean.length === 10) clean = "0" + clean;
  return clean;
}

export function normalizeWhatsAppPhone(phone: any) {
  let clean = String(phone || "").replace(/[^0-9]/g, "");
  if (clean.startsWith("0") && clean.length === 11) clean = "92" + clean.slice(1);
  if (clean.startsWith("3") && clean.length === 10) clean = "92" + clean;
  return clean;
}

export class CourierTrackingError extends Error {
  code: string;
  status: number;
  userMessage: string;

  constructor(code: string, message: string, status = 500, userMessage?: string) {
    super(message);
    this.name = "CourierTrackingError";
    this.code = code;
    this.status = status;
    this.userMessage = userMessage || message;
  }
}

function compactText(value: any) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function pickFirstString(...values: any[]) {
  for (const value of values) {
    const text = compactText(value);
    if (text) return text;
  }
  return "";
}

function parseIsoDate(value: any) {
  const text = compactText(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function buildDhlLocation(location: any) {
  const parts = [
    location?.addressLocality,
    location?.addressRegion,
    location?.postalCode,
    location?.countryCode,
  ].map(compactText).filter(Boolean);
  return parts.join(", ");
}

function readDhlShipmentEventDescription(event: any) {
  return pickFirstString(
    event?.description,
    event?.status,
    event?.statusCode,
    event?.remark,
    event?.serviceEvent?.description,
    event?.serviceEvent?.code,
  );
}

function readDhlShipmentEventTime(event: any) {
  return parseIsoDate(
    event?.timestamp ||
    event?.date ||
    event?.datetime ||
    event?.time
  );
}

function sortDhlEvents(events: any[]) {
  return [...events].sort((a, b) => {
    const left = readDhlShipmentEventTime(a);
    const right = readDhlShipmentEventTime(b);
    if (!left && !right) return 0;
    if (!left) return -1;
    if (!right) return 1;
    return new Date(left).getTime() - new Date(right).getTime();
  });
}

function inferDhlStatusCategory(statusCode: string, currentStatus: string, events: any[] = []) {
  const haystack = `${statusCode} ${currentStatus} ${events.map((event) => readDhlShipmentEventDescription(event)).join(" ")}`.toLowerCase();
  if (!haystack) return "unknown";
  if (haystack.includes("delivered") || haystack.includes("delivery completed")) return "delivered";
  if (haystack.includes("out for delivery") || haystack.includes("with delivery courier")) return "out_for_delivery";
  if (haystack.includes("transit") || haystack.includes("processed") || haystack.includes("departed") || haystack.includes("arrived")) return "in_transit";
  if (haystack.includes("pickup") || haystack.includes("picked up") || haystack.includes("shipment picked up")) return "picked_up";
  if (haystack.includes("return") || haystack.includes("returned")) return "returned";
  if (haystack.includes("failed") || haystack.includes("undeliverable") || haystack.includes("delivery attempted")) return "failed";
  if (haystack.includes("exception") || haystack.includes("hold") || haystack.includes("clearance") || haystack.includes("delay")) return "exception";
  if (haystack.includes("pre-transit") || haystack.includes("shipment information received") || haystack.includes("label created")) return "pending";
  return "unknown";
}

function isDhlDeliveredCategory(category: string, statusCode: string, currentStatus: string) {
  return category === "delivered" || /delivered/i.test(`${statusCode} ${currentStatus}`);
}

function isDhlExceptionCategory(category: string) {
  return ["failed", "returned", "exception"].includes(category);
}

export function getPostexTrackingData(response: any) {
  const dist = response?.dist?.trackingResponse || response?.trackingResponse || response?.dist || response || {};
  const trackingResponse = Array.isArray(dist?.trackingResponse)
    ? dist.trackingResponse[0]
    : Array.isArray(response?.trackingResponse)
      ? response.trackingResponse[0]
      : null;
  const item = trackingResponse || dist;
  const history = Array.isArray(dist.transactionStatusHistory) ? dist.transactionStatusHistory : [];
  const itemHistory = Array.isArray(item.transactionStatusHistory) ? item.transactionStatusHistory : history;
  const latestHistory = itemHistory.length > 0 ? itemHistory[itemHistory.length - 1] : null;
  const status = String(
    item.transactionStatus ||
    latestHistory?.transactionStatusMessage ||
    response?.message ||
    ""
  ).trim();
  const statusCode = String(latestHistory?.transactionStatusMessageCode || item.transactionStatusMessageCode || "").trim();
  const transactionFee = toNumber(item.transactionFee);
  const transactionTax = toNumber(item.transactionTax);
  const reversalFee = toNumber(item.reversalFee);
  const reversalTax = toNumber(item.reversalTax);
  const shippingCharge = transactionFee + transactionTax + reversalFee + reversalTax;

  return {
    raw: response,
    dist: item,
    trackingNumber: item.trackingNumber || response?.trackingNumber || "",
    orderRefNumber: item.orderRefNumber || "",
    customerName: item.customerName || "",
    customerPhone: item.customerPhone || "",
    deliveryAddress: item.deliveryAddress || "",
    invoicePayment: toNumber(item.invoicePayment),
    cityName: item.cityName || "",
    status,
    statusCode,
    statusSignature: `${statusCode || "status"}:${status || "unknown"}`,
    transactionFee,
    transactionTax,
    reversalFee,
    reversalTax,
    shippingCharge,
    history: itemHistory,
  };
}

export function getPostexBulkTrackingItems(response: any) {
  const candidates = [
    response?.dist?.trackingResponse,
    response?.trackingResponse,
    response?.dist,
    response?.data,
    response,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate;
    if (Array.isArray(candidate?.trackingResponse)) return candidate.trackingResponse;
  }
  return [];
}

export function extractPostexTrackingNumber(response: any) {
  const dist = response?.dist || response?.data || response?.order || response || {};
  const candidates = [
    dist.trackingNumber,
    dist.trackingNo,
    dist.tracking_number,
    dist.orderTrackingNumber,
    dist.trackingId,
    dist.consignmentNumber,
    dist.consignmentNo,
    dist.cnNumber,
    dist.cnNo,
    dist.cn,
    dist.awb,
    response?.trackingNumber,
    response?.trackingNo,
    response?.tracking_number,
    response?.orderTrackingNumber,
    response?.trackingId,
    response?.awb,
  ];
  return String(candidates.find(Boolean) || "").trim();
}

export async function trackPostexOrder(trackingNumber: string, token?: string) {
  if (!token) throw new Error("PostEx API token is missing");
  const response = await fetch(
    `${POSTEX_BASE_URL}/v1/track-order/${encodeURIComponent(trackingNumber)}`,
    { headers: { token } }
  );
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`PostEx tracking returned non-JSON response (${response.status})`);
  }
  const data = await response.json().catch(() => {
    throw new Error("PostEx tracking returned invalid JSON");
  });
  if (!response.ok || data.statusCode === "400" || data.statusCode === 400) {
    throw new Error(data.statusMessage || data.message || `PostEx tracking failed (${response.status})`);
  }
  return data;
}

export async function trackPostexOrdersBulk(trackingNumbers: string[], token?: string) {
  if (!token) throw new Error("PostEx API token is missing");
  const ids = Array.from(new Set((trackingNumbers || []).map((id) => String(id || "").trim()).filter(Boolean)));
  if (ids.length === 0) return [];
  const url = new URL(`${POSTEX_BASE_URL}/v1/track-bulk-order`);
  url.searchParams.set("trackingNumber", ids.join(","));
  const response = await fetch(url, { headers: { token } });
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error(`PostEx bulk tracking returned non-JSON response (${response.status})`);
  }
  const data = await response.json().catch(() => {
    throw new Error("PostEx bulk tracking returned invalid JSON");
  });
  if (!response.ok || data.statusCode === "400" || data.statusCode === 400) {
    throw new Error(data.statusMessage || data.message || `PostEx bulk tracking failed (${response.status})`);
  }
  return getPostexBulkTrackingItems(data);
}

export async function bookPostexOrder(bookingData: any, token?: string) {
  if (!token) throw new Error("PostEx API token is missing");
  const response = await fetch(`${POSTEX_BASE_URL}/v3/create-order`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      token,
    },
    body: JSON.stringify(bookingData),
  });
  const data = await response.json();
  if (!response.ok || data.statusCode === "400" || data.statusCode === 400) {
    throw new Error(data.statusMessage || data.message || `PostEx booking failed (${response.status})`);
  }
  return data;
}

export async function searchLeopardsOrders(trackingNumbers: string) {
  try {
    const userId = process.env.USER_ID;
    const userConfig = userId ? await dbService.loadUserConfig(userId) : null;
    const apiKey = userConfig?.leopards_api_key;
    const apiPassword = userConfig?.leopards_api_password;
    
    if (!apiKey || !apiPassword) return [];

    const url = "http://track.leopardscourier.com/api/trackBookedPacket/format/json/";
    
    const formData = new URLSearchParams();
    formData.append('api_key', apiKey);
    formData.append('api_password', apiPassword);
    formData.append('track_numbers', trackingNumbers);

    const r = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    const data = await r.json();
    return data && data.status === 1 ? data.packet_list : [];
  } catch (e) {
    console.error("Leopards API search error:", e);
    return [];
  }
}

export async function bookLeopardsOrder(bookingData: any) {
  try {
    const userId = process.env.USER_ID;
    const userConfig = userId ? await dbService.loadUserConfig(userId) : null;
    const apiKey = userConfig?.leopards_api_key;
    const apiPassword = userConfig?.leopards_api_password;
    
    if (!apiKey || !apiPassword) throw new Error("Leopards API credentials missing");

    const url = "http://track.leopardscourier.com/api/bookPacket/format/json/";
    
    const formData = new URLSearchParams();
    formData.append('api_key', apiKey);
    formData.append('api_password', apiPassword);
    
    // Append all booking items
    for (const [key, value] of Object.entries(bookingData)) {
       formData.append(key, String(value));
    }

    const r = await fetch(url, {
      method: 'POST',
      body: formData,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });
    return await r.json();
  } catch (e) {
    console.error("Leopards API booking error:", e);
    return { status: 0, error: String(e) };
  }
}

export async function searchPostexOrders(phoneNumber?: string, orderReference?: string, getAll?: boolean) {
  try {
    const userId = process.env.USER_ID;
    const userConfig = userId ? await dbService.loadUserConfig(userId) : null;
    const postexToken = userConfig?.postex_api_key;
    if (!postexToken) return [];

    const days = getAll ? 15 : 60;
    const toDate = new Date().toISOString().split("T")[0];
    const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const r = await fetch(
      `${POSTEX_BASE_URL}/v1/get-all-order?orderStatusID=0&fromDate=${fromDate}&toDate=${toDate}`,
      {
        headers: {
          token: postexToken,
        },
      },
    );
    const data = await r.json();

    let results: any[] = [];
    if (data.statusCode === "200" && data.dist) {
      if (getAll) return data.dist;
      
      results = data.dist.filter((order: any) => {
        const orderPhone = String(order.customerPhone || "");
        const orderRef = String(order.orderRefNumber || "");
        const searchPhone = phoneNumber ? String(phoneNumber) : "";
        const searchRef = orderReference ? String(orderReference) : "";
        const last7FromPhone = searchPhone.slice(-7);

        let cleanOrderPhone = orderPhone.replace(/[^0-9]/g, "");
        if (cleanOrderPhone.startsWith("92")) cleanOrderPhone = "0" + cleanOrderPhone.slice(2);
        
        let cleanSearchPhone = searchPhone.replace(/[^0-9]/g, "");
        if (cleanSearchPhone.startsWith("92")) cleanSearchPhone = "0" + cleanSearchPhone.slice(2);

        if (cleanSearchPhone && (cleanOrderPhone.includes(cleanSearchPhone) || cleanSearchPhone.includes(cleanOrderPhone))) return true;
        if (searchRef && orderRef === searchRef) return true;
        if (cleanSearchPhone && orderRef === last7FromPhone) return true;
        return false;
      });
    }
    return results;
  } catch (e) {
    return [];
  }
}

async function waitForDhlThrottle(cacheKey: string) {
  const nowTime = Date.now();
  const nextAllowedAt = dhlThrottleState.get(cacheKey) || 0;
  if (nextAllowedAt > nowTime) {
    await new Promise((resolve) => setTimeout(resolve, nextAllowedAt - nowTime));
  }
  dhlThrottleState.set(cacheKey, Date.now() + DHL_MIN_REQUEST_GAP_MS);
}

function buildDhlCacheKey(trackingId: string, config: DhlTrackingConfig) {
  return [
    compactText(config.dhl_api_key),
    compactText(config.dhl_service || "express").toLowerCase(),
    compactText(config.dhl_origin_country_code).toUpperCase(),
    compactText(config.dhl_requester_country_code).toUpperCase(),
    compactText(config.dhl_language).toLowerCase(),
    compactText(trackingId).toUpperCase(),
  ].join("|");
}

function readDhlErrorMessage(payload: any, fallback: string) {
  return pickFirstString(
    payload?.detail,
    payload?.title,
    payload?.message,
    payload?.error?.message,
    fallback,
  ) || fallback;
}

async function readDhlJson(response: Response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

export function normalizeDhlTrackingResponse(response: any, trackingId: string, config: DhlTrackingConfig = {}): DhlTrackingResult {
  const shipments = Array.isArray(response?.shipments) ? response.shipments : [];
  const shipment = shipments[0] || response?.shipment || response || {};
  const events = sortDhlEvents(Array.isArray(shipment?.events) ? shipment.events : []);
  const latestEvent = events.length > 0 ? events[events.length - 1] : null;
  const rawStatus = shipment?.status || {};
  const statusCode = pickFirstString(rawStatus?.statusCode, rawStatus?.status, latestEvent?.statusCode, latestEvent?.status);
  const currentStatus = pickFirstString(rawStatus?.description, rawStatus?.remark, latestEvent && readDhlShipmentEventDescription(latestEvent), shipment?.description, statusCode);
  const statusCategory = inferDhlStatusCategory(statusCode, currentStatus, events);
  const estimatedDelivery = parseIsoDate(shipment?.estimatedTimeOfDelivery);
  const deliveredAt = isDhlDeliveredCategory(statusCategory, statusCode, currentStatus)
    ? parseIsoDate(rawStatus?.timestamp || latestEvent && readDhlShipmentEventTime(latestEvent))
    : null;
  const latestLocation = buildDhlLocation(latestEvent?.location || rawStatus?.location || shipment?.status?.location || shipment?.origin || {});
  const latestEventDescription = latestEvent ? readDhlShipmentEventDescription(latestEvent) : currentStatus;
  const latestEventTime = latestEvent ? readDhlShipmentEventTime(latestEvent) : parseIsoDate(rawStatus?.timestamp);

  return {
    courier: "dhl",
    tracking_id: pickFirstString(
      shipment?.id,
      shipment?.trackingNumber,
      shipment?.shipmentNo,
      trackingId,
    ),
    provider_name: pickFirstString(shipment?.service, shipment?.productName, "DHL Express"),
    service: compactText(config.dhl_service || shipment?.service || "express").toLowerCase() || "express",
    current_status: currentStatus || "Unknown",
    status_code: statusCode || "unknown",
    status_category: statusCategory,
    latest_event_description: latestEventDescription || currentStatus || "Tracking update received",
    latest_event_time: latestEventTime,
    latest_location: latestLocation,
    estimated_delivery: estimatedDelivery,
    delivered_at: deliveredAt,
    is_delivered: isDhlDeliveredCategory(statusCategory, statusCode, currentStatus),
    is_exception: isDhlExceptionCategory(statusCategory),
    events: events.map((event) => ({
      description: readDhlShipmentEventDescription(event),
      timestamp: readDhlShipmentEventTime(event),
      location: buildDhlLocation(event?.location || {}),
      statusCode: pickFirstString(event?.statusCode, event?.status, event?.serviceEvent?.code),
      raw: event,
    })),
    raw_provider_response: response,
  };
}

export async function trackDhlShipment(trackingId: string, config: DhlTrackingConfig, fetchImpl: typeof fetch = fetch) {
  const cleanTrackingId = compactText(trackingId);
  if (!cleanTrackingId) {
    throw new CourierTrackingError("INVALID_TRACKING_ID", "Tracking ID is required.", 400, "Enter a valid DHL tracking ID first.");
  }
  const apiKey = compactText(config?.dhl_api_key);
  if (!apiKey) {
    throw new CourierTrackingError("CONFIG_ERROR", "DHL API key is missing.", 400, "DHL API key is missing. Add it in API & Integrations first.");
  }

  const cacheKey = buildDhlCacheKey(cleanTrackingId, config);
  const cached = dhlTrackingCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.result;
  }

  await waitForDhlThrottle(apiKey);

  const params = new URLSearchParams({ trackingNumber: cleanTrackingId });
  params.set("service", compactText(config?.dhl_service || "express").toLowerCase() || "express");
  if (compactText(config?.dhl_origin_country_code)) params.set("originCountryCode", compactText(config.dhl_origin_country_code).toUpperCase());
  if (compactText(config?.dhl_requester_country_code)) params.set("requesterCountryCode", compactText(config.dhl_requester_country_code).toUpperCase());
  if (compactText(config?.dhl_language)) params.set("language", compactText(config.dhl_language).toLowerCase());

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), DHL_REQUEST_TIMEOUT_MS);
  try {
    const response = await fetchImpl(`${DHL_TRACKING_BASE_URL}?${params.toString()}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "DHL-API-Key": apiKey,
      },
      signal: controller.signal,
    });

    const payload = await readDhlJson(response);
    if (!response.ok) {
      const message = readDhlErrorMessage(payload, `DHL tracking failed (${response.status})`);
      if (response.status === 401 || response.status === 403) {
        throw new CourierTrackingError("CREDENTIAL_ERROR", message, response.status, "DHL credentials were rejected. Check the API key and try again.");
      }
      if (response.status === 404) {
        throw new CourierTrackingError("NOT_FOUND", message, 404, "DHL has not returned tracking details for this tracking ID yet. Please check again later.");
      }
      if (response.status === 429) {
        throw new CourierTrackingError("RATE_LIMIT", message, 429, "DHL rate limit reached. Please wait a moment before syncing again.");
      }
      if (response.status >= 500) {
        throw new CourierTrackingError("TEMPORARY_ERROR", message, response.status, "DHL tracking is temporarily unavailable. Please try again shortly.");
      }
      throw new CourierTrackingError("REQUEST_FAILED", message, response.status, message);
    }

    const normalized = normalizeDhlTrackingResponse(payload, cleanTrackingId, config);
    dhlTrackingCache.set(cacheKey, {
      expiresAt: Date.now() + DHL_CACHE_TTL_MS,
      result: normalized,
    });
    return normalized;
  } catch (error: any) {
    if (error?.name === "AbortError") {
      throw new CourierTrackingError("TIMEOUT", "DHL tracking request timed out.", 504, "DHL took too long to respond. Please try again.");
    }
    if (error instanceof CourierTrackingError) {
      throw error;
    }
    throw new CourierTrackingError("UNKNOWN_ERROR", error?.message || "Unknown DHL tracking error.", 500, "Unable to fetch DHL tracking right now.");
  } finally {
    clearTimeout(timeout);
  }
}
