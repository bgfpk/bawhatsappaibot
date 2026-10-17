import test from "node:test";
import assert from "node:assert/strict";

import {
  parseCombinedReplyMemoryJson,
  renderCombinedCustomerMemoryUpdate,
  shouldUseCombinedReplyMemoryForSimpleText,
} from "./combined-reply-memory-service.ts";

test("combined reply memory parses reply and keeps hidden memory separate", () => {
  const parsed = parseCombinedReplyMemoryJson(JSON.stringify({
    reply: "Sure, I can help with setup.",
    customerMemoryUpdate: {
      currentFacts: ["Name: Ahad Firdosi", "Interest: setup help"],
      timeline: ["Customer asked for setup guidance."],
      pendingNextStep: ["Continue setup guidance if the error appears again."],
      notes: ["Do not ask business type again."],
      languagePreference: "English",
    },
  }));

  assert.equal(parsed.reply, "Sure, I can help with setup.");
  assert.doesNotMatch(parsed.reply, /customerMemoryUpdate|currentFacts/i);
  assert.deepEqual(parsed.customerMemoryUpdate.currentFacts.slice(0, 2), ["Name: Ahad Firdosi", "Interest: setup help"]);
});

test("combined memory update renders through normal summary quality format", () => {
  const rendered = renderCombinedCustomerMemoryUpdate({
    currentFacts: ["Name: Ahad Firdosi", "Phone: 923066935544", "Status: troubleshooting setup"],
    timeline: ["Customer reported a setup/browser error."],
    pendingNextStep: ["Continue setup guidance if the error appears again."],
    notes: ["Language: English"],
  });

  assert.match(rendered, /Current Status:/);
  assert.match(rendered, /Conversation Timeline:/);
  assert.match(rendered, /Next Best Action:/);
  assert.match(rendered, /Status: troubleshooting setup/);
  assert.doesNotMatch(rendered, /Ahad Firdosi|923066935544/);
  assert.doesNotMatch(rendered, /Customer said:/i);
});

test("combined mode allows only conservative simple text turns", () => {
  assert.equal(shouldUseCombinedReplyMemoryForSimpleText({ lastUserMsgText: "hello, can you guide me?", lastUserMsgIsVoice: false }), true);
  assert.equal(shouldUseCombinedReplyMemoryForSimpleText({ lastUserMsgText: "price?", lastUserMsgIsVoice: false }), false);
  assert.equal(shouldUseCombinedReplyMemoryForSimpleText({ lastUserMsgText: "hello", lastUserMsgHasImage: true }), false);
  assert.equal(shouldUseCombinedReplyMemoryForSimpleText({ lastUserMsgText: "hello", lastUserMsgIsVoice: true }), false);
  assert.equal(shouldUseCombinedReplyMemoryForSimpleText({ lastUserMsgText: "hello", activeCustomerRecord: { order_data: { recordStatus: "incomplete" } } }), false);
});
