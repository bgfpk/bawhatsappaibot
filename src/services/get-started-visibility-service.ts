export type GetStartedVisibilityPreference = boolean | null;

export const GET_STARTED_STORE_KEY = "show_get_started";

export function getGetStartedStorageKey(userId?: string | null): string {
  const cleanId = String(userId || "").trim();
  return cleanId ? `blackarrow_show_get_started:${cleanId}` : "blackarrow_show_get_started";
}

export function resolveGetStartedVisibility(input: {
  isLaunchReady: boolean;
  preference?: GetStartedVisibilityPreference;
}): boolean {
  if (input.preference === true) {
    return true;
  }
  if (input.preference === false) {
    return false;
  }
  // Default / auto mode: visible if incomplete, hidden once launch-ready
  return !input.isLaunchReady;
}

export function resolveDefaultLoginPath(input: {
  isGetStartedVisible: boolean;
}): string {
  return input.isGetStartedVisible ? "/get-started" : "/dashboard";
}

export function loadStoredGetStartedPreference(userId?: string | null): GetStartedVisibilityPreference {
  if (typeof window === "undefined" || !window.localStorage) {
    return null;
  }
  try {
    const key = getGetStartedStorageKey(userId);
    const value = window.localStorage.getItem(key);
    if (value === "true" || value === "1") return true;
    if (value === "false" || value === "0") return false;
    return null;
  } catch {
    return null;
  }
}

export function saveStoredGetStartedPreference(
  userId: string | null | undefined,
  preference: GetStartedVisibilityPreference
): void {
  if (typeof window === "undefined" || !window.localStorage) {
    return;
  }
  try {
    const key = getGetStartedStorageKey(userId);
    if (preference === null || preference === undefined) {
      window.localStorage.removeItem(key);
    } else {
      window.localStorage.setItem(key, preference ? "true" : "false");
    }
  } catch {}
}
