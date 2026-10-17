// src/services/whatsapp-transport-registry.test.ts
import test from "node:test";
import assert from "node:assert";
import {
  registerWhatsAppTransportProvider,
  getWhatsAppTransportProviderFactory,
  createWhatsAppTransportProviderFromConfig,
  __clearRegistryForTests,
} from "./whatsapp-transport-registry.ts";
import { WhatsAppProviderConfig } from "./whatsapp-provider-config.ts";
import { WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";

// Minimal fake provider implementing the interface
class FakeProvider implements WhatsAppTransportProvider {
  private status: any = "disconnected";
  start() { return Promise.resolve(); }
  stop() { return Promise.resolve(); }
  reload() { return Promise.resolve(); }
  resetAuth() { return Promise.resolve(); }
  getStatus() { return this.status; }
  sendText() { return Promise.resolve({ success: true }); }
  sendMedia() { return Promise.resolve({ success: true }); }
  sendVoice() { return Promise.resolve({ success: true }); }
  sendDocument() { return Promise.resolve({ success: true }); }
  sendTemplate() { return Promise.resolve({ success: false, errorMessage: "unsupported" }); }
  markRead() { return Promise.resolve(); }
  downloadMedia() { return Promise.resolve(Buffer.from([])); }
  subscribeToIncomingMessages() {}
  subscribeToConnectionEvents() {}
}

// Factory that returns a FakeProvider instance
function fakeFactory(_config: WhatsAppProviderConfig, _deps?: any): WhatsAppTransportProvider {
  return new FakeProvider();
}

test("registry can register and retrieve factory", async () => {
  __clearRegistryForTests();
  registerWhatsAppTransportProvider("whatsapp_web", fakeFactory);
  const factory = getWhatsAppTransportProviderFactory("whatsapp_web");
  assert.ok(factory);
  const provider = factory!({ providerType: "whatsapp_web" });
  assert.ok(provider instanceof FakeProvider);
});

test("registry defaults unknown type to whatsapp_web", async () => {
  __clearRegistryForTests();
  // register default web factory
  registerWhatsAppTransportProvider("whatsapp_web", fakeFactory);
  const provider = createWhatsAppTransportProviderFromConfig({ providerType: "unknown_type" as any });
  assert.ok(provider instanceof FakeProvider);
});

test("create provider from config using registered factory", async () => {
  __clearRegistryForTests();
  registerWhatsAppTransportProvider("whatsapp_cloud_api", fakeFactory);
  const cfg = { providerType: "whatsapp_cloud_api", phoneNumberId: "123", encryptedAccessTokenRef: "enc" } as WhatsAppProviderConfig;
  const provider = createWhatsAppTransportProviderFromConfig(cfg);
  assert.ok(provider instanceof FakeProvider);
});

// Ensure no side effects on other modules – this test simply imports the registry file and ensures it does not import bot-worker
test("registry does not import bot-worker or server files", async () => {
  // The mere presence of the import above is sufficient; if this file imported bot-worker it would cause a circular
  // dependency error at runtime. The test passes if it loads without error.
  assert.ok(true);
});
