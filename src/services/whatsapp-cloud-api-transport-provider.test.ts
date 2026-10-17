// src/services/whatsapp-cloud-api-transport-provider.test.ts
import test from "node:test";
import assert from "node:assert/strict";
import { WhatsAppCloudApiTransportProvider } from "./whatsapp-cloud-api-transport-provider.ts";
import { resetPhoneRateStates } from "./whatsapp-cloud-api-rate-controller.ts";

test.beforeEach(() => {
  resetPhoneRateStates();
});

class MockHttpClient {
  calls: Array<{ url: string; body: any; options?: any }> = [];
  response: any = {
    messaging_product: "whatsapp",
    contacts: [{ input: "1277547175", wa_id: "1277547175" }],
    messages: [{ id: "wamid.test_123" }],
  };

  async post(url: string, body: any, options?: any): Promise<any> {
    this.calls.push({ url, body, options });
    return this.response;
  }
}

test("provider starts connected when configured with httpClient and phoneNumberId", async () => {
  const mockClient = new MockHttpClient();
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient: mockClient,
    phoneNumberId: "12345",
  });
  await provider.start();
  assert.equal(provider.getStatus(), "connected");
});

test("provider starts disabled when missing credentials", async () => {
  const provider = new WhatsAppCloudApiTransportProvider();
  assert.equal(provider.getStatus(), "disabled");
  await provider.start();
  assert.equal(provider.getStatus(), "disabled");
});

test("without injected httpClient, send methods return controlled not-configured result", async () => {
  const provider = new WhatsAppCloudApiTransportProvider({
    phoneNumberId: "12345",
  });
  
  const textRes = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(textRes.success, false);
  assert.match(textRes.errorMessage || "", /httpClient not configured/);
});

test("sendText normalizes recipient, builds Meta text payload and extracts real wamid", async () => {
  const mockClient = new MockHttpClient();
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient: mockClient,
    phoneNumberId: "phone_id_999",
  });

  const res = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello from test");
  assert.equal(res.success, true);
  assert.equal(res.providerMessageId, "wamid.test_123");

  assert.equal(mockClient.calls.length, 1);
  const call = mockClient.calls[0];
  assert.equal(call.url, "https://graph.facebook.com/v20.0/phone_id_999/messages");
  assert.deepEqual(call.body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "text",
    text: {
      preview_url: false,
      body: "hello from test",
    },
  });
});

test("sendMedia/sendVoice/sendDocument upload media and send payload with real wamid in Prompt 3", async () => {
  const mockClient = new MockHttpClient();
  let uploadedKind = "";
  const mockMediaClient = {
    uploadMedia: async (opts: any) => {
      uploadedKind = opts.kind;
      return { success: true, mediaId: `uploaded_${opts.kind}_id_123` };
    },
    downloadMedia: async (opts: any) => ({
      buffer: Buffer.from("mock_downloaded_data"),
      mimeType: "image/jpeg",
    }),
  };

  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient: mockClient,
    phoneNumberId: "phone_id_999",
    accessToken: "test_token",
    mediaClient: mockMediaClient as any,
  });

  // 1. sendMedia (image)
  const validJpeg = Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
    Buffer.from("image contents"),
  ]);
  const mediaRes = await provider.sendMedia("contact-e4ed32210a80@example.invalid", validJpeg, "image/jpeg", "Product Photo");
  assert.equal(mediaRes.success, true);
  assert.equal(mediaRes.providerMessageId, "wamid.test_123");
  assert.equal(uploadedKind, "image");
  assert.equal(mockClient.calls.length, 1);
  assert.deepEqual(mockClient.calls[0].body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "image",
    image: { id: "uploaded_image_id_123", caption: "Product Photo" },
  });

  // 2. sendVoice (ptt voice note with voice: true)
  const validOgg = Buffer.concat([
    Buffer.from("OggS\x00\x02"),
    Buffer.from("voice contents"),
  ]);
  const voiceRes = await provider.sendVoice("contact-e4ed32210a80@example.invalid", validOgg);
  assert.equal(voiceRes.success, true);
  assert.equal(voiceRes.providerMessageId, "wamid.test_123");
  assert.equal(uploadedKind, "voice");
  assert.equal(mockClient.calls.length, 2);
  assert.deepEqual(mockClient.calls[1].body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "audio",
    audio: { id: "uploaded_voice_id_123", voice: true },
  });

  // 3. sendDocument
  const validPdf = Buffer.concat([
    Buffer.from("%PDF-1.4 header"),
    Buffer.from("pdf contents"),
  ]);
  const docRes = await provider.sendDocument("contact-e4ed32210a80@example.invalid", validPdf, "application/pdf", "invoice.pdf");
  assert.equal(docRes.success, true);
  assert.equal(docRes.providerMessageId, "wamid.test_123");
  assert.equal(uploadedKind, "document");
  assert.equal(mockClient.calls.length, 3);
  assert.deepEqual(mockClient.calls[2].body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "document",
    document: { id: "uploaded_document_id_123", filename: "invoice.pdf" },
  });

  // 4. sendTemplate succeeds and returns real WAMID in Prompt 4
  const tplRes = await provider.sendTemplate("contact-e4ed32210a80@example.invalid", "template_name", "en_US", []);
  assert.equal(tplRes.success, true);
  assert.equal(tplRes.providerMessageId, "wamid.test_123");
  assert.equal(mockClient.calls.length, 4);
  assert.deepEqual(mockClient.calls[3].body, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "template",
    template: { name: "template_name", language: { code: "en_US" } },
  });
});

test("markRead builds correct mark-read payload", async () => {
  const mockClient = new MockHttpClient();
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient: mockClient,
    phoneNumberId: "phone_id_999",
  });

  await provider.markRead("contact-e4ed32210a80@example.invalid", "message_id_abc");

  assert.equal(mockClient.calls.length, 1);
  const call = mockClient.calls[0];
  assert.deepEqual(call.body, {
    messaging_product: "whatsapp",
    status: "read",
    message_id: "message_id_abc",
  });
});

test("downloadMedia downloads media using injected client", async () => {
  const mockMediaClient = {
    downloadMedia: async (opts: any) => ({
      buffer: Buffer.from("downloaded_binary_bytes"),
      mimeType: "image/jpeg",
    }),
  };

  const provider = new WhatsAppCloudApiTransportProvider({
    phoneNumberId: "phone_123",
    accessToken: "test_token",
    mediaClient: mockMediaClient as any,
  });

  const buffer = await provider.downloadMedia("media_ref_999");
  assert.equal(buffer.toString(), "downloaded_binary_bytes");
});

import { createWhatsAppCloudApiHttpClient } from "./whatsapp-cloud-api-http-client.ts";

function createMockFetch(status: number, jsonResponse: any, shouldThrow?: Error) {
  return async () => {
    if (shouldThrow) {
      throw shouldThrow;
    }
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => jsonResponse,
      text: async () => JSON.stringify(jsonResponse),
    } as any;
  };
}

test("HTTP Pipeline: 400 Bad Request maps to non-retryable meta_bad_request", async () => {
  const mockFetch = createMockFetch(400, {
    error: { message: "Invalid parameter", code: 100, type: "OAuthException" },
  });
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "meta_bad_request");
  assert.equal(result.retryable, false);
});

test("HTTP Pipeline: 401 Unauthorized maps to non-retryable meta_auth_error", async () => {
  const mockFetch = createMockFetch(401, {
    error: { message: "Invalid OAuth access token", code: 190 },
  });
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "bad_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "meta_auth_error");
  assert.equal(result.retryable, false);
});

test("HTTP Pipeline: 403 Forbidden maps to non-retryable meta_auth_error", async () => {
  const mockFetch = createMockFetch(403, {
    error: { message: "Permission denied", code: 200 },
  });
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "token_no_perm",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "meta_auth_error");
  assert.equal(result.retryable, false);
});

test("HTTP Pipeline: 429 Rate Limit maps to retryable rate_limit_exceeded", async () => {
  const mockFetch = createMockFetch(429, {
    error: { message: "Rate limit hit", code: 130429 },
  });
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "rate_limit_exceeded");
  assert.equal(result.retryable, true);
});

test("HTTP Pipeline: 500 Server Error maps to retryable meta_server_error", async () => {
  const mockFetch = createMockFetch(500, {
    error: { message: "Temporary server issue", code: 2 },
  });
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "meta_server_error");
  assert.equal(result.retryable, true);
});

test("HTTP Pipeline: 503 Service Unavailable maps to retryable meta_server_error", async () => {
  const mockFetch = createMockFetch(503, {
    error: { message: "Service Unavailable", code: 1 },
  });
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "meta_server_error");
  assert.equal(result.retryable, true);
});

test("HTTP Pipeline: Request timeout maps to retryable network_transient_error", async () => {
  const timeoutError = new Error("The operation was aborted due to timeout");
  (timeoutError as any).name = "AbortError";

  const mockFetch = createMockFetch(0, null, timeoutError);
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "network_transient_error");
  assert.equal(result.retryable, true);
});

test("HTTP Pipeline: Network failure / ECONNRESET maps to retryable network_transient_error", async () => {
  const networkError = new Error("fetch failed: ECONNRESET");
  const mockFetch = createMockFetch(0, null, networkError);
  const httpClient = createWhatsAppCloudApiHttpClient({
    accessToken: "valid_token",
    fetchImpl: mockFetch,
  });
  const provider = new WhatsAppCloudApiTransportProvider({
    httpClient,
    phoneNumberId: "123456",
  });

  const result = await provider.sendText("contact-e4ed32210a80@example.invalid", "hello");
  assert.equal(result.success, false);
  assert.equal(result.errorCode, "network_transient_error");
  assert.equal(result.retryable, true);
});
