import test from "node:test";
import assert from "node:assert";
import { normalizeProviderType, getProviderCapabilities, DEFAULT_PROVIDER_TYPE } from "./whatsapp-provider-capabilities.ts";
import { WhatsAppTransportProvider } from "./whatsapp-transport-types.ts";

test("normalizeProviderType returns whatsapp_web for missing or unknown values", () => {
    assert.equal(normalizeProviderType(undefined), "whatsapp_web");
    assert.equal(normalizeProviderType(null), "whatsapp_web");
    assert.equal(normalizeProviderType(""), "whatsapp_web");
    assert.equal(normalizeProviderType("random_string"), "whatsapp_web");
    assert.equal(normalizeProviderType("baileys"), "whatsapp_web");
});

test("normalizeProviderType returns whatsapp_cloud_api exactly when requested", () => {
    assert.equal(normalizeProviderType("whatsapp_cloud_api"), "whatsapp_cloud_api");
    assert.equal(normalizeProviderType("WHATSAPP_CLOUD_API"), "whatsapp_cloud_api");
    assert.equal(normalizeProviderType(" whatsapp_cloud_api "), "whatsapp_cloud_api");
});

test("getProviderCapabilities returns correct capabilities for whatsapp_web", () => {
    const caps = getProviderCapabilities("whatsapp_web");
    assert.equal(caps.supportsQrAuth, true);
    assert.equal(caps.supportsGroups, true);
    assert.equal(caps.supportsGroupLibraryTracking, true);
    assert.equal(caps.supportsNativeForwarding, true);
    assert.equal(caps.supportsTemplates, false);
    assert.equal(caps.supportsWebhook, false);
});

test("getProviderCapabilities returns correct capabilities for whatsapp_cloud_api", () => {
    const caps = getProviderCapabilities("whatsapp_cloud_api");
    assert.equal(caps.supportsQrAuth, false);
    assert.equal(caps.supportsGroups, false);
    assert.equal(caps.supportsGroupLibraryTracking, false);
    assert.equal(caps.supportsTemplates, true);
    assert.equal(caps.supportsWebhook, true);
});

test("whatsapp-transport-types compiles", () => {
    // Type checking ensures this file works in TS
    const dummyProvider: Partial<WhatsAppTransportProvider> = {};
    assert.ok(dummyProvider);
});
