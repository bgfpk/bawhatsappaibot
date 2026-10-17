import test from "node:test";
import assert from "node:assert/strict";

import { buildAdminMagicLoginLink } from "./admin-magic-link-url.ts";

test("generated admin magic link targets the dashboard app", () => {
  const link = buildAdminMagicLoginLink("https://blackarrow-source.offline.invalid", "token123");

  assert.equal(link, "https://blackarrow-source.offline.invalid/global_dashboard?login_token=token123");
});

test("generated admin magic link never targets root login token URL", () => {
  const link = buildAdminMagicLoginLink("https://blackarrow-source.offline.invalid/", "token123");

  assert.equal(link.includes("blackarrow-source.offline.invalid/?login_token="), false);
  assert.equal(new URL(link).pathname, "/global_dashboard");
});

test("generated admin magic link URL-encodes token safely", () => {
  const link = buildAdminMagicLoginLink("https://blackarrow-source.offline.invalid", "token with+/chars=");

  assert.equal(link, "https://blackarrow-source.offline.invalid/global_dashboard?login_token=token+with%2B%2Fchars%3D");
  assert.equal(new URL(link).searchParams.get("login_token"), "token with+/chars=");
});
