import test from "node:test";
import assert from "node:assert/strict";

import { buildAdditionalCustomerAiUsageActions, buildCustomerReplyUsageActions } from "./customer-ai-usage-charge-service.ts";

test("image understanding is not bundled into outbound reply billing", () => {
  assert.deepEqual(buildAdditionalCustomerAiUsageActions({
    hasIncomingImage: true,
    hasIncomingAudio: false,
    sentTextReply: true,
    textReceiptId: "receipt-1",
  }), []);
});

test("voice reply keeps only its own outbound billing action", () => {
  assert.deepEqual(buildAdditionalCustomerAiUsageActions({
    hasIncomingAudio: true,
    sentVoiceReply: true,
    voiceReceiptId: "receipt-2",
  }), ["customer_ai_voice_reply"]);
});

test("client Gemini provider skips old platform AI reply charges but keeps Smart Sales send charge", () => {
  assert.deepEqual(buildCustomerReplyUsageActions({
    hasIncomingImage: true,
    hasIncomingAudio: true,
    sentTextReply: true,
    sentVoiceReply: true,
    textReceiptId: "text-1",
    voiceReceiptId: "voice-1",
    smartSalesUsed: true,
    skipPlatformAiUsageCharges: true,
  }), ["smart_sales_engine_reply"]);
});

test("platform provider keeps only Smart Sales outbound add-on charge", () => {
  assert.deepEqual(buildCustomerReplyUsageActions({
    hasIncomingImage: true,
    sentTextReply: true,
    textReceiptId: "text-1",
    smartSalesUsed: true,
  }), ["smart_sales_engine_reply"]);
});
