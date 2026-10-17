// src/services/meta-embedded-signup-service.ts
//
// Client-side manager for Meta Embedded Signup (Facebook Login for Business).
// - Loads and initializes the Facebook JavaScript SDK once.
// - Strictly validates postMessage origins (HTTPS, exact facebook.com domain/subdomain).
// - Captures short-lived authorization code and WABA / Phone Number ID session info.
// - Sanitizes logs and never exposes secrets.

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

export interface MetaEmbeddedSignupSessionInfo {
  wabaId: string;
  phoneNumberId: string;
  businessId?: string;
  currentStep?: string;
}

export interface LaunchEmbeddedSignupOptions {
  appId: string;
  configId: string;
  graphVersion?: string;
  state: string;
  onSuccess: (result: { code: string; sessionInfo: MetaEmbeddedSignupSessionInfo }) => void;
  onError: (error: Error) => void;
  onCancel?: () => void;
}

const FB_SDK_URL = "https://connect.facebook.net/en_US/sdk.js";
let sdkLoadingPromise: Promise<any> | null = null;
let sdkInitialized = false;

/**
 * Validates whether a postMessage origin is a trusted HTTPS Meta/Facebook origin.
 * Uses exact URL parsing and strict dot-boundary domain check.
 */
export function isTrustedMetaOrigin(origin: string): boolean {
  if (!origin || typeof origin !== "string") {
    return false;
  }

  try {
    const parsed = new URL(origin);
    if (parsed.protocol !== "https:") {
      return false;
    }

    const host = parsed.hostname.toLowerCase();
    if (host === "facebook.com" || host === "www.facebook.com") {
      return true;
    }

    // Strict dot-boundary check for subdomains (e.g. web.facebook.com)
    if (host.endsWith(".facebook.com")) {
      const prefix = host.slice(0, -".facebook.com".length);
      // Ensure no sneaky tricks like attacker.facebook.com with weird chars
      if (/^[a-z0-9-]+$/.test(prefix)) {
        return true;
      }
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Safely parses and extracts WA_EMBEDDED_SIGNUP event payload.
 */
export function extractEmbeddedSignupEventData(rawData: any): MetaEmbeddedSignupSessionInfo | null {
  let data = rawData;
  if (typeof rawData === "string") {
    try {
      data = JSON.parse(rawData);
    } catch {
      return null;
    }
  }

  if (!data || typeof data !== "object") {
    return null;
  }

  if (data.type === "WA_EMBEDDED_SIGNUP") {
    const eventData = data.data || data.event || {};
    const wabaId = String(eventData.waba_id || eventData.wabaId || "").trim();
    const phoneNumberId = String(eventData.phone_number_id || eventData.phoneNumberId || "").trim();
    const businessId = eventData.business_id || eventData.businessId ? String(eventData.business_id || eventData.businessId).trim() : undefined;
    const currentStep = eventData.current_step ? String(eventData.current_step) : undefined;

    if (wabaId || phoneNumberId) {
      return {
        wabaId,
        phoneNumberId,
        businessId,
        currentStep,
      };
    }
  }

  return null;
}

/**
 * Loads the official Facebook SDK asynchronously.
 */
export function loadFacebookSdk(): Promise<any> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Facebook SDK cannot be loaded in non-browser environment"));
  }

  if (window.FB) {
    return Promise.resolve(window.FB);
  }

  if (sdkLoadingPromise) {
    return sdkLoadingPromise;
  }

  sdkLoadingPromise = new Promise((resolve, reject) => {
    // If script already exists in document
    const existingScript = document.querySelector(`script[src="${FB_SDK_URL}"]`);
    if (existingScript) {
      window.fbAsyncInit = () => {
        resolve(window.FB);
      };
      return;
    }

    const script = document.createElement("script");
    script.src = FB_SDK_URL;
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";

    script.onload = () => {
      if (window.FB) {
        resolve(window.FB);
      } else {
        window.fbAsyncInit = () => {
          resolve(window.FB);
        };
      }
    };

    script.onerror = () => {
      sdkLoadingPromise = null;
      reject(new Error("Failed to load Meta Facebook SDK. Please check your network connection or ad blocker."));
    };

    document.head.appendChild(script);
  });

  return sdkLoadingPromise;
}

/**
 * Initializes the Facebook SDK with BlackArrow App ID and Graph version.
 */
export async function initFacebookSdk(appId: string, graphVersion: string = "v20.0"): Promise<any> {
  const fb = await loadFacebookSdk();
  if (!sdkInitialized && fb && typeof fb.init === "function") {
    fb.init({
      appId,
      version: graphVersion,
      xfbml: false,
      cookie: false,
    });
    sdkInitialized = true;
  }
  return fb;
}

/**
 * Launches Facebook Login for Business with the configured Meta Embedded Signup config ID.
 */
export async function launchMetaEmbeddedSignup(options: LaunchEmbeddedSignupOptions): Promise<() => void> {
  const { appId, configId, graphVersion, state, onSuccess, onError, onCancel } = options;

  let capturedSessionInfo: MetaEmbeddedSignupSessionInfo | null = null;
  let capturedCode: string | null = null;
  let completed = false;

  const tryComplete = () => {
    if (completed) return;
    if (capturedCode && capturedSessionInfo) {
      completed = true;
      cleanup();
      onSuccess({
        code: capturedCode,
        sessionInfo: capturedSessionInfo,
      });
    }
  };

  // 1. Setup message listener for WA_EMBEDDED_SIGNUP cross-window event
  const messageHandler = (event: MessageEvent) => {
    if (!isTrustedMetaOrigin(event.origin)) {
      return;
    }

    const parsed = extractEmbeddedSignupEventData(event.data);
    if (parsed) {
      capturedSessionInfo = parsed;
      tryComplete();
    }
  };

  window.addEventListener("message", messageHandler);

  const cleanup = () => {
    window.removeEventListener("message", messageHandler);
  };

  // 2. Initialize SDK and launch Login for Business
  try {
    const fb = await initFacebookSdk(appId, graphVersion);

    fb.login(
      (response: any) => {
        if (response?.authResponse?.code) {
          capturedCode = String(response.authResponse.code);
          tryComplete();
        } else if (response?.status === "unknown" || !response?.authResponse) {
          // User closed popup or cancelled
          cleanup();
          if (onCancel) {
            onCancel();
          } else {
            onError(new Error("Meta signup was cancelled or closed."));
          }
        } else {
          cleanup();
          onError(new Error("Meta authentication did not return an authorization code."));
        }
      },
      {
        config_id: configId,
        response_type: "code",
        override_default_response_type: true,
        state,
      }
    );
  } catch (err: any) {
    cleanup();
    onError(err instanceof Error ? err : new Error(String(err)));
  }

  return cleanup;
}
