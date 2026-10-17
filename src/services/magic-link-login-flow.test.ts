import test from "node:test";
import assert from "node:assert/strict";

import {
  buildMagicLinkLoginSuccessState,
  getMagicLinkLoginErrorMessage,
  MAGIC_LINK_DASHBOARD_PATH,
  removeMagicLinkTokenFromUrl,
} from "./magic-link-login-flow.ts";

test("token login success hides landing and routes to dashboard", () => {
  const user = { id: "client_1", email: "contact-f93fa2e5fb59@example.invalid", is_temporary_session: true };
  const state = buildMagicLinkLoginSuccessState(user);

  assert.equal(state.user, user);
  assert.equal(state.showLanding, false);
  assert.equal(state.redirectPath, MAGIC_LINK_DASHBOARD_PATH);
  assert.equal(state.sessionType, "temporary");
});

test("token login success removes login_token from URL", () => {
  const nextUrl = removeMagicLinkTokenFromUrl("https://blackarrow-source.offline.invalid/?login_token=secret-token");

  assert.equal(nextUrl, MAGIC_LINK_DASHBOARD_PATH);
  assert.equal(nextUrl.includes("login_token"), false);
  assert.equal(nextUrl.includes("secret-token"), false);
});

test("invalid, used, or expired token produces clear login-link error", () => {
  assert.equal(
    getMagicLinkLoginErrorMessage({ error: "Invalid or expired token" }),
    "Login link is invalid, expired, or has already been used.",
  );
});
