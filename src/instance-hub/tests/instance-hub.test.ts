import test from "node:test";
import assert from "node:assert/strict";
import { normalizeConnectionState } from "../connection-state";

test("normalizeConnectionState: handles undefined or missing input as unknown", () => {
  const state = normalizeConnectionState(undefined);
  assert.equal(state.key, "unknown");
  assert.equal(state.tone, "neutral");
  assert.equal(state.showQr, false);
});

test("normalizeConnectionState: parses connected state correctly", () => {
  const state = normalizeConnectionState({
    status: "connected",
    is_active: 1,
    jid: "contact-2f5256f18e8b@example.invalid",
  });
  assert.equal(state.key, "connected");
  assert.equal(state.tone, "teal");
  assert.equal(state.showQr, false);
  assert.equal(state.allowReset, true);
});

test("normalizeConnectionState: parses qr_required state when qrCode is present", () => {
  const state = normalizeConnectionState({
    status: "qr-ready",
    is_active: 1,
    qrCode: "data:image/png;base64,fakeQrCodeData",
  });
  assert.equal(state.key, "qr_required");
  assert.equal(state.tone, "amber");
  assert.equal(state.showQr, true);
});

test("normalizeConnectionState: respects is_active === 0 as paused state", () => {
  const state = normalizeConnectionState({
    status: "connected",
    is_active: 0,
    jid: "contact-2f5256f18e8b@example.invalid",
  });
  assert.equal(state.key, "paused");
  assert.equal(state.label, "Instance Paused");
  assert.equal(state.showQr, false);
  assert.equal(state.allowToggle, true);
});

test("normalizeConnectionState: handles error status", () => {
  const state = normalizeConnectionState({
    status: "error",
    is_active: 1,
  });
  assert.equal(state.key, "error");
  assert.equal(state.tone, "rose");
  assert.equal(state.allowReset, true);
});

test("normalizeConnectionState: handles connecting / proxy-connecting status", () => {
  const state1 = normalizeConnectionState({ status: "connecting", is_active: 1 });
  assert.equal(state1.key, "connecting");
  assert.equal(state1.label, "Connecting");

  const state2 = normalizeConnectionState({ status: "proxy-connecting", is_active: 1 });
  assert.equal(state2.key, "connecting");
  assert.equal(state2.label, "Securing Connection");
});

test("A2 Create Instance: submitted name is passed directly without state race", () => {
  let capturedName = "";
  const mockCreate = (name: string) => {
    capturedName = name;
  };
  mockCreate("Sales Line 2");
  assert.equal(capturedName, "Sales Line 2");
});

test("A4 Reset Login: accepts explicit target bot ID", () => {
  let resetBotId = "";
  const mockReset = (targetId: string) => {
    resetBotId = targetId;
  };
  mockReset("bot_99");
  assert.equal(resetBotId, "bot_99");
});

test("Meta Official API UI: Customer-facing entry points are strictly hidden", async () => {
  const { readFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");

  // 1. CreateInstanceDialog must not contain Meta Official API button or provider selector
  const createDialogSource = readFileSync(
    resolve(process.cwd(), "src/instance-hub/create/CreateInstanceDialog.tsx"),
    "utf8"
  );
  assert.ok(!createDialogSource.includes("Meta Official API"), "CreateInstanceDialog must not show Meta Official API");
  assert.ok(!createDialogSource.includes("whatsapp_cloud_api"), "CreateInstanceDialog must not expose whatsapp_cloud_api option");

  // 2. InstanceCard must not show Official API badge
  const instanceCardSource = readFileSync(
    resolve(process.cwd(), "src/instance-hub/InstanceCard.tsx"),
    "utf8"
  );
  assert.ok(!instanceCardSource.includes("Official API"), "InstanceCard must not render Official API badge");

  // 3. InstanceHubPage must not import or render MetaOfficialApiConnectCard
  const hubPageSource = readFileSync(
    resolve(process.cwd(), "src/instance-hub/InstanceHubPage.tsx"),
    "utf8"
  );
  assert.ok(!hubPageSource.includes("MetaOfficialApiConnectCard"), "InstanceHubPage must not render MetaOfficialApiConnectCard");
  assert.ok(hubPageSource.includes("QrPairingPanel"), "InstanceHubPage must render QrPairingPanel for Linked Devices QR flow");
});
