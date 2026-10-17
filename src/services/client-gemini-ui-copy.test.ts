import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Client Gemini settings copy says Cache Boost savings are possible without negative guarantee wording", () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), "src", "app", "ProtectedDashboardApplication.tsx"), "utf8");


  assert.match(appSource, /When successfully used, it can reduce Gemini API cost by up to 50% in some cases/);
  assert.doesNotMatch(appSource, /savings are not guaranteed/);
  assert.match(appSource, /Custom Gemini billing: \$0\.001 per successful customer message or AI cycle/);
  assert.match(appSource, /Extra BlackArrow charge: \+\$0\.001 only when Cache Boost is ON and Google reports cached content tokens/);
  assert.match(appSource, /Charged only when cached tokens are reported/);
});
