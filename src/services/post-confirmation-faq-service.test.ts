import test from "node:test";
import assert from "node:assert/strict";

import { buildPostConfirmationReply } from "./post-confirmation-faq-service.ts";

test("post-confirmation FAQ helper does not emit deterministic customer copy", () => {
  const reply = buildPostConfirmationReply({
    latestText: "parcel kab milega?",
    profile: { hasPlacedOrder: true, latestOrderRef: "ORD123" },
    language: "roman_urdu",
  });

  assert.equal(reply, "");
});
