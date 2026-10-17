const fallbackUrl = (value: string | undefined, fallback: string) => {
  const trimmed = value?.trim();
  return trimmed && /^https?:\/\//i.test(trimmed) ? trimmed : fallback;
};

export const PUBLIC_SITE_CONFIG = {
  siteUrl: fallbackUrl(process.env.NEXT_PUBLIC_SITE_URL, "https://blackarrow-source.offline.invalid"),
  appUrl: fallbackUrl(process.env.NEXT_PUBLIC_APP_URL, "https://blackarrow-source.offline.invalid"),
  loginUrl: fallbackUrl(process.env.NEXT_PUBLIC_BLACKARROW_LOGIN_URL, "https://blackarrow-source.offline.invalid/login"),
  signupUrl: fallbackUrl(process.env.NEXT_PUBLIC_BLACKARROW_SIGNUP_URL, "https://blackarrow-source.offline.invalid/signup"),
  dashboardUrl: fallbackUrl(process.env.NEXT_PUBLIC_BLACKARROW_DASHBOARD_URL, "https://blackarrow-source.offline.invalid/global_dashboard"),
  futureDashboardHost: "https://blackarrow-source.offline.invalid",
  supportEmail: "contact-086473cbd844@example.invalid",
};
