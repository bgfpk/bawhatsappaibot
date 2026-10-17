import test from "node:test";
import assert from "node:assert/strict";

import { prepareOutgoingWhatsAppText, sanitizeOutgoingWhatsAppText } from "./outbound-message-sanitizer.ts";

test("outgoing sanitizer strips internal sequence labels", () => {
  const result = sanitizeOutgoingWhatsAppText("[Voice sequence template sent]\nHere are the details you asked for.");
  assert.equal(result, "Here are the details you asked for.");
});

test("outgoing sanitizer does not invent fallback copy when unsafe text becomes empty", () => {
  const result = prepareOutgoingWhatsAppText("[Image sequence template sent]");
  assert.equal(result.text, "");
  assert.equal(result.usedFallback, false);
  assert.equal(result.strippedUnsafeText, true);
});
