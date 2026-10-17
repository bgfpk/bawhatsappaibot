import assert from "node:assert/strict";
import test from "node:test";
import {
  getCloudApiGraphVersion,
  buildCloudApiMessagesUrl,
  buildCloudApiGraphUrl,
  CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION,
} from "./whatsapp-cloud-api-version.ts";

test("CloudApiVersion: uses default compatibility fallback v20.0 when environment variable is unset", () => {
  assert.equal(getCloudApiGraphVersion(undefined), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
  assert.equal(getCloudApiGraphVersion(""), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
  assert.equal(getCloudApiGraphVersion("   "), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
});

test("CloudApiVersion: accepts valid vNN.0 format versions", () => {
  assert.equal(getCloudApiGraphVersion("v21.0"), "v21.0");
  assert.equal(getCloudApiGraphVersion("v22.0"), "v22.0");
  assert.equal(getCloudApiGraphVersion("v19.0"), "v19.0");
});

test("CloudApiVersion: falls back to compatibility version on invalid formats", () => {
  assert.equal(getCloudApiGraphVersion("v21"), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
  assert.equal(getCloudApiGraphVersion("21.0"), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
  assert.equal(getCloudApiGraphVersion("latest"), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
  assert.equal(getCloudApiGraphVersion("v21.1"), CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION);
});

test("CloudApiVersion: buildCloudApiMessagesUrl constructs authoritative messages endpoint URL", () => {
  const url = buildCloudApiMessagesUrl("170906520015342", "v21.0");
  assert.equal(url, "https://graph.facebook.com/v21.0/104857692837465/messages");

  const defaultUrl = buildCloudApiMessagesUrl("170906520015342");
  assert.equal(defaultUrl, `https://graph.facebook.com/${CLOUD_API_DEFAULT_COMPATIBILITY_GRAPH_VERSION}/104857692837465/messages`);
});

test("CloudApiVersion: buildCloudApiMessagesUrl rejects empty phoneNumberId", () => {
  assert.throws(() => buildCloudApiMessagesUrl(""), /phoneNumberId must be a non-empty string/);
  assert.throws(() => buildCloudApiMessagesUrl("   "), /phoneNumberId must be a non-empty string/);
});

test("CloudApiVersion: in production, succeeds when valid vNN.0 is provided", () => {
  assert.equal(getCloudApiGraphVersion("v21.0", true), "v21.0");
  assert.equal(getCloudApiGraphVersion("v22.0", true), "v22.0");
});

test("CloudApiVersion: in production, fails closed with graph_version_not_configured when missing or invalid", () => {
  assert.throws(
    () => getCloudApiGraphVersion(undefined, true),
    /graph_version_not_configured/
  );
  assert.throws(
    () => getCloudApiGraphVersion("", true),
    /graph_version_not_configured/
  );
  assert.throws(
    () => getCloudApiGraphVersion("v21", true),
    /graph_version_not_configured/
  );
  assert.throws(
    () => getCloudApiGraphVersion("latest", true),
    /graph_version_not_configured/
  );
});
