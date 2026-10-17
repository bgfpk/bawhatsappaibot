import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { __publicApiKeyTestUtils, createRawApiKey } from "./public-api-key-service.ts";
import { buildBlackArrowProductFromPreview, buildExternalObjectLinkFromPreview, normalizeWooStoreUrl } from "./woocommerce-integration-service.ts";
import { signWebhookPayload, validateWebhookUrl } from "./webhook-foundation-service.ts";
import { validateExternalServiceUrl } from "./outbound-url-safety-service.ts";

describe("integration foundation helpers", () => {
  it("validates WooCommerce and webhook URLs safely", () => {
    assert.equal(normalizeWooStoreUrl("https://shop.example.com/"), "https://shop.example.com");
    assert.throws(() => normalizeWooStoreUrl("http://shop.example.com"), /HTTPS/);
    assert.throws(() => validateWebhookUrl("http://hooks.example.com"), /HTTPS/);
    assert.throws(() => validateWebhookUrl("http://localhost:3000/hook"), /HTTPS|localhost|private|internal/i);
    assert.throws(() => normalizeWooStoreUrl("https://127.0.0.1/shop"), /localhost|private|internal/i);
    assert.throws(() => validateExternalServiceUrl("https://169.254.169.254/latest", { label: "Webhook", requireHttps: true }), /private|internal/i);
    assert.throws(() => validateExternalServiceUrl("https://printer.local/hook", { label: "Webhook", requireHttps: true }), /private|internal/i);
  });

  it("rate limits public API buckets without storing raw keys", () => {
    __publicApiKeyTestUtils.publicApiRateLimitBuckets.clear();
    const first = __publicApiKeyTestUtils.applyPublicApiRateLimitBucket("public-api:test:key_1", 2, 60000);
    const second = __publicApiKeyTestUtils.applyPublicApiRateLimitBucket("public-api:test:key_1", 2, 60000);
    const third = __publicApiKeyTestUtils.applyPublicApiRateLimitBucket("public-api:test:key_1", 2, 60000);

    assert.equal(first.limited, false);
    assert.equal(second.limited, false);
    assert.equal(third.limited, true);
    assert.equal([...__publicApiKeyTestUtils.publicApiRateLimitBuckets.keys()].some((key) => key.includes("bai_live_")), false);
  });

  it("creates and masks public API keys without exposing raw key hashes", () => {
    const key = createRawApiKey();
    const hash = __publicApiKeyTestUtils.hashKey(key);
    const masked = __publicApiKeyTestUtils.maskApiKey(key);

    assert.match(key, /^bai_live_/);
    assert.equal(hash.length, 64);
    assert.notEqual(hash, key);
    assert.ok(masked.startsWith("bai_live_"));
    assert.ok(masked.includes("..."));
    assert.deepEqual(__publicApiKeyTestUtils.normalizeScopes(["read:account", "bad", "read:account"]), ["read:account"]);
    assert.deepEqual(__publicApiKeyTestUtils.normalizeScopes(["write:knowledge", "write:leads"]), ["write:knowledge", "write:leads"]);
  });

  it("signs webhook payloads with stable HMAC signatures", () => {
    const first = signWebhookPayload("whsec_test", "{\"ok\":true}", 1710000000);
    const second = signWebhookPayload("whsec_test", "{\"ok\":true}", 1710000000);
    const changed = signWebhookPayload("whsec_other", "{\"ok\":true}", 1710000000);

    assert.equal(first, second);
    assert.notEqual(first, changed);
    assert.equal(first.length, 64);
  });

  it("preserves manual product fields unless overwrite is explicit", () => {
    const existing = {
      id: "prod_1",
      name: "Local title",
      description: "Local description",
      base_price: 29,
      sku: "LOCAL-SKU",
      stock: 5,
      metadata: { manualNote: "keep" },
    };
    const preview = {
      wooProductId: "99",
      name: "Woo title",
      description: "Woo description",
      price: 10,
      salePrice: 8,
      sku: "WOO-SKU",
      stockQuantity: 44,
      categories: ["A"],
      tags: ["B"],
      images: ["https://cdn.example.com/item.jpg"],
      type: "physical",
      variations: [],
    };

    const preserved = buildBlackArrowProductFromPreview(preview, existing, false);
    const overwritten = buildBlackArrowProductFromPreview(preview, existing, true);

    assert.equal(preserved.name, "Local title");
    assert.equal(preserved.base_price, 29);
    assert.equal(preserved.metadata.externalProductId, "99");
    assert.equal(preserved.metadata.manualNote, "keep");
    assert.equal(overwritten.name, "Woo title");
    assert.equal(overwritten.base_price, 8);
  });

  it("creates external object links for WooCommerce products", () => {
    const link = buildExternalObjectLinkFromPreview({ wooProductId: "123", sku: "SKU-123" }, "prod_123", "user_1", null, false);

    assert.equal(link.provider, "woocommerce");
    assert.equal(link.objectType, "product");
    assert.equal(link.externalId, "123");
    assert.equal(link.blackarrowId, "prod_123");
    assert.equal(link.accountId, "user_1");
    assert.equal(link.syncMode, "manual_no_overwrite");
  });
});
