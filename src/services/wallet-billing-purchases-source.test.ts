import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const appSource = fs.readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");


const serverSource = fs.readFileSync(new URL("../../server.ts", import.meta.url), "utf8");
const serviceSource = fs.readFileSync(new URL("./wallet-billing-purchase-service.ts", import.meta.url), "utf8");

test("wallet billing toggle is super-admin controlled and defaults through per-account config", () => {
  assert.match(appSource, /wallet_billing_purchases_enabled/);
  assert.match(appSource, /toggleWalletBillingPurchases/);
  assert.match(appSource, /Wallet billing:/);
  assert.match(appSource, /Allow this account to pay for plans, renewals, add-ons, and setup from wallet balance\./);
  assert.match(serverSource, /\/api\/billing\/wallet-purchase-toggle/);
  assert.match(serverSource, /requireTargetUserForAdmin\(req, res, \{ superAdminOnly: true, field: "targetUserId" \}\)/);
  assert.match(serverSource, /Super admin access required/);
  assert.match(serverSource, /wallet_billing_purchases_enabled: Boolean\(configs\?\.wallet_billing_purchases_enabled\)/);
  assert.match(serviceSource, /getUserExtraConfigValue\(userId, WALLET_BILLING_PURCHASES_ENABLED_KEY\)\.catch\(\(\) => false\)/);
  assert.match(appSource, /body: JSON\.stringify\(\{ targetUserId, enabled \}\)/);
  assert.match(appSource, /setAdminUsers\(\(prev: any\[\]\) => Array\.isArray\(prev\)/);
  assert.doesNotMatch(appSource, /Super-admin wallet billing toggle/);
});

test("wallet purchase route requires idempotency key, rejects wallet top-up, and ignores client amount", () => {
  assert.match(serverSource, /normalizeWalletPurchaseIdempotencyKey\(req\.body\?\.idempotencyKey \|\| req\.body\?\.clientPurchaseKey\)/);
  assert.match(serverSource, /Wallet purchase idempotency key is required\./);
  assert.match(serverSource, /Wallet top-up remains available through Creem checkout only\./);
  assert.match(serverSource, /Wallet purchase amount is calculated securely on the server\./);
  assert.match(serverSource, /planId is required for wallet plan purchase\./);
  assert.match(serverSource, /addonType is required for wallet add-on purchase\./);
});

test("wallet billing uses purchase markers, refunds all entitlement failures, and stays on the logged-in account", () => {
  assert.match(serviceSource, /startWalletPurchaseMarker/);
  assert.match(serviceSource, /updateWalletPurchaseMarker/);
  assert.match(serviceSource, /WALLET_SUBSCRIPTION_REFUND_TYPE/);
  assert.match(serviceSource, /This wallet purchase is already in progress/);
  assert.match(serviceSource, /This wallet purchase already failed and was refunded/);
  assert.match(serviceSource, /This wallet purchase already failed before debit/);
  assert.match(serviceSource, /const userId = String\(user\?\.\$id \|\| user\?\.id \|\| ""\)/);
  assert.match(serviceSource, /Wallet add-on purchase: /);
  assert.match(serviceSource, /Wallet full account setup purchase/);
});

test("Wallet purchases and Creem checkout are wired in ProtectedDashboardApplication", () => {
  assert.match(appSource, /changePlanWithWallet/);
  assert.match(appSource, /purchaseWithWallet/);
  assert.match(appSource, /startCreemCheckout/);
});

test("wallet top-up still uses Creem only in the user dashboard", () => {
  assert.match(appSource, /startCreemCheckout\(\{ type: "wallet_topup"/);
  assert.doesNotMatch(appSource, /buyTopupWithWallet/);
});
