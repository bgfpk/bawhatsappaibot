import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("billing page exposes trial status and account state copy", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "billing", "BillingOverview.tsx"), "utf8");

  assert.match(source, /Trial Period/);
  assert.match(source, /Free trial period active/);
  assert.match(source, /Active Account/);
  assert.match(source, /Restricted Account/);
  assert.match(source, /Past Due/);
});
