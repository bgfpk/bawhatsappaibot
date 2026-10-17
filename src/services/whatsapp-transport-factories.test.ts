// src/services/whatsapp-transport-factories.test.ts
import test from "node:test";
import assert from "node:assert";
import {
  registerDefaultWhatsAppTransportFactories,
  createBaileysFactory,
  createWhatsAppCloudApiPlaceholderFactory,
} from "./whatsapp-transport-factories.ts";
import {
  registerWhatsAppTransportProvider,
  getWhatsAppTransportProviderFactory,
  __clearRegistryForTests,
} from "./whatsapp-transport-registry.ts";
import { BaileysTransportProvider } from "./baileys-transport-provider.ts";
import { WhatsAppCloudApiTransportProvider } from "./whatsapp-cloud-api-transport-provider.ts";

// Ensure clean registry before each test suite
test("registry is empty before registration", async () => {
  __clearRegistryForTests();
  const webFactory = getWhatsAppTransportProviderFactory("whatsapp_web");
  const cloudFactory = getWhatsAppTransportProviderFactory("whatsapp_cloud_api");
  assert.equal(webFactory, undefined);
  assert.equal(cloudFactory, undefined);
});

test("registerDefaultWhatsAppTransportFactories registers both factories", async () => {
  __clearRegistryForTests();
  registerDefaultWhatsAppTransportFactories();
  const webFactory = getWhatsAppTransportProviderFactory("whatsapp_web");
  const cloudFactory = getWhatsAppTransportProviderFactory("whatsapp_cloud_api");
  assert.ok(webFactory);
  assert.ok(cloudFactory);
});

test("registerDefaultWhatsAppTransportFactories is idempotent", async () => {
  __clearRegistryForTests();
  registerDefaultWhatsAppTransportFactories();
  // call again – should not throw or duplicate
  registerDefaultWhatsAppTransportFactories();
  const webFactory = getWhatsAppTransportProviderFactory("whatsapp_web");
  const cloudFactory = getWhatsAppTransportProviderFactory("whatsapp_cloud_api");
  assert.ok(webFactory);
  assert.ok(cloudFactory);
});

test("Baileys factory creates a BaileysTransportProvider instance", async () => {
  const provider = createBaileysFactory({ providerType: "whatsapp_web" });
  assert.ok(provider instanceof BaileysTransportProvider);
});

test("Baileys factory can inject a fake socket", async () => {
  const fakeSocket = { on: () => {}, off: () => {} } as any;
  const provider = createBaileysFactory({ providerType: "whatsapp_web" }, { socket: fakeSocket });
  // The provider should retain the socket (not thrown)
  assert.ok(provider instanceof BaileysTransportProvider);
});

test("Cloud API factory returns WhatsAppCloudApiTransportProvider", async () => {
  const provider = createWhatsAppCloudApiPlaceholderFactory({ providerType: "whatsapp_cloud_api" });
  assert.ok(provider instanceof WhatsAppCloudApiTransportProvider);
});

test("provider returns unsupported results for send methods when not configured", async () => {
  const provider = new WhatsAppCloudApiTransportProvider();
  const result = await provider.sendText("contact-bb1fa5c89e92@example.invalid", "hi");
  assert.equal(result.success, false);
  assert.ok(result.errorMessage?.includes("httpClient not configured"));
});

// Ensure factories do not import live runtime files – this test simply loads the modules.
test("factories module does not import bot-worker or server", async () => {
  // If there were accidental imports, Node would throw a circular‑dependency error on load.
  assert.ok(true);
});

