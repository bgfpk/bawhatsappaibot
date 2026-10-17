const DEFAULT_GA_MEASUREMENT_ID = "G-TT44FLS0WZ";
const META_ENV = (import.meta as any).env || {};
const GA_MEASUREMENT_ID = String(META_ENV.VITE_GA_MEASUREMENT_ID || DEFAULT_GA_MEASUREMENT_ID).trim();
const GA_HISTORY_PATCH_FLAG = "__blackarrowGaHistoryPatched";
const GA_LISTENER_FLAG = "__blackarrowGaListenerBound";
const GA_LAST_PAGE_KEY = "__blackarrowGaLastPage";
const GA_PAGE_EVENT = "blackarrow:pagechange";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: any[]) => void;
    [GA_HISTORY_PATCH_FLAG]?: boolean;
    [GA_LISTENER_FLAG]?: boolean;
    [GA_LAST_PAGE_KEY]?: string;
  }
}

function isAnalyticsEnabled() {
  return typeof window !== "undefined" && !!GA_MEASUREMENT_ID;
}

function getCurrentPageKey() {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

function dispatchPageChangeEvent() {
  window.dispatchEvent(new Event(GA_PAGE_EVENT));
}

function ensureGoogleAnalyticsInitialized() {
  if (!isAnalyticsEnabled()) return;

  window.dataLayer = window.dataLayer || [];
  if (typeof window.gtag !== "function") {
    window.gtag = function gtag(...args: any[]) {
      window.dataLayer?.push(args);
    };
    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
      anonymize_ip: true,
    });
  }
}

function trackCurrentPageView() {
  if (!isAnalyticsEnabled()) return;
  ensureGoogleAnalyticsInitialized();

  const pageKey = getCurrentPageKey();
  if (window[GA_LAST_PAGE_KEY] === pageKey) return;
  window[GA_LAST_PAGE_KEY] = pageKey;

  if (typeof window.gtag === "function") {
    window.gtag("event", "page_view", {
      page_title: document.title,
      page_location: window.location.href,
      page_path: `${window.location.pathname}${window.location.search}`,
    });
  }
}

function patchHistoryEvents() {
  if (!isAnalyticsEnabled() || window[GA_HISTORY_PATCH_FLAG]) return;
  window[GA_HISTORY_PATCH_FLAG] = true;

  const originalPushState = window.history.pushState.bind(window.history);
  const originalReplaceState = window.history.replaceState.bind(window.history);

  window.history.pushState = function pushState(...args) {
    originalPushState(...args);
    dispatchPageChangeEvent();
  };

  window.history.replaceState = function replaceState(...args) {
    originalReplaceState(...args);
    dispatchPageChangeEvent();
  };
}

export function initializeAnalytics() {
  if (!isAnalyticsEnabled()) return () => {};

  ensureGoogleAnalyticsInitialized();
  patchHistoryEvents();

  if (!window[GA_LISTENER_FLAG]) {
    window[GA_LISTENER_FLAG] = true;
    window.addEventListener("popstate", dispatchPageChangeEvent);
    window.addEventListener("hashchange", dispatchPageChangeEvent);
    window.addEventListener(GA_PAGE_EVENT, trackCurrentPageView);
  }

  trackCurrentPageView();
  return () => {};
}

export function getAnalyticsMeasurementId() {
  return GA_MEASUREMENT_ID;
}

export function trackAnalyticsEvent(eventName: string, params: Record<string, unknown> = {}) {
  if (!isAnalyticsEnabled()) return;
  ensureGoogleAnalyticsInitialized();

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, params);
  }
}
