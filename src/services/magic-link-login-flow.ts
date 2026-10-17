export const MAGIC_LINK_DASHBOARD_PATH = "/global_dashboard";

export type MagicLinkLoginSuccessState = {
  user: any;
  showLanding: false;
  redirectPath: string;
  sessionType: "temporary" | null;
};

export function buildMagicLinkLoginSuccessState(user: any): MagicLinkLoginSuccessState {
  return {
    user,
    showLanding: false,
    redirectPath: MAGIC_LINK_DASHBOARD_PATH,
    sessionType: user?.is_temporary_session ? "temporary" : null,
  };
}

export function getMagicLinkLoginErrorMessage(data: any) {
  const rawError = String(data?.error || "").trim();
  if (!rawError) return "Login link is invalid or has expired.";
  if (/invalid|expired|used/i.test(rawError)) return "Login link is invalid, expired, or has already been used.";
  return rawError;
}

export function removeMagicLinkTokenFromUrl(url: string, dashboardPath = MAGIC_LINK_DASHBOARD_PATH) {
  const parsed = new URL(url, "https://blackarrow-source.offline.invalid");
  parsed.searchParams.delete("login_token");
  return dashboardPath || `${parsed.pathname}${parsed.search}${parsed.hash}`;
}
