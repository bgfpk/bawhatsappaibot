import assert from "node:assert/strict";
import test from "node:test";
import { resolveCloudApiRuntimeConfig } from "./whatsapp-cloud-api-runtime-config.ts";
import { createWhatsAppCloudApiRuntimeProvider } from "./whatsapp-cloud-api-runtime-provider.ts";
import { createCloudApiTrackedSender } from "./whatsapp-cloud-api-tracked-sender.ts";
import { buildVoiceReplyPlan } from "./voice-reply-policy-service.ts";
import { cloudWebhookEventToInternalIncomingMessage } from "./whatsapp-cloud-api-inbound-adapter.ts";
import { CloudWebhookDeduper, getCloudWebhookDedupKey } from "./whatsapp-cloud-api-webhook-dedup.ts";
import { WhatsAppProviderConfig } from "./whatsapp-provider-config.ts";

test("E2E Pipeline: End-to-end Cloud API Text Sending with Real Meta Payload & Response", async () => {
  // 1. Provider configuration in DB
  const providerConfig: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "104100542821472",
    businessAccountId: "waba_99887766",
    encryptedAccessTokenRef: "encrypted_ref_bot_1",
  };

  // 2. Resolve runtime config with injected decryptor
  const mockDecryptSecret = async (ref: string) => {
    assert.equal(ref, "encrypted_ref_bot_1");
    return "EAABwz_secret_token_123";
  };

  const runtimeConfig = await resolveCloudApiRuntimeConfig(providerConfig, {
    decryptSecret: mockDecryptSecret,
    isPlatformRolloutEnabled: true,
    webhookSecurityConfigured: true,
  });

  assert.equal(runtimeConfig.runtimeEnabled, true);
  assert.equal(runtimeConfig.activeRuntimeProvider, "whatsapp_cloud_api");
  assert.equal(runtimeConfig.phoneNumberId, "104100542821472");

  // 3. Create runtime provider with mock fetchImpl
  const httpCalls: Array<{ url: string; headers: any; body: string }> = [];
  const mockFetch = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const rawBody = typeof init?.body === "string" ? init.body : "";
    httpCalls.push({
      url: String(url),
      headers: init?.headers,
      body: rawBody,
    });

    const metaSuccessResponse = {
      messaging_product: "whatsapp",
      contacts: [{ input: "195545134641", wa_id: "195545134641" }],
      messages: [{ id: "wamid.HBgLMjA0..." }],
    };

    return {
      ok: true,
      status: 200,
      json: async () => metaSuccessResponse,
      text: async () => JSON.stringify(metaSuccessResponse),
    } as any;
  };

  const providerResult = createWhatsAppCloudApiRuntimeProvider({
    runtimeConfig,
    fetchImpl: mockFetch as any,
  });

  assert.equal(providerResult.enabled, true);
  if (!providerResult.enabled) return;

  // 4. Create tracked sender
  const sentIds = new Set<string>();
  const botIdentityJid = `${runtimeConfig.phoneNumberId}@s.whatsapp.net`;
  const trackedSender = createCloudApiTrackedSender({
    cloudProvider: providerResult.provider,
    sentIds,
    botIdentityJid,
  });

  assert.equal(trackedSender.user.id, "contact-b6bf936113d9@example.invalid");
  assert.equal(trackedSender.isCloud, true);
  assert.equal(trackedSender.supportsVoiceSend, true);

  // 5. Send message through tracked sender
  const customerJid = "contact-e4ed32210a80@example.invalid";
  const sendResult = await trackedSender.sendMessage(customerJid, {
    text: "Hello, thank you for contacting us!",
  });

  // Verify result shape
  assert.equal(sendResult.key.id, "wamid.HBgLMjA0...");

  // Verify dedup set received the real wamid
  assert.equal(sentIds.has("wamid.HBgLMjA0..."), true);

  // Verify exact HTTP call made to Meta
  assert.equal(httpCalls.length, 1);
  const call = httpCalls[0];
  assert.equal(call.url, "https://graph.facebook.com/v20.0/109988776655443/messages");

  const parsedBody = JSON.parse(call.body);
  assert.deepEqual(parsedBody, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: "195545134641",
    type: "text",
    text: {
      preview_url: false,
      body: "Hello, thank you for contacting us!",
    },
  });

  // 6. Voice simulation safely falls back to text for this socket
  const voicePlan = buildVoiceReplyPlan({
    replyMode: "voice_only",
    customerTextOrTranscript: "Can you speak to me?",
    voiceEnabled: !trackedSender.isCloud, // false
  });
  assert.equal(voicePlan.sendVoice, false);
  assert.equal(voicePlan.sendText, true);

  // 7. Template sending is supported in Prompt 4 and creates Meta template payload
  const tplResult = await trackedSender.sendMessage(customerJid, {
    template: {
      name: "order_update",
      language: { code: "en_US" },
    },
  } as any);
  assert.equal(tplResult.key.id, "wamid.HBgLMjA0...");
  assert.equal(httpCalls.length, 2, "Template call should be made in Prompt 4");
  const parsedTplBody = JSON.parse(httpCalls[1].body);
  assert.equal(parsedTplBody.type, "template");
  assert.equal(parsedTplBody.template.name, "order_update");
});

test("E2E Pipeline: Tenant Isolation between two distinct bots", async () => {
  const botA: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "111111111",
    encryptedAccessTokenRef: "ref_A",
  };
  const botB: WhatsAppProviderConfig = {
    providerType: "whatsapp_cloud_api",
    phoneNumberId: "222222222",
    encryptedAccessTokenRef: "ref_B",
  };

  const resA = await resolveCloudApiRuntimeConfig(botA, {
    decryptSecret: async () => "token_A",
    isPlatformRolloutEnabled: true,
    webhookSecurityConfigured: true,
  });
  const resB = await resolveCloudApiRuntimeConfig(botB, {
    decryptSecret: async () => "token_B",
    isPlatformRolloutEnabled: true,
    webhookSecurityConfigured: true,
  });

  assert.notEqual(resA.phoneNumberId, resB.phoneNumberId);
  assert.notEqual(resA.accessToken, resB.accessToken);
});

test("E2E Pipeline: Inbound webhook message normalization and dedup", () => {
  const webhookBody = {
    botId: "bot_123",
    phoneNumberId: "104100542821472",
    eventType: "message" as const,
    event: {
      type: "message" as const,
      contact: { name: "Ali", waId: "195545134641" },
      message: {
        id: "wamid.HBgLInbound123",
        from: "195545134641",
        timestamp: 1700000000,
        type: "text",
        textBody: "Price inquiry",
      },
    },
  };

  const normalized = cloudWebhookEventToInternalIncomingMessage(webhookBody);
  assert.ok(normalized);
  assert.equal(normalized.chatId, "contact-e4ed32210a80@example.invalid");
  assert.equal(normalized.messageId, "wamid.HBgLInbound123");
  assert.equal(normalized.text, "Price inquiry");

  const deduper = new CloudWebhookDeduper();
  const dedupKey = getCloudWebhookDedupKey(webhookBody);
  assert.ok(dedupKey);
  const firstCheck = deduper.checkAndRecord(dedupKey);
  assert.equal(firstCheck.isDuplicate, false);

  const secondCheck = deduper.checkAndRecord(dedupKey);
  assert.equal(secondCheck.isDuplicate, true);
});
