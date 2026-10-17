import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

test("Creem successful plan, addon, and setup confirmations store real accounting amounts", () => {
  const source = fs.readFileSync(path.join(process.cwd(), "src", "services", "creem-billing-service.ts"), "utf8");

  assert.match(source, /getPlanPaymentAmount\(planId, billingCycle\)/);
  assert.match(source, /addWalletTransaction\(user\.\$id, amount, "subscription"/);
  assert.match(source, /const amount = getAddonPaymentAmount\(addonType, quantity\)/);
  assert.match(source, /addWalletTransaction\(user\.\$id, amount, "addon"/);
  assert.match(source, /const amount = FULL_SETUP_PRICE/);
  assert.match(source, /addWalletTransaction\(user\.\$id, amount, "setup_purchase"/);
  assert.doesNotMatch(source, /addWalletTransaction\(user\.\$id, 0, "subscription"/);
  assert.doesNotMatch(source, /addWalletTransaction\(user\.\$id, 0, "addon"/);
  assert.doesNotMatch(source, /addWalletTransaction\(user\.\$id, 0, "setup_purchase"/);
});
