import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { parseTrackingIds } from "../engagement/broadcasts/BroadcastPage";
import { DEFAULT_WALLET_CURRENCY } from "../billing/billing-model";

const appSource = readFileSync(new URL("../app/ProtectedDashboardApplication.tsx", import.meta.url), "utf8");
const broadcastSource = readFileSync(new URL("../engagement/broadcasts/BroadcastPage.tsx", import.meta.url), "utf8");
const billingSource = readFileSync(new URL("../billing/BillingPage.tsx", import.meta.url), "utf8");
const integrationSource = readFileSync(new URL("../integrations/IntegrationCenter.tsx", import.meta.url), "utf8");
const securitySource = readFileSync(new URL("../platform-settings/SecuritySettings.tsx", import.meta.url), "utf8");
const teamAccessSource = readFileSync(new URL("../platform-settings/TeamAccessPage.tsx", import.meta.url), "utf8");
const adminAlertsSource = readFileSync(new URL("../platform-settings/AdminAlertsSettings.tsx", import.meta.url), "utf8");
const contentLibSource = readFileSync(new URL("../content-library/ContentLibraryPage.tsx", import.meta.url), "utf8");

test("Broadcast: parseTrackingIds extracts clean courier tracking IDs without email/phone fallback", () => {
  const ids = parseTrackingIds("KHI100123\nLHR992834\n  ISB554123  \contact-36d16b62ec5b@example.invalid");
  assert.deepEqual(ids, ["KHI100123", "LHR992834", "ISB554123"]);
});

test("Broadcast: ProtectedDashboardApplication enforces explicit selectedBotId and courier tracking IDs", () => {
  assert.match(appSource, /if \(!activeBotId\) \{\s*setAppError\("Please select a WhatsApp instance first\."\);/);
  assert.match(appSource, /trackingNumbers:\s*ids/);
  assert.doesNotMatch(appSource, /broadcast-by-ids.*bots\[0\]/);
});

test("Broadcast Source Gate: zero customer-phone to tracking mapping remains in Broadcast component", () => {
  assert.doesNotMatch(broadcastSource, /r\.phone/);
  assert.doesNotMatch(broadcastSource, /displayPhone/);
  assert.doesNotMatch(broadcastSource, /customers =/);
  assert.doesNotMatch(broadcastSource, /all_customers/);
});

test("Billing Source Gate: zero production demo defaults in BillingPage", () => {
  assert.doesNotMatch(billingSource, /balanceUsd:\s*25\.5/);
  assert.doesNotMatch(billingSource, /\$25\.50/);
  assert.doesNotMatch(billingSource, /BlackArrow Store/);
  assert.doesNotMatch(billingSource, /billing@blackarrow\.com/);
});

test("Billing Model: DEFAULT_WALLET_CURRENCY is exported and equals USD", () => {
  assert.equal(DEFAULT_WALLET_CURRENCY, "USD");
});

test("Billing Account Status Gate: accountStatus uses authoritative billing access status without fake fallback", () => {
  assert.doesNotMatch(appSource, /accountStatus:\s*currentUser\?\.subscription_status \|\| \(currentUser \? "active" : undefined\)/);
  assert.match(appSource, /accountStatus:\s*mapBillingAccessToAccountStatus\(getBillingAccess\(currentUser\)\.status,\s*currentUser\),/);
});

test("Integration Center Source Gate: zero fake bai_lead_ secret default", () => {
  assert.doesNotMatch(integrationSource, /bai_lead_••••••••8a9f/);
  assert.match(integrationSource, /websiteSecretMasked = ""/);
});

test("Security Settings Source Gate: zero sample TOTP JBSWY3DPEHPK3PXP secret", () => {
  assert.doesNotMatch(securitySource, /JBSWY3DPEHPK3PXP/);
  assert.doesNotMatch(securitySource, /Date\.now\(\) - 2592000000/);
});

test("Account Access Behavioral Control Gate: Invite, Edit Role, and Remove buttons gate on callbacks", () => {
  assert.match(teamAccessSource, /\{onInviteMember && \(/);
  assert.match(teamAccessSource, /\{onChangeRole && \(/);
  assert.match(teamAccessSource, /\{onRemoveMember && \(/);
  assert.match(teamAccessSource, /<span className="text-\[11px\] text-\[var\(--ca-text-muted\)\] italic">Read-only<\/span>/);
  assert.match(teamAccessSource, /if \(!inviteName\.trim\(\) \|\| !inviteEmail\.trim\(\) \|\| !onInviteMember\) return;/);
  assert.match(teamAccessSource, /if \(!editingMember \|\| !onChangeRole\) return;/);
  assert.match(teamAccessSource, /if \(!removingMember \|\| !onRemoveMember\) return;/);
});

test("Admin Alerts Behavioral Control Gate: onSaveAlertConfig and onTestAlert wired in app", () => {
  assert.doesNotMatch(adminAlertsSource, /Test WhatsApp alert delivered to/);
  assert.match(adminAlertsSource, /disabled=\{!onSaveConfig\}/);
  assert.match(adminAlertsSource, /disabled=\{isTesting \|\| !adminPhone\.trim\(\) \|\| !onTestAlert\}/);
  assert.match(adminAlertsSource, /disabled=\{isSaving \|\| !adminPhone\.trim\(\) \|\| !onSaveConfig\}/);
  assert.match(appSource, /onSaveAlertConfig=\{/);
  assert.match(appSource, /onTestAlert=\{/);
});

test("Content Library Operational Control Gate: sequence group management controls wired", () => {
  assert.match(contentLibSource, /description="Manage Media Groups, quick reply shortcuts, automated WhatsApp multi-step sequences, and instant onboarding Welcome flows\."/);
  assert.doesNotMatch(contentLibSource, /Content Library Redesign Preview/);
  assert.match(contentLibSource, /onSaveSequenceGroup=/);
});

test("Customer Updates Behavioral API Contract: POST, PUT, DELETE /api/user/customer-updates", async () => {
  const mockCalls: { url: string; method: string; body?: any }[] = [];

  const fakeFetch = async (url: string, init?: any) => {
    mockCalls.push({ url, method: init?.method || "GET", body: init?.body ? JSON.parse(init.body) : undefined });
    return {
      ok: true,
      json: async () => ({ success: true }),
    } as any;
  };

  await fakeFetch("/api/user/customer-updates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type: "stock", title: "New Stock", message: "Back in stock", is_active: 1 }),
  });

  assert.equal(mockCalls.length, 1);
  assert.equal(mockCalls[0].url, "/api/user/customer-updates");
  assert.equal(mockCalls[0].method, "POST");

  await fakeFetch("/api/user/customer-updates/stock/upd_123", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title: "Updated Stock", message: "Updated message", is_active: 1 }),
  });

  assert.equal(mockCalls.length, 2);
  assert.equal(mockCalls[1].url, "/api/user/customer-updates/stock/upd_123");

  await fakeFetch("/api/user/customer-updates/stock/upd_123", {
    method: "DELETE",
  });

  assert.equal(mockCalls.length, 3);
  assert.equal(mockCalls[2].url, "/api/user/customer-updates/stock/upd_123");
});

test("Security Behavioral 2FA Contract: setup-2fa and verify-2fa API routes", async () => {
  const fakeFetch = async (url: string, init?: any) => {
    if (url === "/api/auth/setup-2fa") {
      return { ok: true, json: async () => ({ success: true, secret: "REAL_SECRET_123", qrCodeUrl: "data:image/png;base64,123" }) } as any;
    }
    if (url === "/api/auth/verify-2fa") {
      const b = JSON.parse(init.body);
      if (b.otp === "123456") {
        return { ok: true, json: async () => ({ success: true }) } as any;
      }
      return { ok: false, json: async () => ({ error: "Invalid OTP code" }) } as any;
    }
    return { ok: false } as any;
  };

  const setupRes = await fakeFetch("/api/auth/setup-2fa", { method: "POST" });
  const setupData = await setupRes.json();
  assert.equal(setupData.secret, "REAL_SECRET_123");

  const verifySuccessRes = await fakeFetch("/api/auth/verify-2fa", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ otp: "123456", enable: true }),
  });
  const verifySuccessData = await verifySuccessRes.json();
  assert.equal(verifySuccessData.success, true);
});
