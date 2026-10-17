import test from "node:test";
import assert from "node:assert/strict";

import { buildBatchReplyGuidance, buildCustomerBatchContext } from "./customer-message-batch-context-service.ts";

test("batch context renders text image and voice into one combined prompt block", () => {
  const context = buildCustomerBatchContext([
    { kind: "image", messageId: "img-latest", latest: true, usefulContext: "Restaurant style Urdu logo." },
    { kind: "audio", usefulContext: "Customer asked for changes in the logo." },
    { kind: "text", text: "How much?" },
  ]);

  assert.match(context, /Latest image:/);
  assert.match(context, /messageId: img-latest/);
  assert.match(context, /Customer sent this message batch:/);
  assert.match(context, /1\. Image: Restaurant style Urdu logo\./);
  assert.match(context, /2\. Voice: Customer asked for changes in the logo\./);
  assert.match(context, /3\. Text: How much\?/);
});

test("batch reply guidance tells the model to acknowledge unclear media instead of skipping it", () => {
  const guidance = buildBatchReplyGuidance([
    { kind: "image", unclear: true },
    { kind: "audio", unclear: true },
  ]);

  assert.match(guidance, /image was unclear/i);
  assert.match(guidance, /voice note was unclear/i);
});
