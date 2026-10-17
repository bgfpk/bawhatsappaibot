import test from "node:test";
import assert from "node:assert/strict";

import { buildStickerMessageContext } from "./sticker-message-context-service.ts";

test("sticker after confirmed order can safely skip reply", () => {
  const result = buildStickerMessageContext({
    profile: { hasPlacedOrder: true, orderStatus: "Confirmed order" },
    history: [{ role: "model", text: "Order confirmed." }],
  });

  assert.equal(result.shouldReply, false);
  assert.match(result.summaryText, /after order confirmation/i);
});

test("sticker while reply is needed stays replyable", () => {
  const result = buildStickerMessageContext({
    profile: {},
    history: [{ role: "model", text: "Please share your address to complete the order." }],
  });

  assert.equal(result.shouldReply, true);
  assert.match(result.historyText, /needed a response/i);
});
