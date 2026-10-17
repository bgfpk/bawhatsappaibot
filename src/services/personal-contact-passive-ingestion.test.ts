import test from "node:test";
import assert from "node:assert/strict";
import {
  ingestPersonalContactInboundMessage,
  getPersonalContact,
  findPersonalContactByWhatsAppIdentity,
} from "./personal-contact-service.ts";
import { isPersonalInstance } from "./instance-purpose-service.ts";

test("Personal Contact Passive Ingestion - First Inbound Message Creates Contact", async () => {
  const tenantId = `tenant_ingest_${Date.now()}_1`;
  const botConfig = {
    $id: "personal_bot_1",
    instancePurpose: "personal",
    name: "My Personal WhatsApp",
  };

  assert.equal(isPersonalInstance(botConfig), true);

  const res = await ingestPersonalContactInboundMessage(tenantId, botConfig, {
    remoteJid: "contact-c84bd0d2ed3a@example.invalid",
    pushName: "Kamran Akmal",
    text: "Salam brother, are you available today?",
    timestamp: Math.floor(Date.now() / 1000),
  });

  assert.equal(res.isNew, true);
  assert.equal(res.contact.displayName, "Kamran Akmal");
  assert.equal(res.contact.accountId, tenantId);
  assert.equal(res.contact.status, "active");
  assert.equal(res.contact.relationship, "acquaintance");
  assert.equal(res.contact.conversationMetadata?.messageCount, 1);
  assert.equal(res.contact.whatsappIdentities.length, 1);
  assert.equal(res.contact.whatsappIdentities[0].canonicalPhone, "114313808454");

  // Lookup by JID alias
  const byJid = await findPersonalContactByWhatsAppIdentity(tenantId, {
    remoteJid: "contact-c84bd0d2ed3a@example.invalid",
    dataOwnerKey: tenantId,
  });
  assert.ok(byJid);
  assert.equal(byJid.contactId, res.contact.contactId);

  // Lookup by Phone alias
  const byPhone = await findPersonalContactByWhatsAppIdentity(tenantId, {
    remoteJid: "contact-c84bd0d2ed3a@example.invalid",
    senderPn: "114313808454",
    dataOwnerKey: tenantId,
  });
  assert.ok(byPhone);
  assert.equal(byPhone.contactId, res.contact.contactId);
});

test("Personal Contact Passive Ingestion - Second Message Updates Same Contact", async () => {
  const tenantId = `tenant_ingest_${Date.now()}_2`;
  const botConfig = {
    $id: "personal_bot_2",
    instancePurpose: "personal",
  };

  const firstRes = await ingestPersonalContactInboundMessage(tenantId, botConfig, {
    remoteJid: "contact-b5b3d6001805@example.invalid",
    pushName: "Saad",
    text: "Hello",
  });
  assert.equal(firstRes.isNew, true);
  assert.equal(firstRes.contact.conversationMetadata?.messageCount, 1);

  const secondRes = await ingestPersonalContactInboundMessage(tenantId, botConfig, {
    remoteJid: "contact-b5b3d6001805@example.invalid",
    pushName: "Saad Rafique",
    text: "Just checking in on the shipment",
  });
  assert.equal(secondRes.isNew, false);
  assert.equal(secondRes.contact.contactId, firstRes.contact.contactId);
  assert.equal(secondRes.contact.conversationMetadata?.messageCount, 2);
});

test("Personal Contact Passive Ingestion - Initial LID followed by PN maps to SAME contact", async () => {
  const tenantId = `tenant_ingest_${Date.now()}_3`;
  const botConfig = {
    $id: "personal_bot_3",
    instancePurpose: "personal",
  };

  const rawLid = "194167418417354@lid";
  const realPhone = "131621051438";

  // Step 1: Initial message arrives via LID only
  const step1 = await ingestPersonalContactInboundMessage(tenantId, botConfig, {
    remoteJid: rawLid,
    pushName: "Fahad",
    text: "Hey, saving your number",
  });
  assert.equal(step1.isNew, true);
  const contactId = step1.contact.contactId;

  // Step 2: Later message from same person includes resolved senderPn
  const step2 = await ingestPersonalContactInboundMessage(tenantId, botConfig, {
    remoteJid: rawLid,
    senderPn: realPhone,
    pushName: "Fahad Mustafa",
    text: "Can we talk tomorrow?",
  });

  assert.equal(step2.isNew, false);
  assert.equal(step2.contact.contactId, contactId);

  // Step 3: Now looking up by phone JID maps to the SAME contact
  const byPhone = await findPersonalContactByWhatsAppIdentity(tenantId, {
    remoteJid: `${realPhone}@s.whatsapp.net`,
    dataOwnerKey: tenantId,
  });
  assert.ok(byPhone);
  assert.equal(byPhone.contactId, contactId);
});
