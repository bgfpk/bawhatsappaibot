import test from "node:test";
import assert from "node:assert/strict";
import {
  addContactFact,
  removeContactFact,
  addContactOwnerNote,
  removeContactOwnerNote,
  clearPersonalContactMemory,
  getPersonalContactContext,
  isBlockedContactSecret,
  isBlockedSensitiveAttribute,
} from "./personal-contact-memory-service.ts";
import type { PersonalContact } from "./personal-contact-types.ts";

function createMockContact(accountId = "tenant_test"): PersonalContact {
  return {
    contactId: "pc_mock_1",
    schemaVersion: 1,
    revision: 1,
    accountId,
    status: "active",
    displayName: "Hamza Sheikh",
    relationship: "colleague",
    relationshipProvenance: "owner_provided",
    communicationPreferences: {
      contactCommunicationStatus: "active",
      preferredLanguage: "en",
      formality: "casual",
    },
    whatsappIdentities: [
      {
        personalInstanceId: "inst_1",
        jid: "contact-e4ed32210a80@example.invalid",
        jidType: "pn",
        canonicalPhone: "195545134641",
        pushName: "Hamza",
      },
    ],
    durableFacts: [],
    ownerNotes: [],
    conversationMetadata: {
      firstSeenAt: 1000,
      lastInteractionAt: 5000,
      lastInboundMessageAt: 5000,
      messageCount: 12,
    },
    createdAt: 1000,
    updatedAt: 1000,
  };
}

test("Personal Contact Memory - Secret Credential Rejection", () => {
  assert.equal(isBlockedContactSecret("password123"), true);
  assert.equal(isBlockedContactSecret("My API_KEY is secret"), true);
  assert.equal(isBlockedContactSecret("CVV code: 456"), true);
  assert.equal(isBlockedContactSecret("One Time Passcode OTP: 998822"), true);
  assert.equal(isBlockedContactSecret("Office PIN code"), true);
  assert.equal(isBlockedContactSecret("Normal fact about laptop specs"), false);

  const contact = createMockContact();
  assert.throws(
    () =>
      addContactFact(contact, {
        category: "custom",
        label: "WiFi Password",
        value: "Secret123",
        source: "owner_dashboard",
      }),
    /credentials/i
  );

  assert.throws(
    () => addContactOwnerNote(contact, "Their credit card CVV is 123", "owner_dashboard"),
    /credentials/i
  );
});

test("Personal Contact Memory - Inferred Sensitive Attributes Rejection", () => {
  assert.equal(isBlockedSensitiveAttribute("medical_history"), true);
  assert.equal(isBlockedSensitiveAttribute("religion"), true);
  assert.equal(isBlockedSensitiveAttribute("political_affiliation"), true);
  assert.equal(isBlockedSensitiveAttribute("office_hours"), false);

  const contact = createMockContact();
  assert.throws(
    () =>
      addContactFact(contact, {
        category: "custom",
        label: "Religion",
        value: "Islam",
        source: "system",
      }),
    /sensitive attributes/i
  );
});

test("Personal Contact Memory - Fact Creation and Deduplication", () => {
  const contact = createMockContact();
  const res1 = addContactFact(contact, {
    category: "role",
    label: "Profession",
    value: "Accountant",
    source: "owner_business_whatsapp",
  });
  assert.equal(res1.wasDeduped, false);
  assert.equal(res1.contact.durableFacts.length, 1);
  assert.equal(res1.contact.durableFacts[0].status, "current");

  // Re-adding exact same fact should be deduped
  const res2 = addContactFact(res1.contact, {
    category: "role",
    label: "Profession",
    value: "Accountant",
    source: "owner_business_whatsapp",
  });
  assert.equal(res2.wasDeduped, true);
  assert.equal(res2.contact.durableFacts.length, 1);
  assert.equal(res2.factId, res1.factId);
});

test("Personal Contact Memory - Fact Supersession", () => {
  const contact = createMockContact();
  const res1 = addContactFact(contact, {
    category: "schedule",
    label: "Office Hours",
    value: "9 AM to 5 PM",
    source: "owner_business_whatsapp",
  });
  const firstFactId = res1.factId;

  // New fact with same category and label supersedes the previous fact
  const res2 = addContactFact(res1.contact, {
    category: "schedule",
    label: "Office Hours",
    value: "10 AM to 6 PM",
    source: "owner_business_whatsapp",
  });

  const facts = res2.contact.durableFacts;
  assert.equal(facts.length, 2);

  const oldFact = facts.find((f) => f.factId === firstFactId);
  assert.ok(oldFact);
  assert.equal(oldFact.status, "superseded");

  const newFact = facts.find((f) => f.factId === res2.factId);
  assert.ok(newFact);
  assert.equal(newFact.status, "current");
  assert.equal(newFact.supersedesFactId, firstFactId);
  assert.equal(newFact.value, "10 AM to 6 PM");
});

test("Personal Contact Memory - Synthesized Context View & Expired Facts", () => {
  const now = 10000;
  let contact = createMockContact();

  // Active durable fact
  const r1 = addContactFact(contact, {
    category: "preference",
    label: "Preferred Delivery",
    value: "Express Courier",
    source: "owner_business_whatsapp",
  });
  contact = r1.contact;

  // Superseded fact
  const r2 = addContactFact(contact, {
    category: "pricing",
    label: "Discount",
    value: "5%",
    source: "owner_business_whatsapp",
  });
  contact = r2.contact;
  const r3 = addContactFact(contact, {
    category: "pricing",
    label: "Discount",
    value: "10%",
    source: "owner_business_whatsapp",
  });
  contact = r3.contact;

  // Active temporary fact (valid until now + 5000)
  const r4 = addContactFact(contact, {
    category: "availability",
    label: "Visiting Karachi",
    value: "Until Friday",
    source: "owner_business_whatsapp",
    validUntil: now + 5000,
  });
  contact = r4.contact;

  // Expired temporary fact (valid until now - 1000)
  const r5 = addContactFact(contact, {
    category: "availability",
    label: "Special Quote",
    value: "Special price 500 PKR",
    source: "owner_business_whatsapp",
    validUntil: now - 1000,
  });
  contact = r5.contact;

  // Add owner note
  const noteRes = addContactOwnerNote(contact, "Great partner for wholesale supply", "owner_dashboard");
  contact = noteRes.contact;

  const context = getPersonalContactContext(contact, now);
  assert.equal(context.displayName, "Hamza Sheikh");
  assert.equal(context.trustedPhone, "195545134641");

  // Current durable facts must NOT include the superseded 5% discount
  const discounts = context.currentDurableFacts.filter((f) => f.label === "Discount");
  assert.equal(discounts.length, 1);
  assert.equal(discounts[0].value, "10%");

  // Active temporary facts must include "Visiting Karachi" but EXCLUDE the expired "Special Quote"
  assert.equal(context.activeTemporaryFacts.length, 1);
  assert.equal(context.activeTemporaryFacts[0].label, "Visiting Karachi");

  // Owner note is included
  assert.equal(context.ownerNotes.length, 1);
  assert.equal(context.ownerNotes[0], "Great partner for wholesale supply");
});

test("Personal Contact Memory - Fact and Note Removal", () => {
  let contact = createMockContact();
  const fRes = addContactFact(contact, {
    category: "role",
    label: "Role",
    value: "Auditor",
    source: "owner_dashboard",
  });
  contact = fRes.contact;
  assert.equal(contact.durableFacts.length, 1);

  contact = removeContactFact(contact, fRes.factId);
  assert.equal(contact.durableFacts.length, 0);

  const nRes = addContactOwnerNote(contact, "Private note", "owner_dashboard");
  contact = nRes.contact;
  assert.equal(contact.ownerNotes.length, 1);

  contact = removeContactOwnerNote(contact, nRes.noteId);
  assert.equal(contact.ownerNotes.length, 0);
});

test("Personal Contact Memory - Safe Memory Clear", () => {
  let contact = createMockContact();
  contact = addContactFact(contact, { category: "role", label: "Title", value: "CEO", source: "owner_dashboard" }).contact;
  contact = addContactOwnerNote(contact, "Important partner", "owner_dashboard").contact;

  assert.equal(contact.durableFacts.length, 1);
  assert.equal(contact.ownerNotes.length, 1);

  const cleared = clearPersonalContactMemory(contact);
  assert.equal(cleared.durableFacts.length, 0);
  assert.equal(cleared.ownerNotes.length, 0);

  // Identity and message count remain intact
  assert.equal(cleared.displayName, "Hamza Sheikh");
  assert.equal(cleared.conversationMetadata?.messageCount, 12);
});
