import { trackAnalyticsEvent } from "./analytics";

const SIGNUP_EVENT = "sign_up";
const CHECKOUT_EVENT = "begin_checkout";
const STORAGE_PREFIX = "blackarrow:conversion";
const GOOGLE_ADS_SEND_TO = "";

type SignupSource = "email_password" | "phone_otp" | "google_oauth";

type SignupInput = {
  user?: any;
  source: SignupSource;
};

type CheckoutInput = {
  checkoutId?: string;
  checkoutUrl?: string;
  type?: string;
  planId?: string;
  addonType?: string;
  billingCycle?: string;
};

function isDevelopment() {
  return (import.meta as any).env?.DEV === true;
}

function logDev(message: string, data?: Record<string, unknown>) {
  if (isDevelopment()) console.info(`[analytics] ${message}`, data || {});
}

function safeStorage(storage: Storage | undefined) {
  try {
    if (!storage) return null;
    const key = `${STORAGE_PREFIX}:probe`;
    storage.setItem(key, "1");
    storage.removeItem(key);
    return storage;
  } catch {
    return null;
  }
}

function getUserKey(user: any) {
  const id = String(user?.id || user?.$id || "").trim();
  return id ? `user:${id}` : "browser";
}

function getCheckoutKey(input: CheckoutInput) {
  const id = String(input.checkoutId || "").trim();
  if (id) return `checkout:${id}`;
  const url = String(input.checkoutUrl || "").trim();
  if (url) return `checkout_url:${url.slice(0, 180)}`;
  return ["checkout", input.type, input.planId, input.addonType, input.billingCycle, Date.now()].filter(Boolean).join(":");
}

function hasSent(storage: Storage | null, key: string) {
  return storage?.getItem(key) === "1";
}

function markSent(storage: Storage | null, key: string) {
  storage?.setItem(key, "1");
}

function conversionParams(params: Record<string, unknown> = {}) {
  return {
    ...params,
    ...(GOOGLE_ADS_SEND_TO ? { send_to: GOOGLE_ADS_SEND_TO } : {}),
  };
}

export function trackSignupConversion(input: SignupInput) {
  if (typeof window === "undefined") return false;
  const storage = safeStorage(window.localStorage);
  const key = `${STORAGE_PREFIX}:${SIGNUP_EVENT}:${getUserKey(input.user)}`;
  if (hasSent(storage, key)) {
    logDev("skipped duplicate sign_up", { source: input.source });
    return false;
  }

  trackAnalyticsEvent(SIGNUP_EVENT, conversionParams({ method: input.source }));
  markSent(storage, key);
  logDev("sent sign_up", { source: input.source });
  return true;
}

export function trackBeginCheckoutConversion(input: CheckoutInput) {
  if (typeof window === "undefined") return false;
  const storage = safeStorage(window.sessionStorage);
  const key = `${STORAGE_PREFIX}:${CHECKOUT_EVENT}:${getCheckoutKey(input)}`;
  if (hasSent(storage, key)) {
    logDev("skipped duplicate begin_checkout", { type: input.type, planId: input.planId, addonType: input.addonType });
    return false;
  }

  trackAnalyticsEvent(CHECKOUT_EVENT, conversionParams({
    checkout_type: input.type || "checkout",
    plan_id: input.planId || "",
    addon_type: input.addonType || "",
    billing_cycle: input.billingCycle || "",
  }));
  markSent(storage, key);
  logDev("sent begin_checkout", { type: input.type, planId: input.planId, addonType: input.addonType });
  return true;
}
