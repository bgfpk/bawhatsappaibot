import assert from "node:assert/strict";
import test from "node:test";
import {
  mapCloudApiSendResponse,
  classifyCloudApiHttpError,
} from "./whatsapp-cloud-api-response.ts";

test("CloudApiResponse: maps valid Meta success response to providerMessageId", () => {
  const metaResponse = {
    messaging_product: "whatsapp",
    contacts: [{ input: "195545134641", wa_id: "195545134641" }],
    messages: [{ id: "wamid.HBgLMjA0..." }],
  };

  const result = mapCloudApiSendResponse(metaResponse, 200);
  assert.equal(result.success, true);
  assert.equal(result.providerMessageId, "wamid.HBgLMjA0...");
  assert.equal(result.receiptStatus, "sent");
});

test("CloudApiResponse: treats 200 with missing messages array as failure", () => {
  const malformed1 = { messaging_product: "whatsapp" };
  const r1 = mapCloudApiSendResponse(malformed1, 200);
  assert.equal(r1.success, false);
  assert.equal(r1.errorCode, "missing_provider_message_id");
  assert.equal(r1.providerMessageId, undefined);

  const malformed2 = { messaging_product: "whatsapp", messages: [] };
  const r2 = mapCloudApiSendResponse(malformed2, 200);
  assert.equal(r2.success, false);
  assert.equal(r2.errorCode, "missing_provider_message_id");

  const malformed3 = { messaging_product: "whatsapp", messages: [{}] };
  const r3 = mapCloudApiSendResponse(malformed3, 200);
  assert.equal(r3.success, false);
  assert.equal(r3.errorCode, "missing_provider_message_id");
});

test("CloudApiResponse: classifies 429 rate limits as retryable", () => {
  const error429 = {
    error: {
      message: "(#130429) Rate limit hit",
      type: "OAuthException",
      code: 130429,
    },
  };
  const result = mapCloudApiSendResponse(error429, 429);
  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.errorCode, "rate_limit_exceeded");
});

test("CloudApiResponse: classifies 5xx server errors as retryable", () => {
  const error500 = {
    error: {
      message: "An unknown error occurred",
      type: "OAuthException",
      code: 1,
    },
  };
  const result = mapCloudApiSendResponse(error500, 500);
  assert.equal(result.success, false);
  assert.equal(result.retryable, true);
  assert.equal(result.errorCode, "meta_server_error");
});

test("CloudApiResponse: classifies 401/403/OAuth errors as non-retryable", () => {
  const error401 = {
    error: {
      message: "Session has expired",
      type: "OAuthException",
      code: 190,
    },
  };
  const result = mapCloudApiSendResponse(error401, 401);
  assert.equal(result.success, false);
  assert.equal(result.retryable, false);
  assert.equal(result.errorCode, "meta_auth_error");
});

test("CloudApiResponse: classifies network timeouts as retryable", () => {
  const networkError = new Error("request timed out after 15000ms");
  const result = classifyCloudApiHttpError(networkError);
  assert.equal(result.retryable, true);
  assert.equal(result.errorCode, "network_transient_error");
});
