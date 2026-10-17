import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("billing category chart series are off by default and toggled on explicitly", () => {
  const appSource = fs.readFileSync(path.join(process.cwd(), "src", "app", "ProtectedDashboardApplication.tsx"), "utf8");

  assert.match(appSource, /const \[visibleBillingCategoryKeys, setVisibleBillingCategoryKeys\] = useState<Record<string, boolean>>\(\{\}\)/);
  assert.match(appSource, /const isBillingCategoryVisible = \(key: string\) => visibleBillingCategoryKeys\[key\] === true/);
  assert.match(appSource, /<Line[^>]+dataKey="cost"[^>]+name="All charged usage"/);
  assert.match(appSource, /toggleBillingCategory\(item\.key\)/);
});
