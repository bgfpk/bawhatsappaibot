import crypto from "crypto";
import * as dbService from "./db-service.ts";
import { chargeUsageBillingAction, previewUsageBillingAction } from "./outbound-message-billing-service.ts";
import { emitLiveConsoleEvent, maskLiveConsoleJid } from "./live-console-event-service.ts";

const SCAN_REFRESH_SECONDS = 30 * 24 * 60 * 60;
const FETCH_TIMEOUT_MS = 2200;
const ACTION = "customer_profile_intelligence_scan" as const;
const NO_USEFUL_SCAN_ERRORS = new Set(["no_useful_visible_business_data", "no_useful_data"]);

type ScanDeps = {
  getCustomerProfile: typeof dbService.getCustomerProfile;
  updateCustomerProfile: typeof dbService.updateCustomerProfile;
  previewUsageBillingAction: typeof previewUsageBillingAction;
  chargeUsageBillingAction: typeof chargeUsageBillingAction;
  emitLiveConsoleEvent: typeof emitLiveConsoleEvent;
  now: () => number;
};

const scanDeps: ScanDeps = {
  getCustomerProfile: dbService.getCustomerProfile,
  updateCustomerProfile: dbService.updateCustomerProfile,
  previewUsageBillingAction,
  chargeUsageBillingAction,
  emitLiveConsoleEvent,
  now: () => Math.floor(Date.now() / 1000),
};

export function __setCustomerIntelligenceScanTestDeps(overrides: Partial<ScanDeps>) {
  Object.assign(scanDeps, overrides || {});
}

export function __resetCustomerIntelligenceScanTestDeps() {
  Object.assign(scanDeps, {
    getCustomerProfile: dbService.getCustomerProfile,
    updateCustomerProfile: dbService.updateCustomerProfile,
    previewUsageBillingAction,
    chargeUsageBillingAction,
    emitLiveConsoleEvent,
    now: () => Math.floor(Date.now() / 1000),
  });
}

function clean(value: any, limit = 240) {
  return String(value ?? "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function asArray(value: any) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function isEnabled(value: any) {
  return value === true || value === 1 || value === "1" || String(value || "").toLowerCase() === "true";
}

function withTimeout<T>(promise: Promise<T>, ms = FETCH_TIMEOUT_MS): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise.then((value) => {
      clearTimeout(timer);
      resolve(value);
    }).catch(() => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

function safeFetch<T>(fn: () => Promise<T> | T) {
  try {
    return withTimeout(Promise.resolve(fn()));
  } catch {
    return Promise.resolve(null);
  }
}

function hash(value: any) {
  return crypto.createHash("sha1").update(JSON.stringify(value || {})).digest("hex").slice(0, 16);
}

function priceToNumber(value: any) {
  if (typeof value === "number") return value;
  const text = clean(value, 40).replace(/[^\d.]/g, "");
  return text ? Number(text) : 0;
}

function normalizeCatalogProducts(catalog: any) {
  const products = asArray(catalog?.products || catalog?.items || catalog?.data || catalog?.catalog?.products);
  return products.slice(0, 10).map((item: any) => ({
    name: clean(item?.name || item?.title, 120),
    price: priceToNumber(item?.price || item?.retailer_price || item?.priceAmount1000),
    currency: clean(item?.currency || item?.priceCurrency || item?.currencyCode, 20),
    description: clean(item?.description || item?.body, 180),
    image: clean(item?.imageUrl || item?.thumbnailUrl || item?.mediaUrl, 260),
  })).filter((item: any) => item.name || item.description);
}

function normalizeWebsites(profile: any) {
  return [
    ...asArray(profile?.website),
    ...asArray(profile?.websites),
    ...asArray(profile?.websiteUrl),
  ].map((item) => clean(item, 180)).filter(Boolean).slice(0, 5);
}

export function normalizeWhatsAppCustomerIntelligence(input: {
  jid: string;
  pushName?: string;
  onWhatsApp?: any;
  businessProfile?: any;
  status?: any;
  profilePictureUrl?: any;
  catalog?: any;
  scannedAt?: number;
}) {
  const profile = input.businessProfile || {};
  const catalogProducts = normalizeCatalogProducts(input.catalog);
  const businessName = clean(profile?.businessName || profile?.name || profile?.verifiedName || profile?.title);
  const displayName = clean(input.pushName || profile?.displayName || profile?.notify);
  const about = clean(typeof input.status === "object" ? input.status?.status : input.status, 220);
  const normalized = {
    source: "whatsapp_visible_profile",
    scannedAt: input.scannedAt || Math.floor(Date.now() / 1000),
    expiresAt: (input.scannedAt || Math.floor(Date.now() / 1000)) + SCAN_REFRESH_SECONDS,
    businessAccount: Boolean(profile?.wid || profile?.description || profile?.category || profile?.email || profile?.address || catalogProducts.length),
    businessName,
    displayName,
    about,
    category: clean(profile?.category || profile?.vertical, 120),
    description: clean(profile?.description, 500),
    email: clean(profile?.email, 180),
    websites: normalizeWebsites(profile),
    address: clean(profile?.address, 260),
    businessHours: profile?.businessHours || profile?.business_hours || null,
    profilePictureUrl: clean(input.profilePictureUrl, 260),
    catalogAvailable: catalogProducts.length > 0 || Boolean(input.catalog),
    catalogProductCount: Number(input.catalog?.totalProducts || input.catalog?.productCount || catalogProducts.length || 0),
    catalogSampleProducts: catalogProducts,
    confidence: "observed",
    rawFetchStatus: {
      onWhatsApp: Array.isArray(input.onWhatsApp) ? input.onWhatsApp.some((item: any) => item?.exists) : Boolean(input.onWhatsApp),
      hasBusinessProfile: Boolean(input.businessProfile),
      hasStatus: Boolean(input.status),
      hasCatalog: Boolean(input.catalog),
    },
  };
  return normalized;
}

export function hasUsefulCustomerIntelligence(scan: any) {
  return Boolean(
    scan?.businessAccount ||
    scan?.businessName ||
    scan?.category ||
    scan?.description ||
    scan?.email ||
    scan?.address ||
    (Array.isArray(scan?.websites) && scan.websites.length > 0) ||
    Number(scan?.catalogProductCount || 0) > 0
  );
}

function hasFreshScanWindow(scan: any, now: number) {
  return Boolean(scan?.expiresAt && Number(scan.expiresAt) > now);
}

function isNoUsefulNegativeScan(scan: any) {
  return NO_USEFUL_SCAN_ERRORS.has(clean(scan?.lastError, 80));
}

export function getCustomerIntelligenceFreshSkipReason(scan: any, now: number) {
  if (!hasFreshScanWindow(scan, now)) return "";
  if (hasUsefulCustomerIntelligence(scan)) return "fresh";
  if (isNoUsefulNegativeScan(scan)) return "fresh_no_useful_data";
  return "";
}

function shortRef(value: any) {
  const text = clean(value, 160);
  return text ? text.slice(0, 10) : "";
}

function billingMetadata(input: any, charge: any, eventId: string, billing: any = {}) {
  return {
    action: ACTION,
    amount: Number(charge?.cost || billing?.cost || 0),
    status: charge?.charged ? "charged" : charge?.duplicate ? "duplicate" : "not_charged",
    eventRef: shortRef(eventId || charge?.dedupeKey),
    dedupeRef: shortRef(charge?.dedupeKey),
    customer: maskLiveConsoleJid(input.customerJid),
    source: "customer_intelligence_scan",
  };
}

export function buildCustomerIntelligencePromptSection(profile: any) {
  const info = profile?.whatsappCustomerIntelligence;
  if (!info || !hasUsefulCustomerIntelligence(info)) return "";
  const products = asArray(info.catalogSampleProducts).slice(0, 5)
    .map((item: any) => [clean(item?.name, 80), item?.price ? `${item.price} ${clean(item?.currency, 12)}` : ""].filter(Boolean).join(" - "))
    .filter(Boolean);
  return [
    "Observed WhatsApp business profile:",
    info.businessName ? `Business name: ${clean(info.businessName, 120)}` : "",
    info.displayName ? `Display name: ${clean(info.displayName, 120)}` : "",
    info.category ? `Category: ${clean(info.category, 120)}` : "",
    info.description ? `Description: ${clean(info.description, 220)}` : "",
    info.email ? `Email: ${clean(info.email, 140)}` : "",
    info.websites?.length ? `Websites: ${info.websites.map((site: any) => clean(site, 100)).join(", ")}` : "",
    info.catalogProductCount ? `Catalog products visible: ${Number(info.catalogProductCount || 0)}` : "",
    products.length ? `Catalog samples: ${products.join("; ")}` : "",
    "Use this as observed WhatsApp profile/catalog context to personalize and avoid generic questions. Do not treat profile address as delivery address unless the customer confirms it.",
  ].filter(Boolean).join("\n");
}

async function fetchVisibleWhatsAppData(sock: any, jid: string) {
  const calls = await Promise.all([
    safeFetch(() => sock?.onWhatsApp?.(jid)),
    safeFetch(() => sock?.getBusinessProfile?.(jid)),
    safeFetch(() => sock?.fetchStatus?.(jid)),
    safeFetch(() => sock?.profilePictureUrl?.(jid, "image")),
    safeFetch(async () => {
      try {
        return await sock?.getCatalog?.({ jid });
      } catch {
        return await sock?.getCatalog?.(jid);
      }
    }),
  ]);
  return {
    onWhatsApp: calls[0],
    businessProfile: calls[1],
    status: calls[2],
    profilePictureUrl: calls[3],
    catalog: calls[4],
  };
}

function emit(type: Parameters<typeof emitLiveConsoleEvent>[0]["type"], input: any, level: "info" | "warn" | "error" | "success", title: string, message: string, reason = "", metadata: Record<string, any> = {}) {
  scanDeps.emitLiveConsoleEvent({
    type,
    level,
    scope: "bot",
    accountId: input.accountId,
    botId: input.botId || input.dataOwnerKey,
    customerJid: input.customerJid,
    title,
    message,
    reason,
    metadata,
  });
}

export async function maybeRunCustomerIntelligenceScan(input: {
  sock: any;
  accountId?: string;
  botId?: string;
  dataOwnerKey: string;
  customerJid: string;
  pushName?: string;
  botConfig?: any;
  existingProfile?: any;
}) {
  const enabled = isEnabled(input.botConfig?.customerIntelligenceScanEnabled ?? input.botConfig?.customer_intelligence_scan_enabled);
  if (!enabled) return { status: "skipped", reason: "feature_off" };

  const now = scanDeps.now();
  const existing = input.existingProfile || await scanDeps.getCustomerProfile(input.dataOwnerKey, input.customerJid).catch(() => ({}));
  const previous = existing?.whatsappCustomerIntelligence;
  const freshReason = getCustomerIntelligenceFreshSkipReason(previous, now);
  if (freshReason === "fresh") {
    emit("customer_profile_scan_skipped", input, "info", "Customer scan skipped", "Existing customer intelligence is still fresh.", "fresh", {
      expiresAt: previous?.expiresAt || 0,
      source: previous?.source || "",
    });
    return { status: "skipped", reason: "fresh" };
  }
  if (freshReason === "fresh_no_useful_data") {
    emit("customer_profile_scan_skipped", input, "info", "Customer scan skipped", "Recent no-useful profile scan is still fresh.", "fresh_no_useful_data", {
      expiresAt: previous?.expiresAt || 0,
      lastError: previous?.lastError || "no_useful_data",
    });
    return { status: "skipped", reason: "fresh_no_useful_data" };
  }

  const billing = await scanDeps.previewUsageBillingAction(input.accountId, ACTION);
  if (!billing.allowed) {
    emit("customer_profile_scan_not_charged", input, "warn", "Customer scan not charged", "Scan skipped before fetch because billing/access is not available.", billing.reason || "not_allowed", { action: ACTION, amount: billing.cost, status: "not_charged" });
    return { status: "skipped", reason: billing.reason || "not_allowed" };
  }

  emit("customer_profile_scan_started", input, "info", "Customer scan started", "Fetching visible WhatsApp profile/catalog data.");
  let normalized: any;
  try {
    const fetched = await fetchVisibleWhatsAppData(input.sock, input.customerJid);
    normalized = normalizeWhatsAppCustomerIntelligence({
      jid: input.customerJid,
      pushName: input.pushName,
      scannedAt: now,
      ...fetched,
    });
  } catch (error: any) {
    emit("customer_profile_scan_failed", input, "warn", "Customer scan failed", "Visible WhatsApp profile/catalog fetch failed.", clean(error?.message, 100) || "fetch_failed");
    return { status: "failed", reason: "fetch_failed" };
  }

  if (!hasUsefulCustomerIntelligence(normalized)) {
    const failedPatch = {
      whatsappCustomerIntelligence: {
        source: "whatsapp_visible_profile",
        scannedAt: now,
        expiresAt: now + SCAN_REFRESH_SECONDS,
        businessAccount: false,
        confidence: "observed",
        lastError: "no_useful_visible_business_data",
      },
    };
    await scanDeps.updateCustomerProfile(input.dataOwnerKey, input.customerJid, failedPatch).catch(() => {});
    emit("customer_profile_scan_skipped", input, "info", "Customer scan skipped", "No useful visible business profile/catalog data was found. No wallet charge was created.", "no_useful_data", { action: ACTION, status: "not_charged" });
    return { status: "skipped", reason: "no_useful_data" };
  }

  const profileHash = hash(normalized);
  const refreshWindowStart = Math.floor(now / SCAN_REFRESH_SECONDS) * SCAN_REFRESH_SECONDS;
  const eventId = `customer_profile_scan:${input.accountId}:${input.botId || input.dataOwnerKey}:${input.customerJid}:${refreshWindowStart}:${profileHash}`;
  const patch = {
    whatsappCustomerIntelligence: {
      ...normalized,
      profileHash,
    },
  };

  try {
    await scanDeps.updateCustomerProfile(input.dataOwnerKey, input.customerJid, patch);
  } catch (error: any) {
    emit("customer_profile_scan_failed", input, "error", "Customer scan failed", "Useful scan data could not be saved.", clean(error?.message, 100) || "save_failed");
    return { status: "failed", reason: "save_failed" };
  }

  emit("customer_profile_scan_saved", input, "success", "Customer scan saved", "Useful WhatsApp profile/catalog intelligence was saved.", "", {
    catalogProductCount: normalized.catalogProductCount || 0,
    category: normalized.category || "",
  });

  const charge = await scanDeps.chargeUsageBillingAction(input.accountId, ACTION, {
    botId: input.botId || input.dataOwnerKey,
    customerJid: input.customerJid,
    eventId,
  }, "Customer Intelligence Scan debit");
  const charged = Boolean(charge?.charged);
  const duplicate = Boolean(charge?.duplicate);
  const chargeRecorded = charged || duplicate;
  const title = charged ? "Customer scan charged" : duplicate ? "Customer scan charge already recorded" : "Customer scan not charged";
  const message = charged ? "Saved scan usage charge recorded." : duplicate ? "Wallet charge already recorded; no new debit." : "Saved scan did not create a usage charge.";
  emit(charged ? "customer_profile_scan_charged" : "customer_profile_scan_not_charged", input, charged ? "success" : duplicate ? "info" : "warn", title, message, charge?.reason || "", billingMetadata(input, charge, eventId, billing));
  return { status: "saved", charged: chargeRecorded, chargeStatus: charged ? "charged" : duplicate ? "duplicate" : "not_charged", reason: charge?.reason || "", intelligence: patch.whatsappCustomerIntelligence };
}
