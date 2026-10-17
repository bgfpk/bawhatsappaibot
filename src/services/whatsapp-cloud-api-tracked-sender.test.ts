// src/services/whatsapp-cloud-api-tracked-sender.test.ts
//
// Unit tests for the Cloud API tracked sender helper (Phase 4P).
// Uses Node native test runner — no Jest globals.

import test from "node:test";
import assert from "node:assert/strict";
import { createCloudApiTrackedSender } from "./whatsapp-cloud-api-tracked-sender.ts";
import type { WhatsAppTransportProvider, OutgoingSendResult } from "./whatsapp-transport-types.ts";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

/** Minimal mock Cloud API transport provider. */
function makeMockProvider(overrides: Partial<WhatsAppTransportProvider> = {}): WhatsAppTransportProvider {
  return {
    start: async () => {},
    stop: async () => {},
    reload: async () => {},
    resetAuth: async () => {},
    getStatus: () => "disabled",
    sendText: async (_jid: string, _text: string): Promise<OutgoingSendResult> => ({
      success: true,
      providerMessageId: "cloud_msg_abc123",
    }),
    sendMedia: async () => ({ success: false, errorMessage: "not_configured" }),
    sendVoice: async () => ({ success: false, errorMessage: "not_configured" }),
    sendDocument: async () => ({ success: false, errorMessage: "not_configured" }),
    sendTemplate: async () => ({ success: false, errorMessage: "not_configured" }),
    markRead: async () => {},
    downloadMedia: async () => { throw new Error("unsupported"); },
    subscribeToIncomingMessages: () => {},
    subscribeToConnectionEvents: () => {},
    ...overrides,
  };
}

/** Minimal sent-id tracker. */
function makeSentIds(): { ids: Set<string>; add: (id: string) => void } {
  const ids = new Set<string>();
  return { ids, add: (id: string) => ids.add(id) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("creates sender with user.id equal to botIdentityJid", () => {
  const sender = createCloudApiTrackedSender({
    cloudProvider: makeMockProvider(),
    sentIds: makeSentIds(),
    botIdentityJid: "contact-6f1baadef6ff@example.invalid",
  });
  assert.equal(sender.user.id, "contact-6f1baadef6ff@example.invalid");
});

test("falls back to safe placeholder identity when botIdentityJid is omitted", () => {
  const sender = createCloudApiTrackedSender({
    cloudProvider: makeMockProvider(),
    sentIds: makeSentIds(),
  });
  assert.equal(typeof sender.user.id, "string");
  assert.ok(sender.user.id.length > 0, "user.id must be non-empty");
  // Should be the documented fallback, never a raw secret
  assert.equal(sender.user.id, "contact-26e46082e92c@example.invalid");
});

test("falls back to safe placeholder identity when botIdentityJid is empty string", () => {
  const sender = createCloudApiTrackedSender({
    cloudProvider: makeMockProvider(),
    sentIds: makeSentIds(),
    botIdentityJid: "   ",
  });
  assert.equal(sender.user.id, "contact-26e46082e92c@example.invalid");
});

test("sendMessage sends text through injected Cloud provider", async () => {
  let calledWithJid = "";
  let calledWithText = "";

  const provider = makeMockProvider({
    sendText: async (jid, text) => {
      calledWithJid = jid;
      calledWithText = text;
      return { success: true, providerMessageId: "msg_001" };
    },
  });

  const tracker = makeSentIds();
  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  await sender.sendMessage("contact-381574e9c8e5@example.invalid", { text: "Hello Cloud" });

  assert.equal(calledWithJid, "contact-381574e9c8e5@example.invalid");
  assert.equal(calledWithText, "Hello Cloud");
});

test("sendMessage returns Baileys-compatible { key: { id } } shape", async () => {
  const sender = createCloudApiTrackedSender({
    cloudProvider: makeMockProvider(),
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  const result = await sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "Hi" });

  assert.ok(result && typeof result === "object", "result must be an object");
  assert.ok("key" in result, "result must have key property");
  assert.equal(typeof result.key.id, "string");
  assert.equal(result.key.id, "cloud_msg_abc123");
});

test("records providerMessageId in sentIds after successful send", async () => {
  const provider = makeMockProvider({
    sendText: async () => ({ success: true, providerMessageId: "tracked_id_xyz" }),
  });

  const tracker = makeSentIds();
  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  await sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "Test tracking" });

  assert.ok(tracker.ids.has("tracked_id_xyz"), "sentIds should contain the providerMessageId");
});

test("does not add empty providerMessageId to sentIds", async () => {
  const provider = makeMockProvider({
    sendText: async () => ({ success: true, providerMessageId: "" }),
  });

  const tracker = makeSentIds();
  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  const result = await sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "No id" });

  assert.equal(tracker.ids.size, 0, "sentIds must not be polluted with empty string");
  assert.equal(result.key.id, "");
});

test("provider failure throws safe error message", async () => {
  const provider = makeMockProvider({
    sendText: async () => ({ success: false, errorMessage: "network_timeout" }),
  });

  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  await assert.rejects(
    () => sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "Will fail" }),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.ok(
        err.message.includes("network_timeout"),
        `Expected error to include provider message but got: ${err.message}`,
      );
      return true;
    },
  );
});

test("provider failure with no errorMessage throws generic safe error", async () => {
  const provider = makeMockProvider({
    sendText: async () => ({ success: false }),
  });

  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  await assert.rejects(
    () => sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "Will fail" }),
    (err: any) => {
      assert.ok(err instanceof Error);
      assert.ok(err.message.length > 0, "Error must have a message");
      return true;
    },
  );
});

test("missing text payload throws safe error and does not call provider", async () => {
  let providerCalled = false;
  const provider = makeMockProvider({
    sendText: async () => {
      providerCalled = true;
      return { success: true, providerMessageId: "should_not_reach" };
    },
  });

  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  await assert.rejects(
    () => sender.sendMessage("contact-d26ce7788f39@example.invalid", {}),
    (err: any) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );
  assert.equal(providerCalled, false, "Provider must not be called for empty payload");
});

test("empty string text payload throws safe error and does not call provider", async () => {
  let providerCalled = false;
  const provider = makeMockProvider({
    sendText: async () => {
      providerCalled = true;
      return { success: true, providerMessageId: "should_not_reach" };
    },
  });

  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  await assert.rejects(
    () => sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "   " }),
    (err: any) => {
      assert.ok(err instanceof Error);
      return true;
    },
  );
  assert.equal(providerCalled, false, "Provider must not be called for whitespace-only text");
});

test("image payload delegates to cloudProvider.sendMedia and tracks id", async () => {
  let calledJid = "";
  let calledMime = "";
  const provider = makeMockProvider({
    sendMedia: async (jid, _buf, mime, _caption) => {
      calledJid = jid;
      calledMime = mime;
      return { success: true, providerMessageId: "wamid_img_123" };
    },
  });

  const tracker = makeSentIds();
  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  const res = await sender.sendMessage("contact-2658838c5e39@example.invalid", {
    image: Buffer.from("image_data"),
    caption: "My Photo",
  });

  assert.equal(res.key.id, "wamid_img_123");
  assert.equal(calledJid, "contact-2658838c5e39@example.invalid");
  assert.equal(calledMime, "image/jpeg");
  assert.ok(tracker.ids.has("wamid_img_123"));
});

test("voice payload (ptt: true) delegates to cloudProvider.sendVoice and tracks id", async () => {
  let calledJid = "";
  const provider = makeMockProvider({
    sendVoice: async (jid, _buf) => {
      calledJid = jid;
      return { success: true, providerMessageId: "wamid_voice_123" };
    },
  });

  const tracker = makeSentIds();
  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  const res = await sender.sendMessage("contact-2658838c5e39@example.invalid", {
    audio: Buffer.from("voice_data"),
    ptt: true,
  });

  assert.equal(res.key.id, "wamid_voice_123");
  assert.equal(calledJid, "contact-2658838c5e39@example.invalid");
  assert.ok(tracker.ids.has("wamid_voice_123"));
  assert.equal(sender.supportsVoiceSend, true);
});

test("document payload delegates to cloudProvider.sendDocument and tracks id", async () => {
  let calledJid = "";
  let calledFileName = "";
  const provider = makeMockProvider({
    sendDocument: async (jid, _buf, _mime, fileName) => {
      calledJid = jid;
      calledFileName = fileName || "";
      return { success: true, providerMessageId: "wamid_doc_123" };
    },
  });

  const tracker = makeSentIds();
  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  const res = await sender.sendMessage("contact-2658838c5e39@example.invalid", {
    document: Buffer.from("pdf_data"),
    mimetype: "application/pdf",
    fileName: "invoice.pdf",
  });

  assert.equal(res.key.id, "wamid_doc_123");
  assert.equal(calledJid, "contact-2658838c5e39@example.invalid");
  assert.equal(calledFileName, "invoice.pdf");
  assert.ok(tracker.ids.has("wamid_doc_123"));
});

test("template payload delegates to cloudProvider.sendTemplate and tracks id in Prompt 4", async () => {
  let calledJid = "";
  let calledTemplateName = "";
  let calledLanguage = "";
  let calledParams: any = null;

  const tracker = makeSentIds();
  const provider = makeMockProvider({
    sendTemplate: async (jid, templateId, languageCode, params) => {
      calledJid = jid;
      calledTemplateName = templateId;
      calledLanguage = languageCode;
      calledParams = params;
      return { success: true, providerMessageId: "wamid_tpl_999" };
    },
  });

  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: tracker,
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  const result = await sender.sendMessage("contact-d26ce7788f39@example.invalid", {
    template: {
      name: "followup_check",
      language: { code: "en_US" },
      components: [{ type: "body", parameters: [{ type: "text", text: "Ali" }] }],
    },
  } as any);

  assert.equal(result.key.id, "wamid_tpl_999");
  assert.equal(calledJid, "contact-d26ce7788f39@example.invalid");
  assert.equal(calledTemplateName, "followup_check");
  assert.equal(calledLanguage, "en_US");
  assert.deepEqual(calledParams, [{ type: "body", parameters: [{ type: "text", text: "Ali" }] }]);
  assert.ok(tracker.ids.has("wamid_tpl_999"));
});

test("sendPresenceUpdate is a no-op and does not throw", async () => {
  const sender = createCloudApiTrackedSender({
    cloudProvider: makeMockProvider(),
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
  });

  // Must resolve without error
  await assert.doesNotReject(() => sender.sendPresenceUpdate("contact-d26ce7788f39@example.invalid", "composing"));
  await assert.doesNotReject(() => sender.sendPresenceUpdate("contact-d26ce7788f39@example.invalid", "paused"));
});

test("options type does not accept secret fields (structural check)", () => {
  // This is a TypeScript-level guarantee but we verify at runtime that the
  // module does not look for or expose any secret-named property.
  const implementation = createCloudApiTrackedSender.toString();

  const forbiddenPatterns = [
    "accessToken",
    "access_token",
    "encryptedAccessTokenRef",
    "appSecret",
    "app_secret",
    "webhookVerifyToken",
    "webhook_verify_token",
    "rawToken",
    "clientSecret",
    "client_secret",
  ];

  for (const pattern of forbiddenPatterns) {
    assert.ok(
      !implementation.includes(pattern),
      `Implementation must not reference secret field: ${pattern}`,
    );
  }
});

test("module does not import bot-worker or server", async () => {
  // Read the implementation source file (not this test file) and verify
  // it has no forbidden imports.
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");

  // import.meta.url is the test file; we want the implementation sibling.
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const implFile = join(thisDir, "whatsapp-cloud-api-tracked-sender.ts");

  // Guard: make sure we're not reading the test file itself
  assert.ok(
    !implFile.endsWith(".test.ts"),
    "Must resolve to the implementation file, not the test file",
  );

  const source = readFileSync(implFile, "utf-8");

  // Only check actual import statements — comments mentioning bot-worker for
  // documentation purposes are allowed.
  const importLines = source
    .split("\n")
    .filter((line) => /^\s*import\s/.test(line));

  for (const line of importLines) {
    assert.ok(
      !line.includes("bot-worker"),
      `Implementation must not import bot-worker (found in import line: ${line.trim()})`,
    );
    assert.ok(
      !line.includes("server.ts"),
      `Implementation must not import server.ts (found in import line: ${line.trim()})`,
    );
  }
});

test("logger is called during successful send", async () => {
  const logMessages: string[] = [];
  const mockLogger = {
    info: (msg: string) => logMessages.push(`INFO: ${msg}`),
    warn: (msg: string) => logMessages.push(`WARN: ${msg}`),
    error: (msg: string) => logMessages.push(`ERROR: ${msg}`),
  };

  const sender = createCloudApiTrackedSender({
    cloudProvider: makeMockProvider(),
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
    logger: mockLogger,
  });

  await sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "test with logger" });

  assert.ok(logMessages.length > 0, "Logger should be called during send");
  // Verify no log contains secret-like words
  for (const msg of logMessages) {
    assert.ok(!msg.toLowerCase().includes("token"), `Log must not contain 'token': ${msg}`);
    assert.ok(!msg.toLowerCase().includes("secret"), `Log must not contain 'secret': ${msg}`);
  }
});

test("logger is called on failure without exposing secrets", async () => {
  const logMessages: string[] = [];
  const mockLogger = {
    info: (msg: string) => logMessages.push(`INFO: ${msg}`),
    warn: (msg: string) => logMessages.push(`WARN: ${msg}`),
    error: (msg: string) => logMessages.push(`ERROR: ${msg}`),
  };

  const provider = makeMockProvider({
    sendText: async () => ({ success: false, errorMessage: "timed_out" }),
  });

  const sender = createCloudApiTrackedSender({
    cloudProvider: provider,
    sentIds: makeSentIds(),
    botIdentityJid: "contact-37a60dee2b66@example.invalid",
    logger: mockLogger,
  });

  await assert.rejects(() => sender.sendMessage("contact-d26ce7788f39@example.invalid", { text: "fail me" }));

  const errorLogs = logMessages.filter((m) => m.startsWith("ERROR"));
  assert.ok(errorLogs.length > 0, "Should have logged an error");
  for (const msg of errorLogs) {
    assert.ok(!msg.toLowerCase().includes("token"), `Error log must not contain 'token': ${msg}`);
    assert.ok(!msg.toLowerCase().includes("secret"), `Error log must not contain 'secret': ${msg}`);
  }
});
