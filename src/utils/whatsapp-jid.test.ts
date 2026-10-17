import test from "node:test";
import assert from "node:assert/strict";

import { getCanonicalCustomerKey, normalizeWhatsAppJid } from "./whatsapp-jid.ts";

test("international contact number and JID formatting does not force Pakistan prefix", () => {
  assert.equal(normalizeWhatsAppJid("+1 202 555 0101"), "contact-4e899668752d@example.invalid");
  assert.equal(normalizeWhatsAppJid("0044 20 7183 8750"), "contact-f3f781b8bf14@example.invalid");
  assert.equal(normalizeWhatsAppJid("+971 50 123 4567"), "contact-b9e295d59eed@example.invalid");
});

test("canonical customer key dedupes phone and WhatsApp JID variants", () => {
  assert.equal(getCanonicalCustomerKey("181533014730"), "phone:923053427748");
  assert.equal(getCanonicalCustomerKey("contact-aceaf85e61f7@example.invalid"), "phone:923053427748");
  assert.equal(getCanonicalCustomerKey("ignored", { phoneNumber: "+92 305 342 7748" }), "phone:923053427748");
});
