import test from "node:test";
import assert from "node:assert/strict";

import { buildAiCallAuditRecord } from "./ai-call-audit-service.ts";

test("AI call audit records safe token and cache metadata without raw customer id", () => {
  const record = buildAiCallAuditRecord({
    provider: {
      purpose: "ai_customer_summary",
      accountId: "acct_1",
      botId: "bot_1",
      model: "gemini-2.5-flash",
      billingContext: { customerJid: "contact-e4ed32210a80@example.invalid", eventId: "msg_1" },
      cacheTelemetryContext: {
        cacheBoostEnabled: true,
        cacheEligible: true,
        cacheAttempted: true,
        cacheAttached: true,
      },
    },
    result: {
      usageMetadata: {
        promptTokenCount: 2000,
        cachedContentTokenCount: 1200,
        candidatesTokenCount: 40,
        thoughtsTokenCount: 5,
        totalTokenCount: 2045,
      },
    },
    charged: true,
    cacheBoostCharged: true,
  });

  assert.equal(record.purpose, "ai_customer_summary");
  assert.equal(record.model, "gemini-2.5-flash");
  assert.equal(record.cachedTokens, 1200);
  assert.equal(record.cacheHit, true);
  assert.equal(record.wasCharged, true);
  assert.equal(record.customerJid, "contact-87ea082a95cc@example.invalid");
});
