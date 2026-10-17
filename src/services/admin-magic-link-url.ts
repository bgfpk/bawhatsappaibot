import { MAGIC_LINK_DASHBOARD_PATH } from "./magic-link-login-flow.ts";

export function buildAdminMagicLoginLink(origin: string, token: string) {
  const base = new URL(MAGIC_LINK_DASHBOARD_PATH, `${origin.replace(/\/+$/, "")}/`);
  base.searchParams.set("login_token", token);
  return base.toString();
}
